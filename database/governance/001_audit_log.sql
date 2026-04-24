-- agentforce_governance.audit_log
-- Append-only audit trail. Immutable. Signed by the runtime policy layer (AGT or equivalent).
-- NEVER UPDATE. NEVER DELETE. This is the compliance anchor for the entire framework.
--
-- Source: Section 5 Layer 8 of the Agentic Workforce Architecture
-- Scope : governance plane only. No product-domain columns.
-- Status: v1.0 — ships at public launch.

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

CREATE TABLE IF NOT EXISTS agentforce_governance.audit_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    workspace_id    UUID,
    actor_id        UUID,                       -- user_id or agent_instance_id that triggered the event
    actor_type      TEXT NOT NULL CHECK (actor_type IN ('human','agent','service','routine','system')),
    event_type      TEXT NOT NULL,              -- e.g., 'gate.approved', 'trust.tier_changed', 'work_item.status_changed'
    subject_table   TEXT,                       -- table whose row was affected, if any
    subject_id      UUID,                       -- primary key of affected row, if any
    before_state    JSONB,                      -- snapshot before the change (null for inserts)
    after_state     JSONB,                      -- snapshot after the change (null for deletes)
    rationale       TEXT,                       -- free text — why the action was taken
    correlation_id  TEXT NOT NULL,              -- ties related events into a single session / task chain
    signature       TEXT,                       -- optional cryptographic signature (AGT-signed or equivalent)
    signed_by       TEXT,                       -- identity that signed this record
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time      ON agentforce_governance.audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_correlation      ON agentforce_governance.audit_log (correlation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type       ON agentforce_governance.audit_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_subject          ON agentforce_governance.audit_log (subject_table, subject_id);

-- Immutability: block UPDATE and DELETE at the table level.
-- Postgres does not support CHECK on UPDATE directly, so enforce via trigger.
CREATE OR REPLACE FUNCTION agentforce_governance.audit_log_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'agentforce_governance.audit_log is append-only. UPDATE and DELETE are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_update ON agentforce_governance.audit_log;
CREATE TRIGGER trg_audit_log_no_update
  BEFORE UPDATE OR DELETE ON agentforce_governance.audit_log
  FOR EACH ROW EXECUTE FUNCTION agentforce_governance.audit_log_immutable();

COMMENT ON TABLE  agentforce_governance.audit_log IS
  'Append-only audit trail. Every gate decision, trust tier change, delegation, and state transition writes one row here.';
COMMENT ON COLUMN agentforce_governance.audit_log.correlation_id IS
  'Threads related events. One task / session / workflow = one correlation_id.';
