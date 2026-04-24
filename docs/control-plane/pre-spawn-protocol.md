# Pre-Spawn Protocol

**The three-step decision tree before any agent spawns.**

Pre-spawn is the cheapest place to catch errors. Decisions made here
prevent expensive errors downstream — a misclassified task, a missing
contract, a recurring failure that nobody flagged. This document
specifies the protocol.

---

## Why Pre-Spawn Exists

The bias for action in agent systems is to "just spawn and see."
Pre-spawn imposes a small upfront cost (seconds to minutes) to avoid
much larger downstream costs (failed QA loops, rolled-back commits,
escalation theater).

The protocol is not optional. A spawn without a completed pre-spawn
sequence is a hook violation; the agent does not start.

---

## The Three Steps

```
STEP 1 — RISK CLASSIFICATION
    ▼
STEP 2 — /spec vs /plan ROUTING
    ▼
STEP 3 — GATE TRIGGERS
    ▼
SPAWN
```

If any step fails, the protocol does not advance. The task either
returns to the queue with a refinement note or escalates.

---

## Step 1 — Risk Classification

### What to Classify

The output of step 1 is a single attribute: `riskLevel`, one of
LOW / MEDIUM / HIGH / CRITICAL.

### Classification Criteria

| Risk | Criteria |
|---|---|
| LOW | Single file; no locked region; no policy domain (auth, payment, schema, audit) |
| MEDIUM | Multi-file; standard domains; reversible without data migration |
| HIGH | Touches payment, auth, entitlement, schema, or any locked region |
| CRITICAL | Cross-schema; runtime policy change; public-API change; audit log structure change |

### Required Inputs at Step 1

The classifier needs:

1. **A list of files in scope** (`interfacesTouched`). Hand-waving here
   is the most common failure mode.
2. **The domain(s) the task touches.** Used to detect locked regions
   and trigger pre-task failure retrieval.
3. **The agent likely to be assigned.** Trust and capability gates
   apply at routing.

### Classification Authority

The orchestrator classifies. A human may override the classification
upward (more strict) without justification. Downward overrides require
written rationale and are logged.

### Step 1 Failure Modes

- **Underclassification.** A schema change classified as MEDIUM. This
  is the dominant failure mode and is what hooks at the file-touch
  layer are designed to catch.
- **Overclassification.** Less harmful — a LOW classified as MEDIUM
  consumes review time but produces no incident.
- **Indeterminate.** The orchestrator cannot decide because the task
  is too vague. The right answer is to return to the queue and refine,
  not to guess.

---

## Step 2 — /spec vs /plan Routing

### What These Modes Are

Two pre-execution modes are available:

- **/spec** — Produces or refines a specification: acceptance criteria,
  contracts, edge cases. Outputs are documents, not code.
- **/plan** — Produces a build plan against an existing spec:
  step-by-step actions, files to touch, order of operations. Outputs
  are documents, not code.

Neither produces code. Both are checkpoints between "task" and "agent
running."

### Routing Rule

```
IF acceptance criteria are clear, complete, and testable
   AND contracts governing the domain exist and are current
THEN route to /plan
ELSE route to /spec
```

The default is /spec when in doubt. Building from an unclear spec is
the most common cause of failed QA loops.

### What Counts as "Clear ACs"

Clear acceptance criteria:

- Are testable (a QA-Agent can produce a binary verdict per AC)
- Cover the success path and at least the named failure cases
- Specify required verification (unit test? integration test? schema
  validation?)
- Reference contracts where applicable

ACs that depend on the agent's "judgment" are not clear ACs.

### Step 2 Failure Modes

- **/plan when /spec was needed.** Agent builds against an incomplete
  spec, hits a gap mid-build, has to escalate. The cost has already
  been paid.
- **/spec when /plan was sufficient.** Cheap; produces an extra review
  cycle but no incident.
- **Skipping both.** The "just go" path. Highest variance in
  outcomes; lowest QA pass rate on first attempt.

---

## Step 3 — Gate Triggers

### What Gates Fire

| Gate Type | Triggered When |
|---|---|
| HITL | riskLevel = HIGH; or agent is at RESTRICTED tier; or task touches a locked region |
| DELEGATION | An authorized human is unavailable but a delegate exists with TTL |
| ESCALATION | A prior gate has timed out, or the 3-strike threshold has been hit |
| APPROVAL | riskLevel = CRITICAL; or task affects public-API surface |
| BOARDROOM SESSION | riskLevel = CRITICAL combined with cross-team scope; or recurrenceCount ≥ 3 in pre-task retrieval |

