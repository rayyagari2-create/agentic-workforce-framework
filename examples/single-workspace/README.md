# Single Workspace Reference Implementation [v1.0]

The full single-workspace reference. This is what the framework's reference implementation actually runs today: file-based bulletin, Postgres governance schema, OS-level hooks, manual D1-D4 scoring, AGT in shadow mode. Five-agent roster.

This example is for teams who have committed to the framework and are ready to invest engineering time. If you have not yet run a scored session, start with [`../minimum-viable-adoption/`](../minimum-viable-adoption/) first.

---

## What was built

| Capability | Implementation | Status in reference |
|---|---|---|
| Five-agent roster | Capability boundaries enforced in instruction files; orchestrator validates at task assignment | Live |
| AgentTaskManifest | JSON schema validated; manifest required for all medium/high-risk tasks | Live |
| File-based agent bulletin | One markdown file per agent with phase-tagged entries | Live |
| File locks | Path-qualified advisory lock pattern | Live |
| Postgres governance schema | `001_audit_log` through `005_routine_runs` from `database/governance/` | Schema live, data migration in progress |
| OS-level hooks | 13 PreToolUse / PostToolUse hooks. exit(2) blocks. Fail closed. | Live |
| Manual D1-D4 trust scoring | Per-session, per-agent, evidence per dimension | Live, 50+ sessions in reference implementation |
| FailureRecord lifecycle | Schema-validated. Pre-task retrieval. Three-tag close. | Live |
| Pre-spawn protocol | STEP 1 risk classification, STEP 2 manifest creation, STEP 3 spawn or escalate | Live |
| Build state machine | DEBUG → SPEC → PLAN → BUILD → QA → COMPLETE | Live |
| AGT runtime policy adapter | Shadow mode intercepts and logs; does not block | Shadow live |
| HITL gates | File-based for the single-workspace reference; gate types HITL only (no DELEGATION/ESCALATION/APPROVAL chains yet) | Live |

---

## What it costs

Honest engineering time estimate from the reference implementation. Your numbers will differ the goal is to set expectations, not to claim universality.

| Component | First-time engineering investment | Ongoing per session |
|---|---|---|
| Roster + capability boundaries (instruction files for 5 agents) | 8-12 hours | None |
| Postgres governance schema | 4-6 hours (run the migrations, validate RLS) | None |
| Hook system (13 hooks, fail closed, override pattern) | 20-30 hours initial; 2-4 hours per new hook | None runs in band |
| File-based bulletin and lock infrastructure | 10-15 hours | 5-10 minutes per session for entries |
| AgentTaskManifest tooling (write template, validation) | 4-6 hours | 10-20 minutes per task to author |
| QAVerdict structure + first eval suite | 12-20 hours | 20-45 minutes per task to verify |
| D1-D4 manual scoring + ledger discipline | 4-8 hours setup; ongoing calibration | 15-30 minutes per session |
| FailureRecord process (template, retrieval, three-tag close) | 4-8 hours | 30-60 minutes per failure |
| Pre-spawn protocol (decision tree, escalation triggers) | 6-10 hours | 5-10 minutes per spawn |
| AGT shadow mode adapter | 12-20 hours | None runs in band |

**Total first-time investment:** approximately 80-140 engineering hours. Roughly 2-4 working weeks for one engineer with the framework documents as input.

**Per-session overhead:** approximately 60-120 minutes of governance overhead per scored session. This is the price of accountability. It is not optional.

---

## What it catches (example failures prevented)

A representative sample from the reference implementation's first 15 scored sessions. All scenarios sanitized.

| Scenario | What was caught | Where it caught |
|---|---|---|
| `billing-rate-bug` agent-srv computed rates with off-by-one on tier boundary | QA-Agent's contract test caught the boundary condition before any commit | QA verdict, D1=10 (significant rework) |
| `search-index-refactor` agent-srv wrote a field name not in the contract | Schema validation hook blocked the commit. Without the hook, the camelCase/snake_case mismatch would have shipped to staging. | Hook (PreToolUse on commit), D3=22 |
| `content-import` agent-fe attempted a database write outside the assigned interfaces | Capability boundary check at orchestrator task assignment refused the task | Pre-spawn STEP 1, no work performed |
| Repeat `schema_violation` after FAIL-2026-04-12-001 | Pre-task retrieval surfaced the prior FailureRecord; the orchestrator brief included the prevention rule explicitly | D4=25 (pattern caught early) |
| Subagent attempted to spawn its own subagent | check-agent-spawn hook blocked, exit(2) | Hook layer, no work performed |
| Bulletin missing entries agent-srv silently retried after a tool error | check-bulletin-order hook required WORKING entry before allowing DONE; surfaced the gap | Hook layer, D2=18 |
| `wont_fix` proposed by fix-agent without founder approval | HITL gate triggered. Closure refused until founder approval written. | Pre-spawn STEP 3, fix held |
| Falsified telemetry (agent claimed test pass that did not run) | D2=0 hard stop. Automatic demotion. FailureRecord required. | Trust scoring, post-session review |

