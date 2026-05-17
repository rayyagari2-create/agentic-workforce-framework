// ============================================================================
// services/audit-service/src/hash.js
// Sprint 0 hash chain for audit.events. Implements the canonicalizer,
// per-event hash, and end to end chain verifier called by `awf audit verify`.
//
// Contract
//   computeEventHash(event, previousHash) -> hex sha256
//     The hash covers every immutable, semantically meaningful field on the
//     event PLUS the previous_hash. division_id and runtime_provider are
//     part of the canonical payload by requirement; runtime_provider is
//     defaulted to 'pre_execution' when absent so events emitted before any
//     runtime ran hash deterministically.
//
//   verifyChain(rows) -> { ok, count, brokenAt?, expected?, actual?, reason? }
//     rows must be ordered (created_at ASC, id ASC). Walks the list,
//     recomputes each hash, and confirms previous_hash threads through.
//
// canonicalize(value)
//   Recursive. Objects are emitted with their keys sorted alphabetically at
//   every depth, INCLUDING nested objects under event_data. Arrays preserve
//   order. Primitives are JSON encoded. The output is a string suitable for
//   feeding into a hash function. We do not use JSON.stringify with a sort
//   replacer because that only sorts the top level keys; the Sprint Plan
//   requires recursive sort.
// ============================================================================

import crypto from 'node:crypto';

export function canonicalize(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new TypeError('canonicalize: non finite number');
        }
        return JSON.stringify(value);
    }
    if (typeof value === 'boolean' || typeof value === 'string') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(canonicalize).join(',') + ']';
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k]));
        return '{' + parts.join(',') + '}';
    }
    throw new TypeError(`canonicalize: unsupported type ${typeof value}`);
}

function normalizeTimestamp(ts) {
    if (ts === null || ts === undefined) return null;
    if (ts instanceof Date) return ts.toISOString();
    return String(ts);
}

// The set of fields covered by the hash. Adding a field here is a chain
// breaking change and requires a new migration plus a chain re sign.
const HASHED_FIELDS = [
    'tenant_id',
    'division_id',
    'workspace_id',
    'actor_type',
    'actor_id',
    'event_type',
    'subject_table',
    'subject_id',
    'before_state',
    'after_state',
    'event_data',
    'rationale',
    'correlation_id',
    'runtime_provider',
    'created_at',
];

export function computeEventHash(event, previousHash) {
    const payload = {};
    for (const f of HASHED_FIELDS) {
        if (f === 'created_at') {
            payload[f] = normalizeTimestamp(event[f]);
        } else if (f === 'runtime_provider') {
            payload[f] = event[f] ?? 'pre_execution';
        } else {
            payload[f] = event[f] ?? null;
        }
    }
    payload.previous_hash = previousHash ?? null;

    const canonical = canonicalize(payload);
    return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function verifyChain(rows) {
    let prev = null;
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const declaredPrev = row.previous_hash ?? null;
        if (declaredPrev !== prev) {
            return {
                ok: false,
                count: i,
                brokenAt: row.id,
                reason: 'previous_hash does not match prior row event_hash',
                expected: prev,
                actual: declaredPrev,
            };
        }

        const expected = computeEventHash(row, prev);
        if (expected !== row.event_hash) {
            return {
                ok: false,
                count: i,
                brokenAt: row.id,
                reason: 'event_hash recomputation mismatch',
                expected,
                actual: row.event_hash,
            };
        }

        prev = row.event_hash;
    }
    return { ok: true, count: rows.length, head: prev };
}
