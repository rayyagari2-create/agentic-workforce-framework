# ADR 0004 The Audit Log Is Append-Only

## Status

Accepted.

## Context

The framework's control plane centers on one durable artifact: the audit log.
Every gate decision, trust tier change, delegation, escalation, state transition,
and routine run writes a row into it. The runtime policy layer (AGT or
equivalent) signs those rows cryptographically where supported.

Two properties of the audit log are load-bearing for the entire framework:

1. It is the evidence trail that supports compliance claims EU AI Act control
   evidence, NIST AI RMF traceability, SOC 2 logging requirements, HIPAA
   accountability.
2. It is the ground truth the framework reads back during incident response.
   When an autonomy gate misfires or a trust tier change looks wrong, the audit
   log is what we reconstruct the session from.

Both properties collapse if an operator can rewrite history. A mutable audit log
is not an audit log; it is a convenient lie.

## Decision

The audit log is **append-only at the table level and enforced by a trigger.**
UPDATE and DELETE are forbidden.

Concretely:

- `agentforce_governance.audit_log` has a BEFORE UPDATE OR DELETE trigger that
  raises an exception on any attempt to mutate or remove a row. No role in the
  database has a safe path past this not even `superuser` roles operating
  inside the application.
- Every lifecycle table that *can* mutate (work queue items, gate records,
  agent instances) must emit an immutable audit_log event on every change. The
  event contains `before_state`, `after_state`, `actor_id`, `correlation_id`,
  and a timestamp. This preserves full traceability without requiring event
  sourcing on every operational table.
- Operational lifecycle tables may update a strictly limited set of mutable
  fields (e.g., `status`, `resolved_at`, `assigned_to`). Identity fields and
  creation timestamps are immutable.

If strict event sourcing is adopted in a future version, operational tables
become fully immutable and status transitions move to dedicated event tables.
The append-only audit log is the invariant that survives that migration.

## Consequences

**Positive.**

- Compliance posture is defensible. Audit log evidence is reconstructable,
  tamper-evident, and cryptographically chained where the runtime policy layer
  supports signing.
- Incident response has ground truth. Every autonomy tier change, gate
  approval, and delegation is a row that nobody could have edited after the fact.
- Cross-system correlation works. The `correlation_id` threads related events
  across the governance schema, the enterprise schema, and routine runs.

**Negative.**

- Storage grows monotonically. This is a feature, not a bug but deployments
  need a retention policy that archives rather than deletes (e.g., partition
  and migrate cold partitions to object storage, retaining cryptographic chain).
- "Fix" workflows require a new row, not an edit. A mistaken gate approval
  generates a reversing row; the original stays visible in the history.
- Schema migrations on `audit_log` require care. Column additions are safe;
  column removals break historical reads. The default is "never remove columns;
  introduce a new schema version if the record shape changes materially."

**Follow-on.**

- Every new operational table must ship with an audit-log emission path. PRs
  that introduce a lifecycle field without the corresponding event emission are
  rejected by review.
- Operational lifecycle mutability rules are documented in the enterprise
  schema files next to each table.
- Degraded-mode behavior when the runtime policy layer signing service is
  unavailable: the log still writes, with the `signature` field null and a
  post-incident re-sign pass required before compliance evidence is exported.
