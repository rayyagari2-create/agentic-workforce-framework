# Multi-Team Reference [v3.0 — designed, not field-proven]

> **Status: Designed, not yet field-proven at multi-team scale. Ships with v3.0.**
>
> The single-workspace operating model is live in the reference
> implementation (see [`../single-workspace/`](../single-workspace/)).
> The multi-workspace, multi-team extension described in this directory
> has been designed but not yet validated under real multi-team load.
> Treat the contents as the architectural target, not as something
> running in production. Implementation status is tracked in
> [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md).

This directory holds the v3.0 multi-team extension: a Division
Orchestrator coordinating two or more Team Orchestrators, each with
its own workspace, agents, and trust trajectories. The behavioral
governance layer (bulletin, locks, manifests, trust scoring, QA loop,
FailureRecord) does not change. What changes is the surrounding
structure — workspaces, role-gated approval chains, persistent agent
identity, and a cross-workspace summary lane.

---

## What this directory contains

| File | Purpose |
|---|---|
| [`README.md`](README.md) | This file — status, prerequisites, the four-level hierarchy, how the pieces fit together. |
| [`workspace-setup-template.md`](workspace-setup-template.md) | Workspace structure, role-agent alignment table, trust score isolation rules, bulletin lane protocol, and the table of when to escalate to Division Orchestrator. |
| [`division-orchestrator-example.md`](division-orchestrator-example.md) | One worked approval chain end-to-end: a CRITICAL cross-team schema change, walked from the Team Orchestrator's request through CTO approval, parallel Team Orchestrator execution, and gate-record close. |

Read in this order:

1. **This README** — to understand the prerequisites and the hierarchy.
2. **[`workspace-setup-template.md`](workspace-setup-template.md)** — to lay out the directories and decide who escalates what.
3. **[`division-orchestrator-example.md`](division-orchestrator-example.md)** — to see the chain in motion before walking your own.

---

## Prerequisites

Multi-team adoption builds on top of single-workspace adoption. Before
this extension is appropriate:

1. **Run the single-workspace reference reliably.** The governance
   discipline (bulletin, locks, manifests, manual D1-D4 scoring, QA
   loop, FailureRecord lifecycle) must be a habit in at least one
   workspace before scaling to multiple. The most common failure mode
   for early multi-team adopters is treating the extension as a
   substitute for single-workspace discipline, not as an addition to
   it. If you have not yet run [`../single-workspace/`](../single-workspace/)
   end-to-end, start there.

2. **At least 15 scored sessions in one workspace.** D1-D4 calibration
   is observer-assigned and noisy until the calibration anchor table
   has been exercised against real sessions. Multi-team scoring
   compounds the noise; calibrate one workspace first.

3. **A Postgres-backed (or equivalent) governance store.** File-based
   bulletin and locks survive concurrent writes inside one workspace
   via the lane protocol. Cross-workspace coordination — gate records,
   work queue lifecycle, persistent agent identity, cross-workspace
   audit log — needs row-level locking, transactional writes, and
   workspace isolation by `workspace_id`. The schemas in
   [`../../database/enterprise/`](../../database/enterprise/) are the
   migration target; do not stay on file-based once two workspaces are
   active.

4. **A second human reviewer with calibration authority.** Single-
   workspace runs work with one calibrated reviewer. Multi-team runs
   need at least two — one per team — and a calibration session
   between them in the first month. Without that, the same agent
   behavior produces different scores in different workspaces and
   the trust signal degrades.

5. **A Division Orchestrator runtime.** The Division Orchestrator is
   a Manager Agent that coordinates Team Orchestrators. It has a Task
   tool but its allowed `subagent_type` set is restricted to "team
   orchestrator" only — it cannot spawn executing agents directly.
   See [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md)
   for the full design.

6. **A discipline budget that grows non-linearly with team count.**
   Two teams is more than twice the overhead of one team. Approval
   chains, cross-workspace coordination, and shared-contract review
   add real wall-clock time. The estimates in `enterprise-scaling.md`
   put governance overhead at ~25-30% of session time at the
   five-team scale, narrowing to CRITICAL-only HITL at fifty agents.
   Plan for the high end at first.

