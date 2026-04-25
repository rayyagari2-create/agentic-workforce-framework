#!/usr/bin/env node
"use strict";

/*
 * check-bulletin.example.js
 *
 * Enforces: read-before-write on the shared agent bulletin file. Any Write
 *   or Edit targeting the bulletin must be preceded by a Read of that same
 *   bulletin in the current session, so the agent acts on fresh state.
 * Fires:    PreToolUse — runs BEFORE the tool call, decides allow vs block.
 * exit(2):  Hard block. The runtime refuses the tool call and surfaces the
 *           stderr message to the agent. exit(0) allows the call.
 * Fail-closed protects against: stale-state writes that overwrite another
 *   agent's bulletin entry without ever observing it. Without this gate,
 *   parallel agents silently clobber each other's status updates and the
 *   bulletin stops being a coordination surface.
 */

const fs = require("fs");
const path = require("path");

// Path to the bulletin file the hook protects. Using env-var-with-placeholder
// makes the failure mode obvious: if neither is set the hook will refuse on
// the first call (the placeholder string is not a valid file path), instead
// of silently watching the wrong file.
const BULLETIN_PATH = process.env.BULLETIN_PATH || "{path/to/your/bulletin.md}";
const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

// Audit helper. Writes one JSONL line per decision. Wrapped in try/catch so a
// disk-full or permission error on the audit pipe NEVER flips the security
// decision — the call already had its allow/block verdict, and the operator
// will notice the audit gap on the next reconciliation pass. Audit failure is
// an observability problem, not a policy problem.
function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-bulletin",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          target: payload && payload.tool_input && payload.tool_input.file_path,
          agent_id: payload && payload.context && payload.context.agent_id,
          session_id:
            payload && payload.context && payload.context.session_id,
          correlation_id:
            payload && payload.context && payload.context.correlation_id,
        },
        extra || {}
      )
    );
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    // Intentionally swallowed. See note above.
  }
}

function main() {
  // The Claude Code hook protocol delivers the payload on stdin as a single
  // JSON document. fd 0 is stdin; readFileSync on it blocks until EOF, which
  // is exactly what we want for a one-shot script.
  let raw;
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (_e) {
    // We could not even read the payload. Block — there is no safe way to
    // proceed without input, and a partial read is worse than no read.
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_e) {
    // Malformed JSON on stdin almost always means the runtime is sending us
    // something we don't understand, OR something tampered with the pipe.
    // Either way: refuse. We audit with a null payload because we have
    // nothing structured to record.
    audit("block", "invalid_json_input", null);
    process.exit(2);
  }

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const context = payload.context || {};

  // Scope the gate. Read calls don't mutate, so gating them is wasted work
  // and creates noise in the audit log. Other tool types (Bash, Grep, etc.)
  // could in principle mutate the bulletin, but in practice the framework
  // funnels bulletin writes through Write/Edit. If your runtime exposes
  // additional mutating tools, add them here.
  const isMutating = tool === "Write" || tool === "Edit";

  // path.normalize on BOTH sides handles cross-platform separator differences
  // and collapses redundant "./" segments. Without normalization, a payload
  // sending ".//bulletin.md" would bypass the equality check.
  const targetsBulletin =
    typeof input.file_path === "string" &&
    path.normalize(input.file_path) === path.normalize(BULLETIN_PATH);

  if (!isMutating || !targetsBulletin) {
    audit("allow", "not_in_scope", payload);
    process.exit(0);
  }

  // session_reads is a runtime-supplied list of file paths the agent has
  // read in the current session. We require it to be an array — not just
  // truthy — because a missing array means the runtime did not enrich the
  // context, and we cannot make a decision without that data.
  const reads = Array.isArray(context.session_reads)
    ? context.session_reads
    : null;

  if (!reads) {
    audit("block", "missing_session_reads", payload);
    process.stderr.write(
      "Cannot verify read-before-write: context.session_reads missing.\n"
    );
    process.exit(2);
  }

  // Full-path equality, not basename. A read of "backup/bulletin.md" must
  // NOT satisfy a write to "live/bulletin.md" — those are different files
  // even if the basename matches. See check-locked-states.example.js for
  // the basename-collision bug this same lesson came from.
  const sawRead = reads.some(
    (p) => typeof p === "string" &&
      path.normalize(p) === path.normalize(BULLETIN_PATH)
  );

  if (!sawRead) {
    audit("block", "bulletin_not_read_in_session", payload);
    process.stderr.write(
      `Bulletin must be read in this session before writing. ` +
        `Read ${BULLETIN_PATH} first, then retry.\n`
    );
    process.exit(2);
  }

  audit("allow", "read_before_write_satisfied", payload);
  process.exit(0);
}

try {
  main();
} catch (_e) {
  // Fail-closed default. Any uncaught error — including programming bugs in
  // this file — must result in a block, never a silent allow. exit(2) is
  // the only acceptable terminal state for the catch arm of a PreToolUse
  // hook. Do not change this to exit(0) under any circumstance.
  process.exit(2);
}

/*
 * USAGE
 * -----
 *
 * 1. Settings wiring. In .claude/settings.json:
 *
 *    {
 *      "hooks": {
 *        "PreToolUse": [
 *          {
 *            "matcher": "Write|Edit",
 *            "hooks": [
 *              {
 *                "type": "command",
 *                "command": "node /absolute/path/to/check-bulletin.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      BULLETIN_PATH  — full path to your bulletin file
 *      AUDIT_LOG      — full path to the JSONL audit log to append to
 *
 * 3. Block example. Agent calls Write on the bulletin without first
 *    reading it. The hook exits 2 and the agent sees:
 *
 *      Bulletin must be read in this session before writing.
 *      Read {path/to/your/bulletin.md} first, then retry.
 *
 *    The agent's correct response is to issue a Read on the bulletin path
 *    and re-attempt the Write. The audit log records both the block and
 *    the subsequent allow.
 */
