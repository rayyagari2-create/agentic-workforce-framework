# Workspace Setup Template — Multi-Team [v3.0 — designed, not field-proven]

> **Status: Designed, not yet field-proven at multi-team scale. Ships with v3.0.**
>
> The single-workspace operating model is live in the reference
> implementation (see [`../single-workspace/`](../single-workspace/)).
> The workspace, role-alignment, and lane protocol described below are
> the v3.0 multi-team extension, designed but not yet validated under
> real multi-team load. Treat this template as the architectural target,
> not as something running in production.

This template describes how to lay out a multi-team deployment so the
governance behavior described in [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md)
is the path of least resistance, not a discipline that has to be
enforced session-by-session. It complements [`division-orchestrator-example.md`](division-orchestrator-example.md),
which walks one approval chain end-to-end.

Run [`../single-workspace/`](../single-workspace/) reliably first. This
template assumes the governance discipline (bulletin, locks, manifests,
trust scoring, QA loop) is already a habit in at least one workspace
before scaling to multiple.

---

## Workspace structure

Every workspace owns the same governance file shape. The shape is
identical across workspaces; what differs is the workspace identifier
and the agents authorized to operate inside it. The Division
Orchestrator reads cross-workspace summaries; it does not read each
workspace's bulletin directly.

```
{repo-root}/
├── agents/                         (the framework command files;
│   ├── orchestrator.md              shared definitions, used by every
│   ├── agent-fe.md                  workspace — boundary path prefixes
│   ├── agent-srv.md                 are configured per workspace)
│   ├── qa-agent.md
│   └── fix-agent.md
│
├── workspaces/
│   ├── {workspace-A}/
│   │   ├── governance/
│   │   │   ├── agent-bulletin.md    (workspace-scoped message bus)
│   │   │   ├── agent-locks.md       (workspace-scoped file locks)
│   │   │   ├── build-status.md      (workspace task queue)
│   │   │   ├── failure-library.md   (workspace failure index)
│   │   │   ├── evolution-queue.md   (workspace-scoped proposals)
│   │   │   ├── locked-states.md     (workspace state-locks)
│   │   │   ├── routing-table.md     (which agent handles what)
│   │   │   ├── hitl-gate.md         (HITL config for this workspace)
│   │   │   ├── pre-spawn-protocol.md
│   │   │   ├── autonomy-registry.md
│   │   │   └── project-conventions.md
│   │   ├── handoffs/                (per-session handoff files)
│   │   ├── manifests/               (sidecar manifests for hooks)
│   │   ├── failure-records/         (FailureRecord JSON files)
│   │   ├── qa-reports/
│   │   │   └── verdicts/
│   │   └── src/                     (workspace's application code —
│   │       └── ...                   path prefixes that scope the
│   │                                 frontend/backend agents)
│   │
│   └── {workspace-B}/                (same shape; isolated by ID)
│       └── ...
│
├── division/
│   ├── division-bulletin.md          (cross-workspace summary lane —
│   │                                  Division Orchestrator publishes;
│   │                                  Team Orchestrators read; agents
│   │                                  do NOT)
│   ├── gate-records/                 (gate_records as JSON files
│   │                                  pre-Postgres; one file per gate)
│   └── audit-log/                    (append-only audit events
│                                      pre-Postgres; one file per day)
│
└── database/
    └── enterprise/                   (when migrating off file-based:
        ├── 001_workspaces.sql         agent_instances, work_queue_items,
        ├── 002_agent_instances.sql    gate_records, agent_events,
        ├── 003_work_queue_items.sql   agent_locks live here)
        ├── 004_gate_records.sql
        ├── 005_agent_events.sql
        └── 006_agent_locks.sql
```

**Rules of the shape:**

- **One workspace = one bulletin.** Cross-workspace coordination
  happens through `division/division-bulletin.md` (or
  `agent_events` with cross-workspace visibility) — never by writing
  into another workspace's bulletin.
- **Path prefixes scope the boundary, not the file type.** When
  configuring `agent-fe.md` and `agent-srv.md` for workspace A,
  replace the placeholder roots with `workspaces/{workspace-A}/src/...`
  prefixes. Same rule, different prefix per workspace.
