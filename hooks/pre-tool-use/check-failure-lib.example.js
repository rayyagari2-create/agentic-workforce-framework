#!/usr/bin/env node
"use strict";

/*
 * check-failure-lib.example.js
 *
 * Enforces: pre-spawn failure-library retrieval. A HIGH-risk Task spawn is
 *   allowed only if the agent has read the relevant domain's failure
 *   library (or the generic index) in the current session.
 * Fires:    PreToolUse — runs BEFORE the spawn, decides allow vs block.
 * exit(2):  Hard block. The runtime refuses the spawn and surfaces the
 *           stderr message to the agent. exit(0) allows.
 * Fail-closed protects against: recurrence — repeating a failure that's
 *   already in the institutional memory because the agent never saw it.
 *   Without this hook, recurrence is only caught at scoring time (D4),
 *   which is too late: the bad work has already happened. With it, the
 *   prior failures are loaded into the agent's context window before the
 *   high-risk decision is made.
 */

const fs = require("fs");
const path = require("path");

const FAILURE_LIB_DIR =
  process.env.FAILURE_LIB_DIR || "{path/to/your/failure-library/}";
const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

const SPAWN_TOOLS = new Set(["Task", "SpawnAgent", "Agent"]);

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
  const task = context.task || {};

  // Scope: only spawn-class tools. We don't gate Reads, Writes, or
  // anything else here — recurrence prevention is specifically about
  // delegating new work to a subagent.
  if (!SPAWN_TOOLS.has(tool)) {
    audit("allow", "not_a_spawn_tool", payload);
    process.exit(0);
  }

  // Risk-tiered gating. LOW and MEDIUM tasks don't trigger this check —
  // requiring failure-library reads on every spawn would create churn
  // disproportionate to the recurrence risk. HIGH risk is where the
  // expected cost of repeating a known failure outweighs the read cost.
  if (task.risk !== "high") {
    audit("allow", "risk_not_high", payload);
    process.exit(0);
  }

  // High-risk tasks MUST declare a domain. Without one, we cannot index
  // into the failure library — and we'd rather refuse than fall through
  // to "no domain, no check, allow" which is fail-open.
  if (!task.domain || typeof task.domain !== "string") {
    audit("block", "high_risk_task_missing_domain", payload);
    process.stderr.write(
      "High-risk spawn missing required task.domain field.\n"
    );
    process.exit(2);
  }

  // session_reads is supplied by the runtime and lists files read in the
  // CURRENT session. Reads from prior sessions don't count: they aren't
  // in the agent's current context window, so the failures haven't
  // actually been seen by the agent making this spawn decision.
  const reads = Array.isArray(context.session_reads)
    ? context.session_reads
    : null;
  if (!reads) {
    audit("block", "missing_session_reads", payload);
    process.stderr.write(
      "Cannot verify failure-library read: context.session_reads missing.\n"
    );
    process.exit(2);
  }

  // Two acceptable read targets:
  //   - Domain-specific: <FAILURE_LIB_DIR>/<domain>.md (preferred)
  //   - Generic index:   <FAILURE_LIB_DIR>/index.md   (fallback for
  //                       projects too small to maintain per-domain files)
  // Either satisfies the gate. Using the generic index is a sign of an
  // immature failure library — that's a hint to the operator, not a
  // policy violation.
  const expected = path.normalize(
    path.join(FAILURE_LIB_DIR, task.domain + ".md")
  );
  const generic = path.normalize(path.join(FAILURE_LIB_DIR, "index.md"));

  const sawDomain = reads.some(
    (p) => typeof p === "string" &&
      (path.normalize(p) === expected || path.normalize(p) === generic)
  );

  if (!sawDomain) {
    audit("block", "failure_library_not_read_for_domain", payload, {
      expected,
      generic,
    });
    process.stderr.write(
      `High-risk spawn blocked. Read ${expected} ` +
        `(or ${generic}) in this session before spawning.\n`
    );
    process.exit(2);
  }

  audit("allow", "failure_library_read", payload, { expected });
  process.exit(0);
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
 * 1. Settings wiring. In .claude/settings.json. Match on the spawn
 *    primitives so this hook only runs at delegation points:
 *
 *    {
 *      "hooks": {
 *        "PreToolUse": [
 *          {
 *            "matcher": "Task|SpawnAgent|Agent",
 *            "hooks": [
 *              {
 *                "type": "command",
 *                "command": "node /absolute/path/to/check-failure-lib.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 2. Environment variables read:
 *      FAILURE_LIB_DIR  — directory containing <domain>.md files
 *      AUDIT_LOG        — JSONL append target for decision audit
 *
 * 3. Block example. The orchestrator attempts to spawn a HIGH-risk task
 *    in the "payments" domain without first reading the payments failure
 *    library. The hook exits 2 and the agent sees:
 *
 *      High-risk spawn blocked. Read {path/to/your/failure-library/}payments.md
 *      (or {path/to/your/failure-library/}index.md) in this session before
 *      spawning.
 *
 *    The orchestrator's correct response is to Read the named file, then
 *    re-attempt the spawn. The audit log captures both the block and the
 *    subsequent allow — the resulting trail is the proof that the agent
 *    actually consulted prior failures before delegating.
 */
