// ============================================================================
// services/execution/src/runtime-interface.js
//
// AWFAgentRuntime v1.0
//
// Abstract interface that every agent runtime adapter implements. The
// orchestrator depends only on this surface, so a new runtime is plugged in
// by writing a subclass that fulfills these methods. No vendor or product
// names appear here by design: the interface is the contract, and the
// contract is portable.
//
// Method surface (v1.0)
//   1. startTask(contract)         -> { runId, runtimeSessionId }
//   2. getStatus(runId)            -> { status, progress }
//   3. cancelTask(runId, reason)   -> void
//   4. getArtifacts(runId)         -> { files_changed, diff_summary, ... }
//   5. onEvent(handler)            -> void
//   6. get runtimeId               -> string
//   7. getCapabilities()           -> { canCreateBranch, canCreatePR, ... }
//
// Subclasses MUST override every method. The base class throws
// 'Not implemented' to make missing overrides fail loud, not silent.
// ============================================================================

export class AWFAgentRuntime {
    /**
     * Start a new task on the runtime.
     *
     * @param {object} contract - The work contract describing what the
     *   runtime should do. Shape is defined by the orchestrator's work
     *   intake schema and is opaque to this interface.
     * @returns {Promise<{runId: string, runtimeSessionId: string}>}
     *   `runId` is the AWF side identifier (ULID). `runtimeSessionId` is
     *   the runtime's own session handle, used for correlation in logs
     *   and audit records.
     */
    async startTask(contract) {
        throw new Error('Not implemented');
    }

    /**
     * Get the current status of a running or completed task.
     *
     * @param {string} runId - The AWF side identifier returned by
     *   `startTask`.
     * @returns {Promise<{status: string, progress: number}>}
     *   `status` is one of: 'queued', 'running', 'succeeded', 'failed',
     *   'canceled'. `progress` is a number in [0, 1].
     */
    async getStatus(runId) {
        throw new Error('Not implemented');
    }

    /**
     * Cancel a running task. Idempotent: calling on an already terminal
     * run is a no op.
     *
     * @param {string} runId - The AWF side identifier.
     * @param {string} reason - Free text reason recorded on the audit
     *   trail.
     * @returns {Promise<void>}
     */
    async cancelTask(runId, reason) {
        throw new Error('Not implemented');
    }

    /**
     * Fetch the artifacts produced by a task.
     *
     * @param {string} runId - The AWF side identifier.
     * @returns {Promise<{
     *   files_changed: string[],
     *   diff_summary: string,
     *   commands_run: string[],
     *   tests_run: object[],
     *   handoff_note: string,
     *   pr_url?: string,
     *   evidence?: object
     * }>}
     *   `pr_url` is present only when the runtime can open pull
     *   requests (see `getCapabilities`). `evidence` carries any
     *   runtime specific proofs the scorer or QA stage may need.
     */
    async getArtifacts(runId) {
        throw new Error('Not implemented');
    }

    /**
     * Subscribe to runtime events for the lifetime of this adapter.
     *
     * @param {(event: object) => void} handler - Called for each event
     *   the runtime emits. Event shape is runtime defined but MUST
     *   include `runId` and `type` so the orchestrator can route.
     * @returns {void}
     */
    onEvent(handler) {
        throw new Error('Not implemented');
    }

    /**
     * Stable short identifier for this runtime. Used in audit records,
     * routing decisions, and capability lookups. Example values:
     * 'simulated', 'mock', 'local'.
     *
     * @returns {string}
     */
    get runtimeId() {
        throw new Error('Not implemented');
    }

    /**
     * Declare what this runtime can do. The orchestrator reads this to
     * decide whether to dispatch a contract here (e.g., a PR producing
     * contract requires `canCreatePR: true`).
     *
     * @returns {{
     *   canCreateBranch: boolean,
     *   canCreatePR: boolean,
     *   supportsWebhooks: boolean,
     *   supportsStreaming: boolean,
     *   maxParallelTasks: number
     * }}
     */
    getCapabilities() {
        throw new Error('Not implemented');
    }
}
