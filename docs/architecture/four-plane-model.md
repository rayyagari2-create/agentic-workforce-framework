# The Four-Plane Model

The Agentic Workforce Framework is organized into four planes. Each plane has
a distinct responsibility, a distinct cadence, and a distinct authority. They
stack vertically: the workforce plane runs the work; the autonomy plane scores
the work; the control plane enforces the rules around the work; the automation
plane runs scheduled or event-triggered checks alongside the work.

This document describes each plane in narrative form, with the design
rationale for keeping them separate.

---

## The Diagram

```
╔════════════════════════════════════════════════════════════════╗
║  AGENTIC WORKFORCE PLANE                                        ║
║                                                                 ║
║  Orchestrator · Frontend Agent · Backend Agent                  ║
║  QA Agent · Fix Agent                                           ║
╠════════════════════════════════════════════════════════════════╣
║  AUTONOMY PLANE                                                 ║
║                                                                 ║
║  D1-D4 Trust Scoring (manual) · Failure Memory (17 classes)     ║
║  Autonomy Gates · Promotion / Demotion                          ║
╠════════════════════════════════════════════════════════════════╣
║  CONTROL PLANE                                                  ║
║                                                                 ║
║  Pre-Spawn Protocol · HITL Gates · OS-Level Hook System         ║
║  AGT Adapter (shadow mode) · Audit Log (file-based)             ║
╠════════════════════════════════════════════════════════════════╣
║  AUTOMATION PLANE                                               ║
║                                                                 ║
║  PR Test Routine (R1) · Security Scan Routine (R4)              ║
╚════════════════════════════════════════════════════════════════╝
```

The workforce plane is the headline. The other three planes exist to make the
workforce plane safe to run autonomously.

---

## Agentic Workforce Plane

**What it contains:** The agents that do work. At v1.0, this is five roles:
Orchestrator, Frontend Agent, Backend Agent, QA Agent, Fix Agent. See
[agent-roster.md](agent-roster.md) for full role definitions.

**What it produces:** Code changes, QA verdicts, failure records, handoffs,
session output. Anything tied to a deliverable lives here.

**Cadence:** Per task. The workforce plane is invoked when a human or another
agent has work to do. The Orchestrator routes; executing agents work; the QA
Agent verifies; the Fix Agent resolves failures.

**Authority:** Bounded by capability boundary, autonomy gate, and pre-spawn
protocol. An agent at the PROVISIONAL trust tier may not pick up a HIGH-risk
task even if it is technically capable.

**Design rationale:** Most agent frameworks stop here. They have prompts,
tool access, and an orchestration loop. That is enough for short-lived
demos. It is not enough for sustained operation, because there is no record
of which agent did what, how well it did, and what it has failed at before.
That record is not part of the workforce plane. It belongs to the autonomy
plane below.

---

## Autonomy Plane

**What it contains:** The mechanisms that decide how much trust each agent
has earned. At v1.0, this is D1-D4 trust scoring (Correctness, Observability,
Compliance, Recurrence), the 17-class failure memory taxonomy, autonomy gates
(HIGH / STANDARD / RESTRICTED / PROBATION / PROVISIONAL), and the rules for
promotion and demotion.

**What it produces:** Trust scores per session per agent. Failure records
when an agent fails. Tier changes when trust crosses a threshold. Confidence
bands as session counts grow.

**Cadence:** Per session. Trust scoring is observer-assigned at session
close. Failure records are written when QA returns a FAIL or when a known
pattern recurs. Promotion and demotion are evaluated against the running
score history.

**Authority:** The autonomy plane does not block work directly. It feeds the
control plane, which is what decides whether work proceeds. The separation
matters: a low trust score does not stop an agent — a low trust score plus a
high-risk task plus a control plane gate stops an agent.

**Design rationale:** Behavioral accountability is a long-running signal,
not a single-action decision. An agent that performs well on five sessions
in a row has earned different treatment than one fresh out of onboarding.
The autonomy plane is where that history is recorded and turned into a
tier. Without this plane, every task is treated as if the agent has no
history. With this plane, the same agent shows up to its sixth task with
the trust it earned across the previous five.

The autonomy plane is also where failure memory lives. Pre-task failure
retrieval — agents check their own failure history before starting — is a
distinguishing capability of this framework. It exists in the autonomy
plane because failure memory is a property of an agent over time, not a
property of any single task.

---

## Control Plane

**What it contains:** The mechanisms that enforce rules. At v1.0, this is
the pre-spawn protocol (a three-step decision tree before any agent
spawns), HITL gates (human-in-the-loop approval chains), the OS-level hook
system (PreToolUse and PostToolUse with `exit(2)` = hard block), the AGT
adapter in shadow mode, and a file-based append-only audit log.

**What it produces:** Block decisions, approval requests, audit log
entries, override records (TTL-bounded). The control plane does not
produce deliverables; it produces enforcement events.

**Cadence:** Per tool use. Hooks fire on every tool invocation. HITL gates
fire when risk classification crosses a threshold. The pre-spawn protocol
runs once per agent spawn. The audit log is written on every governance
event.

