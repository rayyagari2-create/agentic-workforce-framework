# Framework Plane Agent Roster

This document is the canonical roster of components on the framework
plane (the public framework). It lists every named component, its
classification, its human-role equivalent, its trust tier at
introduction, and its current implementation status.

The framework plane governs the build process: planning, executing,
reviewing, and recording work. It does not include any product-layer
runtime components those live in private reference implementations
that build on top of the framework.

For the classification rubric (agent vs service vs hybrid vs routine),
see [agent-vs-service.md](agent-vs-service.md).

---

## Status Legend

| Label | Meaning |
|---|---|
| Implemented | Running in the reference implementation today |
| Experimental | Partially implemented — some components live |
| Planned | Designed or roadmapped — not yet built |

Every entry below carries one of these labels. No mixing of current
state and target state.

---

## 1. Governance Layer Roster

These are the components that govern the build process: routing tasks,
verifying outcomes, repairing failures, and escalating decisions. They
are the public framework's headline.

| ID | Name | Class | Human Equivalent | Trust at Introduction | Status |
|---|---|---|---|---|---|
| orchestrator | Orchestrator | Agent | Engineering Manager | HIGH 100/100 | Implemented |
| qa-agent | QA Agent | Agent | QA Lead | HIGH 100/100 | Implemented |
| fix-agent | Fix Agent | Agent | SRE | HIGH | Implemented |
| security-check | Security Check Agent | Agent | Security Engineer | PROVISIONAL | Planned |
| evolve | Evolve Service | Service | Process Engineer | | Planned |
| code-review | Code Review Agent | Agent | Staff Engineer | | Planned |
| chief-of-staff | Chief of Staff Agent | Agent | Ops Manager | | Planned |
| deep-research | Deep Research Agent | Agent | Research Analyst | | Planned |
| eval-telemetry | Eval/Telemetry Service | Service | Data Engineer | | Planned |
| deploy | Deploy Service | Service | DevOps Engineer | | Planned |

**Notes on trust at introduction:**

- HIGH 100/100 reflects calibrated trust accumulated over the live
  reference implementation's session history. New deployments of the
  framework start every agent at PROVISIONAL until five sessions of
  D1-D4 evidence are recorded.
- Services do not carry a trust tier. They are verified by tests and
  schema validation, not by D1-D4. The trust column reads "—" for
  services intentionally.
- Wave 2+ components have not yet accumulated trust evidence. Their
  trust tier at introduction will be PROVISIONAL when first deployed.

**Human-role equivalents** are not titles bestowed on the agent. They
are framing devices that map the component's accountability into the
"agents are employees" model useful when explaining the roster to
people who don't think in agent-frameworks language.

---

## 2. Executing Agents

These are the agents that the Orchestrator dispatches to perform the
build work. They sit one level below the governance roster and handle
the day-to-day execution of feature work.

| ID | Name | Class | Boundary | Trust at Introduction | Status |
|---|---|---|---|---|---|
| frontend-agent | Frontend Agent | Agent | Render and verify the user-facing surface | HIGH 100/100 | Implemented |
| backend-agent | Backend Agent | Agent | Server-side logic and APIs | HIGH 100/100 | Implemented |

**Boundary discipline:** Each executing agent has a documented file
scope. The Frontend Agent does not touch server-side logic; the Backend
Agent does not touch the user-facing surface. Boundary violations are a
D3 compliance failure and trigger a trust tier review.

**Trust at introduction (executing agents):** New deployments start the
executing agents at PROVISIONAL. The HIGH 100/100 entries above reflect
the reference implementation's accumulated trust, not a default that
ships with the framework.

---

## 3. Roster Totals

The framework plane v1.0 contains:

- **9 Agents** (Orchestrator, QA, Fix, Security Check, Code Review,
  Chief of Staff, Deep Research, Frontend, Backend)
- **3 Services** (Evolve, Eval/Telemetry, Deploy)
- **Routines** at the framework plane: R1 (PR test) and R4 (security
  scan). See `routines/README.md`.

Hybrids are not present at the framework plane in v1.0. They appear in
private reference implementations that ship a product layer on top of
the framework.

---

## 4. Adding to the Roster

A new component is added to the roster only when:

1. Its classification (agent / service / hybrid / routine) is documented
   per the rubric in [agent-vs-service.md](agent-vs-service.md).
2. Its boundary is documented what files / tables / APIs it touches,
   and what it explicitly does not touch.
3. Its human-role equivalent is named the framing device that maps
   its accountability into the agents-as-employees model.
4. Its trust tier at introduction is set. Default: PROVISIONAL until
   five sessions of D1-D4 evidence accumulate.
5. Its status label is set per the legend above.

Removing a component from the roster is a Boardroom-level decision.
Components that earned trust history do not vanish from the audit log
when retired their identity persists, marked as retired.

---

## Related

- [agent-vs-service.md](agent-vs-service.md) The classification rubric.
- `docs/concepts/agentic-workforce-model.md` —
  The agents-as-employees framing.
- `docs/concepts/trust-scoring.md` —
  D1-D4 trust scoring and tier thresholds.
