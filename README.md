# Agentic Workforce Framework

## Agents that earn autonomy. Not agents you babysit.

The Agentic Workforce Framework gives AI coding agent teams an operating model:
persistent identity, task contracts, failure memory, D1-D4 trust scoring, autonomy
gates and audit trails.

Agent runtimes make agents execute. **AWF makes agents accountable.**

---

## Try It

> Requires Node.js 18+ and PostgreSQL.

```bash
git clone https://github.com/rayyagari2-create/agentic-workforce-framework
cd agentic-workforce-framework
cp .env.example .env
# edit .env with your DATABASE_URL
npm install
npm run demo:setup
npm run demo
```

The demo loads a sample backlog, classifies 5 tickets by risk, fires an approval
gate for high-risk items, assigns the right agent role, runs a simulated execution,
produces a real D1-D4 score and writes a tamper-evident hash-chained audit log.

D3 and D4 use deterministic scoring. D1 and D2 are candidate scores and require
calibration before autonomy-gating decisions.

---

## Sprint 0 Status

| Capability | Status |
|---|---|
| Postgres governance schema (10 tables, full tenant/workspace/division scope) | Implemented |
| Hash-chained audit service as a separate process | Implemented |
| AWFAgentRuntime interface v1.0 (vendor-neutral adapter contract) | Implemented |
| SimulatedRuntimeAdapter with [PREVIEW] labeling | Implemented |
| Work intake from JSON (GitHub Issues format) | Implemented |
| Risk classifier (10 rules, deterministic, pure function) | Implemented |
| Priority queue with SELECT FOR UPDATE SKIP LOCKED | Implemented |
| Single approval gate (high/critical risk requires approval) | Implemented |
| Agent assignment (5 roles, task-class routing) | Implemented |
| D1-D4 reference scorer (D3/D4 deterministic, D1/D2 candidate) | Implemented |
| QA verdict production (AJV-validated, 4 outcomes) | Implemented |
| End-to-end CLI demo (9 steps, audit verified) | Implemented |
| 5-agent reference team instructions | Implemented |
| D1-D4 trust scoring rubric and calibration anchors | Implemented |
| Failure memory with 17-class taxonomy | Implemented |
| OS-level hook enforcement templates | Implemented |
| AWF CLI (awf init, awf check, awf add) | Implemented |
| Claude Code and Codex runtime adapters | Planned Sprint 2 |
| Automated D1/D2 scoring (semantic, calibrated) | Planned Sprint 1+ |
| Multi-workspace enterprise control plane | Planned Sprint 2+ |
| AGT runtime policy integration | Preview (shadow mode) |

Label meanings: **Implemented** is runnable today. **Planned** is on the roadmap.
**Preview** is runnable with documented limits.

---

## Evidence Base

From the private reference implementation since 2026-04-12:

- 82 governed tasks scored
- 123 individual agent-task scoring entries with evidence per dimension
- 7 distinct agents scored
- Observed score range: 48 to 100
- Zero successful hook bypasses on record
- Zero falsified telemetry incidents on record

A governed task means a manifest-backed work item with scoring evidence.
Metrics are self-reported and have not been independently audited.

---

## Choose Your Path

- Run the demo: `node examples/awf-demo/src/run-demo.js`
- Adopt AWF in your repo: `npx agentic-workforce-framework@latest init`
- Build a runtime adapter: implement [AWFAgentRuntime v1.0](services/execution/src/runtime-interface.js)
- Read the schemas: [schemas/v1/](schemas/v1/)
- Read the architecture: [docs/architecture/four-plane-model.md](docs/architecture/four-plane-model.md)

---

## Where this fits

AWF is not an agent execution runtime. It does not replace Claude Code,
Devin, Codex, LangGraph or any other execution framework.

Those tools make agents execute. AWF governs whether the work was
authorized, evidenced, auditable, trustworthy and safe to repeat.

AWF sits alongside your existing agent runtimes and adds:
- A governed intake and approval layer before agents start work
- A trust scoring model that tracks agent reliability over time
- A tamper-evident audit trail across every agent action
- A runtime adapter interface so any execution platform can be governed

You can run the Sprint 0 demo today. You can adopt individual schemas
and concepts without running the full stack. And when Sprint 2 ships,
you can plug in Claude Code or Codex as governed runtimes using the
AWFAgentRuntime adapter interface.

---

## Why this exists

Most agent frameworks focus on task execution.

Enterprises need more than execution. They need workforce controls:

