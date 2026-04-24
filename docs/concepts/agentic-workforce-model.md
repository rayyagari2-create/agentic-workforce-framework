# The Agentic Workforce Model

## What this concept defines

The framework treats autonomous agents as accountable workers, not as ephemeral
function calls or isolated tools. Every concept in the framework — trust scoring,
failure memory, autonomy gates, approval chains — follows from this single framing.

If you do not need persistent agent identity, role boundaries, or trust history
across sessions, you do not need this framework. A prompt library and a model
API are sufficient. The framework exists for the case where you want agents to
operate as a workforce: identifiable, trackable, accountable, and improvable.

---

## Agents as employees

The framework maps every standard human resources concept to an agent governance
equivalent. The mapping is not metaphor. It is operational.

| HR Concept | Agent Equivalent | Why It Matters |
|---|---|---|
| Job description | Capability boundary plus instruction file | The agent's scope is defined and bounded. |
| Employment contract | AgentTaskManifest | Each task has an explicit, structured statement of mission, files in scope, risk level, and verification required. |
| Work log | Agent bulletin | Every state transition is recorded by the agent itself. No silent execution. |
| Performance review | D1-D4 trust scoring per session | Measured, evidence-backed, accumulated over time. |
| KPIs / OKRs | Acceptance criteria plus QAVerdict | Pass/fail with per-criterion evidence — no ambiguity. |
| Incident report | FailureRecord | Structured failure with root cause, prevention artifact, and recurrence count. |
| Reference check before task | Pre-task failure retrieval | The agent reads its own failure history before starting work on a related task. |
| Manager | Orchestrator | Routes tasks, governs spawn decisions, owns session-level coordination. |
| Promotion | Autonomy gate expansion | Demonstrated trust unlocks a wider scope of action without per-step review. |
| Performance improvement plan | RESTRICTED or PROBATION trust tier | Underperforming agents have narrower autonomy and more frequent review. |
| HR policy engine | Runtime policy layer | What the agent is permitted to do, enforced at runtime. |
| Department head | Division Orchestrator | Multi-team coordination at enterprise scale. |
| Workforce analytics | Command Center | Cross-agent, cross-workspace performance and trust trajectory views. |

The reason this mapping matters: every one of these HR concepts has a hundred years
of operational thinking behind it. Borrowing the vocabulary saves the framework
from inventing terms for problems that already have well-understood solutions.

---

## Classification rubric: agent vs service vs hybrid vs routine

Not every component in an agentic system is an agent. Misclassifying a deterministic
service as an agent forces it through trust scoring it will never fail. Misclassifying
an agent as a service hides its decisions from accountability.

### The rubric

**Agent**
- Reasons under uncertainty
- Chooses among multiple valid options
- Benefits from trust scoring because its decisions can be wrong in ways that
  matter
- Has a persistent identity and accumulates a behavioral history
- Examples: Orchestrator, QA-Agent, Code-Review Agent, Constraint Agent

**Service**
- Deterministic logic, no reasoning under uncertainty
- Owns canonical truth for some domain
- Tightly bound to a schema or policy — outputs are validated
- Trust scoring would always be 100/100 because there is no judgment to evaluate
- Examples: Eval/Telemetry Service, Deploy Service, Entitlement Service

**Hybrid**
- Reasoning portion is agentic (selects sources, ranks evidence, annotates)
- Persistence portion is service-like (writes are deterministic, schema-validated)
- Must declare an explicit internal split — see "universal hybrid rule" below
- Examples: domain content aggregator, knowledge synthesizer

**Routine**
- Short-lived, trigger-driven, stateless per run
- Lightweight task that runs on a schedule, an API call, or a repository event
- Not a long-running agent; cannot accumulate a trust score because each run
  is independent
- Examples: scheduled PR test runs, security scans on PR, daily digest summaries

### The universal hybrid rule

A "hybrid" without a precise internal split is hand-waving. Every hybrid must
declare which sub-component reasons and which sub-component owns writes.

```
Reasoning layer:    may rank · infer · annotate · recommend
Persistence layer:  exclusively owns writes · deterministic · schema-validated
Hard rule:          reasoning layer NEVER writes to canonical tables directly
```

