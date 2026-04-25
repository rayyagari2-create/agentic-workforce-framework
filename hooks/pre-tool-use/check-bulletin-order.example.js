#!/usr/bin/env node
"use strict";

/*
 * check-bulletin-order.example.js
 *
 * Enforces: WORKING-before-DONE bulletin order. A [DONE] entry is allowed
 *   only if a [WORKING] entry already exists in the bulletin for the same
 *   session_id. WORKING entries themselves are not order-gated.
 * Fires:    PreToolUse — runs BEFORE Write/Edit to the bulletin file.
 * exit(2):  Hard block. The runtime refuses the call and surfaces the
 *           stderr message to the agent. exit(0) allows.
 * Fail-closed protects against: forged completions and skipped progress
 *   reporting. A DONE without a prior WORKING means one of: the agent
 *   skipped the in-progress reporting step, the agent fabricated a
 *   completion entry, or another process wrote out-of-order. All three
 *   break the self-reporting protocol that downstream tooling depends on.
 */

const fs = require("fs");
const path = require("path");

const BULLETIN_PATH = process.env.BULLETIN_PATH || "{path/to/your/bulletin.md}";
const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-bulletin-order",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          session_id: payload && payload.context && payload.context.session_id,
          agent_id: payload && payload.context && payload.context.agent_id,
          correlation_id:
            payload && payload.context && payload.context.correlation_id,
        },
        extra || {}
      )
    );
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    // Audit failure must not flip the decision.
  }
}

function classifyEntry(content) {
  // The bulletin format convention used here tags each entry with
  // [WORKING] or [DONE]. Looking for those tags anywhere in the proposed
  // content is sufficient — the bulletin format is intentionally permissive
  // about preceding text (timestamps, agent IDs) so we don't anchor.
  // Adapt the regexes if your bulletin uses different markers.
  if (/\[DONE\]/.test(content)) return "DONE";
  if (/\[WORKING\]/.test(content)) return "WORKING";
  return "OTHER";
}

// Escape regex metacharacters in user-supplied strings before interpolating.
// Without this, a session_id containing "." or "*" would match unrelated
// entries. The set [.*+?^${}()|[\]\\] covers every regex special character.
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sessionHasWorkingEntry(sessionId) {
  // We read the bulletin file directly rather than trusting a context
  // field. The bulletin IS the source of truth for who-said-what; relying
  // on context.session_reads or similar would let a tampered context lie
  // to us. The cost (one disk read per DONE write) is negligible.
  let raw;
  try {
    raw = fs.readFileSync(BULLETIN_PATH, "utf8");
  } catch (_e) {
    // No bulletin yet → there cannot be a prior WORKING entry. Returning
    // false here is the conservative choice: a missing bulletin causes a
    // block on the first DONE, which surfaces the missing-bulletin
    // problem to the operator immediately rather than letting it slide.
    return false;
  }

  // Pattern: a line containing [WORKING] tag that also references this
  // session_id. The format convention assumed:
  //   - 2026-04-24T10:32Z [WORKING] session=01HX... agent=agent-fe ...
  // The session_id is escaped to prevent regex injection — see
  // escapeRegExp.
  const re = new RegExp(
    "\\[WORKING\\][^\\n]*session=" + escapeRegExp(sessionId)
  );
  return re.test(raw);
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (_e) {
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_e) {
    audit("block", "invalid_json_input", null);
    process.exit(2);
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const context = payload.context || {};

  const isWrite = tool === "Write" || tool === "Edit";
  const targetsBulletin =
    typeof input.file_path === "string" &&
    path.normalize(input.file_path) === path.normalize(BULLETIN_PATH);

  if (!isWrite || !targetsBulletin) {
    audit("allow", "not_in_scope", payload);
    process.exit(0);
  }

  const content = typeof input.content === "string" ? input.content : "";
  const kind = classifyEntry(content);

  // WORKING and OTHER entries are not order-gated. WORKING is the
  // precondition this hook protects DONE from skipping; an OTHER entry
  // (e.g. a heartbeat or note) is unrelated to the working/done lifecycle.
  if (kind !== "DONE") {
    audit("allow", "not_a_done_entry", payload, { kind });
    process.exit(0);
  }

  const sessionId = context.session_id;
  if (!sessionId) {
    // No session_id → we cannot scope the WORKING-entry lookup, so we
    // cannot prove the precondition. Refuse rather than fall through.
    audit("block", "missing_session_id", payload);
    process.stderr.write(
      "DONE entry blocked: context.session_id missing.\n"
    );
    process.exit(2);
  }

  // Session-scoped lookup matters. In parallel sessions, session-A's
  // WORKING entry must NOT satisfy session-B's DONE — otherwise one
  // session can claim completion on the back of another's progress.
  if (!sessionHasWorkingEntry(sessionId)) {
    audit("block", "done_without_prior_working", payload);
    process.stderr.write(
      "Bulletin order violation: write a [WORKING] entry for this " +
        "session before writing [DONE].\n"
    );
    process.exit(2);
  }

  audit("allow", "done_after_working", payload);
  process.exit(0);
}

try {
  main();
} catch (_e) {
  // Fail-closed default. See check-bulletin.example.js for rationale.
  process.exit(2);
}

/*
 * USAGE
 * -----
 *
 * 1. Settings wiring. In .claude/settings.json. Same matcher as
 *    check-bulletin — these two hooks compose: check-bulletin enforces
 *    read-before-write; this one enforces working-before-done. Both run
 *    on the same Write/Edit calls and must both pass.
 *
 *    {
 *      "hooks": {
 *        "PreToolUse": [
 *          {
 *            "matcher": "Write|Edit",
 *            "hooks": [
 *              {
 *                "type": "command",
 *                "command": "node /absolute/path/to/check-bulletin-order.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      BULLETIN_PATH  — full path to your bulletin file
 *      AUDIT_LOG      — JSONL append target for decision audit
 *
 * 3. Block example. An agent writes "[DONE] feature X complete" without
 *    having previously written a [WORKING] entry for the same session.
 *    The hook exits 2 and the agent sees:
 *
 *      Bulletin order violation: write a [WORKING] entry for this
 *      session before writing [DONE].
 *
 *    The agent's correct response is to write the missing [WORKING]
 *    entry first, then re-attempt the [DONE] write. The two-step pattern
 *    is intentional — it produces evidence that work was actually in
 *    progress, not just claimed complete after the fact.
 */
