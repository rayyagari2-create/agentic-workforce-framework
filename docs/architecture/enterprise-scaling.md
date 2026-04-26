# Enterprise Scaling

> **Status: Reference Pattern at multi-team scale. Ships with v3.0.**
>
> The single-workspace operating model is live in the reference
> implementation. The multi-workspace, multi-team extension described in
> this document has been designed but not yet validated under real
> multi-team load. Treat this document as the architectural target, not as
> what runs today.

This document describes how the framework scales from a single-workspace,
single-founder operating model to team, division, and enterprise scope —
**without** changing the underlying agent definitions, trust model, or
pre-spawn protocol. The behavioral governance layer is the same at every
scale. What changes is the surrounding structure.

The content below is drawn from Section 11 of the source architecture
specification. ADR-0005 records the decision to ship this content in v3.0
once it has been field-proven, rather than publish an untested model as
v1.

---

## Why Scaling Is Its Own Document

At single-founder scale, the framework runs against one workspace, one
human reviewer, one Orchestrator, and a small team of executing agents.
Most decisions are made in real time. HITL approval is one person's
inbox. Trust scoring is one person's judgment. This works well and it
is what runs in the reference implementation today.

At multi-team scale, that operating model breaks in predictable ways:

- A single inbox cannot serve multiple teams' approvals.
- A single human cannot calibrate trust scores for fifty agents.
- A single Orchestrator cannot route work for multiple parallel teams.
- File-based bulletins and locks do not survive concurrent sessions
  across workspaces.

The enterprise extension addresses each of these without rewriting the
core model. The agents still have D1-D4 trust history. The pre-spawn
protocol still runs. The failure library still drives recurrence
detection. The autonomy gates still expand and contract. The extension
adds workspaces, role-agent alignment, work queues, persistent agent
identity that travels with trust history, and approval gate chains.

---

## Role-Agent Alignment

> *Status: Reference Pattern at multi-team scale.*

**The question.** When a human team is introduced, does each person get
their own Orchestrator instance?

**Answer.** No. Agents align to **roles**, not to individuals.

```
HUMAN TEAM                    AGENT TEAM
─────────────────────────────────────────
Tech Lead          ←→        Orchestrator
Backend Engineer   ←→        Backend Agent
Frontend Engineer  ←→        Frontend Agent
QA Lead            ←→        QA Agent
```

Agents are pooled and shared across the team. The Orchestrator belongs
to whoever is doing architectural coordination typically the tech
lead or a rotating designated role. HITL approval authority is
**role-gated**, not tied to who invoked the Orchestrator.

**Governing distinction.** Any authorized workspace member may invoke
the Orchestrator within their workspace scope. Only designated roles
may approve certain HITL gate types. **Invocation is workspace-scoped.
Authority is role-gated.** These are two separate layers, and
conflating them creates the bottleneck where every action requires
approval before it can even start.

---

## Manager Agent Pattern

> *Status: Reference Pattern at multi-team scale.*

At enterprise scale, the Orchestrator becomes a Manager Agent. The
hierarchy extends:

```
ENTERPRISE STRUCTURE
────────────────────────────────────────────────────────────
Division Orchestrator (VP-equivalent)
    │
    ├── Team Orchestrator A (Tech Lead Domain X)
    │       ├── Frontend Agent
    │       ├── Backend Agent
    │       └── QA Agent
    │
    └── Team Orchestrator B (Tech Lead Domain Y)
            ├── Backend Agent
            ├── Code Review Agent
            └── QA Agent
```

**Key rules at enterprise scale:**

- Manager Agents **route** work they do not execute it.
- Trust scores are **per-agent-instance**, not per-role. A QA Agent in
  Team A and Team B have separate trust trajectories.
- The Division Orchestrator can spawn **only** Team Orchestrators —
  not executing agents directly.
- HITL gates **escalate upward**. A Team Orchestrator cannot approve
  what requires Division-scope approval.

---

## Central Policy + Federated Execution

> *Status: Reference Pattern at multi-team scale.*

**The tension.** Enterprises need consistent governance policy across
all teams. Teams need autonomy to execute without central bottlenecks.

**Resolution.** Central policy definition + federated execution
authority.

