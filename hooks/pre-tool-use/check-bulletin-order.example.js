#!/usr/bin/env node
"use strict";

// check-bulletin-order.example.js
//
// Bulletin write order enforcement.
//
// Rule: Every session writes a WORKING entry before a DONE entry. A DONE
// entry without a prior WORKING entry indicates one of:
//   - The agent skipped the in-progress reporting step
//   - The agent forged a completion entry
//   - The bulletin was edited out-of-order by some other process
//
// All three are bad. Block.
//
// Decision: exit(0) allow, exit(2) block, anything else fail-closed.

const fs = require("fs");
const path = require("path");

const BULLETIN_PATH = ".agent-workspace/bulletin.md";
const AUDIT_LOG = ".agent-workspace/audit-log.jsonl";

function audit(decision, reason, payload, extra) {
  try {
    const line = JSON.stringify(
      Object.assign(
        {
          ts: new Date().toISOString(),
          hook: "check-bulletin-order",
          decision,
          reason,
          tool_name: payload && payload.tool_name,
          session_id: payload && payload.context && payload.context.session_id,
          agent_id: payload && payload.context && payload.context.agent_id,
          correlation_id:
            payload && payload.context && payload.context.correlation_id,
        },
        extra || {}
      )
    );
    fs.appendFileSync(AUDIT_LOG, line + "\n", { flag: "a" });
  } catch (_e) {
    /* swallow audit error */
  }
}

function classifyEntry(content) {
  // Caller's proposed bulletin write. Looks for [WORKING] or [DONE] tags
  // anywhere in the content. Adapt to your bulletin convention.
  if (/\[DONE\]/.test(content)) return "DONE";
  if (/\[WORKING\]/.test(content)) return "WORKING";
  return "OTHER";
}

function sessionHasWorkingEntry(sessionId) {
  // Read the bulletin and look for an existing [WORKING] entry tagged
  // with this session_id. Bulletin format convention used here:
  //
  //   - 2026-04-24T10:32Z [WORKING] session=01HX... agent=agent-fe ...
  //
  let raw;
  try {
    raw = fs.readFileSync(BULLETIN_PATH, "utf8");
  } catch (_e) {
    // No bulletin yet — there cannot be a prior WORKING entry.
    return false;
  }
  const re = new RegExp(
    "\\[WORKING\\][^\\n]*session=" + escapeRegExp(sessionId)
  );
  return re.test(raw);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main() {
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw);

  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const context = payload.context || {};

  const isWrite = tool === "Write" || tool === "Edit";
  const targetsBulletin =
    typeof input.file_path === "string" &&
    path.normalize(input.file_path) === path.normalize(BULLETIN_PATH);

  if (!isWrite || !targetsBulletin) {
    audit("allow", "not_in_scope", payload);
    process.exit(0);
  }

  const content = typeof input.content === "string" ? input.content : "";
  const kind = classifyEntry(content);

  if (kind !== "DONE") {
    // WORKING and OTHER entries are not order-gated.
    audit("allow", "not_a_done_entry", payload, { kind });
    process.exit(0);
  }

  const sessionId = context.session_id;
  if (!sessionId) {
    audit("block", "missing_session_id", payload);
    process.exit(2);
  }

  if (!sessionHasWorkingEntry(sessionId)) {
    audit("block", "done_without_prior_working", payload);
    process.stderr.write(
      "Bulletin order violation: write a [WORKING] entry for this session " +
        "before writing [DONE].\n"
    );
    process.exit(2);
  }

  audit("allow", "done_after_working", payload);
  process.exit(0);
}

try {
  main();
} catch (_e) {
  process.exit(2);
}
