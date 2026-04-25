# Agent Roster Minimum Viable [v1.0]

A generic five-agent roster for a small team adopting the framework. Every role maps to a human equivalent. Every agent has a stated capability boundary, a trust tier at introduction, and a named approver.

This roster is a starting point. Adapt names, boundaries, and approvers to your team. Do not extend the roster past five agents in the first month the value of the framework is in the discipline of running the same five agents through repeated scored sessions, not in adding more agents.

---

## At a glance

| Agent ID | Human equivalent | Trust tier at introduction | Approver |
|---|---|---|---|
| `orchestrator` | Engineering manager | PROVISIONAL | Founder / lead engineer |
| `agent-fe` | UI / frontend developer | PROVISIONAL | Orchestrator + founder for any commit |
| `agent-srv` | Server / backend developer | PROVISIONAL | Orchestrator + founder for any commit |
| `qa-agent` | Verification engineer | PROVISIONAL | Founder for QA verdicts on high-risk tasks |
| `fix-agent` | On-call engineer | PROVISIONAL | Founder for every fix; cannot self-close failures |

Every agent starts at PROVISIONAL. No exceptions. Trust is observer-assigned and earned over scored sessions, not granted at onboarding.

---

## Orchestrator

**Human equivalent:** Engineering manager.

**Responsibilities:**

- Receives the human-stated goal and translates it into one or more AgentTaskManifest entries.
- Performs pre-task failure retrieval before spawning any subagent reads the relevant FailureRecord index for the domain.
- Spawns Frontend / Backend / QA / Fix agents with the manifest as input.
- Tracks task state across the session (CREATED → ASSIGNED → IN_PROGRESS → COMPLETE).
- Writes the session close at the end.
- Cannot commit code. Cannot bypass HITL gates. Cannot promote or demote any agent's trust tier.

**Capability boundary:**

- Reads any project file. Reads the bulletin. Reads the failure-record index.
- Writes manifests, agent assignments, and the session close.
- Does NOT write code. Does NOT write QA verdicts. Does NOT write failure records.
- Does NOT spawn subagents that spawn subagents. (Subagent depth = 1.)

**Approver:**

- Founder approves the orchestrator's first ten manifests by reviewing each before spawn.
- After ten reviewed sessions with PROVISIONAL → STANDARD progression, founder reviews at decision points only.

---

## Frontend Agent (`agent-fe`)

**Human equivalent:** UI developer.

**Responsibilities:**

- Implements UI changes described in an AgentTaskManifest assigned by the orchestrator.
- Writes bulletin entries at every phase transition (DEBUG → SPEC → PLAN → BUILD → COMPLETE).
- Hands off to QA-Agent with a clear summary of what was changed and where.

**Capability boundary:**

- Reads any project file in the assigned interfaces.
- Writes only to UI-layer files explicitly listed in the manifest's `interfacesTouched`.
- Does NOT modify server code. Does NOT modify database schema. Does NOT touch authentication.
- Does NOT commit. The founder commits after QA pass.
- Does NOT score itself. Does NOT write its own failure records.

**Approver:**

- Orchestrator approves task assignment.
- Founder approves every commit during the PROVISIONAL phase (first 5 sessions minimum).

---

## Backend Agent (`agent-srv`)

**Human equivalent:** Server / backend developer.

**Responsibilities:**

- Implements server-side changes (API, database access, business logic) per the AgentTaskManifest.
- Writes bulletin entries at every phase transition.
- Validates schemas before claiming completion. Schema validation failure = does not advance to QA.

**Capability boundary:**

- Reads any project file in the assigned interfaces.
- Writes only to server-layer files explicitly listed in the manifest's `interfacesTouched`.
- Does NOT modify UI code. Does NOT touch deployment configuration. Does NOT modify hooks.
- Does NOT commit. Does NOT modify any contract schema without the manifest naming the contract in `contractsReferenced`.

**Approver:**

- Orchestrator approves task assignment.
- Founder approves every commit during the PROVISIONAL phase (first 5 sessions minimum).
- Boardroom review required for any task touching auth, payment, or data-integrity domains until tier is STANDARD or higher.

---

## QA Agent (`qa-agent`)

**Human equivalent:** Verification engineer.

**Responsibilities:**

- Reviews the work of `agent-fe` and `agent-srv` against the acceptance criteria in the AgentTaskManifest.
- Produces a QAVerdict per the schema: `pass`, `pass_with_notes`, `fail`, or `block_release`.
- Provides one finding per acceptance criterion, with severity and file/line where observable.
- Detects novelty (new defect vs. repeat). On `repeat`, references prior FailureRecord IDs.

**Capability boundary:**

- Reads any project file. Runs tests. Inspects diffs.
- Writes only QAVerdict files.
- Does NOT modify code under review. Does NOT close failure records. Does NOT score agents directly.
- The QAVerdict is an input to D1 scoring, not a substitute for it.

**Approver:**

- Founder approves QA verdicts for high-risk tasks (riskLevel `high` in the manifest).
- For low and medium risk, the QA verdict stands as written but the founder may override at session close.

---

## Fix Agent (`fix-agent`)

**Human equivalent:** On-call engineer.

**Responsibilities:**

- Receives a `fail` or `block_release` QAVerdict and produces a fix.
- Writes the FailureRecord per the schema. Fills in symptom, root cause, failure class, recurrence count, prevention artifact.
- Adds at least one prevention artifact per fix (regression test, schema validation, guardrail, instruction update).
- Closes the failure record only after a regression test exists OR a documented prevention artifact is in place.

**Capability boundary:**

- Reads any project file.
- Writes only the files needed to implement the fix and the FailureRecord.
- Cannot self-close a failure record without founder approval. Cannot mark `wont_fix` without founder approval.
- Cannot mark `recurrenceCount` lower than QA-Agent observed.

**Approver:**

- Founder approves every fix during the PROVISIONAL phase.
- Founder approves any `wont_fix` resolution at any tier.
- Boardroom review required if `recurrenceCount >= 3` (benchmark addition trigger).

---

## What "PROVISIONAL" means at introduction

Every agent in this roster starts at trust tier PROVISIONAL. From the framework spec:

| Tier | Score range | Autonomy |
|---|---|---|
| HIGH | 90-100 | Medium-risk tasks without step-by-step review |
| STANDARD | 75-89 | Founder reviews at decision points |
| RESTRICTED | 60-74 | Founder reviews before each phase transition |
| PROBATION | <60 | Every file change reviewed; Boardroom if persists 3 sessions |
| **PROVISIONAL** | **n<5 sessions** | **No autonomy. Every action reviewed. Score is unreliable until n>=5.** |

PROVISIONAL is not a low tier it is an unscored tier. The confidence band is too thin to make autonomy decisions. Treat every PROVISIONAL agent as if it were on PROBATION until you have at least five scored sessions.

---

## Promotion rules (minimum viable)

Promotion is not automatic. The founder reviews promotion at session close, not mid-session. The minimum thresholds for the file-based ledger:

| From | To | Required |
|---|---|---|
| PROVISIONAL | RESTRICTED | n>=5 sessions, average total score >=60, no D2=0 in any session |
| RESTRICTED | STANDARD | n>=10 sessions, average total score >=75, no D3=0 in any session |
| STANDARD | HIGH | n>=20 sessions, average total score >=90, no hard-stop in last 10 sessions |

Demotion is one session of any hard-stop (D1=0 customer-impact, D2=0 falsified telemetry, D3=0 hook bypass, D4=0 with pattern in instructions). Demotion is automatic. Promotion is reviewed.
