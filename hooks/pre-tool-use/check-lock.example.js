#!/usr/bin/env node
"use strict";

// check-lock.example.js
//
// File lock enforcement.
//
// Rule: If a target file is listed in the locked-files index, the caller
// must have acquired the lock (context.acquired_locks contains the path)
// before any Write/Edit on that file. Two patterns are covered:
//
//   1. Explicit file lock: a single file path is listed as locked.
//   2. Locked directory pattern: every file under a locked directory
//      requires the directory's lock to be held.
//
// Decision: exit(0) allow, exit(2) block, anything else fail-closed.

const fs = require("fs");
const path = require("path");

const LOCKS_INDEX = ".agent-workspace/locks/locked-files.json";
const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

function audit(decision, reason, payload) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      hook: "check-lock",
      decision,
      reason,
      tool_name: payload && payload.tool_name,
      target: payload && payload.tool_input && payload.tool_input.file_path,
      agent_id: payload && payload.context && payload.context.agent_id,
      correlation_id:
        payload && payload.context && payload.context.correlation_id,
    });
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    /* swallow audit error — decision stands */
  }
}

function loadLockIndex() {
  // { "files": ["src/auth/policy.ts"], "dirs": ["src/payments/"] }
  const raw = fs.readFileSync(LOCKS_INDEX, "utf8");
  const parsed = JSON.parse(raw);
  return {
    files: Array.isArray(parsed.files) ? parsed.files.map(path.normalize) : [],
    dirs: Array.isArray(parsed.dirs)
      ? parsed.dirs.map((d) => {
          const n = path.normalize(d);
          return n.endsWith(path.sep) ? n : n + path.sep;
        })
      : [],
  };
}

function isLocked(target, idx) {
  const norm = path.normalize(target);
  if (idx.files.includes(norm)) {
    return { locked: true, by: norm, kind: "file" };
  }
  for (const d of idx.dirs) {
    if (norm === d.slice(0, -1) || norm.startsWith(d)) {
      return { locked: true, by: d, kind: "dir" };
    }
  }
  return { locked: false };
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

  let idx;
  try {
    idx = loadLockIndex();
  } catch (_e) {
    // Cannot read the index → must fail closed. We do not know whether
    // the file is locked, so we refuse the call.
    audit("block", "lock_index_unreadable", payload);
    process.exit(2);
  }

  const verdict = isLocked(target, idx);
  if (!verdict.locked) {
    audit("allow", "target_not_locked", payload);
    process.exit(0);
  }

  const acquired = Array.isArray(context.acquired_locks)
    ? context.acquired_locks.map(path.normalize)
    : [];

  const held = acquired.includes(path.normalize(verdict.by));

  if (held) {
    audit("allow", "lock_held", payload);
    process.exit(0);
  }

  audit("block", "lock_not_acquired:" + verdict.kind, payload);
  process.stderr.write(
    `Target ${target} is locked (${verdict.kind}: ${verdict.by}). ` +
      `Acquire the lock before writing.\n`
  );
  process.exit(2);
}

try {
  main();
} catch (_e) {
  process.exit(2);
}
