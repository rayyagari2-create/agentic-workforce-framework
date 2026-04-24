# MCP and A2A Integration

Two protocols matter for agent operation: **Model Context Protocol (MCP)**
and **Agent-to-Agent (A2A)**. They are sometimes presented as competing
standards. They are not. They serve different purposes, and a real
agent system uses both.

This document describes the role of each protocol, why they are
complementary, and how this framework relates to them.

---

## Protocol Roles

| Protocol | Role | Layer |
|---|---|---|
| MCP | Intelligence gathering — read external sources | Intelligence layer |
| A2A | Execution — agent spawning, task handoff | Execution layer |

MCP fills context. A2A executes work. One is read-side; the other is
work-side.

---

## MCP — The Intelligence Layer

**What MCP does.** MCP is a standardized way for an agent to reach an
external context source — a database, a SaaS API, a documentation site,
a code repository — and pull in information it needs to reason. The
agent stays in control of its reasoning loop; MCP gives the loop access
to grounded data.

**Examples of MCP connectors:**

- A GitHub MCP connector that lets the agent read PR context, file
  history, and review comments.
- A database MCP connector that lets the agent query a Postgres or
  Firestore store for state.
- A SaaS MCP connector (payments, scheduling, CRM, etc.) that lets the
  agent read transactional context relevant to the task.
- A documentation MCP connector that lets the agent compare current
  internal specs against a vendor's live API documentation.

**Why MCP is the intelligence layer.** Without external context, an
agent reasons in a vacuum. MCP is what lets the agent ground its
reasoning in current, authoritative state. The "intelligence" framing
captures that role: MCP is how the agent gets smarter about the world
before it acts.

**What MCP is not.** MCP is not how agents talk to each other. It is
not how work is handed off. It is not a workflow engine. MCP is read-side.

---

## A2A — The Execution Layer

**What A2A does.** A2A is the protocol that lets one agent invoke
another. The Orchestrator spawns the Backend Agent; the Backend Agent
hands off to the QA Agent; the QA Agent routes a FAIL back to the
Orchestrator. All of those edges are A2A edges.

In Claude Code, A2A is the Agent tool: a calling agent invokes a
subagent through a structured spawn pattern. Other A2A implementations
exist; the abstract pattern is the same.

**Why A2A is the execution layer.** A2A is how work moves through the
system. Spawning, handing off, escalating, returning — all of these are
execution events, and all of them happen over A2A.

**What A2A is not.** A2A is not how agents read external context. That
is MCP's job. A2A does not encode behavioral trust signals. That is
this framework's job.

---

## The Single-Agent View

For any single agent, the picture looks like this:

```
                  ┌────────────────┐
                  │  External MCP  │
                  │   connectors   │   intelligence — reads
                  └────────┬───────┘
                           │
                           ▼
       ┌─────────────────────────────────┐
       │            AGENT                │
       │   (reasoning loop, tool use)    │
       └─────────────┬───────────────────┘
                     │
                     ▼
                  ┌─────┐
                  │ A2A │   execution — spawns, hands off, escalates
                  └─────┘
```

The agent reads through MCP and acts through A2A. The two protocols are
on different sides of the agent's reasoning loop.

---

## Why They Are Complementary, Not Competing

Some teams ask whether they should adopt MCP or A2A. The question is
mis-framed. The honest answer:

- If your agents do not read external context, you do not need MCP.
- If your agents do not spawn or hand off to other agents, you do not
  need A2A.
- If both, you need both.

A two-agent workflow that reads from a database and hands off between
agents needs MCP for the database read and A2A for the handoff. The
protocols are not substitutes; they fill different roles.

The "competing" framing usually comes from confusing the protocols
with the systems built on top of them. A workflow engine that uses MCP
is not the same as MCP. A multi-agent platform that uses A2A is not the
same as A2A. The protocols themselves are narrow specifications.

---

## Where This Framework Sits

This framework sits **above** both MCP and A2A. It is not a competitor
to either. It is a behavioral layer that observes what happens over both
protocols and accumulates trust signals across sessions.

