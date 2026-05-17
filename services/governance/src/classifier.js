#!/usr/bin/env node
// ============================================================================
// services/governance/src/classifier.js
// E0-05: Risk classifier.
//
// Two exports:
//
//   classify({ labels })   Pure function. Given a work item shape with a
//                          labels array, returns { task_class, risk_level }.
//                          No DB calls. Same input always produces the same
//                          output. risk_level is lower case here (high,
//                          medium, low). The DB runner maps it to the
//                          risk_level ENUM (HIGH, MEDIUM, LOW) on write.
//
//   classifyAll()          Reads every work_queue_item in the demo workspace,
//                          calls classify() on each, and writes risk_level
//                          and task_class back. Returns an array of result
//                          rows for printing.
//
// Rule order matters. The first matching rule wins. See RULES below.
// ============================================================================

import pg from 'pg';
import { databaseUrl } from './env.js';

const { Pool } = pg;

// Seed UUIDs from database/migrations/001_core_schema.sql. Mirrors intake.js.
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

// Rule table. Order is significant: the first rule whose label set
// intersects the work item's labels wins. Risk levels are lower case in
// the pure function and mapped to the risk_level ENUM by the runner.
const RULES = [
    { match: ['payment', 'stripe', 'entitlement'], task_class: 'payment_integration',       risk_level: 'high'   },
    { match: ['auth', 'jwt', 'session', 'oauth'],  task_class: 'auth_policy',               risk_level: 'high'   },
    { match: ['database', 'migration', 'postgres'], task_class: 'database_migration',       risk_level: 'high'   },
    { match: ['security', 'rate-limiting'],        task_class: 'security_policy',           risk_level: 'high'   },
    { match: ['webhook', 'reliability', 'retry'],  task_class: 'webhook_integration',       risk_level: 'high'   },
    { match: ['backend', 'api'],                   task_class: 'api_development',           risk_level: 'medium' },
    { match: ['ui', 'frontend', 'mobile'],         task_class: 'ui_refactor',               risk_level: 'medium' },
    { match: ['documentation', 'docs'],            task_class: 'documentation_architecture', risk_level: 'low'   },
    { match: ['test', 'testing'],                  task_class: 'test_addition',             risk_level: 'low'    },
];

const FALLBACK = { task_class: 'general_task', risk_level: 'medium' };

// Lower case to make the pure function tolerant of input casing without
// reaching into intake. Intake already lower cases, this is belt and braces.
function normalize(labels) {
    if (!Array.isArray(labels)) return new Set();
    const out = new Set();
    for (const l of labels) {
        if (typeof l === 'string' && l.length > 0) out.add(l.toLowerCase());
    }
    return out;
}

export function classify(item) {
    const labels = normalize(item?.labels);
    for (const rule of RULES) {
        for (const needle of rule.match) {
            if (labels.has(needle)) {
                return { task_class: rule.task_class, risk_level: rule.risk_level };
            }
        }
    }
    return { ...FALLBACK };
}

// risk_level ENUM in the schema is upper case. The pure function returns
// lower case for ergonomics in tests. Convert at the boundary.
const RISK_ENUM = { high: 'HIGH', medium: 'MEDIUM', low: 'LOW' };

export async function classifyAll() {
    const pool = new Pool({ connectionString: databaseUrl() });
    const results = [];

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `SELECT id, task_id, title, labels
                   FROM public.work_queue_items
                  WHERE workspace_id = $1
                  ORDER BY task_id ASC`,
                [DEMO_WORKSPACE_ID],
            );

            for (const row of rows) {
                const { task_class, risk_level } = classify({ labels: row.labels });
                await client.query(
                    `UPDATE public.work_queue_items
                        SET risk_level = $1::risk_level,
                            task_class = $2
                      WHERE id = $3`,
                    [RISK_ENUM[risk_level], task_class, row.id],
                );
                results.push({
                    task_id:    row.task_id,
                    title:      row.title,
                    labels:     row.labels,
                    task_class,
                    risk_level: RISK_ENUM[risk_level],
                });
            }

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            throw e;
        } finally {
            client.release();
        }
    } finally {
        await pool.end();
    }

    return results;
}

function formatRow(r) {
    const labels = (r.labels || []).join(', ');
    return `${r.task_id.padEnd(12)}  ${r.risk_level.padEnd(6)}  ${r.task_class.padEnd(28)}  [${labels}]  ${r.title}`;
}

async function main() {
    const results = await classifyAll();
    const header = `${'task_id'.padEnd(12)}  ${'risk'.padEnd(6)}  ${'task_class'.padEnd(28)}  labels                                title`;
    process.stdout.write(header + '\n');
    process.stdout.write('-'.repeat(header.length) + '\n');
    for (const r of results) process.stdout.write(formatRow(r) + '\n');
    process.stdout.write(`\nClassified ${results.length} work items.\n`);
}

// Only run main() when invoked as a script, not when imported by tests.
const invokedAsScript = import.meta.url === `file://${process.argv[1]}`;
if (invokedAsScript) {
    main().catch((err) => {
        process.stderr.write(`classifier failed: ${err.message}\n`);
        process.exit(1);
    });
}
