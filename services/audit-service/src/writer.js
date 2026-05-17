// services/audit-service/src/writer.js
//
// Subscribes to the audit bus and serializes inserts into audit.events.
//
// Serialization
//   The hash chain is sequential by construction: each row's event_hash
//   depends on the previous row's event_hash. Two concurrent writers would
//   race for the same previous_hash and produce a fork. We serialize on a
//   single promise chain per process, and the audit service runs as one
//   process per Sprint 0 deployment. A future multi writer deployment must
//   add a Postgres advisory lock around the read-then-insert window.

import { EventEmitter } from 'node:events';
import { computeEventHash } from './hash.js';
import { insertEvent, getLatestHash } from './db.js';

export const auditBus = new EventEmitter();

let lastHash = null;
let bootstrapped = false;
let writeChain = Promise.resolve();

async function bootstrap() {
    if (bootstrapped) return;
    lastHash = await getLatestHash();
    bootstrapped = true;
}

async function writeOne(event, callbacks) {
    try {
        await bootstrap();

        // Required fields. We fail fast rather than insert a row that will
        // silently fail constraints, because the audit service is the
        // accountability anchor and a swallowed write is worse than a loud
        // rejection.
        const required = ['tenant_id', 'actor_type', 'event_type', 'correlation_id'];
        for (const f of required) {
            if (!event[f]) {
                throw new Error(`audit event missing required field: ${f}`);
            }
        }

        const created_at = event.created_at
            ? new Date(event.created_at).toISOString()
            : new Date().toISOString();
        const fullEvent = {
            ...event,
            created_at,
            runtime_provider: event.runtime_provider ?? 'pre_execution',
        };

        const previous_hash = lastHash;
        const event_hash = computeEventHash(fullEvent, previous_hash);

        const row = await insertEvent({
            ...fullEvent,
            previous_hash,
            event_hash,
        });

        lastHash = row.event_hash;
        callbacks?.onWritten?.(row);
    } catch (err) {
        callbacks?.onError?.(err);
        // Re emit on the bus so an operator listener can surface gaps.
        auditBus.emit('audit:error', err, event);
    }
}

// Every event accepted on the bus is funneled into the serial chain. The
// promise chain pattern guarantees ordering without an external mutex.
auditBus.on('audit:event', (event, callbacks) => {
    writeChain = writeChain.then(() => writeOne(event, callbacks));
});

// Exposed so the HTTP layer (or future RPC layer) can await drain on
// shutdown.
export function pendingWrites() {
    return writeChain;
}
