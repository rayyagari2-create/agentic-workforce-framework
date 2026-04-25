## About this file

- **Purpose:** Append-only message bus for the entire agent workforce.
  Every state transition — every session, every read, every lock,
  every spawn, every handoff — is appended here. This is the canonical
  audit trail.
- **Who writes:** Every agent. The Orchestrator writes the most. Every
  executing agent writes at every state change (START, LOCKED,
  WORKING, PROGRESS, VERIFYING, COMPLETE, RELEASED, BLOCKED).
- **Mutability:** **Append-only.** Never insert in the middle. Never
  edit a prior entry. Never delete entries. Editing this file is a
  D2=0 (falsified telemetry) categorical hard-stop that demotes the
  agent to PROBATION regardless of prior tier.
- **How to initialize:** Start with an `INIT` entry (shown below) or
  leave empty. The first agent to boot will append entries.

---

# Agent Bulletin

## Format

Every entry is one line:

```
[YYYY-MM-DD HH:MM] [AGENT-LABEL] STATUS: message
```

Timestamp comes from `Bash(date +"%Y-%m-%d %H:%M")`. Never approximated.

## Status values

| Status | When written |
|---|---|
| `STARTUP` | Orchestrator begins boot sequence |
| `READING` | Agent is reading a specific file during startup |
| `ACTIVATED` | Orchestrator accepted a task |
| `CONFIRMED` | Orchestrator finished confirm-back |
| `TASK` | Founder stated the task |
| `BASELINE` | Orchestrator recorded baseline guard counts |
| `P0-CHECK` | Orchestrator finished P0 reconciliation |
| `ANALYZING` | Phase 1 file reads |
| `DEPENDENCY MAP` | Phase 2 complete |
| `OWNERSHIP` | Phase 3 complete |
| `WAVES PLANNED` | Phase 4 complete |
| `MANIFEST` | AgentTaskManifest written |
| `SIDECAR` | Sidecar JSON written |
| `SPAWNING` | Orchestrator about to call Task tool |
| `STARTED` | Agent began its instructions |
| `LOCKED` | Agent confirmed its file locks |
| `WORKING` | Agent began a step |
| `PROGRESS` | Step X of Y complete |
| `BLOCKED` | Agent cannot proceed (reason in message) |
| `READY` | Agent published an interface others wait on |
| `VERIFYING` | Agent is running a verification check |
| `COMPLETE` | Agent finished all steps |
| `RELEASED` | Agent released file locks |
| `RETURN` | Orchestrator processed agent's return |
| `VALIDATE` | Orchestrator validated agent output |
| `MONITORING` | Orchestrator waiting on other agents |
| `UNBLOCKING` | Orchestrator spawning a fix for a blocker |
| `WAVE COMPLETE` | All agents in a wave returned |
| `QA` | Orchestrator spawning QA-Agent |
| `QA-CYCLE` | Numbered QA attempt |
| `QA-FIX` | Spawning Fix-Agent after QA fail |
| `FIX-LOOP` | Spawning Fix-Agent after validation fail |
| `ESCALATING` | Surfacing to founder |
| `HITL_REQUIRED` | Gate fired; waiting for human |
| `FINAL VERIFICATION` | Per-check Phase 8 result |
| `VERIFICATION` | Phase 8 aggregate result |
| `ENUM-PARITY` | Contract-enum parity confirmation |
| `SESSION COMPLETE` | Session close — only valid after QA PASS |
| `DONE` | Generic completion state |

**Never invent new status values.** New status values require an
evolution-queue proposal and a human edit to this list. Using an
unknown status is a D3=0 hit.

---

## Hard Rules

1. **Append only.** New entries go at the end of file. Never in the
   middle. Never edit a prior line. Never delete lines.
2. **Every agent, every state change.** Silent execution between
   events is a D2=0 hit. If an agent takes more than one action
   without a bulletin entry, it is falsifying its own trail.
3. **Baseline line is mandatory before Phase 5.** Phase 8 re-runs the
   same greps. No baseline = Phase 8 cannot run = session cannot
   close.
4. **Trust the bulletin over agent claims.** Orchestrator reads the
   bulletin before every decision. If the bulletin and an agent's
   return message disagree, the bulletin wins.
5. **SESSION COMPLETE requires QA PASS on record earlier in this
   file.** The hook layer blocks a SESSION COMPLETE entry that is not
   preceded by a matching QA PASS.

---

## Worked Example — a full session lifecycle

This is three example entries showing the shape of a complete task
lifecycle (startup → spawn → completion). A real session contains
dozens to hundreds of entries.