- **Failure records and QA verdicts are workspace-scoped.** Failure
  records are part of pre-task retrieval for that workspace's agents.
  Cross-workspace failure visibility is a Division Orchestrator concern
  — usually satisfied by an aggregate index in `division/`.
- **Manifests live next to their workspace.** Sidecar manifest files
  (read by the PreToolUse hook) are workspace-local, with workspaceId
  in the manifest body so cross-workspace tooling can reason about
  them.

---

## Role-Agent Alignment

> Drawn from `docs/architecture/enterprise-scaling.md`, the multi-team
> extension of the single-workspace roster. The single-workspace
> framework already aligns agents to roles; the multi-team extension
> makes that alignment explicit across teams.

| Human Role | Agent Role | Spawned By | Spawning Authority |
|---|---|---|---|
| VP Engineering / Division Lead | Division Orchestrator | (top of chain) | Spawns Team Orchestrators only |
| Tech Lead (per team) | Team Orchestrator | Division Orchestrator | Spawns executing agents in own workspace only |
| Frontend Engineer | Frontend Agent (Agent-FE) | Team Orchestrator | None — executing agent |
| Backend Engineer | Backend Agent (Agent-SRV) | Team Orchestrator | None — executing agent |
| QA Lead | QA Agent | Team Orchestrator | None — executing agent (verdicts only) |
| On-Call / SRE | Fix Agent | Team Orchestrator | None — executing agent |

**Two governing principles.**

**Agents align to roles, not individuals.** No team member gets their
"own" Orchestrator instance. The Team Orchestrator belongs to whoever
is doing architectural coordination in that workspace at that time —
typically the Tech Lead or a rotating designee. Agents are pooled
within the team; multiple humans may invoke the Team Orchestrator,
and the Team Orchestrator routes the work to the right executing
agent.

**Invocation is workspace-scoped. Authority is role-gated.** Any
authorized member of a workspace may invoke the Team Orchestrator in
that workspace. Only the Tech Lead role may approve HIGH-risk tasks
inside the workspace. Only the Division Orchestrator can route a
CRITICAL-risk task upward; only a CTO-equivalent human can approve
one. These are separate layers — and conflating them creates the
bottleneck where every action requires approval before it can even
start.

---

## Trust Score Isolation

Trust is **per-agent-instance**, not per-role.

A Backend Agent instance in workspace A and a Backend Agent instance in
workspace B carry **separate trust trajectories**. They are different
employees doing similar jobs in different teams. One may be at HIGH
after twelve clean sessions; the other may be at PROVISIONAL with
n=3. Their D1-D4 history, autonomy gate, and failure-library
attribution are independent.

When an instance is reassigned across workspaces, its trust history
**travels with the instance**, not with the workspace. A QA Agent
instance that earned HIGH in workspace A continues at HIGH if it is
reassigned to workspace B. Workspace B inherits the instance's full
behavioral record — its scoring history, its autonomy gate, its
failure attributions — exactly as it stood at the moment of
reassignment. This is what makes the agents-as-employees model
genuinely enterprise-grade rather than a metaphor: an experienced
employee who switches teams brings their record with them.

**Three concrete consequences.**

1. **You cannot promote an agent by reassigning it.** Moving an
   instance to a new workspace does not reset its trajectory. A
   PROBATION instance moves to the new workspace at PROBATION.

2. **Two instances of the same role are not interchangeable.** When
   the Division Orchestrator looks at "the QA Agent in workspace B,"
   it is looking at one specific instance with one specific trust
   record. Spinning up a second instance of the same role is creating
   a new employee — fresh trajectory, PROVISIONAL tier.

3. **Failure attribution is per-instance.** A FailureRecord names the
   specific instance(s) involved (`agentsInvolved` referencing the
   instance ID, not the role). Pre-task retrieval surfaces prior
   FailureRecords scoped to the instance receiving the task — not all
   instances of that role.

**Schema.** The `agent_instances` table in `database/enterprise/`
holds the persistent identity. Identity fields are immutable; operator
assignment, status, and archived-at are mutable, with every change
producing an audit event. The cryptographic identity (AGT DID, in the
reference implementation) persists across infrastructure changes.

---

## Bulletin Lane Protocol

