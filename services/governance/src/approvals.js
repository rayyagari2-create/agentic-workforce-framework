// ============================================================================
// services/governance/src/approvals.js
// E0-07: Single approval gate.
//
// Five exports:
//
//   requiresApproval(workItem)
//       Pure function. Returns true when workItem.risk_level is high or
//       critical (case-insensitive), false otherwise. No DB calls.
//
//   requestApproval(pool, workItemId, requiredRole)
//       Inserts a pending row into public.approval_requests for the work
//       item, and flips work_queue_items.status to 'pending_approval'. The
//       request inherits tenant_id, division_id, workspace_id, and
//       risk_level from the parent work item so a reader of
//       approval_requests never has to join back to know the gate scope.
//       Runs in one transaction; either both writes land or neither does.
//       Returns the inserted approval_request row.
//
//   approveItem(pool, workItemId, approvedBy, note)
//       Approves the most recently requested pending approval for the
//       work item. Sets approval_requests.status='approved', stamps
//       approver_id, rationale, and decided_at. Flips
//       work_queue_items.status to 'approved'. One transaction.
//
//   rejectItem(pool, workItemId, rejectedBy, note)
//       Mirror of approveItem for the deny path. Sets
//       approval_requests.status='rejected' and
//       work_queue_items.status='blocked'.
//
//   blockIfUnapproved(pool, workItemId)
//       Guard the runtime calls before handing the item to an agent.
//       Reads risk_level for the item. If the item is high or critical
//       risk and there is no approved approval_request for it, throws an
//       Error. Items that do not require approval pass through
//       unconditionally. Returns true when the item is clear to proceed.
//
// Status mapping notes
//   risk_level on work_queue_items is stored as the upper-case ENUM
//   ('HIGH', 'CRITICAL', ...). requiresApproval accepts either casing so
//   callers can pass either the DB row or a classifier output.
//   work_queue_items.status uses the work_queue_status enum; 'blocked' is
//   added by 006_approval_gate.sql.
// ============================================================================

const HIGH_RISK = new Set(['HIGH', 'CRITICAL']);

export function requiresApproval(workItem) {
    const raw = workItem?.risk_level;
    if (typeof raw !== 'string') return false;
    return HIGH_RISK.has(raw.toUpperCase());
}

const FETCH_ITEM_SQL = `
    SELECT id, tenant_id, division_id, workspace_id, risk_level, status
      FROM public.work_queue_items
     WHERE id = $1
`;

const INSERT_REQUEST_SQL = `
    INSERT INTO public.approval_requests (
        tenant_id, division_id, workspace_id,
        work_queue_item_id, risk_level, status,
        requested_by, required_role
    ) VALUES (
        $1, $2, $3,
        $4, $5::risk_level, 'pending',
        'system', $6
    )
    RETURNING id, work_queue_item_id, risk_level, status,
              requested_by, required_role, requested_at
`;

const SET_ITEM_STATUS_SQL = `
    UPDATE public.work_queue_items
       SET status = $2::work_queue_status
     WHERE id = $1
 RETURNING id, status
`;

// Latest pending request for a work item. There is only one open gate at
// a time in Sprint 0, but ORDER BY requested_at DESC LIMIT 1 keeps the
// query well defined if a future sprint allows re-requests after a
// rejection.
const LATEST_PENDING_REQUEST_SQL = `
    SELECT id
      FROM public.approval_requests
     WHERE work_queue_item_id = $1 AND status = 'pending'
     ORDER BY requested_at DESC
     LIMIT 1
`;

const DECIDE_REQUEST_SQL = `
    UPDATE public.approval_requests
       SET status = $2::approval_status,
           approver_id = $3,
           rationale = $4,
           decided_at = NOW()
     WHERE id = $1
 RETURNING id, status, approver_id, rationale, decided_at
`;

const HAS_APPROVED_REQUEST_SQL = `
    SELECT 1
      FROM public.approval_requests
     WHERE work_queue_item_id = $1 AND status = 'approved'
     LIMIT 1
`;

async function loadItem(client, workItemId) {
    const r = await client.query(FETCH_ITEM_SQL, [workItemId]);
    if (r.rows.length === 0) {
        throw new Error(`work item not found: ${workItemId}`);
    }
    return r.rows[0];
}

export async function requestApproval(pool, workItemId, requiredRole) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const item = await loadItem(client, workItemId);
        const ins = await client.query(INSERT_REQUEST_SQL, [
            item.tenant_id, item.division_id, item.workspace_id,
            item.id, item.risk_level, requiredRole ?? null,
        ]);
        await client.query(SET_ITEM_STATUS_SQL, [item.id, 'pending_approval']);
        await client.query('COMMIT');
        return ins.rows[0];
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

async function decide(pool, workItemId, decision, deciderId, note, newItemStatus) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const pending = await client.query(LATEST_PENDING_REQUEST_SQL, [workItemId]);
        if (pending.rows.length === 0) {
            throw new Error(`no pending approval request for work item: ${workItemId}`);
        }
        const requestId = pending.rows[0].id;
        const upd = await client.query(DECIDE_REQUEST_SQL, [
            requestId, decision, deciderId, note ?? null,
        ]);
        await client.query(SET_ITEM_STATUS_SQL, [workItemId, newItemStatus]);
        await client.query('COMMIT');
        return upd.rows[0];
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}

export async function approveItem(pool, workItemId, approvedBy, note) {
    return decide(pool, workItemId, 'approved', approvedBy, note, 'approved');
}

export async function rejectItem(pool, workItemId, rejectedBy, note) {
    return decide(pool, workItemId, 'rejected', rejectedBy, note, 'blocked');
}

export async function blockIfUnapproved(pool, workItemId) {
    const client = await pool.connect();
    try {
        const item = await loadItem(client, workItemId);
        if (!requiresApproval(item)) return true;
        const approved = await client.query(HAS_APPROVED_REQUEST_SQL, [item.id]);
        if (approved.rows.length === 0) {
            throw new Error(
                `work item ${workItemId} is ${item.risk_level} risk and has no approved approval_request`,
            );
        }
        return true;
    } finally {
        client.release();
    }
}
