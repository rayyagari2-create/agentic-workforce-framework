# Adapter Enforcement Limits
**Document ID:** DESIGN-03
**Version:** 1.1
**Status:** NEAR LOCK — pending founder review
**Location:** `docs/adapter-designs/DESIGN-03.md`
**Depends on:** DESIGN-01, DESIGN-02
**Blocks:** All adapter design documents, marketing and sales materials

---

## Purpose

This document defines what AWF can and cannot claim for each adapter tier.
It is the overclaiming prevention standard.

AWF's credibility depends on being precise about governance depth.
Claiming tool-level enforcement for Devin (impossible) or claiming
session-level governance for Claude Code (an understatement) both
damage trust. This document defines the exact language to use and
the exact language to avoid.

Every adapter design document must include a "Claims and Limits" section
that references this document and applies its standards.

---

## The Overclaiming Problem

AWF adapters vary significantly in enforcement depth. The temptation is
to describe all adapters using the language of the strongest tier
(Claude Code with tool-level hooks). This produces false claims.

**False claim example (Devin):**
"AWF governs every tool call Devin makes."
**Reality:** Devin has no outbound hooks. AWF cannot observe individual
tool calls inside a Devin session.

**False claim example (Codex):**
"AWF blocks unauthorized actions in real time."
**Reality:** Codex's 8 hook events are TOML-configured. AWF can enforce
sandbox boundaries but not individual tool-call veto in real time the
way Claude Code hooks do.

**Underclaiming example (Claude Code):**
"AWF monitors Claude Code sessions."
**Reality:** AWF enforces at the tool level, can veto individual tool
calls, governs subagent spawning and maintains a tamper-evident audit chain.
"Monitors" significantly understates the depth.

---

## Enforcement Tier Claims Language

### Tier 1: Event-rich / enforced
**Runtimes:** Claude Code, Cursor, OpenClaw

**AWF CAN claim (when hooks are installed, configured and fail-closed):**
- Tool-level policy enforcement on every tool call exposed through the runtime hook surface
- Real-time veto of unauthorized file writes, shell commands and MCP calls
- Subagent spawn governance (with caveat below)
- Per-session audit trail with tool-level evidence (E3 strength)
- Tamper-evident hash-chained audit log covering every observable action
- Approval gates at both session and tool level
- Failure memory checked before every tool invocation
- D1/D2 scores labeled HIGH confidence after calibration threshold

**AWF CAN claim (current state — before hooks are wired to AWF):**
- Session-level governance via intake approval gate
- Post-session artifact capture and E1 evidence scoring
- D1/D2 scores labeled candidate

