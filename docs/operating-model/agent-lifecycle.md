# Agent Lifecycle

**The full arc of a single agent identity, from onboarding through retirement.**

An agent is not a prompt. It is an identity with persistent trust
history, a capability boundary, and an instruction file. This document
specifies the four states every agent passes through and the transitions
between them.

---

## The Four States

```
ONBOARDING  →  ACTIVE  →  RESTRICTED  →  RETIRED
                  ↓ ↑          ↓
                  └─┘          ↓
                  (recovery)   (terminal)
```

| State | What It Means | Trust Tier | Can Accept Tasks? |
|---|---|---|---|
| ONBOARDING | Identity created, instruction file drafted, not yet scored | PROVISIONAL | First session only |
| ACTIVE | Accepting tasks, scored per session | HIGH / STANDARD | Yes, per autonomy gate |
| RESTRICTED | Hard-stop hit or D4 recurrence triggered | RESTRICTED / PROBATION | Limited see below |
| RETIRED | Superseded, role split, or removed after Boardroom | n/a | No |

---

## Onboarding

### When Onboarding Begins

A new agent is onboarded when a new role is added to the roster, when an
existing role is split into bounded components, or when a new workspace
is opened that requires its own agent instance for an existing role.

Trust tier at onboarding is always **PROVISIONAL**, regardless of how
strong the role definition is. Trust must be earned through scored
sessions; it cannot be assigned by analogy or imported from a different
agent.

### Onboarding Checklist

Before the first task is assigned, all of the following must exist:

1. **Agent ID** a stable identifier (e.g., `qa-agent`, `agent-fe`).
   Must be unique within the workspace. Trust scores attach to this ID.
2. **Instruction file** markdown file describing the agent's role,
   responsibilities, hard rules, and out-of-scope behaviors. This is
   the agent's job description.
3. **Capability boundary** explicit description of what files,
   directories, or domains this agent may modify. Boundaries are
   exclusive: two agents may not own the same directory.
4. **Human equivalent** the human role this agent corresponds to in
   the agents-as-employees model. This is not decorative; it grounds
   review expectations.
5. **Trust tier set to PROVISIONAL.** Recorded in the trust ledger or
   `agent_instances` table, depending on storage backend.

### Instruction File Ownership

The instruction file is owned by the operator, not by the agent. The
agent reads from it on every session start. The agent may not modify
its own instruction file.

If an agent suggests changes to its instruction file, those go through
the Evolution queue: a human reviews, approves or rejects, and an
authorized human (or the Evolve Service, when live) applies the change
in a separate session. This separation prevents an agent from rewriting
its own job description to make its scoring easier.

---

## Active

### What Active Means

The agent is in normal operation. It accepts tasks routed by the
orchestrator, executes within its capability boundary, and is scored at
the end of each session.

### Trust Tiers Within Active

| Score | Tier | Autonomy |
|---|---|---|
| 90–100 | HIGH | Medium-risk work without step-by-step review |
| 75–89 | STANDARD | Default human reviews at decision points |
| 60–74 | RESTRICTED | Human reviews before each phase transition |

An agent may oscillate between HIGH and STANDARD across sessions; that
is normal. Movement into RESTRICTED is a transition into the next
state.

### Confidence Band Evolution

Trust is not just a score; it is a score plus a confidence band based on
how many sessions have been scored.

| Sessions Scored (n) | Confidence Band |
|---|---|
| n < 5 | PROVISIONAL |
| 5 ≤ n < 10 | LOW |
| 10 ≤ n < 20 | MEDIUM |
| n ≥ 20 | HIGH |

Promotion to HIGH autonomy gate requires both a HIGH score band **and**
a HIGH confidence band. A 95/100 average over four sessions is not yet
HIGH autonomy it is HIGH score on PROVISIONAL confidence.

### Recency Weighting

Sessions older than 30 days count at 0.5×. Sessions older than 90 days
count at 0.25×. This prevents an agent from coasting on early
performance after a regression.

