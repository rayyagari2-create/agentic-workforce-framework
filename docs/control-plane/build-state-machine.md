# Build State Machine

**Lifecycle phases for agent execution, with loop conditions and
escalation triggers.**

A session moves through defined phases. Skipping phases is a known
failure mode; looping infinitely between phases is also a known failure
mode. The state machine specifies both the legal transitions and the
escape valves.

---

## The Phases

```
   ┌─────────┐
   │  IDLE   │
   └────┬────┘
        ▼
   ┌─────────┐
   │  DEBUG  │   (only if a defect surfaced; otherwise skip)
   └────┬────┘
        ▼
   ┌─────────┐
   │ DESIGN  │   (= /spec — produce or refine spec)
   └────┬────┘
        ▼
   ┌─────────┐
   │  BUILD  │   (= /plan + execute — code, edits, artifacts)
   └────┬────┘
        ▼
   ┌─────────┐
   │   QA    │
   └────┬────┘
        │
        │  pass ────► COMPLETE
        │
        │  fail ────► FIX ────► QA  (loop, max 3)
        │                 │
        │                 │  3rd fail ────► BOARDROOM
        ▼
   ┌──────────┐
   │ COMPLETE │
   └──────────┘
```

Phase names map to the v10.3 spec's eight states (IDLE, DEBUG, SPEC,
PLAN, HITL, SPAWN, QA, COMPLETE). The mapping consolidates SPEC into
DESIGN and PLAN+SPAWN into BUILD for clarity at this layer; HITL is
treated as a gate rather than a phase since it can fire across phases.

---

## Phase Definitions

### IDLE

The agent has no active task. This is the resting state between
sessions.

Entry: spawn complete or task closed.
Exit: a manifest is delivered (assignment).

### DEBUG

Reproduces a defect, identifies symptoms, and produces a
**confirmed** root cause hypothesis. This phase exists for bug-class
work; for new feature work it is skipped.

Entry: a bug-class manifest is received.
Exit: root cause confirmed (`rootCauseConfirmed = true` in the
FailureRecord), or the cause is determined to require deeper
investigation that exceeds the agent's capability boundary.

DEBUG never produces production code. Code-touching happens in BUILD.

### DESIGN

Produces or refines acceptance criteria and contracts. Outputs are
documents.

Entry: pre-spawn routed to /spec, or DEBUG produced enough understanding
to refine the spec.
Exit: ACs are clear, testable, and signed off by the appropriate
authority.

DESIGN may be skipped when pre-spawn routes to /plan and an existing
spec is current.

### BUILD

Executes the planned changes. The phase that actually produces code,
configuration, or artifact changes.

Entry: a current spec exists and a build plan is ready.
Exit: changes are staged for QA. No commits to a protected branch
during BUILD.

### QA

The QA-Agent (or the QA function) runs verifications against the
manifest's `verificationRequired`. Produces a structured QAVerdict
(see `schemas/v1/qa-verdict.schema.json`).

Entry: BUILD produces a candidate output.
Exit:

- `verdict: pass` → COMPLETE
- `verdict: pass_with_notes` → COMPLETE (with notes carried forward)
- `verdict: fail` → FIX

### FIX

Applies the corrections identified by QA. May write or update a
FailureRecord depending on the failure class.

Entry: QA returned `fail`.
Exit: BUILD with corrections applied, returning to QA.

### COMPLETE

Task is done. Locks released. Audit events emitted. Score recorded.

Entry: QA passed.
Exit: agent returns to IDLE.

---

## Legal Transitions

| From | To | When |
|---|---|---|
| IDLE | DEBUG | Bug-class manifest received |
| IDLE | DESIGN | Feature-class manifest with /spec route |
| IDLE | BUILD | Manifest with /plan route and current spec |
| DEBUG | DESIGN | Root cause confirmed; spec needs refinement |
| DEBUG | BUILD | Root cause confirmed; spec already covers fix |
| DESIGN | BUILD | ACs signed off |
| BUILD | QA | Output staged |
| QA | COMPLETE | verdict: pass / pass_with_notes |
| QA | FIX | verdict: fail |
| FIX | BUILD | Corrections applied; ready to retry |
| BOARDROOM | IDLE | Decision recorded; session closed |
| any | BOARDROOM | Escalation trigger fires |

### Illegal Transitions

| Attempted | Why Forbidden |
|---|---|
| IDLE → COMPLETE | Cannot complete what was never started |
| BUILD → COMPLETE (skipping QA) | QA is mandatory; verdict required for closure |
| QA → BUILD (skipping FIX) | A fail must produce a documented fix path |
| FIX → COMPLETE (skipping QA) | Re-QA is mandatory after fix |
| any → IDLE without a verdict or escalation | Closes the session in an undefined state |

