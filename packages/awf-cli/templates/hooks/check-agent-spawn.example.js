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
//   11. Roster check — manifest.agent_role must be in ALLOWED_AGENT_ROLES
//   12. HITL gate — riskLevel 'high' or 'critical' requires
//       hitlApproved === true
//   12b. mtime freshness — manifest file <= 60 seconds old
//   12c. promptHash — sha256(tool_input.prompt) matches sidecar
//   13. Staleness check — issuedAt within MANIFEST_TTL_MS
//   14. Strip [MANIFEST:taskId] token from description (updatedInput)
//   15. Record allow to audit trail, emit updatedInput JSON, exit 0

// USAGE
// ─────
// 1. Copy to .claude/hooks/pre-tool-use/check-agent-spawn.js
//    (remove the .example suffix). The subdirectory matters —
//    Claude Code wires this hook via the PreToolUse Agent matcher
//    pointing at this exact path.
//
// 2. Configure MANIFEST_DIR to point to your manifests folder.
//    Configure SCHEMA_PATH to point to your sidecar schema.
//
// 3. Configure ALLOWED_AGENT_ROLES with your actual roster role
//    labels. These must match the agent_role field in your sidecar
//    manifests. They do NOT match tool_input.subagent_type — that
//    field is always "general-purpose" in Claude Code.
//
// 4. Wire in hooks/claude-code-settings.example.json:
//    The PreToolUse Agent matcher runs this hook on every spawn.
//
// 5. Start with HOOK_MODE=shadow (default). Run several sessions.
//    Review violations in stderr / your audit trail.
//    Move to HOOK_MODE=enforce when manifests are stable.
//
// 6. Optionally implement the audit bridge (see AUDIT_BRIDGE).
//    Without it, violations are logged to stderr only.
//
// SUBAGENT_TYPE / AGENT_ROLE MODEL
// ────────────────────────────────
// Claude Code runtime subagent_type is always "general-purpose".
// This is the harness type — not the agent's identity.
// Framework agent identity lives in manifest.agent_role.
// The hook validates agent_role against ALLOWED_AGENT_ROLES.
// Never attempt to validate tool_input.subagent_type for identity.
//
// Dependencies: ajv, ajv-formats (optional but recommended)
//   npm install ajv ajv-formats

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// AWF_PROJECT_ROOT: set this environment variable to your repo
// root if the hook install path does not resolve correctly
// via process.cwd(). Example:
//   AWF_PROJECT_ROOT=/path/to/your/repo node .claude/hooks/...
// Defaults to process.cwd() which works when Claude Code runs
// from the repo root (the standard configuration).
const PROJECT_ROOT = process.env.AWF_PROJECT_ROOT
  || process.cwd();

const MANIFEST_DIR    = path.join(PROJECT_ROOT,
                          '{path/to/manifests}');
const SCHEMA_PATH     = path.join(PROJECT_ROOT,
                          '{path/to/manifest-sidecar-schema.json}');
const AUDIT_BRIDGE    = '../utils/audit-bridge.js';

const MANIFEST_TOKEN_RE = /\[MANIFEST:([A-Za-z0-9._-]+)\]/;

