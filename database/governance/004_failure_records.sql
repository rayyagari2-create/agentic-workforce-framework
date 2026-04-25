-- ============================================================================
-- TABLE: awf_governance.failure_records
-- ============================================================================
-- Purpose
--   Structured failure record store — the framework's institutional
--   incident system. Every agent failure that gets investigated produces
--   one row here, classified into one of seventeen taxonomy classes,
--   with a recurrence count and at least one prevention artifact before
--   the record can close. The Fix Agent reads this table at pre-spawn to
--   surface relevant prior failures so the same mistake is not repeated.
--
-- Ownership (writers)
--   - Fix Agent is the sole writer. The Fix Agent owns the root_cause
--     field because that is the outcome of investigation.
--   - QA Agent flags potential failures and provides the symptom and
--     detection_source — but the QA Agent does not write the record.
--   - No other role writes here. This rule prevents the failure library
--     from devolving into a free-form log of every agent's theory of
--     what went wrong.
--
-- Append-only rule
--   Lifecycle-mutable, not append-only. The record itself moves through
--   the status enum (open → investigating → fix_in_progress → resolved
--   or wont_fix). Each transition emits an audit_log row capturing the
--   before/after state. The historical state lives in audit_log; the
--   current state lives here. Status may NOT skip from 'open' directly
--   to 'resolved' — it must pass through 'investigating' and
--   'fix_in_progress', enforced at the application layer.
--
-- Mutable vs immutable fields
--   Immutable once written:
--     id, failure_id, tenant_id, workspace_id, timestamp, domain,
--     agents_involved, files, symptom, failure_class_value, severity,
--     user_impact, detection_source, recurrence_count, repeat_of_failure_ids,
--     created_at
--   Mutable across the record's lifecycle (each change emits an audit_log
--   row with before_state / after_state):
--     root_cause, root_cause_confirmed, recommended_prevention,
--     regression_test_added, prevention_artifacts, status, fix_tag,
--     correlation_id, updated_at
--
-- Audit requirement
--   Every UPDATE to a mutable field emits an audit_log row with
--   event_type = 'failure_record.updated' (or a more specific subtype
--   such as 'failure_record.status_changed' for status transitions),
--   carrying before_state and after_state JSONB snapshots. INSERT emits
--   event_type = 'failure_record.created'.
--
-- Closure requirements (enforced at the application layer)
--   A record cannot transition to status = 'resolved' unless ALL of:
--     1. root_cause_confirmed = true
--     2. prevention_artifacts is a non-empty JSONB array
--     3. fix_tag is set to one of the three completion classifications
--   Either status = 'wont_fix' is permitted only with a documented
--   rationale recorded in the audit_log.
--
-- Recurrence escalation rules (enforced at the application layer)
--   recurrence_count >= 2 → auto-promote: failure class is flagged in
--                           the agent's instruction file.
--   recurrence_count >= 3 → benchmark: a regression test exercising the
--                           pattern is added.
--   recurrence_count >= 5 → systemic refactor required: fix_tag becomes
--                           systemic-refactor-required and stays open
--                           until structural change ships.
--
-- Source
--   Section 5 Layer 3 (Autonomy Plane) and Layer 8 (Control Plane) of
--   the reference architecture document; docs/concepts/failure-memory.md;
--   schemas/v1/failure-record.schema.json (keep in sync).
--
-- Status
--   v1.0 — ships at public launch.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS awf_governance;

