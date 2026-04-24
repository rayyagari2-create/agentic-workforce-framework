#!/usr/bin/env node
"use strict";

// check-bulletin.example.js
//
// Enforce read-before-write on the agent bulletin file.
//
// Rule: Before any Write tool call to .agent-workspace/bulletin.md, the
// caller must have read the current bulletin contents in this session.
// This prevents stale-state writes that overwrite other agents' entries.
//
// Decision: exit(0) allow, exit(2) block, anything else fail-closed.

const fs = require("fs");
const path = require("path");

const BULLETIN_PATH = ".agent-workspace/bulletin.md";
const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

function audit(decision, reason, payload) {
  try {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      hook: "check-bulletin",
      decision,
      reason,
      tool_name: payload && payload.tool_name,
      agent_id: payload && payload.context && payload.context.agent_id,
      correlation_id:
        payload && payload.context && payload.context.correlation_id,
    });
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    // Audit failure must not flip the decision. The decision stands; the
    // operator will notice the audit gap on the next reconciliation pass.
  }
}

function main() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8"); // stdin
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
  const input = payload.tool_input || {};
  const context = payload.context || {};

  // Only gate Write-style tools targeting the bulletin.
  const isWrite = tool === "Write" || tool === "Edit";
  const targetsBulletin =
    typeof input.file_path === "string" &&
    path.normalize(input.file_path) === path.normalize(BULLETIN_PATH);

  if (!isWrite || !targetsBulletin) {
    audit("allow", "not_in_scope", payload);
    process.exit(0);
  }

  const reads = Array.isArray(context.session_reads)
    ? context.session_reads
    : null;

  if (!reads) {
    audit("block", "missing_session_reads", payload);
    process.exit(2);
  }

  const sawRead = reads.some(
    (p) => path.normalize(p) === path.normalize(BULLETIN_PATH)
  );

  if (!sawRead) {
    audit("block", "bulletin_not_read_in_session", payload);
    process.stderr.write(
      "Bulletin must be read in this session before writing.\n"
    );
    process.exit(2);
  }

  audit("allow", "read_before_write_satisfied", payload);
  process.exit(0);
}

try {
  main();
} catch (_e) {
  // Fail closed on any uncaught error.
  process.exit(2);
}
