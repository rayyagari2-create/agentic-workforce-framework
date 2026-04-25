-- ============================================================================
-- TABLE: agentforce_governance.agent_events
-- ============================================================================
-- Purpose
--   Agent activity event stream — the Postgres-backed equivalent of the
--   file-based agent bulletin used in single-workspace deployments. Every
--   meaningful state transition the agent passes through (acquired
--   context, blocked on input, handed off, completed, failed) is recorded
--   here as one row.
--
-- Ownership (writers)
--   Agents themselves are the writers. The Orchestrator and every
--   executing agent emit one row per state transition during their own
--   activity. No other role writes here. The Eval/Telemetry Service reads
--   from this table when assembling D2 (observability) evidence; it does
--   not write.
--
-- Append-only rule
--   Append-only by convention, not by trigger. Postgres row-level locking
--   handles concurrent writes natively, and the convention is enforced at
--   the application layer (agents never UPDATE or DELETE prior rows; they
--   insert a new row to record any correction). The convention exists
--   because D2 scoring depends on the gap-free sequence of events being
--   trustworthy. Editing prior rows would silently rewrite that history.
--
-- Mutable vs immutable fields
--   All columns are immutable by convention. There is no schema-level
--   trigger blocking UPDATE / DELETE — that strictness is reserved for
--   audit_log, which is the cryptographically-anchored compliance record.
--   agent_events is the operational stream; if a deployment needs strict
--   immutability here too, add a trigger mirroring audit_log_immutable().
--
-- Audit requirement
--   Every insert into agent_events is itself observed by the runtime: a
--   matching audit_log row with event_type = 'agent_event.recorded' may
--   be emitted by the runtime policy layer when the deployment requires
--   tamper-evident agent activity (e.g., regulated environments).
--
-- Source
--   Section 5 Layer 8 (Control Plane) and Appendix C of the reference
--   architecture document. Multi-workspace bulletin migration is the
--   v3.0 enterprise move described in docs/architecture/enterprise-scaling.md.
--
-- Status
--   v1.0 — ships at public launch.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

