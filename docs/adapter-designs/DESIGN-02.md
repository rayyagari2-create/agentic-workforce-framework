# Trust Subject Model
**Document ID:** DESIGN-02
**Version:** 1.1
**Status:** NEAR LOCK — pending founder review
**Location:** `docs/adapter-designs/DESIGN-02.md`
**Depends on:** DESIGN-01
**Blocks:** All adapter design documents, trust_subjects schema migration

---

## Purpose

AWF V4.4.1 moved trust away from only `agent_instance_id` toward
`trust_subject_id`. This document defines what AWF is actually scoring.

The central insight:

> Not every runtime exposes a stable agent identity. Trust must attach
> to whatever is observable and persistent in the target runtime —
> an agent, a role, a session, a graph node or a human-runtime pair.

AWF assigns every unit of agentic work an accountable trust subject.
The trust subject type is determined by what the runtime exposes,
not by what we would prefer it to expose.

---

## The Seven Trust Subject Types

### 1. agent

**Definition:** A named agent with a defined role, stable identity and
documented capability boundary. The agent exists as a persistent entity
across sessions.

**When to use:** Runtime defines agents in files (`.claude/agents/`,
`.codex/agents/`, `.cursor/agents/`, `.openclaw/agents/`). The agent
has a name, a role description and a consistent set of allowed tools.

**Runtimes:** Claude Code, Cursor, OpenClaw

**subject_key pattern:**
```
{runtime}::agent::{agent_name}::{workspace}::{repo}
```

**Examples:**
```
claude_code::agent::qa-agent::ruvoni::family-trip-ai
claude_code::agent::agent-srv::checkout-service::payments-api
cursor::agent::backend-reviewer::fintech-corp::auth-service
openclaw::agent::security-checker::api-platform::gateway
```

**Rationale for including repo:**
One workspace may contain multiple repos. Trust accumulated for Agent-SRV
on the FTA repo must not blend with trust for Agent-SRV on a different repo
in the same workspace. Repo is included as the final key component.

**Trust behavior:**
- Trust accumulates per agent across sessions
- Same agent running on a different runtime starts PROVISIONAL
- Agent demotion affects only that agent's trust record
- Capability expansion is agent-scoped

---

### 2. subagent

**Definition:** A spawned agent within a session. Has a narrower scope
than a named agent. May not persist across sessions.

**When to use:** Runtime spawns temporary agents for bounded tasks
within a larger session. The subagent has a defined role but is not
a persistent entity.

**Runtimes:** Claude Code (subagents via Task tool), Cursor (subagents),
OpenClaw (sub-agents via ACP)

**subject_key pattern:**
```
{runtime}::subagent::{parent_agent_id}::{task_class}::{session_id}
```

**Examples:**
```
claude_code::subagent::orchestrator::code_review::sess_01KRY...
cursor::subagent::lead-agent::exploration::sess_abc123
```

**Trust behavior:**
- Subagent trust is session-scoped
- Trust does not accumulate across sessions at the subagent level
- Parent agent trust is what accumulates
- SubagentStart hook unreliability (42% miss rate in Claude Code)
  means subagent trust is secondary to parent agent trust

---

### 3. role_profile

**Definition:** A Codex role or profile defined in `.codex/agents/*.toml`.
Not a named agent but a typed role (worker, explorer, custom) with
capability boundaries enforced by sandbox_mode and skill_set.

**When to use:** Codex runtime. Trust attaches to the role configuration,
not a named individual agent, because Codex does not expose stable
per-agent identity externally.

**Runtimes:** Codex

**subject_key pattern:**
```
codex::{role}::{workspace}::{repo}::{task_type}::{risk_lane}::{sandbox_mode}::{skill_set}
```

**Examples:**
```
codex::worker::ruvoni::family-trip-ai::frontend-bugfix::medium-risk::workspace-write::frontend-skill
codex::explorer::fintech-corp::auth-service::codebase-analysis::low-risk::read-only::no-skill
codex::worker::ruvoni::family-trip-ai::auth-change::restricted::read-only::awf-risk-plan
codex::custom-security-reviewer::api-platform::gateway::security-audit::high-risk::read-only::security-skill
```

**Rationale for including repo:**
Codex role trust for ruvoni frontend work in the FTA repo must not bleed
across multiple repos in the same workspace. Repo is the second key
component after workspace.

