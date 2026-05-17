-- ============================================================================
-- 002_audit_schema.sql
-- Sprint 0 audit service backing store. Implements E0-02 of the AWF Sprint
-- Plan v4.0.
--
-- Scope
--   One append-only table, audit.events, owned by the audit service. Every
--   gate decision, lifecycle transition, runtime invocation, and policy
--   event in the framework writes one row here. This is the compliance
--   anchor for the Sprint 0 demo and for every sprint after it.
--
-- Append-only enforcement
--   UPDATE and DELETE are REVOKEd from app_role at the table level. The
--   audit service connects as a separate, more privileged role (the only
--   role that may INSERT). app_role can read but cannot mutate. This is
--   the database-level half of the append-only rule; the audit service
--   adds an application-level signature check on top.
--
-- Style: no em-dashes, no Oxford commas (docs/style-guide.md).
-- Idempotent. Safe to run multiple times.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS audit;

-- Ensure app_role exists in case 002 is applied to a database where 001
-- has not yet been run. Production deployments pre-provision this role
-- through their DBA tooling.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_role') THEN
        CREATE ROLE app_role NOLOGIN;
    END IF;
END $$;

-- ============================================================================
-- TABLE: audit.events
-- ============================================================================
-- One row per audited event. Writes are issued by the audit service only;
-- agents and application code never write here directly.
CREATE TABLE IF NOT EXISTS audit.events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary. Required for the eventual RLS migration.
    tenant_id         UUID NOT NULL,

    -- Workspace scope of the event. Nullable because some events (tenant
    -- wide policy reload, runtime startup) are not workspace scoped.
    workspace_id      UUID,

    -- Classification of who or what performed the action.
    actor_type        TEXT NOT NULL CHECK (actor_type IN (
                          'human',
                          'agent',
                          'service',
                          'routine',
                          'system'
                      )),

    -- Identifier of the actor. May be a user id, an agent_instance id, or
    -- a service handle depending on actor_type.
    actor_id          TEXT,

    -- Free form event identifier in dotted notation. See the controlled
    -- values block below for the canonical Sprint 0 set.
    event_type        TEXT NOT NULL,

    -- The fully qualified table the event targets, or NULL for events that
    -- are not row scoped.
    subject_table     TEXT,
    subject_id        UUID,

    -- JSONB snapshots of the affected row before and after the change.
    -- before_state is NULL on INSERT events; after_state is NULL on DELETE
    -- events. Snapshots are full rows, not diffs, so the audit replays
    -- without joining back to the source table.
    before_state      JSONB,
    after_state       JSONB,

    -- Free text justification. Required by convention for every gate
    -- decision and every status change.
    rationale         TEXT,

    -- Threads related events into one chain. One task or session shares
    -- one correlation_id across audit.events and the core tables.
    correlation_id    TEXT NOT NULL,

    -- The runtime that produced the event. TEXT NOT NULL so audit queries
    -- can always be sliced by runtime. Defaults to 'pre_execution' for
    -- events emitted before any runtime has been invoked (risk classifier,
    -- gate engine, manifest validation, schema rejection).
    runtime_provider  TEXT NOT NULL DEFAULT 'pre_execution',

    -- Optional cryptographic signature over the canonicalized row payload.
    -- Populated by deployments running the audit service in signing mode.
    signature         TEXT,
    signed_by         TEXT,

    -- Insertion timestamp. Immutable by virtue of the REVOKE below.
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by tenant plus time range, correlation thread, event
-- type histogram, and per row history. Each index below covers one of
-- those patterns.
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_time
    ON audit.events (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_correlation
    ON audit.events (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_event_type
    ON audit.events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_subject
    ON audit.events (subject_table, subject_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_runtime
    ON audit.events (runtime_provider, created_at DESC);

-- ============================================================================
-- APPEND-ONLY GRANTS
-- ============================================================================
-- app_role may SELECT and INSERT only. UPDATE and DELETE are explicitly
-- REVOKEd so that an application bug or a compromised app_role credential
-- cannot rewrite audit history.
GRANT USAGE ON SCHEMA audit TO app_role;
GRANT SELECT, INSERT ON audit.events TO app_role;
REVOKE UPDATE, DELETE ON audit.events FROM app_role;

-- ============================================================================
-- CONTROLLED VALUES
-- ============================================================================
-- The fields below are controlled in the Sprint 0 plan. New values are
-- added by a numbered migration plus a paired update to this comment block
-- and to docs/control-plane/audit-trail-patterns.md. Free text outside the
-- listed values is permitted only with an accompanying audit policy update.
--
-- actor_type (CHECK enforced):
--   human     -- end user or reviewer
--   agent     -- a workforce plane agent
--   service   -- e.g., Audit Service, Eval Telemetry, Deploy
--   routine   -- scheduled or event triggered routine
--   system    -- the runtime itself
--
-- event_type (convention, not enforced):
--   work_item.created
--   work_item.status_changed
--   work_item.assigned
--   approval.requested
--   approval.granted
--   approval.rejected
--   agent_run.started
--   agent_run.completed
--   qa.verdict_recorded
--   trust.score_recorded
--   trust.tier_changed
--   failure.recorded
--   failure.status_changed
--   policy.reloaded
--   hook.blocked
--
-- runtime_provider (convention, not enforced):
--   pre_execution    -- default; event emitted before any runtime ran
--   simulated        -- Sprint 0 simulated execution adapter (E0-09)
--   cli_claude       -- Claude Code CLI runtime
--   cli_codex        -- Codex CLI runtime
--   api_anthropic    -- direct Anthropic API runtime
--   api_openai       -- direct OpenAI API runtime
--   external         -- any runtime not in the controlled set; rationale required
-- ============================================================================

COMMIT;
