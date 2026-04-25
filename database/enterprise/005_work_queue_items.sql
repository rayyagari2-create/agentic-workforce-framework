-- ============================================================================
-- TABLE: awf_governance.work_queue_items
-- ============================================================================
-- Purpose
--   Queue of work for agents to pull from at enterprise scale. At
--   single-founder scale, the Orchestrator assigns work directly each
--   session; at multi-team scale, work enters this queue and the
--   Team Orchestrator routes from it. The lifecycle status enum mirrors
--   the canonical lifecycle in docs/architecture/enterprise-scaling.md
--   ("Work Queue Architecture").
--
-- Ownership (writers)
--   - Team Orchestrators and Division Orchestrators write rows here
--     when planning. The Orchestrator that creates the row also sets
--     the initial assigned_agent_instance_id when routing.
--   - The runtime policy layer (or the executing agent through the
--     runtime) updates status as the work moves through the lifecycle.
--   - The QA Agent does not write to this table directly — it returns a
--     verdict that the runtime translates into a status transition.
--   - Failed items return to 'failed'; the Orchestrator decides whether
--     to re-route, re-queue, or escalate.
--
-- Append-only rule
--   Lifecycle-mutable. Identity fields are immutable; the status enum
--   moves through the documented lifecycle. Each transition emits an
--   audit_log row carrying before_state and after_state.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, workspace_id, created_by, risk_level, task_id,
--     domain, files_in_scope, manifest_hash, created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event):
--     title, description, status, assigned_agent_instance_id,
--     assigned_at, started_at, completed_at, last_failure_id,
--     strike_count, blocked_reason, priority, metadata, updated_at
--
-- Audit requirement
--   Every status transition emits event_type = 'work_item.status_changed'
--   with before_state and after_state. Re-assignment emits
--   event_type = 'work_item.reassigned'. Strike increments emit
--   event_type = 'work_item.strike_recorded'.
--
-- Lifecycle (matches the enum order)
--   created → assigned → in_progress → pending_review → qa_in_progress
--   → complete | failed | blocked
--   - 'failed' returns to the Orchestrator for re-routing; it may
--     transition back to 'assigned' or be terminated.
--   - 'blocked' is reviewed by the Team Orchestrator; it is not
--     auto-re-queued.
--   - The 3-strike rule: when strike_count hits 3, the runtime fires an
--     ESCALATION gate before the next attempt (see hitl-gates.md).
--
-- Source
--   Section 11 (Enterprise Scaling) — "Work Queue Architecture" — and
--   Appendix C of the reference architecture document;
--   docs/control-plane/build-state-machine.md.
--
-- Status
--   v3.0 — designed, not yet field-proven.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into awf_governance.audit_log,
-- references workspaces (002), agent_instances (004), and stores
-- last_failure_id pointing into failure_records (governance).
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS awf_governance;

