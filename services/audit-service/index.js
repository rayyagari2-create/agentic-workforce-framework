#!/usr/bin/env node
// ============================================================================
// services/audit-service/index.js
// Sprint 0 audit service. A separate Node process that owns audit.events.
//
// Architecture
//   Two ingress paths feed one writer.
//
//     1. EventEmitter (in process). Exported as `auditBus`. The Sprint 0
//        main workflow imports this module and calls
//        `auditBus.emit('audit:event', payload)`. This is the contract the
//        runtime, gate engine, and risk classifier write against.
//
//     2. HTTP POST /events (cross process). Allows hooks and other
//        languages or processes to feed the same bus over the wire. The
//        HTTP handler simply re emits onto `auditBus`, so the writer code
//        path is identical regardless of ingress.
//
//   The writer (services/audit-service/src/writer.js) subscribes to the bus,
//   serializes inserts on a single promise chain, computes the per row
//   event_hash including the previous row's event_hash, and inserts into
//   audit.events. No code path bypasses the bus.
//
// Append only guarantee
//   audit.events has UPDATE and DELETE REVOKEd from app_role at the table
//   level (002_audit_schema.sql). The audit service inherits the same
//   restriction by virtue of using the DATABASE_URL credentials; it never
//   issues an UPDATE or DELETE against audit.events.
//
// Started with
//   node services/audit-service/index.js
//
// Environment
//   DATABASE_URL   required; read from .env at the repo root or the shell.
//   AUDIT_PORT     optional; defaults to 8787.
// ============================================================================

import http from 'node:http';
import { auditBus, pendingWrites } from './src/writer.js';
import { getPool, closePool } from './src/db.js';

const PORT = parseInt(process.env.AUDIT_PORT || '8787', 10);

async function readJson(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            try {
                const raw = Buffer.concat(chunks).toString('utf8');
                resolve(raw ? JSON.parse(raw) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

function send(res, status, body) {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
        try {
            await getPool().query('SELECT 1');
            return send(res, 200, { status: 'ok' });
        } catch (e) {
            return send(res, 503, { status: 'error', error: e.message });
        }
    }

    if (req.method === 'POST' && req.url === '/events') {
        let event;
        try {
            event = await readJson(req);
        } catch (e) {
            return send(res, 400, { error: 'invalid json: ' + e.message });
        }
        await new Promise((resolve) => {
            auditBus.emit(
                'audit:event',
                event,
                {
                    onWritten: (row) => {
                        send(res, 201, { id: row.id, event_hash: row.event_hash });
                        resolve();
                    },
                    onError: (err) => {
                        send(res, 500, { error: err.message });
                        resolve();
                    },
                },
            );
        });
        return;
    }

    send(res, 404, { error: 'not found' });
});

async function main() {
    // Fail fast if the database is unreachable. Booting a silent audit
    // service is the worst possible failure mode.
    await getPool().query('SELECT 1');

    server.listen(PORT, () => {
        process.stdout.write(
            `audit-service listening on http://127.0.0.1:${PORT} (POST /events, GET /health)\n`,
        );
    });

    auditBus.on('audit:error', (err) => {
        process.stderr.write(`[audit-service] write failure: ${err.message}\n`);
    });

    const shutdown = async (signal) => {
        process.stdout.write(`[audit-service] received ${signal}, draining...\n`);
        server.close();
        try {
            await pendingWrites();
        } finally {
            await closePool();
            process.exit(0);
        }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
    process.stderr.write(`[audit-service] fatal: ${err.message}\n`);
    process.exit(1);
});

// Re export the bus so an in process consumer (the future main workflow)
// can `import { auditBus } from 'services/audit-service'`.
export { auditBus };
