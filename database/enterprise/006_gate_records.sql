-- ============================================================================
-- TABLE: agentforce_governance.gate_records
-- ============================================================================
-- Purpose
--   One row per HITL / DELEGATION / ESCALATION / APPROVAL gate decision.
--   The runtime policy layer writes a 'PENDING' row when a gate fires;
--   the approver's decision (or expiry) flips the row to APPROVED /
--   REJECTED / EXPIRED / ESCALATED. A single task may produce a chain
--   of gate_records as approvals route up the authority hierarchy.
--   This is the operational record; the immutable record of every
--   transition lives in audit_log.
--
-- Ownership (writers)
--   - The runtime policy layer writes the initial row when the gate
--     fires. No agent writes here directly.
--   - The runtime updates the row when the approver decides, when the
--     TTL expires, or when an ESCALATION fires.
--   - Decisions are recorded by setting decided_by + decision +
--     decided_at + rationale. The approver's rationale is mandatory
--     for every decision, including APPROVED.
--
-- Append-only rule
--   Lifecycle-mutable. Identity fields are immutable; the decision
--   fields move from PENDING to a terminal state once. Each transition
--   emits an audit_log row carrying before_state and after_state.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, workspace_id, work_item_id, gate_type, risk_level,
--     requested_by, requested_at, approver_role, prior_gate_id,
--     correlation_id, created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event):
--     status, decided_by, decision, decided_at, rationale, expires_at,
--     delegation_rule_id, metadata, updated_at
--
-- Audit requirement
--   Every INSERT emits event_type = 'gate.requested'. Every status
--   transition emits 'gate.approved', 'gate.rejected', 'gate.expired',
--   or 'gate.escalated'. before_state and after_state carry the
--   pre/post snapshots so post-mortems can reconstruct decision flow.
--
-- Self-approval prevention
--   The application layer enforces requested_by != decided_by for HITL
--   and APPROVAL gate types. This rule prevents an agent's operator
--   from approving the agent's own request. The constraint is documented
--   here but not enforced at the schema level because the values are
--   typed UUID and Postgres has no easy way to express "these two
--   columns must differ when both are non-NULL across an enum subset".
--
-- Source
--   docs/control-plane/hitl-gates.md (full gate type, authority, and
--   chain documentation); Section 11 (Enterprise Scaling) and Appendix
--   C of the reference architecture document.
--
-- Status
--   v3.0 — designed, not yet field-proven.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into agentforce_governance.audit_log,
-- references workspaces (002), work_queue_items (005), and consumes
-- the risk_level enum from 002_workspaces.sql.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

