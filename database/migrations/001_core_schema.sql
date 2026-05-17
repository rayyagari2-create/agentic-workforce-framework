-- ============================================================================
-- 001_core_schema.sql
-- Sprint 0 core data model. Implements E0-01 of the AWF Sprint Plan v4.0.
--
-- Scope
--   The ten foundational tables the Sprint 0 demo needs end to end:
--     tenants, divisions, workspaces, agent_instances,
--     work_queue_items, approval_requests, agent_runs,
--     qa_verdicts, trust_scores, failure_records.
--
--   This is intentionally a leaner starter schema than the v3.0 tables in
--   database/governance/ and database/enterprise/. Sprint 0 ships the
--   minimum viable governance plane: one tenant, one division, one
--   workspace, the work intake / approval / run / QA / score / failure
--   loop, and the runtime_provider field that lets agent_runs,
--   trust_scores, and failure_records be segmented by which runtime
--   produced them.
--
-- Conventions
--   1. Every workspace-scoped table carries tenant_id, division_id, and
--      workspace_id, all NOT NULL. The Sprint 0 demo runs against one
--      workspace, but the schema is shaped now so a multi-workspace
--      backfill is never needed.
--   2. runtime_provider is TEXT NOT NULL on agent_runs, trust_scores, and
--      failure_records so the calibration history can be filtered by the
--      runtime that produced it. failure_records.runtime_provider defaults
--      to 'pre_execution' because most failures (risk classifier,
--      manifest validation, missing approval) are caught before any
--      runtime has been invoked.
--   3. Forward-only. There is no DOWN migration. Corrections ship as new
--      numbered files; see database/migrations/README.md.
--   4. Style: no em-dashes, no Oxford commas (docs/style-guide.md).
--
-- Idempotent. Safe to run multiple times.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The role the application connects as. Created here so 002 can REVOKE
-- UPDATE and DELETE on audit.events from it without a missing-role error.
-- Production deployments typically pre-provision this role through their
-- DBA tooling; the guard below makes a fresh local database boot cleanly.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
        CREATE ROLE app_role NOLOGIN;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- ENUM types shared across the core tables.
-- ----------------------------------------------------------------------------

-- Risk level used by the risk classifier (E0-05) and the gate engine.
DO $$ BEGIN
    CREATE TYPE risk_level AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lifecycle of a single work item.
