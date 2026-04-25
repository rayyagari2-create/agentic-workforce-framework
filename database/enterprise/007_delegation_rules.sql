-- ============================================================================
-- TABLE: awf_governance.delegation_rules
-- ============================================================================
-- Purpose
--   Records explicit delegations of approval authority. When a HITL or
--   APPROVAL gate fires and the primary approver is unavailable, the
--   gate engine looks for a matching delegation_rules row. If exactly
--   one matches (delegate is current, gate type permitted, risk ceiling
--   honored, time window active), the delegate may approve in the
--   primary's stead. Every delegation is explicit, scoped, and TTL-bound.
--
-- Ownership (writers)
--   Only humans with original delegator authority write rows here. The
--   application layer enforces this — a delegate may NOT create a
--   delegation_rules row that delegates to a third party (no
--   re-delegation). Enterprise admin tooling and the Boardroom Agent
--   write rows when an approver designates a deputy.
--
-- Append-only rule
--   Lifecycle-mutable, but conservatively. Identity fields are
--   immutable; the only mutable field is revoked_at (early termination).
--   The TTL itself (valid_until) is immutable so a delegate cannot
--   silently extend their own authority window.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, workspace_scope_id, division_scope_id,
--     delegator_id, delegate_id, gate_types, max_risk_level,
--     valid_from, valid_until, rationale, created_at
--   Mutable across the row's lifecycle (each change emits an audit_log
--   event):
--     revoked_at, revoked_by, revocation_reason, updated_at
--
-- Audit requirement
--   Every INSERT emits event_type = 'delegation.created'. Every
--   UPDATE that sets revoked_at emits event_type = 'delegation.revoked'.
--   Every gate decision made under a delegation references the
--   delegation_rules.id from gate_records.delegation_rule_id, so the
--   audit chain can prove who delegated to whom and when.
--
-- Hard rules (enforced at the application layer)
--   1. Delegation is always explicit. No implicit forwarding.
--   2. A delegate cannot re-delegate. The delegator on a new row
--      must hold the original authority, not a delegated one.
--   3. Delegation expires. valid_until is required and is a hard cutoff.
--   4. TTL is bounded. Workspace policy defines a maximum (typical
--      14 days). Long delegations defeat the audit value.
--   5. Audit log records every delegation creation and every approval
--      decision made under delegation. Unused delegations are also
--      auditable as creation events.
--
-- Source
--   docs/control-plane/hitl-gates.md — "Delegation TTL Rules" — and
--   Section 11 (Enterprise Scaling) of the reference architecture
--   document.
--
-- Status
--   v3.0 — designed, not yet field-proven.
--
-- Requires governance schema to be installed first.
-- Do not run this before database/governance/ migrations complete.
-- This table emits audit events into awf_governance.audit_log,
-- references workspaces (002) and divisions (001), and consumes the
-- gate_type and risk_level enums declared in 002 and 006.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS awf_governance;

CREATE TABLE IF NOT EXISTS awf_governance.delegation_rules (
    -- Synthetic primary key. Referenced from gate_records.delegation_rule_id
    -- when a delegate approves a gate.
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary.
    tenant_id             UUID NOT NULL,

    -- Workspace scope of the delegation. Mutually exclusive with
    -- division_scope_id (CHECK below). NULL means the delegation
    -- applies at division scope.
    workspace_scope_id    UUID
                            REFERENCES awf_governance.workspaces(id)
                            ON DELETE CASCADE,

    -- Division scope of the delegation. Mutually exclusive with
    -- workspace_scope_id. NULL means the delegation applies at a
    -- single-workspace scope.
    division_scope_id     UUID
                            REFERENCES awf_governance.divisions(id)
                            ON DELETE CASCADE,

    -- The original authority delegating. The user_id of the human (or
    -- the agent_instance_id of an agent acting on behalf of a human).
    -- Immutable.
    delegator_id          UUID NOT NULL,

    -- The temporary authority. The user_id of the delegate. Immutable.
    -- Must differ from delegator_id (CHECK below).
    delegate_id           UUID NOT NULL,

    -- Which gate types this delegation covers. Subset of the gate_type
    -- enum from 006_gate_records.sql. Empty array is not allowed
    -- (CHECK below) — a delegation that covers no gate types is
    -- meaningless.
    gate_types            gate_type[] NOT NULL,

    -- The maximum risk level this delegate may approve under this
    -- delegation. The runtime evaluates: gate's risk_level <=
    -- max_risk_level (per the implicit ordering on the risk_level
    -- enum: LOW < MEDIUM < HIGH < CRITICAL). Immutable.
    max_risk_level        risk_level NOT NULL,

    -- When the delegation becomes effective. Default NOW(). Immutable.
    valid_from            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- When the delegation expires. Required. Immutable so a delegate
    -- cannot silently extend the window. Application enforces a
    -- workspace-policy upper bound on (valid_until - valid_from).
    valid_until           TIMESTAMPTZ NOT NULL,

    -- Free-text reason for the delegation (e.g., "On-call rotation
    -- 2026-04-24 to 2026-05-01"). Required for audit clarity.
    rationale             TEXT NOT NULL,

    -- If revoked early: when. NULL while active.
    revoked_at            TIMESTAMPTZ,

    -- If revoked early: by whom. NULL while active. The revoker must
    -- be the delegator or hold authority above the delegator;
    -- enforced at the application layer.
    revoked_by            UUID,

    -- If revoked early: free-text reason. Required when revoked_at
    -- is set (CHECK below).
    revocation_reason     TEXT,

    -- Free-form structured metadata.
    metadata              JSONB,

    -- Insertion timestamp.
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp.
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Anti-self-delegation. A user cannot delegate to themselves.
    CHECK (delegator_id <> delegate_id),

    -- Scope is exclusive: a delegation lives at workspace scope OR
    -- at division scope, not both.
    CHECK (
        (workspace_scope_id IS NOT NULL AND division_scope_id IS NULL)
     OR (workspace_scope_id IS NULL    AND division_scope_id IS NOT NULL)
    ),

    -- A non-empty gate_types array is required.
    CHECK (cardinality(gate_types) > 0),

    -- A valid TTL: end strictly after start.
    CHECK (valid_until > valid_from),

    -- Revocation fields are coupled: all-or-nothing.
    CHECK (
        (revoked_at IS NULL    AND revoked_by IS NULL    AND revocation_reason IS NULL)
     OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND revocation_reason IS NOT NULL)
    )
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) the gate engine looking up "is there an
-- active delegation from this delegator that this delegate could use to
-- approve this gate type at this risk level right now?", (b) the admin
-- view of "active delegations to this delegate", (c) the auditor view
-- of "all delegations from this delegator over time".

