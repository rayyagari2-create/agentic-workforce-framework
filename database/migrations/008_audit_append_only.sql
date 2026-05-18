-- Make event_hash non-nullable
ALTER TABLE audit.events
  ALTER COLUMN event_hash SET NOT NULL;

-- Append-only trigger: prevent any UPDATE or DELETE
CREATE OR REPLACE FUNCTION audit.prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit.events is append-only. No updates or deletes permitted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON audit.events;

CREATE TRIGGER trg_prevent_audit_mutation
BEFORE UPDATE OR DELETE ON audit.events
FOR EACH ROW EXECUTE FUNCTION audit.prevent_audit_mutation();