```
CENTRAL (Division / Enterprise scope)
    Policy definitions in the agent_policies table
    Trust tier thresholds universal
    HITL gate classifications universal
    Failure taxonomy universal
    Compliance requirements universal

FEDERATED (Team scope)
    Task routing decisions team-owned
    Agent spawning Team Orchestrator owns
    File scope team-defined
    Bulletin and lock management per workspace
    Trust score review team-owned (within central rubric)
```

**What stays central always:**

- D1-D4 rubric and calibration anchors.
- Trust tier thresholds (HIGH / STANDARD / RESTRICTED / PROBATION).
- HITL gate trigger classifications.
- Failure library taxonomy classes.
- Audit log append-only, enterprise-scoped.

**What federates always:**

- Which agents are active in a workspace.
- Task assignment and routing.
- Sprint and session scoping.
- File ownership and lock management.

---

## Work Queue Architecture

> *Status: Reference Pattern at multi-team scale.*

At single-founder scale, work is assigned directly in each session.
At enterprise scale, work enters a queue and agents pull from it.

**Lifecycle:**

```
1. CREATED         Task defined, not yet assigned
2. ASSIGNED        Routed to agent by Team Orchestrator
3. IN_PROGRESS     Agent has started; locks active
4. PENDING_REVIEW  HITL gate triggered; waiting for approval
5. QA_IN_PROGRESS  QA Agent running verdict
6. COMPLETE        QA PASS; locks released; committed
7. FAILED          QA FAIL; returned to Orchestrator for re-routing
8. BLOCKED         Dependency not resolved; waiting
```

**Schema.** `work_queue_items` ships in `database/enterprise/` with the
v3.0 schema set. The status enum matches this lifecycle exactly. The
operational lifecycle mutability rule applies: status transitions are
not mutations of audit entries they generate new audit events.

**Assignment rules:**

- The Orchestrator assigns by **capability boundary** never by
  availability alone.
- An agent at PROBATION may not receive HIGH-risk tasks. The trust
  gate applies at assignment, not at execution.
- BLOCKED items are reviewed by the Team Orchestrator, not re-queued
  automatically.

---

## Persistent Agent Identity

> *Status: Reference Pattern at multi-team scale.*

At single-founder scale, agents are stateless between sessions they
read their instruction files and rebuild context each time. At
enterprise scale, agent identity persists across sessions, teams, and
projects.

**What persistent identity enables:**

- A trust score that **follows the agent** across teams. Reassigning
  a QA Agent from Team A to Team B does not reset its trust history.
- Failure memory that travels with the agent, not with the team.
- A behavioral trajectory visible to any Manager Agent that spawns
  this instance.
- A cryptographic identity (AGT DID, in the reference implementation)
  that persists across infrastructure changes.

**Schema.** `agent_instances` ships in `database/enterprise/`. Identity
fields are immutable. Operator assignment, status, and archived_at are
mutable, with every change producing an audit event.

**Why this matters.** An agent that earned HIGH trust in Team A does
not start at PROVISIONAL in Team B. Its trust history travels. Its
failure library entries travel. Its autonomy gate travels. **This is
what makes the agents-as-employees model genuinely enterprise-grade,
rather than a metaphor.**

---

## Approval Gate Chains

> *Status: Reference Pattern at multi-team scale.*

**Single-founder model.** All HITL approvals go to one person.

**Enterprise model.** Approval authority is role-gated and delegatable.

**Example chain:**

```
HIGH-risk task in Team A:
    Team Orchestrator A → HITL gate triggers
    → Routes to: Tech Lead A (approval authority for team scope)
    → If Tech Lead A unavailable: escalates to Division Orchestrator
    → Division Orchestrator → VP-equivalent approval

CRITICAL-risk task (cross-team, schema change):
    Team Orchestrator → cannot approve
    → Escalates to Division Orchestrator
    → Division Orchestrator → requires CTO-equivalent approval
    → CTO approves → Division Orchestrator authorizes Team Orchestrator
    → Team Orchestrator spawns the executing agent
```

**Schema.** `gate_records` ships in `database/enterprise/`.

**Delegation rules:**

- Delegation is **explicit** never implicit.
- A delegate **cannot** re-delegate.
- Delegation **expires** TTL is required on every delegation record.
- The audit log records every delegation and every approval decision.

