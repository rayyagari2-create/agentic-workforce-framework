#!/usr/bin/env node
"use strict";

/*
 * check-agent-spawn.example.js
 *
 * USAGE
 * -----
 *
 * Pre-spawn manifest validation. Fires on PreToolUse for the Agent / Task /
 * SpawnAgent primitives. Implements the eight-step sidecar verification:
 *
 *   1. Read tool_input.description
 *   2. Regex-extract taskId from the [MANIFEST:<taskId>] tag
 *   3. Read {MANIFEST_DIR}/<taskId>.json (env MANIFEST_DIR, default
 *      docs/manifests/)
 *   4. Verify manifest.sessionId matches top-level payload.session_id
 *   5. Verify manifest file mtime is under 60 seconds (manifest must be
 *      freshly minted by the orchestrator immediately before the spawn)
 *   6. Verify manifest.intendedAgent matches tool_input.subagent_type
 *   7. Verify manifest.promptHash matches SHA-256 of tool_input.prompt
 *   8. Fail closed (exit 2) on any check failure with a descriptive
 *      stderr message; exit 0 only on full validation
 *
 * Why a sidecar instead of inline fields. Claude Code does not give hooks a
 * way to assert "the orchestrator intended this exact spawn." The sidecar
 * manifest is written by the orchestrator one step before the Agent call,
 * carries the intended role and a hash of the intended prompt, and is
 * cross-checked here. Without this, a prompt-injection that rewrites the
 * agent's reasoning could spawn an arbitrary subagent and the hook layer
 * would have no way to tell.
 *
 * Settings wiring. In .claude/settings.json:
 *
 *   {
 *     "hooks": {
 *       "PreToolUse": [
 *         {
 *           "matcher": "Agent|Task|SpawnAgent",
 *           "hooks": [
 *             {
 *               "type": "command",
 *               "command": "node /abs/path/to/check-agent-spawn.example.js"
 *             }
 *           ]
 *         }
 *       ]
 *     }
 *   }
 *
 * Environment variables:
 *   MANIFEST_DIR   directory containing <taskId>.json sidecars
 *                  (default: docs/manifests/, resolved against payload.cwd)
 *   AUDIT_LOG      JSONL append target for decision audit
 *   MANIFEST_MAX_AGE_MS  override the 60s freshness window (default 60000)
 *
 * Exit codes:
 *   0   spawn permitted; all eight checks passed
 *   2   spawn denied; stderr carries the reason for the agent to read
 *
 * Manifest file shape (sidecar JSON):
 *
 *   {
 *     "taskId":        "<taskId>",
 *     "sessionId":     "<uuid matching Claude Code session_id>",
 *     "intendedAgent": "<subagent role expected on this spawn>",
 *     "promptHash":    "<SHA-256 hex of the intended prompt>"
 *   }
 *
 * Any extra fields are ignored by this hook.
 */

const fs = require("fs");
const path = require("path");
const {
  normalize,
  sha256Hex,
} = require("../utils/normalize-claude-code-payload.example.js");

const AUDIT_LOG = process.env.AUDIT_LOG || "{path/to/your/audit-log.jsonl}";
const DEFAULT_MANIFEST_DIR = "docs/manifests/";
const MANIFEST_MAX_AGE_MS = Number(process.env.MANIFEST_MAX_AGE_MS || 60000);

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
          session_id: payload && payload.session_id,
          tool_use_id: payload && payload.tool_use_id,
        },
        extra || {}
      )
    );
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    // Audit failure must not flip the decision.
  }
}

function deny(message, payload, reason, extra) {
  audit("block", reason, payload, extra);
  process.stderr.write(`Spawn denied: ${message}\n`);
  process.exit(2);
}

function resolveManifestDir(payloadCwd) {
  const configured = process.env.MANIFEST_DIR;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(payloadCwd || process.cwd(), configured);
  }
  return path.resolve(payloadCwd || process.cwd(), DEFAULT_MANIFEST_DIR);
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
    process.stderr.write("Spawn denied: invalid JSON payload.\n");
    process.exit(2);
  }

  if (!SPAWN_TOOLS.has(payload.tool_name)) {
    audit("allow", "not_a_spawn_tool", payload);
    process.exit(0);
  }

  const ctx = normalize(payload);

  // Step 1+2: extract taskId from tool_input.description.
  if (!ctx.rawDescription) {
    deny(
      "tool_input.description is missing; cannot locate manifest tag.",
      payload,
      "missing_description"
    );
  }
  if (!ctx.taskId) {
    deny(
      "no [MANIFEST:<taskId>] tag found in tool_input.description.",
      payload,
      "missing_manifest_tag"
    );
  }

  // Step 3: read sidecar.
  const manifestDir = resolveManifestDir(payload.cwd);
  const manifestPath = path.join(manifestDir, `${ctx.taskId}.json`);

  let stat;
  try {
    stat = fs.statSync(manifestPath);
  } catch (_e) {
    deny(
      `manifest sidecar not found at ${manifestPath}.`,
      payload,
      "manifest_not_found",
      { manifestPath }
    );
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (_e) {
    deny(
      `manifest sidecar at ${manifestPath} is not valid JSON.`,
      payload,
      "manifest_invalid_json",
      { manifestPath }
    );
  }

  // Step 4: session_id parity.
  if (!payload.session_id || manifest.sessionId !== payload.session_id) {
    deny(
      "manifest.sessionId does not match payload.session_id.",
      payload,
      "session_id_mismatch",
      {
        manifestSessionId: manifest.sessionId,
        payloadSessionId: payload.session_id,
      }
    );
  }

  // Step 5: freshness window.
  const ageMs = Date.now() - stat.mtimeMs;
  if (!Number.isFinite(ageMs) || ageMs > MANIFEST_MAX_AGE_MS || ageMs < 0) {
    deny(
      `manifest is stale (age ${Math.round(ageMs)}ms exceeds ${MANIFEST_MAX_AGE_MS}ms).`,
      payload,
      "manifest_stale",
      { ageMs, maxAgeMs: MANIFEST_MAX_AGE_MS }
    );
  }

  // Step 6: intended agent matches subagent_type.
  if (
    !manifest.intendedAgent ||
    manifest.intendedAgent !== ctx.agentRole
  ) {
    deny(
      "manifest.intendedAgent does not match tool_input.subagent_type.",
      payload,
      "intended_agent_mismatch",
      {
        manifestIntendedAgent: manifest.intendedAgent,
        payloadSubagentType: ctx.agentRole,
      }
    );
  }

  // Step 7: prompt hash parity.
  const observedHash = sha256Hex(
    payload.tool_input && payload.tool_input.prompt
  );
  if (!observedHash || manifest.promptHash !== observedHash) {
    deny(
      "manifest.promptHash does not match SHA-256 of tool_input.prompt.",
      payload,
      "prompt_hash_mismatch",
      {
        manifestPromptHash: manifest.promptHash,
        observedPromptHash: observedHash,
      }
    );
  }

  audit("allow", "manifest_verified", payload, {
    taskId: ctx.taskId,
    agentRole: ctx.agentRole,
  });
  process.exit(0);
}

try {
  main();
} catch (_e) {
  // Fail-closed default. An uncaught error here would otherwise allow an
  // unverified spawn — the worst outcome this hook exists to prevent.
  process.exit(2);
}