- Who is the agent?
- What work is it allowed to perform?
- Who approved the work?
- What evidence exists?
- How does trust change over time?
- When does autonomy expand or contract?
- How do agent teams operate across departments?

This framework addresses that gap by defining a complete operating
model for agent identity, task assignment, behavioral trust, failure
memory, approval gates and enterprise scaling.

---

## What this repo includes

- Four-plane enterprise architecture
- Agentic workforce operating model
- Work queues and delegation rules
- Approval gate chains
- Trust and autonomy model (D1-D4)
- Manifest-based task assignment
- OS-level hook interception examples
- Reference Postgres governance schema (Sprint 0: 10 tables, full scope)
- Enterprise extension schema (divisions, workspaces, agent instances)
- Reference agent instruction files (five-agent team)
- Failure memory taxonomy (17 classes)
- Calibration anchors and scoring rubric
- Installable CLI for scaffolding framework artifacts into a repo
- Modular install support for agents, trust scoring, failure memory,
  task manifests and Claude Code hooks
- Runtime-aware scaffold support for Claude Code and runtime-agnostic
  scaffold support for other environments

---

## Maturity legend

This repo uses four status labels throughout. Every major artifact
and capability is labeled.

| Label | Meaning |
|---|---|
| Implemented | Used in the reference implementation today |
| Reference Pattern | Architecture pattern ready for adoption, not tied to a specific product implementation |
| Experimental | Actively being validated in the reference implementation |
| Planned | Future roadmap concept, not yet designed or built |

The Implementation Status table applies these labels to every
capability claim. The labels are deliberately conservative: a capability
moves to Implemented only after sustained use in the reference
implementation, not on the day it is first written.

---

## What this framework is not

This framework is not:
- a model safety system
- a replacement for identity and access management
- a replacement for enterprise GRC tooling
- a guarantee that agent outputs are correct
- a hosted product
- a full agent runtime
- a substitute for legal, compliance or security review

What this framework is:

An operating architecture for accountable agentic work. It governs
the operational reliability of agents, not the safety of their
outputs. It tracks whether agents are becoming more or less
trustworthy over time, gates autonomy on demonstrated behavior and
maintains institutional failure memory.

How this relates to other layers:

| Layer | What it governs |
|---|---|
| Runtime policy layer (e.g. AGT) | What agents are permitted to do: identity, policy, sandboxing |
| This framework | Whether agents can be trusted to do it: trust over time, failure memory |
| Model provider layer | What the model produces: output quality, safety |

These three layers are complementary. None replaces the other.

---

## Install the CLI

Scaffold the full framework into any repo:

    npx agentic-workforce-framework@latest init

Or install globally:

    npm install -g agentic-workforce-framework
    awf init
    awf check

---

## Modules

Install individual modules into any repo:

### five-agent-team

Five agent instruction files: Orchestrator, Frontend, Backend, QA and Fix.

    npx agentic-workforce-framework@latest add five-agent-team

### trust-scoring

D1-D4 behavioral trust scoring rubric, calibration anchors and TrustScore schema.

    npx agentic-workforce-framework@latest add trust-scoring

### failure-memory

Failure library template, FailureRecord schema and example record.

    npx agentic-workforce-framework@latest add failure-memory

### task-manifest

AgentTaskManifest schema, sidecar schema and example manifest.

    npx agentic-workforce-framework@latest add task-manifest

### claude-code-hooks

Hook examples and Claude Code settings example file.
For Claude Code runtimes only.

    npx agentic-workforce-framework@latest add claude-code-hooks

---

## Current Limitations

- Single-workspace reference implementation only. Multi-workspace
  enterprise scaling is Reference Pattern, not field-proven.
- D1 and D2 scoring is heuristic in Sprint 0. Automated
  trust scoring requires calibrated session data (n >= 20). At enterprise
  scale, D1-D4 should be computed from structured QA verdicts, policy
  violations, audit events and failure recurrence data.
- Hook examples require environment-specific adaptation.
  Claude Code native hooks work out of the box. Framework-enriched
  hooks require payload enrichment before use in Claude Code.
- Runtime policy layer (AGT integration) is Experimental in
  shadow mode in the reference implementation.
- Claude Code does not provide framework-enriched context fields
  (agent_id, agent_depth, session_reads) by default. These must
  be derived from sidecar manifests or runtime state files.
- Runtime adapters for Claude Code and Codex ship in Sprint 2.
  Sprint 0 ships a simulated adapter only.

---

## The Problem