**Trust behavior:**
- Total D1-D4 score determines trust tier. Trust tier gates role capability expansion.
- A worker role at STANDARD tier can create PRs after CI. At HIGH tier it operates in the low-risk lane.
- Autonomy is earned per (role + workspace + task_type + sandbox_mode) combination
- A worker role trusted for frontend work starts PROVISIONAL for database work
- sandbox_mode is part of the trust identity — workspace-write role ≠ read-only role

---

### 4. session

**Definition:** An unnamed runtime session. The session is the agent.
No internal agent decomposition is visible to AWF.

**When to use:** Runtime does not expose internal agent structure
(Devin, Multica above). AWF observes session outcomes only.

**Runtimes:** Devin, Multica (when AWF runs above Multica)

**subject_key pattern:**
```
{runtime}::session::{workspace}::{task_type}::{playbook_or_config}
```

**Examples:**
```
devin::session::ruvoni::database-migration::playbook-safe-migration-v2
devin::session::fintech-corp::auth-refactor::playbook-auth-specialist
multica::session::ruvoni::ui-bugfix::default
```

**Trust behavior:**
- Trust accumulates per (workspace + task_type + playbook) combination across multiple sessions.
  Session-bound trust does not mean one trust record per session. It means the runtime
  only exposes session-level evidence, so AWF aggregates by workspace + task_type + playbook.
- Devin sessions governed by the same playbook share a trust history
- If playbook version changes, trust history remains but confidence_band resets to LOW
- AWF cannot distinguish between Devin internal agent failures — only session outcome matters
- Evidence strength is E0/E1 — post-session evaluation only

---

### 5. graph_node

**Definition:** A LangGraph node or edge that is a defined checkpoint
in the governance lifecycle. Trust attaches to the node's behavioral
history across graph invocations.

**When to use:** LangGraph runtime where AWF governance nodes are
embedded in the graph (interrupt_before, checkpointers, AWF nodes).

**Runtimes:** LangGraph

**subject_key pattern:**
```
langgraph::{graph_id}::{node_name}::{workspace}
```

**Examples:**
```
langgraph::checkout-workflow::risk-gate-node::fintech-corp
langgraph::auth-pipeline::pre-merge-approval::ruvoni
langgraph::data-pipeline::pii-check-node::healthco
```

**Trust behavior:**
- Trust accumulates per (graph_id + node_name + workspace)
- Node-level trust determines whether interrupt() fires automatically
  or requires human approval
- Graph-node trust is the most granular trust model AWF supports
- Requires the graph owner to adopt AWF nodes — cannot be applied externally

---

### 6. human_runtime

**Definition:** A human + runtime pair. Used when a human drives the
session with AI assistance. The human is the constant; the runtime is
the tool.

**When to use:** Human-assisted sessions where the governance record
should track the human's behavior patterns across runtime sessions,
not an autonomous agent's behavior.

**Runtimes:** Cursor (IDE mode), Claude/Codex manual IDE use

**subject_key pattern:**
```
{runtime}::human::{human_actor_id}::{workspace}::{task_type}
```

**Examples:**
```
cursor::human::developer_rayyagari2::ruvoni::frontend-feature
claude_code::human::developer_rayyagari2::ruvoni::architecture
```

**Trust behavior:**
- Trust tracks human+runtime productivity patterns, not just task outcomes
- Used for analytics and reporting, not for autonomy gating
- Human-runtime trust does not gate tool access — humans retain full control
- Useful for audit trail attribution: "who used which tool for what"

---

### 7. task

**Definition:** Task-level trust. The lowest granularity fallback when
no higher trust subject type is identifiable. Trust attaches to the task
definition itself.

**When to use:** Runtime provides no stable identity at any level. Used
as a fallback to ensure every governed task has some trust record.

**Runtimes:** Any runtime as fallback

**subject_key pattern:**
```
{runtime}::task::{workspace}::{task_class}::{work_item_id}
```

**Examples:**
```
multica::task::ruvoni::webhook_integration::wi_01KRY...
devin::task::fintech-corp::security-audit::wi_abc123
```

