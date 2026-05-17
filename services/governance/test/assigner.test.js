// services/governance/test/assigner.test.js
//
// Exercises services/governance/src/assigner.js against the live awf
// database. Runs as a plain script:
//   node test/assigner.test.js
// A non zero exit indicates failure. Uses node:assert/strict to match the
// classifier, queue, and approvals tests.
//
// All DB test rows use the 'assign-test:<phase>:<n>' task_id prefix so the
// fixtures are isolated from the real backlog and can be cleaned up in one
// DELETE at the start (defensive) and the end (cleanup) of the run. The
// five demo agent_instances seeded by 007_agent_assignment.sql are
// expected to be present; the test does not insert or delete them.

import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseUrl } from '../src/env.js';
import { routeToRole, assignAgent } from '../src/assigner.js';

const { Pool } = pg;

const DEMO_TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID  = '00000000-0000-0000-0000-000000000010';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

const TEST_PREFIX = 'assign-test:';

async function deleteTestRows(pool) {
    await pool.query(
        `DELETE FROM public.work_queue_items
          WHERE workspace_id = $1 AND task_id LIKE $2`,
        [DEMO_WORKSPACE_ID, TEST_PREFIX + '%'],
    );
}

async function insertItem(pool, { taskId, title, task_class, risk_level = 'LOW', status = 'planned' }) {
    const r = await pool.query(
        `INSERT INTO public.work_queue_items (
            tenant_id, division_id, workspace_id,
            task_id, title, domain,
            risk_level, status, priority,
            labels, task_class
         ) VALUES (
            $1, $2, $3,
            $4, $5, 'backend',
            $6::risk_level, $7::work_queue_status, 100,
            '{}'::text[], $8
         )
         RETURNING id`,
        [
            DEMO_TENANT_ID, DEMO_DIVISION_ID, DEMO_WORKSPACE_ID,
            TEST_PREFIX + taskId, title, risk_level, status, task_class,
        ],
    );
    return r.rows[0].id;
}

async function getItem(pool, id) {
    const r = await pool.query(
        `SELECT id, task_id, status, task_class, assigned_agent_instance_id
           FROM public.work_queue_items WHERE id = $1`,
        [id],
    );
    return r.rows[0];
}

async function getAgentByRole(pool, role) {
    const r = await pool.query(
        `SELECT id, role, display_name
           FROM public.agent_instances
          WHERE workspace_id = $1 AND role = $2`,
        [DEMO_WORKSPACE_ID, role],
    );
    return r.rows[0];
}

const pool = new Pool({ connectionString: databaseUrl() });

