#!/usr/bin/env node
"use strict";

// 15-step manifest validation flow:
//   1.  Start timer
//   2.  Read + parse stdin (fail closed in ENFORCE; fail open in SHADOW)
//   3.  Guard: tool_name must be 'Agent' — exit 0 otherwise
//   4.  Extract tool_input.description
//   5.  Detect [MANIFEST:taskId] token — risk-tiered fail-safe if missing
//   6.  Extract taskId from token
//   7.  Resolve manifest path: {path/to/manifests}/<taskId>.json
//   8.  Read manifest file — block if missing
//   9.  Parse manifest JSON — block if malformed
//   10. AJV validate against manifest sidecar schema — block if invalid
//   11. Roster check — subagent_type must be in ALLOWED_SUBAGENT_TYPES
//   12. HITL gate — riskLevel 'high' or 'critical' requires
//       hitlApproved === true
//   13. Staleness check — issuedAt within MANIFEST_TTL_MS
//   14. Strip [MANIFEST:taskId] token from description (updatedInput)
//   15. Record allow to audit trail, emit updatedInput JSON, exit 0

// USAGE
// ─────
// 1. Copy to .claude/hooks/pre-tool-use/check-agent-spawn.js
//    (remove the .example suffix).
//
// 2. Configure MANIFEST_DIR to point to your manifests folder.
//    Configure SCHEMA_PATH to point to your sidecar schema.
//
// 3. Configure ALLOWED_SUBAGENT_TYPES with your actual roster
//    role labels. These must match the subagent_type values your
//    orchestrator writes into sidecar manifests.
//
// 4. Wire in hooks/claude-code-settings.example.json:
//    The PreToolUse Agent matcher runs this hook on every spawn.
//
// 5. Start with HOOK_MODE=shadow (default). Run several sessions.
//    Review violations in stderr / your audit trail.
//    Move to HOOK_MODE=enforce when manifests are stable.
//
// 6. Optionally implement the audit bridge (see auditRecord helper).
//    Without it, violations are logged to stderr only.
//
// Dependencies: ajv, ajv-formats (optional but recommended)
//   npm install ajv ajv-formats

const fs   = require('fs');
const path = require('path');

const PROJECT_ROOT    = path.resolve(__dirname, '..', '..');
const MANIFEST_DIR    = path.join(PROJECT_ROOT,
                          '{path/to/manifests}');
const SCHEMA_PATH     = path.join(PROJECT_ROOT,
                          '{path/to/manifest-sidecar-schema.json}');

const MANIFEST_TOKEN_RE = /\[MANIFEST:([A-Za-z0-9._-]+)\]/;

const ALLOWED_SUBAGENT_TYPES = new Set([
  '[ORCHESTRATOR_AGENT]',
  '[SERVER_AGENT]',
  '[FRONTEND_AGENT]',
  '[QA_AGENT]',
  '[FIX_AGENT]',
  // Replace placeholders with your actual roster role labels.
  // Must match the subagent_type values written into your sidecar manifests.
]);

const HITL_REQUIRED_RISK_LEVELS = new Set(['high', 'critical']);

// Manifest TTL — reject manifests older than this.
// 30 minutes is the recommended default. Lower for higher-security
// environments.
const MANIFEST_TTL_MS = 30 * 60 * 1000;

// HOOK_MODE controls enforcement level:
//   shadow  (default) — violations logged, hook exits 0 (warn, don't block)
//   enforce            — violations block spawn with exit(2)
// Set via environment variable: HOOK_MODE=enforce
// Start in shadow mode. Move to enforce once manifests are stable.
const HOOK_MODE = (process.env.HOOK_MODE || 'shadow').toLowerCase();
const ENFORCE   = HOOK_MODE === 'enforce';

let startTime = 0;

function auditRecord(rec) {
  // Audit-trail bridge. Wrapped in try/catch — bridge may not be present.
  // bridge.record({ agentName, action, decision, matchedRule,
  //   reasoning, latencyMs, mode }) — implement for your runtime
  try {
    // eslint-disable-next-line global-require
    const bridge = require('../utils/audit-bridge.js');
    if (bridge && typeof bridge.record === 'function') {
      bridge.record(rec);
    }
  } catch (_e) {
    // No bridge available; violations remain logged to stderr.
  }
}

