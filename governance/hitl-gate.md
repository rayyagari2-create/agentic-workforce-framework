## About this file

- **Purpose:** Operational HITL configuration for this deployment.
  Maps risk levels to required approver roles, defines delegation
  rules, and sets TTLs. The Orchestrator reads this at boot
  (STARTUP step 10) to know which humans must approve what.
- **Who writes:** Human operator. Changes to gate thresholds,
  approver roles, or delegation rules are policy changes — go
  through code review.
- **Mutability:** Human-mutable. Agents read; agents never write.
- **How to initialize:** Replace `[REPLACE THIS]` markers with the
  roles, users, and TTLs for your deployment. Start with the four
  gate types shown below — the Orchestrator expects the structure.

---

# HITL Gate Configuration

A HITL gate is a hard pause in the build state machine. The agent
cannot proceed without an authorized human decision. This file
operationalizes the concepts in `docs/control-plane/hitl-gates.md`
for this specific deployment.

---

## Gate Firing by Risk Level

| Risk Level | Gate Fires When | Default Gate Type |
|---|---|---|
| `LOW` | Single-file change in unlocked region, no shared interface | No gate — agent proceeds. |
| `MEDIUM` | Multi-file change, touches shared state, store, or API contract | HITL required **unless** the assigned agent has `Gate Level = STANDARD` or `AUTONOMOUS` per `governance/autonomy-registry.md`. |
| `HIGH` | Payment, auth, entitlement, schema change, any locked region | HITL always required. No exceptions. |
| `CRITICAL` | Cross-schema, policy change, contract schema change, public-repo change | APPROVAL gate (multi-authority) + Boardroom review. |

**Domains always classified as HIGH** (regardless of file count):

```
[REPLACE THIS: e.g., "auth"]
[REPLACE THIS: e.g., "payments"]
[REPLACE THIS: e.g., "entitlement"]
[REPLACE THIS: e.g., "database migration"]
[REPLACE THIS: e.g., "feature-flag rollout"]
```

**Worked example:**

```
auth
payments
entitlement
session management
any file in governance/locked-states.md
any database migration
any change to a system-prompt builder or LLM instruction template
```

---

## Gate Types (four)

| Gate Type | Triggers | Resolution |
|---|---|---|
| `HITL` | Standard human review at HIGH threshold | Approve / Reject / Refine |
| `DELEGATION` | Primary approver unavailable; delegate has valid TTL | Delegate approves within scope |
| `ESCALATION` | Prior gate timed out; 3-strike threshold hit; `recurrenceCount ≥ 3` | Route upward to next-tier authority |
| `APPROVAL` | CRITICAL threshold; cross-schema; runtime policy change | Multi-authority sign-off (minimum two distinct humans) |

See `docs/control-plane/hitl-gates.md` for the full gate-type model.

---

## Approval Authority

Authority is **role-gated**, not person-gated. Any authorized member
of the role may approve within their scope.

| Role | Can Approve | Cannot Approve |
|---|---|---|
| `[REPLACE THIS: e.g., "Team member"]` | LOW risk in own workspace | Anything HITL or above |
| `[REPLACE THIS: e.g., "Tech Lead"]` | HITL up to HIGH in own team scope | CRITICAL; cross-team scope; control-plane artifacts |
| `[REPLACE THIS: e.g., "Division Lead"]` | HIGH cross-team; CRITICAL within division | Cross-division CRITICAL; enterprise policy change |
| `[REPLACE THIS: e.g., "Enterprise authority (CTO)"]` | All risk levels; all scopes | Bound by external compliance only |

**Worked example (small-team deployment):**

| Role | Can Approve | Cannot Approve |
|---|---|---|
| Founder (sole operator) | All risk levels in this workspace | Nothing — single-authority model; but see the Two-Person Rule below. |
| Designated deputy | LOW + MEDIUM when Founder unavailable | HIGH, CRITICAL |

**Worked example (enterprise deployment):**

| Role | Can Approve | Cannot Approve |
|---|---|---|
| Team member | LOW in own workspace | HITL or above |
| Team Orchestrator (Tech Lead) | HITL up to HIGH in own team scope | CRITICAL; cross-team; control plane |
| Division Orchestrator (VP) | HIGH cross-team; CRITICAL within division | Cross-division CRITICAL; enterprise policy |
| CTO | All risk levels; all scopes | External compliance bounds only |

---

## The Two-Person Rule (CRITICAL only)

A CRITICAL gate always requires two distinct human approvers. The
requester is never an approver. The minimum is:

- One approver in the role appropriate for the risk (per the table
  above).
- One approver whose scope also covers the risk — this is the
  second signature.

This is an **APPROVAL gate**, not a HITL gate. The manifest's `hitl`
section must record two `decisions` entries, both `APPROVED`, both
signed before spawn.

---

## Delegation Rules

Delegation lets an approver authorize a deputy to approve in their
place for a bounded window. Every delegation has a **TTL** (no
permanent delegations).

