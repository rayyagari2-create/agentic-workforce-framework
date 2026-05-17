// services/execution/test/simulated.test.js
//
// Exercises every method on SimulatedRuntimeAdapter end to end. Uses
// node:assert and runs as a plain script: `node test/simulated.test.js`.
// A non zero exit indicates failure.

import assert from 'node:assert/strict';
import { SimulatedRuntimeAdapter } from '../src/adapters/simulated.js';
import { AWFAgentRuntime } from '../src/runtime-interface.js';

const adapter = new SimulatedRuntimeAdapter();

// 1. is a runtime
assert.ok(adapter instanceof AWFAgentRuntime, 'must extend AWFAgentRuntime');

// 2. runtimeId
assert.equal(adapter.runtimeId, 'simulated');

// 3. getCapabilities
const caps = adapter.getCapabilities();
assert.deepEqual(caps, {
    canCreateBranch: false,
    canCreatePR: false,
    supportsWebhooks: false,
    supportsStreaming: false,
    maxParallelTasks: 10,
});

// 4. onEvent: register a handler before startTask so we observe lifecycle
const events = [];
adapter.onEvent((e) => events.push(e));

// 5. startTask
const contract = { title: 'demo contract', tenant_id: 't-1' };
const { runId, runtimeSessionId } = await adapter.startTask(contract);
assert.equal(typeof runId, 'string');
assert.equal(runId.length, 26, 'runId must be a 26 char ULID');
assert.match(runId, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'runId must be Crockford base32');
assert.ok(runtimeSessionId.startsWith('sim-'));

// 6. getStatus
const status = await adapter.getStatus(runId);
assert.equal(status.status, 'succeeded');
assert.equal(status.progress, 1);

// 7. getArtifacts: all string fields must carry the [PREVIEW] marker
const artifacts = await adapter.getArtifacts(runId);
assert.ok(Array.isArray(artifacts.files_changed));
assert.ok(artifacts.files_changed[0].includes('[PREVIEW]'));
assert.ok(artifacts.diff_summary.includes('[PREVIEW]'));
assert.ok(artifacts.commands_run[0].includes('[PREVIEW]'));
assert.ok(artifacts.handoff_note.includes('[PREVIEW]'));
assert.equal(artifacts.tests_run[0].status, 'passed');

// 8. cancelTask: idempotent on unknown id, mutates known run
await adapter.cancelTask('unknown-run', 'safety');
await adapter.cancelTask(runId, 'demo cancel');
const after = await adapter.getStatus(runId);
assert.equal(after.status, 'canceled');

// 9. event handler observed at least one event from startTask
assert.ok(events.length >= 1, 'onEvent handler should have received a lifecycle event');
assert.equal(events[0].runId, runId);
assert.equal(events[0].runtimeId, 'simulated');

process.stdout.write('simulated.test.js: all assertions passed\n');