Hooks at the file-touch layer enforce some of these (e.g., commits
during BUILD require an authorized approval). The full set of
enforcement points lives in `hook-system.md`.

---

## The QA Loop

The most consequential transition is QA → FIX → QA.

### Loop Condition

```
attempt = 1
while QA_verdict == 'fail' and attempt < 3:
    enter FIX
    apply corrections
    enter QA
    attempt += 1

if QA_verdict == 'fail' and attempt >= 3:
    escalate to BOARDROOM
```

Three attempts is the cap. Continuing past three is the spawn-storm
anti-pattern (see `meta-governance.md`).

### What Each Loop Iteration Costs

- **Attempt 1.** Cheap. Rework on a misunderstood AC.
- **Attempt 2.** Expensive. The corrections from attempt 1 did not
  address the root cause; rework on misunderstood corrections.
- **Attempt 3.** Very expensive. The pattern is now structural; cost
  of further attempts exceeds cost of escalation.

Escalation at three is therefore an economic rule as well as a safety
rule.

### What Goes With the Escalation

When the 3-strike threshold fires, the orchestrator sends to Boardroom:

- The original manifest
- The three QAVerdicts
- The diff produced at each FIX
- Any FailureRecord written during the loop
- The agent's current trust score and recent trajectory

Boardroom decides among:

- Re-route to a different agent
- Refine the spec; restart from DESIGN
- Reduce capability boundary or demote the agent
- Mark the task as `wont_fix` with rationale

---

## HITL as a Gate, Not a Phase

HITL approval can fire during any phase. Rather than represent it as
its own phase, the state machine treats HITL as a **gate** that pauses
the current phase until approval is recorded.

| Phase | Common HITL Triggers |
|---|---|
| DESIGN | Spec sign-off for HIGH-risk work |
| BUILD | Commit approval for HIGH-risk work; CRITICAL always |
| QA | Approval to override a `pass_with_notes` into a `pass` |
| FIX | Approval for `fixTag = systemic-refactor-required` |

HITL gate types and authority hierarchy are detailed in
`hitl-gates.md`.

---

## Parallel Sessions

Two sessions may run in parallel under one constraint:
**file scopes must be completely disjoint.**

The lane convention enforces visibility:

- Each parallel session is assigned a lane (`[LANE-A]`, `[LANE-B]`).
- The lane is declared in the session's first audit event.
- Bulletin entries (or `agent_events` rows) are lane-prefixed.
- Locks are checked across both lanes before any BUILD action.

If lane A holds a lock on a file in lane B's scope, lane B halts and
escalates to a human. There is no automatic resolution of cross-lane
conflicts.

At Postgres-backed scale, row-level locking removes the file-based
collision risk natively. The lane convention remains useful for
readability of audit history.

---

## Escalation Triggers

The state machine escalates to BOARDROOM (or its single-team
equivalent — an authorized human review) under any of:

| Trigger | Source |
|---|---|
| QA fail × 3 on the same task | QA loop |
| Risk reclassified to CRITICAL mid-session | DESIGN or BUILD |
| Hook violation that would block a phase transition | Any phase |
| Cross-lane lock conflict | Parallel sessions |
| `recurrenceCount` ≥ 3 surfaced in pre-task retrieval | Pre-spawn (before any phase) |
| FailureRecord with `fixTag = systemic-refactor-required` | FIX phase |
| Agent reaches PROBATION mid-session | Performance review boundary |

Escalation pauses the session. The agent does not continue past the
trigger point until a decision is recorded.

---

## State Machine and Audit

Every phase transition emits an audit event:

```
{
  "event": "phase_transition",
  "from": "BUILD",
  "to": "QA",
  "session_id": "...",
  "agent_id": "...",
  "correlation_id": "...",
  "timestamp": "...",
  "actor": "orchestrator"
}
```

Phases without transition events leave gaps in the audit trail. Hooks
at the phase boundaries catch this — see `audit-trail-patterns.md`.

---

## Common State Machine Mistakes

| Mistake | Effect |
|---|---|
| Skipping DESIGN because "the spec is in my head" | Failed QA on the first round |
| Running QA before BUILD finished staging | False FAIL; wasted loop iteration |
| Treating PASS_WITH_NOTES as PASS | Notes never addressed; D4 hit later |
| Continuing past 3 strikes | Spawn-storm; all subsequent loops compound |
| Allowing FIX to commit without re-QA | Defect ships; trust score takes D1 hit |

---

## Related

- `docs/control-plane/pre-spawn-protocol.md` — what happens before
  IDLE → DEBUG / DESIGN / BUILD.
- `docs/control-plane/hitl-gates.md` — gate types and authority.
- `docs/control-plane/hook-system.md` — OS-level enforcement of
  illegal transitions.
- `schemas/v1/qa-verdict.schema.json` — the QA verdict structure.