-- The four gate types from docs/control-plane/hitl-gates.md.
DO $$ BEGIN
    CREATE TYPE gate_type AS ENUM (
        'HITL',         -- standard human review at HIGH-risk threshold
        'DELEGATION',   -- delegate approves under a valid delegation_rules row
        'ESCALATION',   -- prior gate timed out / 3-strike / Manager flag
        'APPROVAL'      -- CRITICAL-risk; multi-authority sign-off
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The status of a gate decision.
DO $$ BEGIN
    CREATE TYPE gate_status AS ENUM (
        'PENDING',
        'APPROVED',
        'REJECTED',
        'EXPIRED',
        'ESCALATED'     -- terminal in this row; a follow-on gate row carries the escalation
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The decision recorded against a gate. NULL while PENDING; set once
-- the row reaches a terminal status. APPROVED / REJECTED come from a
-- human; EXPIRED is set by the runtime when expires_at passes;
-- ESCALATED is set by the runtime when a follow-on gate is fired.
DO $$ BEGIN
    CREATE TYPE gate_decision AS ENUM (
        'APPROVED',
        'REJECTED',
        'EXPIRED',
        'ESCALATED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS agentforce_governance.gate_records (
    -- Synthetic primary key.
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary.
    tenant_id           UUID NOT NULL,

    -- Workspace scope.
    workspace_id        UUID
                          REFERENCES agentforce_governance.workspaces(id)
                          ON DELETE SET NULL,

    -- The work item this gate guards. ON DELETE SET NULL — gate history
    -- survives the deletion of a work item (rare, archive-first is the
    -- norm) so post-mortems can still reconstruct the decision.
    work_item_id        UUID
                          REFERENCES agentforce_governance.work_queue_items(id)
                          ON DELETE SET NULL,

    -- Gate type. Immutable.
    gate_type           gate_type NOT NULL,

    -- Risk classification of the underlying work, captured at gate-fire
    -- time. Immutable so the gate's evaluation context is preserved.
    risk_level          risk_level NOT NULL,

    -- The user_id (or agent_instance_id) that triggered the gate. For
    -- agent-fired gates this is the executing agent's instance ID; for
    -- system-fired gates (e.g., 3-strike escalation), the runtime's
    -- service identity. Immutable.
    requested_by        UUID NOT NULL,

    -- Insertion timestamp.
    requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- The role that should approve this gate (e.g., 'team-orchestrator',
    -- 'division-orchestrator', 'cto'). Free string so deployments can
    -- model their own authority hierarchies. Immutable.
    approver_role       TEXT NOT NULL,

    -- For ESCALATION rows: the prior gate row that triggered this
    -- escalation. NULL for a first-fire gate.
    prior_gate_id       UUID
                          REFERENCES agentforce_governance.gate_records(id)
                          ON DELETE SET NULL,

    -- Threads to the task / session. Same correlation_id appears in
    -- audit_log, agent_events, work_queue_items.
    correlation_id      TEXT NOT NULL,

    -- Lifecycle status.
    status              gate_status NOT NULL DEFAULT 'PENDING',

    -- The user_id of the human (or the delegate) who recorded the
    -- decision. NULL while PENDING. Application enforces
    -- requested_by != decided_by for HITL / APPROVAL types
    -- (anti-self-approval rule).
    decided_by          UUID,

    -- The decision. NULL while PENDING; one of APPROVED / REJECTED /
    -- EXPIRED / ESCALATED at terminal status.
    decision            gate_decision,

    -- Decision timestamp.
    decided_at          TIMESTAMPTZ,

    -- The decision rationale. Required for every decision (including
    -- APPROVED). The most common audit failure is silent approval,
    -- which the rationale field guards against.
    rationale           TEXT,

    -- TTL. NULL means no auto-expiry (rare). When NOW() > expires_at and
    -- status is still PENDING, a scheduled job flips the row to EXPIRED
    -- and fires an ESCALATION gate.
    expires_at          TIMESTAMPTZ,

    -- For DELEGATION rows: the delegation_rules row that authorized
    -- the delegate. NULL for non-delegation gate types.
    delegation_rule_id  UUID,

    -- Free-form structured metadata.
    metadata            JSONB,

    -- Insertion timestamp (alias of requested_at). Kept for consistency
    -- with the other governance tables that always carry created_at.
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp.
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A decision implies a decider and a timestamp. NULL means PENDING.
    CHECK (
        (decision IS NULL    AND decided_by IS NULL    AND decided_at IS NULL)
     OR (decision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    )
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) the approver inbox — "what gates are
-- PENDING for my role in this workspace?", (b) per-work-item history —
-- "show me the gate chain for this task", (c) per-correlation
-- reconstruction, (d) expiry sweep — "what PENDING rows are past their
-- TTL?".

-- Approver inbox: serves "PENDING gates for this approver_role in this
-- workspace, oldest first". Oldest-first because approvers should
-- service older requests before newer ones to avoid TTL expiry storms.
CREATE INDEX IF NOT EXISTS idx_gate_records_pending_inbox
    ON agentforce_governance.gate_records (workspace_id, approver_role, status, requested_at ASC);

-- Per-work-item history: serves "show me every gate ever fired for
-- this work item, in order".
CREATE INDEX IF NOT EXISTS idx_gate_records_work_item_time
    ON agentforce_governance.gate_records (work_item_id, requested_at ASC);

-- Correlation reconstruction: serves "show me the gate chain for this
-- session" — used by post-mortems and by the QA Agent when assembling
-- D3 (compliance) evidence.
CREATE INDEX IF NOT EXISTS idx_gate_records_correlation
    ON agentforce_governance.gate_records (correlation_id);

-- Expiry sweep: serves the scheduled job that flips overdue PENDING
-- rows to EXPIRED. Partial index: only PENDING rows with an expires_at
-- value matter to the sweep.
CREATE INDEX IF NOT EXISTS idx_gate_records_expiry_sweep
    ON agentforce_governance.gate_records (expires_at)
    WHERE status = 'PENDING' AND expires_at IS NOT NULL;

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE agentforce_governance.gate_records IS
  'One row per HITL/DELEGATION/ESCALATION/APPROVAL gate decision. PENDING → terminal. Every transition emits an audit_log event.';

COMMENT ON COLUMN agentforce_governance.gate_records.requested_by IS
  'The user_id or agent_instance_id that triggered the gate. Application enforces requested_by != decided_by (anti-self-approval).';

COMMENT ON COLUMN agentforce_governance.gate_records.rationale IS
  'Required for every decision — including APPROVED. Silent approval is the most common audit failure.';

COMMENT ON COLUMN agentforce_governance.gate_records.expires_at IS
  'TTL. When NOW() > expires_at and status is PENDING, scheduled sweep flips to EXPIRED and fires an ESCALATION.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — runtime fires a HITL gate on a HIGH-risk task. The
--    row starts PENDING; a separate UPDATE records the human approver's
--    decision when they sign the manifest.
--
-- INSERT INTO agentforce_governance.gate_records (
--     tenant_id, workspace_id, work_item_id, gate_type, risk_level,
--     requested_by, approver_role, correlation_id, expires_at, metadata
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-0000000000w1'::uuid,
--     '00000000-0000-0000-0000-0000000000q1'::uuid,
--     'HITL',
--     'HIGH',
--     '00000000-0000-0000-0000-0000000000aa'::uuid,
--     'team-orchestrator',
--     '01HJ8M00000000000000000000',
--     NOW() + INTERVAL '4 hours',
--     '{"manifest":"TASK-2026-04-24-007"}'::jsonb
-- );
--
-- 2. Most common read — the approver inbox for one role in one
--    workspace, oldest first. Served by idx_gate_records_pending_inbox.
--
-- SELECT id, gate_type, risk_level, work_item_id, requested_by,
--        requested_at, expires_at
--   FROM agentforce_governance.gate_records
--  WHERE workspace_id  = $1
--    AND approver_role = $2
--    AND status        = 'PENDING'
--  ORDER BY requested_at ASC
--  LIMIT 50;
--
-- 3. Gate chain reconstruction — every gate fired against one
--    work_item, in order, with the prior_gate link traversed. Used by
--    post-mortems and by D3 (compliance) evidence assembly. Served by
--    idx_gate_records_work_item_time.
--
-- SELECT id, gate_type, status, requested_by, decided_by, decision,
--        rationale, requested_at, decided_at, prior_gate_id
--   FROM agentforce_governance.gate_records
--  WHERE work_item_id = $1
--  ORDER BY requested_at ASC;
