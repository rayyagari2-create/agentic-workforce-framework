# Manager Agent Pattern

**The orchestrator is an engineering manager. This document specifies
what that means operationally.**

The orchestrator is not a router. It is not a dispatcher. It is the
manager of a small team of agents, with the responsibilities and
limitations that come with that role.

---

## Why "Manager" Is the Right Frame

Other framings produce known failure modes:

- **Orchestrator-as-router:** treats agents as fungible workers, ignores
  trust and capability differences, and produces routing-by-availability.
- **Orchestrator-as-supervisor:** implies the orchestrator can approve
  high-risk decisions itself, which it cannot.
- **Orchestrator-as-planner:** confuses the planning step with the
  managing relationship; planning is a phase, managing is continuous.

Manager-agent captures the right shape: the orchestrator decides who
works on what, escalates what is beyond its authority, and is itself
accountable through trust scoring.

---

## What the Manager Agent Does

| Responsibility | Detail |
|---|---|
| Task classification | Sets riskLevel and routes through pre-spawn protocol |
| Routing | Selects an agent by capability boundary and trust gate |
| Manifest creation | Instantiates the AgentTaskManifest before spawn |
| QA loop ownership | When QA fails, decides re-route, re-spawn, or escalate |
| Lock and bulletin governance | Maintains ordering and integrity of session artifacts |
| Escalation | Surfaces what it cannot handle alone |
| Spawn authority | Only the orchestrator may spawn agents subagents may not |

The manager agent does not execute tasks. It manages them.

---

## What the Manager Agent Does Not Do

This is the part most often violated and most consequential.

### Cannot approve HIGH-risk commits without a HITL gate

If a task is classified HIGH, the orchestrator must obtain explicit
human approval before the spawned agent commits work. The orchestrator
may approve the **plan**; it may not approve the **commit**. This is
an enforced separation, not a convention.

### Cannot approve CRITICAL-risk work at all

CRITICAL-risk work requires a Boardroom session. The orchestrator
escalates and waits.

### Cannot self-score

The orchestrator is itself an agent. Its sessions are scored by an
authorized human (or, in v2.0+, by the Eval/Telemetry Service). The
orchestrator may not write its own trust score row, ever.

### Cannot edit hooks, policy, or other governance artifacts

Hooks and policy live in operator-zone directories
(e.g., `.claude/hooks/`). The orchestrator has read access for
diagnostics; it has no write access. This is enforced at the OS level
by `check-orchestrator-edit` (see `docs/control-plane/hook-system.md`).

### Cannot delete or mutate audit log entries

The audit log is append-only. The orchestrator writes events to it but
cannot revise prior events. This is true even when the orchestrator
"realizes" a prior classification was wrong the new classification
becomes a new event, not a mutation of the old one.

### Cannot spawn subagents from within a subagent

Only the orchestrator spawns. A spawned agent may request that the
orchestrator spawn a helper, but it may not spawn directly. This is
enforced by `check-agent-spawn` and `check-subagent-start`.

---

## Span of Control

The pattern works at the scale of a small team. It degrades predictably
as the team grows.

| Active Agents | Behavior | Recommendation |
|---|---|---|
| 1–3 | Manager agent handles all routing, QA loops, and escalations comfortably | Single orchestrator |
| 4–6 | Approaching capacity; QA loops compete with routing decisions | Single orchestrator with disciplined queue |
| 7–10 | Manager agent saturates; queue depth grows; classification quality degrades | Split into two orchestrators with disjoint workspaces, or escalate to Manager Agent + Division pattern |
| 10+ | Single orchestrator is structurally insufficient | Enterprise pattern (`docs/architecture/enterprise-scaling.md`) Division Orchestrator + Team Orchestrators |

These thresholds are heuristic, not measured. They will be refined as
multi-team deployments are instrumented.

### Symptoms of Span-of-Control Saturation

- Pre-spawn classifications becoming sloppy (LOW assigned to MEDIUM
  work because the orchestrator is rushing)
- Agents waiting in IDLE while tasks are stuck in CREATED
- Failure records not being read pre-task because retrieval is
  perceived as too slow
