// services/governance/test/row-level-security.test.js
//
// E2-01: Verifies the workspace_isolation RLS policy installed by
// database/migrations/010_row_level_security.sql.
//
// Two work items are inserted into two distinct workspaces. A connection
// bound to workspace A via withWorkspaceContext() must see workspace A's
// row and must NOT see workspace B's row. The symmetric check runs from
// workspace B for good measure.
//
// Note on roles
//   The connection user (`ra` in dev) is the table owner and the cluster
//   superuser, both of which bypass RLS unless the policy is forced and
//   the connection drops to a non-superuser role. The migration sets
//   FORCE ROW LEVEL SECURITY on every covered table and grants the
//   workspace tables to app_role. This test calls SET LOCAL ROLE
//   app_role inside the context so RLS is the surface that filters rows,
//   matching how production deployments are expected to connect.

import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseUrl } from '../src/env.js';
import { withWorkspaceContext } from '../src/workspace-context.js';

const { Pool } = pg;

const DEMO_TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID = '00000000-0000-0000-0000-000000000010';
const WORKSPACE_A_ID   = '00000000-0000-0000-0000-000000000100'; // demo workspace, seeded by 001
const WORKSPACE_B_ID   = '00000000-0000-0000-0000-000000000200'; // created by this test

const TEST_PREFIX = 'rls-test:';

const pool = new Pool({ connectionString: databaseUrl() });

async function cleanup(pool) {
    await pool.query(
        `DELETE FROM public.work_queue_items WHERE task_id LIKE $1`,
        [TEST_PREFIX + '%'],
    );
    await pool.query(
        `DELETE FROM public.workspaces WHERE id = $1`,
        [WORKSPACE_B_ID],
    );
}

async function insertItem(pool, workspaceId, taskId, title) {
    const r = await pool.query(
        `INSERT INTO public.work_queue_items (
            tenant_id, division_id, workspace_id,
            task_id, title, domain,
            risk_level, status, priority
         ) VALUES (
            $1, $2, $3,
            $4, $5, 'backend',
            'MEDIUM'::risk_level, 'created'::work_queue_status, 100
         ) RETURNING id`,
        [DEMO_TENANT_ID, DEMO_DIVISION_ID, workspaceId, TEST_PREFIX + taskId, title],
    );
    return r.rows[0].id;
}

try {
    await cleanup(pool);

    // ------------------------------------------------------------------
    // Setup. Create the second workspace, then insert one work item
    // into each workspace. The setup runs as the superuser connection,
    // which bypasses RLS so the seed itself is unimpeded.
    // ------------------------------------------------------------------
    await pool.query(
        `INSERT INTO public.workspaces (id, tenant_id, division_id, slug, name, hitl_default_threshold)
         VALUES ($1, $2, $3, 'rls-test-workspace-b', 'RLS Test Workspace B', 'HIGH')
         ON CONFLICT (id) DO NOTHING`,
        [WORKSPACE_B_ID, DEMO_TENANT_ID, DEMO_DIVISION_ID],
    );

    const itemAId = await insertItem(pool, WORKSPACE_A_ID, 'A:1', 'Workspace A item');
    const itemBId = await insertItem(pool, WORKSPACE_B_ID, 'B:1', 'Workspace B item');

    // ------------------------------------------------------------------
    // Phase 1: workspace A context.
    //   - workspace A's row MUST be visible
    //   - workspace B's row MUST NOT be visible
    // ------------------------------------------------------------------
    await withWorkspaceContext(pool, WORKSPACE_A_ID, DEMO_TENANT_ID, async (client) => {
        await client.query('SET LOCAL ROLE app_role');

        const r = await client.query(
            `SELECT id, task_id, workspace_id
               FROM public.work_queue_items
              WHERE task_id LIKE $1`,
            [TEST_PREFIX + '%'],
        );
        const ids = r.rows.map((row) => row.id);

        assert.ok(
            ids.includes(itemAId),
            'workspace A context: workspace A item MUST be visible',
        );
        assert.ok(
            !ids.includes(itemBId),
            'workspace A context: workspace B item must NOT be visible',
        );
        assert.equal(
            r.rows.length, 1,
            'workspace A context: exactly one rls-test row visible',
        );
        assert.equal(
            r.rows[0].workspace_id, WORKSPACE_A_ID,
            'workspace A context: visible row belongs to workspace A',
        );
    });

    // ------------------------------------------------------------------
    // Phase 2: workspace B context (symmetric check).
    //   - workspace B's row MUST be visible
    //   - workspace A's row MUST NOT be visible
    // ------------------------------------------------------------------
    await withWorkspaceContext(pool, WORKSPACE_B_ID, DEMO_TENANT_ID, async (client) => {
        await client.query('SET LOCAL ROLE app_role');

        const r = await client.query(
            `SELECT id, task_id, workspace_id
               FROM public.work_queue_items
              WHERE task_id LIKE $1`,
            [TEST_PREFIX + '%'],
        );
        const ids = r.rows.map((row) => row.id);

        assert.ok(
            ids.includes(itemBId),
            'workspace B context: workspace B item MUST be visible',
        );
        assert.ok(
            !ids.includes(itemAId),
            'workspace B context: workspace A item must NOT be visible',
        );
        assert.equal(
            r.rows.length, 1,
            'workspace B context: exactly one rls-test row visible',
        );
        assert.equal(
            r.rows[0].workspace_id, WORKSPACE_B_ID,
            'workspace B context: visible row belongs to workspace B',
        );
    });

    process.stdout.write('row-level-security: all tests passed\n');
} catch (err) {
    process.stderr.write(`row-level-security test failed: ${err.stack || err.message}\n`);
    process.exitCode = 1;
} finally {
    try { await cleanup(pool); } catch (_) { /* ignore */ }
    await pool.end();
}