-- Gate-engine lookup. Composite of (delegator_id, delegate_id) is the
-- most selective starting point for the runtime's "does a delegation
-- exist?" query. The gate_types and risk_level filters are applied
-- after the index narrows by delegator/delegate pair.
CREATE INDEX IF NOT EXISTS idx_delegation_rules_delegator_delegate
    ON awf_governance.delegation_rules (delegator_id, delegate_id);

-- Per-delegate active list: serves "what delegations am I currently a
-- delegate for?" — the inbox the delegate sees on their dashboard.
-- Partial index on currently-active rows keeps the index small.
CREATE INDEX IF NOT EXISTS idx_delegation_rules_delegate_active
    ON awf_governance.delegation_rules (delegate_id, valid_until DESC)
    WHERE revoked_at IS NULL;

-- Per-delegator audit list: serves "all delegations this user has
-- ever issued, in order".
CREATE INDEX IF NOT EXISTS idx_delegation_rules_delegator_time
    ON awf_governance.delegation_rules (delegator_id, created_at DESC);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE awf_governance.delegation_rules IS
  'Explicit delegations of approval authority. TTL-bounded, scope-bounded, anti-self-delegation. Re-delegation is forbidden at the application layer.';

COMMENT ON COLUMN awf_governance.delegation_rules.gate_types IS
  'Subset of gate_type enum the delegate may approve. Non-empty (CHECK).';

COMMENT ON COLUMN awf_governance.delegation_rules.max_risk_level IS
  'Runtime evaluates: gate.risk_level <= max_risk_level using the implicit ordering LOW < MEDIUM < HIGH < CRITICAL.';

COMMENT ON COLUMN awf_governance.delegation_rules.valid_until IS
  'Hard cutoff. Immutable so delegates cannot silently extend their own window. Workspace policy bounds the maximum (valid_until - valid_from).';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — Tech Lead delegates HIGH-risk HITL approval to
--    a designated deputy for a 7-day on-call rotation.
--
-- INSERT INTO awf_governance.delegation_rules (
--     tenant_id, workspace_scope_id, delegator_id, delegate_id,
--     gate_types, max_risk_level,
--     valid_from, valid_until, rationale
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-0000000000w1'::uuid,
--     '00000000-0000-0000-0000-0000000000a2'::uuid,
--     '00000000-0000-0000-0000-0000000000a4'::uuid,
--     ARRAY['HITL']::gate_type[],
--     'HIGH',
--     '2026-04-24T00:00:00Z'::timestamptz,
--     '2026-05-01T00:00:00Z'::timestamptz,
--     'On-call rotation 2026-04-24 → 2026-05-01.'
-- );
--
-- 2. Most common read — the gate engine asks "does a currently-valid
--    delegation exist that lets THIS delegate approve THIS gate type at
--    THIS risk in THIS workspace?" Served (in narrowing order) by
--    idx_delegation_rules_delegator_delegate.
--
-- SELECT id, max_risk_level, gate_types, valid_until
--   FROM awf_governance.delegation_rules
--  WHERE tenant_id          = $1
--    AND delegator_id       = $2
--    AND delegate_id        = $3
--    AND workspace_scope_id = $4
--    AND $5 = ANY(gate_types)            -- $5: the firing gate_type
--    AND max_risk_level >= $6            -- $6: the gate's risk_level
--    AND NOW() BETWEEN valid_from AND valid_until
--    AND revoked_at IS NULL
--  LIMIT 1;
--
-- 3. Trust history lookup — every delegation issued by one delegator,
--    with the count of approvals each one was used for. Used during
--    quarterly delegation audits to spot delegations that were never
--    used (over-permissioned) or used heavily (potentially under-scoped).
--
-- SELECT dr.id, dr.delegate_id, dr.gate_types, dr.max_risk_level,
--        dr.valid_from, dr.valid_until, dr.revoked_at,
--        COALESCE(g.approvals, 0) AS approvals_under_delegation
--   FROM awf_governance.delegation_rules dr
--   LEFT JOIN (
--        SELECT delegation_rule_id, COUNT(*) AS approvals
--          FROM awf_governance.gate_records
--         WHERE decision = 'APPROVED'
--         GROUP BY delegation_rule_id
--   ) g ON g.delegation_rule_id = dr.id
--  WHERE dr.delegator_id = $1
--  ORDER BY dr.created_at DESC;
