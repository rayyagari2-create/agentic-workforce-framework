-- ============================================================================
-- TABLE: agentforce_governance.workspaces
-- ============================================================================
-- Purpose
--   A Workspace is the working scope of one team — typically owned by a
--   Team Orchestrator, populated with executing agents (Frontend Agent,
--   Backend Agent, QA Agent, etc.), and serving as the natural boundary
--   for file scope, lock management, and bulletin visibility. Every
--   work_queue_items row, every agent_events row, and every gate_records
--   row is workspace-scoped. The workspace is what isolates one team's
--   in-flight work from another's.
--
-- Ownership (writers)
--   Enterprise admin tooling and onboarding routines write rows here.
--   No agent creates a Workspace. The expected lifecycle is: a Division
--   admin (or a tenant admin in single-division deployments) provisions
--   the Workspace, then the Team Orchestrator is bound to it via
--   workspace_agents, then executing agents are assigned.
--
-- Append-only rule
--   Lifecycle-mutable, not append-only. Identity fields are immutable;
--   operational fields move through the lifecycle and emit audit events.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, division_id, slug, created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event with before_state / after_state):
--     name, description, owner_user_id, status, archived_at,
--     hitl_default_threshold, max_concurrent_lanes, metadata, updated_at
--
-- Audit requirement
--   Every INSERT emits event_type = 'workspace.created'. Every UPDATE
--   emits event_type = 'workspace.updated' (or 'workspace.archived' for
--   the status flip), carrying before_state and after_state JSONB
--   snapshots. Membership changes go through workspace_agents and emit
--   their own audit events.
--
-- Source
--   Section 11 (Enterprise Scaling) and Appendix C of the reference
--   architecture document; docs/architecture/enterprise-scaling.md
--   ("Multi-Workspace Bulletin and Lock Management").
--
-- Status
--   v3.0 — designed, not yet field-proven. Do not deploy until the
--   single-workspace governance plane is running reliably.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into agentforce_governance.audit_log
-- and assumes the schema, types, and triggers from the governance
-- migrations are in place. It also references divisions(id) — run
-- 001_divisions.sql first.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

-- Lifecycle status for a Workspace. Same shape as division_status; kept
-- as a separate type so future additions on either side don't conflate.
DO $$ BEGIN
    CREATE TYPE workspace_status AS ENUM (
        'active',
        'paused',
        'archived'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HITL default — the risk threshold at which HITL gates fire by default
-- in this workspace. Workspaces may tighten or loosen the default within
-- the bounds set by central policy.
DO $$ BEGIN
    CREATE TYPE risk_level AS ENUM (
        'LOW',
        'MEDIUM',
        'HIGH',
        'CRITICAL'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agentforce_governance.workspaces (
    -- Synthetic primary key.
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary.
    tenant_id       UUID NOT NULL,

    -- The Division this Workspace belongs to. ON DELETE RESTRICT —
    -- a Division with workspaces cannot be hard-deleted; archive the
    -- workspaces first, then archive the Division.
    division_id     UUID NOT NULL
                       REFERENCES agentforce_governance.divisions(id)
                       ON DELETE RESTRICT,

    -- Stable URL-safe identifier. Unique per division (a tenant can
    -- have two workspaces named 'platform' as long as they live in
    -- different divisions).
    slug            TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),

    -- Display name for humans.
    name            TEXT NOT NULL,

    -- Free-text description.
    description     TEXT,

    -- The user_id of the Team Lead. Default approver for HITL gates that
    -- fire within this workspace. No FK to users.
    owner_user_id   UUID,

    -- Lifecycle status.
    status          workspace_status NOT NULL DEFAULT 'active',

    -- Soft-archive timestamp. NULL while active or paused; set when
    -- status flips to 'archived'.
    archived_at     TIMESTAMPTZ,

    -- The risk level at which HITL gates fire by default in this
    -- workspace. Central policy sets the floor (no workspace may set
    -- this higher than CRITICAL or skip the floor); workspaces tune
    -- within the allowed range.
    hitl_default_threshold risk_level NOT NULL DEFAULT 'HIGH',

    -- Maximum number of concurrent parallel lanes (LANE-A, LANE-B, ...)
    -- this workspace permits. Bounded so contention on file locks stays
    -- manageable.
    max_concurrent_lanes   INTEGER NOT NULL DEFAULT 3
                           CHECK (max_concurrent_lanes BETWEEN 1 AND 16),

    -- Free-form structured metadata. Schema is per-deployment.
    metadata        JSONB,

    -- Insertion timestamp. Immutable.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp.
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A division cannot have two workspaces with the same slug.
    UNIQUE (division_id, slug)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) listing active workspaces for a tenant,
-- (b) listing workspaces under one Division, (c) lookup by slug for
-- routing, (d) finding workspaces owned by a user (for delegation).

-- Tenant + status: serves the enterprise admin list of active workspaces.
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant_status
    ON agentforce_governance.workspaces (tenant_id, status);

-- Division + status: serves the Division Orchestrator's view of its own
-- workspaces.
CREATE INDEX IF NOT EXISTS idx_workspaces_division_status
    ON agentforce_governance.workspaces (division_id, status);

-- Owner lookup: serves "what workspaces does this user own?" — used
-- when evaluating HITL approval authority.
CREATE INDEX IF NOT EXISTS idx_workspaces_owner
    ON agentforce_governance.workspaces (owner_user_id);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE agentforce_governance.workspaces IS
  'A working scope owned by a Team Orchestrator. Bounds file scope, locks, and bulletin visibility. v3.0; do not deploy until governance plane is stable.';

COMMENT ON COLUMN agentforce_governance.workspaces.hitl_default_threshold IS
  'Risk level at which HITL gates fire by default in this workspace. Central policy sets the floor; workspaces tune within bounds.';

COMMENT ON COLUMN agentforce_governance.workspaces.max_concurrent_lanes IS
  'Maximum concurrent parallel lanes (LANE-A/B/...). Bounded to keep file-lock contention manageable.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — Division admin provisions a new Workspace under
--    the 'platform-eng' division.
--
-- INSERT INTO agentforce_governance.workspaces (
--     tenant_id, division_id, slug, name, description,
--     owner_user_id, hitl_default_threshold, max_concurrent_lanes, metadata
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-0000000000d1'::uuid,
--     'auth-platform',
--     'Auth Platform',
--     'Owns identity, sessions, and access control surfaces.',
--     '00000000-0000-0000-0000-0000000000a2'::uuid,
--     'HIGH',
--     3,
--     '{"compliance":"soc2","critical_paths":["src/api/auth/**"]}'::jsonb
-- );
--
-- 2. Most common read — list all active workspaces in a Division.
--    Served by idx_workspaces_division_status.
--
-- SELECT id, slug, name, owner_user_id, hitl_default_threshold
--   FROM agentforce_governance.workspaces
--  WHERE division_id = $1
--    AND status      = 'active'
--  ORDER BY name ASC;
--
-- 3. Lifecycle history reconstruction — every audit event for one
--    Workspace, in order. Pair with the current row in this table to
--    show "current state plus history" in the admin UI.
--
-- SELECT a.created_at, a.event_type, a.actor_id, a.before_state, a.after_state, a.rationale
--   FROM agentforce_governance.audit_log a
--  WHERE a.subject_table = 'agentforce_governance.workspaces'
--    AND a.subject_id    = $1
--  ORDER BY a.created_at ASC;
