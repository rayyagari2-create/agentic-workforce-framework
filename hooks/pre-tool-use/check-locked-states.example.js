#!/usr/bin/env node
"use strict";

/*
 * check-locked-states.example.js
 *
 * Enforces: path-qualified matching against a locked-states list. Each entry
 *   names a fully-qualified file path and an owning agent; only the owner
 *   may Write/Edit that exact path.
 * Fires:    PreToolUse — runs BEFORE the tool call, decides allow vs block.
 * exit(2):  Hard block. The runtime refuses the call and surfaces the
 *           stderr message to the agent. exit(0) allows.
 * Fail-closed protects against: TWO failure modes — (1) writes when the
 *   locked-states file is unreadable, and (2) the basename-collision bug
 *   where two unrelated files sharing a name (config.json) would both be
 *   blocked because matching was done on basename, not full path.
 */

const fs = require("fs");
const path = require("path");

const LOCKED_STATES =
  process.env.LOCKED_STATES || "{path/to/your/locks/locked-states.json}";
const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-locked-states",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          target: payload && payload.tool_input && payload.tool_input.file_path,
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

function loadLockedStates() {
  // Expected shape — array of records, one per locked path:
  //   [
  //     { "path": "src/auth/policy.ts",    "owner": "agent-srv" },
  //     { "path": "src/payments/index.ts", "owner": "agent-srv" }
  //   ]
  const raw = fs.readFileSync(LOCKED_STATES, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    // Reject malformed shapes early. A {} or null payload would silently
    // produce zero locks (i.e. nothing matches, allow everything) — that
    // is exactly the fail-open we want to avoid.
    throw new Error("locked-states must be an array");
  }
  return parsed
    .filter((entry) => entry && typeof entry.path === "string")
    .map((entry) => ({
      // Normalize once at load time, not per-comparison. This collapses
      // "./src/x.ts" to "src/x.ts" so equality with a similarly normalized
      // target works regardless of which form the agent supplied.
      path: path.normalize(entry.path),
      owner: typeof entry.owner === "string" ? entry.owner : null,
    }));
}

function findLock(target, locks) {
  const norm = path.normalize(target);

  // CORRECT: full-path equality. Two paths match only if they refer to the
  // same file in the same directory tree.
  //
  // INCORRECT — and this is the bug this hook exists to prevent:
  //   return locks.find(l => path.basename(l.path) === path.basename(norm))
  //
  // The basename-only comparison treats "moduleA/config.json" and
  // "moduleB/config.json" as the same lock. In production this manifests
  // as agents being told "config.json is locked" when editing a totally
  // unrelated config.json elsewhere in the tree — which trains agents to
  // request operator overrides on every write, eroding the entire lock
  // system's signal value.
  return locks.find((l) => l.path === norm) || null;
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

  const isMutating = tool === "Write" || tool === "Edit";
  const target = typeof input.file_path === "string" ? input.file_path : null;

  if (!isMutating || !target) {
    audit("allow", "not_in_scope", payload);
    process.exit(0);
  }

  let locks;
  try {
    locks = loadLockedStates();
  } catch (_e) {
    // Cannot read or parse the locked-states file → block. We do not know
    // which paths are locked, so we cannot prove this one isn't.
    audit("block", "locked_states_unreadable", payload);
    process.stderr.write(
      "Locked-states unreadable. Refusing write until state can be verified.\n"
    );
    process.exit(2);
  }

  const lock = findLock(target, locks);
  if (!lock) {
    audit("allow", "no_matching_lock", payload);
    process.exit(0);
  }

  // Owner check is by exact equality on agent_id. We deliberately do NOT
  // accept "starts with the owner's name" or any other fuzzy match — that
  // opens spoofing where an agent named "agent-srv-impersonator" would
  // satisfy ownership of an agent-srv lock.
  const callerId = context.agent_id;
  if (callerId && lock.owner && callerId === lock.owner) {
    audit("allow", "caller_owns_lock", payload, { lock_path: lock.path });
    process.exit(0);
  }

  audit("block", "locked_by_other_agent", payload, {
    lock_path: lock.path,
    lock_owner: lock.owner,
  });
  process.stderr.write(
    `Target ${target} is locked by ${lock.owner || "unknown"}. ` +
      `Match was on full path; basename-only matching is disabled.\n`
  );
  process.exit(2);
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
 *                "command": "node /absolute/path/to/check-locked-states.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      LOCKED_STATES  — JSON array of {path, owner} records
 *      AUDIT_LOG      — JSONL append target for decision audit
 *
 * 3. Block example. agent-fe attempts to Write src/payments/index.ts which
 *    is locked by agent-srv. The hook exits 2 and the agent sees:
 *
 *      Target src/payments/index.ts is locked by agent-srv. Match was
 *      on full path; basename-only matching is disabled.
 *
 *    The "basename-only matching is disabled" line is intentional — it
 *    documents to the agent (and to the operator reading audit logs) that
 *    a same-name file elsewhere in the tree would NOT have triggered this
 *    block. That removes a failure-mode the older hook had.
 */
