-- ============================================================================
-- TABLE: awf_governance.agent_instances
-- ============================================================================
-- Purpose
--   Persistent agent identity. One row per long-lived agent, regardless
--   of which workspace it currently serves. The persistent identity is
--   what allows a trust score to follow the agent across teams: a QA
--   Agent that earned HIGH in Team A does not start at PROVISIONAL when
--   reassigned to Team B. Its trust history, failure memory, and
--   autonomy gate travel with the instance row, not with the workspace.
--
-- Ownership (writers)
--   Enterprise admin tooling and the Boardroom Agent (when promoting a
--   PROVISIONAL agent through onboarding) write rows here. The runtime
--   policy layer updates current_tier / current_confidence after every
--   trust score is recorded; that is the only programmatic mutator on
--   this table.
--
-- Append-only rule
--   Lifecycle-mutable, not append-only. Identity fields are immutable;
--   operational state (current_tier, current_confidence, status,
--   archived_at, operator_assignment) moves through the lifecycle and
--   emits audit events. Removing an agent from service flips status to
--   'archived' rather than DELETE.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, did, role, created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event with before_state / after_state):
--     display_name, description, operator_user_id, current_tier,
--     current_confidence, status, archived_at, capabilities,
--     metadata, updated_at
--
-- Audit requirement
--   Every INSERT emits event_type = 'agent_instance.registered'. Every
--   UPDATE emits a more specific subtype:
--     - 'agent_instance.tier_changed' when current_tier moves
--     - 'agent_instance.operator_changed' when operator_user_id moves
--     - 'agent_instance.archived' when status flips to 'archived'
--     - 'agent_instance.updated' otherwise
--   Each carries before_state and after_state JSONB snapshots.
--
-- Source
--   Section 11 (Enterprise Scaling) — "Persistent Agent Identity" — and
--   Appendix C of the reference architecture document. AGT (the
--   cryptographic identity layer) is the source of the did field in
--   deployments that run AGT in active mode.
--
-- Status
--   v3.0 — designed, not yet field-proven.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into awf_governance.audit_log
-- and consumes the trust_tier and confidence_band types declared in
-- the governance migrations. It is referenced by workspace_agents
-- (003) and by agent_events / trust_scores / failure_records (which
-- carry agent_instance_id without a hard FK so single-workspace
-- governance can run without this table present).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS awf_governance;

