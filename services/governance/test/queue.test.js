// services/governance/test/queue.test.js
//
// Exercises claimNextEligibleItem against the live awf database. Runs as a
// plain script: `node test/queue.test.js`. A non zero exit indicates
// failure. Uses node:assert/strict to match classifier.test.js and the
// execution test.
//
// Test isolation: a fresh workspace row is created per run (TEST_WORKSPACE_ID
// is randomly generated) so demo seed data in the canonical demo workspace
// never bleeds into the empty-queue assertion. The workspace is torn down in
// the finally block.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { databaseUrl } from '../src/env.js';
import { claimNextEligibleItem } from '../src/queue.js';

const { Pool } = pg;

const DEMO_TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID  = '00000000-0000-0000-0000-000000000010';
const TEST_WORKSPACE_ID = crypto.randomUUID();
const TEST_WORKSPACE_SLUG = `queue-test-${TEST_WORKSPACE_ID.slice(0, 8)}`;

const TEST_PREFIX = 'queue-test:';

async function deleteTestRows(pool) {
    await pool.query(
        `DELETE FROM public.work_queue_items WHERE workspace_id = $1`,
        [TEST_WORKSPACE_ID],
    );
}

async function createTestWorkspace(pool) {
    await pool.query(
        `INSERT INTO public.workspaces (id, tenant_id, division_id, slug, name, hitl_default_threshold)
         VALUES ($1, $2, $3, $4, 'Queue Test Workspace', 'HIGH')
         ON CONFLICT (id) DO NOTHING`,
        [TEST_WORKSPACE_ID, DEMO_TENANT_ID, DEMO_DIVISION_ID, TEST_WORKSPACE_SLUG],
    );
}

async function dropTestWorkspace(pool) {
    await pool.query(`DELETE FROM public.workspaces WHERE id = $1`, [TEST_WORKSPACE_ID]);
}

// Insert a single work item shaped like a post-classifier row. Caller picks
// status, risk_level, and (optionally) claimed_at so each phase can set up
// the exact fixture it needs.
async function insertItem(pool, {
    taskId, title, status, risk_level, priority = 100, claimed_at = null,
}) {
    const r = await pool.query(
        `INSERT INTO public.work_queue_items (
            tenant_id, division_id, workspace_id,
            task_id, title, domain,
            risk_level, status, priority, claimed_at,
            labels, task_class
         ) VALUES (
            $1, $2, $3,
            $4, $5, 'backend',
            $6::risk_level, $7::work_queue_status, $8, $9,
            '{}'::text[], 'test_task'
         )
         RETURNING id`,
        [
            DEMO_TENANT_ID, DEMO_DIVISION_ID, TEST_WORKSPACE_ID,
            TEST_PREFIX + taskId, title, risk_level, status, priority, claimed_at,
        ],
    );
    return r.rows[0].id;
}

async function getItem(pool, id) {
    const r = await pool.query(
        `SELECT id, task_id, status, risk_level, claimed_at, priority
           FROM public.work_queue_items WHERE id = $1`,
        [id],
    );
    return r.rows[0];
}

const pool = new Pool({ connectionString: databaseUrl() });

