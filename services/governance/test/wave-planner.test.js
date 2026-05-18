// services/governance/test/wave-planner.test.js
//
// Exercises services/governance/src/wave-planner.js against the live awf
// database. Runs as a plain script:
//   node test/wave-planner.test.js
// A non zero exit indicates failure. Uses node:assert/strict to match the
// classifier, queue, approvals, assigner, and conflict-graph tests.
//
// All DB test rows use the 'wave-test:<phase>:<n>' task_id prefix so the
// fixtures are isolated from the real backlog and can be cleaned up in one
// DELETE at the start (defensive) and the end (cleanup) of the run.
//
// Tests:
//   1. A 5-ticket sample backlog produces a wave plan with Wave 1 and Wave 2.
//   2. Items sharing server/webhooks/ end up in Wave 2 with a conflict.
//   3. Wave plan is persisted to work_queue_items.wave_number.
//   4. Output format matches the CLI spec from the E1-03 task.

import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseUrl } from '../src/env.js';
import { planWaves, formatWavePlan } from '../src/wave-planner.js';

const { Pool } = pg;

const DEMO_TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID  = '00000000-0000-0000-0000-000000000010';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

const TEST_PREFIX = 'wave-test:';

async function deleteTestRows(pool) {
    await pool.query(
        `DELETE FROM public.work_queue_items
          WHERE workspace_id = $1 AND task_id LIKE $2`,
        [DEMO_WORKSPACE_ID, TEST_PREFIX + '%'],
    );
}

async function insertItem(pool, {
    taskId, title, task_class, risk_level = 'LOW',
}) {
    const r = await pool.query(
        `INSERT INTO public.work_queue_items (
            tenant_id, division_id, workspace_id,
            task_id, title, domain,
            risk_level, status, priority,
            labels, task_class
         ) VALUES (
            $1, $2, $3,
            $4, $5, 'backend',
            $6::risk_level, 'planned'::work_queue_status, 100,
            '{}'::text[], $7
         )
         RETURNING id, task_id, title, task_class, risk_level`,
        [
            DEMO_TENANT_ID, DEMO_DIVISION_ID, DEMO_WORKSPACE_ID,
            TEST_PREFIX + taskId, title, risk_level, task_class,
        ],
    );
    return r.rows[0];
}

async function getWaveNumber(pool, id) {
    const r = await pool.query(
        `SELECT wave_number FROM public.work_queue_items WHERE id = $1`,
        [id],
    );
    return r.rows[0]?.wave_number ?? null;
}

const pool = new Pool({ connectionString: databaseUrl() });

