// services/governance/test/approvals.test.js
//
// Exercises services/governance/src/approvals.js against the live awf
// database. Runs as a plain script:
//   node test/approvals.test.js
// A non zero exit indicates failure. Uses node:assert/strict to match the
// classifier and queue tests.
//
// All test rows use the 'approval-test:<phase>:<n>' task_id prefix so the
// fixtures are isolated from the real backlog and can be cleaned up in a
// single DELETE at the start (defensive) and end (cleanup) of the run.
//
// Four scenarios from the E0-07 spec are covered:
//   1. Low risk item skips the approval gate
//   2. High risk item requires approval
//   3. Approved item transitions to status 'approved'
//   4. Unapproved high risk item cannot proceed (blockIfUnapproved throws)

import assert from 'node:assert/strict';
import pg from 'pg';
import { databaseUrl } from '../src/env.js';
import {
    requiresApproval,
    requestApproval,
    approveItem,
    rejectItem,
    blockIfUnapproved,
} from '../src/approvals.js';

const { Pool } = pg;

const DEMO_TENANT_ID    = '00000000-0000-0000-0000-000000000001';
const DEMO_DIVISION_ID  = '00000000-0000-0000-0000-000000000010';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

const TEST_PREFIX = 'approval-test:';

async function deleteTestRows(pool) {
    // approval_requests cascades via ON DELETE CASCADE on work_queue_item_id,
    // but the unique constraint is on work_queue_items.task_id so we drive
    // the cleanup from the parent table.
    await pool.query(
        `DELETE FROM public.work_queue_items
          WHERE workspace_id = $1 AND task_id LIKE $2`,
        [DEMO_WORKSPACE_ID, TEST_PREFIX + '%'],
    );
}

