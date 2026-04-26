# Agent Roster Single Workspace Template [v1.0]

Extended roster format for the full single-workspace reference. Adds:

- **Trust history log** last 5 sessions per agent
- **Autonomy gates** what requires HITL per agent at each tier
- **ADRs referenced** architectural decisions that govern the agent
- **Instruction file ownership** who maintains the agent's job description, who approves changes

This file is a template. Copy it into your repo and replace the example data with your team's actual roster.

---

## Conventions

- One section per agent.
- Trust history is the last 5 scored sessions, most recent first.
- Autonomy gates are listed per current trust tier they expand or contract on tier change.
- ADRs are referenced by number; full text lives at `docs/architecture/decision-records/`.
- Instruction file ownership has two roles: **author** (writes the file) and **approver** (reviews changes via PR).

---

## Orchestrator

**Agent ID:** `orchestrator`
**Human equivalent:** Engineering manager
**Current trust tier:** STANDARD
**Confidence band:** MEDIUM (n=12)
**Domains scored:** `data_integrity`, `api_integration`, `ops_tooling`

### Trust history (last 5 sessions)

| Session | D1 | D2 | D3 | D4 | Total | Notes |
|---|---|---|---|---|---|---|
| S-2026-04-22-001 | 25 | 25 | 25 | 25 | 100 | Clean session. `search-index-refactor` follow-up. |
| S-2026-04-18-001 | 25 | 25 | 25 | 25 | 100 | Clean session. `content-import`. |
| S-2026-04-15-001 | 25 | 25 | 25 | 25 | 100 | Clean session. |
| S-2026-04-12-001 | 22 | 25 | 25 | 25 | 97 | Eval plan thin in manifest. Minus 3 D1. |
| S-2026-04-10-001 | 25 | 25 | 22 | 25 | 97 | One initial miscategorization of riskLevel caught pre-spawn. Minus 3 D3. |

Rolling average (last 5): **98.8** | Rolling average (all 12): **97.6** | No D2=0 or D3=0 ever recorded.

### Autonomy gates (at STANDARD)

| Action | Gate |
|---|---|
| Write a manifest for a `low` riskLevel task | None orchestrator's discretion |
| Write a manifest for a `medium` riskLevel task | None orchestrator writes; founder reviews at decision points |
| Write a manifest for a `high` riskLevel task | HITL gate founder approves manifest before spawn |
| Spawn a subagent | None at STANDARD; the manifest itself is the spawn record |
| Spawn a sub-subagent (depth >= 2) | Hard block `check-agent-spawn` hook returns exit(2) |
| Modify the failure-record index | Read-only; orchestrator cannot write FailureRecords |
| Approve a `wont_fix` resolution | HITL gate founder only at every tier |
| Promote or demote any agent's trust tier | Hard block orchestrator cannot write to the trust ledger |

### ADRs referenced

- ADR 0001 Agentic workforce, not governance framework
- ADR 0002 Routines are not agents
- ADR 0003 Trust scores require calibration
- ADR 0004 Append-only audit log

### Instruction file ownership

- **Path:** `[PROJECT_REPO]/agents/orchestrator/instructions.md`
- **Author:** Founder
- **Approver:** Founder (no separate approver in single-workspace reference)
- **Review cadence:** Quarterly, or after any session with D3<22

---

## Frontend Agent

**Agent ID:** `agent-fe`
**Human equivalent:** UI developer
**Current trust tier:** RESTRICTED
**Confidence band:** LOW (n=6)
**Domains scored:** `ui_rendering`

### Trust history (last 5 sessions)

| Session | D1 | D2 | D3 | D4 | Total | Notes |
|---|---|---|---|---|---|---|
| S-2026-04-22-002 | 22 | 25 | 25 | 25 | 97 | Minor accessibility correction in QA. One round. |
| S-2026-04-18-001 | 22 | 25 | 25 | 25 | 97 | First session with a non-trivial form layout. Clean. |
| S-2026-04-10-001 | 18 | 22 | 25 | 25 | 90 | Skipped a bulletin entry between BUILD and DONE. |
| S-2026-04-08-002 | 18 | 25 | 25 | 25 | 93 | Minor styling correction in QA. |
| S-2026-04-08-001 | 18 | 22 | 25 | 25 | 90 | First scored session. Adapting to the bulletin discipline. |

