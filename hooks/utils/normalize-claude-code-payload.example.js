#!/usr/bin/env node
"use strict";

/*
 * normalize-claude-code-payload.example.js
 *
 * USAGE
 * -----
 *
 * Claude Code does not provide framework context fields (agent_id,
 * agent_depth, task risk, session_reads) by default. These must be derived
 * from a manifest sidecar, transcript path, CWD, runtime state files, or
 * environment variables. This normalizer converts the real Claude Code
 * PreToolUse payload into the internal framework shape.
 *
 * Real Claude Code PreToolUse payload (verified shape):
 *
 *   {
 *     session_id:       "<uuid>",
 *     transcript_path:  "/abs/path/to/transcript.jsonl",
 *     cwd:              "/abs/path/to/project",
 *     permission_mode:  "default" | "plan" | "acceptEdits" | ...,
 *     hook_event_name:  "PreToolUse",
 *     tool_name:        "Agent" | "Task" | ...,
 *     tool_input: {
 *       description:    "<free text, may carry [MANIFEST:<taskId>] tag>",
 *       prompt:         "<full agent prompt>",
 *       subagent_type:  "<role>"
 *     },
 *     tool_use_id:      "<uuid>"
 *   }
 *
 * Normalized internal framework context (returned by normalize()):
 *
 *   {
 *     sessionId:       <session_id>,
 *     taskId:          <extracted from [MANIFEST:<taskId>] in description, or null>,
 *     agentRole:       <tool_input.subagent_type>,
 *     rawDescription:  <tool_input.description>,
 *     promptHash:      <SHA-256 hex digest of tool_input.prompt>,
 *     toolUseId:       <tool_use_id>
 *   }
 *
 * Anything missing from the payload yields the corresponding field as
 * null/undefined. Callers must fail closed if a required field is absent;
 * this module's job is to extract, not to validate.
 */

const crypto = require("crypto");

const MANIFEST_TAG_RE = /\[MANIFEST:([A-Za-z0-9_\-]+)\]/;

function extractTaskId(description) {
  if (typeof description !== "string") return null;
  const m = description.match(MANIFEST_TAG_RE);
  return m ? m[1] : null;
}

function sha256Hex(input) {
  if (typeof input !== "string") return null;
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Normalize a Claude Code PreToolUse payload to the framework's internal
 * shape. Pure function — no I/O, no environment reads.
 *
 * @param {object} payload  parsed Claude Code PreToolUse JSON
 * @returns {{
 *   sessionId: string|undefined,
 *   taskId: string|null,
 *   agentRole: string|undefined,
 *   rawDescription: string|undefined,
 *   promptHash: string|null,
 *   toolUseId: string|undefined
 * }}
 */
function normalize(payload) {
  const p = payload || {};
  const ti = p.tool_input || {};
  return {
    sessionId: p.session_id,
    taskId: extractTaskId(ti.description),
    agentRole: ti.subagent_type,
    rawDescription: ti.description,
    promptHash: sha256Hex(ti.prompt),
    toolUseId: p.tool_use_id,
  };
}

module.exports = {
  normalize,
  extractTaskId,
  sha256Hex,
  MANIFEST_TAG_RE,
};
