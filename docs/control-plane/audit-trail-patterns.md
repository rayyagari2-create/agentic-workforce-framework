# Audit Trail Patterns

**Append-only design, event sourcing path, before/after state capture,
correlation ID threading.**

The audit log is the framework's foundation for accountability. If
the log is incomplete, governance is opinion. If the log is mutable,
governance is whatever someone decided to remember. This document
specifies the discipline that keeps the log usable.

---

## The Single Property That Matters

**Append-only.** Once an event is written, it cannot be modified or
deleted.

Every other property of the audit log derives from this one. Without
append-only, the log is just another mutable record subject to drift,
"corrections," and silent suppression. With append-only, the log is
ground truth.

### What Append-Only Forbids

- `UPDATE` on existing rows
- `DELETE` on existing rows
- "Correction" by writing a corrected version of an old event without
  preserving the original
- Bulk archival that removes events from query
- Soft-delete (a flag that hides events from default queries)

If a fact in the log is wrong, the response is to write a new event
that supersedes it — preserving the original. The original is part of
the historical record.

### What Append-Only Permits

- INSERT, always
- Read, always
- Cryptographic chaining (each event references the prior event's
  hash)
- Partitioning for performance (newer events in hot partition; older
  events in cold storage that is still queryable)

---

## What Goes In the Log

The audit log captures:

- **Tool use events.** Every PreToolUse and PostToolUse hook fires;
  every action that ran or was blocked.
- **Phase transitions.** Build state machine moves (DEBUG → DESIGN →
  BUILD → QA → COMPLETE).
- **Gate events.** HITL approvals, delegations, escalations, denials.
- **Spawn events.** Agent creation, with parent/child relationships.
- **Trust score changes.** Tier promotions and demotions.
- **FailureRecord lifecycle.** Created, status changes, closed.
- **Override events.** Operator overrides, with TTL and rationale.
- **Lifecycle events.** Agent onboarding, restriction, retirement.
- **Policy violations.** From the runtime policy layer if integrated.

Each event has the same minimal envelope (below).

---

## The Event Envelope

Every audit event includes:

```
{
  "event_id":       "ULID — unique, monotonic",
  "event_type":     "phase_transition / spawn / gate / ...",
  "timestamp":      "ISO 8601",
  "actor_id":       "agent ID or human user ID",
  "actor_type":     "agent / human / service",
  "session_id":     "session this event belongs to",
  "correlation_id": "groups related events across components",
  "before_state":   "captured state before this event (for mutations)",
  "after_state":    "captured state after this event",
  "rationale":      "free text — required for some event types",
  "prev_event_hash": "(optional) cryptographic chain reference"
}
```

Some fields are required for all events (`event_id`, `event_type`,
`timestamp`, `correlation_id`). Others are required for specific event
classes (`rationale` for HITL approvals, `before_state` and
`after_state` for status transitions).

---

## Before/After State Capture

For any mutation event — a status change, a tier move, an assignment —
the log captures the state before and after.

### Why Both

Capturing only "after" is insufficient. To audit "did this transition
make sense?" you need to compare what was true with what became true.

Example — a trust tier move:

```
{
  "event_type": "trust_tier_change",
  "before_state": {
    "tier": "STANDARD",
    "score": 86,
    "n_sessions": 12,
    "confidence_band": "MEDIUM"
  },
  "after_state": {
    "tier": "HIGH",
    "score": 92,
    "n_sessions": 13,
    "confidence_band": "MEDIUM"
  },
  "rationale": "Sustained ≥90 across last 5 weighted sessions.",
  "actor_id": "operator-rayyagari"
}
```

A reviewer reading this can verify the rationale matches the data —
that it was genuinely sustained, not a single-session jump.

### What to Snapshot

Snapshot only fields that changed and the fields needed to evaluate
the change. Snapshotting the entire record bloats the log and obscures
what mattered.

---

## Correlation ID Threading

A correlation ID is a single value that follows a unit of work through
every layer.

```
session starts                  →   correlation_id = corr-9X7
  task assignment               →   corr-9X7 attached to manifest
    pre-spawn protocol          →   corr-9X7 in pre-spawn audit events
      agent spawned             →   corr-9X7 inherited
        tool use #1             →   corr-9X7 in PreToolUse hook event
        tool use #2             →   corr-9X7 in PreToolUse hook event
        QA verdict produced     →   corr-9X7 attached
      session scored            →   corr-9X7 in trust ledger
    FailureRecord (if any)      →   corr-9X7 in failure record
session closes                  →   corr-9X7 in close event
```

### Why Threading Matters

Without correlation IDs, an audit log is a stream of events that no
one can reconstruct into stories. With correlation IDs, you can ask
"show me everything that happened in session corr-9X7" and get a
complete, ordered narrative.

