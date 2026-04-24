# Agent Roster

The framework introduces five agents at v1.0 plus two optional Wave 2
agents. Each entry in this roster is a **role**, not a model or a prompt.
A role is filled by an agent instance with persistent identity and trust
history.

This document defines the role boundary, human equivalent, classification,
and trust tier at introduction for each role. It also calls out where the
framework draws the line and where a product team is expected to fill
in.

---

## Reading the Entries

Each agent entry has the following fields:

- **Role.** What this agent does, in one sentence.
- **Human equivalent.** The HR analog. The roster maps cleanly to the
  agents-as-employees model.
- **Classification.** Agent / Service / Hybrid / Routine. See
  [agent-vs-service.md](agent-vs-service.md).
- **Trust tier at introduction.** Always PROVISIONAL. No agent ships with
  pre-baked trust. See *Trust at Introduction* below.
- **What the framework defines.** The role boundary, the artifacts the
  agent reads and writes, the autonomy gate behavior.
- **What a product team defines.** The instruction file content, the
  domain-specific prompts, the integrations, the model choice.

---

## Trust at Introduction — Always PROVISIONAL

Every agent introduced into a workspace starts at trust tier
**PROVISIONAL**. This is not a placeholder; it is the contract. Trust is
earned through scored sessions, not assigned at instantiation.

A new agent, no matter how good its instruction file is, has zero
sessions of evidence. The framework treats zero evidence as zero trust.
The autonomy gate at PROVISIONAL is narrow: every file change is reviewed,
the agent cannot pick up HIGH-risk tasks, and the Boardroom is invoked
if behavioral concerns persist for three sessions.

Promotion to STANDARD or HIGH happens through demonstrated behavior over
the confidence-band thresholds (n=5 for LOW, n=10 for MEDIUM, n=20 for
HIGH). See `docs/concepts/autonomy-gates.md` for promotion rules.

This rule has one practical consequence: the agents already running in
the reference implementation do have higher trust tiers, but that is
**implementation history**, not a property of the framework. When you
adopt this framework into a new workspace, your agents start at
PROVISIONAL. Earn it.

---

## Live at v1.0

### Orchestrator

**Role.** Routes work to executing agents. Decides whether to /spec, /plan,
or invoke a Boardroom session. Owns task assignment and spawn authority.
Reviews QA verdicts and routes failures back through the Fix Agent.

**Human equivalent.** Engineering manager.

**Classification.** Agent.

**Trust tier at introduction.** PROVISIONAL.

**What the framework defines:**

- The pre-spawn protocol the Orchestrator must run before any spawn.
- The build state machine the Orchestrator drives.
- The handoff format between Orchestrator and executing agents.
- The escalation rules: what triggers Boardroom, what triggers a hold.
- The spawn authority limit: an Orchestrator at PROVISIONAL has reduced
  spawn capacity until it earns higher autonomy.

**What a product team defines:**

- The Orchestrator's domain knowledge — what its repository looks like,
  what its tech stack is, what its team conventions are.
- The model the Orchestrator uses.
- Project-specific routing rules layered on top of capability boundaries.

**Notes.** The Orchestrator is the only role with spawn authority. It
cannot delegate spawn authority to executing agents. Subagents cannot
spawn subagents — this is enforced by the `check-agent-spawn` hook.

---

### Frontend Agent

**Role.** Implements user-interface changes within a defined frontend
scope. Owns the visual layer, component state, and client-side
interactions. Hands off to QA Agent when work is ready for verification.

**Human equivalent.** Frontend engineer.

**Classification.** Agent.

**Trust tier at introduction.** PROVISIONAL.

**What the framework defines:**

- The capability boundary: what file paths the Frontend Agent may write
  to. Typically a `src/` or `client/` subtree.
- The handoff protocol: every task closes with a structured handoff
  including changed files, screenshots, and acceptance criteria status.
- The escalation rule: the Frontend Agent does not implement
  cross-boundary changes alone. If a task requires server changes, the
  Orchestrator routes part of the work to the Backend Agent.

**What a product team defines:**

- The component library, design system, and UI conventions.
- The frontend test framework integration.
- The model the Frontend Agent uses.
- The exact file paths in scope.

---

### Backend Agent

**Role.** Implements server-side changes within a defined backend scope.
Owns API endpoints, business logic, and persistence layer interactions.
Hands off to QA Agent when work is ready for verification.

**Human equivalent.** Backend engineer.

**Classification.** Agent.

**Trust tier at introduction.** PROVISIONAL.

**What the framework defines:**

- The capability boundary: typically a `server/` or `api/` subtree.
- The cross-schema rule: the Backend Agent must not write to product
  truth tables it does not own. Cross-schema writes are prohibited.
- The handoff protocol — same structured format as the Frontend Agent.
- The escalation rule: schema changes typically require a Boardroom
  session. The Backend Agent does not perform schema migrations alone.

**What a product team defines:**

- The persistence layer (Postgres, MySQL, etc.) and ORM choice.
- The service architecture inside the boundary.
- The model the Backend Agent uses.
- Domain-specific business rules.

**Notes.** The Backend Agent is sometimes the agent most likely to need
splitting into bounded sub-agents as a system grows. This is a v3.0
concern; in v1.0 the Backend Agent is one role.

