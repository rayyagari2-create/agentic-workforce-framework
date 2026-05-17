-- ============================================================================
-- 003_audit_chain.sql
-- Sprint 0 audit hash chain. Extends 002_audit_schema.sql with the columns
-- the audit service needs to produce a tamper evident chain of events.
--
-- Scope
--   Four additive columns and one supporting index. No data is rewritten,
--   no existing column is dropped. Forward only per
--   database/migrations/README.md.
--
--   division_id    -- the second tier of the tenant tree. Required so the
--                     canonical hash payload can identify the division that
--                     emitted the event. Nullable, because some events
--                     (tenant wide policy reload, runtime startup) are not
--                     division scoped.
--   event_data     -- free form JSONB payload carried by the event. The
--                     canonicalizer in services/audit-service/src/hash.js
--                     sorts all keys here recursively before hashing.
--   previous_hash  -- the event_hash of the prior row in the chain, or NULL
--                     for the very first row. The audit service is the sole
--                     writer and serializes inserts so this value is
--                     unambiguous.
--   event_hash     -- sha256 of the canonicalized row including
--                     previous_hash. Indexed UNIQUE so a duplicate cannot
--                     enter the chain.
--
-- Append only enforcement is unchanged. UPDATE and DELETE remain REVOKEd on
-- audit.events from app_role (see 002_audit_schema.sql). The audit service
-- runs as a separate, more privileged role in production deployments.
--
-- Style: no em-dashes, no Oxford commas (docs/style-guide.md).
-- Idempotent. Safe to run multiple times.
-- ============================================================================

BEGIN;

ALTER TABLE audit.events
    ADD COLUMN IF NOT EXISTS division_id   UUID;

ALTER TABLE audit.events
    ADD COLUMN IF NOT EXISTS event_data    JSONB;

ALTER TABLE audit.events
    ADD COLUMN IF NOT EXISTS previous_hash TEXT;

ALTER TABLE audit.events
    ADD COLUMN IF NOT EXISTS event_hash    TEXT;

-- One hash, one row. The audit service computes the hash before insert; if
-- two writers ever try to register the same chain link the UNIQUE index
-- surfaces the collision instead of silently forking the chain.
CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_events_event_hash
    ON audit.events (event_hash);

-- Division scoped reads. The Sprint 0 demo runs against one division but
-- the index is cheap and avoids a follow up migration once a second
-- division appears.
CREATE INDEX IF NOT EXISTS idx_audit_events_division_time
    ON audit.events (division_id, created_at DESC);

COMMIT;
