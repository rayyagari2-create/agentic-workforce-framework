# HITL Gates

**Human-in-the-loop gates: types, authority hierarchy, delegation, and
escalation.**

A HITL gate is a hard pause in the build state machine. The agent
cannot proceed without an authorized human decision. Gates are the
mechanism that keeps autonomy bounded by accountability the more
risk a task carries, the more explicit the approval trail.

---

## The Four Gate Types

| Gate Type | When It Fires | Resolution |
|---|---|---|
| `HITL` | Standard human review at HIGH-risk threshold | Approve / Reject / Refine |
| `DELEGATION` | Authorized approver unavailable; delegate has valid TTL | Delegate approves within scope |
| `ESCALATION` | Prior gate timed out; or 3-strike threshold hit; or `recurrenceCount ≥ 3` | Escalate to next-tier authority |
| `APPROVAL` | CRITICAL-risk threshold; cross-schema; runtime policy change | Multi-authority sign-off |

A task may fire multiple gate types in sequence for example, a
CRITICAL task whose APPROVAL gate is delegated and then escalated
because the delegate also declined.

The gate type is recorded as a discrete enum value in `gate_records`.

---

## When Each Gate Fires

### HITL

```
Triggered when ANY of:
  - riskLevel = HIGH
  - Agent at RESTRICTED tier
  - Task touches a locked region
  - Executing-agent default for MEDIUM (configurable per workspace)
```

HITL is the most common gate. It is the standard human review point
for HIGH-risk work.

### DELEGATION

```
Triggered when:
  - A HITL or APPROVAL gate fires
  - AND the primary approver is unavailable (out-of-office, off-hours)
  - AND a delegation_rules row exists where:
      delegator_id = primary approver
      delegate_id = currently available human
      gate_types includes the firing gate type
      max_risk_level >= the task's risk level
      NOW() between valid_from and valid_until
```

A delegate cannot re-delegate. Delegation is always explicit (no
implicit forwarding).

### ESCALATION

```
Triggered when ANY of:
  - A pending HITL gate has timed out (workspace-defined TTL)
  - The 3-strike threshold has been hit on the same task
  - recurrenceCount ≥ 3 in pre-task failure retrieval
  - Agent at PROBATION attempting HIGH-risk work
  - Manager Agent flagged the task as needing higher authority
```

ESCALATION routes upward through the org structure: Team Orchestrator
→ Division Orchestrator → enterprise-level authority. An ESCALATION
record always references the prior gate that triggered it.

### APPROVAL

```
Triggered when ANY of:
  - riskLevel = CRITICAL
  - Cross-schema change
  - Runtime policy change
  - Public-API surface change
  - Audit log structure change
  - Control plane artifact change (hooks, policies)
```

APPROVAL gates require multi-authority sign-off. The number and type
of required approvers is workspace-defined; the minimum is two
distinct humans, neither of whom is the requester.

---

## Approval Authority Levels

Authority is role-gated, not person-gated. Any authorized member of
the role may approve within their scope.

| Authority Level | Can Approve | Cannot Approve |
|---|---|---|
| Team member (executor) | LOW-risk in own workspace | Anything HITL or above |
| Team Orchestrator (Tech Lead role) | HITL up to HIGH in own team scope | CRITICAL; cross-team scope; control plane artifacts |
| Division Orchestrator (VP role) | HIGH cross-team; CRITICAL within division | Cross-division CRITICAL; enterprise policy change |
| Enterprise authority (CTO role) | All risk levels; all scopes | (no internal restriction; bound by external compliance) |

**Governing distinction:** Any authorized workspace member may
*invoke* the orchestrator within their workspace scope. Only
designated roles may *approve* certain HITL gate types. Invocation is
workspace-scoped; authority is role-gated.

These are two separate layers. Conflating them creates the failure
mode where everything requires approval before it can even start —
which is the failure mode of most enterprise governance frameworks.

---

## Delegation TTL Rules

Every delegation has a TTL. There are no permanent delegations.

