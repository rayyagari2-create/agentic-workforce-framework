# Runtime Adapter Capability Model
**Document ID:** DESIGN-01
**Version:** 1.1
**Status:** LOCKED — public Sprint 2 foundation
**Location:** `docs/adapter-designs/DESIGN-01.md`
**Depends on:** None — this is the foundation document
**Blocks:** All other adapter design documents

---

## Purpose

This document defines how AWF evaluates any runtime based on its evidence
and control surface, not its brand or marketing claims.

The central principle:

> AWF adapter modes are based on evidence and control surface, not runtime brand.

Every adapter implements the same governance lifecycle. What differs is
how deeply AWF can observe and enforce within that lifecycle. This document
defines the 12 capability surfaces that determine depth, the operational
qualifiers (evidence strength, hook requirements, fail-closed support)
that govern claims, and the enforcement tiers that result.

This document is the master reference for all adapter design documents.
No adapter design document may define a capability claim that contradicts
this model.

---

## Capability Surfaces and Operational Qualifiers

AWF evaluates every runtime across 12 capability surfaces plus operational
qualifiers — currentEvidenceStrength, targetEvidenceStrength, hook-install
requirements, fail-closed support and known gaps. Together they determine
enforcement depth and trust subject type.

### 1. contextInjectionSurface

How AWF injects governance context before a session starts.

| Value | Description |
|---|---|
| `agents_md` | AWF writes AGENTS.md to the repo root before session starts |
| `claude_md` | AWF writes CLAUDE.md (Claude Code alias for AGENTS.md) |
| `rules_file` | AWF writes `.cursor/rules/awf-governance.mdc` |
| `state_graph` | AWF injects context via LangGraph StateGraph and Runtime context |
| `knowledge_api` | AWF injects via Devin Knowledge API endpoint |
| `playbook` | AWF injects via Devin Playbook at session creation |
| `env_vars` | AWF injects via environment variables at session start |
| `none` | AWF cannot inject context before session starts |

**Notes:**
- AGENTS.md is the cross-runtime default where file-based injection is supported.
- CLAUDE.md is written as an alias where Claude Code is the target runtime.
- Framework-native runtimes (LangGraph) receive context through runtime state not files.
- Context injection happens at session boot only. Mid-session edits to AGENTS.md
  are not picked up until the next session.

---

### 2. eventSurface

The number and type of observable lifecycle events the runtime emits.

| Value | Description |
|---|---|
| `hook_rich` | 18+ named hook events with defined payloads |
| `hook_moderate` | 8-17 named hook events |
| `hook_limited` | 1-7 named hook events |
| `callback_based` | Framework callbacks and interrupts (LangGraph) |
| `stream_only` | Observable via stream events but no hook system |
| `polling_only` | No streaming. External observation via REST polling. |
| `none` | No external event surface |

**Per-runtime event counts (from primary source research):**
- Claude Code: 29 hook events
- OpenClaw: 36 plugin hook events
- Cursor: 18 hook events
- Codex: 8 hook events
- LangGraph: Callbacks + interrupts (framework-native)
- Devin: NONE outbound
- Multica: NONE external (internal only)

---

### 3. controlSurface

Whether AWF can enforce policy during execution, not just observe.

| Value | Description |
|---|---|
| `tool_level` | AWF can block individual tool calls via PreToolUse hooks |
| `session_level` | AWF can block or approve at session boundaries |
| `sandbox_policy` | AWF can enforce via sandbox mode constraints |
| `interrupt` | AWF can enforce via framework interrupt() calls (LangGraph) |
| `task_level` | AWF can approve or cancel tasks but not tool calls |
| `observation_only` | AWF cannot block anything. Read-only governance. |

**Critical distinction:** `observation_only` does not mean AWF provides no value.
AWF still provides intake governance, approval gates, failure memory and
post-session scoring. But mid-execution enforcement is not available.

---

### 4. approvalSurface

Where and when AWF can surface approval requirements.