-- Lifecycle status for an agent instance.
DO $$ BEGIN
    CREATE TYPE agent_instance_status AS ENUM (
        'provisioning',  -- created but not yet ready to receive work
        'active',        -- ready to be assigned to workspaces
        'paused',        -- temporarily not picking up new work anywhere
        'archived'       -- retired; identity preserved for audit, no new assignments
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS awf_governance.agent_instances (
    -- Synthetic primary key. Used as agent_instance_id in agent_events,
    -- trust_scores, failure_records, work_queue_items, gate_records.
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary.
    tenant_id           UUID NOT NULL,

    -- Cryptographic identity (DID — Decentralized Identifier). Set when
    -- AGT is in active mode; NULL otherwise. UNIQUE: at most one
    -- agent_instances row per DID. Immutable once set: changing the DID
    -- would amount to identity theft from the perspective of the trust
    -- ledger.
    did                 TEXT UNIQUE,

    -- Canonical role (orchestrator, qa-agent, fix-agent, frontend-agent,
    -- backend-agent, security-check, code-review, boardroom,
    -- chief-of-staff, deep-research, etc.). Free string by convention,
    -- matching agent_role used in agent_events and trust_scores.
    -- Immutable: changing the role would invalidate the trust history,
    -- since D1-D4 calibration is role-specific.
    role                TEXT NOT NULL,

    -- Display name for humans. Mutable: a deployment can rename an
    -- agent ("QA-Alpha" → "QA-East") without invalidating its identity.
    display_name        TEXT NOT NULL,

    -- Free-text description.
    description         TEXT,

    -- The user_id of the human operator who supervises this agent.
    -- For pooled agents this is typically the Division Orchestrator's
    -- owner; for team-bound agents it is the Team Orchestrator's owner.
    -- No FK: users live in an external identity system.
    operator_user_id    UUID,

    -- The current trust tier. Maintained by the runtime policy layer
    -- after each trust_scores write. Sourced from the trust_tier enum
    -- declared in 003_trust_scores.sql. NULL in the 'provisioning'
    -- state before the first score.
    current_tier        trust_tier,

    -- The current confidence band. Maintained alongside current_tier.
    current_confidence  confidence_band,

    -- Lifecycle status. See agent_instance_status.
    status              agent_instance_status NOT NULL DEFAULT 'provisioning',

    -- Soft-archive timestamp.
    archived_at         TIMESTAMPTZ,

    -- Declared capabilities — the file scopes, tool surfaces, and
    -- domain tags this agent is authorized to operate in. JSONB; schema
    -- is per-deployment but typically includes:
    --   {"file_scope": [...], "tools": [...], "domains": [...]}
    capabilities        JSONB,

    -- Free-form structured metadata.
    metadata            JSONB,

    -- Insertion timestamp.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp.
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) per-role discovery within a tenant
-- ("which QA Agents are active?"), (b) per-operator dashboards
-- ("which agents am I responsible for?"), (c) per-tier reporting
-- ("how many of our agents are at HIGH?"), (d) DID lookup at the
-- runtime policy layer.

-- Tenant + role + status: serves the most common discovery —
-- "which QA Agents are currently active in this tenant?".
CREATE INDEX IF NOT EXISTS idx_agent_instances_tenant_role_status
    ON awf_governance.agent_instances (tenant_id, role, status);

-- Operator lookup: serves the per-operator dashboard.
CREATE INDEX IF NOT EXISTS idx_agent_instances_operator
    ON awf_governance.agent_instances (operator_user_id);

-- Tenant + tier: serves the trust distribution report.
CREATE INDEX IF NOT EXISTS idx_agent_instances_tenant_tier
    ON awf_governance.agent_instances (tenant_id, current_tier);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE awf_governance.agent_instances IS
  'Persistent agent identity. Trust history, failure memory, and autonomy gate travel with this row across workspaces.';

COMMENT ON COLUMN awf_governance.agent_instances.did IS
  'Cryptographic identity from AGT (active mode). Immutable; changing it amounts to identity theft from the trust ledger.';

COMMENT ON COLUMN awf_governance.agent_instances.role IS
  'Canonical role. Immutable; D1-D4 calibration is role-specific so changing role would invalidate the trust history.';

COMMENT ON COLUMN awf_governance.agent_instances.current_tier IS
  'Maintained by the runtime policy layer after each trust_scores write. NULL in the provisioning state before the first score.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — onboarding admin registers a new QA Agent. The
--    instance starts in 'provisioning' until it has been bound to a
--    workspace via workspace_agents and the first scoring cycle
--    completes; status flips to 'active' as part of that flow.
--
-- INSERT INTO awf_governance.agent_instances (
--     tenant_id, did, role, display_name, description,
--     operator_user_id, capabilities, metadata
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     'did:agt:qa-agent-east-002',
--     'qa-agent',
--     'QA-East',
--     'Pooled QA Agent serving the Auth Platform and Billing workspaces.',
--     '00000000-0000-0000-0000-0000000000a3'::uuid,
--     '{"file_scope":["**/*"],"tools":["read","run-tests"],"domains":["auth","billing"]}'::jsonb,
--     '{"home_region":"us-east"}'::jsonb
-- );
--
-- 2. Most common read — list active agents of a given role for a
--    tenant. Served by idx_agent_instances_tenant_role_status.
--
-- SELECT id, display_name, current_tier, current_confidence
--   FROM awf_governance.agent_instances
--  WHERE tenant_id = $1
--    AND role      = $2
--    AND status    = 'active'
--  ORDER BY display_name ASC;
--
-- 3. Trust history lookup for one instance — its current state plus
--    the last 20 scoring events, joined back to trust_scores.
--
-- SELECT ai.id, ai.display_name, ai.current_tier, ai.current_confidence,
--        ts.scored_at, ts.total_score, ts.tier   AS scored_tier,
--        ts.confidence AS scored_confidence,
--        ts.tier_override_reason
--   FROM awf_governance.agent_instances ai
--   LEFT JOIN awf_governance.trust_scores ts
--          ON ts.agent_instance_id = ai.id
--  WHERE ai.id = $1
--  ORDER BY ts.scored_at DESC NULLS LAST
--  LIMIT 20;
