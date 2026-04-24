# Task Assignment

**How a unit of work moves from the queue to a specific agent, with a
manifest attached.**

A task is not assigned by typing a prompt at an agent. It is routed
through a defined sequence: queue, classification, pre-spawn protocol,
manifest creation, handoff. Each step is recoverable; each step is
audited.

---

## Why Task Assignment Has a Protocol

A casual model of "I gave the agent a task" produces three failure
modes:

1. **Routing by availability** — the next idle agent gets the work,
   regardless of capability fit.
2. **Implicit context** — the agent is expected to infer files in
   scope, risk level, and verification requirements from prose.
3. **No record of what was promised** — when the work fails, there is
   no contract to compare against.

Task assignment closes all three. The unit of currency is the
**AgentTaskManifest** (schema: `schemas/v1/agent-task-manifest.schema.json`).
No manifest, no dispatch.

---

## The Assignment Pipeline

```
WORK QUEUE
   │
   ▼
CLASSIFY (taskType + riskLevel)
   │
   ▼
PRE-SPAWN PROTOCOL  ──────► reject / require Boardroom
   │
   ▼
ROUTE (capability + trust gate)
   │
   ▼
CREATE MANIFEST
   │
   ▼
HANDOFF TO AGENT
   │
   ▼
AGENT BEGINS  (status: IN_PROGRESS)
```

Each box is documented below.

---

## Step 1 — Work Queue

A task enters the work queue at status `CREATED`. At single-team scale
this can be a markdown file, a GitHub issue, or a row in
`work_queue_items` (see `database/enterprise/`).

### Required Fields at Queue Entry

A task needs at minimum:

- A title and description
- A taskType (`feature`, `bug`, `refactor`, `security`, `eval`, `migration`)
- A risk hint (may be refined in step 2)
- The interfaces likely touched (files, endpoints, schemas)

A task without these fields cannot be classified and so cannot be
routed. Sending it to an agent anyway is the most common pre-framework
failure mode.

---

## Step 2 — Classify

Classification fixes two attributes that drive everything downstream:
**taskType** and **riskLevel**.

### Risk Level Definitions

| Risk | Trigger | Examples |
|---|---|---|
| LOW | Single-file, no locked regions, no policy domains | Doc edit, comment fix, isolated UI tweak |
| MEDIUM | Multi-file, standard domains | Feature work in non-sensitive areas |
| HIGH | Payment, auth, entitlement, schema, anything in a locked region | Schema change, auth flow change |
| CRITICAL | Cross-schema, runtime policy change, public-API surface | Adding a permission gate, modifying audit log fields |

### Classification Authority

The orchestrator classifies. A human can override the classification
upward (LOW → MEDIUM) but cannot override downward without recording a
rationale. Downward overrides are a known anti-pattern (see
`docs/control-plane/meta-governance.md`).

---

## Step 3 — Pre-Spawn Protocol

Before any agent is spawned, the pre-spawn protocol runs. This is a
three-step decision tree, fully specified in
`docs/control-plane/pre-spawn-protocol.md`. The summary, from this
section's perspective:

1. **Risk classification confirmed.** Step 2 may be revised here.
2. **/spec vs /plan routing.** A task with unclear acceptance criteria
   routes to `/spec` first; a task with clear ACs routes to `/plan`.
3. **Gate triggers.** HIGH-risk requires HITL approval. CRITICAL may
   require Boardroom session before any agent runs.

A task that does not pass pre-spawn does not move forward. It returns
to the queue with a note describing what is missing, or it is escalated.

### Pre-Task Failure Retrieval

Pre-spawn includes a recurrence check. The orchestrator queries the
failure library for FailureRecords matching:

- The same `domain` as the task
- Files overlapping with `interfacesTouched`
- The agent likely to be assigned

Any matches are surfaced into the manifest's `priorFailureContext`. The
agent reads them before starting. This is the equivalent of a reference
check before assignment.

---

## Step 4 — Route

Routing selects a specific agent. Two filters apply:

### Capability Filter

The task's `domains` and `interfacesTouched` must fall within an
agent's capability boundary. An agent whose boundary is `src/frontend/*`
cannot be assigned a task that modifies `server/api/*`.