| Value | Description |
|---|---|
| `pre_tool` | Approval can fire before any individual tool call |
| `pre_session` | Approval fires before the session starts (AWF intake gate) |
| `pre_plan` | Approval fires after plan creation, before execution |
| `interrupt` | Approval fires via graph interrupt() at defined breakpoints |
| `post_session` | Approval fires after session ends (outcome review only) |
| `none` | No approval surface available |

**Note:** AWF's intake approval gate (pre_session) applies to all runtimes
regardless of other approval surfaces. The pre_session gate is AWF's minimum
governance floor. All other approval surfaces are additive.

---

### 5. artifactSurface

What evidence AWF can collect after a session ends.

| Value | Description |
|---|---|
| `git_diff` | AWF scrapes git status/diff for files changed |
| `pr_url` | AWF captures PR URL from runtime or git step |
| `test_results` | AWF captures test pass/fail counts |
| `command_logs` | AWF captures commands run and exit codes |
| `handoff_note` | AWF captures free-text handoff note from agent |
| `sdk_items` | AWF extracts from SDK result items[] array |
| `session_export` | AWF receives session export from runtime API |
| `polling` | AWF polls runtime API for session outcome |

Multiple values apply per runtime. All runtimes should produce at minimum
`git_diff` and `handoff_note` for D1/D2 scoring to be meaningful.

---

### 6. streamSurface

How AWF can observe real-time execution progress.

| Value | Description |
|---|---|
| `sdk_stream` | AWF subscribes to SDK streaming events (30 event types) |
| `sse` | AWF subscribes to Server-Sent Events stream |
| `websocket` | AWF subscribes to WebSocket event feed |
| `ndjson` | AWF reads NDJSON stream from CLI |
| `polling_only` | No streaming. AWF polls REST endpoint for status. |
| `none` | No stream surface |

---

### 7. pluginSurface

Whether AWF can distribute governance hooks as a plugin.

| Value | Description |
|---|---|
| `plugin_json` | Runtime accepts `.{runtime}-plugin/plugin.json` with hooks.json |
| `toml_hooks` | Runtime accepts hook config via TOML (Codex) |
| `npm_package` | Runtime extended via npm/PyPI packages (LangGraph) |
| `none` | No plugin distribution mechanism |

**Cross-runtime note:** Claude Code, Codex, Cursor and OpenClaw all accept
similar plugin formats. One AWF plugin source package generates runtime-specific
manifests. This does not mean a single manifest file governs all four simultaneously.
OpenClaw auto-detects and installs all four plugin formats from one bundle.

---

### 8. skillSurface

Whether AWF can distribute governed skills.

| Value | Description |
|---|---|
| `skill_md` | Runtime loads SKILL.md files from standard paths |
| `agents_skill` | Skills loaded via agentskills.io standard |
| `none` | No skill distribution mechanism |

**Standard skill paths (multi-runtime):**
`.claude/skills/`, `.codex/skills/`, `.cursor/skills/`, `.github/skills/`,
`skills/`, `~/.agents/skills/`

AWF governed skills target all paths simultaneously where supported.

---

### 9. mcpSurface

MCP support depth.

| Value | Description |
|---|---|
| `full` | Full MCP client support: stdio + HTTP transports |
| `bidirectional` | MCP client and server (runtime can serve tools) |
| `adapter` | MCP via adapter package (LangGraph: langchain-mcp-adapters) |
| `limited` | MCP support limited to specific providers or modes |
| `none` | No MCP support |

MCP is the preferred tool distribution surface where supported.
AWF governance tools (task intake, approval gate, trust query, failure
memory lookup, audit verification) are distributed as MCP tools first.

---

### 10. sandboxSurface

What isolation AWF can rely on during execution.

| Value | Description |
|---|---|
| `vm_per_session` | Full VM per session (Devin) |
| `worktree` | Git worktree isolation per parallel agent |
| `sandbox_mode` | Configurable sandbox: read-only/workspace-write/danger |
| `container` | Docker or equivalent container isolation |
| `in_process` | No isolation. Runs in caller's process. |
| `none` | No sandbox capability documented |

