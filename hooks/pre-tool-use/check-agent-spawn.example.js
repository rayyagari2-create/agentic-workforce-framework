#!/usr/bin/env node
"use strict";

/*
 * check-agent-spawn.example.js
 *
 * Enforces: a depth-1 spawn cap. Only the orchestrator (agent_depth === 0)
 *   may invoke a spawn-class tool (Task / SpawnAgent / Agent). Subagents
 *   may not spawn further subagents.
 * Fires:    PreToolUse — runs BEFORE the tool call, decides allow vs block.
 * exit(2):  Hard block. The runtime refuses the spawn and surfaces the
 *           stderr message to the agent. exit(0) allows.
 * Fail-closed protects against: spawn-storms and broken trust attribution.
 *   If subagents can spawn subagents, the trust score of the originating
 *   agent becomes meaningless — work attributed to "agent-fe" might have
 *   been performed by an unsupervised chain three layers down. Recurrence
 *   detection breaks; audit attribution breaks; the whole accountability
 *   model collapses.
 */

const fs = require("fs");

const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

// Orchestrator identity is configurable via env var because some deployments
// rename the orchestrator (e.g. per-team orchestrator agents). Default
// matches the framework's reference name.
const ORCHESTRATOR_ID = process.env.ORCHESTRATOR_ID || "agent-orchestrator";

// All known spawn-class tool names. We use a Set for O(1) lookup and to make
// it trivial to extend — if your runtime adds a new spawn primitive, add its
// name to this set. Naming conventions vary across runtimes; "Task" is the
// Claude Code primitive, "SpawnAgent" / "Agent" are common framework
// equivalents.
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
    // Audit failure must not flip the decision.
  }
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
  const context = payload.context || {};

  // Scope the gate. We only care about spawn-class tools. Everything else
  // passes through unchanged. We do NOT try to detect spawn-via-bash or
  // similar exfiltration paths; those belong to a separate hook (or to the
  // runtime's policy layer).
  if (!SPAWN_TOOLS.has(tool)) {
    audit("allow", "not_a_spawn_tool", payload);
    process.exit(0);
  }

  const callerId = context.agent_id;
  const depth = context.agent_depth;

  // Both fields are required — depth alone could be missing/zero by accident,
  // and an unidentified caller cannot be attributed in audit. Refuse if
  // either is absent. Note we check `typeof depth !== "number"` rather than
  // `!depth` because depth === 0 is a valid value (it's the orchestrator)
  // and a falsiness check would incorrectly reject it.
  if (typeof depth !== "number" || !callerId) {
    audit("block", "missing_caller_identity_or_depth", payload);
    process.stderr.write(
      "Spawn denied: caller identity or depth missing from context.\n"
    );
    process.exit(2);
  }

  // Only the orchestrator may spawn. Exact equality on agent_id, not
  // startsWith — preventing impostors named "agent-orchestrator-shadow"
  // from satisfying this check via prefix.
  if (callerId !== ORCHESTRATOR_ID) {
    audit("block", "non_orchestrator_attempted_spawn", payload, {
      caller: callerId,
    });
    process.stderr.write(
      `Spawn denied: ${callerId} is not the orchestrator. ` +
        `Only ${ORCHESTRATOR_ID} may spawn subagents.\n`
    );
    process.exit(2);
  }

  // Depth-1 cap: orchestrator runs at depth 0; anything it spawns is at
  // depth >= 1. If a caller claiming to be the orchestrator is at non-zero
  // depth, that is a runtime/identity bug — refuse rather than try to
  // recover gracefully. Recovery here would mean letting a subagent spawn
  // by impersonating the orchestrator, which is exactly what this hook
  // exists to prevent.
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
  // Fail-closed default. See check-bulletin.example.js for rationale.
  // For this hook in particular, fail-open would mean an uncaught error
  // permits arbitrary subagent spawning — the worst possible outcome.
  process.exit(2);
}

/*
 * USAGE
 * -----
 *
 * 1. Settings wiring. In .claude/settings.json. The matcher targets the
 *    spawn primitives only; other tools should not invoke this hook:
 *
 *    {
 *      "hooks": {
 *        "PreToolUse": [
 *          {
 *            "matcher": "Task|SpawnAgent|Agent",
 *            "hooks": [
 *              {
 *                "type": "command",
 *                "command": "node /absolute/path/to/check-agent-spawn.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      AUDIT_LOG       — JSONL append target for decision audit
 *      ORCHESTRATOR_ID — agent_id permitted to spawn (default
 *                        "agent-orchestrator")
 *
 * 3. Block example. A subagent (agent_depth=1) attempts to spawn another
 *    Task. The hook exits 2 and the agent sees:
 *
 *      Spawn denied: caller is at depth 1. Subagents cannot spawn.
 *
 *    The agent's correct response is to return its result up the chain
 *    rather than attempting to delegate further. If the orchestrator
 *    decides further delegation is needed, IT issues the next spawn,
 *    which preserves accountability.
 */