-- The 17-class failure taxonomy. Fixed in v1.0; adding a new class
-- requires a schema version change. Each class definition lives in
-- docs/concepts/failure-memory.md.
DO $$ BEGIN
    CREATE TYPE failure_class AS ENUM (
        'schema_violation',         -- output did not match the declared schema
        'state_desync',             -- two systems that should agree held different values
        'render_error',             -- frontend/output renderer crashed or produced unreadable output
        'api_contract_break',       -- integration call failed because contract no longer holds
        'date_time_handling',       -- timezone, DST, locale, or date arithmetic error
        'null_reference',           -- code dereferenced a null/undefined value
        'race_condition',           -- two operations interleaved in an unguarded order
        'prompt_regression',        -- instruction/prompt change degraded previously working cases
        'data_loss',                -- a write was lost, overwritten, or never persisted
        'security_vulnerability',   -- exploitable vector — secret in code, missing sanitization, etc.
        'performance_degradation',  -- latency / throughput / resource use moved outside envelope
        'ux_regression',            -- previously working user-facing flow now produces worse UX
        'truth_ownership',          -- component wrote to a store another component owns
        'client_side_truth',        -- authoritative state held client-side instead of server-side
        'policy_violation',         -- broke a documented policy rule
        'scope_violation',          -- wrote outside the agent's documented file scope
        'hook_bypass'               -- circumvented a runtime hook (PreToolUse / PostToolUse)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Severity bands. P0 is "stop everything", P3 is "schedule a fix".
DO $$ BEGIN
    CREATE TYPE failure_severity AS ENUM ('P0','P1','P2','P3');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lifecycle status. Transitions are documented above and enforced in app.
DO $$ BEGIN
    CREATE TYPE failure_status AS ENUM (
        'open',             -- detected, not yet investigated
        'investigating',    -- root cause being identified
        'fix_in_progress',  -- fix is being implemented
        'resolved',         -- fix complete + prevention artifact + regression test
        'wont_fix'          -- explicitly chosen not to fix; requires rationale
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Three-valued completion classification. Most fixes should end at
-- 'hotfix-plus-prevention'. 'hotfix-only' is for triage and should flip
-- before the record closes. 'systemic-refactor-required' keeps the record
-- open until structural change ships.
DO $$ BEGIN
    CREATE TYPE failure_fix_tag AS ENUM (
        'hotfix-only',
        'hotfix-plus-prevention',
        'systemic-refactor-required'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Where the failure was detected.
DO $$ BEGIN
    CREATE TYPE failure_detection AS ENUM (
        'qa_agent',
        'fix_agent',
        'human_reviewer',
        'automated_test',
        'runtime_monitoring',
        'user_report'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS awf_governance.failure_records (
    -- Synthetic primary key.
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stable human-readable identifier in the form FAIL-YYYY-MM-DD-NNN.
    -- UNIQUE so it can be referenced from agent instructions, PR
    -- descriptions, and incident write-ups without ambiguity. The CHECK
    -- enforces the format so external references stay machine-parseable.
    failure_id             TEXT NOT NULL UNIQUE
                             CHECK (failure_id ~ '^FAIL-\d{4}-\d{2}-\d{2}-\d{3}$'),

    -- Logical tenant boundary. Required for future RLS migration.
    tenant_id              UUID NOT NULL,

    -- Workspace scope. Nullable for tenant-wide failures.
    workspace_id           UUID,

    -- When the failure occurred (not when the row was inserted). Distinct
    -- from created_at because investigation may begin hours after the
    -- failure surfaced.
    timestamp              TIMESTAMPTZ NOT NULL,

    -- Domain tag, free string. Matches the domain field on trust_scores
    -- and on AgentTaskManifests so that pre-task retrieval can match
    -- by domain.
    domain                 TEXT NOT NULL,

    -- Array of agent role identifiers involved in the failure. Free
    -- strings by convention, matching the agent_role values used in
    -- agent_events and trust_scores.
    agents_involved        TEXT[] NOT NULL,

    -- File paths in scope when the failure occurred. Used for pre-task
    -- retrieval matching ("any prior failures touching these files?").
    files                  TEXT[] NOT NULL,

    -- Observable symptom as seen by a user, by QA, or by a monitor.
    -- Required: a failure with no symptom is a hypothesis, not a record.
    symptom                TEXT NOT NULL,

    -- Confirmed root cause after investigation. Mutable: the value at
    -- INSERT may be a hypothesis; once root_cause_confirmed flips true,
    -- the value is the verified cause.
    root_cause             TEXT NOT NULL,

    -- True only after the root cause has been verified, not just
    -- hypothesized. Required true for a record to close as 'resolved'.
    root_cause_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,

    -- One of the seventeen taxonomy classes. Named with _value suffix
    -- because failure_class is the type name.
    failure_class_value    failure_class NOT NULL,

    -- P0 / P1 / P2 / P3.
    severity               failure_severity NOT NULL,

    -- Plain-English description of impact on the end user. Required so
    -- the severity assignment can be sanity-checked against a real story.
    user_impact            TEXT NOT NULL,

    -- Where the failure was detected.
    detection_source       failure_detection NOT NULL,

    -- Recommendation for prevention, free text. Mutable.
    recommended_prevention TEXT,

    -- True when a regression test exercising the failure was added.
    -- Required true for closure when fix_tag = 'hotfix-plus-prevention'.
    regression_test_added  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Array of {type, location, description} JSON objects. At least one
    -- non-empty entry is required before status may transition to
    -- 'resolved' (enforced at the application layer).
    prevention_artifacts   JSONB,

    -- Number of times this failure_class has occurred to date. The
    -- INSERT path computes this as (count of prior records with the
    -- same class) + 1. Drives the recurrence escalation rules above.
    -- CHECK >= 1 because the row itself counts as the first occurrence.
    recurrence_count       INTEGER NOT NULL CHECK (recurrence_count >= 1),

    -- Array of failure_id references for prior records of the same class.
    -- Populated at INSERT from the recurrence query.
    repeat_of_failure_ids  TEXT[],

    -- Lifecycle status. See failure_status enum.
    status                 failure_status NOT NULL DEFAULT 'open',

    -- Completion classification. See failure_fix_tag enum.
    fix_tag                failure_fix_tag NOT NULL,

    -- Threads to the originating session. Same correlation_id as the
    -- corresponding rows in audit_log, agent_events, work_queue_items.
    correlation_id         TEXT,

    -- Insertion timestamp. Immutable.
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Last-update timestamp. Application is responsible for setting this
    -- on every UPDATE; a future migration may add a trigger.
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Reads are dominated by: (a) recurrence detection at INSERT time —
-- "how many prior records with this failure_class for this domain?",
-- (b) pre-task retrieval — "any prior records touching these files?",
-- (c) operational triage — "what is open at P0/P1?", (d) per-correlation
-- reconstruction.

-- Recurrence detection: serves the INSERT-time query that computes
-- recurrence_count. Ordered by recurrence_count DESC so the highest-
-- recurrence record of each class can be found quickly.
CREATE INDEX IF NOT EXISTS idx_failure_records_class_count
    ON awf_governance.failure_records (failure_class_value, recurrence_count DESC);

-- Pre-task retrieval by file path: GIN over the files array supports
-- the @> containment query that the pre-spawn protocol uses.
CREATE INDEX IF NOT EXISTS idx_failure_records_domain_files
    ON awf_governance.failure_records USING GIN (files);

-- Operational triage: serves "what open failures at P0/P1 exist?"
-- (status, severity) is the natural ordering on the on-call dashboard.
CREATE INDEX IF NOT EXISTS idx_failure_records_status
    ON awf_governance.failure_records (status, severity);

-- Per-correlation reconstruction: serves "all failures from this session".
CREATE INDEX IF NOT EXISTS idx_failure_records_correlation
    ON awf_governance.failure_records (correlation_id);

-- ============================================================================
-- TABLE / COLUMN COMMENTS
-- ============================================================================
COMMENT ON TABLE awf_governance.failure_records IS
  'Structured failure records. Fix Agent is the sole writer; QA Agent flags. Classifications fixed in v1.0 (17 classes).';

COMMENT ON COLUMN awf_governance.failure_records.failure_id IS
  'Stable human-readable ID in the form FAIL-YYYY-MM-DD-NNN. UNIQUE; format enforced by CHECK.';

COMMENT ON COLUMN awf_governance.failure_records.recurrence_count IS
  'Count of prior records with the same failure_class plus this one. Drives auto-promotion at >=2, benchmark at >=3, systemic refactor at >=5.';

COMMENT ON COLUMN awf_governance.failure_records.prevention_artifacts IS
  'Array of {type, location, description}. At least one entry is required before status may transition to resolved.';

-- ============================================================================
-- EXAMPLE QUERIES
-- ============================================================================
--
-- 1. Typical write — Fix Agent records an investigated failure. The
--    recurrence_count is computed from the recurrence query (example 3
--    below) and the repeat_of_failure_ids is built from the same query's
--    result set.
--
-- INSERT INTO awf_governance.failure_records (
--     failure_id, tenant_id, workspace_id, timestamp, domain,
--     agents_involved, files, symptom, root_cause, root_cause_confirmed,
--     failure_class_value, severity, user_impact, detection_source,
--     recommended_prevention, regression_test_added, prevention_artifacts,
--     recurrence_count, repeat_of_failure_ids,
--     status, fix_tag, correlation_id
-- ) VALUES (
--     'FAIL-2026-04-24-007',
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-000000000010'::uuid,
--     '2026-04-24T14:32:00Z'::timestamptz,
--     'auth',
--     ARRAY['backend-agent','qa-agent']::text[],
--     ARRAY['src/api/login.ts','src/lib/session.ts']::text[],
--     'Session token returned in URL fragment after redirect.',
--     'Server-side redirect handler did not strip token from query string before encoding fragment.',
--     true,
--     'security_vulnerability',
--     'P1',
--     'Token visible in browser history; could be exfiltrated by malicious extension.',
--     'qa_agent',
--     'Add server-side strip of token query before redirect; add unit test on redirect handler.',
--     true,
--     '[{"type":"regression_test","location":"tests/api/login.test.ts","description":"Asserts token absent from final URL"}]'::jsonb,
--     2,
--     ARRAY['FAIL-2025-11-12-003']::text[],
--     'fix_in_progress',
--     'hotfix-plus-prevention',
--     '01HJ8M00000000000000000000'
-- );
--
-- 2. Most common read — pre-task retrieval. Find every prior failure
--    that touched any of the files in scope for the upcoming task.
--    Served by idx_failure_records_domain_files (GIN).
--
-- SELECT failure_id, failure_class_value, severity, symptom, root_cause,
--        recurrence_count, prevention_artifacts
--   FROM awf_governance.failure_records
--  WHERE tenant_id = $1
--    AND files && $2::text[]   -- $2 is the array of files in scope
--  ORDER BY timestamp DESC
--  LIMIT 50;
--
-- 3. Recurrence detection at INSERT time — how many prior records with
--    this failure_class for this domain exist? The result count + 1
--    becomes the new row's recurrence_count, and the result IDs become
--    repeat_of_failure_ids. Served by idx_failure_records_class_count.
--
-- SELECT failure_id, timestamp, files, root_cause
--   FROM awf_governance.failure_records
--  WHERE tenant_id            = $1
--    AND failure_class_value  = $2
--    AND domain               = $3
--  ORDER BY timestamp DESC;
