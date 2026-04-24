#!/usr/bin/env node
"use strict";

// fail-closed-template.example.js
//
// Template for any new PreToolUse hook. Copy this file, rename it, and
// implement the `decide()` function.
//
// INVARIANTS — DO NOT REMOVE:
//
//   1. The file begins with `"use strict"` to surface latent bugs early.
//
//   2. Every code path that reaches process.exit() exits with EXACTLY
//      one of: 0 (allow) or 2 (block). Never exit(1). exit(1) is
//      ambiguous — many runtimes treat it as a generic error rather
//      than a deliberate block, which means you may inadvertently fail
//      open.
//
//   3. The entire main logic is wrapped in try/catch. The catch arm
//      exits 2. This is the fail-closed default: any uncaught error
//      blocks the call.
//
//   4. The hook writes an audit entry on EVERY exit path — both allow
//      and block. A blocked call is an event worth recording.
//
//   5. Inputs are parsed defensively. Any missing or malformed field
//      results in exit(2), not a crash and not exit(0).
//
//   6. The hook does not perform network I/O. If you need external
//      state, read a local cache and let a separate process refresh it.
//
// If you find yourself adding a `try { ... } catch (_e) { process.exit(0); }`
// pattern: STOP. That is a fail-open hole. Audit-log it and refuse the
// call instead.

const fs = require("fs");

const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "fail-closed-template",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          agent_id: payload && payload.context && payload.context.agent_id,
          correlation_id:
            payload && payload.context && payload.context.correlation_id,
        },
        extra || {}
      )
    );
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    /* swallow audit error — the decision stands */
  }
}

/**
 * Implement your hook logic here.
 *
 * @param {object} payload  parsed hook input
 * @returns {{ decision: "allow"|"block", reason: string, extra?: object }}
 */
function decide(payload) {
  // EXAMPLE — replace with your check.
  // const tool = payload.tool_name;
  // if (tool === "Forbidden") return { decision: "block", reason: "forbidden_tool" };
  return { decision: "allow", reason: "default_allow_replace_me" };
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (_e) {
    // Cannot even read stdin → block.
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_e) {
    audit("block", "invalid_json_input", null);
    process.exit(2);
  }

  const verdict = decide(payload) || {};
  if (verdict.decision === "allow") {
    audit("allow", verdict.reason || "allowed", payload, verdict.extra);
    process.exit(0);
  }

  // Treat anything that is not an explicit "allow" as a block.
  audit("block", verdict.reason || "blocked", payload, verdict.extra);
  process.exit(2);
}

try {
  main();
} catch (_e) {
  // Fail-closed default. Do NOT change this to exit(0) under any
  // circumstance.
  process.exit(2);
}
