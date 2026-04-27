# Agentic Workforce Framework

A reference architecture for operating autonomous AI agents as
accountable digital workers inside enterprise environments.

This framework defines how agents are assigned work, bounded by role,
governed by approval chains, evaluated over time and integrated into
enterprise structures such as divisions, workspaces, audit logs and
control planes.

> **Status:** Production-informed reference architecture.
> **Current implementation:** Single-workspace operating model with a five-agent reference team.
> **Evidence base:** 50+ scored sessions in the reference implementation reporting period. Metrics are self-reported and have not been independently audited.
> **Enterprise scaling model:** Designed extension, not yet field-proven at multi-team scale.

---
## Where this fits

This repository is designed to be adapted, not installed.

It is not an agent runtime, SDK, hosted product, or drop-in replacement for
LangGraph, CrewAI, Claude Code, Microsoft Agent Governance Toolkit, or any
other execution framework.

Those tools help agents run.

This framework defines the operating discipline around agent work: identity,
task contracts, failure memory, behavioral trust scoring, escalation, approval
gates and auditability.

Most teams should adapt the concepts, schemas, controls and reference patterns
to their own runtime, risk model and enterprise environment.

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
- Reference Postgres governance schema
- Enterprise extension schema (divisions, workspaces, agent instances)
- Reference agent instruction files (five-agent team)
- Failure memory taxonomy (17 classes)
- Calibration anchors and scoring rubric

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

The Implementation Status table below applies these labels to every
capability claim. The labels are deliberately conservative: a capability
moves to "Implemented" only after sustained use in the reference
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
the operational reliability of agents — not the safety of their
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

## Current Limitations

- Single-workspace reference implementation only. Multi-workspace
  enterprise scaling is Reference Pattern, not field-proven.
- Manual D1-D4 scoring is the current implementation. Automated
  trust scoring is Planned. At enterprise scale, D1-D4 should be computed from structured QA verdicts, policy violations, audit events and failure recurrence data.
- Hook examples require environment-specific adaptation.
  Claude Code native hooks work out of the box. Framework-enriched
  hooks require payload enrichment before use in Claude Code.
- Runtime policy layer (AGT integration) is Experimental —
  shadow mode in the reference implementation.
- Claude Code does not provide framework-enriched context fields
  (agent_id, agent_depth, session_reads) by default. These must
  be derived from sidecar manifests or runtime state files.
- Postgres governance schema is live with schema and constraints
  in place. Data migration from file-based governance is in
  progress in the reference implementation.

---

## The Problem

Enterprise AI agents are moving from isolated tools to autonomous digital workers.
They plan, execute, review, escalate and collaborate across increasingly complex workflows.
The question has shifted from:

> *"Can this model answer correctly?"*

to:

> *"How do we operate autonomous agent teams like an accountable workforce?"*

That requires persistent identity, role boundaries, task assignment, work logs, trust
history, failure memory, approval gates, policy enforcement and enterprise-scale team structures.
Most teams are still early here. Many have model APIs and prompt files, but not yet
a durable operating model for agent identity, trust, failure memory and autonomy.

---

## The Four-Plane Architecture

```
╔════════════════════════════════════════════════════════════════╗
║  AGENTIC WORKFORCE PLANE  ✅                                    ║
║                                                                 ║
║  Orchestrator · Frontend Agent · Backend Agent                  ║
║  QA Agent · Fix Agent                                           ║
╠════════════════════════════════════════════════════════════════╣
║  AUTONOMY PLANE  ✅                                             ║
║                                                                 ║
║  D1-D4 Trust Scoring (manual) · Failure Memory (17 classes)     ║
║  Autonomy Gates · Promotion / Demotion                          ║
╠════════════════════════════════════════════════════════════════╣
║  CONTROL PLANE  ⚠️ partial                                      ║
║                                                                 ║
║  Pre-Spawn Protocol · HITL Gates · OS-Level Hook System         ║
║  AGT Adapter (shadow mode) · Audit Log (file-based)             ║
╠════════════════════════════════════════════════════════════════╣
║  AUTOMATION PLANE  next                                         ║
║                                                                 ║
║  PR Test Routine (R1) · Security Scan Routine (R4)              ║
╚════════════════════════════════════════════════════════════════╝
```

The status glyphs above mirror the four-label legend: ✅ corresponds
to Implemented, ⚠️ to Experimental, "next" to Planned. The full
breakdown is in the Implementation Status table further down.

