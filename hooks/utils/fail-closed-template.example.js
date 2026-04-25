#!/usr/bin/env node
"use strict";

/*
 * fail-closed-template.example.js
 *
 * Enforces: nothing on its own — this is a STARTING TEMPLATE for any new
 *   PreToolUse hook. Copy, rename, implement decide(), preserve invariants.
 * Fires:    PreToolUse — runs BEFORE the tool call. Whatever you build on
 *           this template inherits that lifecycle position.
 * exit(2):  Hard block. The runtime refuses the tool call and surfaces the
 *           stderr message to the agent. exit(0) allows.
 * Fail-closed protects against: silent fail-open when a new hook is added
 *   to the system. The invariants below — wrap-in-try-catch, exit(2) on
 *   any error path, audit on every exit — are the difference between a
 *   hook that catches a violation and one that hides it. Removing any of
 *   them creates a fail-open hole.
 */

/*
 * INVARIANTS — DO NOT REMOVE
 * --------------------------
 *
 * 1. The file begins with "use strict" — surfaces latent bugs early
 *    (e.g. undeclared variables become ReferenceError instead of
 *    silently creating globals).
 *
 * 2. EVERY exit code path uses EXACTLY one of: exit(0) (allow) or
 *    exit(2) (block). NEVER exit(1). exit(1) is ambiguous: many runtimes
 *    treat it as a generic error and may fall through to the next hook
 *    or to the default-allow path. The hook framework rejects ambiguity.
 *
 * 3. main() is wrapped in try/catch. The catch arm exits 2. This is the
 *    fail-closed default — any uncaught error blocks the call. Do NOT
 *    change the catch arm to exit(0) under any circumstance.
 *
 * 4. The hook writes an audit entry on EVERY exit path — both allow and
 *    block. A blocked call is just as much an event worth recording as
 *    an allowed one. An audit log that only contains permitted calls is
 *    incomplete by design.
 *
 * 5. Inputs are parsed defensively. Any missing or malformed field
 *    results in exit(2), not a crash and not exit(0).
 *
 * 6. The hook does NOT perform network I/O. If you need external state,
 *    read a local cache and let a separate process refresh it on a
 *    schedule. PreToolUse hooks are on the hot path; a 200ms network
 *    timeout multiplied by every tool call adds up fast.
 *
 * If you find yourself writing:
 *
 *     try { ... } catch (_e) { process.exit(0); }
 *
 * STOP. That is a fail-open hole. Audit-log it and refuse the call
 * instead. The cost of a false block is the operator notices and asks;
 * the cost of a silent allow is a violation that nobody sees.
 */

const fs = require("fs");

const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          // Replace this with your hook's name when copying. The audit log
          // is grepped by hook name during incident review; an unrenamed
          // template here would shadow other audit entries.
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
    // Audit failure must not flip the decision. Operator notices on the
    // next reconciliation pass. See check-bulletin.example.js for the
    // full rationale on why this swallow is intentional.
  }
}

/**
 * Implement your hook logic here.
 *
 * Return one of:
 *   - { decision: "allow", reason: "<short_snake_case>" }
 *   - { decision: "block", reason: "<short_snake_case>" }
 *
 * Anything else (undefined, null, malformed) is treated as block by main().
 * That's the safest default: forgetting to return is a programming bug,
 * and we'd rather the bug surface as a block than as a silent allow.
 *
 * @param {object} payload  parsed hook input from stdin
 * @returns {{ decision: "allow"|"block", reason: string, extra?: object }}
 */
function decide(payload) {
  // EXAMPLE — replace with your check.
  //
  //   const tool = payload.tool_name;
  //   if (tool === "DangerousTool") {
  //     return { decision: "block", reason: "tool_not_permitted" };
  //   }
  //   return { decision: "allow", reason: "passed_all_checks" };
  return { decision: "allow", reason: "default_allow_replace_me" };
}

function main() {
  let raw;
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch (_e) {
    // Cannot even read stdin → block. We have no payload to audit
    // against, so the audit call is skipped here; operator sees the gap
    // as a hook process exit without a corresponding audit entry.
    process.exit(2);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (_e) {
    audit("block", "invalid_json_input", null);
    process.exit(2);
  }

  // Defensive call into decide(). If the implementer's decide() throws,
  // the outer try/catch in this file catches it and exits 2.
  const verdict = decide(payload) || {};

  // Explicit equality check on "allow". We do NOT treat "decision !==
  // 'block'" as allow — that would let undefined/null/typos slip through
  // as allow. Only an explicit, exact "allow" passes. Everything else
  // (including a verdict object missing the decision field) blocks.
  if (verdict.decision === "allow") {
    audit("allow", verdict.reason || "allowed", payload, verdict.extra);
    process.exit(0);
  }

  audit("block", verdict.reason || "blocked", payload, verdict.extra);
  process.exit(2);
}

try {
  main();
} catch (_e) {
  // Fail-closed default. DO NOT change this to exit(0) under any
  // circumstance. If your hook is producing unwanted blocks because of
  // exceptions, fix the exception — do not silence the fail-closed
  // catch arm.
  process.exit(2);
}

/*
 * USAGE
 * -----
 *
 * 1. Copy and rename this file:
 *
 *      cp fail-closed-template.example.js my-new-check.js
 *
 *    Then update:
 *      - the audit() function's `hook` field to match your filename
 *      - the decide() function with your enforcement logic
 *      - this USAGE block to describe your hook's contract
 *
 * 2. Settings wiring. In .claude/settings.json. Choose a matcher that
 *    targets ONLY the tool calls your hook needs to inspect — over-broad
 *    matchers waste latency on every tool call:
 *
 *    {
 *      "hooks": {
 *        "PreToolUse": [
 *          {
 *            "matcher": "<tool_name_regex>",
 *            "hooks": [
 *              {
 *                "type": "command",
 *                "command": "node /absolute/path/to/my-new-check.js"
 *              }
 *            ]
 *          }
 *        ]
 *      }
 *    }
 *
 * 3. Environment variables read:
 *      AUDIT_LOG  — JSONL append target for decision audit
 *
 * 4. Block example. Whatever your decide() function returns with
 *    decision:"block" surfaces to the agent via stderr (you'll need to
 *    add a process.stderr.write call before the exit(2) for that —
 *    consult the real example hooks in this directory for the pattern).
 *
 * 5. Testing checklist before you ship. Verify:
 *      a. Allow case: well-formed input, all preconditions met → exit 0
 *      b. Block case: well-formed input, precondition violated → exit 2
 *      c. Malformed input: invalid JSON on stdin → exit 2
 *      d. Missing context field: required field absent → exit 2
 *      e. Crash path: throw inside decide() → process exits non-zero,
 *         runtime treats as block
 *      f. Audit: every code path writes exactly one audit entry
 */
