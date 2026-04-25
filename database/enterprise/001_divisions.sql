-- ============================================================================
-- TABLE: agentforce_governance.divisions
-- ============================================================================
-- Purpose
--   Top-level organizational unit in the enterprise extension. A Division
--   is the scope at which a Division Orchestrator (VP-equivalent agent)
--   operates. Each Division contains one or more Workspaces, each
--   typically owned by a Team Orchestrator. Divisions exist so that
--   multi-team enterprises can govern with a layered authority chain
--   (Team Orchestrator → Division Orchestrator → enterprise authority)
--   without a single Orchestrator becoming the bottleneck for every team.
--
-- Ownership (writers)
--   Enterprise admin tooling and onboarding routines write rows here.
--   No agent creates a Division. The expected lifecycle is: an enterprise
--   administrator provisions the Division, then the Division Orchestrator
--   is spawned bound to it, then Workspaces are created underneath.
--
-- Append-only rule
--   Lifecycle-mutable, not append-only. The Division row's identity
--   fields are immutable; its operational fields (status, archived_at)
--   move through the lifecycle. Each lifecycle change emits an audit_log
--   event capturing before / after state.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, slug, created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event with before_state / after_state):
--     name, description, owner_user_id, status, archived_at, updated_at,
--     metadata
--
-- Audit requirement
--   Every INSERT emits event_type = 'division.created'. Every UPDATE
--   emits event_type = 'division.updated' (or a more specific subtype
--   such as 'division.archived' when status flips to 'archived'),
--   carrying before_state and after_state JSONB snapshots. Hard DELETE
--   is not used in normal operation; soft-archive via the status field
--   instead.
--
-- Source
--   Section 11 (Enterprise Scaling) and Appendix C of the reference
--   architecture document; docs/architecture/enterprise-scaling.md
--   ("Manager Agent Pattern", "Central Policy + Federated Execution").
--
-- Status
--   v3.0 — designed, not yet field-proven. Do not deploy until the
--   single-workspace governance plane is running reliably and the
--   Division Orchestrator model has been validated.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into agentforce_governance.audit_log
-- and assumes the schema, types, and triggers from the governance
-- migrations are in place.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

-- Lifecycle status for a Division. 'active' is the working state;
-- 'paused' temporarily blocks new task assignment but retains all
-- history; 'archived' means decommissioned (workspaces underneath should
-- have been archived first).
DO $$ BEGIN
    CREATE TYPE division_status AS ENUM (
        'active',
        'paused',
        'archived'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agentforce_governance.divisions (
    -- Synthetic primary key.
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary. Required even at single-workspace scale
    -- so that enabling row-level security later is a one-line change.
    -- No FK: tenants live above this schema.
    tenant_id       UUID NOT NULL,

    -- Stable URL-safe identifier. Unique per tenant; used in routing
    -- ("/divisions/eng/...") and in correlation IDs that include the
    -- division for cross-tenant log search. Format CHECK keeps it
    -- machine-friendly: lowercase alphanumeric and hyphens, 1-64 chars.
    slug            TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),

    -- Display name for humans. May contain spaces, capitals, etc.
    name            TEXT NOT NULL,

    -- Free-text description. Optional.
    description     TEXT,

    -- The user_id of the human accountable for the Division (VP-level
    -- role). Used as the default escalation target for ESCALATION gates
    -- that reach Division scope. No FK: users live in an external
    -- identity system.
    owner_user_id   UUID,

    -- Lifecycle status. See division_status enum.
    status          division_status NOT NULL DEFAULT 'active',

    -- Soft-archive timestamp. NULL while active or paused; set when
    -- status flips to 'archived'. Retained so historical work can still
    -- be attributed.
    archived_at     TIMESTAMPTZ,

    -- Free-form structured metadata (cost centers, region, compliance
    -- scope, etc.). Schema is per-deployment.
    metadata        JSONB,

    -- Insertion timestamp. Immutable.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp. Application is responsible for setting this
    -- on every UPDATE; a future migration may add a trigger.
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A tenant cannot have two divisions with the same slug. Composite
    -- uniqueness keeps the slug short while still globally unique within
    -- the tenant.
    UNIQUE (tenant_id, slug)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) listing active divisions for a tenant,
-- (b) lookup by slug for routing, (c) finding the division that owns a
-- given user (for delegation candidate discovery).

-- Tenant + status: serves "show me active divisions for this tenant",
-- the list rendered in the enterprise admin console.
CREATE INDEX IF NOT EXISTS idx_divisions_tenant_status
    ON agentforce_governance.divisions (tenant_id, status);

-- Owner lookup: serves "what divisions does this user own?" — used when
-- evaluating whether a user has authority to approve a Division-scoped
-- gate.
CREATE INDEX IF NOT EXISTS idx_divisions_owner
    ON agentforce_governance.divisions (owner_user_id);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE agentforce_governance.divisions IS
  'Top-level org unit in the enterprise extension. One Division per Division Orchestrator. v3.0; do not deploy until governance plane is stable.';

COMMENT ON COLUMN agentforce_governance.divisions.slug IS
  'Stable URL-safe identifier; unique per tenant. Format: lowercase alphanumeric and hyphens, 1-64 chars.';

COMMENT ON COLUMN agentforce_governance.divisions.owner_user_id IS
  'Default escalation target for ESCALATION gates that reach Division scope. No FK to users.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — enterprise admin provisions a new Division. The
--    matching audit_log row is emitted by the runtime policy layer with
--    event_type = 'division.created' and after_state = the full row.
--
-- INSERT INTO agentforce_governance.divisions (
--     tenant_id, slug, name, description, owner_user_id, metadata
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     'platform-eng',
--     'Platform Engineering',
--     'Builds and operates the developer platform.',
--     '00000000-0000-0000-0000-0000000000a1'::uuid,
--     '{"cost_center":"ENG-002","region":"us-east"}'::jsonb
-- );
--
-- 2. Most common read — list all active divisions for a tenant.
--    Served by idx_divisions_tenant_status.
--
-- SELECT id, slug, name, owner_user_id, created_at
--   FROM agentforce_governance.divisions
--  WHERE tenant_id = $1
--    AND status    = 'active'
--  ORDER BY name ASC;
--
-- 3. Lifecycle history reconstruction — every state change for one
--    Division. The current row lives here; the historical states live
--    in audit_log under subject_table = 'agentforce_governance.divisions'
--    and subject_id = the division's id.
--
-- SELECT a.created_at, a.event_type, a.actor_id, a.before_state, a.after_state, a.rationale
--   FROM agentforce_governance.audit_log a
--  WHERE a.subject_table = 'agentforce_governance.divisions'
--    AND a.subject_id    = $1
--  ORDER BY a.created_at ASC;
