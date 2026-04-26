-- =================================================================
-- 999_enable_rls.example.sql
-- Row Level Security — example policies for awf_governance schema
--
-- Status: Reference Pattern
--
-- These policies are NOT enabled by default. They are an adoption
-- step for multi-tenant or enterprise deployments where workspace
-- or tenant isolation must be enforced at the database layer.
--
-- Prerequisites:
--   1. Run all governance migrations (001 through 005) first.
--   2. Set app.tenant_id at the connection level before queries:
--      SET app.tenant_id = '<your-tenant-uuid>';
--   3. Review RLS behavior with your Postgres DBA before enabling
--      in production. RLS bypassed by superuser roles by default.
--
-- Enable per table. Do not enable all at once without testing.
-- =================================================================

-- ── audit_log ────────────────────────────────────────────────────
ALTER TABLE awf_governance.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_audit_log
  ON awf_governance.audit_log
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── agent_events ─────────────────────────────────────────────────
ALTER TABLE awf_governance.agent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_agent_events
  ON awf_governance.agent_events
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── trust_scores ─────────────────────────────────────────────────
ALTER TABLE awf_governance.trust_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_trust_scores
  ON awf_governance.trust_scores
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── failure_records ──────────────────────────────────────────────
ALTER TABLE awf_governance.failure_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_failure_records
  ON awf_governance.failure_records
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── routine_runs ─────────────────────────────────────────────────
ALTER TABLE awf_governance.routine_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_routine_runs
  ON awf_governance.routine_runs
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- ── Notes ────────────────────────────────────────────────────────
-- To verify RLS is active on a table:
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN (
--     'audit_log','agent_events','trust_scores',
--     'failure_records','routine_runs'
--   );
--
-- To test isolation:
--   SET app.tenant_id = '<uuid-a>';
--   SELECT COUNT(*) FROM awf_governance.audit_log;
--   -- Should return only rows where tenant_id = uuid-a
--
-- For enterprise extension tables (divisions, workspaces, etc.),
-- apply equivalent policies in database/enterprise/ after
-- validating governance table isolation first.
