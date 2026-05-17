// services/audit-service/src/db.js
//
// Pooled Postgres client for the audit service. The service is the only
// writer of audit.events; readers may select but UPDATE and DELETE are
// REVOKEd on app_role at the table level (002_audit_schema.sql).

import pg from 'pg';
import { databaseUrl } from './env.js';

const { Pool } = pg;

let _pool = null;

export function getPool() {
    if (_pool) return _pool;
    _pool = new Pool({ connectionString: databaseUrl() });
    return _pool;
}

export async function closePool() {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}

const INSERT_SQL = `
    INSERT INTO audit.events (
        tenant_id, division_id, workspace_id,
        actor_type, actor_id,
        event_type, subject_table, subject_id,
        before_state, after_state, event_data,
        rationale, correlation_id, runtime_provider,
        signature, signed_by,
        created_at, previous_hash, event_hash
    ) VALUES (
        $1, $2, $3,
        $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16,
        $17, $18, $19
    )
    RETURNING id, created_at, event_hash
`;

export async function insertEvent(event) {
    const pool = getPool();
    const result = await pool.query(INSERT_SQL, [
        event.tenant_id,
        event.division_id ?? null,
        event.workspace_id ?? null,
        event.actor_type,
        event.actor_id ?? null,
        event.event_type,
        event.subject_table ?? null,
        event.subject_id ?? null,
        event.before_state ?? null,
        event.after_state ?? null,
        event.event_data ?? null,
        event.rationale ?? null,
        event.correlation_id,
        event.runtime_provider ?? 'pre_execution',
        event.signature ?? null,
        event.signed_by ?? null,
        event.created_at,
        event.previous_hash ?? null,
        event.event_hash,
    ]);
    return result.rows[0];
}

export async function getLatestHash() {
    const pool = getPool();
    const r = await pool.query(
        'SELECT event_hash FROM audit.events ORDER BY created_at DESC, id DESC LIMIT 1',
    );
    return r.rows[0]?.event_hash ?? null;
}

// Reads the full chain in deterministic order. Used by `awf audit verify`.
// One pass over the table is fine for Sprint 0 volumes; later sprints can
// add a cursor based reader.
export async function getAllEventsOrdered() {
    const pool = getPool();
    const r = await pool.query(`
        SELECT id, tenant_id, division_id, workspace_id,
               actor_type, actor_id,
               event_type, subject_table, subject_id,
               before_state, after_state, event_data,
               rationale, correlation_id, runtime_provider,
               signature, signed_by,
               created_at, previous_hash, event_hash
          FROM audit.events
         ORDER BY created_at ASC, id ASC
    `);
    return r.rows;
}
