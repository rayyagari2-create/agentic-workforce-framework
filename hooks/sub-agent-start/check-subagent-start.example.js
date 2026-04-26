#!/usr/bin/env node
"use strict";

// USAGE
// ─────
// 1. Copy to .claude/hooks/sub-agent-start/check-subagent-start.js
//    (remove the .example suffix). The subdirectory matters —
//    Claude Code wires this hook via the SubagentStart matcher
//    pointing at this exact path.
//
// 2. Configure MANIFEST_DIR to point to your manifests folder.
//
// 3. This hook is audit-only. It cannot block spawns.
//    SubagentStart fires after PreToolUse — the spawn is already
//    approved. This hook records the start event for full
//    lifecycle coverage: PreToolUse → SubagentStart → PostToolUse.
//
// 4. Wire via hooks/claude-code-settings.example.json:
//    SubagentStart matcher (empty string) runs this on all subagents.
//
// 5. Implement the audit bridge to persist records.
//    Without it, correlation results are discarded silently.

// SubagentStart CANNOT block. Audit-only. Always exits 0.
//
// SubagentStart payload shape (Claude Code):
//   {
//     hook_event_name: "SubagentStart",
//     session_id:      "abc123",
//     transcript_path: "~/.claude/projects/.../session.jsonl",
//     agent_id:        "agent-abc123",
//     agent_type:      "general-purpose"
//   }
//
// Correlation strategy: match manifest by session_id.
// agent_type is always "general-purpose" for orchestrator Task spawns
// and is not a useful discriminating field.
//
// If multiple manifests share a session_id (batched spawns), the most
// recently issued manifest is selected (sort by issuedAt descending).

const fs   = require('fs');
const path = require('path');

// AWF_PROJECT_ROOT: set this environment variable to your repo
// root if the hook install path does not resolve correctly
// via process.cwd(). Example:
//   AWF_PROJECT_ROOT=/path/to/your/repo node .claude/hooks/...
// Defaults to process.cwd() which works when Claude Code runs
// from the repo root (the standard configuration).
const PROJECT_ROOT = process.env.AWF_PROJECT_ROOT
  || process.cwd();
const MANIFEST_DIR = path.join(PROJECT_ROOT, '{path/to/manifests}');
const HOOK_MODE    = (process.env.HOOK_MODE || 'shadow').toLowerCase();

function main() {
  // Step 1: start timer.
  const startMs = Date.now();

  // Step 2: read + parse stdin — exit 0 on any error (fail open).
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

  // Step 3: guard — exit 0 if input is null.
  if (!input) {
    process.exit(0);
  }

  // Step 4: extract identifiers from payload.
  const agentId   = input.agent_id   || '<unknown>';
  const agentType = input.agent_type || '<unknown>';
  const sessionId = input.session_id || '<unknown>';

  // Step 5–9: scan MANIFEST_DIR for .json files and correlate by
  // session_id.
  let correlatedManifest  = null;
  let correlationStatus   = 'no-match';
  const matches = [];

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
        matches.push(parsed);
      }
    }
  } catch (_e) {
    // MANIFEST_DIR may not exist — treat as no-match.
  }

  if (matches.length === 1) {
    correlatedManifest = matches[0];
    correlationStatus  = 'session-matched';
  } else if (matches.length > 1) {
    matches.sort((a, b) => {
      const aMs = Date.parse(a.issuedAt) || 0;
      const bMs = Date.parse(b.issuedAt) || 0;
      return bMs - aMs;
    });
    correlatedManifest = matches[0];
    correlationStatus  = `session-matched-multi(${matches.length})`;
  }

  // NOTE: If session_id is 'session-id-unavailable' (sentinel from
  // orchestrator), correlation will not match. This is expected when
  // the orchestrator could not retrieve the runtime session_id.
  // The PreToolUse mtime/issuedAt check is the primary gate.

  // Step 10: build reasoning string.
  const taskId    = correlatedManifest && correlatedManifest.taskId    || 'unresolved';
  const riskLevel = correlatedManifest && correlatedManifest.riskLevel || 'unresolved';
  const riskClass = correlatedManifest && correlatedManifest.riskClass || 'unresolved';
  const reasoning =
    `correlationStatus=${correlationStatus} ` +
    `agentId=${agentId} agentType=${agentType} sessionId=${sessionId} ` +
    `taskId=${taskId} riskLevel=${riskLevel} riskClass=${riskClass} ` +
    `mode=${HOOK_MODE}`;

  // Step 11: record to audit bridge.
  const agentName = correlatedManifest
    ? correlatedManifest.subagent_type
    : agentType;

  // Step 12: wrap audit bridge call in try/catch — never block on audit failure.
  try {
    // bridge.record({
    //   agentName:   agentName,
    //   action:      'agent_spawn_started',
    //   decision:    'observed',
    //   matchedRule: 'subagent-start-correlator',
    //   reasoning:   reasoning,
    //   latencyMs:   Date.now() - startMs,
    //   mode:        HOOK_MODE,
    // }) — implement for your runtime.
    // Without an audit bridge, correlation results are not persisted.
    void agentName;
    void reasoning;
    void startMs;
  } catch (_e) {
    // never block on audit failure
  }

  // Step 13: process.exit(0) always.
  process.exit(0);
}

try {
  main();
} catch (_e) {
  // SubagentStart cannot block. Always exit 0 on uncaught error.
  process.exit(0);
}