-- Work queue lifecycle. Order matters — transitions follow the
-- documented forward path (with 'failed' and 'blocked' as branch
-- terminals that the Orchestrator can re-route from).
DO $$ BEGIN
    CREATE TYPE work_queue_status AS ENUM (
        'created',          -- task defined, not yet assigned
        'assigned',          -- routed to an agent_instance by the Orchestrator
        'in_progress',       -- agent has started; locks active
        'pending_review',    -- HITL gate triggered; waiting for approval
        'qa_in_progress',    -- QA Agent running its verdict pass
        'complete',          -- QA PASS; locks released; committed
        'failed',            -- QA FAIL; returned to Orchestrator
        'blocked'            -- dependency unresolved; Orchestrator review
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS awf_governance.work_queue_items (
    -- Synthetic primary key.
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary.
    tenant_id                     UUID NOT NULL,

    -- The workspace this item belongs to. ON DELETE CASCADE — work
    -- queue items live and die with their workspace.
    workspace_id                  UUID NOT NULL
                                    REFERENCES awf_governance.workspaces(id)
                                    ON DELETE CASCADE,

    -- The user_id of the human (or the agent_instance acting on behalf
    -- of the human) that created the item. No FK to users.
    created_by                    UUID NOT NULL,

    -- Stable identifier matching the AgentTaskManifest's task_id field
    -- so the queue row can be joined to manifests and to agent_events.
    -- Free string; deployments use whatever manifest naming they prefer.
    task_id                       TEXT NOT NULL,

    -- Domain tag, free string. Matches the domain on trust_scores and
    -- failure_records so per-domain pre-task retrieval matches cleanly.
    domain                        TEXT NOT NULL,

    -- Display title for humans.
    title                         TEXT NOT NULL,

    -- Free-text description of the work.
    description                   TEXT,

    -- Risk classification used by the gate engine. Values from the
    -- risk_level enum declared in 002_workspaces.sql. Immutable once
    -- written: re-classifying mid-flight would let an agent escape
    -- the gate that fired at 'created' time.
    risk_level                    risk_level NOT NULL,

    -- File paths in scope for the task. Used for pre-task failure
    -- retrieval and for lock acquisition.
    files_in_scope                TEXT[] NOT NULL,

    -- Hash of the AgentTaskManifest at creation time. Immutable proof
    -- that the manifest has not been edited after the queue row was
    -- created. The runtime verifies this on dequeue.
    manifest_hash                 TEXT,

    -- Lifecycle status.
    status                        work_queue_status NOT NULL DEFAULT 'created',

    -- Currently assigned agent instance, or NULL for items in 'created'
    -- (not yet assigned) or 'blocked' (returned to the queue) states.
    -- ON DELETE SET NULL — if an agent_instance is hard-deleted (rare),
    -- queued items survive; the Orchestrator must reassign.
    assigned_agent_instance_id    UUID
                                    REFERENCES awf_governance.agent_instances(id)
                                    ON DELETE SET NULL,

    -- Timestamps for each major transition. Set by the runtime when the
    -- corresponding status flips. NULL while not yet entered.
    assigned_at                   TIMESTAMPTZ,
    started_at                    TIMESTAMPTZ,
    completed_at                  TIMESTAMPTZ,

    -- The most recent failure record this item produced. References
    -- failure_records.failure_id (the human-readable FAIL-YYYY-... ID,
    -- not the UUID PK). NULL when the item has not failed.
    last_failure_id               TEXT,

    -- Number of QA FAIL strikes accumulated on this item so far. The
    -- 3-strike rule fires ESCALATION when this reaches 3. Reset only
    -- by an explicit Orchestrator action (also audited).
    strike_count                  INTEGER NOT NULL DEFAULT 0
                                    CHECK (strike_count >= 0),

    -- Free-text reason recorded when the item enters 'blocked'. NULL
    -- otherwise.
    blocked_reason                TEXT,

    -- Numeric priority for the work-pull queue. Lower numbers run
    -- first by convention (1 = highest). Bounded so dashboards can
    -- color-code reliably.
    priority                      INTEGER NOT NULL DEFAULT 100
                                    CHECK (priority BETWEEN 1 AND 1000),

    -- Free-form structured metadata.
    metadata                      JSONB,

    -- Insertion timestamp.
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp.
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) the work-pull query — "what is the
-- highest-priority unassigned item in this workspace?", (b) per-agent
-- in-flight view, (c) per-status dashboards (count of pending_review),
-- (d) per-task lookup.

-- Work-pull queue: serves the dequeue path. (workspace_id, status,
-- priority, created_at) lets the Orchestrator pull the highest-priority
-- 'created' or 'failed' item with one index range scan.
CREATE INDEX IF NOT EXISTS idx_work_queue_items_pull
    ON awf_governance.work_queue_items
       (workspace_id, status, priority ASC, created_at ASC);

-- Per-agent in-flight: serves the agent's "what am I working on?"
-- view and the Orchestrator's per-agent load chart.
CREATE INDEX IF NOT EXISTS idx_work_queue_items_assigned
    ON awf_governance.work_queue_items
       (assigned_agent_instance_id, status);

-- Status dashboard: serves the workspace-level rollup
-- ("how many pending_review across this workspace right now?").
CREATE INDEX IF NOT EXISTS idx_work_queue_items_workspace_status
    ON awf_governance.work_queue_items (workspace_id, status);

-- Task lookup: serves "show me the queue row for this AgentTaskManifest".
CREATE INDEX IF NOT EXISTS idx_work_queue_items_task
    ON awf_governance.work_queue_items (task_id);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE awf_governance.work_queue_items IS
  'Queue of work for agents to pull at enterprise scale. Lifecycle status mirrors enterprise-scaling.md "Work Queue Architecture".';

COMMENT ON COLUMN awf_governance.work_queue_items.risk_level IS
  'Immutable once written. Re-classifying mid-flight would let an agent escape the gate that fired at created time.';

COMMENT ON COLUMN awf_governance.work_queue_items.strike_count IS
  '3-strike rule: ESCALATION fires when this reaches 3. Reset only by explicit Orchestrator action (audited).';

COMMENT ON COLUMN awf_governance.work_queue_items.manifest_hash IS
  'Hash of the AgentTaskManifest at creation. Runtime verifies on dequeue that the manifest has not been edited.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — Team Orchestrator queues a new HIGH-risk task. The
--    item starts in 'created'; a separate UPDATE flips it to 'assigned'
--    once the Orchestrator picks an agent instance.
--
-- INSERT INTO awf_governance.work_queue_items (
--     tenant_id, workspace_id, created_by, task_id, domain,
--     title, description, risk_level, files_in_scope, manifest_hash,
--     priority, metadata
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-0000000000w1'::uuid,
--     '00000000-0000-0000-0000-0000000000a2'::uuid,
--     'TASK-2026-04-24-007',
--     'auth',
--     'Patch session-token leak in redirect handler',
--     'See FAIL-2025-11-12-003 for prior occurrence and prevention notes.',
--     'HIGH',
--     ARRAY['src/api/login.ts','src/lib/session.ts']::text[],
--     'sha256:abcdef0123456789...',
--     50,
--     '{"linked_failure":"FAIL-2025-11-12-003"}'::jsonb
-- );
--
-- 2. Most common read — the work-pull query. Highest-priority unassigned
--    or returned-to-queue item in this workspace. Served by
--    idx_work_queue_items_pull.
--
-- SELECT id, task_id, title, risk_level, priority, files_in_scope
--   FROM awf_governance.work_queue_items
--  WHERE workspace_id = $1
--    AND status IN ('created','failed')
--  ORDER BY priority ASC, created_at ASC
--  LIMIT 1;
--
-- 3. Recurrence detection — items that hit the 3-strike threshold and
--    were returned to the Orchestrator. Used by the daily digest to
--    surface "tasks that are not converging" for human review.
--
-- SELECT id, task_id, title, strike_count, last_failure_id, updated_at
--   FROM awf_governance.work_queue_items
--  WHERE workspace_id = $1
--    AND strike_count >= 3
--    AND status IN ('failed','blocked','pending_review')
--  ORDER BY updated_at DESC;
