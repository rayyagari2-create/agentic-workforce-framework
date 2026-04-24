# Glossary

A single alphabetical reference for the precise terms used throughout the
Agentic Workforce Framework. Each entry is short — one to three sentences —
and points to the document where the term is fully defined.

When two terms in the framework look similar but mean different things,
they appear here side by side so the distinction is unambiguous.

---

## A

**A2A (Agent-to-Agent)**
The execution-layer protocol used for agent spawning and task handoff. A2A
is how agents call other agents. It is complementary to MCP, not competing.
Defined in `docs/architecture/mcp-a2a-integration.md`.

**Agent**
A component that reasons under uncertainty, chooses among options, and benefits
from trust scoring. Distinct from a service (deterministic), a hybrid (mixed),
and a routine (short-lived). Defined in
[concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

**Agent task manifest**
The structured statement of mission, files in scope, risk level, and
verification required for a task assigned to an agent. The framework's
employment-contract primitive. Schema:
`schemas/v1/agent-task-manifest.schema.json`.

**Agents-as-employees**
The framing that treats autonomous agents as accountable workers with
persistent identity, performance reviews, and incident records — not as
ephemeral function calls. The foundation for every other concept in the
framework. Defined in
[concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

**AGT**
A runtime policy layer pattern (Microsoft AGT is one example) that governs
what agents are permitted to do at runtime: identity, policy enforcement,
sandboxing, audit trail. The framework sits above any AGT-style layer; it
does not replace one. Defined in
`docs/architecture/three-layer-stack.md`.

**Append-only audit log**
A storage pattern in which entries can be inserted but never updated or
deleted. The framework requires this for the audit log table because
governance evidence must be tamper-evident. Defined in
`docs/control-plane/audit-trail-patterns.md`.

**Approval gate chain**
A sequence of approval gates (HITL, delegation, escalation, approval)
composed to route a request through the correct authority. v2.0+ concept.
Defined in [concepts/approval-gate-chains.md](concepts/approval-gate-chains.md).

**Autonomy gate**
The operational rule that determines what an agent can do without human
approval, based on its trust tier. Five tiers: HIGH, STANDARD, RESTRICTED,
PROBATION, PROVISIONAL. Defined in
[concepts/autonomy-gates.md](concepts/autonomy-gates.md).

**Autonomy plane**
The framework plane responsible for behavioral trust scoring, failure memory,
and autonomy gating. One of the four planes. Defined in
`docs/architecture/four-plane-model.md`.

---

## B

**Build state machine**
The state diagram an agent execution follows from invocation through
completion: IDLE → DEBUG → SPEC → PLAN → HITL → SPAWN → QA → COMPLETE.
States cannot be skipped. Defined in
`docs/control-plane/build-state-machine.md`.

---

## C

**Capability boundary**
The declared scope an agent is allowed to act in: which files, which tools,
which domains. Encoded in the agent's instruction file. The agent's
job-description equivalent. Defined in
[concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

**Confidence band**
A statistical reliability label on a trust score, derived from session count.
PROVISIONAL (n<5), LOW (5-9), MEDIUM (10-19), HIGH (n≥20). Caps the
effective trust tier regardless of total score. Defined in
[concepts/trust-scoring.md](concepts/trust-scoring.md).

**Control plane**
The framework plane responsible for runtime enforcement: hooks, HITL gates,
audit log, pre-spawn protocol. Distinct from the autonomy plane (which
governs trust) and the workforce plane (which executes work). Defined in
`docs/architecture/four-plane-model.md`.

---

## D

**D1 Correctness**
First of the four trust-scoring dimensions. Measures whether the agent
produced the right output and whether acceptance criteria were met on first
attempt. Defined in [concepts/trust-scoring.md](concepts/trust-scoring.md).

**D2 Observability**
Second trust-scoring dimension. Measures whether the agent logged its own
state transitions sufficiently for the session to be reconstructed.
D2 = 0 (falsified telemetry) is a categorical demotion to PROBATION.
Defined in [concepts/trust-scoring.md](concepts/trust-scoring.md).

**D3 Compliance**
Third trust-scoring dimension. Measures whether the agent operated within
policy: no hook bypass, no unauthorized commits, no out-of-scope writes.
Defined in [concepts/trust-scoring.md](concepts/trust-scoring.md).

**D4 Recurrence**
Fourth trust-scoring dimension. Measures whether the agent repeated a known
failure pattern that was already in its instruction file. D4 = 0 mandates
a FailureRecord. Defined in
[concepts/trust-scoring.md](concepts/trust-scoring.md).

**Delegation**
Explicit, time-bounded transfer of approval authority from one human to
another. Delegation cannot be re-delegated. v3.0+ concept. Defined in
[concepts/delegation.md](concepts/delegation.md).

**Division Orchestrator**
A multi-team coordinator at enterprise scale. Spawns Team Orchestrators —
not executing agents directly. Approval authority sits at the division
level for cross-team or CRITICAL-risk tasks. v3.0+ concept. Defined in
`docs/architecture/enterprise-scaling.md`.

---

## E

**Evidence requirement**
The rule that every D1-D4 dimension score must include one line of evidence
explaining why that score band was assigned. Scoring without evidence is
opinion, not measurement. Defined in
[concepts/trust-scoring.md](concepts/trust-scoring.md).

---

## F

**Fail-closed**
A design rule for hooks: any error or unexpected state must result in a
block, not an allow. The framework's hooks default to fail-closed, so a
malformed input or an unreadable config blocks the action rather than
permitting it. Defined in `docs/control-plane/hook-system.md`.

**Failure memory**
The framework's institutional incident system. Structured FailureRecords
across a 17-class taxonomy, with recurrence detection and pre-task
retrieval. Defined in [concepts/failure-memory.md](concepts/failure-memory.md).

**FailureRecord**
The structured record of a single failure: class, root cause, recurrence
count, prevention artifacts, status. Schema:
`schemas/v1/failure-record.schema.json`.

**Four-plane model**
The framework's architecture: Agentic Workforce Plane (agents and execution),
Autonomy Plane (trust and failure), Control Plane (enforcement), Automation
Plane (routines). Defined in `docs/architecture/four-plane-model.md`.

---

## G

**Gate chain**
See approval gate chain.

---

## H

**HITL (Human-in-the-loop)**
A gate type that pauses agent execution and requires explicit human approval
before proceeding. HITL gates fire on risk classification, phase transitions,
or capability boundary crossings. Defined in
`docs/control-plane/hitl-gates.md`.

**Hybrid**
A component classification where the reasoning portion is agentic but the
persistence portion is service-like. Must declare an explicit internal split
(the universal hybrid rule) — reasoning never writes to canonical tables
directly. Defined in [concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

---

## M

**MCP (Model Context Protocol)**
The intelligence-layer protocol used for reading from external sources.
Complementary to A2A. Defined in
`docs/architecture/mcp-a2a-integration.md`.

---

## O

**Orchestrator**
The agent role that routes work, makes spawn decisions, and coordinates
session-level state. The framework's manager-equivalent. Distinct from a
Division Orchestrator (multi-team) and a Manager Agent (named role at
enterprise scale). Defined in `docs/architecture/agent-roster.md`.

---

## P

**Pre-spawn protocol**
The three-step decision tree that runs before any agent spawn: classify the
task, assess risk, route to the correct entry point (DEBUG, SPEC, PLAN,
HITL, or Boardroom). Enforced by hooks. Defined in
`docs/control-plane/pre-spawn-protocol.md`.

**PROBATION**
The trust tier for an agent whose recent session score is below 60. Every
file change requires explicit approval. Three consecutive PROBATION sessions
trigger Boardroom-level review. Defined in
[concepts/autonomy-gates.md](concepts/autonomy-gates.md).

**PROVISIONAL**
The trust tier assigned to a newly registered agent or a returning agent
with insufficient session history. Behaves as PROBATION until first scoring.
Defined in [concepts/autonomy-gates.md](concepts/autonomy-gates.md).

---

## Q

**QA Verdict**
The structured pass/fail output of the QA agent after a session. Includes
per-criterion evidence and trust-score input data. Schema:
`schemas/v1/qa-verdict.schema.json`. Primary input to D1.

---

## R

**Recency weight**
The weighting applied to a session score based on its age. 0–30 days: 1.0×;
31–90 days: 0.5×; >90 days: 0.25×. Prevents stale agents from coasting on
old performance. Defined in [concepts/trust-scoring.md](concepts/trust-scoring.md).

**Recurrence count**
The integer count of how many times a failure class has occurred for a given
agent or domain. ≥ 2 auto-promotes the class to the agent's instruction file.
≥ 3 adds a benchmark. ≥ 5 forces systemic-refactor-required. Defined in
[concepts/failure-memory.md](concepts/failure-memory.md).

**Reference implementation**
The private single-workspace deployment from which this framework was
extracted. Sanitized description in
[reference-implementation.md](reference-implementation.md).

**RESTRICTED**
The trust tier for an agent with a recent score in the 60–74 band. Reviewer
reviews before each phase transition. Recovery tier between PROBATION and
STANDARD. Defined in [concepts/autonomy-gates.md](concepts/autonomy-gates.md).

**Role-agent alignment**
The principle that agents align to roles (Tech Lead, QA Lead, etc.), not to
individuals. Agents are pooled and shared across the team. Defined in
[concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

**Routine**
A short-lived, trigger-driven, stateless component. Runs on a schedule, an
API call, or a repository event. Not a long-running agent — does not accumulate
a trust score. Defined in
[concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

---

## S

**Service**
A component classification for deterministic logic that owns canonical truth
for some domain. Tightly schema-bound. Trust scoring does not apply because
there is no judgment under uncertainty. Defined in
[concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md).

**STANDARD**
The default trust tier. Score 75–89. Reviewer reviews at major decision
points. Most active agents should sit here unless they have demonstrated
sustained HIGH performance. Defined in
[concepts/autonomy-gates.md](concepts/autonomy-gates.md).

---

## T

**Trust tier**
One of HIGH, STANDARD, RESTRICTED, PROBATION, or PROVISIONAL — the
operational consequence of a trust score. Determines what the agent can
do without a gate. Defined in
[concepts/autonomy-gates.md](concepts/autonomy-gates.md).

**Trust score**
The 100-point per-session score across D1-D4 dimensions. Accumulated across
sessions, weighted by recency, gated by confidence band. Schema:
`schemas/v1/trust-score.schema.json`. Defined in
[concepts/trust-scoring.md](concepts/trust-scoring.md).

---

## W

**Work queue**
The structured list of tasks awaiting assignment, in progress, blocked, or
complete. Eight-state lifecycle. v2.0+ concept. Defined in
[concepts/work-queues.md](concepts/work-queues.md).

**Workforce plane**
The framework plane that contains the agents themselves: Orchestrator,
executing agents, QA, Fix. The headline plane — the others govern this one.
Defined in `docs/architecture/four-plane-model.md`.

---

## Cross-reference index

| Term | Defined In |
|---|---|
| Agent | [concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md) |
| Autonomy gate | [concepts/autonomy-gates.md](concepts/autonomy-gates.md) |
| Confidence band | [concepts/trust-scoring.md](concepts/trust-scoring.md) |
| D1-D4 | [concepts/trust-scoring.md](concepts/trust-scoring.md) |
| Delegation | [concepts/delegation.md](concepts/delegation.md) |
| Failure memory | [concepts/failure-memory.md](concepts/failure-memory.md) |
| HITL | `docs/control-plane/hitl-gates.md` |
| Hybrid | [concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md) |
| Pre-spawn protocol | `docs/control-plane/pre-spawn-protocol.md` |
| Role-agent alignment | [concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md) |
| Routine | [concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md) |
| Service | [concepts/agentic-workforce-model.md](concepts/agentic-workforce-model.md) |
| Trust score | [concepts/trust-scoring.md](concepts/trust-scoring.md) |
| Trust tier | [concepts/autonomy-gates.md](concepts/autonomy-gates.md) |
