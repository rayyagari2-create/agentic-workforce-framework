#!/usr/bin/env node
// ============================================================================
// services/governance/src/intake.js
// E0-04: Work intake from JSON.
//
// Reads a GitHub Issues shaped backlog file (an array of objects with
// number, title, body, labels) and upserts each ticket into
// public.work_queue_items under the Sprint 0 demo tenant, division, and
// workspace. The external reference is `github:<issue.number>`, written
// into the task_id column; the UNIQUE (workspace_id, task_id) index on
// work_queue_items makes the operation idempotent on re run.
//
// What this script does NOT do:
//   - Risk classification. That is E0-05. Intake writes risk_level='LOW'
//     as a placeholder; the classifier will overwrite it.
//   - Approval gating. That is E0-07.
//
// Usage
//   node services/governance/src/intake.js [path/to/backlog.json]
//
// Default backlog path: examples/awf-demo/sample-backlog.json.
//
// Output (single line):
//   "Loaded N work items. N new, N updated, N skipped."
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { databaseUrl } from './env.js';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// Seed UUIDs from database/migrations/001_core_schema.sql.
const DEMO_TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID  = '00000000-0000-0000-0000-000000000010';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

const DEFAULT_BACKLOG = path.join(REPO_ROOT, 'examples', 'awf-demo', 'sample-backlog.json');

const UPSERT_SQL = `
    INSERT INTO public.work_queue_items (
        tenant_id, division_id, workspace_id,
        task_id, title, description, domain,
        risk_level, priority
    ) VALUES (
        $1, $2, $3,
        $4, $5, $6, $7,
        $8, $9
    )
    ON CONFLICT (workspace_id, task_id) DO UPDATE
       SET title       = EXCLUDED.title,
           description = EXCLUDED.description,
           domain      = EXCLUDED.domain,
           priority    = EXCLUDED.priority
     WHERE (
            public.work_queue_items.title,
            public.work_queue_items.description,
            public.work_queue_items.domain,
            public.work_queue_items.priority
           ) IS DISTINCT FROM (
            EXCLUDED.title,
            EXCLUDED.description,
            EXCLUDED.domain,
            EXCLUDED.priority
           )
    RETURNING (xmax = 0) AS inserted
`;

// GitHub's `gh issue list --json labels` returns objects like
// { name: 'bug', ... }. Some tooling emits bare strings. Accept both.
function labelNames(labels) {
    if (!Array.isArray(labels)) return [];
    return labels.map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean);
}

// Coarse domain assignment from labels. Intake needs SOMETHING in the
// NOT NULL domain column; the risk classifier and orchestrator can
// refine routing later.
function inferDomain(names) {
    const set = new Set(names.map((n) => n.toLowerCase()));
    if (set.has('security')) return 'security';
    if (set.has('documentation') || set.has('docs')) return 'docs';
    if (set.has('backend') || set.has('database') || set.has('payment')) return 'backend';
    if (set.has('ui') || set.has('frontend') || set.has('mobile')) return 'frontend';
    return 'general';
}

// Priority is encoded as a `priority: NN` label so issue authors can set
// it from the GitHub UI without a separate field. Clamped to the schema
// range [1, 1000]. Falls back to 100 (the column default) if absent.
function extractPriority(names) {
    for (const n of names) {
        const m = n.match(/^priority\s*:\s*(\d+)$/i);
        if (m) {
            const v = parseInt(m[1], 10);
            if (Number.isFinite(v)) return Math.min(1000, Math.max(1, v));
        }
    }
    return 100;
}

function externalRef(issue) {
    if (issue.number === undefined || issue.number === null) {
        throw new Error(`backlog entry missing "number": ${JSON.stringify(issue).slice(0, 120)}`);
    }
    return `github:${issue.number}`;
}

async function upsertIssue(client, issue) {
    const names    = labelNames(issue.labels);
    const domain   = inferDomain(names);
    const priority = extractPriority(names);
    const taskId   = externalRef(issue);

    const r = await client.query(UPSERT_SQL, [
        DEMO_TENANT_ID,
        DEMO_DIVISION_ID,
        DEMO_WORKSPACE_ID,
        taskId,
        issue.title ?? '(untitled)',
        issue.body ?? null,
        domain,
        'LOW',
        priority,
    ]);

    if (r.rows.length === 0)        return 'skipped';
    if (r.rows[0].inserted === true) return 'new';
    return 'updated';
}

async function main() {
    const arg = process.argv[2];
    const backlogPath = arg ? path.resolve(arg) : DEFAULT_BACKLOG;

    if (!fs.existsSync(backlogPath)) {
        throw new Error(`backlog file not found: ${backlogPath}`);
    }

    const raw = fs.readFileSync(backlogPath, 'utf8');
    let issues;
    try {
        issues = JSON.parse(raw);
    } catch (e) {
        throw new Error(`backlog is not valid JSON (${backlogPath}): ${e.message}`);
    }
    if (!Array.isArray(issues)) {
        throw new Error(`backlog root must be an array of issues, got ${typeof issues}`);
    }

    const pool = new Pool({ connectionString: databaseUrl() });
    let newCount = 0, updated = 0, skipped = 0;

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const issue of issues) {
                const outcome = await upsertIssue(client, issue);
                if (outcome === 'new')          newCount++;
                else if (outcome === 'updated') updated++;
                else                            skipped++;
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

    const total = newCount + updated + skipped;
    process.stdout.write(
        `Loaded ${total} work items. ${newCount} new, ${updated} updated, ${skipped} skipped.\n`,
    );
}

main().catch((err) => {
    process.stderr.write(`intake failed: ${err.message}\n`);
    process.exit(1);
});