```
delegation_rules columns (subset):
  delegator_id     UUID NOT NULL    -- the original authority
  delegate_id      UUID NOT NULL    -- the temporary authority
  gate_types       TEXT[] NOT NULL  -- which gate types this covers
  max_risk_level   TEXT NOT NULL    -- max risk delegate can approve
  valid_from       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  valid_until      TIMESTAMPTZ NOT NULL  -- TTL required
```

**Hard rules:**

1. **Delegation is always explicit.** No implicit forwarding from "I
   wasn't around so my deputy decided."
2. **A delegate cannot re-delegate.** Application-layer enforcement —
   only users with original delegator authority may create
   `delegation_rules` rows. Database-level enforcement via a
   `role_authority` table is a Wave 3+ option.
3. **Delegation expires.** `valid_until` is required and is a hard
   cutoff. A gate that fires after `valid_until` does not match the
   delegation, regardless of how recent the delegation was.
4. **TTL is bounded.** Workspace policy defines the maximum TTL
   (typical: 14 days). Long delegations defeat the audit value.
5. **Audit log records every delegation creation and every approval
   decision made under delegation.** A delegation that is never used
   is also recorded for completeness.

### Delegation Scope Rules

A delegate's authority is the **intersection** of:

- The delegator's authority
- The `gate_types` array
- The `max_risk_level` ceiling
- The active `valid_from`/`valid_until` window

If any constraint excludes the firing gate, the delegation does not
apply and the gate falls through to the next escalation step.

---

## Approval Gate Chain

A HIGH-risk or CRITICAL-risk task may pass through a chain of gates
before resolving.

### Example: HIGH-risk task in a Team

```
Team Orchestrator → HITL gate triggers
  → Routes to: Tech Lead (approval authority for team scope)
  → If Tech Lead unavailable: DELEGATION to designated deputy (TTL active)
  → If both unavailable: ESCALATION to Division Orchestrator
  → Division Orchestrator approves → Team Orchestrator authorized to spawn
```

### Example: CRITICAL-risk task (cross-team, schema change)

```
Team Orchestrator → cannot approve (above team scope)
  → Escalates to Division Orchestrator (ESCALATION)
  → Division Orchestrator → cannot approve alone (CRITICAL requires multi-authority)
  → APPROVAL gate fires; requires CTO-equivalent + Division Orchestrator
  → Both sign off → Division Orchestrator authorizes Team Orchestrator
  → Team Orchestrator spawns executing agent
```

Every transition in the chain is its own row in `gate_records`, with
`gate_type` reflecting the role of that step.

---

## The 3-Strike Escalation

Three consecutive QA FAIL on the same task triggers ESCALATION
automatically.

| Strike | Effect on Gates |
|---|---|
| Strike 1 | No gate change; standard re-route through DEBUG → SPEC/PLAN → SPAWN |
| Strike 2 | If next attempt would be HIGH risk, HITL is mandatory regardless of agent tier |
| Strike 3 | ESCALATION fires; spawn does not proceed without authority above Team Orchestrator level |

The 3-strike rule is detailed in `build-state-machine.md`. From the
gate perspective, strike 3 forces the next decision out of the team's
hands even if the underlying task was originally classified as
LOW or MEDIUM.

This is the gate-level expression of "fix attempts that don't fix
anything, repeated" being a serious signal. The strike escalation
guarantees a human above the team sees it before another attempt is
made.

---

## HITL Manifest Format

The manifest section that records HITL outcomes follows a fixed
schema. The orchestrator writes this section before SPAWN; the agent
reads it at startup.

### Required Fields

```yaml
hitl:
  required: true | false
  triggers:
    - riskLevel: HIGH
    - agentTier: RESTRICTED   # only present if applicable
    - lockedRegion: <path>     # only present if applicable
  decisions:
    - gateType: HITL | DELEGATION | ESCALATION | APPROVAL
      requestedAt: <ISO 8601 timestamp>
      requestedBy: <agent_instance_id>
      approverRole: <role name>
      approverId: <user_id>
      decision: APPROVED | REJECTED | ESCALATED | EXPIRED
      decidedAt: <ISO 8601 timestamp>
      rationale: <text required for all decisions>
      delegatedFrom: <user_id>           # only if under delegation
      delegationExpires: <ISO 8601>       # only if under delegation
      correlationId: <UUID>
```