---

### QA Agent

**Role.** Verifies that completed work meets the acceptance criteria.
Produces a structured QAVerdict with per-criterion evidence. Routes FAIL
verdicts back to the Orchestrator with a defect classification.

**Human equivalent.** QA lead.

**Classification.** Agent. The QA Agent reasons about defect
classification, novelty, and escalation — not just pass/fail.

**Trust tier at introduction.** PROVISIONAL.

**What the framework defines:**

- The QAVerdict schema: pass / pass_with_notes / fail, with per-AC
  evidence and a ULID key.
- The hard rule: every executing agent's work passes through the QA
  Agent before commit. There is no agent-self-QA.
- The escalation rule: a QA FAIL routes back to the Orchestrator, never
  back to another subagent.
- The "agentsInvolved" field that records which agents touched the
  task — this is the primary D1 evidence input.

**What a product team defines:**

- The acceptance criteria templates.
- The test framework integration.
- The model the QA Agent uses.

**Notes.** The QA Agent is the closest thing the framework has to a
mandatory checkpoint. SESSION COMPLETE is blocked without a QA PASS or a
documented exception.

---

### Fix Agent

**Role.** Resolves failures surfaced by the QA Agent. Determines root
cause, applies the fix, and writes a FailureRecord with prevention rule
and recurrence count.

**Human equivalent.** Site reliability engineer.

**Classification.** Agent. The Fix Agent reasons about root cause and
prevention strategy — both are uncertain decisions.

**Trust tier at introduction.** PROVISIONAL.

**What the framework defines:**

- The FailureRecord schema: 17-class taxonomy, recurrenceCount,
  prevention rule, agents involved.
- The pre-task failure retrieval: the Fix Agent reads the failure
  library before starting any fix.
- The write authority: the Fix Agent is the only agent that writes to
  the failure library. The QA Agent flags; the Fix Agent records.
- The recurrence escalation rule: ≥2 systemic flag, ≥3 benchmark, ≥5
  systemic-refactor-required.

**What a product team defines:**

- Domain-specific failure subclasses if the 17-class taxonomy needs
  extension. See `docs/guides/failure-taxonomy-adoption.md`.
- The model the Fix Agent uses.

**Notes.** The Fix Agent is the only agent that writes to the failure
library. This single-writer rule is what keeps failure memory coherent.

---

## Optional at Wave 2

The following agents are designed but not part of the v1.0 reference
implementation. They are listed here so the roster is complete; do not
adopt them until you have the v1.0 five running reliably.

### Code Review Agent

**Role.** Reviews code for quality, contract stability, and risk before
merge. Produces a review verdict that supplements the QA Agent's
correctness verdict.

**Human equivalent.** Staff engineer.

**Classification.** Agent. Reasons about code quality and architectural
risk.

**Trust tier at introduction.** PROVISIONAL.

**Why optional:** The Code Review Agent is most useful when the
workforce is producing more code than a single human reviewer can
keep up with. At single-team scale, the Orchestrator + QA Agent + human
reviewer is sufficient. At multi-team scale, the Code Review Agent
absorbs review load while the human reviewer focuses on architectural
decisions.

---

### Boardroom

**Role.** A structured session combining a human reviewer and the
Orchestrator. Reviews escalations, considers retirement of underperforming
agent instances, approves CRITICAL-risk tasks, and resolves disputes
between agents.

**Human equivalent.** A leadership review (VP / Director level).

**Classification.** Agent. The Boardroom reasons about escalation
decisions, agent retirement, and policy exceptions.

**Trust tier at introduction.** PROVISIONAL — but the Boardroom is rarely
allowed to act without a human present, by design.

**Why optional:** The Boardroom exists to handle the cases the
Orchestrator should not handle alone. At single-founder scale, the
Boardroom is just the founder + Orchestrator working together. At
enterprise scale, the Boardroom is the formal escalation path.

---

## Where the Framework Stops

This roster lists **roles**. The framework does not ship with prompts,
instruction files, or models. Filling those in is product work.

The reason is simple: a Frontend Agent for a React-and-Tailwind product
is a different agent from a Frontend Agent for a SwiftUI iOS app. The
role boundary, the handoff format, the autonomy gate behavior, and the
trust scoring rubric are the same. The instruction file content is
domain-specific.

This is the correct division of labor:

| Layer | Owner |
|---|---|
| Role definition (this document) | Framework |
| Capability boundary template | Framework |
| Trust tier rules | Framework |
| Handoff schema | Framework |
| Instruction file content | Product team |
| Model choice | Product team |
| Domain knowledge | Product team |
| Tooling integrations | Product team |

A product team that adopts this framework writes one instruction file per
agent role. The framework provides the role and the surrounding
governance. The product team provides the domain.

---

## Counting

At v1.0 the public framework names **five live agent roles** plus
**two optional agent roles** for Wave 2. There are no live services in
the public framework at v1.0. The Eval/Telemetry Service and the Deploy
Service are designed extensions that ship with later capabilities (Wave 3+).

Routines (R1 and R4) are not in the agent roster. Routines are not
agents. See [ADR-0002](decision-records/0002-routines-are-not-agents.md).