Enterprise AI agents are moving from isolated tools to autonomous digital workers.
They plan, execute, review, escalate and collaborate across increasingly complex
workflows. The question has shifted from:

> *"Can this model answer correctly?"*

to:

> *"How do we operate autonomous agent teams like an accountable workforce?"*

That requires persistent identity, role boundaries, task assignment, work logs,
trust history, failure memory, approval gates, policy enforcement and
enterprise-scale team structures. Most teams are still early here. Many have
model APIs and prompt files, but not yet a durable operating model for agent
identity, trust, failure memory and autonomy.

---

## The Four-Plane Architecture

```
╔════════════════════════════════════════════════════════════════╗
║  AGENTIC WORKFORCE PLANE  Implemented                          ║
║                                                                 ║
║  Orchestrator · Frontend Agent · Backend Agent                  ║
║  QA Agent · Fix Agent                                           ║
╠════════════════════════════════════════════════════════════════╣
║  AUTONOMY PLANE  Implemented                                    ║
║                                                                 ║
║  D1-D4 Trust Scoring · Failure Memory (17 classes)              ║
║  Autonomy Gates · Promotion / Demotion                          ║
╠════════════════════════════════════════════════════════════════╣
║  CONTROL PLANE  Experimental / partial                          ║
║                                                                 ║
║  Pre-Spawn Protocol · HITL Gates · OS-Level Hook System         ║
║  AGT Adapter (shadow mode) · Audit Log (hash-chained Postgres)  ║
╠════════════════════════════════════════════════════════════════╣
║  AUTOMATION PLANE  Planned                                      ║
║                                                                 ║
║  PR Test Routine (R1) · Security Scan Routine (R4)              ║
╚════════════════════════════════════════════════════════════════╝
```

**Governance is the control plane. Not the architecture.**
The workforce plane is the headline. Governance is what makes it safe to run
autonomously.

---

## The Agents-as-Employees Model

The framework maps every HR concept to an agent governance equivalent.

| HR Concept | Agent Equivalent | Status |
|---|---|---|
| Job description | Capability boundary + instruction file | Implemented |
| Employment contract | AgentTaskManifest | Implemented |
| Work log | Agent bulletin | Implemented |
| Performance review | D1-D4 trust scoring per session | Implemented |
| KPIs / OKRs | Acceptance criteria + QAVerdict | Implemented |
| Incident report | FailureRecord | Implemented |
| Manager | Orchestrator | Implemented |
| Reference check before task | Pre-task failure retrieval | Implemented |
| Promotion | Autonomy gate expansion | Implemented |
| PIP | RESTRICTED / PROBATION trust tier | Implemented |
| Scheduled recurring work | Claude Code Routines | Planned |
| HR policy engine | Runtime policy layer | Planned |
| Workforce analytics | Command Center | Reference Pattern |
| Team lead | Manager Agent | Reference Pattern |
| Department head | Division Orchestrator | Reference Pattern |

---

## How the Governance Stack Fits Together

This framework sits in a three-layer stack. Each layer governs something distinct.
None replaces the other.

| Layer | Technology | What It Governs |
|---|---|---|
| Runtime enforcement | AGT-style runtime policy layer | What agents are permitted to do: identity, policy, sandboxing |
| Scheduled automation | Claude Code Routines | When lightweight tasks run: scheduled checks, PR scans, alerts |
| Behavioral accountability | This framework | Whether agents can be trusted to do it: trust over time, failure memory |

The reference implementation currently uses Microsoft AGT in shadow mode.
This framework is designed to sit above any runtime policy layer that provides
identity, policy enforcement and audit trail capabilities.

---

## Start here

If you are reading this for the first time:

1. Read [the four-plane model](docs/architecture/four-plane-model.md)
2. Review [the agentic workforce model](docs/concepts/agentic-workforce-model.md)
3. Review [task manifests](schemas/v1/agent-task-manifest.schema.json)
4. Review [approval gate chains](docs/concepts/approval-gate-chains.md)
5. Review [hook examples](hooks/)
6. Review [the database schema](database/)
7. Read [the reference implementation](docs/reference-implementation.md)

For a hands-on path: [Getting Started](docs/guides/getting-started.md)
covers a 30-minute first session.

For minimum viable adoption: [examples/minimum-viable-adoption/](examples/minimum-viable-adoption/)
covers what you can run today without Postgres or hooks.

---

## Core Concepts

