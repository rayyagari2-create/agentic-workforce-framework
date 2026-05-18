// ============================================================================
// services/execution/src/wave-executor.js
// E1-05: Multi-agent wave execution.
//
// Takes the waves produced by services/governance/src/wave-planner.js
// (Wave 1 = safe_for_parallel, Wave 2 = sequenced) and runs each work item
// through the standard lifecycle:
//
//     gitManager.createWorkspace(workItem)        ── isolate a branch/worktree
//     runtime.startTask(contract)                 ── kick off the agent run
//     runtime.getArtifacts(runId)                 ── pull what the agent did
//     gitManager.createPRMetadata(workItem, art)  ── shape the PR handoff
//
// Wave 1 runs every item via Promise.allSettled so one slow or failing item
// does not hold up the others. Wave 2 runs sequentially because its items
// touch overlapping files; merging them in parallel would corrupt the tree.
//
// Failures are isolated. If any step throws, the executor calls
// gitManager.cleanupWorkspace(workItem, 'failed') and continues with the
// remaining items. The result array preserves input order in both modes so
// downstream consumers (audit, dashboards) can correlate by index.
//
// `auditService`, `pool`, and `workspaceId` are accepted on the options
// surface for future audit-trail recording (E1-06+ scope). The executor
// does not currently call them; passing them is harmless.
// ============================================================================

const REQUIRED = ['gitManager', 'runtime'];

function requireOptions(options) {
    if (!options || typeof options !== 'object') {
        throw new Error('executeWave: options object is required');
    }
    for (const k of REQUIRED) {
        if (!options[k]) throw new Error(`executeWave: options.${k} is required`);
    }
}

// Build the work-contract object that startTask consumes. Kept here (rather
// than buried inside the lifecycle) so the shape is easy to audit and test.
function buildContract(workItem, workspace) {
    return {
        work_item_id:        workItem.id,
        task_class:          workItem.task_class,
        title:               workItem.title,
        acceptance_criteria: workItem.acceptance_criteria ?? [],
        allowed_paths:       [workspace.worktreePath],
        branch:              workspace.branchName,
    };
}

// Run a single work item end to end. On any failure, ensure the workspace
// is torn down and report a structured failure record. Never throws.
async function executeOne(workItem, { gitManager, runtime }) {
    let workspace = null;
    try {
        workspace = await gitManager.createWorkspace(workItem);

        const contract = buildContract(workItem, workspace);
        const { runId, runtimeSessionId } = await runtime.startTask(contract);

        const artifacts  = await runtime.getArtifacts(runId);
        const prMetadata = await gitManager.createPRMetadata(workItem, artifacts);

        return {
            workItem,
            status:     'success',
            runId,
            runtimeSessionId,
            artifacts,
            prMetadata,
        };
    } catch (err) {
        // Best-effort cleanup; a cleanup failure must not mask the original
        // error. The git workspace manager treats this as idempotent.
        try {
            await gitManager.cleanupWorkspace(workItem, 'failed');
        } catch { /* swallow: original error is what we report */ }

        return {
            workItem,
            status: 'failed',
            error:  err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * Execute one wave.
 *
 * @param {object} wave - { wave, work_items, safe_for_parallel, ... } from
 *   the wave planner.
 * @param {object} options - { gitManager, runtime, auditService?, pool?,
 *   workspaceId? }. gitManager and runtime are required.
 * @returns {Promise<Array<{
 *   workItem: object,
 *   status: 'success'|'failed',
 *   runId?: string,
 *   runtimeSessionId?: string,
 *   artifacts?: object,
 *   prMetadata?: object,
 *   error?: string
 * }>>}
 */
export async function executeWave(wave, options) {
    requireOptions(options);
    if (!wave || !Array.isArray(wave.work_items)) {
        throw new Error('executeWave: wave.work_items must be an array');
    }

    const items = wave.work_items;
    if (items.length === 0) return [];

    if (wave.safe_for_parallel) {
        // Promise.allSettled by construction: executeOne never throws, so
        // every entry resolves and the result array is index-aligned.
        const settled = await Promise.allSettled(
            items.map((wi) => executeOne(wi, options)),
        );
        return settled.map((s, i) =>
            s.status === 'fulfilled'
                ? s.value
                : { workItem: items[i], status: 'failed', error: String(s.reason) },
        );
    }

    // Sequential mode: each item must fully resolve before the next starts,
    // since Wave 2 items share files and merging in parallel would corrupt
    // the tree.
    const out = [];
    for (const wi of items) {
        out.push(await executeOne(wi, options));
    }
    return out;
}

/**
 * Execute every wave in order. Wave N+1 does not start until Wave N has
 * fully settled.
 */
export async function executeWaves(waves, options) {
    requireOptions(options);
    if (!Array.isArray(waves)) {
        throw new Error('executeWaves: waves must be an array');
    }
    const all = [];
    for (const wave of waves) {
        const results = await executeWave(wave, options);
        all.push({ wave: wave.wave, results });
    }
    return all;
}

export default { executeWave, executeWaves };