---

### 11. trustSubjectType

What entity AWF assigns trust to for this runtime.

| Value | Description |
|---|---|
| `agent` | Named agent with stable identity and defined role |
| `subagent` | Spawned subagent within a session |
| `role_profile` | Codex role or profile (worker, explorer, custom) |
| `session` | Unnamed runtime session |
| `graph_node` | LangGraph node-bound trust |
| `human_runtime` | Human + runtime pair |
| `task` | Task-level trust (lowest granularity fallback) |

See DESIGN-02 for subject_key patterns per runtime.

---

### 12. enforcementDepth

Summary classification of how deeply AWF governs this runtime.

| Value | Description |
|---|---|
| `tool_level` | AWF enforces at every tool call via hooks |
| `session_level` | AWF enforces at session boundaries |
| `sandbox_level` | AWF enforces via sandbox constraints |
| `embedded` | AWF governance nodes embedded in the framework graph |
| `outcome_only` | AWF evaluates outcomes only. No mid-execution control. |

---

## Evidence Strength Rating

Not all evidence carries equal weight in D1/D2 scoring.
The rating reflects how directly AWF observed the work.

| Rating | Source | Runtimes | D1/D2 confidence |
|---|---|---|---|
| E3 | Tool-level hook evidence: PreToolUse, PostToolUse, SubagentStart | Claude Code, Cursor, OpenClaw | HIGH |
| E2 | Stream or lifecycle evidence: SDK stream, SSE, WebSocket | Codex, Cursor cloud | MEDIUM |
| E1 | Artifact or PR evidence: git diff, PR status, test results, handoff note | All runtimes post-session | LOW-MEDIUM |
| E0 | Manual export or polling: session export, REST poll | Devin, Multica | LOW |

D1 and D2 scores are labeled `candidate` for E1 and E0 evidence.
D1 and D2 scores may be labeled `verified` for E3 evidence after
the calibration threshold (n >= 20 sessions) is reached per trust subject.

D3 (policy) and D4 (recurrence) are always `deterministic` regardless
of evidence strength — they do not depend on AI interpretation.

**D3 qualifier:** D3 is deterministic within the observed and enforceable
policy surface. For Codex and Devin, AWF cannot deterministically know
every internal action. AWF can deterministically know whether observed
artifacts, configured gates and sandbox policies were violated. D3 PASS
means no observed violation. It does not mean no violation occurred.

---

## Runtime Capability Profiles

### Claude Code

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `claude_md` + `agents_md` | CLAUDE.md primary, AGENTS.md alias |
| eventSurface | `hook_rich` | 29 hook events |
| controlSurface | `tool_level` | PreToolUse veto via exit(2) |
| approvalSurface | `pre_tool` + `pre_session` | AWF intake gate + per-tool approval |
| artifactSurface | `git_diff` + `handoff_note` + `command_logs` | Via _scrapeGitChanges post-session |
| streamSurface | `sdk_stream` | 30 event types via Agent SDK |
| pluginSurface | `plugin_json` | .claude-plugin/plugin.json with hooks.json |
| skillSurface | `skill_md` | .claude/skills/SKILL.md |
| mcpSurface | `full` | stdio + HTTP |
| sandboxSurface | `worktree` | Git worktree per parallel agent |
| trustSubjectType | `agent` | Named agents in .claude/agents/ |
| enforcementDepth | `tool_level` | Strongest AWF enforcement tier |
| currentEvidenceStrength | E1 | Artifact/session level until hooks wired to AWF |
| targetEvidenceStrength | E3 | Tool-level once hooks wired fail-closed to AWF audit |
| requiresRuntimeHookInstall | true | AWF hooks must be deployed to .claude/hooks/ |
| supportsFailClosed | true | PreToolUse exit(2) blocks on hook failure |