This rule prevents the most common hybrid failure mode: an agent that "decides
something" and then "writes it" with no intervening validation. The reasoning
output is always intermediate. The persistence layer is always the gatekeeper.

---

## Role-agent alignment

A core design principle: agents align to roles, not to individuals.

When a human team operates the framework, each person does not get their own
orchestrator instance. Agents are pooled and shared across the team. The
orchestrator belongs to whoever is doing architectural coordination — typically
a tech lead or a rotating designated role.

```
HUMAN TEAM                    AGENT TEAM
─────────────────────────────────────────
Tech Lead          ←→        Orchestrator
Backend Engineer   ←→        Backend Agent
Frontend Engineer  ←→        Frontend Agent
QA Lead            ←→        QA-Agent
```

### Why role-alignment, not user-alignment

- Trust history is per-role-per-instance, not per-user. If the orchestrator
  is reset for every operator, trust never accumulates.
- A new team member inherits the existing agent workforce — they do not start
  from zero on the agents they did not personally configure.
- Failure memory survives staff turnover. The institutional knowledge an agent
  has accumulated does not leave when the operator does.

### One role, one persistent identity

Every active agent role has exactly one persistent identity per workspace.
That identity owns:

- A trust score history (D1-D4 across all sessions)
- A failure memory (the failures it caused or detected)
- A capability boundary (the scope it is allowed to act in)
- An autonomy gate (what it can do without human approval)

When the workforce scales to multiple workspaces, the same role-type may have
multiple instances — one per workspace — and each instance carries its own
trust trajectory. Trust is per-instance. Trust does not reset when an instance
is reassigned to a new workspace.

---

## Invocation versus authority

Two distinct ideas that must not be conflated:

**Invocation** is workspace-scoped. Any authorized member of a workspace may
invoke the orchestrator within that workspace.

**Authority** is role-gated. Only designated roles may approve specific HITL
gate types. Approval authority follows the human role, not the agent invocation.

Conflating them creates the worst failure mode of enterprise governance:
everything requires approval before it can even start. Invocation must be
permissive. Authority must be strict. The framework keeps these separate
deliberately.

---

## What this implies for the rest of the framework

Once you accept agents-as-employees:

1. **Trust scoring is mandatory.** You cannot manage employees without performance
   reviews. The D1-D4 model is the framework's performance review mechanism.

2. **Failure memory is mandatory.** You cannot improve an employee without
   incident records and prevention rules. The 17-class taxonomy is the framework's
   incident management system.

3. **Autonomy gates are mandatory.** You cannot grant authority without earning
   it. The five-tier model (HIGH / STANDARD / RESTRICTED / PROBATION / PROVISIONAL)
   is the framework's promotion-and-PIP system.

4. **Human approval gates are mandatory.** You cannot run a workforce without
   chain of command. HITL gates are the framework's manager-approval system.

5. **Persistent identity is mandatory.** You cannot review someone you cannot
   identify across sessions. Persistent agent identity is the framework's
   employment-record system.

Every other concept in the framework is downstream of the agentic workforce model.
Reading any other concept first will make less sense than starting here.

---

## What this concept is not

- Not an anthropomorphism. The framework treats agents as workers because the
  operational primitives transfer cleanly, not because agents are people.
- Not a runtime mechanism. The agentic workforce model is a framing. Hooks,
  schemas, and database tables make it concrete.
- Not a replacement for runtime policy. What the agent is permitted to do is
  enforced at runtime by a policy layer (the control plane). What the agent
  can be trusted to do is governed by this framework (the autonomy plane).
  Both are needed. Neither replaces the other.

---

## Cross-references

- See [trust-scoring.md](trust-scoring.md) for how performance is measured.
- See [failure-memory.md](failure-memory.md) for how incidents are recorded.
- See [autonomy-gates.md](autonomy-gates.md) for how trust unlocks scope.
- See `schemas/v1/agent-task-manifest.schema.json` for the employment-contract format.
- See `docs/architecture/agent-vs-service.md` for the full classification narrative.
- See `docs/architecture/four-plane-model.md` for where this concept sits in the
  framework architecture.
