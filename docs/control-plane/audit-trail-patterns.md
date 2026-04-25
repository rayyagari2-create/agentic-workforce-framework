# Audit Trail Patterns

**Append-only design, before/after state capture, correlation IDs,
event sourcing path, and the immutable-fields rule.**

The audit trail is the foundation everything else in the control plane
sits on. Pre-spawn produces records, the state machine emits
transitions, gates write decisions, hooks log overrides — all of it
lands in a single append-only stream that can never be mutated.

If the audit trail can be silently rewritten, every other guarantee in
this framework is a guess.

---

## Append-Only Design

The audit log is **append-only**. There is no `UPDATE`. There is no
`DELETE`. The only operation is `INSERT`.

```
audit_log:
  Operations permitted:  INSERT
  Operations forbidden:  UPDATE, DELETE, TRUNCATE
  Enforcement layer:     database role permissions + application
                         layer + hook layer
```

The append-only constraint is enforced at three layers because
defense-in-depth is the only acceptable posture for an audit trail.

### Layer 1 — Database Role Permissions

The role used by application code to write the audit log has `INSERT`
only. No `UPDATE`, `DELETE`, or `TRUNCATE` privilege. A row that lands
cannot be removed by any code path the application has access to.

### Layer 2 — Application Layer

The audit-write helper is the only sanctioned path to the table. It
validates the schema, attaches the correlation ID, and signs the
entry (Wave 1 onward). No other code path may write to `audit_log`.

### Layer 3 — Hook Layer

`check-audit-write` validates every audit write attempt. A write that
does not include a correlation ID, a `before_state` (when applicable),
an `after_state`, an `actor_id`, and a timestamp is rejected at
`exit(2)`.

### What "Append-Only" Means at Different Storage Tiers

| Storage Tier | Append-Only Mechanism |
|---|---|
| File-based (current single-workspace) | Files are git-committed; history is the recovery path; rewrite shows in `git log` |
| Postgres (Wave 2+) | Database role + cryptographic chaining of audit entries |
| Object store (export tier) | WORM bucket policy; immutable retention period |

The mechanism varies; the property does not. An entry that has been
appended cannot be silently removed at any tier.

---

## Before/After State Capture

Every mutation to a governance-relevant entity must record both the
before-state and the after-state. The mutation row in the entity table
is paired with an audit row that captures the transition.

```
audit_log entry (canonical fields):
  id              UUID  (immutable, generated)
  timestamp       TIMESTAMPTZ (immutable)
  actor_id        UUID  (who initiated the action)
  correlation_id  UUID  (threads through related entries)
  entity_type     TEXT  (e.g. 'gate_records', 'agent_instances')
  entity_id       UUID  (which row was mutated)
  action          TEXT  ('CREATE' | 'UPDATE' | 'STATE_TRANSITION' | ...)
  before_state    JSONB (the row state before mutation; NULL on CREATE)
  after_state     JSONB (the row state after mutation)
  signature       BYTEA (cryptographic signature, Wave 1+)
```

### Why Both States, Not Just the Diff

A diff is reconstructable from `before_state` and `after_state`, but
the reverse is not true — given a diff, you cannot validate the
starting point was correct. Storing both states makes every entry
self-contained.

If the table being audited is later corrupted or its schema migrated,
the audit log still has the full picture of what happened, in the
schema that was current at the time of the mutation.

### When Before/After Capture is Required

| Mutation Type | Before/After Required |
|---|---|
| `CREATE` (new row) | After only; before is `NULL` |
| `UPDATE` (lifecycle field change) | Both required |
| `STATUS_TRANSITION` (e.g. PENDING → APPROVED) | Both required, full row |
| Sensitive field update (trust score, capability boundary) | Both required, full row |

---

## Correlation ID Pattern

Every action threads a correlation ID through every related entry.

```
A single user action that triggers:
  1. A pre-spawn manifest write
  2. A HITL gate fire
  3. A gate decision
  4. A spawn record
  5. A state transition into SPAWN
  6. A bulletin entry
  7. A QA verdict
  8. A state transition into COMPLETE

…all carry the SAME correlation_id. Reconstruction of "what happened"
is a single query: SELECT * FROM audit_log WHERE correlation_id = ?
```

### Correlation ID Properties

