// services/governance/test/conflict-graph.test.js
//
// Exercises the four scenarios called out in the E1-02 spec:
//   1. items with no shared files land in Wave 1
//   2. items sharing a file land in Wave 2 with a conflict annotation
//   3. high-severity files (payment, auth, webhook) are flagged 'high'
//   4. Wave 2 has a deterministic merge_order for conflicting items
//
// Runs as a plain script: `node test/conflict-graph.test.js`.
// Non-zero exit indicates failure. Uses node:assert/strict to match the
// other governance tests.

import assert from 'node:assert/strict';
import { ConflictGraph, estimateFiles } from '../src/conflict-graph.js';

// ---------------------------------------------------------------------------
// Test 1: items with no shared files go to Wave 1, no conflicts, parallel-safe.
// ---------------------------------------------------------------------------
{
    const graph = new ConflictGraph();
    const wiUi   = { id: 'WI-UI',   task_class: 'ui_refactor' };
    const wiDocs = { id: 'WI-DOCS', task_class: 'documentation_architecture' };

    graph.addWorkItem(wiUi,   estimateFiles('ui_refactor'));
    graph.addWorkItem(wiDocs, estimateFiles('documentation_architecture'));

    const conflicts = graph.computeConflicts();
    assert.deepEqual(conflicts, [], 'test 1: no shared files → no conflicts');

    const waves = graph.buildWaves([wiUi, wiDocs], conflicts);
    assert.equal(waves.length, 1, 'test 1: only Wave 1 is produced');
    assert.equal(waves[0].wave, 1);
    assert.equal(waves[0].safe_for_parallel, true);
    assert.equal(waves[0].work_items.length, 2);
    assert.deepEqual(
        waves[0].work_items.map((w) => w.id).sort(),
        ['WI-DOCS', 'WI-UI'],
    );
}

// ---------------------------------------------------------------------------
// Test 2: items sharing a file go to Wave 2 with a conflict annotation.
// ---------------------------------------------------------------------------
{
    const graph = new ConflictGraph();
    const wiA = { id: 'WI-A', task_class: 'api_development' };
    const wiB = { id: 'WI-B', task_class: 'api_development' };

    // Both items touch src/routes/; only WI-A touches src/controllers/;
    // only WI-B touches src/services/.
    graph.addWorkItem(wiA, ['src/routes/', 'src/controllers/']);
    graph.addWorkItem(wiB, ['src/routes/', 'src/services/']);

    const conflicts = graph.computeConflicts();
    assert.equal(conflicts.length, 1, 'test 2: exactly one conflicting file');
    assert.equal(conflicts[0].file, 'src/routes/');
    assert.deepEqual(
        conflicts[0].work_item_ids.slice().sort(),
        ['WI-A', 'WI-B'],
        'test 2: conflict cites both work items',
    );

    const waves = graph.buildWaves([wiA, wiB], conflicts);
    assert.equal(waves.length, 1, 'test 2: only Wave 2 (no parallel-safe items)');
    assert.equal(waves[0].wave, 2);
    assert.equal(waves[0].safe_for_parallel, false);
    assert.equal(waves[0].conflicts.length, 1);
    assert.equal(waves[0].conflicts[0].file, 'src/routes/');
}

// ---------------------------------------------------------------------------
// Test 3: high-severity files (payment, auth, webhook) are flagged correctly.
// ---------------------------------------------------------------------------
{
    const graph = new ConflictGraph();
    // Each pair shares a file so it shows up in computeConflicts().
    graph.addWorkItem({ id: 'AUTH-1' }, ['src/auth/login.js']);
    graph.addWorkItem({ id: 'AUTH-2' }, ['src/auth/login.js']);
    graph.addWorkItem({ id: 'PAY-1' },  ['src/payment/charge.js']);
    graph.addWorkItem({ id: 'PAY-2' },  ['src/payment/charge.js']);
    graph.addWorkItem({ id: 'HOOK-1' }, ['server/webhooks/entitlement.js']);
    graph.addWorkItem({ id: 'HOOK-2' }, ['server/webhooks/entitlement.js']);
    graph.addWorkItem({ id: 'UI-1' },   ['src/components/header.js']);
    graph.addWorkItem({ id: 'UI-2' },   ['src/components/header.js']);

    const conflicts = graph.computeConflicts();
    const severityByFile = Object.fromEntries(
        conflicts.map((c) => [c.file, c.severity]),
    );

    assert.equal(severityByFile['src/auth/login.js'],              'high', 'auth → high');
    assert.equal(severityByFile['src/payment/charge.js'],          'high', 'payment → high');
    assert.equal(severityByFile['server/webhooks/entitlement.js'], 'high', 'webhook/entitlement → high');
    assert.equal(severityByFile['src/components/header.js'],       'medium', 'plain UI file → medium');
}

// ---------------------------------------------------------------------------
// Test 4: Wave 2 includes a merge_order so conflicting items are sequenced.
// ---------------------------------------------------------------------------
{
    const graph = new ConflictGraph();
    const wiFirst  = { id: 'WI-1' };
    const wiSecond = { id: 'WI-2' };
    const wiThird  = { id: 'WI-3' };

    graph.addWorkItem(wiFirst,  ['src/routes/users.js']);
    graph.addWorkItem(wiSecond, ['src/routes/users.js']);
    graph.addWorkItem(wiThird,  ['src/routes/users.js']);

    const conflicts = graph.computeConflicts();
    const waves = graph.buildWaves([wiFirst, wiSecond, wiThird], conflicts);

    assert.equal(waves.length, 1, 'test 4: only Wave 2 exists');
    const wave2 = waves[0];
    assert.equal(wave2.wave, 2);
    assert.equal(wave2.safe_for_parallel, false);
    assert.ok(Array.isArray(wave2.merge_order), 'test 4: merge_order is an array');
    assert.equal(wave2.merge_order.length, 3, 'test 4: one slot per item');
    assert.deepEqual(
        wave2.merge_order,
        ['WI-1', 'WI-2', 'WI-3'],
        'test 4: merge_order preserves registration order',
    );
    // Sanity: merge_order references the same ids as work_items.
    assert.deepEqual(
        wave2.merge_order.slice().sort(),
        wave2.work_items.map((w) => w.id).slice().sort(),
    );
}

process.stdout.write('conflict-graph: all tests passed\n');