If no agent's boundary covers the task, this is a routing failure (see
"Assignment Failures" below).

### Trust Filter

| Risk Level | Minimum Trust Tier |
|---|---|
| LOW | Any tier including PROBATION (with HITL on each phase) |
| MEDIUM | STANDARD or above |
| HIGH | STANDARD or above; HIGH preferred |
| CRITICAL | HIGH only, plus explicit Boardroom approval |

An agent at PROBATION may not receive a HIGH-risk task. The trust gate
fires at assignment, not at spawn — assignment failure is the early,
cheap signal.

---

## Step 5 — Create Manifest

The orchestrator instantiates an AgentTaskManifest. Required fields
(see schema for the full list):

- `taskId` — ULID, generated here
- `taskType`
- `domains` — at least one
- `riskLevel`
- `interfacesTouched` — at least one
- `verificationRequired` — what verification gates must pass to close
- `assignedAgent`
- `createdAt` — ISO 8601

Optional but strongly recommended:

- `taskDescription` — plain-English statement of what is to be done
- `contractsReferenced` — contract files governing this task's domain
- `priorFailureContext` — populated from pre-task retrieval
- `evalPlan` — required for MEDIUM and HIGH

The manifest is the employment contract for this task. It is the
artifact a QA-Agent later checks the work against.

---

## Step 6 — Handoff

Handoff is the moment the manifest is delivered to the agent and the
agent's session begins. Three things must happen:

1. **Manifest delivered.** Either inline in the agent's brief or by
   reference (path / ULID). The agent reads it before any tool use.
2. **Status set to ASSIGNED, then IN_PROGRESS.** The work item moves
   in the queue.
3. **Audit event emitted.** Records: who routed, to whom, with what
   manifest ID, at what time, with what correlation ID.

The agent's first bulletin entry of the session must reference the
`taskId`. This is enforced at the hook layer (see
`docs/control-plane/hook-system.md`).

---

## Handoff Format

A minimum handoff payload looks like:

```
TASK
  taskId:        01J6X8K2N5R3MZ7TQVH9PYWAEC
  taskType:      bug
  riskLevel:     medium
  domains:       [billing, content]
  files:         [src/billing/invoice.ts, src/content/render.ts]
  verification:  [unit_test, qa_agent_review]

PRIOR FAILURES (pre-task retrieval)
  FAIL-2026-04-12-003 — null reference in invoice.render
  Prevention check: assert non-null before pricing computation

CONTRACTS
  contracts/billing-domain.md (sections 2 and 4)

EVAL PLAN
  Add regression test covering empty cart at checkout.
```

This is the agent's brief. Anything not in the manifest is out of scope.

---

## Assignment Failures

An assignment can fail at four points. Each has a defined recovery.

| Failure Point | Cause | Recovery |
|---|---|---|
| Classification | Risk cannot be determined; task too vague | Return to queue; require human refinement |
| Pre-spawn | Acceptance criteria missing, or HITL required and unavailable | Route to `/spec` or surface for human approval |
| Routing — capability | No agent's boundary covers the task | Either onboard a new agent (rare) or split the task |
| Routing — trust | All capable agents are at PROBATION for this risk class | Escalate to human; do not run the task at lower review than required |

A failure does not "consume" the task — the task stays in the queue.
Every assignment failure is logged so that systemic gaps (always the
same domain, always the same agent) become visible.

---

## What Happens When the Agent Finishes

Beyond the scope of this document, but as a pointer:

- QA-Agent runs against the manifest's `verificationRequired`
- A QAVerdict is produced (schema: `schemas/v1/qa-verdict.schema.json`)
- The work item moves to `COMPLETE`, `FAILED`, or `BLOCKED`
- The session is scored — see
  `docs/operating-model/performance-review-cycle.md`

---

## Related

- `docs/control-plane/pre-spawn-protocol.md` — full pre-spawn detail.
- `docs/control-plane/hitl-gates.md` — when HITL fires inside this flow.
- `schemas/v1/agent-task-manifest.schema.json` — manifest schema.
- `docs/concepts/work-queues.md` — queue lifecycle (v2.0).