1. **Generated at the entry point.** The orchestrator assigns the
   correlation ID when it picks up the task. The same ID propagates
   through every subsequent action.
2. **Carried in every cross-component call.** When the orchestrator
   spawns a subagent, the manifest carries the correlation ID; when
   the QA-Agent fires, it inherits the ID; when the hook layer logs
   an override, it logs against the same ID.
3. **Externally visible in every record.** The correlation ID is a
   first-class column in `audit_log`, `gate_records`,
   `manual_reviews`, `agent_runs`, `agent_events`, and
   `routine_runs`.
4. **Never reused.** Each task gets its own correlation ID, even
   re-runs of the same task after a QA FAIL.

### Threading Across Routines

Routines (the automation plane) carry their own correlation IDs.
When a routine fires as a result of an upstream action (for example,
a deploy verification routine fired by the deploy pipeline), the
upstream correlation ID is recorded in `routine_runs` alongside the
routine's own correlation ID. The audit trail can join across both.

---

## Event Sourcing Path

The current model is "operational tables + audit log" — operational
tables hold current state; audit log holds the immutable history.

The Wave 3+ migration path is to **strict event sourcing**, in which
operational tables become projections rather than primary storage.

### Current Model

```
gate_records, agent_instances, work_queue_items
   ↑ mutable lifecycle fields (status, resolved_at, ...)
   │
   └── every mutation emits an immutable audit_log event
       containing before_state, after_state, actor_id, correlation_id

audit_log
   ↑ append-only forever
```

The operational tables track current state directly. The audit trail
gives the history. Reading current state is fast; reconstructing
history requires a query.

### Strict Event Sourcing (Wave 3+ Option)

```
audit_log (event store)
   ↑ append-only forever; primary storage of state transitions

operational tables become projections:
   - Materialized views over audit_log
   - Refreshed on every audit_log write
   - Operational tables themselves become immutable
   - Status transitions live in dedicated event tables
```

Strict event sourcing removes the operational mutability entirely.
Every state of the system is a function of the audit log; the
operational tables are caches.

The migration is optional. The current model meets the audit
requirements as long as the operational lifecycle mutability rule is
followed (below). The benefit of strict event sourcing is reduced
complexity around mutability rules; the cost is materialized view
infrastructure.

---

## Operational Lifecycle Mutability Rule

This is the rule that makes the current model work. It is stated
verbatim because it is load-bearing.

```
Append-only applies to: audit_log, agent_events, and all event
                        history tables.

Operational lifecycle tables (work_queue_items, gate_records,
agent_instances) may update LIMITED LIFECYCLE FIELDS only:

  Permitted mutable fields: status, resolved_at, relieved_at,
                            assigned_to, assigned_at, updated_at,
                            current_workspace, operator_assignment,
                            archived_at

  Immutable fields:         id, tenant_id, workspace_id,
                            registered_at, created_at, and all
                            identity fields

Every lifecycle update MUST emit an immutable event to audit_log
containing:
  before_state, after_state, actor_id, correlation_id, timestamp

This preserves full audit traceability without requiring strict event
sourcing on all tables. If strict event sourcing is adopted in
Wave 3+, operational tables become immutable and status transitions
move to dedicated event tables.
```

### What This Rule Permits

The status of a work queue item moves from `CREATED` →
`ASSIGNED` → `IN_PROGRESS` → `QA_IN_PROGRESS` → `COMPLETE` over the
life of the work. The `status` column on the operational row mutates
through these values. Each transition emits an audit log entry with
before/after.

### What This Rule Forbids

The `id` of a work queue item never changes. The `tenant_id` never
changes. The `created_at` never changes. The `description` (the
task definition) never changes. If the task needs to be redefined,
a new row is created — the original is preserved with whatever final
status it reached.

### How It Is Enforced

| Layer | Mechanism |
|---|---|
| Database | Triggers (or application contract) reject UPDATE on immutable columns |
| Application | The mutation helper accepts only the permitted fields |
| Audit | A mutation that lands without a corresponding audit log entry is detectable by reconciliation queries |
| Hook | `check-audit-write` validates the audit entry's `before_state` matches the prior row state |

---

## Immutable Fields Rule (Per-Table Reference)

Each governance table has an explicit immutable-fields list. The most
common cases:

