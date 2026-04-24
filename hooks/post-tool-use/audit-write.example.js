#!/usr/bin/env node
"use strict";

// audit-write.example.js
//
// PostToolUse hook: append one JSONL line to the audit log after every
// tool call. The audit log is append-only — never truncated, never
// rewritten. The framework's accountability story rests on this file
// being complete.
//
// Fields recorded:
//   - ts:                  ISO-8601 timestamp
//   - agent_id:            caller agent identity
//   - tool_name:           which tool was invoked
//   - tool_input_hash:     sha256 of the canonicalized input (no payload)
//   - tool_result_status:  success / error / unknown
//   - correlation_id:      threaded ID linking this call to a task / session
//   - session_id, agent_depth: context for later analysis
//
// We hash the input rather than store it. Inputs may contain large
// payloads (file contents) and we want a tamper-evident reference, not a
// duplicate of the data.

const fs = require("fs");
const crypto = require("crypto");

const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

function hashInput(input) {
  try {
    const canonical = JSON.stringify(input, Object.keys(input || {}).sort());
    return crypto.createHash("sha256").update(canonical).digest("hex");
  } catch (_e) {
    return null;
  }
}

function statusOf(result) {
  if (!result || typeof result !== "object") return "unknown";
  if (result.status) return String(result.status);
  if (result.error) return "error";
  return "success";
}

function main() {
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw);

  const ctx = payload.context || {};
  const entry = {
    ts: new Date().toISOString(),
    agent_id: ctx.agent_id || null,
    agent_depth: typeof ctx.agent_depth === "number" ? ctx.agent_depth : null,
    session_id: ctx.session_id || null,
    correlation_id: ctx.correlation_id || null,
    tool_name: payload.tool_name || null,
    tool_input_hash: hashInput(payload.tool_input),
    tool_result_status: statusOf(payload.tool_result),
  };

  // Atomic-ish append. fs.appendFileSync uses O_APPEND, which means
  // POSIX guarantees each write up to PIPE_BUF (4KB) is atomic. Our
  // line is well under that. Concurrent hook processes will not tear.
  fs.appendFileSync(AUDIT_LOG, JSON.stringify(entry) + "\n", { flag: "a" });

  process.exit(0);
}

try {
  main();
} catch (e) {
  // PostToolUse hooks must NOT fail silently. Surface to stderr so the
  // operator notices the audit gap.
  process.stderr.write(
    "audit-write hook failed: " + (e && e.message ? e.message : String(e)) + "\n"
  );
  process.exit(1);
}
