#!/usr/bin/env node
"use strict";

// check-failure-lib.example.js
//
// Pre-task failure retrieval.
//
// Rule: Before spawning any HIGH-risk task, the failure library for the
// relevant domain must have been read in this session. This is the
// recurrence-at-spawn pattern — the agent cannot start a high-risk task
// without first being shown the prior failures in its own domain.
//
// Without this hook, recurrence detection lives only at scoring time
// (D4), which is too late: the same mistake has already been made.
// With this hook, the failure library is in the agent's context window
// at the moment of decision.
//
// Decision: exit(0) allow, exit(2) block, anything else fail-closed.

const fs = require("fs");
const path = require("path");

const FAILURE_LIB_DIR = ".agent-workspace/failure-library/";
const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-failure-lib",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          task_risk:
            payload &&
            payload.context &&
            payload.context.task &&
            payload.context.task.risk,
          domain:
            payload &&
            payload.context &&
            payload.context.task &&
            payload.context.task.domain,
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

function main() {
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw);

  const context = payload.context || {};
  const task = context.task || {};
  const tool = payload.tool_name;

  // We gate spawn-style tools — Task, SpawnAgent, etc.
  const SPAWN_TOOLS = new Set(["Task", "SpawnAgent", "Agent"]);
  if (!SPAWN_TOOLS.has(tool)) {
    audit("allow", "not_a_spawn_tool", payload);
    process.exit(0);
  }

  if (task.risk !== "high") {
    audit("allow", "risk_not_high", payload);
    process.exit(0);
  }

  if (!task.domain || typeof task.domain !== "string") {
    // High-risk tasks must declare a domain. Refuse otherwise.
    audit("block", "high_risk_task_missing_domain", payload);
    process.exit(2);
  }

  const reads = Array.isArray(context.session_reads)
    ? context.session_reads
    : null;
  if (!reads) {
    audit("block", "missing_session_reads", payload);
    process.exit(2);
  }

  // Domain-scoped failure library file, e.g.
  //   .agent-workspace/failure-library/<domain>.md
  const expected = path.normalize(path.join(FAILURE_LIB_DIR, task.domain + ".md"));
  const generic = path.normalize(path.join(FAILURE_LIB_DIR, "index.md"));

  const sawDomain = reads.some(
    (p) => path.normalize(p) === expected || path.normalize(p) === generic
  );

  if (!sawDomain) {
    audit("block", "failure_library_not_read_for_domain", payload, {
      expected,
    });
    process.stderr.write(
      `High-risk spawn blocked. Read ${expected} (or ${generic}) ` +
        `in this session before spawning.\n`
    );
    process.exit(2);
  }

  audit("allow", "failure_library_read", payload, { expected });
  process.exit(0);
}

try {
  main();
} catch (_e) {
  process.exit(2);
}
