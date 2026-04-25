# MCP and A2A Integration

Two protocols matter for agent operation: **Model Context Protocol
(MCP)** and **Agent-to-Agent (A2A)**. They are sometimes presented as
competing standards. They are not. They serve different purposes, and
a real autonomous-agent system uses both for distinct, complementary
roles in the request flow.

This document defines those roles, lists the current integration
patterns, and states the hard rules that apply to the execution layer.

---

## 1. Protocol Roles

| Protocol | Role | Layer |
|---|---|---|
| **MCP** (Model Context Protocol) | Intelligence gathering read external sources | Intelligence layer |
| **A2A** (Agent-to-Agent) | Execution agent spawning, task handoff | Execution layer |

The two protocols are complementary, not competing. **MCP fills
context. A2A executes work.**

A system that uses only MCP can read from anywhere but cannot
dispatch. A system that uses only A2A can dispatch but has no
disciplined story for how its agents read external state. Real
deployments use both, with each protocol confined to its layer.

---

## 2. MCP The Intelligence Layer

MCP is how an agent reads from external systems. It is the standard
for "give the model access to this data source under controlled
conditions."

**MCP governs the read path:**

- An agent needs to look up a record in an external database MCP
  brokers the read.
- An agent needs to fetch the latest state from a third-party API —
  MCP brokers the call.
- A Routine needs to inspect repository state on each PR MCP brokers
  the GitHub access.

**Permission gating:** The runtime governance layer (AGT) mediates
each MCP call. A read that AGT does not permit is blocked at the
permission layer; MCP is the transport, not the policy.

**Connection scope:** MCP connections are configured per workspace and
per Routine. A Routine inherits connections from the workspace it runs
in unless explicitly narrowed.

**Current MCP connection patterns:**

Common MCP source patterns deployed in production agentic systems
include:

| Source | Data | Typical Access |
|---|---|---|
| Source-control system | PR context, repository state | Read |
| Issue tracker | Ticket metadata, comments | Read |
| Documentation system | Knowledge base content | Read |
| Internal data store | Domain records | Read (typically read-only for agents) |
| Observability backend | Metrics, traces, logs | Read |
| Identity provider | User, group, role data | Read |

The specific MCP connections used by any deployment of this framework
are listed in that deployment's `mcp.json` or equivalent. Connections
are added per workspace; they are not part of the public framework's
default configuration.

**Read-only by default.** MCP connections are configured read-only
unless a write capability is explicitly required and policy-approved.
A write-capable MCP connection is treated as a write surface and is
governed by the same write-rule discipline that applies to canonical
truth tables (see [agent-vs-service.md](agent-vs-service.md)).

---

## 3. A2A The Execution Layer

A2A is how agents spawn other agents and hand off work. It is the
standard for "this agent has completed its part; the next agent picks
up here."

**A2A governs the dispatch path:**

- The Orchestrator dispatches a task to an executing agent A2A
  carries the dispatch.
- The executing agent hands the result back to QA A2A carries the
  handoff.
- QA flags a defect A2A returns control to the Orchestrator for
  re-routing.

**Identity registration:** AGT registers the spawned agent's identity
at spawn time. The agent receives a DID for the duration of the
session. Without AGT registration, a spawn is rejected at the runtime
governance layer.

**Behavioral pre-conditions:** Before A2A is invoked, the behavioral
accountability layer applies the pre-spawn protocol debug, spec,
plan, HITL gate (if HIGH risk) and consults trust history and
failure memory. A2A executes the spawn that the behavioral layer has
authorized.

---

## 4. A2A Current State and Hard Rules

The framework's A2A integration ships with a small number of hard
rules. These rules are not negotiable inside the framework they are
enforced at the hook layer or at the runtime governance layer, and
violations produce trust-tier consequences and audit-log events.

**Current state:**

- The Orchestrator spawns agents through the platform's agent dispatch
  surface (the A2A pattern). The framework wraps the dispatch with
  the pre-spawn protocol on the way in and with QA verdict capture on
  the way out.
