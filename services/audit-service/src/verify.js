// services/audit-service/src/verify.js
//
// Reads every row in audit.events in canonical order, recomputes the chain
// of event_hash values, and asserts that previous_hash threads through and
// every event_hash recomputes byte for byte. Used by `awf audit verify`.
//
// On success the runner also prints a per-runtime_provider breakdown of
// the event counts. Calibration data is segmented by runtime in the
// schema; surfacing the same split here lets an operator confirm at a
// glance that the chain is balanced across runtimes.

import { verifyChain } from './hash.js';
import { getAllEventsOrdered } from './db.js';

function runtimeBreakdown(rows) {
    const counts = new Map();
    for (const row of rows) {
        const key = row.runtime_provider ?? 'pre_execution';
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
    });
}

export async function runVerify() {
    const rows = await getAllEventsOrdered();
    const result = verifyChain(rows);

    if (result.ok) {
        process.stdout.write(
            `audit.events: ${result.count} row(s), chain OK. head=${result.head ?? '(empty)'}\n`,
        );
        const breakdown = runtimeBreakdown(rows);
        if (breakdown.length === 0) {
            process.stdout.write('runtime breakdown: (no rows)\n');
        } else {
            process.stdout.write('runtime breakdown:\n');
            const width = Math.max(...breakdown.map(([k]) => k.length));
            for (const [provider, count] of breakdown) {
                process.stdout.write(`  ${provider.padEnd(width)}  ${count}\n`);
            }
        }
        process.stdout.write('VERIFIED\n');
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
