// services/governance/src/workspace-context.js
//
// Workspace context wrapper for Postgres RLS (E2-01).
//
// Every database transaction the application opens must declare which
// workspace it is operating in. The RLS policies installed by
// database/migrations/010_row_level_security.sql read these values via
// current_setting('awf.workspace_id') and current_setting('awf.tenant_id')
// and filter every row that does not match.
//
// Usage
//   await withWorkspaceContext(pool, workspaceId, tenantId, async (client) => {
//       const r = await client.query('SELECT * FROM work_queue_items');
//       ...
//   });
//
// The callback receives the bound client. All queries against
// workspace-scoped tables must go through that client and must execute
// before the callback returns: SET LOCAL bindings only live for the
// transaction this function opened.

export async function withWorkspaceContext(pool, workspaceId, tenantId, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL awf.workspace_id = '${workspaceId}'`);
        await client.query(`SET LOCAL awf.tenant_id = '${tenantId}'`);
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