### Manifest Format Rules

1. **`required: true` forces a `decisions` entry.** A manifest with
   `required: true` and an empty `decisions` array is a hook
   violation; the agent does not start.
2. **`rationale` is mandatory** for every decision, including
   APPROVED. The most common audit failure is silent approval.
3. **`correlationId` threads through to `audit_log` and
   `gate_records`** the same ID appears in all three places.
4. **A REJECTED decision routes the task to IDLE.** The manifest is
   archived; the next attempt requires a refined manifest.
5. **An EXPIRED decision triggers ESCALATION automatically.** A
   `gate_records` row with `status = EXPIRED` causes the orchestrator
   to fire a new ESCALATION gate.

### Example: HIGH-risk Task with HITL Approval

```yaml
hitl:
  required: true
  triggers:
    - riskLevel: HIGH
  decisions:
    - gateType: HITL
      requestedAt: "2026-04-24T14:32:00Z"
      requestedBy: "01HJ8K..."     # agent_instance_id
      approverRole: "team-orchestrator"
      approverId: "01HJ8L..."
      decision: APPROVED
      decidedAt: "2026-04-24T14:38:14Z"
      rationale: "Schema migration tested in staging; rollback plan in PR."
      correlationId: "01HJ8M..."
```

### Example: Escalation After Delegation Expired

```yaml
hitl:
  required: true
  triggers:
    - riskLevel: HIGH
  decisions:
    - gateType: DELEGATION
      requestedAt: "2026-04-24T18:01:00Z"
      requestedBy: "01HJ8K..."
      approverRole: "team-orchestrator"
      approverId: "01HJ8N..."     # the delegate
      decision: EXPIRED
      decidedAt: "2026-04-24T22:00:00Z"
      rationale: "Delegation TTL expired before decision."
      delegatedFrom: "01HJ8L..."
      delegationExpires: "2026-04-24T22:00:00Z"
      correlationId: "01HJ8M..."
    - gateType: ESCALATION
      requestedAt: "2026-04-24T22:00:01Z"
      requestedBy: "orchestrator"
      approverRole: "division-orchestrator"
      approverId: "01HJ8P..."
      decision: APPROVED
      decidedAt: "2026-04-25T09:14:00Z"
      rationale: "Reviewed migration plan; approved with rollback dry-run requirement."
      correlationId: "01HJ8M..."
```

The same `correlationId` threads both decisions. The audit trail can
reconstruct the full chain.

---

## Gate Failure Modes

| Failure Mode | Effect | Detection |
|---|---|---|
| Approval theater | Approver signs without reading | Trust score impact when downstream issues hit; audit review |
| Delegation past TTL | Delegate approves outside window | `gate_records` constraint check; ESCALATION fires |
| Self-approval | Agent's operator approves their own request | Hook block; `requestedBy` and `approverId` cannot match |
| Gate skipped because "low risk" | Underclassification at step 1 | Hook layer catches at file touch |
| Re-delegation | Delegate forwards to a third party | Application-layer rejection; not a valid `delegation_rules` row |
| Indefinite pending | Gate never resolved | Workspace TTL → EXPIRED → ESCALATION |

---

## Gate Records Audit Properties

Every gate decision lands in `gate_records` (enterprise-scale
Postgres) or in the manual_reviews equivalent (single-workspace
file-based). The lifecycle fields (`status`, `resolved_at`,
`approved_by`, `rationale`) are mutable; every status update emits an
immutable `audit_log` event with `before_state`, `after_state`,
`actor_id`, `correlation_id`, `timestamp`. The `id` and `created_at`
fields are immutable.

This is the operational lifecycle mutability rule the gate row
itself can move through `PENDING → APPROVED/REJECTED/EXPIRED`, but
every transition is captured in the append-only audit trail.

---

## Related

- `pre-spawn-protocol.md` where the HITL state is entered.
- `build-state-machine.md` the lifecycle context for the HITL state.
- `audit-trail-patterns.md` how gate decisions are recorded.
- `hook-system.md` what enforces "no spawn without manifest
  decisions."
- `meta-governance.md` what to do when a gate itself fails.