function deny(subagentType, matchedRule, reason) {
  const latencyMs = Date.now() - startTime;
  try {
    auditRecord({
      agentName:   subagentType || '<unknown>',
      action:      'spawn',
      decision:    'block',
      matchedRule: matchedRule,
      reasoning:   reason,
      latencyMs:   latencyMs,
      mode:        HOOK_MODE,
    });
  } catch (_e) {
    // never throw from deny()
  }
  if (ENFORCE) {
    process.stderr.write(
      `[check-agent-spawn] BLOCK ${matchedRule}: ${reason}\n`
    );
    process.exit(2);
  } else {
    process.stderr.write(
      `[check-agent-spawn] SHADOW VIOLATION ${matchedRule}: ${reason}\n`
    );
    process.exit(0);
  }
}

function main() {
  // Step 1: start timer.
  startTime = Date.now();

  // ── Step 2: Read + parse stdin ──────────────────────────────────
  //
  // Agent-scoped matcher: this hook is wired only to the Agent tool
  // via the PreToolUse matcher in claude-code-settings.example.json.
  //
  // In ENFORCE mode: any stdin read or parse failure is treated as
  // an enforcement failure — exit(2). We cannot verify what we
  // cannot read, and an unreadable Agent spawn payload must block.
  //
  // In SHADOW mode: stdin failures exit(0) with a warning. Shadow
  // mode is for validation, not enforcement.
  //
  // If this hook is ever rewired to a broader matcher (all tools),
  // revisit this behavior: non-Agent payloads may legitimately
  // produce unreadable stdin and should not block in that context.
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (_e) {
    if (ENFORCE) {
      console.error('[check-agent-spawn] BLOCKED: stdin unreadable in enforce mode. Cannot verify Agent spawn.');
      process.exit(2);
    }
    process.exit(0);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (_e) {
    if (ENFORCE) {
      console.error('[check-agent-spawn] BLOCKED: stdin not valid JSON in enforce mode. Cannot verify Agent spawn.');
      process.exit(2);
    }
    process.exit(0);
  }

  // Step 3: guard tool_name === 'Agent'.
  if (!input || input.tool_name !== 'Agent') {
    process.exit(0);
  }

  const toolInput = input.tool_input || {};

  // Step 4: extract tool_input.description.
  const description = typeof toolInput.description === 'string'
    ? toolInput.description
    : '';

  // Step 5: detect [MANIFEST:taskId] token. Risk-tiered fail-safe —
  // without a token there is no manifest to validate against, so we
  // cannot prove the spawn was intended by the orchestrator.
  const tokenMatch = description.match(MANIFEST_TOKEN_RE);
  if (!tokenMatch) {
    deny(
      toolInput.subagent_type,
      'deny-missing-manifest-token',
      'Agent spawn missing [MANIFEST:taskId] token in description.'
    );
    return;
  }

  // Step 6: extract taskId from token.
  const taskId = tokenMatch[1];

  // Step 7: resolve manifest path.
  const manifestPath = path.join(MANIFEST_DIR, `${taskId}.json`);

  // Step 8: read manifest file.
  let manifestRaw;
  try {
    manifestRaw = fs.readFileSync(manifestPath, 'utf8');
  } catch (_e) {
    deny(
      toolInput.subagent_type,
      'deny-manifest-not-found',
      `Manifest file not found: ${manifestPath}`
    );
    return;
  }

  // Step 9: parse manifest JSON.
  let manifest;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (_e) {
    deny(
      toolInput.subagent_type,
      'deny-manifest-malformed',
      `Manifest file is not valid JSON: ${manifestPath}`
    );
    return;
  }

  // Step 10: AJV schema validation.
  // AJV validates the full sidecar manifest against your schema.
  // Schema path is configured in SCHEMA_PATH above.
  // To generate the schema: define your manifest shape and run
  // a JSON Schema generator, or hand-author from the fields list.
  try {
    // eslint-disable-next-line global-require
    const Ajv        = require('ajv');
    // eslint-disable-next-line global-require
    const addFormats = require('ajv-formats');

    let schemaJson;
    try {
      schemaJson = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
    } catch (_e) {
      deny(
        manifest.subagent_type,
        'deny-schema-unreadable',
        `Schema file unreadable at ${SCHEMA_PATH}.`
      );
      return;
    }

    const ajv      = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(schemaJson);
    const valid    = validate(manifest);
    if (!valid) {
      const errs = (validate.errors || [])
        .map(e => `${e.instancePath || '/'} ${e.message}`)
        .join('; ');
      deny(
        manifest.subagent_type,
        'deny-schema-invalid',
        `Manifest failed schema validation: ${errs}`
      );
      return;
    }
  } catch (e) {
    if (e && e.code === 'MODULE_NOT_FOUND') {
      // Required fields check when AJV is unavailable.
      // Install ajv and ajv-formats for full schema enforcement.
      const REQUIRED = [
        'taskId', 'session_id', 'subagent_type', 'riskLevel',
        'domains', 'riskClass', 'hitlApproved', 'issuedAt',
        'promptHash', 'tool_use_id',
      ];
      const missing = REQUIRED.filter(f => !(f in manifest));
      if (missing.length) {
        deny(
          manifest.subagent_type,
          'deny-schema-invalid-fallback',
          `Manifest missing required fields: ${missing.join(', ')}`
        );
        return;
      }
    } else {
      throw e;
    }
  }

  // session_id validation — supplementary check.
  // The sentinel value 'session-id-unavailable' is written when the
  // orchestrator cannot retrieve the runtime session_id from the
  // environment. In that case, the TTL/issuedAt check (Step 13) is
  // the primary freshness gate.
  if (
    manifest.session_id !== 'session-id-unavailable' &&
    manifest.session_id !== input.session_id
  ) {
    deny(
      manifest.subagent_type,
      'deny-session-id-mismatch',
      `Manifest session_id does not match runtime session_id. ` +
      `Possible replay or stale manifest.`
    );
    return;
  }

  // Step 11: roster check.
  if (!ALLOWED_SUBAGENT_TYPES.has(manifest.subagent_type)) {
    deny(
      manifest.subagent_type,
      'deny-roster-not-allowed',
      `subagent_type '${manifest.subagent_type}' is not in ` +
      `ALLOWED_SUBAGENT_TYPES.`
    );
    return;
  }

  // Step 12: HITL gate.
  if (
    HITL_REQUIRED_RISK_LEVELS.has(manifest.riskLevel) &&
    manifest.hitlApproved !== true
  ) {
    deny(
      manifest.subagent_type,
      'deny-hitl-not-approved',
      `riskLevel '${manifest.riskLevel}' requires hitlApproved=true; ` +
      `manifest has hitlApproved=${JSON.stringify(manifest.hitlApproved)}.`
    );
    return;
  }

  // Step 13: staleness check.
  const issuedAtMs = Date.parse(manifest.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    deny(
      manifest.subagent_type,
      'deny-issuedAt-unparseable',
      `Manifest issuedAt '${manifest.issuedAt}' is not a parseable date.`
    );
    return;
  }
  const ageMs = Date.now() - issuedAtMs;
  if (ageMs > MANIFEST_TTL_MS || ageMs < 0) {
    deny(
      manifest.subagent_type,
      'deny-manifest-stale',
      `Manifest age ${ageMs}ms exceeds MANIFEST_TTL_MS ${MANIFEST_TTL_MS}ms.`
    );
    return;
  }

  // Step 14: strip [MANIFEST:taskId] token from description.
  const strippedDescription = description
    .replace(MANIFEST_TOKEN_RE, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Step 15: record allow + emit updatedInput + exit 0.
  try {
    auditRecord({
      agentName:   manifest.subagent_type,
      action:      'spawn',
      decision:    'allow',
      matchedRule: 'allow-manifest-validated',
      reasoning:   `taskId=${taskId} validated against schema, roster, ` +
                   `HITL, TTL.`,
      latencyMs:   Date.now() - startTime,
      mode:        HOOK_MODE,
    });
  } catch (_e) {
    // never block on audit failure
  }

  // Emit updatedInput to strip the [MANIFEST:taskId] token before
  // the Task tool passes the prompt to the spawned agent.
  // The agent never sees the token — it is a hook contract only.
  if (strippedDescription !== description) {
    process.stdout.write(
      JSON.stringify({
        updatedInput: Object.assign({}, toolInput,
          { description: strippedDescription }),
      })
    );
  }

  process.exit(0);
}

try {
  main();
} catch (e) {
  // Uncaught error — fail closed in enforce, fail open in shadow.
  if (ENFORCE) {
    process.stderr.write(
      `[check-agent-spawn] FATAL: ${e && e.message}\n`
    );
    process.exit(2);
  } else {
    process.stderr.write(
      `[check-agent-spawn] SHADOW FATAL: ${e && e.message}\n`
    );
    process.exit(0);
  }
}