const ALLOWED_AGENT_ROLES = new Set([
  '[ORCHESTRATOR_AGENT]',
  '[SERVER_AGENT]',
  '[FRONTEND_AGENT]',
  '[QA_AGENT]',
  '[FIX_AGENT]',
  // Replace placeholders with your actual agent_role values.
  // These must match the agent_role field in your sidecar manifests.
  // They do NOT match tool_input.subagent_type which is always
  // "general-purpose" in Claude Code.
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

// AUDIT FAILURE POLICY:
// DENY decisions: audit failure logged to stderr; block stands.
// ALLOW decisions: audit failure logged to stderr; spawn proceeds.
// Rationale: failing closed on audit for ALLOW decisions would
// make every audit outage a denial-of-service attack on the
// agent workforce. The audit trail is critical but not more
// critical than operational continuity for approved spawns.

let startTime = 0;

function deny(agentRole, matchedRule, reason) {
  const latencyMs = Date.now() - startTime;
  try {
    // eslint-disable-next-line global-require
    const bridge = require(AUDIT_BRIDGE);
    if (bridge && typeof bridge.record === 'function') {
      bridge.record({
        agentName:   agentRole || '<unknown>',
        action:      'spawn',
        decision:    'block',
        matchedRule: matchedRule,
        reasoning:   reason,
        latencyMs:   latencyMs,
        mode:        HOOK_MODE,
      });
    }
  } catch (_e) {
    // Audit write failed. In enforce mode, the block decision
    // still stands — we do not unblock because audit failed.
    // But operators must know audit is broken.
    console.error(
      `[check-agent-spawn] WARNING: audit write failed for DENY ` +
      `decision. The spawn is still blocked. Investigate audit ` +
      `bridge availability. Rule: ${matchedRule}`
    );
  }
  if (ENFORCE) {
    console.error(
      `[check-agent-spawn] BLOCKED ${matchedRule}: ${reason}`
    );
    process.exit(2);
  } else {
    console.error(
      `[check-agent-spawn] SHADOW VIOLATION ${matchedRule}: ${reason}`
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
      'unknown',
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
      'unknown',
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
      'unknown',
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
        manifest.agent_role,
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
        manifest.agent_role,
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
        'taskId', 'session_id', 'runtime_subagent_type', 'agent_role',
        'riskLevel', 'domains', 'riskClass', 'hitlApproved', 'issuedAt',
        'promptHash',
      ];
      const missing = REQUIRED.filter(f => !(f in manifest));
      if (missing.length) {
        deny(
          manifest.agent_role,
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
  // environment. In that case, the mtime check (Step 12b) is the
  // primary freshness gate.
  if (
    manifest.session_id !== 'session-id-unavailable' &&
    manifest.session_id !== input.session_id
  ) {
    deny(
      manifest.agent_role,
      'deny-session-id-mismatch',
      `Manifest session_id does not match runtime session_id. ` +
      `Possible replay or stale manifest.`
    );
    return;
  }

  // ── Step 11: Roster check ──────────────────────────────────────
  //
  // Validate manifest.agent_role — the framework identity field.
  // Do NOT validate tool_input.subagent_type here. In Claude Code,
  // tool_input.subagent_type is always "general-purpose" regardless
  // of which agent is spawning. The real identity lives in
  // manifest.agent_role.
  if (!ALLOWED_AGENT_ROLES.has(manifest.agent_role)) {
    deny(
      manifest.agent_role,
      'deny-out-of-roster',
      `agent_role '${manifest.agent_role}' is not in the approved ` +
      `roster: [${[...ALLOWED_AGENT_ROLES].join(', ')}]`
    );
    return;
  }

  // Step 12: HITL gate.
  if (
    HITL_REQUIRED_RISK_LEVELS.has(manifest.riskLevel) &&
    manifest.hitlApproved !== true
  ) {
    deny(
      manifest.agent_role,
      'deny-hitl-not-approved',
      `riskLevel '${manifest.riskLevel}' requires hitlApproved=true; ` +
      `manifest has hitlApproved=${JSON.stringify(manifest.hitlApproved)}.`
    );
    return;
  }

  // ── Step 12b: mtime freshness check ───────────────────────────
  //
  // File mtime is external filesystem evidence — harder to spoof
  // than a JSON field. An attacker can copy a valid sidecar JSON
  // with a future issuedAt; they cannot easily fake the file mtime.
  //
  // In ENFORCE mode: manifest file must be <= 60 seconds old.
  // This is the primary replay-protection gate.
  //
  // In SHADOW mode: mtime violation logged but does not block.
  //
  // Combined with issuedAt TTL (Step 13), this gives two independent
  // freshness signals: one from the filesystem, one from the payload.
  //
  // Configure MANIFEST_MTIME_MAX_AGE_MS for your environment.
  // 60 seconds is recommended for enforce mode.
  // Raise to 120 seconds if orchestrator-to-spawn latency is high.

  const MANIFEST_MTIME_MAX_AGE_MS = 60 * 1000; // 60 seconds

  try {
    const stat = fs.statSync(manifestPath);
    const mtimeAgeMs = Date.now() - stat.mtimeMs;
    if (mtimeAgeMs > MANIFEST_MTIME_MAX_AGE_MS) {
      deny(
        manifest.agent_role || 'unknown',
        'deny-manifest-mtime-stale',
        `Manifest file mtime is ${Math.round(mtimeAgeMs / 1000)}s old. ` +
        `Maximum allowed: ${MANIFEST_MTIME_MAX_AGE_MS / 1000}s. ` +
        `Re-issue the manifest sidecar before spawning.`
      );
      return;
    }
  } catch (_e) {
    deny(
      manifest.agent_role || 'unknown',
      'deny-manifest-mtime-unreadable',
      `Cannot stat manifest file for mtime check: ${manifestPath}`
    );
    return;
  }

  // ── Step 12c: promptHash validation ───────────────────────────
  //
  // The Orchestrator computes sha256(tool_input.prompt) when
  // writing the sidecar. The hook recomputes it and compares.
  // A mismatch means the prompt was modified after the sidecar
  // was issued — a tamper signal.
  //
  // This is the primary prompt injection defense at the hook layer.
  // The hook validates independently of the prompt body.
  //
  // If promptHash is absent from the manifest, fail closed in
  // enforce mode — the field is required by the sidecar schema.

  const actualPromptHash = crypto
    .createHash('sha256')
    .update(toolInput.prompt || '')
    .digest('hex');

  if (manifest.promptHash !== actualPromptHash) {
    deny(
      manifest.agent_role || 'unknown',
      'deny-prompt-hash-mismatch',
      `Prompt hash mismatch. Sidecar: ${(manifest.promptHash || '').slice(0, 16)}... ` +
      `Actual: ${actualPromptHash.slice(0, 16)}... ` +
      `The spawn prompt may have been modified after the sidecar was issued.`
    );
    return;
  }

  // Step 13: staleness check.
  const issuedAtMs = Date.parse(manifest.issuedAt);
  if (!Number.isFinite(issuedAtMs)) {
    deny(
      manifest.agent_role,
      'deny-issuedAt-unparseable',
      `Manifest issuedAt '${manifest.issuedAt}' is not a parseable date.`
    );
    return;
  }
  const ageMs = Date.now() - issuedAtMs;
  if (ageMs > MANIFEST_TTL_MS || ageMs < 0) {
    deny(
      manifest.agent_role,
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
    // eslint-disable-next-line global-require
    const bridge = require(AUDIT_BRIDGE);
    if (bridge && typeof bridge.record === 'function') {
      bridge.record({
        agentName:   manifest.agent_role,
        action:      'spawn',
        decision:    'allow',
        matchedRule: 'allow-manifest-validated',
        reasoning:   `agent_role=${manifest.agent_role} taskId=${taskId} ` +
                     `validated against schema, roster, mtime, ` +
                     `promptHash, HITL, TTL.`,
        latencyMs:   Date.now() - startTime,
        mode:        HOOK_MODE,
      });
    }
  } catch (_e) {
    console.error(
      `[check-agent-spawn] WARNING: audit write failed for ALLOW ` +
      `decision. Spawn is proceeding. Investigate audit bridge.`
    );
    // In enforce mode: allow proceeds but audit failure is logged.
    // Do not block a legitimate spawn because audit is unavailable.
    // This is the correct tradeoff: availability > audit completeness
    // for allow decisions; audit completeness > availability for
    // deny decisions (already handled in deny()).
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
