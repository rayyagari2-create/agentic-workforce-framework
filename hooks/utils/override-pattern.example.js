#!/usr/bin/env node
"use strict";

/*
 * override-pattern.example.js
 *
 * Enforces: a TTL-bounded operator override. When the operator needs to
 *   bypass a hook for a specific call, this module is consulted by the
 *   gating hook to decide whether a valid override is currently active.
 * Fires:    Imported by other PreToolUse hooks. May also be run directly
 *           for smoke-testing (see USAGE).
 * exit(2):  When run directly, exit(2) signals error (stdin unparseable).
 *           When imported, the module exposes `overrideActive(context)`
 *           which returns true/false — the consuming hook decides exit
 *           codes.
 * Fail-closed protects against: stale, forged, and improperly-scoped
 *   overrides. If the override file is unreadable, expired, missing a
 *   reason, or being consumed by a non-orchestrator caller, this module
 *   returns false — the consuming hook then proceeds to its normal logic
 *   (which itself fails closed by default).
 */

const fs = require("fs");

const OVERRIDE_FILE =
  process.env.OVERRIDE_FILE || "{path/to/your/operator-override.json}";
const OVERRIDE_AUDIT =
  process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";

// 15 minutes. Long enough for an operator to recover from a single
// production incident; short enough that a forgotten override file can't
// become a permanent backdoor. Keep small. If your operations need longer
// windows, that's a signal you should fix the underlying policy rather
// than extending the override TTL.
const TTL_MS = 15 * 60 * 1000;

function audit(decision, reason, context, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "override-pattern",
          decision,
          reason,
          agent_id: context && context.agent_id,
          agent_depth: context && context.agent_depth,
          correlation_id: context && context.correlation_id,
        },
        extra || {}
      )
    );
    // EVERY consult of the override is audited, regardless of allow/deny.
    // The audit trail of override consultations is itself a security
    // signal — frequent override use indicates either a policy problem
    // or an attempt at abuse.
    fs.appendFileSync(OVERRIDE_AUDIT, line + "\n", { flag: "a" });
  } catch (_e) {
    // Audit failure must not flip the decision.
  }
}

/**
 * Returns true if a valid operator override is active for this caller.
 * Returns false otherwise. NEVER throws — fail-closed by returning false.
 *
 * @param {object} context  the hook input's context object
 * @returns {boolean}
 */
function overrideActive(context) {
  try {
    // Subagent denial is the FIRST check, before we even look at the
    // override file. Subagents must never inherit operator authority —
    // a compromised or misled subagent that could consume an override
    // would defeat the entire bounded-trust model. Depth 0 is the
    // orchestrator; anything else is denied categorically.
    if (!context || context.agent_depth !== 0) {
      audit("deny_override", "subagent_does_not_inherit", context);
      return false;
    }

    const raw = fs.readFileSync(OVERRIDE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    // Date.parse returns NaN on invalid input. We use Number.isFinite
    // (not !isNaN) because it correctly rejects NaN, Infinity, and
    // -Infinity in one check.
    const issuedAt = Date.parse(parsed.issued_at);
    if (!Number.isFinite(issuedAt)) {
      audit("deny_override", "issued_at_invalid", context);
      return false;
    }

    const age = Date.now() - issuedAt;
    // Reject negative ages (clock skew or future-dated override) AND ages
    // beyond the TTL. A future-dated override is treated as malicious
    // until proven otherwise — there's no legitimate reason an operator
    // would issue one.
    if (age < 0 || age > TTL_MS) {
      audit("deny_override", "ttl_expired_or_future_dated", context, {
        age_ms: age,
      });
      return false;
    }

    // Required reason field. Length floor of 8 chars is arbitrary but
    // serves a purpose: a single-word reason like "fix" carries no
    // audit value. Force the operator to write enough text that the
    // intent is recoverable from the audit log months later.
    if (typeof parsed.reason !== "string" || parsed.reason.length < 8) {
      audit("deny_override", "missing_or_terse_reason", context);
      return false;
    }

    audit("allow_override", "valid_unexpired_override", context, {
      override_reason: parsed.reason,
      age_ms: age,
    });
    return true;
  } catch (_e) {
    // ANY error path returns false. Cannot read the file → no override.
    // Cannot parse the JSON → no override. The consuming hook then
    // applies its normal logic, which fails closed if the underlying
    // check is unsatisfied.
    audit("deny_override", "override_unreadable_or_unparsable", context);
    return false;
  }
}

module.exports = { overrideActive };

// Standalone smoke-test mode. Allows manual verification:
//
//   echo '{"context":{"agent_depth":0,"agent_id":"agent-orchestrator"}}' \
//     | node override-pattern.example.js
//
// Prints "ACTIVE" or "INACTIVE" to stdout. Useful for confirming the
// override file is wired correctly without running through the full hook
// stack.
if (require.main === module) {
  try {
    const raw = fs.readFileSync(0, "utf8");
    const payload = JSON.parse(raw);
    const ok = overrideActive(payload.context || {});
    process.stdout.write(ok ? "ACTIVE\n" : "INACTIVE\n");
    process.exit(0);
  } catch (_e) {
    // Smoke-test mode also fails closed: bad input → exit 2, not exit 0.
    process.exit(2);
  }
}

/*
 * USAGE
 * -----
 *
 * 1. Settings wiring. This module is NOT registered directly as a hook —
 *    it's a library that other PreToolUse hooks import. Example consumer
 *    pattern in a gating hook:
 *
 *      const { overrideActive } = require("./override-pattern.js");
 *      // ... in main(), before issuing exit(2) on a block:
 *      if (overrideActive(payload.context)) {
 *        audit("allow", "operator_override", payload);
 *        process.exit(0);
 *      }
 *
 *    Use sparingly — every consuming hook that calls overrideActive
 *    introduces an escape hatch, and escape hatches accumulate trust
 *    debt.
 *
 * 2. Environment variables read:
 *      OVERRIDE_FILE  — JSON file with shape {issued_at, reason}
 *      AUDIT_LOG      — JSONL append target for override consultations
 *
 * 3. Override file format:
 *      {
 *        "issued_at": "2026-04-24T15:30:00Z",
 *        "reason":    "production rollback — incident #4218"
 *      }
 *
 *    Operator creates this file, override is valid for 15 minutes from
 *    issued_at, then expires automatically. Operator should delete the
 *    file after the override is consumed; the hook will treat it as
 *    expired anyway, but leaving it around clutters audits.
 *
 * 4. Subagent example. A subagent (agent_depth=1) somehow reaches a
 *    consuming hook that calls overrideActive. The function returns
 *    false immediately, the audit log records:
 *
 *      {"hook":"override-pattern","decision":"deny_override",
 *       "reason":"subagent_does_not_inherit","agent_depth":1,...}
 *
 *    The consuming hook then issues its normal block. The override path
 *    is unreachable from a subagent context by design.
 */