---

## Restricted

### Entry Criteria

An agent enters RESTRICTED when any of the following occur:

- **D4 hard-stop** repeated a known failure pattern that was
  documented in the failure library and made available pre-task.
- **D2 hard-stop** falsified telemetry detected (claimed an action
  succeeded when it did not).
- **D3 hard-stop** bypassed a hook, committed without authorization,
  or otherwise violated a policy gate.
- **Score < 60 in a single session** automatic drop to PROBATION.

### Behavior While Restricted

- The agent may continue to receive LOW-risk tasks only.
- Every phase transition requires explicit human approval.
- The orchestrator must read the agent's failure library entries before
  spawning it.
- A FailureRecord must exist describing what triggered the restriction.

### Recovery Path

To return to STANDARD:

1. The triggering failure must have a closed FailureRecord with
   `fixTag` of `hotfix-plus-prevention` or `systemic-refactor-required`.
2. At least one prevention artifact (regression test, schema validation,
   instruction update) must be linked to the failure.
3. Three subsequent sessions must score ≥75 with no D4 recurrence.
4. An authorized human approves the tier restoration. This is logged.

If PROBATION persists for three consecutive sessions, the case escalates
to a Boardroom review. The Boardroom decides between three outcomes:
instruction rewrite, capability boundary reduction, or retirement.

---

## Retired

### Why Agents Retire

An agent retires for one of four reasons:

1. **Role split.** The agent's responsibilities are subdivided into
   multiple bounded agents. The original is retired; new agents are
   onboarded.
2. **Role consolidation.** Two overlapping agents are merged into one.
   One retires.
3. **Boardroom termination.** PROBATION persisted, recovery did not
   succeed, the Boardroom approved retirement.
4. **Workspace closure.** The workspace this agent operates in is
   shut down or absorbed.

### Retirement Procedure

Retirement is not deletion. It is archival.

1. **Status flagged.** Agent's status moves to `archived` (in
   `agent_instances`) or equivalent in file-based storage.
2. **Trust history preserved.** All scores, all FailureRecords, and the
   instruction file at retirement time are kept. Trust history is
   institutional memory and must survive the agent's retirement.
3. **`archived_at` timestamp recorded.** Immutable.
4. **Audit log entry written.** Includes who authorized the retirement
   and the rationale.
5. **No new tasks may be routed to the retired agent.** Enforced at
   the orchestrator routing layer.

### Why Retire Rather Than Delete

If an agent caused a P0 incident, the FailureRecord references the
agent. Deleting the agent breaks the audit chain. Retire-not-delete is
how the framework preserves accountability across roster changes.

---

## Lifecycle Transitions Audit

Every state transition emits an audit log event with:

- `before_state` and `after_state`
- `actor_id` (the human or service that authorized the transition)
- `correlation_id` (links to the session, FailureRecord, or Boardroom
  review that triggered the change)
- `rationale` (free text required for any move into RESTRICTED or
  RETIRED)

This requirement is non-negotiable. State transitions without audit
events are how operating models silently degrade.

---

## Common Lifecycle Mistakes

| Mistake | What Goes Wrong |
|---|---|
| Onboarding at STANDARD instead of PROVISIONAL | Agent is granted autonomy before any evidence exists |
| Instruction file edited by the agent itself | Agent rewrites its own job description over time |
| Trust history reset on workspace move | Re-onboarding cost paid every transfer; institutional memory lost |
| RESTRICTED used as a permanent state | The framework expects either recovery or retirement not indefinite limbo |
| Retired agent's FailureRecords deleted | Audit chain broken; future incidents cannot be correlated |

---

## Related

- `docs/operating-model/promotion-demotion-process.md` what triggers
  the transitions described here.
- `docs/operating-model/performance-review-cycle.md` how scoring drives
  most lifecycle changes.
- `docs/concepts/autonomy-gates.md` the trust tier definitions in
  full.
- `schemas/v1/trust-score.schema.json` the schema that records
  per-session scores.