**Trust behavior:**
- Task-level trust does not accumulate meaningfully across sessions
- Used for audit trail completeness, not for autonomy progression
- If a higher trust subject type becomes available (e.g. Devin adds
  agent identity APIs), migrate to session or agent type

---

## Database Schema

### trust_subjects Table

```sql
CREATE TABLE trust_subjects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  division_id       UUID NOT NULL REFERENCES divisions(id),
  workspace_id      UUID NOT NULL REFERENCES workspaces(id),
  subject_type      TEXT NOT NULL,
  runtime_provider  TEXT NOT NULL,
  subject_key       TEXT NOT NULL,
  repo              TEXT,
  task_type         TEXT,
  risk_lane         TEXT,
  sandbox_mode      TEXT,
  skill_set         TEXT[],
  human_actor_id    UUID,
  agent_instance_id UUID REFERENCES agent_instances(id),
  metadata          JSONB,
  config_hash       TEXT,          -- hash of agent/role/playbook definition at subject creation
  subject_version   TEXT,          -- version label for human readability
  archived_at       TIMESTAMPTZ,   -- set when subject is retired, never deleted
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, runtime_provider, subject_key)
);

-- subject_type controlled values:
-- agent | subagent | role_profile | session | graph_node | human_runtime | task

-- Indexes
CREATE INDEX idx_trust_subjects_workspace_runtime
  ON trust_subjects(workspace_id, runtime_provider);

CREATE INDEX idx_trust_subjects_key
  ON trust_subjects(subject_key);
```

### trust_capability_profiles Table

Replaces old `agent_capability_profiles`. References `trust_subject_id`.

```sql
CREATE TABLE trust_capability_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  division_id      UUID NOT NULL REFERENCES divisions(id),
  workspace_id     UUID NOT NULL REFERENCES workspaces(id),
  trust_subject_id UUID NOT NULL REFERENCES trust_subjects(id),
  task_class       TEXT NOT NULL,
  runtime_provider TEXT NOT NULL DEFAULT 'any',
  trust_level      TEXT NOT NULL DEFAULT 'PROVISIONAL',
  evidence_strength TEXT NOT NULL DEFAULT 'E0',
  session_count    INTEGER NOT NULL DEFAULT 0,
  avg_score        NUMERIC(5,2),
  confidence_band  TEXT NOT NULL DEFAULT 'LOW',
  last_score_at    TIMESTAMPTZ,
  UNIQUE(trust_subject_id, task_class, runtime_provider)
);

-- Contextual trust lookup (< 10ms at scale)
CREATE INDEX idx_trust_capability_profiles_lookup
  ON trust_capability_profiles(trust_subject_id, task_class, runtime_provider);
```

---

## subject_key Construction Rules

The subject_key is the stable, queryable identity for a trust subject.
It must be deterministic — the same runtime + config always produces
the same subject_key.

**Rules:**
1. All lowercase
2. Double-colon `::` as separator between components
3. No spaces — use hyphens within components
4. Include only components that are stable across sessions for this trust type
5. Maximum 200 characters

**Component stability by trust type:**

| Trust type | Stable components | Unstable (exclude) |
|---|---|---|
| agent | runtime, "agent", agent_name, workspace | session_id, run_id |
| subagent | runtime, "subagent", parent_agent_id, task_class, session_id | run_id |
| role_profile | runtime, role, workspace, task_type, risk_lane, sandbox_mode, skill_set | session_id |
| session | runtime, "session", workspace, task_type, playbook | session_id, run_id |
| graph_node | "langgraph", graph_id, node_name, workspace | invocation_id |
| human_runtime | runtime, "human", human_actor_id, workspace, task_type | session_id |
| task | runtime, "task", workspace, task_class, work_item_id | run_id |

---

## Trust Level Progression

Trust level is determined by total D1-D4 score across recent sessions.
It applies to the trust subject, not to a specific session.

```
PROVISIONAL  (score < 60)
  → New trust subjects always start here
  → Read-only analysis only. No file writes.
  → Every task requires human approval.

RESTRICTED   (score 60-74)
  → Draft plans and draft PRs only.
  → Human reviews before any merge.
  → 3+ sessions required to exit.

STANDARD     (score 75-89)
  → PR creation allowed after CI passes.
  → No high-risk files without approval.
  → 5+ sessions at STANDARD to reach HIGH.

HIGH         (score 90-100)
  → Low-risk task lane.
  → Human merge approval still required (Invariant 5 — never waived).
  → Demotion triggers immediately on PROBATION session.

PROBATION    (any session score < 40)
  → Immediate demotion regardless of prior tier.
  → Human approval required for every task.
  → Must prove reliability over 3 consecutive sessions to exit.
```