**AWF CANNOT claim at any time:**
- Perfect subagent coverage — SubagentStart/SubagentStop fire unreliably in
  Claude Code (~42% miss rate, GitHub #27755). PreToolUse is the primary
  enforcement hook, not SubagentStart.
- Visibility into Agent Teams peer-to-peer messages — the mailbox between
  Claude Code teammates is opaque to hooks. Only task lifecycle events fire.
- Enforcement inside remote or cloud-hosted agent sessions unless the hook
  system is configured in the remote environment.
- "Every tool call" in an absolute sense — the correct language is
  "every tool call exposed through the runtime hook surface."

**Hooks must meet all four conditions before claiming tool-level enforcement:**
1. AWF hook files are deployed to the runtime environment
2. Hooks call the AWF policy service on every tool call
3. Hooks are configured fail-closed (block on AWF service failure)
4. Audit emission is verified in the AWF audit chain

**If hooks are not wired, AWF may only claim session-level governance
and post-session evidence capture. Do not claim E3 until all four
conditions are verified.**

**Standard language for this tier (hooks installed):**
"AWF enforces governance at the tool level. Every tool call exposed through
the runtime hook surface is subject to AWF's PreToolUse policy before execution.
Unauthorized actions are blocked in real time. The audit trail captures every
observable action with E3 evidence strength."

**Standard language for this tier (hooks not yet installed):**
"AWF governs Claude Code sessions through pre-session approval gates and
post-session artifact capture. Tool-level hook enforcement is the target state
and requires AWF hook deployment to the runtime environment."

---

### Tier 2: Policy-rich / controlled
**Runtimes:** Codex

**AWF CAN claim:**
- Session-level approval gates before any Codex task starts
- Sandbox policy enforcement (read-only vs workspace-write boundaries)
- AGENTS.md context injection with governance rules at session boot
- Role/profile-based trust scoring per Codex role configuration
- Artifact capture from SDK items[] (file_change, command_execution)
- Post-session git diff capture as supplementary evidence
- Audit trail with E2/E1 evidence strength
- Token usage reporting for budget governance

**AWF CANNOT claim:**
- Real-time tool-level veto equivalent to Claude Code PreToolUse hooks
- Subagent spawn visibility equivalent to Claude Code SubagentStart
- PR creation from within the adapter (separate git/gh step required)
- Mid-session AGENTS.md changes (read once at session boot only)
- E3 tool-level evidence strength

**Important note on Codex hooks:**
Codex has 8 lifecycle hook events configurable via TOML and plugin. These are
useful for policy injection and lifecycle control. However AWF does not currently
treat Codex as E3 or tool-level because the published SDK does not expose full
tool and subagent execution in a way AWF can verify end-to-end. The
`spawn_agent` tool exists internally but is not surfaced clearly in the
published SDK ThreadItem union. This may change as the SDK matures.

**Standard language for this tier:**
"AWF governs Codex sessions through pre-session approval gates, sandbox
policy configuration and role-profile trust scoring. Session outcomes
are evaluated against acceptance criteria with E2/E1 evidence strength.
AWF cannot enforce individual tool-call policy inside a Codex session."

---

### Tier 3: Artifact-rich / polling
**Runtimes:** Devin

**AWF CAN claim:**
- Pre-session approval gates before any Devin session starts
- Playbook and Knowledge injection at session creation
- ACU budget governance — max_acu_limit per session
- Post-session outcome evaluation against acceptance criteria
- PR evidence capture via GitHub integration
- Session state tracking via REST API polling
- Failure memory injection via Knowledge notes for future sessions
- Branch protection governance delegated to GitHub (not AWF-enforced directly)

**AWF CANNOT claim:**
- Mid-execution enforcement of any kind — Devin has no outbound hooks
- Real-time observation of Devin's internal agent actions
- Tool-call level visibility into what Devin is doing inside its VM
- Blocking a Devin action once the session has started
- Subagent identity tracking for Managed Devins — AWF sees parent/child
  session IDs but not the internal behavior of each managed Devin

**Standard language for this tier:**
"AWF governs Devin through pre-session approval, playbook injection and
budget controls. Once a Devin session starts, AWF evaluates outcomes
after session completion. AWF does not enforce Devin's internal execution
lifecycle. Governance is pre-session and post-session only."

---

### Tier 4: Framework-native
**Runtimes:** LangGraph

**AWF CAN claim:**
- Embedded governance if the graph owner adopts AWF governance nodes
- Human-in-the-loop approval at defined graph interrupt() points
- State-based enforcement via interrupt_before and interrupt_after on
  high-risk nodes
- Checkpointer-based audit trail of graph state at every checkpoint
- Full governance when AWF nodes are part of the graph design

**AWF CANNOT claim:**
- External enforcement — LangGraph governance requires the graph to be
  built with AWF nodes. AWF cannot be applied to an existing LangGraph
  application without modifying the graph definition.
- Enforcement on LangGraph applications not built with AWF nodes
- Tool-level veto equivalent to Claude Code hooks on arbitrary LangGraph
  applications

**Standard language for this tier:**
"AWF provides embedded governance for LangGraph applications that adopt
AWF governance nodes and interrupt points. The human-in-the-loop
interrupt is a first-class LangGraph primitive. AWF cannot govern
LangGraph applications externally — the graph must be built with
AWF governance integration."

---

### Tier 5: Orchestration sibling
**Runtimes:** Multica

**Option A — AWF above Multica (no Multica code change):**

**AWF CAN claim:**
- Task-level observation via REST + WebSocket event subscription
- Pre-task classification and approval before Multica dispatches work
- Post-task scoring from workdir artifacts and task outcome
- Audit trail coverage at the task level (E1/E0 evidence strength)

**AWF CANNOT claim:**
- Mid-flight tool gating inside Multica sessions
- Hook injection into Multica's internal lifecycle
- Internal Multica session enforcement — Multica's event bus is Go-private

**Option B — AWF as Multica's 12th runtime (requires Multica PR):**

**AWF CAN claim:**
- Full governance of the underlying runtime (Claude Code, Codex etc.)
  because AWF interposes the governance harness before delegating
- Multica routes work. AWF governs the work. The runtime executes the work.
- All governance claims of the underlying adapter apply

**Standard language for this tier (Option A):**
"AWF observes Multica task execution through the Multica REST API and
WebSocket event feed. AWF provides pre-task approval gates and post-task
scoring. AWF does not enforce Multica's internal session lifecycle."

**Standard language for this tier (Option B):**
"AWF acts as a governed runtime layer for Multica. Multica routes work
to AWF. AWF applies its full governance lifecycle — approval, execution
governance via the underlying runtime's hooks, artifact capture and
trust scoring — before returning results to Multica."

---

## Applying This Document

### In adapter design documents

Every adapter design document must include:

```markdown
## Claims and Limits

**Enforcement tier:** [tier name]
**Evidence strength:** [E0-E3]
**Trust subject type:** [from DESIGN-02]

AWF CAN claim:
- [specific claims from this document for this tier]

AWF CANNOT claim:
- [specific limits from this document for this tier]

Standard language:
"[copy exact standard language from this document]"
```

### In marketing and sales materials

Never use language from a higher tier to describe a lower tier adapter.

**Prohibited cross-tier language examples:**
- "AWF enforces governance at the tool level inside Devin" — FALSE
- "AWF blocks unauthorized Codex actions in real time" — OVERSTATED
- "AWF monitors Claude Code sessions" — UNDERSTATED

**Test before using any claim:**
1. Which tier is this runtime?
2. Does the claim appear in the CAN claim list for that tier?
3. Does the claim appear in the CANNOT claim list?

If step 3 is yes, do not use the claim regardless of context.

### In investor and pilot conversations

Use the standard language verbatim where possible. When customizing:
- Stay within the CAN claim boundary
- Acknowledge limits proactively — it builds more trust than overclaiming
- The correct frame: "AWF governs what is governable. For Devin, that
  means pre-session and post-session. For Claude Code with AWF hooks
  installed and fail-closed, that means every tool call exposed through
  the runtime hook surface."

---

## Known Gaps Requiring Future Research

The following gaps were identified during primary source research and
may affect claims as runtimes evolve. Re-evaluate these at each sprint boundary.

| Gap | Runtime | Impact on claims |
|---|---|---|
| SubagentStart 42% miss rate | Claude Code | Cannot claim perfect spawn coverage |
| Agent Teams mailbox opaque | Claude Code | Cannot claim peer-to-peer message governance |
| Codex spawn_agent not in published SDK | Codex | Cannot claim subagent spawn visibility |
| Cursor cloud webhooks "coming soon" | Cursor | Cloud agent mid-session events not available yet |
| Multica no outbound webhooks | Multica | Cannot claim real-time Multica event governance |
| Devin guardrail violations post-hoc only | Devin | Cannot claim pre-violation enforcement |
| LangGraph requires graph modification | LangGraph | Cannot claim external governance |

These gaps must be reviewed when:
- A new runtime version ships that may address the gap
- Sprint research confirms or extends a gap
- A customer or investor asks a direct question about the gap

When a gap is resolved, update this document and the relevant adapter
design document before updating claims in any external-facing material.

---

## Open Questions

1. When Warp/Oz spawns Claude Code as a sub-harness, which tier applies to the Claude Code execution inside Oz? Does Oz's governance layer count as AWF-equivalent?
2. If Cursor cloud agent outbound webhooks ship, does Tier 1 claim language change for cloud agents?
3. For LangGraph, if the graph owner does not adopt AWF nodes, can AWF still observe via astream_events externally without modifying the graph?

## Implementation Checklist

- [ ] Every adapter design document includes a Claims and Limits section referencing this doc
- [ ] No external material uses language from a higher tier to describe a lower tier adapter
- [ ] Known gaps table reviewed at every sprint boundary
- [ ] Standard language approved by founder before any investor or pilot conversation
- [ ] Hook installation status tracked per deployment environment

## Acceptance Evidence

This document is satisfied when:
- Every adapter design document (DESIGN-04 through DESIGN-12) includes a Claims and Limits section
- Each Claims and Limits section is traceable to a specific tier in this document
- No adapter claims E3 evidence without requiresRuntimeHookInstall verified true and hooks deployed

## Claims Approved for External Use

**Approved:**
"AWF applies the same governance lifecycle to every runtime. Enforcement depth varies by what the runtime exposes."
"AWF documents exactly what it can and cannot claim for each runtime tier."
"AWF is a cross-runtime governance layer with explicit enforcement limits per adapter."

**Not approved:**
Any claim that AWF provides real-time enforcement for Devin, Multica or any observation-only tier runtime.
The phrase "AWF is the only cross-runtime governance layer" — too absolute and unverifiable.

---

*Document owner: Founder*
*Version 1.1 — LOCKED. CTO corrections applied. Tier 1 split into capable vs installed/active.*
*"Every tool call" qualified to "exposed through the runtime hook surface."*
*Codex hook explanation added. Four hook conditions required before E3 claim.*
*Standard sections added.*
