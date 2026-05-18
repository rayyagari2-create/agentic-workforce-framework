// services/execution/test/wave-executor.test.js
//
// Exercises services/execution/src/wave-executor.js with a mock
// GitWorkspaceManager and the real SimulatedRuntimeAdapter (no
// network, no real git worktrees). Run as:
//   node test/wave-executor.test.js
// Non-zero exit = failure.
//
// Tests:
//   1. Wave 1 items execute in parallel (proved by a 3-way barrier — if
//      execution were serial the barrier would deadlock and the test would
//      hang).
//   2. Wave 2 items execute sequentially (each item's full lifecycle ends
//      before the next item's lifecycle begins).
//   3. A failing item does not stop the others (failure isolation).
//   4. Cleanup is called on failed items and NOT on successful ones.

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { SimulatedRuntimeAdapter } from '../src/adapters/simulated.js';
import { executeWave, executeWaves } from '../src/wave-executor.js';

// --- mock GitWorkspaceManager -----------------------------------------------
// Mirrors the surface the executor depends on. `hooks` lets each test
// inject per-method behavior (delays, throws, instrumentation) without
// re-implementing the mock.
function makeMockGitManager(hooks = {}) {
    const calls = {
        createWorkspace: [],
        createPRMetadata: [],
        cleanupWorkspace: [],
    };
    return {
        calls,
        async createWorkspace(workItem) {
            calls.createWorkspace.push(workItem.id);
            if (hooks.createWorkspace) await hooks.createWorkspace(workItem);
            return {
                branchName:   `awf/${workItem.id}-mock`,
                worktreePath: `/tmp/awf-mock/${workItem.id}`,
                baseCommit:   'a'.repeat(40),
            };
        },
        async createPRMetadata(workItem, artifacts) {
            calls.createPRMetadata.push(workItem.id);
            if (hooks.createPRMetadata) await hooks.createPRMetadata(workItem);
            return {
                branch: `awf/${workItem.id}-mock`,
                base:   'main',
                title:  workItem.title,
                body:   artifacts?.handoff_note ?? '',
                files_changed: artifacts?.files_changed ?? [],
            };
        },
        async cleanupWorkspace(workItem, reason) {
            calls.cleanupWorkspace.push({ id: workItem.id, reason });
            if (hooks.cleanupWorkspace) await hooks.cleanupWorkspace(workItem, reason);
        },
    };
}

function makeItems(ids) {
    return ids.map((id, i) => ({
        id,
        task_id:             `WI-${id}`,
        title:               `Item ${id}`,
        task_class:          'general_task',
        risk_level:          'LOW',
        acceptance_criteria: [`criterion-${i}`],
    }));
}

// --- Test 1: Wave 1 items execute in parallel -------------------------------
// Strategy: every createWorkspace call awaits a shared barrier. The
// barrier only resolves once all 3 items have entered it. If the executor
// were serial, item 1 would block forever waiting on the barrier (because
// items 2 and 3 would never start), the timeout would trip, and the test
// would fail. Reaching the post-await assertions IS the proof of parallelism.
async function test_wave1_parallel() {
    const items = makeItems(['a', 'b', 'c']);
    const expected = items.length;
    let entered = 0;
    let openBarrier;
    const barrier = new Promise((res) => { openBarrier = res; });

    const gitManager = makeMockGitManager({
        async createWorkspace() {
            entered++;
            if (entered === expected) openBarrier();
            // Hard ceiling so a regression to serial execution fails fast
            // instead of hanging the suite.
            await Promise.race([
                barrier,
                delay(2000).then(() => { throw new Error('barrier timeout (serial execution detected)'); }),
            ]);
        },
    });

    const runtime = new SimulatedRuntimeAdapter();
    const wave = { wave: 1, work_items: items, safe_for_parallel: true };

    const results = await executeWave(wave, { gitManager, runtime });

    assert.equal(entered, expected, 'all 3 items must reach createWorkspace concurrently');
    assert.equal(results.length, expected);
    assert.deepEqual(
        results.map((r) => r.status),
        ['success', 'success', 'success'],
        'every Wave 1 item must succeed against the simulated runtime',
    );

    // Result order preserves input order so audit can correlate by index.
    assert.deepEqual(results.map((r) => r.workItem.id), ['a', 'b', 'c']);

    // Each successful result carries artifacts and PR metadata.
    for (const r of results) {
        assert.ok(r.artifacts,  'artifacts must be present on success');
        assert.ok(r.prMetadata, 'prMetadata must be present on success');
        assert.equal(r.prMetadata.base, 'main');
    }

    // No failures means cleanup must never be called.
    assert.equal(gitManager.calls.cleanupWorkspace.length, 0);

    console.log('PASS  test_wave1_parallel');
}

// --- Test 2: Wave 2 items execute sequentially ------------------------------
// Records every lifecycle event in order and asserts that each item's
// createPRMetadata (the final step) appears before the next item's
// createWorkspace. Sequential execution is the only way that ordering
// is observable.
async function test_wave2_sequential() {
    const items = makeItems(['x', 'y', 'z']);
    const events = [];

    const gitManager = makeMockGitManager({
        async createWorkspace(wi)   { events.push(`start:${wi.id}`); await delay(5); },
        async createPRMetadata(wi)  { events.push(`end:${wi.id}`); },
    });

    const runtime = new SimulatedRuntimeAdapter();
    const wave = { wave: 2, work_items: items, safe_for_parallel: false };

    const results = await executeWave(wave, { gitManager, runtime });

    assert.deepEqual(
        events,
        ['start:x', 'end:x', 'start:y', 'end:y', 'start:z', 'end:z'],
        'each item must complete before the next item starts',
    );
    assert.equal(results.length, 3);
    assert.deepEqual(results.map((r) => r.status), ['success', 'success', 'success']);
    assert.deepEqual(results.map((r) => r.workItem.id), ['x', 'y', 'z']);

    console.log('PASS  test_wave2_sequential');
}

