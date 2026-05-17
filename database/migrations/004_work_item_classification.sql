-- ============================================================================
-- 004_work_item_classification.sql
-- E0-05: Risk classifier. Extends public.work_queue_items with the inputs
-- and outputs of the rule based classifier.
--
-- Columns added
--   labels      TEXT[] NOT NULL DEFAULT '{}'
--               Classifier input. Populated by the governance intake when a
--               ticket is upserted from the backlog file. Strings are the
--               GitHub Issues label names, lower cased by intake.
--   task_class  TEXT NULL
--               Classifier output. Written by the governance classifier
--               (services/governance/src/classifier.js). Nullable because a
--               freshly intaked row has not been classified yet.
--
-- Write authority
--   labels      governance intake     (services/governance/src/intake.js)
--   task_class  governance classifier (services/governance/src/classifier.js)
--
-- The risk_level column already exists from 001_core_schema.sql. The
-- classifier overwrites the placeholder 'LOW' that intake writes today.
-- That overwrite happens before the approval gate runs so the gate
-- decision is made against the classified risk, not the placeholder.
--
-- Idempotent. Safe to run multiple times.
-- ============================================================================

BEGIN;

ALTER TABLE public.work_queue_items
    ADD COLUMN IF NOT EXISTS labels      TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS task_class  TEXT;

COMMIT;
