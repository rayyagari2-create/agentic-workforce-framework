# Work Queues

> **Status:** Designed for multi-team deployments. Not yet field-proven
> in the reference implementation (single-session direct assignment is
> used today). Schema published in
> `database/enterprise/005_work_queue_items.sql`.

## Opening — What Work Queues Are

At single-founder scale, work is assigned directly in each session —
the founder gives the Orchestrator a task and the session begins.
There is no queue because there is one workspace, one decision-maker,
and one stream of work that a single human can hold in mind at once.
At enterprise scale with multiple teams and agents, direct assignment
does not scale: a Tech Lead cannot dispatch every task across multiple
parallel agents in real time, and an executing agent that has finished
its current item needs somewhere to look for the next one without
waiting for a human to hand it off. Work queues decouple task
definition from task assignment — work enters the queue when it is
defined, the Orchestrator routes it by capability, and agents pull
from it when capacity exists.

---

## The Eight-State Lifecycle

A work item moves through a fixed lifecycle. Forward progress runs
from `created` through `complete`; `failed` and `blocked` are branch
terminals that the Orchestrator re-routes from. The status enum in
`005_work_queue_items.sql` matches this lifecycle exactly.

| # | State | Meaning |
|---|---|---|
| 1 | `created` | Task defined; not yet assigned to any agent. |
| 2 | `assigned` | Routed to an agent instance by the Team Orchestrator. |
| 3 | `in_progress` | Agent has started; locks active. |
| 4 | `pending_review` | HITL gate triggered; waiting for approval. |
| 5 | `qa_in_progress` | QA Agent is running its verdict pass. |
| 6 | `complete` | QA PASS; locks released; work committed. |
| 7 | `failed` | QA FAIL; returned to the Orchestrator for re-routing. |
| 8 | `blocked` | Dependency unresolved; waiting for Orchestrator review. |

Lifecycle transitions are not mutations of audit entries — they
generate new audit events. Each status change emits an `audit_log`
row carrying `before_state` and `after_state`, so the full trajectory
of any item can be reconstructed independently of the current row.
Identity fields (`id`, `tenant_id`, `workspace_id`, `created_by`,
`risk_level`, `task_id`, `domain`, `files_in_scope`, `manifest_hash`,
`created_at`) are immutable. The lifecycle fields (`status`,
`assigned_agent_instance_id`, the transition timestamps,
`strike_count`, `blocked_reason`) are the ones that move.

`risk_level` is immutable for a specific reason: re-classifying a
task mid-flight would let an agent escape the gate that fired at
`created` time. Once a task is HIGH risk, it stays HIGH risk for the
duration of that work item.

---

## Assignment Rules

Work moves out of `created` into `assigned` when the Team Orchestrator
routes it to a specific agent instance. Routing follows three rules.

- **Assign by capability boundary, not by availability alone.** The
  Orchestrator picks the agent whose declared scope covers the work,
  not just the first idle agent. Routing by availability fills the
  fastest agent's queue first, regardless of fit, and wastes the
  agent's trust history on tasks it does not specialize in.
- **The trust gate applies at assignment, not at execution.** An
  agent at PROBATION may not receive HIGH-risk tasks. The Orchestrator
  checks the agent's current tier before setting
  `assigned_agent_instance_id`; if the tier does not clear the work's
  risk level, the agent is not eligible and routing falls to another
  candidate or escalates.
- **Manifest discipline at queue time.** The row carries a
  `manifest_hash` taken when it was created. The runtime verifies
  on dequeue that the manifest has not been edited since; a mismatch
  blocks pickup. This prevents the failure mode where a manifest is
  silently relaxed between queue-time and execution-time.

The work-pull query — "what is the highest-priority unassigned item
in this workspace?" — is served by the `idx_work_queue_items_pull`
index on `(workspace_id, status, priority, created_at)`. Lower
priority numbers run first; ties break by creation order so older
work is not starved by newer arrivals.

---

## Strikes and the 3-Strike Threshold

`strike_count` increments each time a QA Agent returns FAIL on a
work item. The increment emits a `work_item.strike_recorded` audit
event. When `strike_count` reaches 3, the runtime fires an ESCALATION
gate before the next attempt — the lower tier no longer has
discretion to retry. The corresponding gate-level rule is described
in [approval-gate-chains.md](approval-gate-chains.md).

`strike_count` is reset only by an explicit Orchestrator action,
which is itself audited. There is no automatic reset on time passing
or on a successful intermediate transition. The strike record is
what makes "this task has not converged" a first-class signal —
visible at a glance and aggregable across the workspace via the
recurrence-detection query in the schema's example queries.

---

## BLOCKED and FAILED

The two branch-terminal states have different meanings and different
handling.

- **`failed`** indicates QA FAIL on this attempt. The Orchestrator
  may transition the item back to `assigned` (re-route to a different
  agent), back to `created` (re-queue with a refined manifest), or
  hold it for review. The transition is the Orchestrator's call,
  not the runtime's — failed items do not auto-re-queue.
- **`blocked`** indicates a dependency is unresolved: a prior task
  has not completed, an external system is unavailable, or a
  decision required to proceed has not been made. `blocked_reason`
  carries the free-text explanation. Blocked items are reviewed by
  the Team Orchestrator, not auto-re-queued.

The distinction matters because the responses are different. A
failed item is a quality issue the Orchestrator can re-route by
choosing a different agent or refining the manifest. A blocked item
is a structural issue — re-routing alone does not resolve it; the
underlying dependency must clear first. Both states preserve the
original assignment, the strike history and the manifest hash so
a re-entry into the lifecycle picks up with full context intact.

---

## Schema Reference

`database/enterprise/005_work_queue_items.sql` defines the
`work_queue_items` table — one row per item, with the lifecycle
status enum, the assignment fields, the strike counter, the
`manifest_hash` integrity check, and the priority field that drives
the work-pull queue. The schema's example queries section illustrates
the three most common access patterns: the work-pull query, the
per-agent in-flight view, and the recurrence-detection query that
surfaces items at the 3-strike threshold for the daily digest.

The `work_queue_status` enum is defined in the same file and matches
the eight-state lifecycle above exactly. The `risk_level` enum is
consumed from `002_workspaces.sql`. Foreign keys reference
`workspaces` (002) and `agent_instances` (004); `last_failure_id`
references the `failure_records` identifier published by the
governance schema, so a work item's failure history threads back to
the failure memory the next pre-task retrieval will surface.

---

## Cross-references

- Approval gate chains and 3-strike escalation: [approval-gate-chains.md](approval-gate-chains.md)
- Delegation rules: [delegation.md](delegation.md)
- Trust scoring and tier-based assignment: [trust-scoring.md](trust-scoring.md)
- Autonomy gates and capability boundaries: [autonomy-gates.md](autonomy-gates.md)
- Failure memory (referenced by `last_failure_id`): [failure-memory.md](failure-memory.md)
- HITL gates that drive `pending_review`: `docs/control-plane/hitl-gates.md`
- Build state machine context: `docs/control-plane/build-state-machine.md`
- Audit trail patterns: `docs/control-plane/audit-trail-patterns.md`
- Enterprise scaling architecture: `docs/architecture/enterprise-scaling.md`
- Schema: `database/enterprise/005_work_queue_items.sql`