| Table | Immutable Fields | Rationale |
|---|---|---|
| `audit_log` | All fields | Append-only by definition |
| `agent_events` | All fields | Append-only by definition |
| `agent_instances` | `id`, `tenant_id`, `role_type`, `original_workspace`, `agt_did`, `registered_at` | Identity must persist; trust history follows the instance |
| `work_queue_items` | `id`, `workspace_id`, `tenant_id`, `created_at`, `title`, `description` | The task definition is what was assigned |
| `gate_records` | `id`, `workspace_id`, `work_item_id`, `gate_type`, `risk_level`, `requested_by`, `created_at` | The gate was triggered for a reason; that reason is permanent |
| `delegation_rules` | All fields | Delegation history is itself audit-relevant |
| `failure_records` | `id`, `domain`, `failureClass`, `agentsInvolved`, `createdAt` | Recurrence detection requires stable identity |
| `trust_scores` | `id`, `agent_id`, `session_id`, `scored_at`, all D1-D4 values | A score that can be rewritten is not a score |

### Why Identity Fields Are Always Immutable

Identity fields anchor the foreign-key relationships that make the
audit graph navigable. If `agent_instances.id` could change, every
historical reference to that agent in the audit log would become
stale. The trust history that "follows the instance" only works
because the instance's identity is permanent.

The same logic applies to any table that participates in
correlation-ID threading: the immutable fields are precisely the
fields that other entries reference.

---

## What the Audit Trail Captures

The audit trail captures every action a control plane component took.
Concretely:

| Source | Recorded | Frequency |
|---|---|---|
| Pre-spawn manifest creation | Full manifest as `after_state` | Every spawn |
| Risk classification override (downward) | Before/after with rationale | Every override |
| HITL gate fire | Gate trigger + risk level + requesting agent | Every gate |
| HITL decision | Approver, decision, rationale, delegation context | Every decision |
| State machine transition | from_state, to_state, agent_instance_id | Every transition |
| QA verdict | Full QAVerdict | Every QA run |
| Hook block | Hook name, action attempted, reason for block | Every block |
| Override marker use | Marker creation time, action allowed, hook overridden | Every use |
| Trust score assignment | Agent, dimensions, score, scorer | Every score |
| Failure record creation | Full FailureRecord | Every record |
| Routine fire | Routine ID, trigger type, payload, result | Every fire |
| Lifecycle field mutation (operational table) | Before/after of the row | Every mutation |

### What the Audit Trail Does Not Capture

The audit trail is for **control plane actions**. It does not capture:

- Application data writes (those go to product schemas with their own
  audit posture)
- Read operations (audit logging every read is too noisy to be useful;
  the framework relies on field-level access controls instead)
- Internal agent reasoning (the bulletin captures the observable
  reasoning state; private chain-of-thought is not stored)

If a regulatory or contractual requirement mandates capturing reads or
internal reasoning, that is an extension of the audit trail and
follows the same patterns (append-only, before/after where applicable,
correlation ID threading).

---

## Audit Trail as Forensic Record

When something goes wrong, the audit trail is the primary
investigation tool. The reconstruction pattern is:

```
1. Identify the affected entity (work queue item, agent instance,
   session)
2. Look up the correlation_id from the entity's last known state
3. Query audit_log WHERE correlation_id = ?
4. Order by timestamp
5. Read the sequence of before_state → after_state transitions
6. Cross-reference with bulletin entries (agent_events) for the same
   correlation_id to recover reasoning context
7. If the issue is a missed gate, query gate_records WHERE
   correlation_id = ? to confirm gate state at the time
```

A complete forensic reconstruction should not require any other source
than the audit log + the bulletin (which is itself append-only and
correlation-ID-threaded). If reconstruction requires guessing or
inferring missing context, the audit trail has a gap that needs to be
filled at the source.

---

## Related

- `hook-system.md` — `check-audit-write` enforces audit format on
  every write
- `hitl-gates.md` — gate decisions land in `gate_records` and emit
  audit entries on lifecycle mutation
- `build-state-machine.md` — every state transition is an audit entry
- `meta-governance.md` — recovery protocols depend on audit trail
  reconstructability
- `compliance-evidence.md` — what the audit trail provides to
  external compliance frameworks