DO $$ BEGIN
    CREATE TYPE work_queue_status AS ENUM (
        'created',
        'pending_approval',
        'approved',
        'in_progress',
        'qa_in_progress',
        'complete',
        'failed',
        'rejected'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lifecycle of an approval request.
DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM (
        'pending',
        'approved',
        'rejected',
        'expired'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lifecycle of an agent run.
DO $$ BEGIN
    CREATE TYPE agent_run_status AS ENUM (
        'pending',
        'running',
        'succeeded',
        'failed',
        'cancelled'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- QA verdict outcome.
DO $$ BEGIN
    CREATE TYPE qa_verdict_outcome AS ENUM ('PASS','FAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Trust tier produced by the D1-D4 reference scorer.
DO $$ BEGIN
    CREATE TYPE trust_tier AS ENUM (
        'HIGH',
        'STANDARD',
        'RESTRICTED',
        'PROBATION',
        'PROVISIONAL'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 1. tenants
-- ============================================================================
-- Top-level org boundary. Required even at single-tenant scale so RLS can
-- be turned on later without a backfill.
CREATE TABLE IF NOT EXISTS public.tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. divisions
-- ============================================================================
-- One layer under tenant. Sprint 0 uses one division per tenant; the row
-- exists so the Division Orchestrator pattern can be added later without
-- migrating every workspace-scoped row.
CREATE TABLE IF NOT EXISTS public.divisions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    slug        TEXT NOT NULL
                    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, slug)
);

-- ============================================================================
-- 3. workspaces
-- ============================================================================
-- The working scope for one team. Bounds file scope, locks, and
-- bulletin visibility. hitl_default_threshold is the risk level at which
-- HITL gates fire by default; the Sprint 0 demo runs with HIGH.
CREATE TABLE IF NOT EXISTS public.workspaces (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id             UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    slug                    TEXT NOT NULL
                                CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
    name                    TEXT NOT NULL,
    hitl_default_threshold  risk_level NOT NULL DEFAULT 'HIGH',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (division_id, slug)
);

-- ============================================================================
-- 4. agent_instances
-- ============================================================================
-- Persistent identity for an agent within a workspace. Trust history and
-- failure memory follow this row.
CREATE TABLE IF NOT EXISTS public.agent_instances (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id   UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    role          TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    capabilities  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. work_queue_items
-- ============================================================================
-- Queue of work for agents to pull from. risk_level is set by the risk
-- classifier (E0-05) and is immutable once written so the gate decision
-- made at intake cannot be rewritten mid flight.
CREATE TABLE IF NOT EXISTS public.work_queue_items (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id                 UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id                UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    task_id                     TEXT NOT NULL,
    title                       TEXT NOT NULL,
    description                 TEXT,
    domain                      TEXT NOT NULL,
    risk_level                  risk_level NOT NULL,
    files_in_scope              TEXT[] NOT NULL DEFAULT '{}',
    status                      work_queue_status NOT NULL DEFAULT 'created',
    priority                    INTEGER NOT NULL DEFAULT 100
                                    CHECK (priority BETWEEN 1 AND 1000),
    assigned_agent_instance_id  UUID REFERENCES public.agent_instances(id) ON DELETE SET NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, task_id)
);

-- ============================================================================
-- 6. approval_requests
-- ============================================================================
-- One row per HITL gate the work item triggers. Sprint 0 has a single
-- approval gate at intake (E0-07); later sprints add per-phase gates.
CREATE TABLE IF NOT EXISTS public.approval_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id         UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    work_queue_item_id  UUID NOT NULL REFERENCES public.work_queue_items(id) ON DELETE CASCADE,
    risk_level          risk_level NOT NULL,
    status              approval_status NOT NULL DEFAULT 'pending',
    requested_by        TEXT NOT NULL,
    approver_id         TEXT,
    rationale           TEXT,
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at          TIMESTAMPTZ
);

-- ============================================================================
-- 7. agent_runs
-- ============================================================================
-- One row per agent execution against a work item. runtime_provider is the
-- identifier of the runtime that executed the run (e.g., 'simulated',
-- 'cli_claude', 'cli_codex', 'api_anthropic'). Required so that downstream
-- trust and failure analytics can be segmented by runtime.
CREATE TABLE IF NOT EXISTS public.agent_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id         UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    work_queue_item_id  UUID NOT NULL REFERENCES public.work_queue_items(id) ON DELETE CASCADE,
    agent_instance_id   UUID NOT NULL REFERENCES public.agent_instances(id) ON DELETE RESTRICT,
    runtime_provider    TEXT NOT NULL,
    status              agent_run_status NOT NULL DEFAULT 'pending',
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    output              JSONB,
    correlation_id      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. qa_verdicts
-- ============================================================================
-- One row per QA pass over an agent run. The QA Agent emits PASS or FAIL
-- plus a JSON evidence payload; the runtime translates that into the
-- corresponding work item status transition.
CREATE TABLE IF NOT EXISTS public.qa_verdicts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id         UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    work_queue_item_id  UUID NOT NULL REFERENCES public.work_queue_items(id) ON DELETE CASCADE,
    agent_run_id        UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
    outcome             qa_verdict_outcome NOT NULL,
    evidence            JSONB NOT NULL DEFAULT '{}'::jsonb,
    rationale           TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 9. trust_scores
-- ============================================================================
-- Per-session D1-D4 trust record. Each dimension is 0-25; total_score is
-- the generated sum used by the autonomy gate. runtime_provider is
-- required so calibration data is never mixed across runtimes.
CREATE TABLE IF NOT EXISTS public.trust_scores (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id        UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id       UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    agent_instance_id  UUID NOT NULL REFERENCES public.agent_instances(id) ON DELETE RESTRICT,
    agent_run_id       UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
    runtime_provider   TEXT NOT NULL,
    d1_correctness     INTEGER NOT NULL CHECK (d1_correctness BETWEEN 0 AND 25),
    d2_observability   INTEGER NOT NULL CHECK (d2_observability BETWEEN 0 AND 25),
    d3_policy          INTEGER NOT NULL CHECK (d3_policy BETWEEN 0 AND 25),
    d4_recurrence      INTEGER NOT NULL CHECK (d4_recurrence BETWEEN 0 AND 25),
    total_score        INTEGER GENERATED ALWAYS AS
                           (d1_correctness + d2_observability + d3_policy + d4_recurrence) STORED,
    tier               trust_tier NOT NULL,
    rationale          TEXT,
    correlation_id     TEXT,
    scored_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 10. failure_records
-- ============================================================================
-- Structured failure store. runtime_provider defaults to 'pre_execution'
-- because most Sprint 0 failures (risk classifier rejection, manifest
-- validation, missing approval) are caught before any runtime is invoked.
-- The runtime layer overrides this value for failures that surface during
-- execution.
CREATE TABLE IF NOT EXISTS public.failure_records (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_id          TEXT NOT NULL UNIQUE
                            CHECK (failure_id ~ '^FAIL-\d{4}-\d{2}-\d{2}-\d{3}$'),
    tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
    division_id         UUID NOT NULL REFERENCES public.divisions(id) ON DELETE RESTRICT,
    workspace_id        UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    work_queue_item_id  UUID REFERENCES public.work_queue_items(id) ON DELETE SET NULL,
    agent_run_id        UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
    runtime_provider    TEXT NOT NULL DEFAULT 'pre_execution',
    domain              TEXT NOT NULL,
    failure_class       TEXT NOT NULL,
    severity            TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
    symptom             TEXT NOT NULL,
    root_cause          TEXT,
    files               TEXT[] NOT NULL DEFAULT '{}',
    prevention          JSONB,
    correlation_id      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- REQUIRED INDEXES
-- ============================================================================
-- Two indexes carry the Sprint 0 hot read paths. Additional indexes are
-- deferred until evidence justifies them.

-- (1) Work pull. The Orchestrator dequeues the highest-priority unfinished
-- item in a workspace. (workspace_id, status, priority ASC, created_at ASC)
-- serves this in a single range scan.
CREATE INDEX IF NOT EXISTS idx_work_queue_items_pull
    ON public.work_queue_items (workspace_id, status, priority ASC, created_at ASC);

-- (2) Autonomy gate lookup. The runtime reads the latest trust score for
-- one agent instance on every spawn. (agent_instance_id, scored_at DESC)
-- serves this with a single index seek.
CREATE INDEX IF NOT EXISTS idx_trust_scores_agent_time
    ON public.trust_scores (agent_instance_id, scored_at DESC);

-- ============================================================================
-- SEED DATA
-- ============================================================================
-- Demo tenant, division and workspace used by the Sprint 0 CLI demo
-- (E0-12). UUIDs are stable so demo fixtures can reference them.
INSERT INTO public.tenants (id, slug, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'demo', 'Demo Tenant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.divisions (id, tenant_id, slug, name)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    '00000000-0000-0000-0000-000000000001',
    'platform',
    'Platform Division'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, tenant_id, division_id, slug, name, hitl_default_threshold)
VALUES (
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'demo-workspace',
    'Demo Workspace',
    'HIGH'
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