```
[2026-04-24 14:32] [SESSION] INIT: bulletin initialized for new workforce
[2026-04-24 14:33] [ORCHESTRATOR] STARTUP: orchestrator boot sequence begin
[2026-04-24 14:33] [SESSION] READING: governance/project-conventions.md
[2026-04-24 14:33] [SESSION] READING: governance/locked-states.md
[2026-04-24 14:33] [SESSION] READING: governance/agent-locks.md
[2026-04-24 14:33] [SESSION] READING: governance/agent-bulletin.md
[2026-04-24 14:34] [SESSION] READING: governance/build-status.md
[2026-04-24 14:34] [SESSION] READING: governance/failure-library.md
[2026-04-24 14:34] [SESSION] READING: governance/evolution-queue.md
[2026-04-24 14:34] [SESSION] READING: governance/autonomy-registry.md
[2026-04-24 14:34] [SESSION] READING: governance/routing-table.md
[2026-04-24 14:34] [SESSION] READING: governance/hitl-gate.md
[2026-04-24 14:35] [SESSION] READING: governance/pre-spawn-protocol.md
[2026-04-24 14:35] [ORCHESTRATOR] P0-CHECK: CLEAR
[2026-04-24 14:35] [ORCHESTRATOR] BASELINE: forbidden_strings=0 model_conformance=0 env_leaks=0
[2026-04-24 14:36] [SESSION] CONFIRMED: orderbook, claude-opus-4-7
[2026-04-24 14:36] [ORCHESTRATOR] ACTIVATED: awaiting task from founder
[2026-04-24 14:37] [SESSION] TASK: add /api/orders pagination
[2026-04-24 14:38] [ORCHESTRATOR] ANALYZING: reading src/api/orders.ts, src/db/orders.ts
[2026-04-24 14:40] [ORCHESTRATOR] DEPENDENCY MAP: 1 blocks, 2 free
[2026-04-24 14:41] [ORCHESTRATOR] OWNERSHIP: AGENT-1=src/api/orders.ts, AGENT-2=src/db/orders.ts
[2026-04-24 14:41] [ORCHESTRATOR] WAVES PLANNED: 2 waves, 2 agents
[2026-04-24 14:42] [ORCHESTRATOR] MANIFEST: 01HJ8K-pagination riskLevel=medium domains=2
[2026-04-24 14:42] [ORCHESTRATOR] SIDECAR: manifests/01HJ8K-pagination.json written
[2026-04-24 14:43] [ORCHESTRATOR] SPAWNING: AGENT-2 for src/db/orders.ts (wave 0)
[2026-04-24 14:44] [AGENT-2] STARTED: add pagination params to query builder
[2026-04-24 14:44] [AGENT-2] LOCKED: src/db/orders.ts
[2026-04-24 14:47] [AGENT-2] WORKING: drafting cursor-based pagination interface
[2026-04-24 14:52] [AGENT-2] READY: PAGINATION_SHAPE { cursor: string, limit: number }
[2026-04-24 14:53] [AGENT-2] COMPLETE: pagination params added to 2 query functions
[2026-04-24 14:53] [AGENT-2] RELEASED: src/db/orders.ts
[2026-04-24 14:54] [ORCHESTRATOR] RETURN: AGENT-2 returned — reading handoff
[2026-04-24 14:54] [ORCHESTRATOR] VALIDATE: PASS — all criteria met
[2026-04-24 14:55] [ORCHESTRATOR] WAVE COMPLETE: 1/1 agents done
[2026-04-24 14:55] [ORCHESTRATOR] SPAWNING: AGENT-1 for src/api/orders.ts (wave 1)
[2026-04-24 14:56] [AGENT-1] STARTED: wire pagination params to HTTP handler
[2026-04-24 14:56] [AGENT-1] LOCKED: src/api/orders.ts
[2026-04-24 14:56] [AGENT-1] WORKING: reading PAGINATION_SHAPE from bulletin
[2026-04-24 15:01] [AGENT-1] COMPLETE: handler accepts cursor/limit, passes to query
[2026-04-24 15:01] [AGENT-1] RELEASED: src/api/orders.ts
[2026-04-24 15:02] [ORCHESTRATOR] RETURN: AGENT-1 returned — reading handoff
[2026-04-24 15:02] [ORCHESTRATOR] VALIDATE: PASS — all criteria met
[2026-04-24 15:03] [ORCHESTRATOR] QA: spawning QA-Agent
[2026-04-24 15:08] [ORCHESTRATOR] QA-CYCLE: 1 — verdict=pass
[2026-04-24 15:09] [ORCHESTRATOR] FINAL VERIFICATION: forbidden_strings baseline=0 current=0 delta=0
[2026-04-24 15:09] [ORCHESTRATOR] FINAL VERIFICATION: model_conformance baseline=0 current=0 delta=0
[2026-04-24 15:09] [ORCHESTRATOR] FINAL VERIFICATION: env_leaks baseline=0 current=0 delta=0
[2026-04-24 15:09] [ORCHESTRATOR] VERIFICATION: PASS
[2026-04-24 15:10] [ORCHESTRATOR] SESSION COMPLETE: pagination shipped, ready for commit review
```

Three entries from mid-session showing the required lifecycle shape:

```
[2026-04-24 14:44] [AGENT-2] STARTED: add pagination params to query builder
[2026-04-24 14:53] [AGENT-2] COMPLETE: pagination params added to 2 query functions
[2026-04-24 14:53] [AGENT-2] RELEASED: src/db/orders.ts
```

---

## Cross-references

- `agents/orchestrator.md` — writes most entries here
- `governance/project-conventions.md` — defines the timestamp + label
  format
- `governance/agent-locks.md` — paired audit artifact
- `docs/control-plane/audit-trail-patterns.md` — how to read this file
  during post-session review
