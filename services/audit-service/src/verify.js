// services/audit-service/src/verify.js
//
// Reads every row in audit.events in canonical order, recomputes the chain
// of event_hash values, and asserts that previous_hash threads through and
// every event_hash recomputes byte for byte. Used by `awf audit verify`.

import { verifyChain } from './hash.js';
import { getAllEventsOrdered } from './db.js';

export async function runVerify() {
    const rows = await getAllEventsOrdered();
    const result = verifyChain(rows);

    if (result.ok) {
        process.stdout.write(
            `audit.events: ${result.count} row(s), chain OK. head=${result.head ?? '(empty)'}\n`,
        );
    } else {
        process.stderr.write(
            `audit.events: chain BROKEN at row ${result.brokenAt} after ${result.count} valid row(s).\n` +
                `  reason:   ${result.reason}\n` +
                `  expected: ${result.expected ?? '(null)'}\n` +
                `  actual:   ${result.actual ?? '(null)'}\n`,
        );
    }
    return result;
}