**Known gaps:**
- SubagentStart/SubagentStop fire unreliably (~42% miss rate, GitHub #27755). PreToolUse is the primary enforcement hook.
- Agent Teams peer-to-peer messages are opaque to hooks. Only SubagentStart/Stop and TeammateIdle fire for teammate events.
- AWF must use PreToolUse as primary enforcement, not SubagentStart.

---

### Codex

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `agents_md` + `env_vars` | AGENTS.md read once at session boot |
| eventSurface | `hook_moderate` | 8 hook events via TOML config |
| controlSurface | `sandbox_policy` + `session_level` | sandbox_mode enforces read/write boundaries |
| approvalSurface | `pre_session` | AWF intake gate only |
| artifactSurface | `sdk_items` + `git_diff` + `handoff_note` | items[] from runStreamed(); git diff post-session |
| streamSurface | `sdk_stream` | runStreamed() 8 ThreadEvent types |
| pluginSurface | `plugin_json` + `toml_hooks` | .codex-plugin/plugin.json or hooks TOML |
| skillSurface | `skill_md` | SKILL.md files |
| mcpSurface | `full` | stdio + StreamableHttp |
| sandboxSurface | `sandbox_mode` | read-only / workspace-write / danger-full-access |
| trustSubjectType | `role_profile` | .codex/agents/*.toml role definitions |
| enforcementDepth | `sandbox_level` | Policy-rich but not tool-level |
| currentEvidenceStrength | E1 | thread.run() produces artifact/post-session evidence |
| targetEvidenceStrength | E2 | runStreamed() produces lifecycle + artifact evidence |
| requiresRuntimeHookInstall | false | Hooks configured via TOML, no file deployment needed |
| supportsFailClosed | false | Codex hooks control flow but no verified fail-closed mechanism |

**Known gaps:**
- No SubagentStart equivalent. Closest: PreToolUse on tool_name: "spawn_agent".
- PR creation requires separate git push + gh pr create step. SDK has no PR surface.
- AGENTS.md read once at session boot. Mid-session edits not picked up.
- Subagent execution not clearly visible in published SDK (collab_tool_call not in ThreadItem union).

---

### Cursor

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `rules_file` + `agents_md` | .cursor/rules/*.mdc + AGENTS.md |
| eventSurface | `hook_rich` | 18 hook events including subagentStart/Stop |
| controlSurface | `tool_level` | failClosed: true blocks on hook failure |
| approvalSurface | `pre_tool` + `pre_session` | AWF intake gate + per-tool via hooks |
| artifactSurface | `git_diff` + `pr_url` + `test_results` + `handoff_note` | Cloud agent REST API artifacts |
| streamSurface | `sse` + `ndjson` | /v1/agents/{id}/stream SSE + CLI stream-json |
| pluginSurface | `plugin_json` | .cursor-plugin/plugin.json with hooks.json |
| skillSurface | `skill_md` | .cursor/skills/SKILL.md |
| mcpSurface | `full` | stdio + SSE + Streamable HTTP |
| sandboxSurface | `sandbox_mode` + `worktree` | --sandbox + --worktree flags |
| trustSubjectType | `agent` | .cursor/agents/ definitions |
| enforcementDepth | `tool_level` | Event-rich, comparable to Claude Code |
| currentEvidenceStrength | E1 | Artifact level until hooks wired to AWF |
| targetEvidenceStrength | E3 | Local hooks / E2 cloud agents (SSE) |
| requiresRuntimeHookInstall | true | AWF hooks deployed to .cursor/hooks.json |
| supportsFailClosed | true | failClosed: true blocks on hook failure |

**Notes:**
- Cloud agent outbound webhooks: "coming soon." Use SSE stream as substitute.
- Cursor is classified event-rich/controlled. Closer to Claude Code than Codex.

---

### Devin

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `agents_md` + `knowledge_api` + `playbook` | AGENTS.md + Knowledge notes + Playbooks |
| eventSurface | `none` | No outbound hooks or webhooks |
| controlSurface | `observation_only` | No mid-execution enforcement possible |
| approvalSurface | `pre_session` | AWF intake gate only. Playbook injected at creation. |
| artifactSurface | `session_export` + `polling` + `pr_url` | REST API polling + PR evidence |
| streamSurface | `polling_only` | No SSE/WebSocket. REST poll only. |
| pluginSurface | `none` | No plugin distribution |
| skillSurface | `skill_md` | SKILL.md via multi-vendor paths |
| mcpSurface | `limited` | MCP client + Marketplace + Devin-as-MCP-server |
| sandboxSurface | `vm_per_session` | Full Linux VM per session with snapshots |
| trustSubjectType | `session` | No internal agent decomposition visible externally |
| enforcementDepth | `outcome_only` | Post-session evaluation only |
| currentEvidenceStrength | E0/E1 | REST polling + session export + PR evidence |
| targetEvidenceStrength | E1 | No path to E2+ without Devin adding outbound hooks |
| requiresRuntimeHookInstall | false | No hook system available |
| supportsFailClosed | false | No hook system — cannot fail-closed |

**AWF claim for Devin:**
Devin is a worker. AWF governs assignment, budget, evidence and trust history
around Devin. AWF does not control Devin's internal execution lifecycle.
Pre-session governance via Playbooks/Knowledge and ACU budget caps are
AWF's primary enforcement levers.

---

### LangGraph

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `state_graph` | StateGraph schema + Runtime context injection |
| eventSurface | `callback_based` | BaseCallbackHandler events + astream_events v2 |
| controlSurface | `interrupt` | interrupt() + interrupt_before/after on compile |
| approvalSurface | `interrupt` + `pre_session` | interrupt() at defined breakpoints = HITL |
| artifactSurface | `git_diff` + `handoff_note` | Post-graph execution artifacts |
| streamSurface | `sdk_stream` | 7 stream modes + astream_events v2 |
| pluginSurface | `npm_package` | Extension via PyPI/npm packages |
| skillSurface | `none` | No SKILL.md standard |
| mcpSurface | `adapter` | langchain-mcp-adapters package |
| sandboxSurface | `none` | In-process. No sandbox. |
| trustSubjectType | `graph_node` | Trust attaches to graph nodes and edges |
| enforcementDepth | `embedded` | AWF governance nodes are LangGraph nodes |
| currentEvidenceStrength | E2 | Stream events + checkpointer state |
| targetEvidenceStrength | E2 | E2 is the ceiling without tool-level hooks |
| requiresRuntimeHookInstall | false | AWF nodes embedded in graph, not hook files |
| supportsFailClosed | true | interrupt() can block execution |

**AWF claim for LangGraph:**
LangGraph governance requires the graph to be built with AWF nodes and
interrupt points. It cannot be applied externally. AWF CAN claim embedded
governance if the graph owner adopts AWF nodes. This is the strongest
embedded governance demonstration target in the runtime landscape.

---

### OpenClaw

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `agents_md` | AGENTS.md (CLAUDE.md = symlink) + workspace bundle |
| eventSurface | `hook_rich` | 36 plugin hooks — richest of all researched runtimes |
| controlSurface | `tool_level` | Decision-returning hooks with veto + approval primitives |
| approvalSurface | `pre_tool` + `pre_session` | before_tool_call with requireApproval primitive |
| artifactSurface | `git_diff` + `handoff_note` + `sdk_items` | WebSocket SDK artifacts |
| streamSurface | `websocket` | WebSocket port 18789, 30+ event types |
| pluginSurface | `plugin_json` | openclaw.plugin.json — auto-detects Claude/Codex/Cursor formats |
| skillSurface | `agents_skill` | agentskills.io standard |
| mcpSurface | `bidirectional` | Serves and consumes MCP |
| sandboxSurface | `container` | Optional docker, cwd-default |
| trustSubjectType | `agent` | Named agents with workspace isolation |
| enforcementDepth | `tool_level` | Strongest hook surface of any runtime researched |
| currentEvidenceStrength | E1 | Artifact level until hooks wired to AWF |
| targetEvidenceStrength | E3 | 36 decision-returning hooks + approval primitives |
| requiresRuntimeHookInstall | true | AWF hooks deployed via openclaw.plugin.json |
| supportsFailClosed | true | before_tool_call decision-returning veto |

**OpenClaw is the hook reference model.**
AWF's own hook contract targets OpenClaw's design. The `before_tool_call`
hook with `requireApproval` including severity, timeoutMs, timeoutBehavior
and onResolution callback is the benchmark for AWF approval gate design.

---

### Multica

| Surface | Value | Notes |
|---|---|---|
| contextInjectionSurface | `agents_md` + `env_vars` | Injects CLAUDE.md/AGENTS.md/GEMINI.md per provider |
| eventSurface | `none` | No external hooks. Internal events.Bus is Go-private. |
| controlSurface | `task_level` | AWF can approve/cancel tasks. Not tool calls. |
| approvalSurface | `pre_session` | Autopilot webhook inbound. No outbound. |
| artifactSurface | `polling` + `git_diff` | REST + WebSocket task events + workdir artifacts |
| streamSurface | `websocket` | Two WS endpoints + ~60 event types |
| pluginSurface | `none` | No plugin system. Skills only. |
| skillSurface | `agents_skill` | agentskills.io standard |
| mcpSurface | `limited` | Claude provider only in v1 |
| sandboxSurface | `none` | Per-task workdir, not isolated |
| trustSubjectType | `task` | Task-bound trust via agent_task_queue |
| enforcementDepth | `outcome_only` | No external hook injection possible |
| evidenceStrength (current) | E1/E0 | WS task lifecycle events + REST polling + workdir artifacts |
| evidenceStrength (lifecycle) | E2 | WebSocket task events (task:queued, task:progress, task:completed) |
| evidenceStrength (work-product) | E1/E0 | Workdir artifacts, git diff, polling |

**AWF and Multica integration options:**
- Option A (easier): AWF above Multica via REST + WS. No Multica code change. Post-hoc governance.
- Option B (strategic): AWF as Multica's 12th runtime via a Multica PR. Multica routes work. AWF governs the work. The underlying runtime executes the work.

---

## Enforcement Tier Summary

| Tier | Runtimes | enforcementDepth | currentEvidenceStrength | trustSubjectType |
|---|---|---|---|---|
| Event-rich / enforced | Claude Code, Cursor, OpenClaw | tool_level | E1 (E3 target when hooks wired) | agent |
| Policy-rich / controlled | Codex | sandbox_level | E1 (E2 target with runStreamed) | role_profile |
| Artifact-rich / polling | Devin | outcome_only | E0/E1 | session |
| Framework-native | LangGraph | embedded | E2 | graph_node |
| Orchestration sibling | Multica | outcome_only | E1/E0 | task |

---

## AdapterCapabilityProfile Interface

Every adapter declares its capability profile as part of AWFAgentRuntime v2.0.
This becomes the machine-readable version of the surfaces above.

```javascript
// services/execution/src/runtime-interface.js

class AWFAdapterCapabilityProfile {
  runtimeId                  // string — unique runtime identifier
  runtimeVersion             // string — version of runtime being adapted
  contextInjectionSurface    // string[] — one or more values from surface definitions
  eventSurface               // string — hook_rich | hook_moderate | hook_limited | callback_based | stream_only | polling_only | none
  controlSurface             // string — tool_level | session_level | sandbox_policy | interrupt | task_level | observation_only
  approvalSurface            // string[] — pre_tool | pre_session | pre_plan | interrupt | post_session | none
  artifactSurface            // string[] — git_diff | pr_url | test_results | command_logs | handoff_note | sdk_items | session_export | polling
  streamSurface              // string — sdk_stream | sse | websocket | ndjson | polling_only | none
  pluginSurface              // string — plugin_json | toml_hooks | npm_package | none
  skillSurface               // string — skill_md | agents_skill | none
  mcpSurface                 // string — full | bidirectional | adapter | limited | none
  sandboxSurface             // string — vm_per_session | worktree | sandbox_mode | container | in_process | none
  trustSubjectType           // string — agent | subagent | role_profile | session | graph_node | human_runtime | task
  enforcementDepth           // string — tool_level | session_level | sandbox_level | embedded | outcome_only
  currentEvidenceStrength    // string — E0|E1|E2|E3 — what AWF produces today without hook wiring
  targetEvidenceStrength     // string — E0|E1|E2|E3 — what AWF produces when fully integrated
  requiresRuntimeHookInstall // boolean — true if E3 requires AWF hook files deployed to runtime environment
  supportsFailClosed         // boolean — true if hooks can block on AWF service failure
  knownGaps                  // string[] — documented limitations
}
```

**currentEvidenceStrength vs targetEvidenceStrength:**
These must both be declared. An adapter that claims E3 target but is currently
E1 must say so. External claims must only reference currentEvidenceStrength.
targetEvidenceStrength is an internal engineering roadmap field only.

**requiresRuntimeHookInstall:** When true, E3 enforcement is not available
until AWF hook files are physically deployed to the runtime environment
(`.claude/hooks/`, `.cursor/hooks.json`, Codex TOML hooks, etc.) and verified
to call the AWF policy service on every tool call.

**supportsFailClosed:** When true, hooks can be configured so that if the AWF
policy service is unreachable, the hook blocks the tool call. This is required
before any hard real-time enforcement claim is made.

---

## Using This Document

**For adapter authors:**
Before writing any adapter code, declare the AdapterCapabilityProfile for
the target runtime. Every claim in the adapter must be traceable to a
surface value in this document. Any capability not listed here must be
researched and added before implementation.

**For reviewers:**
Use the knownGaps field to verify that the adapter does not overclaim.
See DESIGN-03 for the full overclaiming prevention standard.

**For trust scoring:**
D1/D2 score confidence levels are determined by evidenceStrength.
E3 evidence produces HIGH confidence scores. E0 produces LOW confidence.
The scoring engine must label candidate vs verified accordingly.

---

## Open Questions

1. Does the Warp/Oz harness expose a hook surface for the Claude Code or Codex sub-harnesses it spawns? Research pending (Warp Oz launch May 19, 2026).
2. Does Cursor cloud agent mode support fail-closed hooks or only best-effort? Research pending.
3. Does Codex TOML hook system support fail-closed configuration? Unverified from primary source.
4. OpenClaw: does subagent_spawning hook fire reliably or does it have the same miss-rate issue as Claude Code SubagentStart?

## Implementation Checklist

- [ ] AWFAdapterCapabilityProfile declared for every adapter
- [ ] currentEvidenceStrength and targetEvidenceStrength distinct and accurate
- [ ] requiresRuntimeHookInstall = true adapters have hook deployment tracked as separate task
- [ ] supportsFailClosed = false adapters documented in DESIGN-03 claims limits
- [ ] knownGaps field populated for every adapter
- [ ] Multica profile updated after Warp/Oz research completes

## Acceptance Evidence

This document is satisfied when:
- All runtime profiles have all capability surfaces and operational qualifier fields populated
- AdapterCapabilityProfile interface is implemented in runtime-interface.js
- Every adapter design document (DESIGN-04 through DESIGN-12) references this document
- No adapter design document claims a capability not listed in its runtime profile here

## Claims Approved for External Use

From this document, the following claims are approved for external use:

**Approved:**
"AWF evaluates every runtime on the same 12 capability surfaces regardless of brand."
"AWF adapters declare currentEvidenceStrength and targetEvidenceStrength separately."
"AWF is a cross-runtime governance layer that explicitly distinguishes evidence depth per runtime."

**Not approved for external use:**
Any claim that a specific runtime achieves E3 unless requiresRuntimeHookInstall is satisfied
and hooks are verified fail-closed in the target environment.

---

*Document owner: Ramesh Ayyagari*
*Version 1.1 — 2026-05-19*
