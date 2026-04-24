-- agentforce_governance.routine_runs
-- Log of every Routine execution: trigger type, context payload, result, correlation ID.
-- Write authority: the routine adapter is the only writer. Routines themselves do NOT
--   write to this table directly — they return, and the adapter logs the run.
-- No Routine ever writes to trust_scores or failure_records directly. Routines that
--   compute scoring payloads forward them to the Eval/Telemetry Service.
--
-- Source: Section 5 Layer 8 + Section 9 of the Agentic Workforce Architecture
-- Status: v1.0 — ships at public launch.

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

CREATE TYPE routine_trigger_type AS ENUM (
    'schedule',       -- cron / recurring cadence
    'api',            -- HTTP endpoint fired by an external system
    'github',         -- pull_request / release event
    'manual'          -- operator-invoked one-shot
);

CREATE TYPE routine_outcome AS ENUM (
    'success',
    'failure',
    'partial',
    'cap_exceeded',   -- daily usage cap hit — run did not start
    'degraded'        -- ran but external dependency unavailable
);

CREATE TABLE IF NOT EXISTS agentforce_governance.routine_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    workspace_id    UUID,
    routine_id      TEXT NOT NULL,             -- e.g., 'R1-pr-test', 'R4-security-scan'
    trigger_type    routine_trigger_type NOT NULL,
    trigger_ref     TEXT,                      -- PR number, cron schedule ID, API client name, etc.
    context_payload JSONB,                     -- the `text` field (or equivalent) passed at fire time
    result_summary  TEXT,                      -- one-line human-readable summary
    result_payload  JSONB,                     -- structured result from the routine
    outcome         routine_outcome NOT NULL,
    fired_by        TEXT,                      -- identity that fired the routine (adapter records)
    correlation_id  TEXT NOT NULL,
    fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_routine_runs_routine_time
    ON agentforce_governance.routine_runs (routine_id, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_runs_trigger
    ON agentforce_governance.routine_runs (trigger_type, fired_at DESC);
CREATE INDEX IF NOT EXISTS idx_routine_runs_correlation
    ON agentforce_governance.routine_runs (correlation_id);
CREATE INDEX IF NOT EXISTS idx_routine_runs_outcome
    ON agentforce_governance.routine_runs (outcome, fired_at DESC);

COMMENT ON TABLE agentforce_governance.routine_runs IS
  'Log of each Routine execution. Writer: the routine adapter only. Routines do not write directly.';
