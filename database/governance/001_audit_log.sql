-- ============================================================================
-- TABLE: awf_governance.audit_log
-- ============================================================================
-- Purpose
--   Append-only, immutable audit trail. Every gate decision, trust tier
--   change, delegation, lifecycle transition, and policy event in the
--   framework writes one row here. This is the compliance anchor for the
--   entire system.
--
-- Ownership (writers)
--   - The runtime policy layer (the AGT adapter or its equivalent in your
--     deployment) writes the signed audit record.
--   - Hook scripts (PreToolUse / PostToolUse) write block, override, and
--     enforcement events.
--   - Database lifecycle triggers on other governance tables write
--     before/after-state events when status fields mutate.
--   No agent ever writes to audit_log directly. The runtime is the only
--   authorized writer surface.
--
-- Append-only rule
--   This table is append-only. UPDATE and DELETE are blocked at the table
--   level by a BEFORE trigger that raises an exception. The reason is
--   regulatory: if any code path can rewrite history, the audit log loses
--   evidentiary value. Corrections are recorded as new rows that reference
--   the prior row via correlation_id and rationale, never by editing the
--   prior row in place.
--
-- Mutable vs immutable fields
--   ALL columns are immutable once written. There is no soft-delete and no
--   tombstone. The trigger blocks every UPDATE and every DELETE. Schema
--   changes to this table require a new schema version, not a migration.
--
-- Audit requirement
--   This table IS the audit. Mutations to other governance tables emit a
--   row here describing the change (before_state, after_state, actor_id,
--   rationale, correlation_id). audit_log itself is not double-audited.
--
-- Source
--   Section 5 Layer 8 (Control Plane) and Appendix C of the reference
--   architecture document.
--
-- Status
--   v1.0 — ships at public launch.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS awf_governance;