**Authority:** The control plane is fail-closed. Any error in a hook
defaults to block, not allow. Operator override exists but is TTL-bounded,
audited on every use, and not inheritable by subagents.

**Design rationale:** The control plane is what the broader industry calls
"AI governance." We deliberately do not lead with that framing. Governance
is what makes the workforce safe to run autonomously, but it is not the
core value of this framework. The core value is that agents have identity,
earn trust, and remember failures. The control plane is the enforcement
layer that surrounds that core. See [ADR-0001](decision-records/0001-agentic-workforce-not-governance-framework.md).

The control plane is intentionally separated from the autonomy plane.
Trust scoring is a long-running behavioral signal; control is a per-action
enforcement signal. Mixing them produces frameworks where every action is
treated as a fresh judgment, with no memory, or where memory becomes a
compliance theater that does not actually gate anything. Splitting them
keeps each plane honest.

---

## Automation Plane

**What it contains:** Scheduled and event-triggered automation that runs
alongside the workforce. At v1.0, this is the R1 PR Test Routine
(Playwright on every PR with `claude/`-prefixed branches) and the R4
Security Scan Routine (sensitive data scan on every PR).

**What it produces:** Routine run records. Comments on PRs. Alerts.
Routines do not write to trust scores or failure records directly — that
violates the separation of concerns.

**Cadence:** Trigger-driven. Schedule, API, or GitHub event. Each Routine
run is stateless — a new session, no accumulated context.

**Authority:** Lightweight. A Routine cannot spawn an agent. A Routine
cannot modify governance state. Output review by a human reviewer (or by a
designated agent at higher trust tiers) replaces the pre-spawn protocol
that gates full agents.

**Design rationale:** Scheduled automation is qualitatively different
from agent work. The Orchestrator + QA loop is too stateful, too complex,
and too governance-heavy to run on a cron timer. Routines fill the gap
where lightweight, repeatable, unattended tasks need to happen — without
inheriting the governance overhead that agents carry. See
[ADR-0002](decision-records/0002-routines-are-not-agents.md).

The strict write rule for Routines is that they write only to the
`routine_runs` table. They do not write to `trust_scores`, `failure_records`,
or any other governance table. The Eval/Telemetry Service is the sole
writer to `trust_scores`. This rule is what keeps the Automation Plane from
quietly becoming a back door into the Autonomy Plane.

---

## Why Governance Is the Control Plane, Not the Architecture

A framework that leads with governance gets read as a compliance product.
Compliance products are evaluated by checklist: does it have an audit log?
Does it have policy enforcement? Does it have approval flows? The answers
are usually yes-yes-yes, and the framework is mistaken for a finished
governance solution that can be installed.

The actual value of this framework is the workforce plane and the autonomy
plane. Identity. Trust earned over time. Failure memory that survives
restarts. Autonomy gates that expand as trust grows. Promotion and
demotion. These are HR concepts mapped to agents, and they are what most
agent frameworks lack.

The control plane is necessary. We are not minimizing it. But the control
plane is the layer that makes the rest safe to operate. It is not what the
framework is. The framework is the workforce. Governance is the layer that
keeps the workforce honest.

This framing has practical consequences:

- The README leads with the agentic workforce, not with governance.
- The four-plane diagram puts the workforce on top.
- The control plane documentation is grouped under `docs/control-plane/`
  rather than under `docs/governance/`.
- New adopters are pointed first at trust scoring and the agent roster,
  not at hooks and HITL gates.

For the formal record of this decision, see
[ADR-0001](decision-records/0001-agentic-workforce-not-governance-framework.md).

---

## How the Planes Talk to Each Other

The planes are independent in implementation but coupled in operation.

- **Workforce → Autonomy.** Every session ends with a QA Verdict. The QA
  Verdict is the primary D1 evidence input for trust scoring. Failures
  produce FailureRecords; FailureRecords feed pre-task retrieval on the
  next spawn.
- **Autonomy → Control.** Trust tier influences which control plane gates
  fire. An agent at PROBATION triggers a HITL gate on every file change.
  An agent at HIGH triggers a HITL gate only at decision points.
- **Control → Workforce.** Hooks block tool use. HITL gates pause a task
  until approved. The pre-spawn protocol can require a Boardroom session
  before any agent spawns. The control plane decides when the workforce is
  allowed to proceed.
- **Automation ↔ All.** Routines emit run records. Some Routines (R1, R4)
  surface findings as PR comments — output is reviewed by a human, never
  auto-acted on. R10 (Wave 3+) sends a scoring payload to the
  Eval/Telemetry Service, which writes the trust score; the Routine itself
  never writes the score.

These edges are intentionally narrow. A wider interface produces emergent
coupling that erodes the separation. Keep edges narrow; document them.

---

## Status Per Plane

| Plane | v1.0 Status |
|---|---|
| Agentic Workforce Plane | Live in reference implementation |
| Autonomy Plane | Live — manual D1-D4 scoring, file-based failure memory |
| Control Plane | Partial — hooks live, AGT adapter shadow mode, audit log file-based |
| Automation Plane | Wave 1 — R1 and R4 templates published; cloud execution next |

Status labels follow the convention from the root README. We do not mix
current state and target state.
