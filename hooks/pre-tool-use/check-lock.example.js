#!/usr/bin/env node
"use strict";

/*
 * check-lock.example.js
 *
 * Enforces: file-lock acquisition. A Write or Edit on a file (or a file
 *   inside a locked directory) is allowed only if the caller holds the
 *   matching lock entry in context.acquired_locks.
 * Fires:    PreToolUse — runs BEFORE the tool call, decides allow vs block.
 * exit(2):  Hard block. The runtime refuses the call and surfaces the
 *           stderr message to the agent. exit(0) allows.
 * Fail-closed protects against: writes against locked state when the lock
 *   index can't be read or parsed. If we cannot prove the file is unlocked
 *   AND we cannot prove the caller holds the lock, the only safe verdict
 *   is to refuse — guessing here corrupts the resource the lock exists
 *   to protect.
 */

// ⚠️  FRAMEWORK-ENRICHED HOOK
// ──────────────────────────────────────────────────────────────
// This hook requires context fields that Claude Code does NOT
// provide by default in its PreToolUse payload:
//
//   context.agent_id
//   context.agent_depth
//   context.session_reads
//   context.acquired_locks
//   context.task
//
// Claude Code's verified PreToolUse payload shape is:
//   { session_id, transcript_path, cwd, permission_mode,
//     hook_event_name, tool_name, tool_input, tool_use_id }
//
// To use this hook with Claude Code, you must enrich the payload
// using hooks/utils/normalize-claude-code-payload.example.js
// and a sidecar manifest that carries the missing context.
//
// Without enrichment: this hook will fail closed immediately
// because the expected context fields do not exist.
//
// Claude Code native hooks (no enrichment required):
//   hooks/pre-tool-use/check-agent-spawn.example.js
//   hooks/sub-agent-start/check-subagent-start.example.js
//   hooks/post-tool-use/check-agent-spawn-result.example.js
// ──────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");

// Lock index lives outside the hook so it can be updated by other tools
// (lock-acquire, lock-release) without modifying the hook itself. Format:
//   { "files": ["src/auth/policy.ts"], "dirs": ["src/payments/"] }
const LOCKS_INDEX =
  process.env.LOCKS_INDEX || "{path/to/your/locks/locked-files.json}";
const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-lock",
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
    // Audit failure must not flip the decision. See check-bulletin.
  }
}

function loadLockIndex() {
  // Two collections: explicit file locks, and locked directories. Directory
  // locks let an owner hold an entire region (e.g. an in-flight refactor)
  // without enumerating every file by name — important when the file set is
  // changing during the work.
  const raw = fs.readFileSync(LOCKS_INDEX, "utf8");
  const parsed = JSON.parse(raw);
  return {
    files: Array.isArray(parsed.files) ? parsed.files.map(path.normalize) : [],
    // Normalize each directory and append a trailing separator. The trailing
    // separator is what prevents "src/payments" from matching the unrelated
    // directory "src/payments-archive" via startsWith later — without it,
    // the prefix match would produce a false positive.
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

  // Exact-match the explicit file locks first. Cheaper, and an explicit
  // file lock is more specific than a directory lock that happens to
  // contain it.
  if (idx.files.includes(norm)) {
    return { locked: true, by: norm, kind: "file" };
  }

  for (const d of idx.dirs) {
    // Two cases:
    //   1. norm equals the directory itself (someone tries to write the
    //      directory as if it were a file — d.slice(0, -1) strips the
    //      trailing separator we appended in loadLockIndex).
    //   2. norm is inside the locked directory (startsWith catches every
    //      descendant; the trailing separator in d prevents prefix
    //      collisions like src/payments-archive/foo.ts).
    if (norm === d.slice(0, -1) || norm.startsWith(d)) {
      return { locked: true, by: d, kind: "dir" };
    }
  }
  return { locked: false };
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

  // Only Write/Edit can mutate the locked file. Reads against locked files
  // are intentionally allowed — locks govern modification, not visibility.
  // Letting locked files be read keeps the lock from doubling as access
  // control, which it isn't designed to be.
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
    // Index unreadable or unparseable → block. This is the critical
    // fail-closed branch: we do not know whether the file is locked, so
    // we refuse rather than risk overwriting locked state. An older
    // version that fell through to exit(0) here was filed as a P2 fail-
    // open vulnerability; do not regress.
    audit("block", "lock_index_unreadable", payload);
    process.stderr.write(
      "Lock index unreadable. Refusing write until lock state can be verified.\n"
    );
    process.exit(2);
  }

  const verdict = isLocked(target, idx);
  if (!verdict.locked) {
    audit("allow", "target_not_locked", payload);
    process.exit(0);
  }

  // Caller's claim of held locks. Normalize before comparison so that
  // "src/auth/policy.ts" and "./src/auth/policy.ts" are treated as the
  // same lock. We do NOT trust the caller's claim blindly — this hook
  // assumes the runtime populates acquired_locks from a verified source
  // (the lock store), not from agent-supplied input.
  const acquired = Array.isArray(context.acquired_locks)
    ? context.acquired_locks.map(path.normalize)
    : [];

  const held = acquired.includes(path.normalize(verdict.by));

  if (held) {
    audit("allow", "lock_held", payload, { lock_by: verdict.by });
    process.exit(0);
  }

  audit("block", "lock_not_acquired:" + verdict.kind, payload, {
    lock_by: verdict.by,
  });
  process.stderr.write(
    `Target ${target} is locked (${verdict.kind}: ${verdict.by}). ` +
      `Acquire the lock before writing.\n`
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
 *                "command": "node /absolute/path/to/check-lock.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      LOCKS_INDEX  — JSON file with shape {"files":[...], "dirs":[...]}
 *      AUDIT_LOG    — JSONL append target for decision audit
 *
 * 3. Block example. Agent attempts to Write src/auth/policy.ts while
 *    another agent holds the file lock. The hook exits 2 and the agent
 *    sees:
 *
 *      Target src/auth/policy.ts is locked (file: src/auth/policy.ts).
 *      Acquire the lock before writing.
 *
 *    The agent's correct response is to either acquire the lock through
 *    the lock-acquire tool, or queue the write behind the current holder.
 */