async function insertItem(pool, { taskId, title, risk_level, status = 'classified' }) {
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
            '{}'::text[], 'test_task'
         )
         RETURNING id`,
        [
            DEMO_TENANT_ID, DEMO_DIVISION_ID, DEMO_WORKSPACE_ID,
            TEST_PREFIX + taskId, title, risk_level, status,
        ],
    );
    return r.rows[0].id;
}

async function getItem(pool, id) {
    const r = await pool.query(
        `SELECT id, task_id, status, risk_level
           FROM public.work_queue_items WHERE id = $1`,
        [id],
    );
    return r.rows[0];
}

async function getRequests(pool, workItemId) {
    const r = await pool.query(
        `SELECT id, status, approver_id, rationale, required_role,
                requested_by, decided_at
           FROM public.approval_requests
          WHERE work_queue_item_id = $1
          ORDER BY requested_at ASC`,
        [workItemId],
    );
    return r.rows;
}

const pool = new Pool({ connectionString: databaseUrl() });

try {
    await deleteTestRows(pool);

    // ------------------------------------------------------------------
    // Pure function checks for requiresApproval. Covered first so the DB
    // scenarios can rely on the gate decision.
    // ------------------------------------------------------------------
    {
        assert.equal(requiresApproval({ risk_level: 'HIGH' }),     true);
        assert.equal(requiresApproval({ risk_level: 'CRITICAL' }), true);
        assert.equal(requiresApproval({ risk_level: 'high' }),     true);
        assert.equal(requiresApproval({ risk_level: 'critical' }), true);
        assert.equal(requiresApproval({ risk_level: 'MEDIUM' }),   false);
        assert.equal(requiresApproval({ risk_level: 'LOW' }),      false);
        assert.equal(requiresApproval({}),                          false);
        assert.equal(requiresApproval(null),                        false);
    }

    // ------------------------------------------------------------------
    // Scenario 1: Low risk item skips the approval gate.
    //   blockIfUnapproved must return true (no approval needed) and the
    //   item is never required to have an approval_request row.
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: '1:low', title: 'low risk item', risk_level: 'LOW',
        });
        assert.equal(requiresApproval({ risk_level: 'LOW' }), false,
            'scenario 1: low risk must not require approval');

        const cleared = await blockIfUnapproved(pool, id);
        assert.equal(cleared, true,
            'scenario 1: blockIfUnapproved must clear a low risk item with no approval');

        const requests = await getRequests(pool, id);
        assert.equal(requests.length, 0,
            'scenario 1: no approval request should have been created');
    }

    // ------------------------------------------------------------------
    // Scenario 2: High risk item requires approval.
    //   requiresApproval returns true. requestApproval inserts a pending
    //   row and flips the work item to 'pending_approval'.
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: '2:high', title: 'high risk item', risk_level: 'HIGH',
        });

        const itemRow = await getItem(pool, id);
        assert.equal(requiresApproval(itemRow), true,
            'scenario 2: high risk must require approval');

        const req = await requestApproval(pool, id, 'engineering_lead');
        assert.ok(req.id, 'scenario 2: requestApproval must return the new row');
        assert.equal(req.status, 'pending',
            'scenario 2: new approval_request must be pending');
        assert.equal(req.required_role, 'engineering_lead',
            'scenario 2: required_role must be recorded');

        const after = await getItem(pool, id);
        assert.equal(after.status, 'pending_approval',
            'scenario 2: work item status must be pending_approval');

        const requests = await getRequests(pool, id);
        assert.equal(requests.length, 1,
            'scenario 2: exactly one approval_request must exist');
        assert.equal(requests[0].status, 'pending');
    }

    // ------------------------------------------------------------------
    // Scenario 3: Approved item transitions to status 'approved'.
    //   After requestApproval + approveItem the work item lands on
    //   'approved' and the approval_request is 'approved' with the
    //   approver_id and rationale recorded.
    // ------------------------------------------------------------------
    {
        const id = await insertItem(pool, {
            taskId: '3:approved', title: 'will be approved', risk_level: 'HIGH',
        });
        await requestApproval(pool, id, 'engineering_lead');

        const decided = await approveItem(pool, id, 'alice@example.com', 'looks good');
        assert.equal(decided.status, 'approved',
            'scenario 3: approval_request must transition to approved');
        assert.equal(decided.approver_id, 'alice@example.com');
        assert.equal(decided.rationale, 'looks good');
        assert.ok(decided.decided_at instanceof Date,
            'scenario 3: decided_at must be stamped');

        const after = await getItem(pool, id);
        assert.equal(after.status, 'approved',
            'scenario 3: work item status must transition to approved');

        // The runtime gate must now let the item through.
        const cleared = await blockIfUnapproved(pool, id);
        assert.equal(cleared, true,
            'scenario 3: blockIfUnapproved must clear an approved item');
    }

    // ------------------------------------------------------------------
    // Scenario 4: Unapproved high risk item cannot proceed.
    //   blockIfUnapproved throws when no approved approval_request
    //   exists. Also covers the rejection path: a rejected request still
    //   leaves the item unapproved, so blockIfUnapproved still throws,
    //   and the work item lands on 'blocked'.
    // ------------------------------------------------------------------
    {
        // 4a: no approval requested at all.
        const noReqId = await insertItem(pool, {
            taskId: '4a:no-req', title: 'critical with no request', risk_level: 'CRITICAL',
        });
        await assert.rejects(
            () => blockIfUnapproved(pool, noReqId),
            /no approved approval_request/i,
            'scenario 4a: blockIfUnapproved must throw when no request exists',
        );

        // 4b: pending (un-decided) request.
        const pendingId = await insertItem(pool, {
            taskId: '4b:pending', title: 'high with pending request', risk_level: 'HIGH',
        });
        await requestApproval(pool, pendingId, 'engineering_lead');
        await assert.rejects(
            () => blockIfUnapproved(pool, pendingId),
            /no approved approval_request/i,
            'scenario 4b: blockIfUnapproved must throw while request is still pending',
        );

        // 4c: rejected request leaves the item blocked, not approved.
        const rejectedId = await insertItem(pool, {
            taskId: '4c:rejected', title: 'high then rejected', risk_level: 'HIGH',
        });
        await requestApproval(pool, rejectedId, 'engineering_lead');
        const decided = await rejectItem(pool, rejectedId, 'bob@example.com', 'too risky');
        assert.equal(decided.status, 'rejected',
            'scenario 4c: approval_request must transition to rejected');

        const after = await getItem(pool, rejectedId);
        assert.equal(after.status, 'blocked',
            'scenario 4c: work item status must transition to blocked');

        await assert.rejects(
            () => blockIfUnapproved(pool, rejectedId),
            /no approved approval_request/i,
            'scenario 4c: blockIfUnapproved must throw on a rejected item',
        );
    }

    process.stdout.write('approvals: all tests passed\n');
} catch (err) {
    process.stderr.write(`approvals test failed: ${err.stack || err.message}\n`);
    process.exitCode = 1;
} finally {
    try { await deleteTestRows(pool); } catch (_) { /* ignore */ }
    await pool.end();
}