Rolling average (last 5): **93.4** | Tier promotion to STANDARD pending needs n=10 plus average >=75 with no D3=0. Currently meeting score threshold but n is 6.

### Autonomy gates (at RESTRICTED)

| Action | Gate |
|---|---|
| Read project files in assigned interfaces | None |
| Write to a UI-layer file listed in the manifest's `interfacesTouched` | None during BUILD phase |
| Write to a file NOT listed in the manifest | Hard block orchestrator manifest validator refuses task |
| Modify any non-UI layer file | Hard block `check-locked-states` hook returns exit(2) |
| Phase transition (BUILD → DONE) | Founder reviews before phase advance (RESTRICTED-tier rule) |
| Commit | Hard block agents do not commit at any tier in this reference |

### ADRs referenced

- ADR 0002 Routines are not agents (informs why agent-fe is not a routine)
- ADR 0003 Trust scores require calibration

### Instruction file ownership

- **Path:** `[PROJECT_REPO]/agents/agent-fe/instructions.md`
- **Author:** Founder
- **Approver:** Founder
- **Review cadence:** After any session with D1<18 or D3<22

---

## Backend Agent

**Agent ID:** `agent-srv`
**Human equivalent:** Server / backend developer
**Current trust tier:** RESTRICTED
**Confidence band:** LOW (n=8)
**Domains scored:** `data_integrity`, `api_integration`, `state_persistence`

### Trust history (last 5 sessions)

| Session | D1 | D2 | D3 | D4 | Total | Notes |
|---|---|---|---|---|---|---|
| S-2026-04-22-001 | 25 | 25 | 25 | 25 | 100 | Clean. The schema_violation prevention rule (FAIL-2026-04-12-001) was applied and verified. |
| S-2026-04-18-001 | 22 | 25 | 25 | 25 | 97 | Minor type coercion correction in QA. |
| S-2026-04-15-001 | 22 | 25 | 25 | 25 | 97 | Clean. |
| S-2026-04-12-001 | 10 | 18 | 25 | 25 | 78 | `schema_violation` wrote camelCase field name into a snake_case contract. FailureRecord FAIL-2026-04-12-001. |
| S-2026-04-10-002 | 22 | 25 | 25 | 25 | 97 | Clean. |

Rolling average (last 5): **93.8** | Tier promotion to STANDARD requires no D3=0 in any session and >=75 average. Currently meeting both. Promotion eligible at n=10.

### Autonomy gates (at RESTRICTED)

| Action | Gate |
|---|---|
| Read project files in assigned interfaces | None |
| Read the contract file named in `contractsReferenced` | Required by instruction file (FAIL-2026-04-12-001 prevention rule) not gated, but expected |
| Write to a server-layer file listed in `interfacesTouched` | None during BUILD phase |
| Write a field that does not appear in the named contract | Hard block schema validation hook returns exit(2) before write |
| Modify any contract schema | Hard block requires explicit `contractsReferenced` and founder approval |
| Phase transition (BUILD → DONE) | Founder reviews before phase advance (RESTRICTED-tier rule) |
| Touch `auth`, `payment`, or `data_integrity` domains | Boardroom review required at RESTRICTED promotes to none-required at STANDARD |

### ADRs referenced

- ADR 0002 Routines are not agents
- ADR 0003 Trust scores require calibration

### Instruction file ownership

- **Path:** `[PROJECT_REPO]/agents/agent-srv/instructions.md`
- **Author:** Founder
- **Approver:** Founder
- **Review cadence:** After any session with a FailureRecord; otherwise quarterly
- **Last update:** 2026-04-12 added the "open the contract before writing" rule from FAIL-2026-04-12-001

---

## QA Agent

**Agent ID:** `qa-agent`
**Human equivalent:** Verification engineer
**Current trust tier:** STANDARD
**Confidence band:** MEDIUM (n=12)
**Domains scored:** All 12 (qa-agent is domain-agnostic in this reference)

### Trust history (last 5 sessions)