-- Lifecycle phases for an agent-in-task. Kept distinct from
-- work_queue_items.status because one work item can produce many
-- agent_events across its lifetime (an agent may report WORKING, then
-- BLOCKED, then WORKING again, then HANDOFF — all under one work item).
DO $$ BEGIN
    CREATE TYPE agent_event_phase AS ENUM (
        'WORKING',    -- agent has acquired context and begun executing
        'BLOCKED',    -- waiting on a human decision, dependency, or external input
        'HANDOFF',    -- transferring work to another agent
        'DONE',       -- task portion complete; QA may still be pending
        'FAIL',       -- aborted due to error or policy violation
        'NOTE'        -- informational entry, no state transition
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agentforce_governance.agent_events (
    -- Synthetic primary key. UUIDs avoid sequence contention when many
    -- agents write concurrently from different lanes.
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary. Required even at single-workspace scale so
    -- that enabling row-level security later is a one-line change.
    tenant_id           UUID NOT NULL,

    -- Workspace scope. Nullable for tenant-wide system events. No FK:
    -- workspaces table lives in the enterprise schema and is optional.
    workspace_id        UUID,

    -- Persistent identity of the agent that emitted the event. Resolves
    -- to agent_instances (enterprise schema). NULL is permitted in
    -- single-workspace deployments where persistent identity has not
    -- been adopted yet. No FK: enterprise schema is optional.
    agent_instance_id   UUID,

    -- Canonical role of the emitting agent. Free string by convention so
    -- the framework can be extended with custom agents without schema
    -- changes. Expected values from the framework roster:
    --   'orchestrator', 'qa-agent', 'fix-agent', 'frontend-agent',
    --   'backend-agent', 'security-check', 'code-review', 'boardroom',
    --   'chief-of-staff', 'deep-research', 'reviewer'.
    agent_role          TEXT NOT NULL,

    -- Parallel-session lane tag (e.g., 'LANE-A', 'LANE-B'). Set when
    -- multiple agents work concurrently on disjoint file scopes within
    -- one workspace. Nullable: not all sessions are laned.
    lane                TEXT,

    -- The lifecycle phase being recorded. See agent_event_phase enum.
    phase               agent_event_phase NOT NULL,

    -- Operator session identifier. Groups events that share one human
    -- operator's interactive session. Free string so deployments can
    -- match it to whatever session model their runtime uses.
    session_id          TEXT,

    -- Identifier of the AgentTaskManifest the event relates to. Free
    -- string so deployments can use their own manifest IDs.
    task_id             TEXT,

    -- Foreign reference to a work_queue_items row, when this event
    -- belongs to a queued task. Nullable for ad-hoc activity that is not
    -- routed through the queue. No FK: work_queue_items lives in the
    -- enterprise schema and is optional.
    work_item_id        UUID,

    -- One-line human-readable summary of the event. The bulletin entry.
    -- Required so the stream is readable without joining JSONB payload.
    summary             TEXT NOT NULL,

    -- Structured detail — diff paths, lock names acquired/released,
    -- tool calls, retry counts, etc. Schema is per-agent and per-event.
    payload             JSONB,

    -- Threads related events into one logical chain. Same correlation_id
    -- as the corresponding audit_log, gate_records, and work_queue_items
    -- rows. Required so the audit trail can be reconstructed end-to-end.
    correlation_id      TEXT NOT NULL,

    -- Insertion timestamp. Used for chronological replay and for D2
    -- (observability) gap detection.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) tail the latest events in a workspace,
-- (b) reconstruct one correlation chain, (c) profile one role's recent
-- phase transitions for D2 evidence, (d) find every event tied to one
-- task or work item.

-- Workspace tail: serves the operator dashboard "what is happening in
-- this workspace right now". DESC because almost every read is "latest".
CREATE INDEX IF NOT EXISTS idx_agent_events_workspace_time
    ON agentforce_governance.agent_events (workspace_id, created_at DESC);

-- Correlation lookup: reconstructs one task / session chain. Read by the
-- QA Agent at session close to assemble D2 evidence.
CREATE INDEX IF NOT EXISTS idx_agent_events_correlation
    ON agentforce_governance.agent_events (correlation_id);

-- Per-role phase profile: serves "show me the recent phase transitions
-- for the QA Agent". Used by the Eval/Telemetry Service when computing
-- the D2 (observability) score for a role across sessions.
CREATE INDEX IF NOT EXISTS idx_agent_events_role_phase
    ON agentforce_governance.agent_events (agent_role, phase, created_at DESC);

-- Task lookup: serves "show me every event for this AgentTaskManifest".
CREATE INDEX IF NOT EXISTS idx_agent_events_task
    ON agentforce_governance.agent_events (task_id);

-- Work item lookup: serves "show me every event for this queued work
-- item". Used by the Orchestrator when evaluating whether to re-route a
-- BLOCKED item or escalate it.
CREATE INDEX IF NOT EXISTS idx_agent_events_work_item
    ON agentforce_governance.agent_events (work_item_id);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE agentforce_governance.agent_events IS
  'Agent activity event stream. Postgres-backed bulletin replacement. Append-only by convention. Writers: agents themselves.';

COMMENT ON COLUMN agentforce_governance.agent_events.lane IS
  'Parallel-session lane tag (LANE-A / LANE-B / ...) for safe concurrent sessions with disjoint file scopes.';

COMMENT ON COLUMN agentforce_governance.agent_events.phase IS
  'Lifecycle phase enum: WORKING, BLOCKED, HANDOFF, DONE, FAIL, NOTE. NOTE is informational with no state transition.';

COMMENT ON COLUMN agentforce_governance.agent_events.payload IS
  'Per-agent structured detail — diff paths, lock names, tool calls, retry counts, etc. JSONB for flexibility.';

COMMENT ON COLUMN agentforce_governance.agent_events.correlation_id IS
  'Threads related events. One task / session shares one correlation_id across all governance tables.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — the QA Agent records the start of a verdict pass.
--    The same correlation_id appears in agent_events, audit_log, and
--    (when the work was queued) work_queue_items.
--
-- INSERT INTO agentforce_governance.agent_events (
--     tenant_id, workspace_id, agent_instance_id, agent_role, lane, phase,
--     session_id, task_id, work_item_id, summary, payload, correlation_id
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-000000000010'::uuid,
--     '00000000-0000-0000-0000-0000000000aa'::uuid,
--     'qa-agent',
--     'LANE-A',
--     'WORKING',
--     'sess-2026-04-24-001',
--     'TASK-2026-04-24-007',
--     '00000000-0000-0000-0000-0000000000b1'::uuid,
--     'QA verdict pass started; reviewing 7 acceptance criteria.',
--     '{"acs":7,"diff_files":["src/api/login.ts"]}'::jsonb,
--     '01HJ8M00000000000000000000'
-- );
--
-- 2. Most common read — tail the latest 50 events in a workspace, newest
--    first. Served by idx_agent_events_workspace_time.
--
-- SELECT created_at, agent_role, lane, phase, summary
--   FROM agentforce_governance.agent_events
--  WHERE workspace_id = $1
--  ORDER BY created_at DESC
--  LIMIT 50;
--
-- 3. D2 (observability) reconstruction — every phase transition the
--    QA Agent recorded for one session, in order. Used to assess whether
--    the agent logged a bulletin entry at every transition (the D2 = 25
--    anchor) or had silent gaps (the D2 ≤ 10 anchor).
--
-- SELECT created_at, phase, summary
--   FROM agentforce_governance.agent_events
--  WHERE correlation_id = $1
--    AND agent_role     = 'qa-agent'
--  ORDER BY created_at ASC;