A single workspace's bulletin already supports parallel work via
disjoint file locks — two agents working on different files at the
same time write interleaved entries to the same bulletin. That works
because every entry carries an agent identifier and a timestamp.

The lane protocol extends this to **parallel sessions in the same
workspace** (and to **cross-workspace summary entries** posted by the
Division Orchestrator).

**The pattern.** Every bulletin entry that originates from a parallel
session prefixes the agent identifier with a lane tag:

```
[YYYY-MM-DD HH:MM] [LANE-A][AGENT-ID] PHASE: [content]
[YYYY-MM-DD HH:MM] [LANE-B][AGENT-ID] PHASE: [content]
```

A "lane" is a session-level coordination unit. Two parallel sessions
in the same workspace each pick a lane (LANE-A / LANE-B / LANE-C…)
and prefix every entry with their lane tag. The lanes do not
correspond to teams — they correspond to **concurrent sessions**. Two
sessions in workspace A would still be LANE-A and LANE-B inside that
workspace's bulletin.

**Why this matters.** Without the lane prefix, an agent reading the
bulletin to find "the latest READY signal from Wave 0" cannot tell
which of two concurrent sessions wrote it. With the lane prefix, the
agent reads only its own lane's signals. Cross-lane reads are
explicit ("did LANE-B publish a contract version we depend on?") and
therefore auditable.

**Disjoint file scope is still required.** The lane protocol does
NOT permit two sessions to touch the same file. Locks are still
acquired in `agent-locks.md`; the lane protocol only handles bulletin
interleaving, not write contention. If LANE-A holds a lock on a file,
LANE-B writes BLOCKED and stops — the lane tag is observability, not
permission.

**Example bulletin entries — two parallel sessions in workspace A.**

```
2026-04-22 09:00 [LANE-A][TEAM-ORCH-A] ACTIVATED: task=add-shared-field
2026-04-22 09:00 [LANE-A][TEAM-ORCH-A] BASELINE: guard1=0 guard2=3 guard3=0
2026-04-22 09:01 [LANE-B][TEAM-ORCH-A] ACTIVATED: task=fix-billing-edge-case
2026-04-22 09:01 [LANE-B][TEAM-ORCH-A] BASELINE: guard1=0 guard2=3 guard3=0
2026-04-22 09:02 [LANE-A][TEAM-ORCH-A] LOCKED: contracts/shared/<name>.json
2026-04-22 09:02 [LANE-B][TEAM-ORCH-A] LOCKED: src/billing/<file>.ts
2026-04-22 09:05 [LANE-A][AGENT-FE] WORKING: step 1 of 3 — render new state
2026-04-22 09:05 [LANE-B][FIX-AGENT] REPRODUCING: edge-case at boundary X
2026-04-22 09:08 [LANE-A][AGENT-FE] [COMPONENT] READY: <name>-v2 published
2026-04-22 09:09 [LANE-B][FIX-AGENT] ROOT CAUSE: off-by-one in tier check
```

LANE-A and LANE-B run concurrently. Each agent reads only its own
lane when looking for blocking signals. The Team Orchestrator writes
BASELINE entries for both lanes — guard counts are workspace-wide,
not lane-wide, so both lanes' Phase 8 deltas compare against the same
baseline.

**Cross-workspace summary lane.** The Division Orchestrator's
cross-workspace bulletin uses `[DIV-ORCH]` (without a lane prefix)
because Division-level entries are not session-scoped. Team
Orchestrators read this bulletin to confirm cross-workspace
authorizations and READY signals from sister workspaces. They do not
write to it; only the Division Orchestrator does.

```
2026-04-22 09:00 [DIV-ORCH] AUTHORIZE: team-orch-a wave=0 gateRecordId=01H...
2026-04-22 09:30 [DIV-ORCH] AUTHORIZE: team-orch-b wave=1 gateRecordId=01H...
2026-04-22 11:15 [DIV-ORCH] WAVE-COMPLETE: workspace-A wave=0 contract v17 READY
```

---

## When to Escalate to Division Orchestrator

The Team Orchestrator runs the full single-workspace loop within its
own scope. Escalation to Division Orchestrator is required only for
the categories below. Anything not on this list is the team's call.