```
┌────────────────────────────────────────────────────────────┐
│      AGENTIC WORKFORCE FRAMEWORK                           │
│                                                            │
│    Identity · Trust scoring · Failure memory               │
│    Autonomy gates · Pre-spawn · HITL gates                 │
│                                                            │
│      observes ↓                                            │
└────────────────────────────────────────────────────────────┘
       │                            │
       ▼                            ▼
┌──────────────────┐       ┌──────────────────┐
│       MCP        │       │       A2A        │
│  intelligence    │       │   execution      │
│  read external   │       │   spawn, hand    │
│  context         │       │   off, escalate  │
└──────────────────┘       └──────────────────┘
```

**What this framework reads from MCP traffic:** Nothing directly. The
framework does not inspect MCP payloads. The framework records the
agent's behavior — what tool was used, what the QA Verdict said, what
acceptance criteria passed. Whether the agent reached a database or a
documentation site is part of its tool use, not part of trust scoring.

**What this framework reads from A2A traffic:** Spawn events. Handoff
events. Escalation events. Each spawn is gated by the pre-spawn
protocol. Each handoff is recorded in the agent bulletin / `agent_events`
table. Escalations route through the Orchestrator.

**What this framework writes:** Trust scores per session per agent.
Failure records when something goes wrong. Audit log entries on every
governance event. None of these writes are made by MCP or A2A — they are
made by the framework, which sits above both.

---

## The Wave 1 MCP Surface

At Wave 1, the reference implementation uses MCP connectors for:

- **Repository context** through a GitHub MCP connector. Read-only.
- **Persistent state** through a database MCP connector (Postgres or
  Firestore, depending on the workspace).
- **Domain-specific connectors** as needed — payment systems,
  scheduling systems, CRM, documentation indexes.

Each MCP connector is configured per workspace. The framework does not
require any specific connector. The framework requires only that, when
connectors are used, the agent's tool use is recorded in the audit log
through the existing PostToolUse hook. That recording is what makes the
session reviewable later.

---

## A2A Governance Rules

A2A is the spawn and handoff substrate. The framework imposes three
hard rules on top of it:

1. **Subagents cannot spawn subagents.** The Orchestrator is the only
   role with spawn authority. This rule is enforced by the
   `check-agent-spawn` hook. Without this rule, accountability becomes
   ambiguous — when a third-level subagent fails, whose trust history
   gets the demerit?

2. **QA-FAIL routes to Orchestrator only.** A failed QA Verdict never
   routes to another subagent. It always returns to the Orchestrator,
   which decides how to route the fix. This rule keeps the failure
   handling path explicit.

3. **Pre-spawn protocol gates every A2A spawn.** No A2A spawn happens
   without the three-step pre-spawn decision tree completing first. The
   pre-spawn check evaluates trust tier, task risk, and failure library
   recurrence before authorizing the spawn.

These rules are framework-level. They are not part of the A2A protocol
itself. The protocol allows arbitrary spawn topologies; the framework
narrows the topology to one that is auditable.

---

## When You Adopt Each

If you are building from scratch, the order is:

1. **Adopt this framework first.** Define the agent roster, the trust
   scoring rubric, and the pre-spawn protocol. You can run this with
   any agent runtime, including one that has no MCP or A2A.
2. **Add A2A when you have more than one agent.** The Orchestrator + one
   executing agent is the minimum two-agent topology. As soon as a
   handoff exists, A2A formalizes it.
3. **Add MCP when agents need external context.** Most useful agents
   need this almost immediately. Start with repository context and the
   one or two SaaS connectors most relevant to your domain.

You do not need to adopt all three simultaneously. The framework is
useful even with a single agent and zero MCP connectors — you still get
trust scoring, failure memory, and pre-spawn governance.

---

## Related

- [three-layer-stack.md](three-layer-stack.md) — How this framework
  relates to runtime policy layers and scheduled automation. The MCP/A2A
  story is orthogonal to the three-layer stack: MCP and A2A live inside
  the runtime substrate that all three layers operate over.
- [four-plane-model.md](four-plane-model.md) — How A2A spawn events
  enter the autonomy plane through QA verdicts and trust scoring.
