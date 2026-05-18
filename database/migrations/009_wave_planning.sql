-- ============================================================================
-- 009_wave_planning.sql
-- E1-03: Wave planner. Extends public.work_queue_items with the wave
-- assignment written by services/governance/src/wave-planner.js.
--
-- Columns added
--   wave_number  INTEGER NULL
--                Wave assignment from the planner. 1 = safe for parallel
--                execution, 2 = must be sequenced due to file conflicts.
--                Nullable because intake/classify run before the planner;
--                an item that has not been planned has no wave yet.
--
-- Write authority
--   wave_number  governance wave planner
--                (services/governance/src/wave-planner.js)
--
-- Idempotent. Safe to run multiple times.
-- ============================================================================

BEGIN;

ALTER TABLE public.work_queue_items
    ADD COLUMN IF NOT EXISTS wave_number INTEGER;

COMMIT;
