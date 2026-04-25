#!/usr/bin/env node
"use strict";

/*
 * audit-write.example.js
 *
 * Enforces: an append-only JSONL audit entry per tool invocation, with a
 *   sha256 hash of the canonicalized tool input rather than the input
 *   payload itself.
 * Fires:    PostToolUse — runs AFTER the tool call. Cannot block (the call
 *           already ran), only record.
 * exit(2):  Not used here — PostToolUse cannot block. Exit codes signal
 *           observability only: exit(0) on success, exit(1) on failure to
 *           SURFACE the audit gap to the operator. Silent swallow forbidden.
 * Fail-closed protects against: silent audit gaps. The framework's
 *   accountability story rests on this log being complete; a hook that
 *   drops audit writes without anyone noticing is worse than no hook at
 *   all because it produces the appearance of an audit trail without the
 *   substance.
 */

const fs = require("fs");
const crypto = require("crypto");

const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

function hashInput(input) {
  try {
    // Canonicalize key order before hashing. Two semantically identical
    // input objects with different key orderings would otherwise produce
    // different sha256 digests, which destroys the hash's value as a
    // tamper-evident reference. JSON.stringify with a sorted-keys
    // replacer gives us that canonical form.
    const canonical = JSON.stringify(input, Object.keys(input || {}).sort());
    return crypto.createHash("sha256").update(canonical).digest("hex");
  } catch (_e) {
    // Non-serializable inputs (circular refs, BigInt, etc.) → null hash.
    // We still want to log the entry; the missing hash is itself useful
    // evidence that something unusual was passed to the tool.
    return null;
  }
}

function statusOf(result) {
  // Tool result shapes vary. We accept a few conventions in priority order.
  // The fallback "unknown" is intentional — we never invent a status, and
  // the operator can grep audit entries with status=unknown to find tool
  // results we haven't taught this hook about yet.
  if (!result || typeof result !== "object") return "unknown";
  if (result.status) return String(result.status);
  if (result.error) return "error";
  return "success";
}

function main() {
  // Read stdin defensively. PostToolUse hooks must be tolerant of partial
  // payloads — if the runtime is mid-shutdown when this fires, we still
  // want to write what we can.
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw);

  const ctx = payload.context || {};
  const entry = {
    ts: new Date().toISOString(),
    agent_id: ctx.agent_id || null,
    // typeof check (not truthiness) because depth 0 is the orchestrator
    // and is a valid value — `||` would replace 0 with null and erase
    // the orchestrator's depth from every audit entry.
    agent_depth: typeof ctx.agent_depth === "number" ? ctx.agent_depth : null,
    session_id: ctx.session_id || null,
    correlation_id: ctx.correlation_id || null,
    tool_name: payload.tool_name || null,
    // Hash, not raw input. Raw inputs can be arbitrarily large (full file
    // contents on a Write call), and storing them duplicates data already
    // present in the workspace. The hash gives us a tamper-evident
    // reference: if someone later edits the file, the hash on the audit
    // entry doesn't change but the file's hash does.
    tool_input_hash: hashInput(payload.tool_input),
    tool_result_status: statusOf(payload.tool_result),
  };

  // Atomic-ish append. fs.appendFileSync uses O_APPEND under the hood,
  // and POSIX guarantees that appends up to PIPE_BUF (4KB on Linux,
  // 512B on macOS — but commonly 4KB in practice) are atomic with
  // respect to other O_APPEND writers. Our JSONL line is well under
  // that, so concurrent hook processes will not produce torn writes.
  // If your audit-log entries grow past 512 bytes on macOS, consider
  // a coordinator process instead of relying on append atomicity.
  fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n", { flag: "a" });

  process.exit(0);
}

try {
  main();
} catch (e) {
  // PostToolUse hooks must NOT fail silently — that defeats the entire
  // purpose. Surface to stderr so the operator notices the audit gap on
  // their next review of hook output. exit(1) is acceptable here (unlike
  // PreToolUse) because the call already executed; the runtime will not
  // mistakenly interpret this as a block.
  process.stderr.write(
    "audit-write hook failed: " + (e && e.message ? e.message : String(e)) + "\n"
  );
  process.exit(1);
}

/*
 * USAGE
 * -----
 *
 * 1. Settings wiring. In .claude/settings.json. Use a broad matcher so
 *    every tool invocation is audited; the cost per call is one hash and
 *    one append, well under the PostToolUse latency budget.
 *
 *    {
 *      "hooks": {
 *        "PostToolUse": [
 *          {
 *            "matcher": "*",
 *            "hooks": [
 *              {
 *                "type": "command",
 *                "command": "node /absolute/path/to/audit-write.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      AUDIT_LOG  — full path to the JSONL audit log (append-only)
 *
 * 3. Failure example. The audit log path is unwritable (full disk,
 *    permission flip, file moved). The hook exits 1 and stderr shows:
 *
 *      audit-write hook failed: ENOSPC: no space left on device, open
 *      '{path/to/your/audit-log.jsonl}'
 *
 *    The operator's correct response is to investigate the storage
 *    issue immediately — the system is currently producing tool calls
 *    without audit records. This is a degraded mode that the framework
 *    treats as a stop-the-world condition, not a transient error.
 */