This is the property that makes the log **investigable**, not just
recorded.

### Threading Rules

| Rule | Detail |
|---|---|
| One correlation_id per session | Don't reuse across sessions |
| Inherited by spawned agents | Subagent uses the parent's correlation_id |
| Carried into FailureRecords | The record's `correlationId` field links to the session |
| Carried into trust ledger | The session's score row references it |
| Visible in QAVerdicts | Verdicts produced during the session reference it |

A spawn that does not inherit the correlation_id breaks the thread.
This is enforced — see the `check-agent-spawn` hook.

---

## Event Sourcing Path

The framework's design is event-sourcing-ready. State can be
reconstructed by replaying events from the log.

### What "Event Sourcing Path" Means

- Every state change emits an event before the change is reflected in
  the application's primary state.
- The primary state can be rebuilt by replaying the event stream from
  the beginning.
- New aggregates (or read models) can be added later by replaying the
  same stream.

### Why "Path" Rather Than "Pattern"

Strict event sourcing — where every read goes through projections of
the event log — is heavyweight. The framework's v1.0 design supports
the path without mandating the destination.

| Approach | When |
|---|---|
| **Operational tables with audit log** | v1.0 default. Tables hold current state; the log captures every change. |
| **Strict event sourcing** | v3.0+ option. Tables become projections; events are the only source of truth. |

The migration from approach 1 to approach 2 requires no schema
rewrite — just a different read path. Because every state change
already emits an event, the projections can be built from existing
data.

### Operational Lifecycle Mutability Rule

To support the path while keeping operational tables practical, the
framework defines a mutability rule:

```
Append-only applies to: audit_log, agent_events, and event-history tables.

Operational tables (e.g., work queue, agent instances, gate records)
may update only specific lifecycle fields:
  - status transitions
  - resolved_at / closed_at / archived_at
  - assigned_to / current_workspace
  - updated_at

Identity and creation fields are immutable:
  - id, tenant_id, created_at, registered_at, role_type

Every lifecycle update emits an audit_log event with:
  before_state, after_state, actor_id, correlation_id, timestamp
```

This is the practical compromise: operational ergonomics with full
audit traceability.

---

## Replay

Because the log is append-only and ordered, any state can be
reconstructed by replaying.

### What Can Be Replayed

- An agent's trust trajectory across N sessions
- A specific session's full execution sequence
- The state of the failure library at any past timestamp
- The set of permissions an agent held at any past moment
- The chain of approvals leading to a specific commit

### Replay Performance

Replay is a read pattern. It does not require special infrastructure
beyond the log itself, but it benefits from:

- Indexes on `correlation_id`, `event_type`, `actor_id`
- Partitioning by time (so replays of recent events are fast)
- A "snapshot" pattern for very long-lived aggregates (snapshot at T,
  replay only events after T)

A team that has never needed to replay should expect to need it the
first time something goes seriously wrong. The cost of preparing for
replay is much smaller than the cost of not being able to.

---

## Cryptographic Chaining (Optional)

For higher-assurance deployments, each event references the prior
event's hash:

```
event_n.prev_event_hash = sha256(event_(n-1) bytes)
```

This makes silent tampering detectable: changing event_(n-1) breaks
the chain at event_n, which breaks the chain at event_(n+1), and so on.

Chaining is optional in v1.0. It becomes important when the audit log
itself must withstand insider threats or compliance scrutiny that
demands tamper-evidence.

---

## What the Audit Log Is Not

- **Not a debug log.** Debug output goes elsewhere; the audit log is
  for accountability events.
- **Not a metrics store.** Aggregate metrics (latency, throughput) live
  in a metrics system; the audit log records facts about specific
  events.
- **Not a UI substitute.** Reading the raw log is for forensics; the
  Command Center (v3.0+) is for daily operation.

Mixing these concerns produces a log that is too noisy for forensics
and too narrow for observability. Keep them separate.

---

## Common Audit Trail Mistakes

| Mistake | Effect |
|---|---|
| Mutating events to "correct" them | Breaks append-only; loses history |
| Forgetting correlation_id on spawn | Thread breaks; replay fragments |
| Snapshotting only "after" state | Cannot evaluate whether transition made sense |
| Allowing the audit writer to fail silently | Failure mode #4 — silent audit suppression |
| Mixing audit, debug, metrics in one log | Each becomes harder to query |
| Bulk archival with deletion | Old incidents become uninvestigable |

---

## Related

- `docs/control-plane/hook-system.md` — the PostToolUse audit-write
  hook fires for every action.
- `docs/control-plane/meta-governance.md` — failure mode #4 covers
  silent audit suppression.
- `database/governance/001_audit_log.sql` — the audit log schema.
- `docs/architecture/decision-records/0004-append-only-audit-log.md` —
  the ADR documenting this decision.