try {
    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Test 1: a 5-ticket sample backlog produces a plan with Wave 1 and
    //   Wave 2. The fixture mixes safe items (ui_refactor,
    //   documentation_architecture, test_addition) with two items that
    //   conflict on src/routes/.
    // ------------------------------------------------------------------
    {
        const items = [
            await insertItem(pool, {
                taskId: '1:1', title: 'header redesign',
                task_class: 'ui_refactor', risk_level: 'LOW',
            }),
            await insertItem(pool, {
                taskId: '1:2', title: 'architecture doc',
                task_class: 'documentation_architecture', risk_level: 'LOW',
            }),
            await insertItem(pool, {
                taskId: '1:3', title: 'add coverage',
                task_class: 'test_addition', risk_level: 'LOW',
            }),
            await insertItem(pool, {
                taskId: '1:4', title: 'new users route',
                task_class: 'api_development', risk_level: 'MEDIUM',
            }),
            await insertItem(pool, {
                taskId: '1:5', title: 'patch users route',
                task_class: 'api_development', risk_level: 'MEDIUM',
            }),
        ];

        const { waves, conflicts } = await planWaves(items, pool, DEMO_WORKSPACE_ID);

        assert.equal(waves.length, 2, 'test 1: expect both Wave 1 and Wave 2');
        const wave1 = waves.find((w) => w.wave === 1);
        const wave2 = waves.find((w) => w.wave === 2);
        assert.ok(wave1, 'test 1: Wave 1 exists');
        assert.ok(wave2, 'test 1: Wave 2 exists');
        assert.equal(wave1.work_items.length, 3, 'test 1: 3 safe items in Wave 1');
        assert.equal(wave2.work_items.length, 2, 'test 1: 2 conflicting items in Wave 2');
        assert.ok(conflicts.length >= 1, 'test 1: at least one conflict reported');
        assert.equal(wave1.safe_for_parallel, true);
        assert.equal(wave2.safe_for_parallel, false);
    }

    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Test 2: two items whose task_classes both touch server/webhooks/
    //   end up sequenced in Wave 2, with the conflict naming that file.
    // ------------------------------------------------------------------
    {
        const hookA = await insertItem(pool, {
            taskId: '2:1', title: 'stripe webhook',
            task_class: 'webhook_integration', risk_level: 'HIGH',
        });
        const hookB = await insertItem(pool, {
            taskId: '2:2', title: 'github webhook',
            task_class: 'webhook_integration', risk_level: 'HIGH',
        });

        const { waves, conflicts } = await planWaves([hookA, hookB], pool, DEMO_WORKSPACE_ID);

        const wave2 = waves.find((w) => w.wave === 2);
        assert.ok(wave2, 'test 2: Wave 2 must exist for two webhook items');
        const wave2Ids = wave2.work_items.map((w) => w.id).sort();
        assert.deepEqual(wave2Ids, [hookA.id, hookB.id].sort(),
            'test 2: both webhook items must be in Wave 2');

        const hookConflict = conflicts.find((c) => c.file === 'server/webhooks/');
        assert.ok(hookConflict, 'test 2: conflict on server/webhooks/ must be reported');
        assert.deepEqual(
            hookConflict.work_item_ids.slice().sort(),
            [hookA.id, hookB.id].sort(),
            'test 2: conflict cites both webhook items',
        );
        assert.equal(hookConflict.severity, 'high',
            'test 2: webhook conflict is high severity');
    }

    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Test 3: wave_number is written to work_queue_items for every item
    //   the planner saw. Items in Wave 1 get 1, items in Wave 2 get 2.
    // ------------------------------------------------------------------
    {
        const safeItem = await insertItem(pool, {
            taskId: '3:1', title: 'docs',
            task_class: 'documentation_architecture', risk_level: 'LOW',
        });
        const conflictA = await insertItem(pool, {
            taskId: '3:2', title: 'route A',
            task_class: 'api_development', risk_level: 'MEDIUM',
        });
        const conflictB = await insertItem(pool, {
            taskId: '3:3', title: 'route B',
            task_class: 'api_development', risk_level: 'MEDIUM',
        });

        // Before planning, wave_number is null for every item.
        for (const wi of [safeItem, conflictA, conflictB]) {
            assert.equal(await getWaveNumber(pool, wi.id), null,
                `test 3: ${wi.task_id} has no wave_number before planning`);
        }

        await planWaves([safeItem, conflictA, conflictB], pool, DEMO_WORKSPACE_ID);

        assert.equal(await getWaveNumber(pool, safeItem.id),  1,
            'test 3: safe item persisted as wave 1');
        assert.equal(await getWaveNumber(pool, conflictA.id), 2,
            'test 3: conflicting item A persisted as wave 2');
        assert.equal(await getWaveNumber(pool, conflictB.id), 2,
            'test 3: conflicting item B persisted as wave 2');
    }

    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Test 4: formatWavePlan emits the exact lines the demo CLI prints.
    //   Uses task_id as the ref (#FOO-1), TASK_CLASS_TO_ROLE for the
    //   role, and risk_level for the risk tag.
    // ------------------------------------------------------------------
    {
        const items = [
            await insertItem(pool, {
                taskId: '4:1', title: 'header redesign',
                task_class: 'ui_refactor', risk_level: 'LOW',
            }),
            await insertItem(pool, {
                taskId: '4:2', title: 'add coverage',
                task_class: 'test_addition', risk_level: 'LOW',
            }),
            await insertItem(pool, {
                taskId: '4:3', title: 'route A',
                task_class: 'api_development', risk_level: 'MEDIUM',
            }),
            await insertItem(pool, {
                taskId: '4:4', title: 'route B',
                task_class: 'api_development', risk_level: 'MEDIUM',
            }),
        ];

        const { waves, conflicts } = await planWaves(items, pool, DEMO_WORKSPACE_ID);
        const output = formatWavePlan(waves, conflicts, items);
        const lines = output.split('\n');

        // Wave 1 header + two safe items.
        assert.equal(lines[0], 'Wave 1 — Safe for parallel execution (2 items)',
            'test 4: Wave 1 header line');
        const wave1Bodies = lines.slice(1, 3);
        const wave1Set = new Set(wave1Bodies);
        assert.ok(
            wave1Set.has(`  #${TEST_PREFIX}4:1 header redesign → agent-fe | LOW risk`),
            'test 4: Wave 1 line for header redesign',
        );
        assert.ok(
            wave1Set.has(`  #${TEST_PREFIX}4:2 add coverage → qa-agent | LOW risk`),
            'test 4: Wave 1 line for add coverage',
        );

        // Wave 2 header + two sequenced items + 1 conflict + merge order.
        assert.equal(lines[3], 'Wave 2 — Requires sequencing (2 items)',
            'test 4: Wave 2 header line');
        assert.equal(lines[4],
            `  #${TEST_PREFIX}4:3 route A → agent-srv | MEDIUM risk`,
            'test 4: first Wave 2 item line');
        assert.equal(lines[5],
            `  #${TEST_PREFIX}4:4 route B → agent-srv | MEDIUM risk`,
            'test 4: second Wave 2 item line');

        const conflictLine = lines.find((l) => l.startsWith('  Conflict:'));
        assert.ok(conflictLine, 'test 4: conflict line is present');
        assert.match(
            conflictLine,
            new RegExp(
                `^  Conflict: src/(routes|controllers)/ ` +
                `\\(shared by #${TEST_PREFIX}4:3 and #${TEST_PREFIX}4:4\\)$`,
            ),
            'test 4: conflict line names the shared file and both refs',
        );

        const mergeLine = lines.find((l) => l.startsWith('  Merge order:'));
        assert.equal(mergeLine,
            `  Merge order: #${TEST_PREFIX}4:3 → then → #${TEST_PREFIX}4:4`,
            'test 4: merge order preserves registration order');
    }

    process.stdout.write('wave-planner: all tests passed\n');
} catch (err) {
    process.stderr.write(`wave-planner test failed: ${err.stack || err.message}\n`);
    process.exitCode = 1;
} finally {
    try { await deleteTestRows(pool); } catch (_) { /* ignore */ }
    await pool.end();
}