---

## The four-level hierarchy

```
ENTERPRISE STRUCTURE
────────────────────────────────────────────────────────────
Division Orchestrator (VP-equivalent)
    │
    ├── Team Orchestrator A (Tech Lead Domain X)
    │       ├── Frontend Agent (Agent-FE)
    │       ├── Backend Agent  (Agent-SRV)
    │       ├── QA Agent
    │       └── Fix Agent
    │
    └── Team Orchestrator B (Tech Lead Domain Y)
            ├── Backend Agent  (Agent-SRV)
            ├── QA Agent
            └── Fix Agent
```

**Level 1 — Division Orchestrator.** Coordinates approval chains,
publishes the cross-workspace summary lane, holds the gate-records
table. Spawns Team Orchestrators only — never executing agents.
Cannot self-approve a CRITICAL task; routes to a CTO-equivalent
human authority instead.

**Level 2 — Team Orchestrator.** Runs the full single-workspace
operating loop within its own scope (pre-spawn protocol, manifest,
file ownership, wave sequencing, QA loop, Phase 8 final verification,
session close). Spawns executing agents only. Escalates upward when
the work crosses team boundaries, modifies a centrally-defined
contract, or carries a CRITICAL `riskLevel`.

**Level 3 — Executing agents.** Frontend Agent, Backend Agent, QA
Agent, Fix Agent. Identical to the single-workspace versions; no
behavioral change. Each instance has a persistent identity and a
trust trajectory that follows the instance, not the role and not the
workspace.

**Level 4 — Subagents (forbidden).** Subagents cannot spawn subagents
at any tier. Hard block enforced at the framework level via the
PreToolUse hook. This rule is identical at single-workspace and
multi-team scope; including it here is a reminder, not a
liberalization.

For the full architectural model — central policy plus federated
execution, work queue lifecycle, persistent agent identity,
cross-workspace bulletin and locks, calibration at scale, governance
overhead estimates — see [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md).

---

## What stays central, what federates

Repeated from `enterprise-scaling.md` because it is the load-bearing
distinction in this layer.

**Central (Division / Enterprise scope).** D1-D4 rubric and
calibration anchors. Trust tier thresholds (HIGH / STANDARD /
RESTRICTED / PROBATION / PROVISIONAL). HITL gate trigger
classifications. Failure taxonomy classes. Append-only audit log,
enterprise-scoped.

**Federated (Team scope).** Which agents are active in a workspace.
Task assignment and routing. Sprint and session scoping. File
ownership and lock management. Trust score reviews — within the
central rubric, scored by the team's calibrated reviewer. Bulletin
and lock management per workspace.

The rule of thumb: **the rubric is central, the scoring is local.**
A team scores its own agents using the central rubric; the central
rubric is changed only by an explicit policy update with a
cross-team review.

---

## What is NOT in this directory

- A worked path through delegation (a Tech Lead delegating their
  approval authority for a bounded TTL — explicit only, no
  re-delegation). The schema is in `gate_records`; the worked example
  is not yet written.
- A worked path through reject and timeout flows. The example file
  walks an APPROVED chain end-to-end; reject and TTL-expiry are
  designed but not yet walked.
- A worked path through three-fail QA escalation across teams.
- Empirical performance numbers. The estimates in
  `enterprise-scaling.md` are illustrative; this directory will be
  updated with measured numbers when the v3.0 reference
  implementation runs at multi-team scale.

These ship with the v3.0 release once field-proven.

---

## Related

- [`../single-workspace/`](../single-workspace/) — the prerequisite
  reference. Run this reliably first.
- [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md) —
  the full architectural model.
- [`../../database/enterprise/`](../../database/enterprise/) — Postgres
  schemas for `agent_instances`, `work_queue_items`, `gate_records`,
  `agent_events`, `agent_locks` (reserved for v3.0).
- [`../../agents/`](../../agents/) — agent command files. The same
  files are used at every scale; only the boundary prefixes and
  governance paths change per workspace.