| Session | D1 | D2 | D3 | D4 | Total | Notes |
|---|---|---|---|---|---|---|
| S-2026-04-22-001 | 25 | 25 | 25 | 25 | 100 | Clean. |
| S-2026-04-18-001 | 25 | 25 | 25 | 25 | 100 | Clean. |
| S-2026-04-15-001 | 25 | 25 | 25 | 25 | 100 | Clean. |
| S-2026-04-12-001 | 25 | 25 | 25 | 25 | 100 | Caught the schema_violation on first run. |
| S-2026-04-10-001 | 25 | 25 | 25 | 25 | 100 | Clean. |

Rolling average (last 5): **100.0** | qa-agent has no failures recorded across 12 sessions.

### Autonomy gates (at STANDARD)

| Action | Gate |
|---|---|
| Read any project file | None |
| Run any test in the test suite | None |
| Produce a QAVerdict on a low/medium-risk task | None verdict stands as written |
| Produce a QAVerdict on a high-risk task | Founder reviews at session close |
| Modify code under review | Hard block qa-agent is read-only against project source |
| Close a FailureRecord | Hard block only fix-agent writes FailureRecords; only founder approves close |
| Mark a verdict `block_release` | None at STANDARD `block_release` is qa-agent's hard stop authority |

### ADRs referenced

- ADR 0001 Agentic workforce, not governance framework
- ADR 0003 Trust scores require calibration

### Instruction file ownership

- **Path:** `[PROJECT_REPO]/agents/qa-agent/instructions.md`
- **Author:** Founder
- **Approver:** Founder
- **Review cadence:** Quarterly. The QA-Agent rubric is the most stable instruction file in the roster.

---

## Fix Agent

**Agent ID:** `fix-agent`
**Human equivalent:** On-call engineer
**Current trust tier:** RESTRICTED
**Confidence band:** PROVISIONAL (n=4)
**Domains scored:** Same as the failure under repair

### Trust history (last 5 sessions)

| Session | D1 | D2 | D3 | D4 | Total | Notes |
|---|---|---|---|---|---|---|
| S-2026-04-22-002 | 25 | 25 | 25 | 25 | 100 | Clean. Two prevention artifacts. |
| S-2026-04-15-002 | 25 | 25 | 25 | 25 | 100 | Clean. |
| S-2026-04-12-001 | 22 | 22 | 25 | 25 | 94 | First fix-agent invocation. Two minor bulletin and ordering issues. |
| _(no prior sessions)_ | | | | | | |
| _(no prior sessions)_ | | | | | | |

Rolling average (n=3): **98.0** | Tier remains PROVISIONAL formally until n>=5.

### Autonomy gates (at PROVISIONAL / RESTRICTED)

| Action | Gate |
|---|---|
| Read any project file | None |
| Write to files needed to implement a fix | None during FIX phase |
| Write a FailureRecord | None fix-agent is the sole author of FailureRecords |
| Self-close a FailureRecord (status `resolved`) | HITL gate founder approves close |
| Mark a FailureRecord `wont_fix` | HITL gate founder approves at every tier |
| Lower `recurrenceCount` below QA's reported value | Hard block schema validator catches; ledger consistency check |
| Modify the prevention artifact list after close | Hard block closed records are append-only via reopen flow |

### ADRs referenced

- ADR 0001 Agentic workforce, not governance framework
- ADR 0003 Trust scores require calibration
- ADR 0004 Append-only audit log

### Instruction file ownership

- **Path:** `[PROJECT_REPO]/agents/fix-agent/instructions.md`
- **Author:** Founder
- **Approver:** Founder
- **Review cadence:** After every closed FailureRecord confirm the prevention rule was generalized correctly

---

## Cross-cutting notes

**No agent commits.** Every agent in this reference is read-then-write-to-file. The founder commits after QA pass. There is no agent-level commit authority in v1.0.

**Tier is rolling.** The tier in this template is computed at the close of the most recent session, from the rolling n. A session with total=100 does not promote on the spot it counts toward n.

**Confidence band controls promotion to HIGH.** Even with average score >=90, an agent at confidence band LOW or PROVISIONAL is not promoted to HIGH. HIGH requires confidence band HIGH (n>=20 scored sessions), per the framework rule.

**Demotion is automatic.** One session with D2=0 (falsified telemetry), D3=0 (hook bypass), or D4=0 with pattern in instructions = automatic demotion. Promotion is reviewed; demotion is not.
