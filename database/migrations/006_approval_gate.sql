-- ============================================================================
-- 006_approval_gate.sql
-- E0-07: Single approval gate.
--
-- Extends the schema with the bits the Sprint 0 approval gate needs that
-- 001_core_schema.sql did not yet have:
--
-- Enum value added
--   work_queue_status: 'blocked'
--       Terminal status for a work item whose approval request was
--       rejected. Distinct from 'rejected' (reserved for later sprint
--       semantics) so a reader can tell at a glance that the item failed
--       the human approval gate, not some other check.
--
-- Column added
--   approval_requests.required_role  TEXT NULL
--       The role expected to approve the request (e.g., 'engineering_lead',
--       'security_reviewer'). The Sprint 0 gate records this at request
--       time so the demo can surface "who needs to approve this" without a
--       second lookup. Nullable so legacy rows (none today) stay valid.
--
-- Write authority
--   status, required_role   governance approvals (services/governance/src/approvals.js)
--
-- Notes
--   ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
--   Postgres, so the enum addition is issued as a bare statement. The
--   column add stands alone after that. IF NOT EXISTS guards make the file
--   idempotent.
-- ============================================================================

ALTER TYPE work_queue_status ADD VALUE IF NOT EXISTS 'blocked';

ALTER TABLE public.approval_requests
    ADD COLUMN IF NOT EXISTS required_role TEXT;