**Confidence band:**

| Sessions | Confidence |
|---|---|
| 1-4 | LOW |
| 5-14 | MEDIUM |
| 15+ | HIGH |

Trust level and confidence band are separate. A trust subject can have
HIGH confidence in a RESTRICTED tier (reliably restricted) or LOW
confidence in a STANDARD tier (not enough sessions to be certain).

---

## Cross-Runtime Trust Rules

1. **Trust does not transfer across runtimes automatically.**
   An agent-srv with HIGH trust on Claude Code starts PROVISIONAL on Codex.

2. **Trust subjects are runtime-scoped.**
   `claude_code::agent::agent-srv::ruvoni` and `codex::worker::ruvoni::backend::medium-risk::workspace-write`
   are different trust subjects even if they represent the same "backend agent concept."

3. **Workspace isolation is enforced.**
   Trust accumulated in workspace A does not count toward workspace B's
   trust even for the same trust subject key.

4. **New task class = PROVISIONAL.**
   An agent trusted for `webhook_integration` starts PROVISIONAL for
   `database_migration` regardless of its tier on the first task class.

5. **trust_subject_id is immutable.**
   Once created, the UUID for a trust subject never changes. If a trust
   subject needs to be retired, it is archived, not deleted. Failure
   records referencing it remain intact.

---

## config_hash and subject_version Behavior

`config_hash` is a hash of the agent/role/playbook definition at the time the
trust subject was created. It covers agent instruction files, role TOML configs,
Devin playbook content and skill_set composition.

**When config_hash changes:**
- The trust_subject_id remains the same (history is preserved)
- confidence_band resets to LOW unless the change is verified cosmetic
  (formatting, comment changes, whitespace)
- A new config_hash entry is logged in subject metadata
- The adapter must re-compute config_hash at each session start and compare

**When to create a new trust_subject vs update existing:**
- Cosmetic change: update subject_version, keep config_hash same
- Behavioral change (new rules, different tools, scope change): new config_hash, reset confidence
- Fundamental restructure (role type change, runtime change): new trust_subject_id

---

## Open Questions

1. Should subagent trust_subject_id accumulate across sessions for named subagents in Claude Code?
   Currently specified as session-scoped. Needs decision.
2. For Codex role_profile subjects, if the .codex/agents/*.toml file is modified mid-sprint,
   should config_hash check fire before or after session start?
3. LangGraph: should graph_node trust_subject_id be per-graph version or per-graph-name?
   Graph versioning changes could invalidate node trust history.

## Implementation Checklist

- [ ] trust_subjects table created with all fields including archived_at, config_hash, subject_version
- [ ] trust_capability_profiles references trust_subject_id
- [ ] buildTrustSubjectKey() implemented per runtime in each adapter
- [ ] config_hash computed and compared at session start for every adapter
- [ ] confidence_band reset logic implemented when config_hash changes
- [ ] Cross-runtime trust rules enforced: new runtime = PROVISIONAL

## Acceptance Evidence

This document is satisfied when:
- trust_subjects table is live in the AWF database
- trust_capability_profiles references trust_subject_id not agent_instance_id
- At least one trust_subject row exists per runtime after Gate 3 sessions complete
- subject_key patterns match the specified patterns for Claude Code and Codex

## Claims Approved for External Use

**Approved:**
"AWF assigns every unit of agentic work an accountable trust subject."
"Trust subjects may be agents, roles, sessions, graph nodes or human-runtime pairs."
"AWF trust history is preserved even when agent definitions change, with confidence recalibration when material configuration changes are detected."

**Not approved:**
"AWF tracks every individual agent" — only where runtime exposes stable agent identity.

---

*Document owner: Founder*
*Version 1.1 — LOCKED. CTO corrections applied. D1-D4 role_profile wording fixed.*
*archived_at, config_hash, subject_version added to schema.*
*Session-bound trust accumulation language clarified.*
*Standard sections added.*
