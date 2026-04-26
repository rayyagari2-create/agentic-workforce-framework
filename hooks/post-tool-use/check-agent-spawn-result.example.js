#!/usr/bin/env node
"use strict";

// USAGE
// ─────
// 1. Copy to .claude/hooks/post-tool-use/check-agent-spawn-result.js
//    (remove the .example suffix). The subdirectory matters —
//    Claude Code wires this hook via the PostToolUse Agent matcher
//    pointing at this exact path.
//
// 2. Configure MANIFEST_DIR to point to your manifests folder.
//
// 3. This hook is audit-only. It cannot block after the fact.
//    PostToolUse fires after the Task tool returns. Use the outcome
//    record to detect patterns: which agent roles fail most often,
//    which risk classes produce failures, whether outcomes correlate
//    with trust scores.
//
// 4. Wire via hooks/claude-code-settings.example.json:
//    PostToolUse Agent matcher runs this after every spawn completes.
//
// 5. Implement the audit bridge to persist outcome records.

// PostToolUse Agent — outcome recorder. Always exits 0.
//
// PostToolUse payload shape (Claude Code):
//   {
//     tool_name:     "Agent",
//     tool_input:    { description, prompt, subagent_type },
//     tool_response: { output, error },
//     session_id:    "abc123"
//   }
//
// Outcome determination:
//   tool_response.error present  → 'failure'
//   tool_response.output present → 'success'
//   neither                      → 'unknown'
//
// Manifest correlation: try [MANIFEST:taskId] token in description
// first (PostToolUse receives original tool_input before token
// stripping). Fall back to session_id scan if token not found.

const fs   = require('fs');
const path = require('path');

// AWF_PROJECT_ROOT: set this environment variable to your repo
// root if the hook install path does not resolve correctly
// via process.cwd(). Example:
//   AWF_PROJECT_ROOT=/path/to/your/repo node .claude/hooks/...
// Defaults to process.cwd() which works when Claude Code runs
// from the repo root (the standard configuration).
const PROJECT_ROOT       = process.env.AWF_PROJECT_ROOT
  || process.cwd();
const MANIFEST_DIR       = path.join(PROJECT_ROOT, '{path/to/manifests}');
const HOOK_MODE          = (process.env.HOOK_MODE || 'shadow').toLowerCase();
const OUTPUT_SUMMARY_MAX = 200; // chars of output to include in reasoning

const MANIFEST_TOKEN_RE  = /\[MANIFEST:([A-Za-z0-9._-]+)\]/;

function main() {
  // Step 1: start timer.
  const startMs = Date.now();

  // Step 2: read + parse stdin — exit 0 on error.
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (_e) {
    process.exit(0);
  }
  let input;
  try {
    input = JSON.parse(raw);
  } catch (_e) {
    process.exit(0);
  }

  // Step 3: guard — exit 0 if tool_name !== 'Agent'.
  if (!input || input.tool_name !== 'Agent') {
    process.exit(0);
  }

  // Step 4: extract toolInput, toolResponse, sessionId, description.
  const toolInput    = input.tool_input    || {};
  const toolResponse = input.tool_response || {};
  const sessionId    = input.session_id    || '<unknown>';
  const description  = typeof toolInput.description === 'string'
    ? toolInput.description
    : '';

  // Step 5: determine outcome.
  const hasError = !!toolResponse.error;
  const outcome  = hasError
    ? 'failure'
    : toolResponse.output !== undefined
      ? 'success'
      : 'unknown';

  // Step 6: build outputSummary.
  // Output summary is truncated and must not contain PII.
  // Review your agent output patterns before enabling in production.
  let outputSummary;
  try {
    const src = hasError ? toolResponse.error : toolResponse.output;
    const str = typeof src === 'string' ? src : JSON.stringify(src);
    outputSummary = (str || '')
      .slice(0, OUTPUT_SUMMARY_MAX)
      .replace(/\n+/g, ' ');
  } catch (_e) {
    outputSummary = '[unserializable]';
  }

  // Step 7: manifest correlation — token first.
  let correlatedManifest = null;
  let resolvedTaskId     = null;

  const tokenMatch = description.match(MANIFEST_TOKEN_RE);
  if (tokenMatch) {
    resolvedTaskId = tokenMatch[1];
    const manifestPath = path.join(MANIFEST_DIR, `${resolvedTaskId}.json`);
    try {
      correlatedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_e) {
      correlatedManifest = null;
    }
  }

  // Step 8: fallback — session_id scan.
  if (!correlatedManifest && sessionId && sessionId !== '<unknown>') {
    try {
      const entries = fs.readdirSync(MANIFEST_DIR);
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const full = path.join(MANIFEST_DIR, entry);
        let parsed;
        try {
          parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
        } catch (_e) {
          continue;
        }
        if (parsed && parsed.session_id === sessionId) {
          correlatedManifest = parsed;
          resolvedTaskId     = parsed.taskId || resolvedTaskId;
          break;
        }
      }
    } catch (_e) {
      // MANIFEST_DIR unreadable — leave correlatedManifest null.
    }
  }

  // Step 9: build reasoning string.
  const taskId    = resolvedTaskId
    || (correlatedManifest && correlatedManifest.taskId)
    || 'unresolved';
  const riskLevel = (correlatedManifest && correlatedManifest.riskLevel) || 'unresolved';
  const riskClass = (correlatedManifest && correlatedManifest.riskClass) || 'unresolved';
  const reasoning =
    `outcome=${outcome} taskId=${taskId} sessionId=${sessionId} ` +
    `riskLevel=${riskLevel} riskClass=${riskClass} ` +
    `outputSummary=${outputSummary} mode=${HOOK_MODE}`;

  // Step 10: record to audit bridge.
  const agentName = correlatedManifest
    ? correlatedManifest.subagent_type
    : 'unknown';

  // Step 11: wrap in try/catch — never block on audit failure.
  try {
    // bridge.record({
    //   agentName:   agentName,
    //   action:      'agent_spawn_completed',
    //   decision:    outcome,
    //   matchedRule: 'postspawn-outcome-recorder',
    //   reasoning:   reasoning,
    //   latencyMs:   Date.now() - startMs,
    //   mode:        HOOK_MODE,
    // }) — implement for your runtime.
    // Without an audit bridge, outcome records are not persisted.
    void agentName;
    void reasoning;
    void startMs;
  } catch (_e) {
    // never block on audit failure
  }

  // Step 12: process.exit(0) always.
  process.exit(0);
}

try {
  main();
} catch (_e) {
  // PostToolUse outcome recorder cannot block. Always exit 0.
  process.exit(0);
}
