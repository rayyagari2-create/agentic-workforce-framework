# Agentic Workforce Framework

**An operating model for autonomous agent teams. Not a library.**

Most teams building with AI agents have model APIs and prompt files.
This framework gives them the rest: persistent agent identity, behavioral trust scoring,
failure memory, autonomy gates, approval gate chains, enforcement hooks and enterprise scaling.

> Status: Production-informed reference architecture.
> Current implementation: single-founder / single-workspace.
> Enterprise scaling model: designed extension, not yet field-proven at multi-team scale.

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

This framework addresses that gap by defining an operating model for agent identity,
task assignment, behavioral trust, failure memory, approval gates and enterprise scaling.

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

**Governance is the control plane. Not the architecture.**
The workforce plane is the headline. Governance is what makes it safe to run autonomously.

---

## The Agents-as-Employees Model

The framework maps every HR concept to an agent governance equivalent.

| HR Concept | Agent Equivalent | Status |
|---|---|---|
| Job description | Capability boundary + instruction file | ✅ Live |
| Employment contract | AgentTaskManifest | ✅ Live |
| Work log | Agent bulletin | ✅ Live |
| Performance review | D1-D4 trust scoring per session | ✅ Live |
| KPIs / OKRs | Acceptance criteria + QAVerdict | ✅ Live |
| Incident report | FailureRecord | ✅ Live |
| Manager | Orchestrator | ✅ Live |
| Reference check before task | Pre-task failure retrieval | ✅ Live |
| Promotion | Autonomy gate expansion | ✅ Live |
| PIP | RESTRICTED / PROBATION trust tier | ✅ Live |
| Scheduled recurring work | Claude Code Routines | Next |
| HR policy engine | Runtime policy layer | Next |
| Workforce analytics | Command Center | Designed |
| Team lead | Manager Agent | Designed |
| Department head | Division Orchestrator | Designed |

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

## Who This Is For

This framework is for teams that already have or are planning autonomous coding,
operations, research or workflow agents and need a durable operating model for
identity, trust, failure memory, human approval and auditability.

It is especially useful for engineering leaders, platform teams, AI governance teams
and founders building multi-agent systems beyond one-off prompts.

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

---

## Implementation Status

Honest accounting. No mixing of current state and target state.

| Capability | Status |
|---|---|
| Single-workspace orchestrator model | Live: running in private reference implementation |
| D1-D4 trust scoring | Live in private reference implementation: 15+ scored sessions |
| Failure memory | Live: file-based, 17-class taxonomy |
| Hook enforcement | Live in private reference implementation: 13 hooks; public repo includes sanitized examples of core spawn control pattern |
| AGT integration | Shadow mode live, enforcement pending |
| Postgres governance schema | Schema live, data migration in progress |
| R1 PR test routine | Next |
| R4 security scan routine | Next |
| Enterprise multi-workspace model | Designed, not yet field-proven |
| Automated trust scoring (R10) | Designed, future |
| Work queue system | Designed, future |
| Approval gate chains | Designed, future |

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

Four generic JSON schemas ship with v1.0, all AJV Draft 2020-12 compatible.
Schemas are versioned under `schemas/v1/`. Breaking changes require a new version path.

| Schema | Purpose |
|---|---|
| [AgentTaskManifest](schemas/v1/agent-task-manifest.schema.json) | Mission context, files in scope, risk level and verification required. The employment contract for a task. |
| [QAVerdict](schemas/v1/qa-verdict.schema.json) | Structured pass/fail with per-criterion evidence and ULID key. No judgment calls in the output format. |
| [FailureRecord](schemas/v1/failure-record.schema.json) | 17-class failure taxonomy, recurrenceCount, prevention rule and agents involved. |
| [TrustScore](schemas/v1/trust-score.schema.json) | D1-D4 per dimension, total score, trust level and confidence band. |

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

## What This Is Not

**Not a runtime library.** This is a framework: concepts, schemas, patterns and reference SQL.
You implement it in your stack.

**Not a model or inference layer.** The framework is model-agnostic. It governs agent behavior
regardless of which model the agent uses.

**Not a replacement for a runtime policy layer.** Runtime enforcement governs what agents are
permitted to do. This framework governs whether they can be trusted to do it over time.
Both are needed. Neither replaces the other.

**Not a finished product.** The enterprise scaling model is designed but not yet field-proven
at multi-team scale. That section is labeled explicitly. We do not claim what has not been measured.

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

*Agentic Workforce Framework, production-informed from a private reference implementation*
*First public release: 2026*
