-- ============================================================================
-- TABLE: agentforce_governance.workspace_agents
-- ============================================================================
-- Purpose
--   Junction table that records which agent instances are active in which
--   workspaces, with their per-workspace operational status. Agents pool
--   across teams — the same QA Agent instance may serve two workspaces —
--   so membership is a many-to-many relationship rather than a column on
--   either side. The same instance carries its trust history across all
--   workspaces it joins (see agent_instances), but its activity status
--   (active / paused / removed) is per-workspace.
--
-- Ownership (writers)
--   Team Orchestrators and Division Orchestrators write rows here when
--   assigning agents to a workspace. Enterprise admin tooling writes
--   when re-allocating shared agents across teams. No executing agent
--   adds itself to a workspace.
--
-- Append-only rule
--   Lifecycle-mutable, not append-only. The membership row's identity
--   fields are immutable; its status field moves through the lifecycle
--   and emits audit events. Removing an agent from a workspace flips
--   status to 'removed' rather than DELETE'ing the row, so the
--   historical membership remains queryable.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, workspace_id, agent_instance_id, role_at_assignment,
--     created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event):
--     status, removed_at, capability_overrides, updated_at
--
-- Audit requirement
--   Every INSERT emits event_type = 'workspace_agent.added'. Every
--   UPDATE emits event_type = 'workspace_agent.updated' (or
--   'workspace_agent.removed' when status flips to 'removed'), carrying
--   before_state and after_state.
--
-- Source
--   Section 11 (Enterprise Scaling) — "Role-Agent Alignment" and
--   "Persistent Agent Identity" — of the reference architecture document.
--
-- Status
--   v3.0 — designed, not yet field-proven.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into agentforce_governance.audit_log
-- and references workspaces(id) and agent_instances(id). Run
-- 001_divisions.sql, 002_workspaces.sql, and 004_agent_instances.sql
-- before this file.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

-- Per-workspace membership status. 'active' is the working state;
-- 'paused' means the agent is not picking up new work in this
-- workspace but its history remains; 'removed' is the soft-delete.
DO $$ BEGIN
    CREATE TYPE workspace_agent_status AS ENUM (
        'active',
        'paused',
        'removed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agentforce_governance.workspace_agents (
    -- Synthetic primary key.
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary.
    tenant_id           UUID NOT NULL,

    -- The workspace the agent is a member of. ON DELETE CASCADE — if a
    -- workspace is hard-deleted (rare, archive-first is preferred),
    -- membership rows go with it.
    workspace_id        UUID NOT NULL
                          REFERENCES agentforce_governance.workspaces(id)
                          ON DELETE CASCADE,

    -- The agent instance that is a member. ON DELETE RESTRICT — an
    -- agent_instances row that is currently a member of any workspace
    -- cannot be hard-deleted; archive it (set its status to 'archived'
    -- in agent_instances) first. Forward reference to a table created
    -- in 004_agent_instances.sql.
    agent_instance_id   UUID NOT NULL
                          REFERENCES agentforce_governance.agent_instances(id)
                          ON DELETE RESTRICT,

    -- The role the agent was assigned at time of join. Frozen at INSERT
    -- so that historical scoring can match the role-at-time-of-work,
    -- even if the role on agent_instances changes later.
    role_at_assignment  TEXT NOT NULL,

    -- Lifecycle status. See workspace_agent_status.
    status              workspace_agent_status NOT NULL DEFAULT 'active',

    -- Soft-removal timestamp. NULL while active or paused; set when
    -- status flips to 'removed'.
    removed_at          TIMESTAMPTZ,

    -- Optional per-membership capability overrides (e.g., "in this
    -- workspace, this QA Agent is restricted to read-only on /api/").
    -- JSONB; schema is per-deployment.
    capability_overrides JSONB,

    -- Insertion timestamp. Immutable.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp.
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- An agent instance can have at most one membership row per
    -- workspace at a time. Re-adding after removal must be done by
    -- flipping status back to 'active', not by inserting a duplicate.
    UNIQUE (workspace_id, agent_instance_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) listing the active roster of a workspace,
-- (b) finding every workspace one agent is a member of, (c) per-role
-- lookup within a workspace ("who is the QA Agent here?").

-- Workspace + status: serves "show me the active roster of this
-- workspace" (the Team Orchestrator's team page).
CREATE INDEX IF NOT EXISTS idx_workspace_agents_workspace_status
    ON agentforce_governance.workspace_agents (workspace_id, status);

-- Instance + status: serves "what workspaces does this agent serve?" —
-- used when re-allocating shared agents and when computing the agent's
-- visible footprint.
CREATE INDEX IF NOT EXISTS idx_workspace_agents_instance_status
    ON agentforce_governance.workspace_agents (agent_instance_id, status);

-- Workspace + role: serves "who is the QA Agent in this workspace?" —
-- used by the Team Orchestrator when routing work by role.
CREATE INDEX IF NOT EXISTS idx_workspace_agents_workspace_role
    ON agentforce_governance.workspace_agents (workspace_id, role_at_assignment);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE agentforce_governance.workspace_agents IS
  'Junction table for agent membership in workspaces. Many-to-many. Trust history travels with agent_instances; status is per-membership.';

COMMENT ON COLUMN agentforce_governance.workspace_agents.role_at_assignment IS
  'The role the agent was assigned at INSERT time. Frozen so historical scoring matches role-at-time-of-work, even if agent_instances.role changes later.';

COMMENT ON COLUMN agentforce_governance.workspace_agents.capability_overrides IS
  'Optional per-membership restrictions or expansions. JSONB; schema is per-deployment.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — Team Orchestrator adds the shared QA Agent to a
--    workspace. The matching audit_log row carries event_type =
--    'workspace_agent.added' and after_state = the full row.
--
-- INSERT INTO agentforce_governance.workspace_agents (
--     tenant_id, workspace_id, agent_instance_id,
--     role_at_assignment, capability_overrides
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-0000000000w1'::uuid,
--     '00000000-0000-0000-0000-0000000000aa'::uuid,
--     'qa-agent',
--     '{"file_scope_extra_read":["docs/**"]}'::jsonb
-- );
--
-- 2. Most common read — active roster of a workspace, joined to the
--    agent_instances table for display name and current trust tier.
--    Served by idx_workspace_agents_workspace_status.
--
-- SELECT wa.role_at_assignment, ai.id, ai.display_name, ai.current_tier,
--        wa.created_at AS joined_at
--   FROM agentforce_governance.workspace_agents wa
--   JOIN agentforce_governance.agent_instances ai
--        ON ai.id = wa.agent_instance_id
--  WHERE wa.workspace_id = $1
--    AND wa.status       = 'active'
--  ORDER BY wa.role_at_assignment, ai.display_name;
--
-- 3. Trust history lookup — every workspace this agent has ever been
--    a member of, plus their join/remove timestamps. Used when
--    explaining a tier change ("the agent earned HIGH while in
--    workspace A; was paused in workspace B during the regression").
--
-- SELECT w.slug AS workspace_slug, wa.role_at_assignment,
--        wa.status, wa.created_at AS joined_at, wa.removed_at
--   FROM agentforce_governance.workspace_agents wa
--   JOIN agentforce_governance.workspaces w
--        ON w.id = wa.workspace_id
--  WHERE wa.agent_instance_id = $1
--  ORDER BY wa.created_at ASC;