---

## Multi-Workspace Bulletin and Lock Management

> *Status: Reference Pattern at multi-team scale.*

**Current state (single-founder).** One file-based bulletin, one
file-based lock list. Append-only.

**Wave 1 parallel session pattern.** Lane-prefixed bulletin entries
(`[LANE-A]`, `[LANE-B]`) with disjoint file scopes. Safe for two to
three parallel sessions in one workspace.

**Enterprise state (Postgres-backed).** The bulletin and lock state
move into Postgres tables (`agent_events` and `agent_locks`).
Row-level locking handles concurrent writes natively. Workspaces are
isolated by `workspace_id` Team A's bulletin is not visible to Team
B's agents by default.

**Cross-workspace visibility for the Division Orchestrator.** The
Division Orchestrator reads aggregate views across workspaces a
summary, not the full bulletin. This is the management layer, not full
transparency.

---

## Trust Score Calibration at Scale

> *Status: Reference Pattern at multi-team scale.*

**Single-founder calibration problem.** One human assigns all D1-D4
scores. Noisy labels degrade the autonomy gate signal over time.

**Enterprise calibration layers** (building on the v1.0 calibration
anchors):

| Layer | Mechanism | Status |
|---|---|---|
| 1 | Evidence requirement one line per dimension | v1.0 |
| 2 | Calibration anchor table | v1.0 |
| 3 | Automated scoring routine sending payloads to Eval/Telemetry Service | Wave 3+ |
| 4 | Cross-scorer calibration sessions | Wave 3+ |
| 5 | Calibration committee three or more scorers per high-stakes decision | Wave 3+ |

**Enterprise addition (Layers 4 and 5).** When multiple humans score
the same agent session, scores are compared before finalizing.
Disagreements above a threshold require explicit resolution and
rationale recorded in `manual_reviews`. This is the enterprise
equivalent of performance review calibration committees.

---

## Estimated Governance Overhead at Scale

> *Status: Reference Pattern at multi-team scale.*

The following estimates are **illustrative not measured.** They will
be updated with empirical data as multi-team deployments are
instrumented.

| Scale | Human Review Points Per Session | Governance Overhead |
|---|---|---|
| 1 reviewer, 1 agent | 3-5 decision points | ~15-20% of session time |
| 1 tech lead, 3 agents | 8-12 decision points | ~20-25% of session time |
| 5 team members, 8 agents | 15-25 decision points | ~25-30% async approvals required |
| Enterprise (50+ agents) | Policy-driven automation | HITL reserved for CRITICAL only |

**The governance gradient.** As agent count grows, human review gates
narrow from all MEDIUM+ at small team scale, to CRITICAL-only at
enterprise scale. Runtime policy enforcement, trust tiers, and
automated scoring absorb what humans reviewed manually at small scale.

This is not a reduction in governance rigor. It is a redirection of
human judgment to where it has the highest leverage.

---

## What Ships Now vs What Ships in v3.0

**Now (v1.0):**

- Architectural target, documented in this file.
- Generic placeholder schemas in `database/enterprise/` with a README
  noting they are reserved for v3.0.
- ADR-0005 explaining why we publish the design but not the
  implementation.

**v3.0 (when field-proven):**

- Full SQL schema set in `database/enterprise/`.
- Multi-workspace adoption guide in `docs/guides/enterprise-adoption.md`.
- Multi-team example in `examples/multi-team/`.
- Updated implementation status table in the root README.

**The criterion for v3.0 release.** The reference implementation must
have validated this model under real multi-team load. Until then, this
document is the design not the claim. We do not want to publish an
untested model as if it were v1.

---

## Related

- [ADR-0005](decision-records/0005-enterprise-scaling-is-v3-field-proven.md) —
  Decision to defer publication of the enterprise extension to v3.0.
- `docs/concepts/work-queues.md` Work queue lifecycle (v2.0).
- `docs/concepts/approval-gate-chains.md` Gate chain composition
  (v2.0).
- `docs/concepts/delegation.md` Explicit-only delegation rules
  (v3.0).
- `docs/guides/enterprise-adoption.md` Adoption walkthrough (v3.0).