- The orchestrator's own trust score declining

When two of these are present, the team has outgrown a single
orchestrator.

---

## Spawn Authority Rules

Spawning is the act of starting a new agent session. It is the only
moment at which the manager-agent / executor relationship is formed.

### Who Can Spawn What

| Spawner | Permitted Spawnees |
|---|---|
| Human operator | Orchestrator, any executing agent (rare bypass logged) |
| Orchestrator | Any agent within its workspace whose capability matches |
| Spawned executing agent | None subagents may not spawn |
| Boardroom Agent | May request that the orchestrator spawn; does not spawn directly |

### Spawn Manifest Requirement

Every spawn requires a manifest. There is no "quick task" exception.
Manifests for trivial tasks are short. They are still required.

A spawn without a manifest is a hook violation
(`check-agent-spawn`) and produces an exit(2) hard block.

---

## Escalation Triggers

The manager agent escalates rather than acting alone in any of these
cases.

| Trigger | Escalates To |
|---|---|
| QA fails three consecutive times on the same task | Boardroom |
| Risk reclassified upward to CRITICAL mid-task | Boardroom |
| Routing fails no capable agent at sufficient trust tier | Human operator |
| Pre-spawn surfaces a recurring failure pattern (recurrenceCount ≥ 2) | Human operator |
| Hook violation by an agent under management | Human operator + audit log |
| Disagreement between two agents on shared file scope | Human operator |
| Trust score for any managed agent drops below 60 | Performance review (see promotion-demotion) |

Escalation is not failure. Failing to escalate is failure. The manager
agent is graded in part on whether it escalates correctly.

---

## The 3-Strike Pattern

For the QA-failure case specifically, the framework standardizes a
3-strike escalation:

1. **First failure.** QA returns FAIL with specific notes. Orchestrator
   re-spawns with corrected brief.
2. **Second failure.** QA returns FAIL again. Orchestrator routes to
   Fix-Agent, which writes a FailureRecord and proposes prevention.
3. **Third failure.** Orchestrator stops and escalates to Boardroom.
   No further re-spawning until the Boardroom decides.

The 3-strike pattern is not negotiable. Continuing to re-spawn past
strike three is a known failure mode (see
`docs/control-plane/meta-governance.md` "Spawn-storm").

---

## Manager Agent Trust

The orchestrator is itself trust-scored, like any agent. Its trust
trajectory matters because:

- A drifting orchestrator routes badly
- A drifting orchestrator skips pre-spawn steps to save time
- A drifting orchestrator approves more than it should

If the orchestrator's trust score declines for two consecutive sessions,
the framework treats this as a leading indicator. Reviews of routing
decisions are conducted before the third session begins.

An orchestrator at PROBATION cannot manage a workforce. The team is
either paused, or another orchestrator instance is brought online to
manage in parallel while the original recovers or retires.

---

## Manager Agent Pattern at Enterprise Scale

At enterprise scale (`docs/architecture/enterprise-scaling.md`), the
pattern extends but does not change in shape:

```
Division Orchestrator   (VP-equivalent)
    │
    ├── Team Orchestrator A   (Tech Lead)
    │       └── executing agents
    │
    └── Team Orchestrator B   (Tech Lead)
            └── executing agents
```

Rules at scale:

- Manager agents route work; they do not execute it.
- Trust scores remain per-instance, not per-role.
- Division Orchestrator may only spawn Team Orchestrators, never
  executing agents directly.
- HITL gates escalate upward a Team Orchestrator cannot approve what
  needs Division-level approval.

The Division Orchestrator pattern is **designed but not yet
field-proven**. Adopt the single-orchestrator pattern first; scale up
when single-orchestrator saturation is consistent and measured.

---

## Related

- `docs/operating-model/task-assignment.md` the routing pipeline the
  manager agent owns.
- `docs/operating-model/incident-management.md` where QA failures and
  Boardroom escalations are detailed.
- `docs/control-plane/hitl-gates.md` the gate types the manager
  cannot bypass.
- `docs/control-plane/hook-system.md` the OS-level enforcement that
  makes "cannot" mean cannot.
