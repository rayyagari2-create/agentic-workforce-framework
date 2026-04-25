# Migrations

Conventions for evolving the governance database schema over time.

## Forward-only

There are **no DOWN migrations** in this framework. The reasons:

1. Audit data is append-only. A DOWN migration that drops or alters
   `audit_log`-derived structure threatens the compliance anchor.
2. Trust history is cumulative. Trust tier promotions and demotions are
   meaningful only against an unbroken history of D1-D4 records.
3. Real production failures are recovered by rolling **forward** through a
   corrective migration, not by rolling back. Rolling back hides the failure;
   rolling forward records it.

If a migration introduces a bug, write a new numbered migration that
corrects it. The bug and its fix both stay in the history.

## Append-only audit rule

This is the absolute rule of the framework:

- **No `UPDATE` and no `DELETE` on `awf_governance.audit_log`. Ever.**
- This is enforced at the table level by a trigger that raises on
  `BEFORE UPDATE OR DELETE`. Do not work around the trigger.
- Lifecycle mutations in other tables (e.g., `failure_records.status`
  transitioning from `open` to `resolved`) MUST emit a new `audit_log`
  event capturing `before_state` and `after_state`. The original row in
  `failure_records` is updated; the historical state lives in `audit_log`.
- `agent_events` is append-only by convention but not by trigger agents
  insert one row per event and never edit prior rows.

## File naming

```
NNN_description.sql
```

- `NNN` is a zero-padded three-digit prefix, monotonically increasing per
  directory (`governance/` and `enterprise/` are numbered independently).
- `description` uses lower-case `snake_case` and names the dominant table
  or change (e.g., `004_failure_records.sql`, `006_add_index_on_correlation.sql`).
- Each file is idempotent where possible (`CREATE TABLE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`, guarded `CREATE TYPE`).

## One transaction per file

Wrap each migration in a single transaction where the SQL allows. The
exceptions are documented in the file's header comment:

- `CREATE TYPE ... AS ENUM` and `CREATE INDEX CONCURRENTLY` cannot run inside
  a transaction in Postgres. Files that use these run statement-by-statement.
- Idempotent guards (`IF NOT EXISTS`) cover the partial-application case for
  these statements.

## Header comment

Every migration file starts with a header that names:

1. The fully-qualified table or type being created.
2. The write authority (which agent role, service, or routine is the
   sanctioned writer).
3. The architecture section the table comes from (e.g., "Layer 8" of the
   reference architecture document).
4. The status label (`v1.0`, `v3.0`, etc.).

This header is the primary reading aid. A reader should know within five
seconds who writes to the table and where the design originated.

## What never goes in a migration

- Application data seeds those belong in a separate `seed/` directory if
  ever needed. Migrations are schema only.
- `tenant_id` constants single-workspace deployments treat `tenant_id` as
  application-level configuration, not as a database default.
- Vendor-specific extensions beyond `pgcrypto`. The framework ships
  Postgres / Supabase compatible SQL.
- Anything that touches the `audit_log` data the table structure is
  fixed at v1.0 and any change requires a new schema version path, not a
  migration.

## Status

- **v1.0** conventions current. Apply to all migrations going forward.
