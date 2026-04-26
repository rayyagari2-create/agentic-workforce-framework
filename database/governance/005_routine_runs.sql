-- ============================================================================
-- TABLE: awf_governance.routine_runs
-- ============================================================================
-- Purpose
--   Log of every Routine execution: trigger type, context payload, result
--   summary, outcome classification, correlation ID. Routines are the
--   framework's automation plane — scheduled or event-triggered jobs that
--   run alongside the workforce but with lighter-weight governance than
--   full agents. This is the table the operator dashboard reads to show
--   "what has the automation done lately, and was it healthy?"
--
-- Ownership (writers)
--   The routine adapter is the only writer. Routines themselves do NOT
--   write to this table directly — they return, and the adapter logs
--   the run. This keeps the writer surface narrow so a misbehaving
--   routine cannot fabricate run records that imply work was done when
--   it was not.
--
--   Strict scope rule: a Routine NEVER writes to trust_scores or
--   failure_records directly. Routines that compute scoring payloads
--   forward them to the Eval/Telemetry Service, which performs the
--   trust_scores write under its own ownership rules. This boundary is
--   what keeps the automation plane from quietly becoming a back door
--   into the autonomy plane.
--
-- Append-only rule
--   Append-only by convention. The completed_at field is set by the
--   adapter when the routine returns, but the row's other columns are
--   not updated after the initial insert. (Some deployments perform a
--   single UPDATE to set result_summary / result_payload / completed_at /
--   outcome at completion time; either pattern is acceptable as long as
--   the row is not edited after that.)
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, tenant_id, workspace_id, routine_id, trigger_type, trigger_ref,
--     context_payload, fired_by, correlation_id, fired_at
--   Mutable until completion (set by the adapter when the routine
--   returns; not edited after that):
--     result_summary, result_payload, outcome, completed_at
--
-- Audit requirement
--   Every routine run that produces a notable side effect (PR comment,
--   Slack message, alert, scoring payload posted) emits a separate
--   audit_log row. The routine_runs row itself is the operational record;
--   the audit_log row is the compliance record.
--
-- Source
--   Section 5 Layer 8 (Control Plane) and Section 9 (Automation Plane)
--   of the reference architecture document; ADR-0002 ("routines are not
--   agents"); routines/README.md for routine definitions.
--
-- Status
--   v1.0 — ships at public launch.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS awf_governance;

-- How the routine was fired. The four trigger types map to the four
-- adapter integrations the framework supports out of the box.
DO $$ BEGIN
    CREATE TYPE routine_trigger_type AS ENUM (
        'schedule',  -- cron / recurring cadence
        'api',       -- HTTP endpoint fired by an external system
        'github',    -- pull_request / release / push event
        'manual'     -- operator-invoked one-shot
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The five outcomes a routine can finish in. 'cap_exceeded' means the
-- daily usage cap was hit and the run did NOT start; 'degraded' means
-- it ran but an external dependency (e.g., a third-party scanner) was
-- unavailable so the result is incomplete.
DO $$ BEGIN
    CREATE TYPE routine_outcome AS ENUM (
        'success',
        'failure',
        'partial',
        'cap_exceeded',
        'degraded'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS awf_governance.routine_runs (
    -- Synthetic primary key.
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Logical tenant boundary. Required for future RLS migration.
    tenant_id       UUID NOT NULL,

    -- Workspace scope. Nullable for tenant-wide routines that operate
    -- across all workspaces (e.g., a tenant-level usage report).
    workspace_id    UUID,

    -- The routine's stable identifier. Free string by convention. The
    -- framework ships R1 (PR test) and R4 (security scan); deployments
    -- add their own. Examples: 'R1-pr-test', 'R4-security-scan'.
    routine_id      TEXT NOT NULL,

    -- How this run was triggered. See routine_trigger_type.
    trigger_type    routine_trigger_type NOT NULL,

    -- Free-text reference to the trigger source. For 'github' this is
    -- typically the PR number or release tag; for 'schedule' it is the
    -- cron schedule ID; for 'api' it is the calling client name.
    trigger_ref     TEXT,

    -- The payload passed at fire time. Schema is per-routine. Stored
    -- as JSONB so individual fields can be queried later for forensics.
    context_payload JSONB,

    -- One-line human-readable summary of what the routine did or found.
    -- Set by the adapter on completion. Nullable until then.
    result_summary  TEXT,

    -- Structured result from the routine. Schema is per-routine. Stored
    -- as JSONB so dashboards can extract counts, file lists, etc.
    result_payload  JSONB,

    -- Outcome classification. Set by the adapter on completion. Nullable
    -- in deployments where the row is inserted at fire time and updated
    -- on completion; deployments that insert only on completion may
    -- treat this as effectively NOT NULL.
    outcome         routine_outcome NOT NULL,

    -- Identity that fired the routine — typically a service account, a
    -- GitHub app installation, or a human operator. Recorded by the
    -- adapter from the request context.
    fired_by        TEXT,

    -- Threads to the related task / session / workflow. Required so the
    -- routine's effect can be traced into the audit_log.
    correlation_id  TEXT NOT NULL,

    -- Insertion timestamp — when the run was fired (or accepted).
    fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Completion timestamp. NULL while the run is in flight; set by the
    -- adapter when the routine returns. Used for runtime latency dashboards.
    completed_at    TIMESTAMPTZ
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) per-routine recent-history dashboards,
-- (b) per-trigger-type reporting, (c) per-correlation reconstruction,
-- (d) per-outcome alerting (count of failures in last 24h).

-- Per-routine recent history: serves "show me the last N runs of R1".
CREATE INDEX IF NOT EXISTS idx_routine_runs_routine_time
    ON awf_governance.routine_runs (routine_id, fired_at DESC);

-- Per-trigger-type reporting: serves "how many GitHub-triggered runs
-- happened in the last 7 days".
CREATE INDEX IF NOT EXISTS idx_routine_runs_trigger
    ON awf_governance.routine_runs (trigger_type, fired_at DESC);

-- Correlation reconstruction: serves "what routines fired as part of
-- this task chain".
CREATE INDEX IF NOT EXISTS idx_routine_runs_correlation
    ON awf_governance.routine_runs (correlation_id);

-- Outcome alerting: serves "how many failure / cap_exceeded outcomes
-- in the last 24h" — primary input to the daily digest.
CREATE INDEX IF NOT EXISTS idx_routine_runs_outcome
    ON awf_governance.routine_runs (outcome, fired_at DESC);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE awf_governance.routine_runs IS
  'Log of each Routine execution. Writer: the routine adapter only. Routines never write to trust_scores or failure_records directly.';

COMMENT ON COLUMN awf_governance.routine_runs.outcome IS
  'success | failure | partial | cap_exceeded | degraded. cap_exceeded means the run did not start; degraded means it ran with a missing dependency.';

COMMENT ON COLUMN awf_governance.routine_runs.context_payload IS
  'Per-routine payload passed at fire time. JSONB for forensics; schema is per-routine.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — the routine adapter records the start of an R1
--    (PR test) run triggered by a GitHub pull_request event. The
--    completed_at and result fields are filled in by an UPDATE when
--    the routine returns; deployments that insert only on completion
--    will fill them in this same INSERT.
--
-- INSERT INTO awf_governance.routine_runs (
--     tenant_id, workspace_id, routine_id, trigger_type, trigger_ref,
--     context_payload, outcome, fired_by, correlation_id
-- ) VALUES (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-000000000010'::uuid,
--     'R1-pr-test',
--     'github',
--     'PR #1247',
--     '{"head_sha":"abcd1234","base":"main","branch":"claude/fix-login"}'::jsonb,
--     'success',
--     'github-app:automation-bot',
--     '01HJ8M00000000000000000000'
-- );
--
-- 2. Most common read — last 20 runs of one routine, newest first.
--    Served by idx_routine_runs_routine_time.
--
-- SELECT fired_at, completed_at, trigger_type, trigger_ref,
--        outcome, result_summary
--   FROM awf_governance.routine_runs
--  WHERE routine_id = $1
--  ORDER BY fired_at DESC
--  LIMIT 20;
--
-- 3. Health rollup — count of non-success outcomes per routine in the
--    last 24 hours. Used by the daily digest and as the alerting
--    threshold for "this routine is degraded". Served by
--    idx_routine_runs_outcome.
--
-- SELECT routine_id,
--        outcome,
--        COUNT(*) AS run_count
--   FROM awf_governance.routine_runs
--  WHERE fired_at >= NOW() - INTERVAL '24 hours'
--    AND outcome <> 'success'
--  GROUP BY routine_id, outcome
--  ORDER BY routine_id, outcome;
