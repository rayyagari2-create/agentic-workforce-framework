# Database

SQL governance schemas for the Agentic Workforce Framework.
Postgres / Supabase compatible. Tested against Postgres 14+.

## Two layers, two ship dates

| Directory | Scope | Status |
| --- | --- | --- |
| [`governance/`](governance/) | Single-workspace governance plane audit log, agent events, trust scores, failure records, routine runs | **v1.0** ships at launch, run this first |
| [`enterprise/`](enterprise/) | Multi-workspace, divisions, queues, gate records, delegation rules | **v3.0** designed, not yet field-proven, do not deploy |

**Run `governance/` first for any deployment.** Enterprise tables presume
governance tables exist and emit audit events through them.

## Run order

The governance migrations are numbered and must run in order. Each file is
idempotent (`CREATE ... IF NOT EXISTS`) and can be rerun safely.

```bash
psql "$DATABASE_URL" -f database/governance/001_audit_log.sql
psql "$DATABASE_URL" -f database/governance/002_agent_events.sql
psql "$DATABASE_URL" -f database/governance/003_trust_scores.sql
psql "$DATABASE_URL" -f database/governance/004_failure_records.sql
psql "$DATABASE_URL" -f database/governance/005_routine_runs.sql
```

All tables live in the `awf_governance` schema.

`database/governance/999_enable_rls.example.sql` — Example Row
Level Security policies for all five governance tables. Status:
Reference Pattern. Run after migrations are stable. See file
header for prerequisites and testing guidance.

## Migration conventions

See [`migrations/README.md`](migrations/README.md) for full conventions.
The short version:

- **Forward-only.** No DOWN migrations. Roll forward through corrective
  migrations, never backward.
- **Append-only audit rule.** `audit_log` rows are immutable. Lifecycle
  mutations in other tables emit a new `audit_log` event rather than
  overwriting historical state.
- **One transaction per file** where the SQL allows.
- **Numbered prefix.** `NNN_description.sql`, zero-padded three digits.

## Postgres / Supabase compatibility

- Uses `gen_random_uuid()` (Postgres 13+, Supabase default).
- Uses `JSONB`, `TIMESTAMPTZ`, generated columns, and `CREATE TYPE ... AS ENUM`.
- No vendor extensions beyond `pgcrypto` for `gen_random_uuid()` if not built in.
- Schema name `awf_governance` is namespaced for safe coexistence with
  application tables.

## Write authority

Each table has a single declared writer. Misrouted writes are the most common
governance bug, so the rules are encoded in table-level comments:

| Table | Sole writer |
| --- | --- |
| `audit_log` | Hooks, runtime policy layer, and lifecycle triggers |
| `agent_events` | Agents during their own activity |
| `trust_scores` | Eval/Telemetry Service only agents never self-score |
| `failure_records` | Fix-Agent writes; QA-Agent flags |
| `routine_runs` | Routines write only here; the Eval/Telemetry Service consumes |

## RLS / multi-tenant note

Every table carries `tenant_id` even at single-workspace scale. Single-workspace
deployments may treat `tenant_id` as a constant. When you scale to multiple
tenants, enable Row Level Security with `tenant_id = current_setting('app.tenant_id')::uuid`
on every table at once.

## Status

- **v1.0** `governance/` ships at public launch.
- **v3.0** `enterprise/` is reserved. Do not implement until single-workspace
  governance is running reliably and the Division Orchestrator model has been
  validated.