- AGT registers agent identity at spawn time (Wave 1). New deployments
  can run in shadow mode while AGT enforcement is calibrated, then
  promote to enforce mode once shadow validation completes.

**Hard rules:**

1. **Subagents cannot spawn subagents.** A spawned executing agent
   does not have authority to spawn further executing agents. Any such
   attempt is blocked at the spawn-authorization hook
   (`check-agent-spawn`). The Orchestrator is the only component that
   spawns executing agents. This rule prevents tree-shaped spawn
   trajectories that no human reviewer can audit.

2. **QA Agent FAIL routes back to the Orchestrator never to another
   subagent.** A QA failure is not a problem the executing agent can
   solve by spawning a fix subagent. It returns to the Orchestrator,
   which decides whether to re-dispatch (with revised plan), to spawn
   the Fix Agent, or to escalate. Fix is a separate agent with its
   own identity, its own trust history, and its own failure-memory
   write authority. This is not a continuation of the executing
   agent's work.

3. **Spawn authorization passes through the pre-spawn protocol.** The
   pre-spawn protocol `/debug → /spec → /plan → HITL (HIGH risk) →
   SPAWN` is mandatory for non-trivial spawns. The hook layer
   enforces that the protocol's artifacts exist before A2A is invoked.

4. **Cross-workspace spawns require explicit authorization.** An
   Orchestrator does not spawn agents into a different workspace. A
   Division Orchestrator at Wave 3+ may delegate work into a team
   workspace, but that delegation flows through the gate-records
   surface, not through unscoped A2A.

5. **Spawn results are validated.** Every A2A spawn produces a result
   that passes the spawn-result hook (`check-agent-spawn-result`).
   Malformed results are treated as a spawn failure and produce an
   audit event.

---

## 5. Combined Request Flow

A typical task flows through both protocols, with AGT enforcing
permission at each step:

```
[ behavioral layer ] →   pre-spawn protocol decides whether to dispatch
[ A2A ]              →   Orchestrator dispatches executing agent
[ AGT ]              →   permission check on the spawn (identity registered)
[ MCP ]              →   spawned agent reads its context (repo, tickets, docs)
[ AGT ]              →   permission check on each MCP read
[ work executes ]    →   agent produces its artifact
[ A2A ]              →   handoff back to Orchestrator
[ AGT ]              →   permission check on the handoff
[ A2A ]              →   Orchestrator dispatches QA Agent
[ behavioral layer ] →   QAVerdict, trust score, failure record (if any)
```

A request that fails AGT's check at any step is blocked at runtime,
regardless of trust score. A request that succeeds at AGT but
produces a poor outcome contributes to D1-D4 at the behavioral layer.

---

## 6. Why This Separation Matters

In a system that conflates MCP and A2A for example, by using a
single "agent calls anything" surface for both reads and dispatches —
two pathologies appear:

- **Permission policy gets coarse.** Read access and dispatch
  authority end up in the same policy bucket, which forces the
  operator to choose between blocking too much or allowing too much.
- **The audit trail becomes unreadable.** A read against a third-party
  API and a spawn of a fix-agent are different kinds of events with
  different reviewer audiences. Mashing them into one event stream
  makes incident review slower and noisier.

In a system that keeps the layers separate:

- **Reads are governed at the intelligence layer**, with AGT applying
  per-source policy.
- **Dispatches are governed at the execution layer**, with AGT applying
  per-spawn policy and the behavioral layer applying pre-spawn checks.
- **The audit log distinguishes the two cleanly**, which makes
  compliance evidence and incident review tractable.

The two-protocol model is not a design preference. It is what makes
governance comprehensible at scale.

---

## Related

- [three-layer-stack.md](three-layer-stack.md) How runtime governance,
  automation, and behavioral accountability fit together.
- [agent-vs-service.md](agent-vs-service.md) The component
  classification that determines write rules at the canonical layer.
- `docs/concepts/trust-scoring.md` D1-D4 trust scoring, applied
  after A2A handoff completes.
