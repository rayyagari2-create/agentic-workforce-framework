#!/usr/bin/env node
"use strict";

// check-agent-spawn.example.js
//
// Subagent spawn governance.
//
// This is the single most important hook in the system — spawn-storms
// break trust accounting. If subagents can spawn subagents, the trust
// score of the originating agent becomes meaningless: work attributed
// to "agent-fe" might actually have been performed by an unsupervised
// chain three layers down. Recurrence detection breaks. Audit attribution
// breaks. The whole accountability model collapses.
//
// Rule:
//   - Only the orchestrator agent may spawn subagents.
//   - Subagents may NOT spawn subagents (depth-1 cap).
//   - The orchestrator's depth is 0; any spawned agent is depth >= 1.
//
// Decision: exit(0) allow, exit(2) block, anything else fail-closed.

const fs = require("fs");

const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";
const ORCHESTRATOR_ID = "agent-orchestrator";
const SPAWN_TOOLS = new Set(["Task", "SpawnAgent", "Agent"]);

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-agent-spawn",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          agent_id: payload && payload.context && payload.context.agent_id,
          agent_depth:
            payload && payload.context && payload.context.agent_depth,
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

  const tool = payload.tool_name;
  const context = payload.context || {};

  if (!SPAWN_TOOLS.has(tool)) {
    audit("allow", "not_a_spawn_tool", payload);
    process.exit(0);
  }

  const callerId = context.agent_id;
  const depth = context.agent_depth;

  if (typeof depth !== "number" || !callerId) {
    audit("block", "missing_caller_identity_or_depth", payload);
    process.exit(2);
  }

  // Only the orchestrator may spawn.
  if (callerId !== ORCHESTRATOR_ID) {
    audit("block", "non_orchestrator_attempted_spawn", payload, {
      caller: callerId,
    });
    process.stderr.write(
      `Spawn denied: ${callerId} is not the orchestrator.\n`
    );
    process.exit(2);
  }

  // Depth-1 cap: orchestrator must be at depth 0.
  if (depth !== 0) {
    audit("block", "spawn_at_nonzero_depth", payload, { depth });
    process.stderr.write(
      `Spawn denied: caller is at depth ${depth}. Subagents cannot spawn.\n`
    );
    process.exit(2);
  }

  audit("allow", "orchestrator_spawn_at_depth_0", payload);
  process.exit(0);
}

try {
  main();
} catch (_e) {
  process.exit(2);
}