| Field | Rule |
|---|---|
| `delegator_id` | The original authority (user ID). |
| `delegate_id` | The temporary authority (user ID). |
| `gate_types` | Which gate types this delegation covers. |
| `max_risk_level` | Maximum risk the delegate can approve (never higher than the delegator's scope). |
| `valid_from` | ISO 8601 start. Defaults to now. |
| `valid_until` | ISO 8601 end. **Required.** No open-ended delegations. |

**Hard rules:**

1. **Delegation is always explicit.** No implicit forwarding.
2. **A delegate cannot re-delegate.** Only users with original
   delegator authority may create delegation rows.
3. **Delegation expires.** `valid_until` is a hard cutoff. A gate
   firing after `valid_until` does not match; the gate falls through
   to ESCALATION.
4. **TTL is bounded.** The maximum allowed TTL for this deployment
   is `[REPLACE THIS: e.g., "14 days"]`. Longer delegations defeat
   the audit value.
5. **Audit log records every creation and every decision made
   under delegation.** An unused delegation is also recorded for
   completeness.

**Worked example:**

| delegator_id | delegate_id | gate_types | max_risk_level | valid_from | valid_until |
|---|---|---|---|---|---|
| founder | deputy-01 | HITL, DELEGATION | HIGH | 2026-04-20 00:00Z | 2026-04-27 23:59Z |
| tech-lead-01 | tech-lead-02 | HITL | HIGH | 2026-04-24 09:00Z | 2026-04-24 17:00Z |

---

## 3-Strike Escalation

Three consecutive QA FAIL on the same task forces escalation,
regardless of the task's original risk level.

| Strike | Effect |
|---|---|
| Strike 1 | No gate change; standard re-route through DEBUG → SPEC/PLAN → SPAWN |
| Strike 2 | If next attempt would be HIGH risk, HITL is mandatory regardless of agent tier |
| Strike 3 | ESCALATION fires; spawn does not proceed without authority above Team Orchestrator level |

This rule is the gate-level expression of "fix attempts that don't
fix anything, repeated" being a serious signal. The escalation
guarantees a human above the team sees it before another attempt.

---

## Gate TTL (per gate type)

A pending gate that is not resolved within its TTL transitions to
`EXPIRED` and fires an ESCALATION automatically.

| Gate Type | Default TTL | Notes |
|---|---|---|
| `HITL` | `[REPLACE THIS: e.g., "4 hours"]` | Business-hours respected. |
| `DELEGATION` | `[REPLACE THIS: e.g., "2 hours"]` | Shorter — delegate is expected to be present. |
| `ESCALATION` | `[REPLACE THIS: e.g., "1 business day"]` | Next-tier authority has more latitude. |
| `APPROVAL` (CRITICAL) | `[REPLACE THIS: e.g., "3 business days"]` | Boardroom scheduling latency absorbed here. |

---

## HITL Manifest Format

The Orchestrator writes the HITL section of the manifest before SPAWN.
The executing agent reads it at startup.

```yaml
hitl:
  required: true | false
  triggers:
    - riskLevel: LOW | MEDIUM | HIGH | CRITICAL
    - agentTier: HIGH | STANDARD | RESTRICTED | PROBATION | PROVISIONAL
    - lockedRegion: <path>      # only if applicable
  decisions:
    - gateType: HITL | DELEGATION | ESCALATION | APPROVAL
      requestedAt: <ISO 8601>
      requestedBy: <agent_instance_id>
      approverRole: <role name>
      approverId: <user_id>
      decision: APPROVED | REJECTED | ESCALATED | EXPIRED
      decidedAt: <ISO 8601>
      rationale: <text — required>
      delegatedFrom: <user_id>       # only if under delegation
      delegationExpires: <ISO 8601>  # only if under delegation
      correlationId: <UUID>
```

### Manifest Rules

1. **`required: true` forces a `decisions` entry.** A manifest with
   `required: true` and empty `decisions` is a hook violation.
2. **`rationale` is mandatory** for every decision, including
   `APPROVED`. Silent approval is the most common audit failure.
3. **`correlationId` threads to `audit_log` and `gate_records`** —
   the same ID appears in all three places.
4. **`REJECTED` routes the task to IDLE** and archives the manifest.
5. **`EXPIRED` triggers ESCALATION automatically.**

### Worked example — HIGH-risk task with HITL approval

```yaml
hitl:
  required: true
  triggers:
    - riskLevel: HIGH
  decisions:
    - gateType: HITL
      requestedAt: "2026-04-24T14:32:00Z"
      requestedBy: "01HJ8K..."
      approverRole: "team-orchestrator"
      approverId: "01HJ8L..."
      decision: APPROVED
      decidedAt: "2026-04-24T14:38:14Z"
      rationale: "Schema migration rehearsed in staging; rollback plan in PR."
      correlationId: "01HJ8M..."
```

---

## Cross-references

- `docs/control-plane/hitl-gates.md` — conceptual model for gate
  types, authority, and the 3-strike rule
- `docs/control-plane/hook-system.md` — the OS-level backstop that
  enforces "no spawn without a resolved manifest"
- `governance/autonomy-registry.md` — per-agent gate level that
  interacts with this table
- `governance/pre-spawn-protocol.md` — Step 3 is where these gates
  fire