**Governance is the control plane. Not the architecture.**
The workforce plane is the headline. Governance is what makes it safe to run autonomously.

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
| Behavioral accountability | **This framework** | Whether agents can be trusted to do it: trust over time, failure memory |

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
| [Pre-Spawn Protocol](docs/control-plane/pre-spawn-protocol.md) | Three-step decision tree before any agent spawns. Governs whether to /spec, /plan, or require a Boardroom session. |
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
| Single-workspace orchestrator model | Implemented |
| D1-D4 trust scoring | Implemented |
| Failure memory | Implemented |
| Hook enforcement | Implemented in reference implementation; public repo ships sanitized hook templates |
| AGT integration | Experimental |
| Postgres governance schema | Experimental |
| R1 PR test routine | Planned |
| R4 security scan routine | Planned |
| Enterprise multi-workspace model | Reference Pattern |
| Automated trust scoring (R10) | Planned |
| Work queue system | Planned |
| Approval gate chains | Planned |

---

## What You Can Use Today

You can adopt the framework incrementally:

1. Start with the D1-D4 trust scoring rubric and score your first agent session.
2. Add FailureRecord tracking for recurring agent mistakes.
3. Introduce AgentTaskManifest before spawning agents on high-risk tasks.
4. Add hook enforcement for high-risk file and commit actions.
5. Move to Postgres-backed governance when file-based tracking becomes limiting.

---

## Repository Layout

Top-level folders in this repository:

- `agents/` — Reference agent role definitions (orchestrator, frontend, backend, QA, fix).
- `calibration/` — D1-D4 rubric anchors, confidence band guide, scoring ledger and anti-patterns.
- `database/` — Postgres schemas: `database/governance/` (core) and `database/enterprise/` (multi-workspace extension).
- `docs/` — Concepts, control plane, architecture, operating model and guides.
- `examples/` — Case study templates and worked examples.
- `governance/` — Runtime state templates. Copy these files into your own repo and populate them. These are operational files your orchestrator reads at startup — not framework documentation.
- `hooks/` — Sanitized PreToolUse / SubagentStart / PostToolUse hook examples plus Claude Code settings template.
- `routines/` — Scheduled automation routine specs.
- `schemas/` — JSON Schema files for AgentTaskManifest, QAVerdict, FailureRecord and TrustScore.

---

## Schemas

Five JSON schemas ship with v1.0, all AJV Draft 2020-12 compatible.
Implementations are expected to extend agent rosters, failure classes and domain-specific validation rules through versioned schema extensions rather than modifying adopted schemas silently.
Schemas are versioned under `schemas/v1/`. Breaking changes require a new version path.

| Schema | Purpose |
|---|---|
| [AgentTaskManifest](schemas/v1/agent-task-manifest.schema.json) | Mission context, files in scope, risk level and verification required. The employment contract for a task. |
| [QAVerdict](schemas/v1/qa-verdict.schema.json) | Structured pass/fail with per-criterion evidence and ULID key. No judgment calls in the output format. |
| [FailureRecord](schemas/v1/failure-record.schema.json) | 17-class failure taxonomy, recurrenceCount, prevention rule and agents involved. |
| [TrustScore](schemas/v1/trust-score.schema.json) | D1-D4 per dimension, total score, trust level and confidence band. |
| [AgentSpawnSidecar](schemas/v1/agent-spawn-sidecar.schema.json) | Hook-readable spawn authorization record. Written by the Orchestrator before Agent tool call. Validated by the PreToolUse hook. The enforcement artifact for agent spawn governance. |

---

## Database

Two SQL schemas ship with this framework, both Postgres-compatible.

**[/database/governance/](database/governance/)** Core governance tables for any single-workspace deployment.
Includes audit log, agent events, trust scores, failure records and routine runs.
Run this first.

**[/database/enterprise/](database/enterprise/)** Enterprise extension for multi-workspace deployments.
Includes divisions, workspaces, persistent agent instances, work queue items,
gate records and delegation rules.
Run this only when scaling to multi-team. Requires the governance schema first.

---

## Hooks

The [/hooks/](hooks/) directory contains sanitized, commented example implementations
of OS-level enforcement hooks for Claude Code. All paths are template placeholders.
No private repository references exist in any example.

All hooks follow two rules:

- exit(2) = hard block, agent cannot proceed
- Fail closed: any error defaults to block, not allow

---

## Calibration

Trust scoring without calibration produces drift. The [/calibration/](calibration/) directory
provides the D1-D4 rubric with anchored examples, a confidence band guide (n=sessions to band),
a scoring ledger template and an anti-patterns document covering the most common scoring mistakes.

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
The most useful case studies show what you adapted, not just that it worked.

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
*First public release: 2026*