try {
    // Provision a fresh workspace for this run.
    await createTestWorkspace(pool);
    // Clean any leftovers from a prior failed run.
    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Phase A: empty queue returns null.
    // ------------------------------------------------------------------
    {
        const claimed = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        assert.equal(claimed, null, 'empty queue must return null');
    }

    // ------------------------------------------------------------------
    // Phase B: single eligible item, single caller.
    //   - claim returns the row
    //   - status flips to 'planned'
    //   - claimed_at is now non-null
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: 'B:1', title: 'Phase B item',
            status: 'classified', risk_level: 'MEDIUM', priority: 100,
        });
        const claimed = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        assert.ok(claimed, 'phase B: expected a claimed row');
        assert.equal(claimed.id, id, 'phase B: claimed the row we inserted');
        assert.equal(claimed.status, 'planned', 'phase B: status must be planned');
        assert.ok(claimed.claimed_at instanceof Date, 'phase B: claimed_at must be set');

        const row = await getItem(pool, id);
        assert.equal(row.status, 'planned', 'phase B: row in db has status=planned');
        assert.ok(row.claimed_at instanceof Date, 'phase B: row in db has claimed_at set');

        await deleteTestRows(pool);
    }

    // ------------------------------------------------------------------
    // Phase C: critical risk item is never claimed by the queue.
    // ------------------------------------------------------------------
    {
        await insertItem(pool, {
            taskId: 'C:1', title: 'Phase C critical',
            status: 'classified', risk_level: 'CRITICAL', priority: 100,
        });
        const claimed = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        assert.equal(claimed, null, 'phase C: critical-risk rows must not be claimed');
        await deleteTestRows(pool);
    }

    // ------------------------------------------------------------------
    // Phase D: stale claim is re-claimable.
    //   A row in 'planned' with claimed_at older than 30 minutes is a
    //   stalled worker. The queue must pick it back up and refresh
    //   claimed_at.
    // ------------------------------------------------------------------
    {
        const staleAt = new Date(Date.now() - 31 * 60 * 1000); // 31 minutes ago
        const id = await insertItem(pool, {
            taskId: 'D:1', title: 'Phase D stale',
            status: 'planned', risk_level: 'MEDIUM', priority: 100,
            claimed_at: staleAt,
        });
        const claimed = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        assert.ok(claimed, 'phase D: stale planned row must be re-claimable');
        assert.equal(claimed.id, id);
        assert.equal(claimed.status, 'planned');
        assert.ok(
            claimed.claimed_at.getTime() > staleAt.getTime(),
            'phase D: claimed_at must be refreshed past the old value',
        );

        // Sanity: a fresh planned row (claimed_at = NOW) must NOT be re-claimable.
        const freshClaimed = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        assert.equal(
            freshClaimed, null,
            'phase D: a freshly claimed row must not be re-claimable immediately',
        );

        await deleteTestRows(pool);
    }

    // ------------------------------------------------------------------
    // Phase E: two eligible items + two concurrent callers.
    //   Spec asked for this scenario. Under SELECT FOR UPDATE SKIP LOCKED
    //   with two items and two callers, both calls succeed (each locks
    //   one of the two rows). The meaningful invariant is that they
    //   claim DIFFERENT items - no double-claim.
    // ------------------------------------------------------------------
    {
        const idHigh = await insertItem(pool, {
            taskId: 'E:1', title: 'Phase E high priority',
            status: 'classified', risk_level: 'MEDIUM', priority: 200,
        });
        const idLow = await insertItem(pool, {
            taskId: 'E:2', title: 'Phase E low priority',
            status: 'classified', risk_level: 'MEDIUM', priority: 100,
        });

        const [a, b] = await Promise.all([
            claimNextEligibleItem(pool, TEST_WORKSPACE_ID),
            claimNextEligibleItem(pool, TEST_WORKSPACE_ID),
        ]);

        assert.ok(a, 'phase E: caller A claimed a row');
        assert.ok(b, 'phase E: caller B claimed a row');
        assert.notEqual(a.id, b.id, 'phase E: callers must claim different rows (no double-claim)');

        const claimedIds = new Set([a.id, b.id]);
        assert.ok(claimedIds.has(idHigh), 'phase E: high-priority row was claimed');
        assert.ok(claimedIds.has(idLow),  'phase E: low-priority row was claimed');

        await deleteTestRows(pool);
    }

    // ------------------------------------------------------------------
    // Phase F: ONE eligible item + TWO concurrent callers.
    //   The canonical SKIP LOCKED contention test: exactly one caller
    //   wins, the other gets null. This is what proves the queue cannot
    //   hand the same row to two workers.
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: 'F:1', title: 'Phase F sole item',
            status: 'classified', risk_level: 'MEDIUM', priority: 100,
        });

        const [a, b] = await Promise.all([
            claimNextEligibleItem(pool, TEST_WORKSPACE_ID),
            claimNextEligibleItem(pool, TEST_WORKSPACE_ID),
        ]);

        const winners = [a, b].filter(Boolean);
        const losers  = [a, b].filter((x) => x === null);
        assert.equal(winners.length, 1, 'phase F: exactly one caller wins');
        assert.equal(losers.length,  1, 'phase F: exactly one caller gets null');
        assert.equal(winners[0].id, id, 'phase F: winner claimed the inserted row');

        await deleteTestRows(pool);
    }

    // ------------------------------------------------------------------
    // Phase G: priority order. Higher priority wins; ties go to oldest
    // created_at.
    // ------------------------------------------------------------------
    {
        const idLow = await insertItem(pool, {
            taskId: 'G:1', title: 'Phase G low',
            status: 'classified', risk_level: 'MEDIUM', priority: 50,
        });
        const idHigh = await insertItem(pool, {
            taskId: 'G:2', title: 'Phase G high',
            status: 'classified', risk_level: 'MEDIUM', priority: 200,
        });
        const idMid = await insertItem(pool, {
            taskId: 'G:3', title: 'Phase G mid',
            status: 'classified', risk_level: 'MEDIUM', priority: 100,
        });

        const first  = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        const second = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        const third  = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);
        const fourth = await claimNextEligibleItem(pool, TEST_WORKSPACE_ID);

        assert.equal(first.id,  idHigh, 'phase G: highest priority claimed first');
        assert.equal(second.id, idMid,  'phase G: middle priority claimed second');
        assert.equal(third.id,  idLow,  'phase G: lowest priority claimed third');
        assert.equal(fourth,    null,   'phase G: queue drained');

        await deleteTestRows(pool);
    }

    process.stdout.write('queue: all tests passed\n');
} catch (err) {
    process.stderr.write(`queue test failed: ${err.stack || err.message}\n`);
    process.exitCode = 1;
} finally {
    // Belt-and-braces cleanup even on failure.
    try { await deleteTestRows(pool); } catch (_) { /* ignore */ }
    try { await dropTestWorkspace(pool); } catch (_) { /* ignore */ }
    await pool.end();
}