| Decision | Team Orchestrator | Division Orchestrator |
|---|---|---|
| Spawn an executing agent for a LOW-risk task | ✅ Decides | — |
| Spawn an executing agent for a MEDIUM-risk task | ✅ Decides | — |
| Approve a HIGH-risk task scoped to its own workspace | ✅ (Tech Lead role) | — |
| Approve a CRITICAL-risk task | ❌ Escalates | ✅ Routes to CTO-equivalent |
| Cross-team work (touches a sister workspace's files) | ❌ Escalates | ✅ Coordinates |
| Change to a shared contract (under `contracts/shared/`) | ❌ Escalates | ✅ Routes to CTO-equivalent |
| Change to a centrally-defined policy (D1-D4 rubric, tier thresholds, gate classifications, failure taxonomy) | ❌ Escalates | ✅ Routes to CTO-equivalent |
| Database migration in own workspace, isolated tables | ✅ Decides + HITL | — |
| Database migration affecting shared tables | ❌ Escalates | ✅ Routes to CTO-equivalent |
| Spawn a subagent of an executing agent | ❌ Hard block | ❌ Hard block (subagents cannot spawn subagents at any tier) |
| Promote/demote an agent's trust tier | ❌ Cannot self-write | ❌ Cannot self-write (trust ledger is human-only) |
| Three-fail QA escalation (3rd QA FAIL on same task) | ❌ Escalates | ✅ Reviews; may convene architectural review |
| Add or rename a value in a contract enum (manifest, QAVerdict, FailureRecord) | ❌ Escalates | ✅ Routes to CTO-equivalent |
| Onboarding a new executing agent role | ❌ Escalates | ✅ Routes to CTO-equivalent (roster change) |
| Reassigning an agent instance across workspaces | ❌ Escalates | ✅ Decides + records in audit log |
| Releasing a `wont_fix` on a FailureRecord | ❌ Escalates (HITL gate) | ✅ Routes to CTO-equivalent for cross-team failures |

**Reading the table.** Anything in the right column requires a
Division Orchestrator gate record (`gateType: ESCALATION` from the
Team Orchestrator), and most of those route further to a human
authority. Anything in the left column is the Team Orchestrator's
own decision, recorded in its workspace bulletin and (for HIGH-risk
tasks) gated by a HITL approval from the Tech Lead role.

The point of the split is not to add bureaucracy — single-workspace
adopters who scale to multiple teams report that the wrong failure
mode is escalating too much, not too little. The Division
Orchestrator's role is **coordination on cross-team and policy
boundaries**, not approval of routine work. If a decision can be made
inside one workspace's policy and contract scope, it should be.

---

## Setup checklist

Before scoring the first multi-team session, confirm:

- [ ] Each workspace has its own governance file set (the
      `workspaces/{ws}/governance/` block above).
- [ ] Each workspace's agent files (`agent-fe.md`, `agent-srv.md`)
      have their boundary path prefixes set to that workspace's
      `src/` root — not the repo root.
- [ ] The cross-workspace summary lane (`division/division-bulletin.md`
      or `agent_events` with cross-workspace visibility) is created and
      writable only by Division Orchestrator.
- [ ] `agent_instances` (or its file-based precursor) records each
      agent instance with workspace assignment AND a stable instance
      identifier independent of workspace.
- [ ] Trust scoring at session close uses the instance identifier, not
      the role. Scores write to the instance's record, not to the
      workspace's record.
- [ ] The Division Orchestrator cannot spawn executing agents directly
      — only Team Orchestrators. Verify this with a test session that
      attempts the violation; the spawn should be refused.
- [ ] The escalation table above is mirrored in
      `governance/hitl-gate.md` for every workspace, so the rule is
      visible to every Team Orchestrator at startup.
- [ ] At least one cross-workspace gate record has been walked through
      end-to-end as a dry run (see [`division-orchestrator-example.md`](division-orchestrator-example.md))
      before live multi-team work begins.

---

## Related

- [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md) —
  the architectural model behind this template.
- [`division-orchestrator-example.md`](division-orchestrator-example.md) —
  one approval chain walked through end-to-end.
- [`README.md`](README.md) — multi-team status and prerequisites.
- [`../single-workspace/`](../single-workspace/) — the single-workspace
  reference. Run that reliably first.
