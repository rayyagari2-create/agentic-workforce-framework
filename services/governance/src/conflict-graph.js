// ============================================================================
// services/governance/src/conflict-graph.js
// E1-02: Conflict graph.
//
// Given a set of work items and the files each is expected to touch, decide
// which items are safe to execute in parallel and which must be sequenced.
//
// Exports:
//
//   estimateFiles(taskClass)
//       Pure function. Maps a task_class string (produced by the classifier)
//       to a list of likely file path prefixes. Same input always produces
//       the same output. Unknown classes fall back to the general_task entry.
//
//   ConflictGraph
//       Stateful builder.
//         addWorkItem(workItem, estimatedFiles)
//             Register a work item with its estimated file list. The work
//             item must carry an `id` field; everything else is opaque.
//         computeConflicts()
//             Returns an array of { file, work_item_ids, severity } entries.
//             A file is a conflict when two or more registered items name it.
//             severity is 'high' when the file path mentions a sensitive
//             pattern (auth, payment, entitlement, webhook, migration,
//             schema), 'medium' otherwise.
//         buildWaves(workItems, conflicts)
//             Returns an ordered array of wave objects. Wave 1 holds the
//             items with no conflicts and is safe for parallel execution.
//             Wave 2 holds the items that share files and must be sequenced;
//             it carries the conflicts array and a merge_order listing the
//             work item ids in the order they should land. Either wave is
//             omitted if it would be empty, so callers should not assume a
//             fixed length.
// ============================================================================

// File path patterns that bump a conflict to 'high' severity. Matched as
// case-insensitive substrings of the full file path so that
// 'server/webhooks/entitlement.js' trips both 'webhook' and 'entitlement'.
const HIGH_SEVERITY_PATTERNS = [
    'auth',
    'payment',
    'entitlement',
    'webhook',
    'migration',
    'schema',
];

// task_class → estimated file paths. Keep in sync with the rule table in
// services/governance/src/classifier.js. Directory entries end in '/' so
// they read as path prefixes; the conflict graph treats them as opaque
// strings, which is enough for Sprint 1's demo.
const FILE_ESTIMATES = {
    ui_refactor:                ['src/components/', 'src/styles/'],
    api_development:            ['src/routes/', 'src/controllers/'],
    webhook_integration:        ['src/webhooks/', 'server/webhooks/'],
    database_migration:         ['database/migrations/', 'src/models/'],
    auth_policy:                ['src/auth/', 'middleware/auth/'],
    payment_integration:        ['src/payment/', 'server/webhooks/entitlement.js'],
    security_policy:            ['src/middleware/', 'src/config/'],
    documentation_architecture: ['docs/'],
    test_addition:              ['tests/', 'src/__tests__/'],
    general_task:               ['src/'],
};

export function estimateFiles(taskClass) {
    const entry = FILE_ESTIMATES[taskClass] ?? FILE_ESTIMATES.general_task;
    // Return a fresh array so callers can mutate without poisoning the table.
    return entry.slice();
}

function severityFor(file) {
    const lower = String(file).toLowerCase();
    for (const pat of HIGH_SEVERITY_PATTERNS) {
        if (lower.includes(pat)) return 'high';
    }
    return 'medium';
}

export class ConflictGraph {
    constructor() {
        // Preserve insertion order. The merge_order produced for Wave 2
        // reuses this order, so callers get a deterministic sequence.
        this._entries = [];
    }

    addWorkItem(workItem, estimatedFiles) {
        if (workItem == null || workItem.id == null) {
            throw new Error('addWorkItem: workItem.id is required');
        }
        if (!Array.isArray(estimatedFiles)) {
            throw new Error('addWorkItem: estimatedFiles must be an array');
        }
        this._entries.push({
            id: workItem.id,
            workItem,
            files: estimatedFiles.slice(),
        });
    }

    computeConflicts() {
        // file -> ordered array of work item ids that named it. We use an
        // array rather than a Set so the output order is stable for tests.
        const byFile = new Map();
        for (const { id, files } of this._entries) {
            for (const f of files) {
                if (!byFile.has(f)) byFile.set(f, []);
                const ids = byFile.get(f);
                if (!ids.includes(id)) ids.push(id);
            }
        }

        const conflicts = [];
        for (const [file, ids] of byFile) {
            if (ids.length > 1) {
                conflicts.push({
                    file,
                    work_item_ids: ids.slice(),
                    severity: severityFor(file),
                });
            }
        }
        return conflicts;
    }

    buildWaves(workItems, conflicts) {
        const conflictedIds = new Set();
        for (const c of conflicts) {
            for (const id of c.work_item_ids) conflictedIds.add(id);
        }

        const wave1Items = workItems.filter((w) => !conflictedIds.has(w.id));
        const wave2Items = workItems.filter((w) =>  conflictedIds.has(w.id));

        const waves = [];
        if (wave1Items.length > 0) {
            waves.push({
                wave: 1,
                work_items: wave1Items,
                safe_for_parallel: true,
            });
        }
        if (wave2Items.length > 0) {
            waves.push({
                wave: 2,
                work_items: wave2Items,
                safe_for_parallel: false,
                conflicts: conflicts.slice(),
                merge_order: wave2Items.map((w) => w.id),
            });
        }
        return waves;
    }
}