| Concept | What It Does |
|---|---|
| [D1-D4 Trust Scoring](docs/concepts/trust-scoring.md) | 100-point session scoring across Correctness, Observability, Compliance and Recurrence. Hard-stop rules. Calibration anchors. |
| [Failure Memory](docs/concepts/failure-memory.md) | 17-class failure taxonomy. Recurrence detection. Pre-task retrieval: agents check their own failure history before starting. |
| [Autonomy Gates](docs/concepts/autonomy-gates.md) | Five trust tiers (HIGH / STANDARD / RESTRICTED / PROBATION / PROVISIONAL). Promotion and demotion rules. Gate expansion on demonstrated trust. |
| [Pre-Spawn Protocol](docs/control-plane/pre-spawn-protocol.md) | Three-step decision tree before any agent spawns. Governs whether to /spec, /plan or require a Boardroom session. |
| [HITL Gates](docs/control-plane/hitl-gates.md) | Human-in-the-loop approval chains. Gate types, authority levels, delegation with TTL and 3-strike escalation. |
| [Build State Machine](docs/control-plane/build-state-machine.md) | Agent execution lifecycle from DEBUG through COMPLETE, with loop conditions, QA enforcement and escalation triggers. |
| [Hook System](docs/control-plane/hook-system.md) | OS-level enforcement via PreToolUse and PostToolUse hooks. exit(2) = hard block. Fail-closed by default. Operator override with TTL. |
| [Enterprise Scaling](docs/architecture/enterprise-scaling.md) | Multi-workspace model, Division Orchestrator, role-agent alignment and work queues at team, division and enterprise scope. |
| [Controlled Learning Protocol](docs/operating-model/controlled-learning-protocol.md) | How agentic teams improve over time without self-modification. Agents surface failure patterns and propose instruction changes. Human review is the approval boundary. Feeds directly into D4 trust scoring. |

---

## Implementation Status

Honest accounting. No mixing of current state and target state. Every
row uses the four-label legend defined above.

| Capability | Status |
|---|---|
| Postgres governance schema (10 tables, full tenant/division/workspace scope) | Implemented |
| Hash-chained audit service (separate process, tamper-evident) | Implemented |
| AWFAgentRuntime interface v1.0 | Implemented |
| SimulatedRuntimeAdapter | Implemented |
| Risk classifier (10 rules, deterministic) | Implemented |
| Priority queue (SELECT FOR UPDATE SKIP LOCKED) | Implemented |
| Approval gate (high/critical risk) | Implemented |
| Agent assignment (5 roles, task-class routing) | Implemented |
| D1-D4 reference scorer (D3/D4 deterministic, D1/D2 candidate) | Implemented |
| QA verdict production (AJV-validated) | Implemented |
| End-to-end CLI demo | Implemented |
| Single-workspace orchestrator model | Implemented |
| D1-D4 trust scoring rubric and calibration anchors | Implemented |
| Failure memory (17-class taxonomy) | Implemented |
| Hook enforcement templates | Implemented |
| AWF CLI (awf init, awf check, awf add) | Implemented |
| Claude Code runtime adapter | Planned Sprint 2 |
| Codex runtime adapter | Planned Sprint 2 |
| Automated D1/D2 scoring | Planned Sprint 1+ |
| Multi-workspace enterprise control plane | Planned Sprint 2+ |
| AGT integration | Experimental (shadow mode) |
| R1 PR test routine | Planned |
| R4 security scan routine | Planned |

---

## What You Can Use Today

You can adopt the framework incrementally:

0. Run the demo to see governance end to end:

    node examples/awf-demo/src/run-demo.js

1. Scaffold the starter framework into a repo:

    npx agentic-workforce-framework@latest init

2. Start with the D1-D4 trust scoring rubric and score your first agent session.
3. Add FailureRecord tracking for recurring agent mistakes.
4. Introduce AgentTaskManifest before spawning agents on high-risk tasks.
5. Add hook enforcement for high-risk file and commit actions.
6. Move to Postgres-backed governance when file-based tracking becomes limiting.

---

## Repository Layout

Top-level folders in this repository:

