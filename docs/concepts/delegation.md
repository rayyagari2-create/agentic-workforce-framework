# Delegation

> **Status:** Designed for multi-reviewer teams. Not yet field-proven
> in the reference implementation (the single-reviewer model does not
> require delegation). Schema published in
> `database/enterprise/007_delegation_rules.sql`.

## Opening — What Delegation Is

A designated approver is unavailable: out of office, off-hours, on a
flight, in another time zone. Without delegation, the HIGH-risk work
they own blocks entirely — the gate stays PENDING until either the
TTL expires (and the task escalates upward) or the approver returns.
With delegation, authority can be temporarily transferred to a
qualified delegate so the work proceeds — but only explicitly, only
for a defined scope, and only for a limited time. Delegation is the
mechanism that keeps approval chains responsive without weakening the
audit trail that makes them trustworthy.

---

## The Four Delegation Rules

These four rules are the load-bearing properties of the model. The
absence of any one of them turns delegation from a controlled hand-off
into a workaround.

### Rule 1 — Delegation is explicit, never implicit

If a designated reviewer is unavailable and no delegation record
exists, the gate waits or escalates. Absence of a reviewer is not
implicit permission. This rule prevents the most common delegation
anti-pattern: "they were unavailable so I just proceeded." A
delegation must be a row in `delegation_rules` with all required
fields populated — a `delegator_id`, a `delegate_id`, the `gate_types`
covered, the `max_risk_level` ceiling, the time window, and the
rationale. No row, no delegation. The gate engine looks up that row
explicitly when an unavailable-approver case fires; it does not infer
authority from anything else.

### Rule 2 — A delegate cannot re-delegate

The person receiving delegated authority cannot pass it to a third
party. This is enforced at the application layer: only users who
hold *original* authority — not delegated authority — may create new
`delegation_rules` rows. A delegation chain longer than one hop is
not a delegation — it is a workaround. Each additional hop dilutes
the link between the original authority and the eventual decision
until the audit trail can no longer answer "who actually said yes."
The single-hop rule keeps that link intact.

### Rule 3 — Delegation expires

Every delegation record requires a `valid_until` timestamp. No
permanent delegations. When the TTL expires, authority returns to
the original approver — the gate engine no longer matches the
delegation row, and any new gate of the covered type routes back to
the delegator (or escalates if the delegator is also unavailable).
The delegate receives no notification that their authority has
lapsed; it is their responsibility to know. The schema enforces this
rule at INSERT time (`valid_until` is `NOT NULL`); workspace policy
enforces a maximum TTL — typically 14 days — because long delegations
defeat the audit value. A 90-day delegation is not a delegation; it
is a transfer of authority.

### Rule 4 — Every delegation is audited

Every delegation grant and every approval made under delegated
authority is recorded in the audit log. The grant event carries
`actor_id` (the delegator), `delegate_id`, `gate_types` covered,
`max_risk_level`, `valid_from` and `valid_until`. Each approval made
under delegation carries `delegation_rule_id` linking back to the
grant, along with the specific decision recorded. A delegation that
is never used is also auditable — its creation is a recorded event
even if no approvals ever cite it. The full chain — who delegated to
whom, for what scope, for how long, and which decisions cited the
delegation — is reconstructable from the audit log alone.

---

## What Delegation Covers

A delegation's scope is the intersection of two fields on the
`delegation_rules` row.

- **`gate_types`** — which gate types this delegation covers, as an
  array drawn from the gate type enum (`HITL`, `DELEGATION`,
  `ESCALATION`, `APPROVAL`). A delegation that covers HITL only does
  not authorize the delegate to handle an ESCALATION that arises on
  the same task. A delegation that covers HITL plus ESCALATION
  authorizes both. Empty arrays are rejected at the schema level
  (`CHECK cardinality(gate_types) > 0`); a delegation that covers no
  gate types is meaningless.
- **`max_risk_level`** — the highest risk level the delegate may
  approve. The runtime evaluates `gate.risk_level <= max_risk_level`
  using the ordering LOW < MEDIUM < HIGH < CRITICAL. A delegate
  cannot be granted authority beyond the delegator's own authority —
  a Tech Lead who can approve up to HIGH cannot grant a deputy a
  CRITICAL ceiling.

The intersection is enforced at lookup time. A gate that exceeds
either constraint does not match the delegation, and the chain falls
through to the next escalation step.

---

## What Delegation Does Not Cover

- **CRITICAL-risk tasks.** Delegation cannot cover CRITICAL.
  CTO-equivalent approval is always direct, and the multi-authority
  requirement of the APPROVAL gate type cannot be satisfied by a
  single delegate's signature.
- **Re-delegation.** A delegate cannot grant further authority. The
  application layer rejects any `delegation_rules` INSERT where the
  proposed delegator does not hold original authority.
- **Open-ended scope.** Every delegation must specify `gate_types`
  and `max_risk_level` explicitly. There is no "covers everything"
  shorthand. Absence of a scope field is treated as zero scope, not
  unlimited scope.
- **Retroactive approval.** Delegation cannot authorize work that
  has already started without approval. The gate must fire and the
  delegation must match before SPAWN; a delegation created after the
  fact does not retroactively legitimize an unapproved action.

---

## Schema Reference

The schema is defined in
`database/enterprise/007_delegation_rules.sql`. The fields below are
the load-bearing ones for delegation lookups and audit reconstruction.

| Field | Purpose |
|---|---|
| `delegator_id` | The original authority granting the delegation. Immutable. |
| `delegate_id` | The temporary authority receiving it. Immutable. Cannot equal `delegator_id` (CHECK). |
| `gate_types` | Subset of the gate type enum this delegation covers. Non-empty (CHECK). |
| `max_risk_level` | The highest risk level the delegate may approve. Immutable. |
| `valid_from` | When the delegation becomes effective. Immutable. |
| `valid_until` | TTL — when authority returns to the delegator. Immutable so a delegate cannot silently extend their own window. |
| `workspace_scope_id` | Workspace this delegation applies to. Mutually exclusive with `division_scope_id` (CHECK). |

Additional fields — `revoked_at`, `revoked_by`, `revocation_reason`,
`rationale`, `metadata` — support early termination, audit clarity,
and structured tagging. See the schema file for the full column list
and the indexes that serve the gate-engine lookup path.

---

## Relationship to Escalation

Delegation handles planned unavailability — the on-call rotation, the
two-week vacation, the deliberate hand-off. Escalation handles
unplanned unavailability — the gate that times out because nobody
acted, the approval loop that has already failed three times. The two
mechanisms compose: if a delegate is also unavailable and no further
delegation exists (because re-delegation is forbidden), the gate does
not wait indefinitely for the delegate's return. It escalates upward.
Delegation is the path that keeps work moving when an approver is
known to be away. Escalation is the path that keeps work moving when
nobody at the planned authority level is reachable at all. A robust
approval chain uses both.

---

## Cross-references

- HITL gate types and authority levels: `docs/control-plane/hitl-gates.md`
- Approval gate chain composition: [approval-gate-chains.md](approval-gate-chains.md)
- Audit trail patterns: `docs/control-plane/audit-trail-patterns.md`
- Schema definitions: `database/enterprise/007_delegation_rules.sql`,
  `database/enterprise/006_gate_records.sql`
- Trust scoring and autonomy gates: [trust-scoring.md](trust-scoring.md), [autonomy-gates.md](autonomy-gates.md)
- Enterprise scaling architecture: `docs/architecture/enterprise-scaling.md`