CREATE TABLE IF NOT EXISTS awf_governance.audit_log (
    -- Synthetic primary key. UUIDs avoid sequence contention on high-volume
    -- audit writes and make rows trivially mergeable across replicas.
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary. Required even at single-workspace scale so
    -- that enabling row-level security later is a one-line change rather
    -- than a backfill. No FK: tenants live above this schema.
    tenant_id       UUID NOT NULL,

    -- Workspace scope for the event. Nullable because some events
    -- (e.g., tenant-wide policy changes) are not workspace-scoped. No FK:
    -- workspaces table lives in the enterprise schema and is optional.
    workspace_id    UUID,

    -- The user_id or agent_instance_id that triggered the event. Nullable
    -- because some events are emitted by the system itself (scheduled
    -- jobs, lifecycle triggers). No FK: actor may be a human user managed
    -- in an external identity system.
    actor_id        UUID,

    -- Classification of who (or what) performed the action. Constrained to
    -- the five canonical actor types so downstream queries can filter by
    -- machine vs human attribution without parsing strings.
    actor_type      TEXT NOT NULL CHECK (actor_type IN (
                        'human',     -- end user or reviewer
                        'agent',     -- a workforce-plane agent
                        'service',   -- e.g., Eval/Telemetry, Deploy
                        'routine',   -- scheduled or event-triggered routine
                        'system'     -- the runtime itself
                    )),

    -- Free-form event identifier in dotted notation. Examples:
    --   'gate.approved', 'gate.rejected', 'trust.tier_changed',
    --   'work_item.status_changed', 'delegation.created',
    --   'failure_record.status_changed', 'hook.blocked'.
    -- Not enumerated because new event types are added without schema change.
    event_type      TEXT NOT NULL,

    -- The fully-qualified table whose row was affected, or NULL for events
    -- that do not target a specific row (e.g., 'policy.reloaded').
    subject_table   TEXT,

    -- Primary key of the affected row in subject_table, or NULL.
    subject_id      UUID,

    -- JSONB snapshot of the row before the change. NULL for INSERT events.
    -- Snapshot is the full row, not a diff, so the audit can be replayed
    -- without joining back to the source table.
    before_state    JSONB,

    -- JSONB snapshot of the row after the change. NULL for DELETE events.
    after_state     JSONB,

    -- Free-text justification. Required by convention for every
    -- gate decision, every delegation, and every status change to
    -- failure_records. Not enforced NOT NULL because some system events
    -- have no rationale to record.
    rationale       TEXT,

    -- Threads related events into one logical chain. One task / session /
    -- workflow shares a single correlation_id across audit_log,
    -- agent_events, gate_records, work_queue_items, and routine_runs.
    -- Required so the audit trail can be reconstructed end-to-end.
    correlation_id  TEXT NOT NULL,

    -- Optional cryptographic signature over the canonicalized row payload.
    -- Populated by deployments that run a runtime policy layer with
    -- signing enabled. Absence is not a failure — only its tampering is.
    signature       TEXT,

    -- Identity of the signer (e.g., an AGT DID or a service account ID).
    signed_by       TEXT,

    -- Insertion timestamp. The trigger forbids changing this. Indexed in
    -- DESC order on tenant_id + created_at for the typical "show me the
    -- last N events for this tenant" read pattern.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- The audit log is read overwhelmingly by tenant + time range, by
-- correlation thread, by event type, and by subject. The four indexes
-- below cover those patterns. Additional indexes should be added only with
-- evidence — every index increases write cost on what is already the
-- highest-volume governance table.

-- Tenant + time DESC: serves the most common read — "show me the last N
-- events for this tenant" — and the compliance export query that scans by
-- tenant within a date range.
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time
    ON awf_governance.audit_log (tenant_id, created_at DESC);

-- Correlation lookup: reconstructs the full chain of events for one task /
-- session / workflow. Used by incident review and by the QA Agent when
-- assembling D2 (observability) evidence.
CREATE INDEX IF NOT EXISTS idx_audit_log_correlation
    ON awf_governance.audit_log (correlation_id);

-- Event-type histogram and time-bounded counts: serves dashboards
-- ("how many gate.rejected events in the last 24h?") and the policy
-- self-evaluation routines.
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type
    ON awf_governance.audit_log (event_type, created_at DESC);

-- Per-row history: serves "show me everything that ever happened to this
-- failure_record / work_queue_item / gate_record". Required for the
-- before/after replay used by post-mortems.
CREATE INDEX IF NOT EXISTS idx_audit_log_subject
    ON awf_governance.audit_log (subject_table, subject_id);

-- ============================================================================
-- IMMUTABILITY ENFORCEMENT
-- ============================================================================
-- Postgres has no native "table is append-only" constraint. The trigger
-- below is the enforcement mechanism. Do not add a policy or rule that
-- bypasses it. If a future migration needs to evolve audit_log, the
-- correct path is a new schema version with a one-time forward migration,
-- not editing rows in place.

CREATE OR REPLACE FUNCTION awf_governance.audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'awf_governance.audit_log is append-only. UPDATE and DELETE are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON awf_governance.audit_log;
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE OR DELETE ON awf_governance.audit_log
  FOR EACH ROW EXECUTE FUNCTION awf_governance.audit_log_immutable();

-- ============================================================================
-- TABLE / COLUMN COMMENTS (visible via \d+ in psql)
-- ============================================================================
COMMENT ON TABLE awf_governance.audit_log IS
  'Append-only, immutable audit trail. Writers: runtime policy layer, hooks, lifecycle triggers. Never written to by agents directly.';

COMMENT ON COLUMN awf_governance.audit_log.actor_type IS
  'Five-valued enum: human, agent, service, routine, system. Lets queries split machine vs human attribution.';

COMMENT ON COLUMN awf_governance.audit_log.correlation_id IS
  'Threads related events. One task / session / workflow shares one correlation_id across all governance tables.';

COMMENT ON COLUMN awf_governance.audit_log.before_state IS
  'JSONB snapshot of the affected row before mutation. NULL on INSERT events.';

COMMENT ON COLUMN awf_governance.audit_log.after_state IS
  'JSONB snapshot of the affected row after mutation. NULL on DELETE events.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — record a HITL gate approval. The runtime policy layer
--    inserts this row immediately after the approver signs the manifest.
--    The before_state captures the gate row at PENDING; the after_state
--    captures it at APPROVED. The same correlation_id appears in
--    gate_records and (for the same task) in work_queue_items.
--
-- INSERT INTO awf_governance.audit_log (
--     tenant_id, workspace_id, actor_id, actor_type,
--     event_type, subject_table, subject_id,
--     before_state, after_state, rationale, correlation_id,
--     signature, signed_by
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-000000000010'::uuid,
--     '00000000-0000-0000-0000-000000000abc'::uuid,
--     'human',
--     'gate.approved',
--     'awf_governance.gate_records',
--     '00000000-0000-0000-0000-0000000000a1'::uuid,
--     '{"status":"PENDING","gate_type":"HITL"}'::jsonb,
--     '{"status":"APPROVED","gate_type":"HITL","approver_id":"...abc"}'::jsonb,
--     'Schema migration tested in staging; rollback plan in PR.',
--     '01HJ8M00000000000000000000',
--     'sig:base64...',
--     'did:agt:approver-handle'
-- );
--
-- 2. Most common read — last 100 events for a tenant, newest first.
--    Served by idx_audit_log_tenant_time.
--
-- SELECT id, event_type, actor_type, subject_table, rationale, created_at
--   FROM awf_governance.audit_log
--  WHERE tenant_id = $1
--  ORDER BY created_at DESC
--  LIMIT 100;
--
-- 3. Trust history reconstruction — every event for one correlation_id
--    in chronological order. Used by post-mortems and by the QA Agent
--    when assembling D2 (observability) evidence at session close.
--
-- SELECT created_at, actor_type, event_type, subject_table, before_state, after_state, rationale
--   FROM awf_governance.audit_log
--  WHERE correlation_id = $1
--  ORDER BY created_at ASC;
