// ============================================================================
// services/governance/src/wave-planner.js
// E1-03: Wave planner.
//
// Given a set of classified, already-assigned work items, decide which can
// run in parallel (Wave 1) and which must be sequenced because they touch
// overlapping files (Wave 2). The planner is the layer that turns the
// conflict graph from E1-02 into a persisted plan: it stamps
// work_queue_items.wave_number so the rest of the pipeline (runners,
// demo CLI, dashboards) reads a single source of truth.
//
// Exports:
//
//   planWaves(workItems, pool, workspaceId)
//       Async. workItems is an array of rows shaped like the output of the
//       classifier (id, task_id, title, task_class, risk_level, ...).
//
//         1. For each item, look up estimated files via estimateFiles().
//         2. Register the items with a ConflictGraph.
//         3. computeConflicts() and buildWaves().
//         4. Persist wave_number on every passed-in work item, scoped to
//            workspaceId so a stray id from another workspace cannot be
//            stamped by accident.
//         5. Return { waves, conflicts }.
//
//       workspaceId is required: passing it explicitly prevents the planner
//       from updating rows outside the caller's workspace if the in-memory
//       work item list was assembled incorrectly.
//
//   formatWavePlan(waves, conflicts, workItems)
//       Pure function. Produces the CLI rendering used by the demo:
//
//         Wave 1 — Safe for parallel execution (N items)
//           #<ref> <title> → <role> | <risk> risk
//         Wave 2 — Requires sequencing (N items)
//           #<ref> <title> → <role> | <risk> risk
//           Conflict: <file> (shared by #X and #Y)
//           Merge order: #X → then → #Y
//
//       Refs are work_queue_items.task_id (the human-readable identifier
//       the backlog file uses); roles come from TASK_CLASS_TO_ROLE.
// ============================================================================

import { ConflictGraph, estimateFiles } from './conflict-graph.js';
import { TASK_CLASS_TO_ROLE } from './assigner.js';

const UPDATE_WAVE_SQL = `
    UPDATE public.work_queue_items
       SET wave_number = $3
     WHERE id = $1 AND workspace_id = $2
`;

export async function planWaves(workItems, pool, workspaceId) {
    if (!Array.isArray(workItems)) {
        throw new Error('planWaves: workItems must be an array');
    }
    if (!pool) {
        throw new Error('planWaves: pool is required');
    }
    if (!workspaceId) {
        throw new Error('planWaves: workspaceId is required');
    }

    const graph = new ConflictGraph();
    for (const item of workItems) {
        graph.addWorkItem(item, estimateFiles(item.task_class));
    }
    const conflicts = graph.computeConflicts();
    const waves = graph.buildWaves(workItems, conflicts);

    // id -> wave_number. Items not in any wave (shouldn't happen with the
    // current buildWaves contract, but guard anyway) are left untouched.
    const waveById = new Map();
    for (const wave of waves) {
        for (const w of wave.work_items) {
            waveById.set(w.id, wave.wave);
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const [id, waveNumber] of waveById) {
            await client.query(UPDATE_WAVE_SQL, [id, workspaceId, waveNumber]);
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }

    return { waves, conflicts };
}

function refFor(workItem) {
    // task_id is the human-readable backlog reference (e.g. "FOO-1").
    // Fall back to id so the formatter never emits a bare '#'.
    return workItem.task_id ?? workItem.id;
}

function roleFor(workItem) {
    return TASK_CLASS_TO_ROLE[workItem.task_class] ?? 'unassigned';
}

function riskFor(workItem) {
    return workItem.risk_level ?? 'UNKNOWN';
}

export function formatWavePlan(waves, conflicts, workItems) {
    const byId = new Map(workItems.map((w) => [w.id, w]));
    const refById = (id) => {
        const wi = byId.get(id);
        return wi ? refFor(wi) : String(id);
    };

    const lines = [];

    for (const wave of waves) {
        if (wave.wave === 1) {
            lines.push(`Wave 1 — Safe for parallel execution (${wave.work_items.length} items)`);
            for (const w of wave.work_items) {
                lines.push(`  #${refFor(w)} ${w.title} → ${roleFor(w)} | ${riskFor(w)} risk`);
            }
        } else if (wave.wave === 2) {
            lines.push(`Wave 2 — Requires sequencing (${wave.work_items.length} items)`);
            for (const w of wave.work_items) {
                lines.push(`  #${refFor(w)} ${w.title} → ${roleFor(w)} | ${riskFor(w)} risk`);
            }
            for (const c of (wave.conflicts ?? conflicts)) {
                const refs = c.work_item_ids.map((id) => `#${refById(id)}`);
                lines.push(`  Conflict: ${c.file} (shared by ${refs.join(' and ')})`);
            }
            const orderRefs = (wave.merge_order ?? []).map((id) => `#${refById(id)}`);
            if (orderRefs.length > 0) {
                lines.push(`  Merge order: ${orderRefs.join(' → then → ')}`);
            }
        }
    }

    return lines.join('\n');
}
