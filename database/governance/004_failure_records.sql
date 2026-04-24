-- agentforce_governance.failure_records
-- Structured failure record store for the self-learning system.
-- Mirrors schemas/v1/failure-record.schema.json — keep in sync.
-- Write authority: Fix-Agent writes. QA-Agent flags. No other role writes.
--
-- Source: Section 5 Layer 3 + Layer 8 of the Agentic Workforce Architecture
-- Status: v1.0 — ships at public launch.

CREATE SCHEMA IF NOT EXISTS agentforce_governance;

CREATE TYPE failure_class AS ENUM (
    'schema_violation',
    'state_desync',
    'render_error',
    'api_contract_break',
    'date_time_handling',
    'null_reference',
    'race_condition',
    'prompt_regression',
    'data_loss',
    'security_vulnerability',
    'performance_degradation',
    'ux_regression',
    'truth_ownership',
    'client_side_truth',
    'policy_violation',
    'scope_violation',
    'hook_bypass'
);

CREATE TYPE failure_severity   AS ENUM ('P0','P1','P2','P3');
CREATE TYPE failure_status     AS ENUM ('open','investigating','fix_in_progress','resolved','wont_fix');
CREATE TYPE failure_fix_tag    AS ENUM ('hotfix-only','hotfix-plus-prevention','systemic-refactor-required');
CREATE TYPE failure_detection  AS ENUM ('qa_agent','fix_agent','human_reviewer','automated_test','runtime_monitoring','user_report');

CREATE TABLE IF NOT EXISTS agentforce_governance.failure_records (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    failure_id             TEXT NOT NULL UNIQUE
                             CHECK (failure_id ~ '^FAIL-\d{4}-\d{2}-\d{2}-\d{3}$'),
    tenant_id              UUID NOT NULL,
    workspace_id           UUID,
    timestamp              TIMESTAMPTZ NOT NULL,
    domain                 TEXT NOT NULL,
    agents_involved        TEXT[] NOT NULL,
        -- expected role values: 'orchestrator' | 'qa-agent' | 'fix-agent' | 'executor' | 'reviewer'
    files                  TEXT[] NOT NULL,
    symptom                TEXT NOT NULL,
    root_cause             TEXT NOT NULL,
    root_cause_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
    failure_class_value    failure_class NOT NULL,
    severity               failure_severity NOT NULL,
    user_impact            TEXT NOT NULL,
    detection_source       failure_detection NOT NULL,
    recommended_prevention TEXT,
    regression_test_added  BOOLEAN NOT NULL DEFAULT FALSE,
    prevention_artifacts   JSONB,
        -- array of {type, location, description} — at least one required before closure
    recurrence_count       INTEGER NOT NULL CHECK (recurrence_count >= 1),
    repeat_of_failure_ids  TEXT[],
    status                 failure_status NOT NULL DEFAULT 'open',
    fix_tag                failure_fix_tag NOT NULL,
    correlation_id         TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failure_records_class_count
    ON agentforce_governance.failure_records (failure_class_value, recurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_failure_records_domain_files
    ON agentforce_governance.failure_records USING GIN (files);
CREATE INDEX IF NOT EXISTS idx_failure_records_status
    ON agentforce_governance.failure_records (status, severity);
CREATE INDEX IF NOT EXISTS idx_failure_records_correlation
    ON agentforce_governance.failure_records (correlation_id);

-- Recurrence escalation rules (enforced at application layer):
--   recurrence_count >= 2: auto-promote for systemic flag review
--   recurrence_count >= 3: benchmark test addition required
--   recurrence_count >= 5: systemic-refactor-required becomes unavoidable

COMMENT ON TABLE agentforce_governance.failure_records IS
  'Structured failure records. Fix-Agent is the sole writer. QA-Agent flags; no other agent writes.';
