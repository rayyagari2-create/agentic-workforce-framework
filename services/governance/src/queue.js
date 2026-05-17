// ============================================================================
// services/governance/src/queue.js
// E0-06: Priority queue with SELECT FOR UPDATE SKIP LOCKED.
//
// One export:
//
//   claimNextEligibleItem(pool, workspaceId)
//       Atomically claim the highest priority eligible work item in the
//       workspace and transition it from 'classified' to 'planned'.
//
// Eligibility
//   A row is eligible if risk_level <> 'CRITICAL' AND one of:
//     - status = 'classified' AND claimed_at IS NULL
//         Fresh row: intake + classifier have both run, never been claimed.
//     - status = 'planned'    AND claimed_at < NOW() - 30 minutes
//         Stale claim: a prior worker claimed it but crashed or stalled
//         before completing. The row is re-claimable.
//   Critical-risk items are never claimed by this queue; they route through
//   the approval gate instead.
//
// Atomicity
//   The claim runs in its own transaction. The SELECT takes a row lock with
//   FOR UPDATE SKIP LOCKED so concurrent callers never block on each other
//   and never see the same row twice: caller B sees only rows that caller A
//   has not already locked. The UPDATE flips status to 'planned' and stamps
//   claimed_at = NOW() while the lock is held; COMMIT releases the lock and
//   makes the claim visible.
//
// Ordering
//   ORDER BY priority DESC, created_at ASC. Higher priority wins; ties go
//   to whichever item entered the queue first.
//
// Return value
//   The claimed row (id, task_id, title, risk_level, status, claimed_at,
//   priority) when something was claimed, or null when nothing was
//   eligible. Null is not an error: it just means the queue is drained.
// ============================================================================

const STALE_INTERVAL_SQL = "INTERVAL '30 minutes'";

const SELECT_SQL = `
    SELECT id, task_id, title, risk_level, priority, created_at
      FROM public.work_queue_items
     WHERE workspace_id = $1
       AND risk_level <> 'CRITICAL'
       AND (
                (status = 'classified' AND claimed_at IS NULL)
             OR (status = 'planned'    AND claimed_at < NOW() - ${STALE_INTERVAL_SQL})
           )
     ORDER BY priority DESC, created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED
`;

const UPDATE_SQL = `
    UPDATE public.work_queue_items
       SET status = 'planned',
           claimed_at = NOW()
     WHERE id = $1
 RETURNING id, task_id, title, risk_level, status, claimed_at, priority
`;

export async function claimNextEligibleItem(pool, workspaceId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const picked = await client.query(SELECT_SQL, [workspaceId]);
        if (picked.rows.length === 0) {
            await client.query('COMMIT');
            return null;
        }
        const claimed = await client.query(UPDATE_SQL, [picked.rows[0].id]);
        await client.query('COMMIT');
        return claimed.rows[0];
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}
