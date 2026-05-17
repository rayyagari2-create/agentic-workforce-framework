// ============================================================================
// services/governance/src/assigner.js
// E0-08: Agent assignment.
//
// Two exports:
//
//   routeToRole(taskClass)
//       Pure function. Given a task_class string, returns the agent role
//       responsible for that class, or null when the class is unknown.
//       No DB calls. Same input always produces the same output. The full
//       table is documented in ROUTING_TABLE below.
//
//   assignAgent(pool, workItemId)
//       Reads task_class from the work item, resolves the role via
//       routeToRole, finds the agent_instance with that role in the work
//       item's workspace, writes assigned_agent_instance_id, and flips
//       work_queue_items.status to 'assigned'. One transaction.
//
//       Returns { id, status, assigned_agent_instance_id, task_class,
//       role }.
//
//       Throws on: unknown work item, missing task_class, unroutable
//       task_class, or no agent_instance in the workspace for the
//       resolved role. The throws are loud on purpose: a silent skip
//       here turns into a stranded work item that the queue never claims
//       again.
//
// Routing scope
//   The orchestrator does the assigning. It is never an assignee, so it
//   does not appear in ROUTING_TABLE. The Sprint 0 demo's four
//   assignable roles are agent-fe, agent-srv, fix-agent, qa-agent.
// ============================================================================

// task_class -> role. Keep in sync with the classifier's task_class
// outputs (services/governance/src/classifier.js) and the agent_instances
// rows seeded in 007_agent_assignment.sql.
const ROUTING_TABLE = {
    ui_refactor:                'agent-fe',
    api_development:            'agent-srv',
    webhook_integration:        'agent-srv',
    database_migration:         'agent-srv',
    auth_policy:                'agent-srv',
    payment_integration:        'agent-srv',
    security_policy:            'agent-srv',
    documentation_architecture: 'fix-agent',
    test_addition:              'qa-agent',
    general_task:               'agent-srv',
};

export function routeToRole(taskClass) {
    if (typeof taskClass !== 'string') return null;
    return ROUTING_TABLE[taskClass] ?? null;
}

const FETCH_ITEM_SQL = `
    SELECT id, workspace_id, task_class, status
      FROM public.work_queue_items
     WHERE id = $1
`;

const FETCH_AGENT_SQL = `
    SELECT id, role
      FROM public.agent_instances
     WHERE workspace_id = $1 AND role = $2
     LIMIT 1
`;

const ASSIGN_SQL = `
    UPDATE public.work_queue_items
       SET assigned_agent_instance_id = $2,
           status = 'assigned'::work_queue_status
     WHERE id = $1
 RETURNING id, status, assigned_agent_instance_id, task_class
`;

export async function assignAgent(pool, workItemId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const itemQ = await client.query(FETCH_ITEM_SQL, [workItemId]);
        if (itemQ.rows.length === 0) {
            throw new Error(`work item not found: ${workItemId}`);
        }
        const item = itemQ.rows[0];

        if (!item.task_class) {
            throw new Error(`work item ${workItemId} has no task_class; run the classifier first`);
        }

        const role = routeToRole(item.task_class);
        if (!role) {
            throw new Error(`no route for task_class: ${item.task_class}`);
        }

        const agentQ = await client.query(FETCH_AGENT_SQL, [item.workspace_id, role]);
        if (agentQ.rows.length === 0) {
            throw new Error(
                `no agent_instance for role '${role}' in workspace ${item.workspace_id}`,
            );
        }
        const agentId = agentQ.rows[0].id;

        const updQ = await client.query(ASSIGN_SQL, [workItemId, agentId]);
        await client.query('COMMIT');

        return { ...updQ.rows[0], role };
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
    } finally {
        client.release();
    }
}
