-- agentforce_governance.agent_events
-- Agent activity event stream. Replaces file-based agent-bulletin in Postgres-backed deployments.
-- Append-only by convention. Row-level locking handles concurrent writes natively.
--
-- Source: Section 5 Layer 8 of the Agentic Workforce Architecture
-- Status: v1.0 — ships at public launch.

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

-- Lifecycle phases for an agent-in-task. Kept separate from work_queue_items.status
-- because one work item may have many agent_events across its lifetime.
CREATE TYPE agent_event_phase AS ENUM (
    'WORKING',        -- agent has acquired context and begun executing
    'BLOCKED',        -- waiting on a human decision, a dependency, or external input
    'HANDOFF',        -- transferring work to another agent
    'DONE',           -- task portion complete; QA may still be pending
    'FAIL',           -- aborted due to error or policy violation
    'NOTE'            -- informational entry, no state transition
);

CREATE TABLE IF NOT EXISTS agentforce_governance.agent_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    workspace_id        UUID,
    agent_instance_id   UUID,                       -- references agent_instances (enterprise) or NULL in single-workspace
    agent_role          TEXT NOT NULL,              -- 'orchestrator' | 'qa-agent' | 'fix-agent' | 'executor' | 'reviewer'
    lane                TEXT,                       -- parallel-session lane tag (e.g., 'LANE-A'); nullable
    phase               agent_event_phase NOT NULL,
    session_id          TEXT,                       -- groups events within one operator session
    task_id             TEXT,                       -- links event to an AgentTaskManifest
    work_item_id        UUID,                       -- links to work_queue_items if present
    summary             TEXT NOT NULL,              -- one-line human-readable summary of the event
    payload             JSONB,                      -- structured detail (diff paths, lock names, tool calls, etc.)
    correlation_id      TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_workspace_time ON agentforce_governance.agent_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_correlation    ON agentforce_governance.agent_events (correlation_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_role_phase     ON agentforce_governance.agent_events (agent_role, phase, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_task           ON agentforce_governance.agent_events (task_id);
CREATE INDEX IF NOT EXISTS idx_agent_events_work_item      ON agentforce_governance.agent_events (work_item_id);

COMMENT ON TABLE agentforce_governance.agent_events IS
  'Agent activity event stream — replaces the file-based bulletin in Postgres-backed deployments. Append-only by convention.';
COMMENT ON COLUMN agentforce_governance.agent_events.lane IS
  'Parallel-session lane tag (LANE-A/LANE-B/...) for safe concurrent sessions with disjoint file scopes.';
