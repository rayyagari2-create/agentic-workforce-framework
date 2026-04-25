# Architecture

Structural decisions for the Agentic Workforce Framework. The documents here
describe how the framework fits together, what each part is responsible for,
and why the boundaries are drawn where they are.

This directory complements three other documentation areas. Read this section
when you need to understand how the framework is organized; read elsewhere
when you need something else.

| Directory | What It Covers | Read When |
|---|---|---|
| `docs/concepts/` | Mental models what each idea means | You want to understand a concept (trust scoring, failure memory, autonomy gates) |
| `docs/architecture/` | Structural decisions how the framework fits together | You want to understand boundaries, planes, and decision records |
| `docs/operating-model/` | Day-to-day running how the workforce operates | You want to know how to run it: lifecycle, assignment, performance review |
| `docs/control-plane/` | Enforcement pre-spawn, hooks, HITL gates, audit trail | You want to know how the rules are enforced |

Concepts answer *what*. Architecture answers *how it fits*. The operating model
answers *how to run it*. The control plane answers *how the rules are enforced*.
None of these replaces the others.

---

## Reading Order

Read in this order if you are new to the framework:

1. **[four-plane-model.md](four-plane-model.md)** The top-level architecture.
   Workforce, autonomy, control, and automation. This is the single diagram every
   other document refers back to.
2. **[agent-vs-service.md](agent-vs-service.md)** The classification rubric.
   Distinguishes agents, services, hybrids, and routines. Without this, the
   roster and the schemas read ambiguously.
3. **[agent-roster.md](agent-roster.md)** The five core agents introduced at
   v1.0, with role, classification, human equivalent, and trust tier at
   introduction.
4. **[three-layer-stack.md](three-layer-stack.md)** Where this framework sits
   relative to runtime policy layers and scheduled automation.
5. **[mcp-a2a-integration.md](mcp-a2a-integration.md)** How MCP and A2A
   protocols relate. Intelligence layer vs execution layer.
6. **[enterprise-scaling.md](enterprise-scaling.md)** Multi-workspace,
   Division Orchestrator, role-agent alignment at scale. Designed; not yet
   field-proven.
7. **[architecture-review-log.md](architecture-review-log.md)** Reviewer
   concerns and how each was resolved. Demonstrates iteration.
8. **[decision-records/](decision-records/)** ADRs. Why each major decision
   was made, what was considered, what the consequences are.

---

## Document Summaries

### [four-plane-model.md](four-plane-model.md)

Full narrative of the four planes. The Agentic Workforce Plane runs the work
(Orchestrator, Frontend Agent, Backend Agent, QA Agent, Fix Agent). The
Autonomy Plane scores behavior (D1-D4 trust scoring, failure memory, autonomy
gates, promotion and demotion). The Control Plane enforces rules (pre-spawn
protocol, HITL gates, OS-level hook system, AGT adapter, audit log). The
Automation Plane runs scheduled or event-triggered work (R1 PR test routine,
R4 security scan routine).

The headline is the workforce. Governance is the control plane, not the
architecture.

### [agent-vs-service.md](agent-vs-service.md)

Classification rubric for every component the framework names. An agent has
reasoning, identity, and trust history. A service is deterministic and owns
canonical truth. A hybrid splits internally the reasoning subpart never
writes to canonical tables. A routine is short-lived, trigger-driven, has no
identity, and writes only to `routine_runs`. Includes a tabular decision tree.

### [agent-roster.md](agent-roster.md)

The five live agents at v1.0: Orchestrator, Frontend Agent, Backend Agent,
QA Agent, Fix Agent. Optional Wave 2 entries: Code Review Agent, Boardroom.
Each entry: role definition, human equivalent, classification, trust tier
at introduction, and the boundary between what the framework defines and what
a product team defines.

### [three-layer-stack.md](three-layer-stack.md)

This framework is one of three governance layers. Runtime policy layers (e.g.,
AGT) govern what agents are permitted to do. Scheduled automation (Routines)
governs when lightweight tasks run. This framework governs whether agents can
be trusted to do what they are permitted to do, over time. Each is necessary.
None replaces the others.

### [mcp-a2a-integration.md](mcp-a2a-integration.md)

MCP is the intelligence layer agents reach external context through MCP
connectors. A2A is the execution layer agents spawn and hand off to other
agents through A2A. They are complementary protocols. This framework sits
above both: it does not replace either.

### [enterprise-scaling.md](enterprise-scaling.md)

Multi-workspace model. Division Orchestrator. Role-agent alignment at team,
division, and enterprise scope. Work queues with full lifecycle. Persistent
agent identity that travels with trust history. Approval gate chains.

> Status: Designed, not yet field-proven at multi-team scale. Ships with v3.0.

### [architecture-review-log.md](architecture-review-log.md)

Chronological log of reviewer concerns and how each was resolved. Includes
representative entries from the v10.1, v10.2, and v10.3 hardening cycles.
This document exists so adopters can see that the design was iterated under
external pressure rather than published in a single pass.

### [decision-records/](decision-records/)

Architecture Decision Records, in numbered order. Each ADR records a decision
that has more than one defensible answer. The format makes the rationale
auditable later, even if the original participants are gone.

| ADR | Title |
|---|---|
| [0001](decision-records/0001-agentic-workforce-not-governance-framework.md) | The framework is an agentic workforce model. Governance is the control plane. |
| [0002](decision-records/0002-routines-are-not-agents.md) | Routines are not agents. They have no identity, no trust history. |
| [0003](decision-records/0003-trust-scores-require-calibration.md) | Trust scores require calibration anchors and per-dimension evidence. |
| [0004](decision-records/0004-append-only-audit-log.md) | The audit log is append-only. Lifecycle updates produce new audit events, never edit prior ones. |
| [0005](decision-records/0005-enterprise-scaling-is-v3-field-proven.md) | The enterprise multi-workspace model ships in v3.0 once field-proven, not earlier. |

---

## Editing Conventions

- Diagrams in this directory use the public-safe four-plane block diagram. No
  product-specific names, supplier names, or private repo paths.
- Status labels follow the convention used in the root README:
  *Live*, *Wave 1*, *Wave 2*, *Designed (not yet field-proven)*.
- Architecture documents do not duplicate concept content. They reference
  `docs/concepts/` and `docs/control-plane/` instead.
- Every architectural claim is labeled with implementation status. We do not
  mix current state and target state.