try {
    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Pure function: every task_class the classifier emits maps to one
    // of the four assignable roles. Orchestrator is the assigner and
    // must NOT appear in the routing table.
    // ------------------------------------------------------------------
    {
        assert.equal(routeToRole('ui_refactor'),                'agent-fe');
        assert.equal(routeToRole('api_development'),            'agent-srv');
        assert.equal(routeToRole('webhook_integration'),        'agent-srv');
        assert.equal(routeToRole('database_migration'),         'agent-srv');
        assert.equal(routeToRole('auth_policy'),                'agent-srv');
        assert.equal(routeToRole('payment_integration'),        'agent-srv');
        assert.equal(routeToRole('security_policy'),            'agent-srv');
        assert.equal(routeToRole('documentation_architecture'), 'fix-agent');
        assert.equal(routeToRole('test_addition'),              'qa-agent');
        assert.equal(routeToRole('general_task'),               'agent-srv');

        // Orchestrator is the assigner. It must not be a routing target.
        const targets = new Set([
            'agent-fe', 'agent-srv', 'fix-agent', 'qa-agent',
        ]);
        for (const tc of [
            'ui_refactor', 'api_development', 'webhook_integration',
            'database_migration', 'auth_policy', 'payment_integration',
            'security_policy', 'documentation_architecture',
            'test_addition', 'general_task',
        ]) {
            const role = routeToRole(tc);
            assert.ok(targets.has(role),
                `routing table must only target assignable roles; got ${role} for ${tc}`);
            assert.notEqual(role, 'orchestrator',
                `orchestrator must not appear as an assignment target (task_class: ${tc})`);
        }

        // Unknown / malformed inputs return null.
        assert.equal(routeToRole('not_a_real_class'), null);
        assert.equal(routeToRole(''),                  null);
        assert.equal(routeToRole(null),                null);
        assert.equal(routeToRole(undefined),           null);
        assert.equal(routeToRole(42),                  null);
    }

    // ------------------------------------------------------------------
    // The five demo agent_instances expected by the routing table are
    // present in the workspace. If 007_agent_assignment.sql has not
    // been applied, fail loudly here rather than letting Scenario 2
    // throw a less specific error later.
    // ------------------------------------------------------------------
    {
        for (const role of ['orchestrator', 'agent-fe', 'agent-srv', 'fix-agent', 'qa-agent']) {
            const a = await getAgentByRole(pool, role);
            assert.ok(a, `expected agent_instance for role '${role}' in demo workspace (run 007_agent_assignment.sql)`);
        }
    }

    // ------------------------------------------------------------------
    // Scenario 1: ui_refactor routes to agent-fe.
    //   assignAgent flips status to 'assigned' and writes
    //   assigned_agent_instance_id to the agent-fe row.
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: '1:fe', title: 'a UI refactor',
            task_class: 'ui_refactor',
        });
        const fe = await getAgentByRole(pool, 'agent-fe');

        const result = await assignAgent(pool, id);
        assert.equal(result.role, 'agent-fe', 'scenario 1: role must be agent-fe');
        assert.equal(result.status, 'assigned', 'scenario 1: status must flip to assigned');
        assert.equal(result.assigned_agent_instance_id, fe.id,
            'scenario 1: assigned_agent_instance_id must point at the agent-fe row');

        const after = await getItem(pool, id);
        assert.equal(after.status, 'assigned');
        assert.equal(after.assigned_agent_instance_id, fe.id);
    }

    // ------------------------------------------------------------------
    // Scenario 2: every classifier task_class routes to a real
    //   agent_instance. Loops the entire ROUTING_TABLE keyspace and
    //   verifies the DB lookup succeeds for each. Catches routing-table
    //   drift from the agent_instances seed without writing one test
    //   per row.
    // ------------------------------------------------------------------
    {
        const cases = [
            ['api_development',            'agent-srv'],
            ['webhook_integration',        'agent-srv'],
            ['database_migration',         'agent-srv'],
            ['auth_policy',                'agent-srv'],
            ['payment_integration',        'agent-srv'],
            ['security_policy',            'agent-srv'],
            ['documentation_architecture', 'fix-agent'],
            ['test_addition',              'qa-agent'],
            ['general_task',               'agent-srv'],
        ];
        let i = 0;
        for (const [taskClass, expectedRole] of cases) {
            i += 1;
            const id = await insertItem(pool, {
                taskId: `2:${i}:${taskClass}`,
                title: `dispatch ${taskClass}`,
                task_class: taskClass,
            });
            const expected = await getAgentByRole(pool, expectedRole);
            const result = await assignAgent(pool, id);
            assert.equal(result.role, expectedRole,
                `scenario 2: ${taskClass} must route to ${expectedRole}`);
            assert.equal(result.assigned_agent_instance_id, expected.id,
                `scenario 2: ${taskClass} must be assigned to the ${expectedRole} agent_instance`);
            assert.equal(result.status, 'assigned',
                `scenario 2: ${taskClass} item must transition to 'assigned'`);
        }
    }

    // ------------------------------------------------------------------
    // Scenario 3: unknown task_class throws. The work item is left
    //   unchanged (rollback) so the orchestrator can surface the
    //   routing failure without a half-applied write.
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: '3:unknown', title: 'mystery class',
            task_class: 'not_a_real_class',
        });

        await assert.rejects(
            () => assignAgent(pool, id),
            /no route for task_class/i,
            'scenario 3: unknown task_class must throw',
        );

        const after = await getItem(pool, id);
        assert.equal(after.status, 'planned',
            'scenario 3: status must NOT have flipped on a routing failure');
        assert.equal(after.assigned_agent_instance_id, null,
            'scenario 3: no agent must be assigned on a routing failure');
    }

    // ------------------------------------------------------------------
    // Scenario 4: missing task_class throws.
    //   A row that was queued before the classifier ran cannot be
    //   assigned. The error names the missing prerequisite so the
    //   operator knows to run the classifier first.
    // ------------------------------------------------------------------
    {
        const r = await pool.query(
            `INSERT INTO public.work_queue_items (
                tenant_id, division_id, workspace_id,
                task_id, title, domain,
                risk_level, status, priority,
                labels
             ) VALUES (
                $1, $2, $3,
                $4, $5, 'backend',
                'LOW'::risk_level, 'planned'::work_queue_status, 100,
                '{}'::text[]
             )
             RETURNING id`,
            [
                DEMO_TENANT_ID, DEMO_DIVISION_ID, DEMO_WORKSPACE_ID,
                TEST_PREFIX + '4:no-class', 'unclassified item',
            ],
        );
        const id = r.rows[0].id;

        await assert.rejects(
            () => assignAgent(pool, id),
            /run the classifier first/i,
            'scenario 4: assignAgent on an unclassified item must throw',
        );

        const after = await getItem(pool, id);
        assert.equal(after.status, 'planned');
        assert.equal(after.assigned_agent_instance_id, null);
    }

    // ------------------------------------------------------------------
    // Scenario 5: unknown work item id throws.
    // ------------------------------------------------------------------
    {
        const missing = '00000000-0000-0000-0000-0000000ffff0';
        await assert.rejects(
            () => assignAgent(pool, missing),
            /work item not found/i,
            'scenario 5: assignAgent on a missing id must throw',
        );
    }

    process.stdout.write('assigner: all tests passed\n');
} catch (err) {
    process.stderr.write(`assigner test failed: ${err.stack || err.message}\n`);
    process.exitCode = 1;
} finally {
    try { await deleteTestRows(pool); } catch (_) { /* ignore */ }
    await pool.end();
}
