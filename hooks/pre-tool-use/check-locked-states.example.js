#!/usr/bin/env node
"use strict";

// check-locked-states.example.js
//
// Path-qualified locked state matching.
//
// THE BUG THIS FIXES:
//   An older version of this hook compared by basename only:
//
//     if (lockedNames.includes(path.basename(target))) block();
//
//   That match collides on common filenames. Two files at different paths
//   both named `config.json` would both be treated as locked even when only
//   one was intended to be. The fix: match on the full normalized path.
//
//   Symptom in production: agents report "config.json is locked" when
//   editing an unrelated config.json in another module. Erodes trust in the
//   hook layer; agents start asking the operator to override on every write.
//
// Decision: exit(0) allow, exit(2) block, anything else fail-closed.

const fs = require("fs");
const path = require("path");

const LOCKED_STATES = ".agent-workspace/locks/locked-states.json";
const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

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
    /* swallow audit error */
  }
}

function loadLockedStates() {
  // [
  //   { "path": "src/auth/policy.ts",   "owner": "agent-srv",  "ttl": "..." },
  //   { "path": "src/payments/index.ts","owner": "agent-srv",  "ttl": "..." }
  // ]
  const raw = fs.readFileSync(LOCKED_STATES, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("locked-states must be array");
  return parsed.map((entry) => ({
    path: path.normalize(entry.path),
    owner: entry.owner,
  }));
}

function findLock(target, locks) {
  const norm = path.normalize(target);
  // CORRECT: full-path match.
  // INCORRECT (do not do this):
  //   return locks.find(l => path.basename(l.path) === path.basename(norm))
  return locks.find((l) => l.path === norm) || null;
}

function main() {
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw);

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
    audit("block", "locked_states_unreadable", payload);
    process.exit(2);
  }

  const lock = findLock(target, locks);
  if (!lock) {
    audit("allow", "no_matching_lock", payload);
    process.exit(0);
  }

  const callerId = context.agent_id;
  if (callerId && callerId === lock.owner) {
    audit("allow", "caller_owns_lock", payload, { lock_path: lock.path });
    process.exit(0);
  }

  audit("block", "locked_by_other_agent", payload, {
    lock_path: lock.path,
    lock_owner: lock.owner,
  });
  process.stderr.write(
    `Target ${target} is locked by ${lock.owner}. ` +
      `Match was on full path; basename-only match is disabled.\n`
  );
  process.exit(2);
}

try {
  main();
} catch (_e) {
  process.exit(2);
}
