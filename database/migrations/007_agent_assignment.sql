-- ============================================================================
-- 007_agent_assignment.sql
-- E0-08: Agent assignment.
--
-- Extends the schema with the bits the Sprint 0 assigner needs that
-- 001_core_schema.sql did not yet have, and seeds the five demo agent
-- instances the orchestrator routes work to.
--
-- Enum value added
--   work_queue_status: 'assigned'
--       Stamped by services/governance/src/assigner.js when an item has
--       been routed to a specific agent_instance (via task_class -> role
--       mapping) but has not yet started running. Sits between 'planned'
--       (queue claim) or 'approved' (gate decision) and 'in_progress'
--       (runtime takes over).
--
-- Demo seed data
--   Five agent_instances rows in the demo workspace, one per role the
--   Sprint 0 demo needs:
--     - orchestrator   The assigner. Claims items from the queue and
--                      routes them. Never appears in the assigner's
--                      task_class -> role table because it is the
--                      assigner, not an assignee.
--     - agent-fe       Receives ui_refactor.
--     - agent-srv      Receives api_development, webhook_integration,
--                      database_migration, auth_policy,
--                      payment_integration, security_policy, and the
--                      general_task fallback.
--     - fix-agent      Receives documentation_architecture.
--     - qa-agent       Receives test_addition (and runs QA in later
--                      sprints; the row exists now so the routing table
--                      has something to point at).
--
--   The README under database/migrations/ disallows application data
--   seeds in migrations as a general rule. The Sprint 0 demo seed is the
--   same exception 001_core_schema.sql already made for the demo tenant,
--   division, and workspace: these rows are required for the governance
--   service to function against a fresh database and are stable across
--   runs (fixed UUIDs, ON CONFLICT DO NOTHING).
--
-- Write authority
--   status                         governance assigner (services/governance/src/assigner.js)
--   assigned_agent_instance_id     governance assigner
--   agent_instances rows (seed)    this migration only; runtime never
--                                  writes new agent_instances for the
--                                  Sprint 0 demo
--
-- Notes
--   ALTER TYPE ... ADD VALUE cannot run inside a transaction block in
--   Postgres, so the enum addition is issued as a bare statement and the
--   seed inserts follow as bare statements. IF NOT EXISTS and ON CONFLICT
--   DO NOTHING make the file idempotent.
-- ============================================================================

ALTER TYPE work_queue_status ADD VALUE IF NOT EXISTS 'assigned';

-- Seed the five demo agent_instances. UUIDs are stable so tests and
-- fixtures can reference them directly. tenant_id, division_id, and
-- workspace_id mirror the seed rows from 001_core_schema.sql.
INSERT INTO public.agent_instances (id, tenant_id, division_id, workspace_id, role, display_name)
VALUES
    ('00000000-0000-0000-0000-000000001001',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000100',
     'orchestrator', 'Orchestrator'),
    ('00000000-0000-0000-0000-000000001002',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000100',
     'agent-fe', 'Frontend Agent'),
    ('00000000-0000-0000-0000-000000001003',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000100',
     'agent-srv', 'Backend Agent'),
    ('00000000-0000-0000-0000-000000001004',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000100',
     'fix-agent', 'Fix Agent'),
    ('00000000-0000-0000-0000-000000001005',
     '00000000-0000-0000-0000-000000000001',
     '00000000-0000-0000-0000-000000000010',
     '00000000-0000-0000-0000-000000000100',
     'qa-agent', 'QA Agent')
ON CONFLICT (id) DO NOTHING;