// --- Test 3: failure isolation ---------------------------------------------
// Item 'b' fails inside the runtime; items 'a' and 'c' must still succeed.
// Verified for BOTH parallel (Wave 1) and sequential (Wave 2) modes via
// executeWaves so a regression that only handles one branch cannot pass.
async function test_failure_isolation() {
    const wave1 = makeItems(['a', 'b', 'c']);
    const wave2 = makeItems(['x', 'y', 'z']);
    wave2[1].id = 'y'; // ensure stable ids

    const gitManager = makeMockGitManager();
    const runtime = new SimulatedRuntimeAdapter();

    // Wrap startTask so item 'b' (wave 1) and item 'y' (wave 2) blow up,
    // leaving the surrounding items untouched.
    const realStart = runtime.startTask.bind(runtime);
    runtime.startTask = async (contract) => {
        if (contract.work_item_id === 'b' || contract.work_item_id === 'y') {
            throw new Error(`boom for ${contract.work_item_id}`);
        }
        return realStart(contract);
    };

    const waves = [
        { wave: 1, work_items: wave1, safe_for_parallel: true },
        { wave: 2, work_items: wave2, safe_for_parallel: false },
    ];
    const out = await executeWaves(waves, { gitManager, runtime });

    assert.equal(out.length, 2);

    // Wave 1: 'a' and 'c' succeed, 'b' fails — and the survivors finish
    // even though 'b' threw mid-wave.
    const r1 = out[0].results;
    assert.deepEqual(
        r1.map((r) => [r.workItem.id, r.status]),
        [['a', 'success'], ['b', 'failed'], ['c', 'success']],
        'Wave 1 must isolate the failure of b',
    );
    const failedA = r1.find((r) => r.workItem.id === 'b');
    assert.match(failedA.error, /boom for b/);

    // Wave 2: same shape but executed sequentially. The failure of 'y'
    // must NOT prevent 'z' from running.
    const r2 = out[1].results;
    assert.deepEqual(
        r2.map((r) => [r.workItem.id, r.status]),
        [['x', 'success'], ['y', 'failed'], ['z', 'success']],
        'Wave 2 must isolate the failure of y and still run z',
    );
    const failedY = r2.find((r) => r.workItem.id === 'y');
    assert.match(failedY.error, /boom for y/);

    console.log('PASS  test_failure_isolation');
}

// --- Test 4: cleanup is called on failure, skipped on success --------------
async function test_cleanup_on_failure() {
    const items = makeItems(['ok1', 'fail', 'ok2']);
    const gitManager = makeMockGitManager();
    const runtime = new SimulatedRuntimeAdapter();

    const realStart = runtime.startTask.bind(runtime);
    runtime.startTask = async (contract) => {
        if (contract.work_item_id === 'fail') throw new Error('runtime exploded');
        return realStart(contract);
    };

    const wave = { wave: 1, work_items: items, safe_for_parallel: true };
    const results = await executeWave(wave, { gitManager, runtime });

    // The failed item is cleaned up exactly once with reason='failed'; the
    // two successful items must never appear in the cleanup log.
    assert.equal(gitManager.calls.cleanupWorkspace.length, 1, 'cleanup must run once');
    assert.deepEqual(gitManager.calls.cleanupWorkspace[0], { id: 'fail', reason: 'failed' });

    const successIds = results.filter((r) => r.status === 'success').map((r) => r.workItem.id);
    assert.deepEqual(successIds.sort(), ['ok1', 'ok2']);

    const cleanedIds = gitManager.calls.cleanupWorkspace.map((c) => c.id);
    assert.ok(!cleanedIds.includes('ok1'), 'ok1 must NOT be cleaned up');
    assert.ok(!cleanedIds.includes('ok2'), 'ok2 must NOT be cleaned up');

    // Cleanup is best-effort: even if it throws, the failure is still
    // surfaced and the wave keeps going. Verify that contract too.
    const items2 = makeItems(['boom']);
    const cleanupThrows = makeMockGitManager({
        cleanupWorkspace: async () => { throw new Error('cleanup also exploded'); },
    });
    const runtime2 = new SimulatedRuntimeAdapter();
    runtime2.startTask = async () => { throw new Error('runtime exploded'); };

    const res2 = await executeWave(
        { wave: 1, work_items: items2, safe_for_parallel: true },
        { gitManager: cleanupThrows, runtime: runtime2 },
    );
    assert.equal(res2[0].status, 'failed');
    assert.match(res2[0].error, /runtime exploded/, 'original error wins, cleanup error is swallowed');

    console.log('PASS  test_cleanup_on_failure');
}

let failed = false;
for (const t of [
    test_wave1_parallel,
    test_wave2_sequential,
    test_failure_isolation,
    test_cleanup_on_failure,
]) {
    try {
        await t();
    } catch (err) {
        failed = true;
        console.error(`FAIL  ${t.name}\n${err && err.stack ? err.stack : err}`);
    }
}

if (failed) {
    process.exit(1);
}
process.stdout.write('\nwave-executor.test.js: all 4 tests passed\n');
