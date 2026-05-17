-- ============================================================================
-- 005_work_queue_claim.sql
-- E0-06: Priority queue claim semantics.
--
-- Extends work_queue_status with two new lifecycle states that bracket the
-- claim performed by services/governance/src/queue.js, and adds the
-- claimed_at timestamp the queue uses to detect stale claims.
--
-- Enum values added
--   'classified'  Risk classifier (E0-05) has run; the item is eligible for
--                 the priority queue to claim it (unless risk_level is
--                 'CRITICAL', in which case the approval gate handles it).
--   'planned'     The priority queue (E0-06) has claimed the item. claimed_at
--                 is now set. A planner / agent will pick it up from here.
--
-- Column added
--   claimed_at    TIMESTAMPTZ NULL
--                 NOW() at the moment the queue claimed the row. NULL on
--                 freshly classified rows. A claim is considered stale and
--                 re-claimable once claimed_at < NOW() - INTERVAL '30 minutes'.
--
-- Write authority
--   status, claimed_at   governance queue (services/governance/src/queue.js)
--
-- Notes
--   ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
--   Postgres, so the enum additions are issued as bare statements. The
--   column add stands alone after that. IF NOT EXISTS guards make the file
--   idempotent: re-running it on a database where the values or column
--   already exist is a no-op.
-- ============================================================================

ALTER TYPE work_queue_status ADD VALUE IF NOT EXISTS 'classified';
ALTER TYPE work_queue_status ADD VALUE IF NOT EXISTS 'planned';

ALTER TABLE public.work_queue_items
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