Gate types are detailed in `hitl-gates.md`.

### Pre-Task Failure Retrieval Runs Here

Step 3 includes the recurrence check. The orchestrator queries the
failure library for FailureRecords matching:

- `domain` from step 1
- `files` overlapping with `interfacesTouched`
- `agentsInvolved` matching the assigned agent

Matches are written into the manifest's `priorFailureContext`. The
agent reads them at spawn — this is the reference check before
assignment.

### Recurrence Implications at Step 3

| Match Found | Effect |
|---|---|
| recurrenceCount = 1 | Surface in manifest; agent reads pre-spawn |
| recurrenceCount ≥ 2 | Manifest annotated; orchestrator notes the elevated risk |
| recurrenceCount ≥ 3 | Boardroom session triggered; spawn does not proceed without it |

The threshold logic is symmetric with the recurrence thresholds in
`docs/operating-model/incident-management.md`. A pattern that hit the
benchmark threshold cannot be re-attempted by the same agent without
explicit escalation.

---

## When to Require a Boardroom Session

The Boardroom is the highest-cost gate. It is reserved for:

1. **CRITICAL risk on a task that crosses workspaces or schemas.**
2. **Recurrence count ≥ 3 surfaced in pre-task retrieval.**
3. **An agent at PROBATION attempting to take a HIGH-risk task.**
4. **A task that would commit changes to control plane artifacts** (hooks,
   policy files, audit log structure).
5. **An explicit escalation from a Team Orchestrator to Division
   Orchestrator** (enterprise scale only).

Boardroom sessions are not status meetings. They are decision points.
A Boardroom session that does not produce a recorded decision was not
a Boardroom session.

---

## The Pre-Spawn Output

Pre-spawn produces three artifacts, in order:

1. **A classified task** (`riskLevel` set, `domains` set,
   `interfacesTouched` populated).
2. **A routing decision** (/spec or /plan).
3. **An AgentTaskManifest** with all gate triggers resolved
   (`priorFailureContext` populated, HITL approvals recorded if any
   were obtained, evalPlan present for MEDIUM and HIGH).

If any of these is missing, the spawn does not happen. The hook layer
(`check-agent-spawn`) checks for the manifest; the absence of one
produces exit(2).

---

## Pre-Spawn at Different Risk Levels

The full protocol runs every time. The work distributes differently by
risk.

### LOW Risk Pre-Spawn

- Step 1: confirmed LOW
- Step 2: usually /plan (ACs typically clear for low-risk work)
- Step 3: no HITL, no Boardroom; recurrence check still runs
- Time cost: 1–3 minutes

### MEDIUM Risk Pre-Spawn

- Step 1: classification with file-list scrutiny
- Step 2: /spec for new behaviors, /plan for bug fixes against existing
  specs
- Step 3: HITL fires for agents at STANDARD with low confidence band;
  recurrence check
- Time cost: 5–15 minutes

### HIGH Risk Pre-Spawn

- Step 1: classification reviewed by an authorized human
- Step 2: /spec almost always; /plan only when spec is well-established
- Step 3: HITL mandatory; recurrence check; eval plan documented
- Time cost: 15–60 minutes

### CRITICAL Risk Pre-Spawn

- Step 1: classification reviewed; rationale recorded
- Step 2: /spec mandatory; written sign-off on the spec before /plan
- Step 3: Boardroom session; full audit trail; multiple authority
  approvals
- Time cost: hours to days

The cost gradient is intentional. CRITICAL risk should feel slow.

---

## Common Pre-Spawn Mistakes

| Mistake | Effect |
|---|---|
| Skipping step 1 because the task "feels" low risk | Underclassification; HITL gate doesn't fire |
| /plan when ACs are vague | Failed QA loops; rework |
| Treating recurrence retrieval as advisory | D4 hits when the pattern repeats |
| Using HITL approval as a checkpoint, not a decision | Approval theater; signature without scrutiny |
| Asking the human to "just approve so we can move" | Pre-spawn becoming ceremony, not control |

---

## Related

- `docs/operating-model/task-assignment.md` — where pre-spawn fits in
  the assignment pipeline.
- `docs/control-plane/build-state-machine.md` — the lifecycle pre-spawn
  feeds into.
- `docs/control-plane/hitl-gates.md` — the gate types step 3 may fire.
- `docs/control-plane/hook-system.md` — the OS-level backstop that
  catches missing manifests.
- `schemas/v1/agent-task-manifest.schema.json` — the artifact pre-spawn
  produces.
