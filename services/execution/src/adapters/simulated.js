// ============================================================================
// services/execution/src/adapters/simulated.js
//
// SimulatedRuntimeAdapter
//
// A runtime adapter that does not execute anything. It accepts contracts,
// returns plausible looking but clearly marked artifacts, and emits no real
// side effects. Every artifact string is prefixed with [PREVIEW] so a
// downstream consumer cannot mistake simulated output for real work.
//
// Use cases
//   - Sprint 0 end to end demo without a live runtime.
//   - Unit tests that exercise the orchestrator's runtime contract.
//   - Local previews of a contract before dispatching to a real runtime.
//
// This adapter is fully self contained. It holds run state in memory and
// drops it on process exit, which is the correct lifetime for a previewer.
// ============================================================================

import { randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { AWFAgentRuntime } from '../runtime-interface.js';

// Crockford base32 alphabet, as required by the ULID spec.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Encode an integer as Crockford base32, left padded to `length` chars.
 * BigInt is used because the ULID timestamp half is 48 bits.
 */
function encodeBase32(value, length) {
    let n = BigInt(value);
    const base = 32n;
    const out = new Array(length);
    for (let i = length - 1; i >= 0; i--) {
        out[i] = CROCKFORD[Number(n % base)];
        n /= base;
    }
    return out.join('');
}

/**
 * Generate a ULID: 48 bit timestamp (ms since epoch) followed by 80 bits
 * of randomness, encoded as 26 Crockford base32 characters. Implemented
 * inline to avoid adding a dependency for a one off identifier need.
 */
function ulid() {
    const time = encodeBase32(Date.now(), 10);
    const rand = randomBytes(10);
    // Treat the 10 random bytes as an 80 bit unsigned integer.
    let randInt = 0n;
    for (const b of rand) randInt = (randInt << 8n) | BigInt(b);
    return time + encodeBase32(randInt, 16);
}

export class SimulatedRuntimeAdapter extends AWFAgentRuntime {
    constructor() {
        super();
        this._runs = new Map();
        this._bus = new EventEmitter();
    }

    get runtimeId() {
        return 'simulated';
    }

    getCapabilities() {
        return {
            canCreateBranch: false,
            canCreatePR: false,
            supportsWebhooks: false,
            supportsStreaming: false,
            maxParallelTasks: 10,
        };
    }

    async startTask(contract) {
        const runId = ulid();
        const runtimeSessionId = `sim-${ulid()}`;
        const startedAt = new Date().toISOString();

        this._runs.set(runId, {
            runtimeSessionId,
            status: 'succeeded',
            progress: 1,
            startedAt,
            contract,
            artifacts: this._buildArtifacts(contract),
        });

        // Emit a single lifecycle event so a subscriber can observe that a
        // task moved through the runtime. The event shape mirrors what a
        // streaming runtime would emit.
        this._bus.emit('event', {
            runId,
            type: 'task.completed',
            runtimeId: this.runtimeId,
            at: startedAt,
        });

        return { runId, runtimeSessionId };
    }

    async getStatus(runId) {
        const run = this._runs.get(runId);
        if (!run) {
            return { status: 'unknown', progress: 0 };
        }
        return { status: run.status, progress: run.progress };
    }

    async cancelTask(runId, reason) {
        const run = this._runs.get(runId);
        if (!run) return;
        run.status = 'canceled';
        run.cancelReason = `[PREVIEW] ${reason ?? 'no reason given'}`;
    }

    async getArtifacts(runId) {
        const run = this._runs.get(runId);
        if (!run) {
            return this._buildArtifacts(null);
        }
        return run.artifacts;
    }

    onEvent(handler) {
        this._bus.on('event', handler);
    }

    _buildArtifacts(contract) {
        const title = contract?.title ?? 'preview task';
        return {
            files_changed: ['[PREVIEW] no files were modified'],
            diff_summary: `[PREVIEW] simulated diff for: ${title}`,
            commands_run: ['[PREVIEW] no commands were executed'],
            tests_run: [
                {
                    name: '[PREVIEW] simulated test',
                    status: 'passed',
                    duration_ms: 0,
                },
            ],
            handoff_note: `[PREVIEW] simulated runtime produced no real artifacts for: ${title}`,
            evidence: {
                runtimeId: this.runtimeId,
                note: '[PREVIEW] evidence is illustrative only',
            },
        };
    }
}