- `agents/` — Reference agent role definitions (orchestrator, frontend, backend, QA, fix).
- `calibration/` — D1-D4 rubric anchors, confidence band guide, scoring ledger and anti-patterns.
- `database/migrations/` — Postgres migrations for the Sprint 0 governance schema.
- `docs/` — Concepts, control plane, architecture, operating model and guides.
- `examples/awf-demo/` — End-to-end demo runner and sample backlog.
- `governance/` — Runtime state templates. Copy into your own repo and populate them.
- `hooks/` — Sanitized PreToolUse / SubagentStart / PostToolUse hook examples.
- `routines/` — Scheduled automation routine specs.
- `schemas/v1/` — JSON Schema files for AgentTaskManifest, QAVerdict, FailureRecord and TrustScore.
- `services/audit-service/` — Hash-chained audit service (separate process).
- `services/execution/` — AWFAgentRuntime interface and SimulatedRuntimeAdapter.
- `services/governance/` — Intake, classifier, queue, approvals and assignment.
- `services/scoring/` — D1-D4 scorer, QA verdict production and trust store.
- `packages/awf-cli/` — npm CLI for scaffolding AWF artifacts into a target repo.

---

## Schemas

Five JSON schemas ship with v1.0, all AJV Draft 2020-12 compatible.
Schemas are versioned under `schemas/v1/`. Breaking changes require a new version path.

| Schema | Purpose |
|---|---|
| [AgentTaskManifest](schemas/v1/agent-task-manifest.schema.json) | Mission context, files in scope, risk level and verification required. |
| [QAVerdict](schemas/v1/qa-verdict.schema.json) | Structured verdict with per-criterion evidence and ULID key. |
| [FailureRecord](schemas/v1/failure-record.schema.json) | 17-class failure taxonomy, recurrenceCount and prevention rule. |
| [TrustScore](schemas/v1/trust-score.schema.json) | D1-D4 per dimension, total score, trust level and confidence band. |
| [AgentSpawnSidecar](schemas/v1/agent-spawn-sidecar.schema.json) | Hook-readable spawn authorization record. The enforcement artifact for agent spawn governance. |

---

## Database

Sprint 0 ships seven sequential migrations under `database/migrations/`.
Apply them in order against a Postgres 15+ database.

The schema establishes 10 tables with full tenant, division and workspace
scope on every workspace-scoped record. The audit schema adds a physically
separate hash-chained event log with tamper detection.

---

## Hooks

The [/hooks/](hooks/) directory contains sanitized, commented example implementations
of OS-level enforcement hooks for Claude Code. All paths are template placeholders.

PreToolUse enforcement hooks fail closed:

- exit(2) = hard block, agent cannot proceed
- Any hook error defaults to block, not allow

PostToolUse audit hooks cannot retroactively block completed actions.
They write audit events, failure records and governance alerts.

---

## Calibration

Trust scoring without calibration produces drift. The [/calibration/](calibration/)
directory provides the D1-D4 rubric with anchored examples, a confidence band
guide (n=sessions to band), a scoring ledger template and an anti-patterns document.

---

## Getting Started

See [docs/guides/getting-started.md](docs/guides/getting-started.md) for a 30-minute path to:

1. Defining your agent roster with the agents-as-employees model
2. Running your first scored session (D1-D4, with evidence)
3. Writing your first FailureRecord
4. Setting a trust tier for each agent

---

## IP and scope boundary

This repository contains a generalized agentic operating architecture
and governance framework. It excludes:

- Product-specific implementation logic
- Proprietary prompts or AI persona design
- Commercial workflows and pricing logic
- Customer or session data
- Supplier integration details
- Patent-sensitive product scoring logic
- Private repository paths or internal operational identifiers

The framework is extracted from a working reference implementation
and generalized for public use. The reference implementation itself
is private and not covered by this repository's license.

---

## Contributing

Contributions welcome in three areas:

**Concepts and documentation.** Corrections, clarifications and additions to the framework docs.

**Case studies.** If you have adopted this framework or adapted it, submit a case study
using [the template](examples/case-studies/TEMPLATE.md).

**Schema extensions.** Propose new schemas or schema versions via GitHub issue.
Schema changes require a documented rationale and a backward-compatibility statement.

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines.

---

## Safety

This framework was built alongside production agent systems. It includes explicit coverage for:

- Prompt injection defense at the hook layer
- Subagent spawn governance (subagents cannot spawn subagents)
- Operator override with TTL (no permanent overrides)
- Audit log entry on every override use
- Hard-stop rules for D1-D4 scoring (falsified telemetry = automatic demotion)
- Fail-closed hook design: any hook error blocks the action

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

---

## License

MIT. See [LICENSE](LICENSE).

The framework, schemas, hook patterns and database schemas are freely usable under MIT.
Any reference to the reference implementation indicates a private implementation not
covered by this license.

---

*Agentic Workforce Framework — originated by Ramesh Ayyagari (https://github.com/rayyagari2-create), 2026*