The pattern: hooks catch violations at runtime; QA catches contract issues mid-task; trust scoring catches behavioral patterns across sessions; failure records catch class-level recurrence.

---

## Prerequisites

Before adopting the single-workspace reference, you need:

1. **Postgres** (or Supabase). The governance schema in `database/governance/` requires Postgres-compatible SQL. Sqlite will not work RLS is required.
2. **A hook runner.** The reference implementation runs Claude Code, which provides PreToolUse and PostToolUse hooks. Equivalent runners include any agent runtime that supports OS-level pre/post execution hooks. Without hooks, the control plane is partial you have manifest discipline and trust scoring but no enforcement.
3. **A file-based or database-backed bulletin.** The reference implementation uses file-based for v1.0 with the migration to Postgres in progress. Either is acceptable.
4. **One human reviewer with calibration authority.** D1-D4 scoring is observer-assigned. Without a single calibrated reviewer, scores drift.
5. **A version-controlled instruction file per agent.** The agent's job description and capability boundary live in the instruction file. Changes are tracked in git.
6. **A discipline budget.** Approximately 60-120 minutes of governance overhead per scored session. If you cannot commit to this, the reference is not yet appropriate go back to minimum viable adoption.

---

## Order of implementation

Build in the order below. Each step builds on the previous. Skipping order is the most common reason teams stall.

| Order | Component | Why it comes here |
|---|---|---|
| 1 | Five-agent roster + instruction files | Without roles and boundaries, nothing else is meaningful |
| 2 | AgentTaskManifest + QAVerdict templates | The contract structure must exist before you can score against it |
| 3 | File-based bulletin + locks | Observability has to exist before D2 scoring can mean anything |
| 4 | Manual D1-D4 scoring + ledger | Calibrate scoring on real sessions before anything else |
| 5 | FailureRecord lifecycle + pre-task retrieval | The system has to learn from failures before automation is added |
| 6 | Postgres governance schema | When file-based ledger becomes unwieldy (typically n>=15 sessions) |
| 7 | OS-level hooks (start with 2-3) | Add hooks for the violations you have actually observed, not hypothetical ones |
| 8 | Pre-spawn protocol formalized | Once steps 1-7 are reliable, the protocol becomes the orchestrator's checklist |
| 9 | Build state machine enforcement | The state machine is the documentation of what already happens. Codify last. |
| 10 | AGT shadow mode adapter | Shadow mode validates the runtime policy layer before enforce |

The order matters because: you cannot calibrate scoring without sessions to score; you cannot write meaningful hooks without violations to prevent; you cannot adopt enforcement before shadow mode confirms the policies are not over-blocking.

---

## What is NOT in this reference

This single-workspace reference is intentionally bounded. The following are not included and require the v3.0 enterprise extension:

- Multi-workspace deployments
- Division Orchestrator
- Persistent agent identity across sessions (`agent_instances`)
- Full work queue lifecycle (`work_queue_items` with status enum)
- Approval gate chains beyond simple HITL (DELEGATION / ESCALATION / APPROVAL with TTL)
- Automated D1-D4 scoring (R10 routine)

See [`../multi-team/README.md`](../multi-team/README.md) for the v3.0 status.

---

## Files in this directory

- [`README.md`](README.md) this file
- [`agent-roster-template.md`](agent-roster-template.md) extended roster with trust history, autonomy gates per agent, ADR references, instruction file ownership
- [`session-scoring-walkthrough.md`](session-scoring-walkthrough.md) full annotated session: pre-spawn through trust scoring, including a QA loop with first-attempt fail and re-QA pass
