-- ============================================================================
-- 010_row_level_security.sql
-- E2-01: Workspace isolation through Postgres Row-Level Security.
--
-- Scope
--   Enables RLS on the seven workspace-scoped tables and installs a
--   single workspace_isolation policy on each. The policy reads
--   awf.workspace_id from the session via current_setting() and filters
--   every row whose workspace_id does not match.
--
--   The application sets the context at the start of each transaction:
--     SET LOCAL awf.workspace_id = '<uuid>';
--     SET LOCAL awf.tenant_id    = '<uuid>';
--   See services/governance/src/workspace-context.js for the wrapper.
--
-- Write authority
--   Enabled by this migration. Policies are evaluated automatically by
--   Postgres on every SELECT, INSERT, UPDATE, DELETE against the seven
--   tables below. No service "writes" to RLS at runtime.
--
-- Owner / superuser caveat
--   Postgres exempts the table owner and superusers from RLS unless
--   FORCE ROW LEVEL SECURITY is set (owner) or BYPASSRLS is removed
--   (superuser). FORCE is added here so the policy also applies to the
--   role that owns the tables; production deployments are expected to
--   connect through a non-superuser role (app_role) which is created in
--   001_core_schema.sql. GRANTs below give app_role the privileges it
--   needs so RLS, not GRANT-level denial, becomes the isolation surface.
--
-- Idempotent. Safe to run multiple times.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Enable RLS on all workspace-scoped tables.
-- ----------------------------------------------------------------------------
ALTER TABLE public.work_queue_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_instances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_scores       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failure_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_verdicts        ENABLE ROW LEVEL SECURITY;

-- FORCE applies the policy to the table owner as well. Without FORCE,
-- the owner role bypasses RLS unconditionally and the isolation test
-- below could not observe a difference between workspaces.
ALTER TABLE public.work_queue_items   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_instances    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.trust_scores       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.failure_records    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.qa_verdicts        FORCE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Workspace isolation policy.
-- Application sets: SET LOCAL awf.workspace_id = '<uuid>'
-- current_setting(..., true) returns NULL when the GUC is unset, which
-- casts to NULL::UUID and matches no rows. A connection with no context
-- therefore sees nothing, which is the safe default.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS workspace_isolation ON public.work_queue_items;
CREATE POLICY workspace_isolation ON public.work_queue_items
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

DROP POLICY IF EXISTS workspace_isolation ON public.agent_instances;
CREATE POLICY workspace_isolation ON public.agent_instances
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

DROP POLICY IF EXISTS workspace_isolation ON public.agent_runs;
CREATE POLICY workspace_isolation ON public.agent_runs
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

DROP POLICY IF EXISTS workspace_isolation ON public.trust_scores;
CREATE POLICY workspace_isolation ON public.trust_scores
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

DROP POLICY IF EXISTS workspace_isolation ON public.failure_records;
CREATE POLICY workspace_isolation ON public.failure_records
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

DROP POLICY IF EXISTS workspace_isolation ON public.approval_requests;
CREATE POLICY workspace_isolation ON public.approval_requests
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

DROP POLICY IF EXISTS workspace_isolation ON public.qa_verdicts;
CREATE POLICY workspace_isolation ON public.qa_verdicts
    USING      (workspace_id = current_setting('awf.workspace_id', true)::UUID)
    WITH CHECK (workspace_id = current_setting('awf.workspace_id', true)::UUID);

-- ----------------------------------------------------------------------------
-- Grants. RLS is layered on top of GRANTs; if a role has no table-level
-- privilege, it sees "permission denied" before RLS is consulted. Grant
-- the seven workspace-scoped tables to app_role so the application can
-- transact under RLS instead of being denied at the GRANT layer.
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_queue_items   TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_instances    TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs         TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trust_scores       TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.failure_records    TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_requests  TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qa_verdicts        TO app_role;

GRANT USAGE ON SCHEMA public TO app_role;

COMMIT;
