#!/usr/bin/env node
"use strict";

// override-pattern.example.js
//
// Operator override pattern.
//
// Sometimes the operator needs to bypass a hook for a single call (a
// production fire, a one-off recovery, an explicitly out-of-policy
// experiment). The override pattern provides a safe, time-bounded escape
// hatch.
//
// Invariants:
//   1. TTL-bounded: an override is valid only for a short window
//      (default 15 minutes from creation).
//   2. Audited on every use: every call that consults the override writes
//      an audit entry, regardless of allow/block decision.
//   3. Subagents do not inherit override authority. Override applies only
//      at agent_depth === 0 (the orchestrator).
//   4. Fail-closed: if the override file cannot be read, parsed, or its
//      timestamp cannot be validated, the override is treated as absent
//      and the call proceeds to normal hook logic (which itself fails
//      closed by default).
//
// This file is a TEMPLATE. Real hooks call into this logic; they do not
// trust the file directly.

const fs = require("fs");

const OVERRIDE_FILE = ".agent-workspace/operator-override.json";
const OVERRIDE_AUDIT = ".agent-workspace/audit-log.jsonl";
const TTL_MS = 15 * 60 * 1000; // 15 minutes

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
    fs.appendFileSync(OVERRIDE_AUDIT, line + "\n", { flag: "a" });
  } catch (_e) {
    /* swallow audit error */
  }
}

/**
 * Returns true if a valid operator override is active for this caller.
 * Returns false otherwise. Never throws — fail-closed by returning false.
 *
 * @param {object} context  the hook input's context object
 */
function overrideActive(context) {
  try {
    if (!context || context.agent_depth !== 0) {
      // Subagents do not inherit override.
      audit("deny_override", "subagent_does_not_inherit", context);
      return false;
    }

    const raw = fs.readFileSync(OVERRIDE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    const issuedAt = Date.parse(parsed.issued_at);
    if (!Number.isFinite(issuedAt)) {
      audit("deny_override", "issued_at_invalid", context);
      return false;
    }

    const age = Date.now() - issuedAt;
    if (age < 0 || age > TTL_MS) {
      audit("deny_override", "ttl_expired", context, { age_ms: age });
      return false;
    }

    if (typeof parsed.reason !== "string" || parsed.reason.length < 8) {
      // Override must include a human-readable reason (operator's note).
      audit("deny_override", "missing_reason", context);
      return false;
    }

    audit("allow_override", "valid_unexpired_override", context, {
      override_reason: parsed.reason,
      age_ms: age,
    });
    return true;
  } catch (_e) {
    audit("deny_override", "override_unreadable_or_unparsable", context);
    return false;
  }
}

module.exports = { overrideActive };

// Allow manual smoke testing:
//   echo '{"context":{"agent_depth":0,"agent_id":"agent-orchestrator"}}' \
//     | node hooks/utils/override-pattern.example.js
if (require.main === module) {
  try {
    const raw = fs.readFileSync(0, "utf8");
    const payload = JSON.parse(raw);
    const ok = overrideActive(payload.context || {});
    process.stdout.write(ok ? "ACTIVE\n" : "INACTIVE\n");
    process.exit(0);
  } catch (_e) {
    process.exit(2);
  }
}
