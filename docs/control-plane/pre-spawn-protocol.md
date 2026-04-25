# Pre-Spawn Protocol

**The three-step decision tree before any agent spawns.**

Pre-spawn governance is the cheapest place to catch routing errors,
unclear specifications, and recurring failure patterns. A spawn that
skips pre-spawn is a hook violation the agent does not start.

The protocol formalizes a single sequence:

```
/debug → /spec → /plan → HITL (HIGH risk) → SPAWN
```

The build state machine that follows pre-spawn is specified in
`build-state-machine.md`. Pre-spawn is the gate at the front of that
machine.

---

## Why Pre-Spawn Exists

Without pre-spawn, the bias for action is "just spawn and see." That
bias produces:

- Misclassified tasks routed to the wrong agent
- Agents building against unclear specs, hitting gaps mid-build
- Recurring failure patterns repeated because nobody checked the
  failure library
- HIGH-risk work attempted without human review

Pre-spawn imposes a small upfront cost (seconds for LOW risk, hours
for CRITICAL risk) to avoid much larger downstream costs (failed QA
loops, rolled-back commits, escalation theater).

---

## The Three Steps

```
STEP 1 /debug
    Risk classification + pre-task failure retrieval
    ▼
STEP 2 /spec vs /plan routing
    Specification mode or build mode
    ▼
STEP 3 HITL gate triggers
    HIGH risk → human approval required
    ▼
SPAWN
```

If any step fails, the protocol does not advance. The task either
returns to the queue with a refinement note or escalates.

---

## Step 1 /debug: Risk Classification

The output of step 1 is a single attribute: `riskLevel`, one of
`LOW / MEDIUM / HIGH / CRITICAL`.

### Risk Classification Table

| Risk Level | Trigger | Default Gate |
|---|---|---|
| LOW | Single-file, no locked regions | No HITL required |
| MEDIUM | Multi-file, standard domains | Executing agent default: HITL required |
| HIGH | Payment flow, auth, entitlement, schema change | Always HITL no exceptions |
| CRITICAL | Cross-schema, runtime policy change, public-API change | Boardroom review before proceed |

### Required Inputs at Step 1

The orchestrator needs three things to classify:

1. **A list of files in scope** (`interfacesTouched`). Hand-waving here
   is the most common failure mode at step 1.
2. **The domain(s) the task touches.** Used to detect locked regions
   and to drive pre-task failure retrieval.
3. **The agent likely to be assigned.** Trust tier and capability
   boundaries gate routing.

### Pre-Task Failure Retrieval

Step 1 always runs the failure library check. The orchestrator queries
for FailureRecords matching:

- `domain` from the classification
- `files` overlapping with `interfacesTouched`
- `agentsInvolved` matching the assigned agent

Matches are written into the manifest's `priorFailureContext`. The
agent reads them at spawn this is the reference check before
assignment.

### Recurrence Implications

| Match Found | Effect |
|---|---|
| `recurrenceCount = 1` | Surface in manifest; agent reads pre-spawn |
| `recurrenceCount ≥ 2` | Manifest annotated; orchestrator notes elevated risk (systemic flag) |
| `recurrenceCount ≥ 3` | Boardroom session triggered; spawn does not proceed without it |
| `recurrenceCount ≥ 5` | Systemic refactor required unavoidable |

### Classification Authority

The orchestrator classifies. A human may override the classification
upward (more strict) without justification. Downward overrides require
written rationale and are logged to the audit trail.

### Step 1 Failure Modes

- **Underclassification.** A schema change classified as MEDIUM. This
  is the dominant failure mode. Hooks at the file-touch layer are the
  backstop.
- **Overclassification.** Less harmful a LOW classified as MEDIUM
  consumes review time but produces no incident.
- **Indeterminate.** The task is too vague to classify. The right
  answer is to return to the queue and refine, not to guess.

---

## Step 2 /spec vs /plan Routing

### What These Modes Are

Two pre-execution modes are available:

- **/spec** Produces or refines a specification: acceptance criteria,
  contracts, edge cases. Outputs are documents, not code.
- **/plan** Produces a build plan against an existing spec:
  step-by-step actions, files to touch, order of operations. Outputs
  are documents, not code.

Neither produces code. Both are checkpoints between "task" and "agent
running."

### The Routing Rule

```
IF acceptance criteria are clear, complete, and testable
   AND contracts governing the domain exist and are current
THEN route to /plan
ELSE route to /spec
```

The default is /spec when in doubt. Building from an unclear spec is
the most common cause of failed QA loops.

### What Counts as Clear ACs

Clear acceptance criteria:

- Are testable (a QA-Agent can produce a binary verdict per AC)
- Cover the success path and at least the named failure cases
- Specify required verification (unit test, integration test, schema
  validation)
- Reference contracts where applicable

ACs that depend on the agent's "judgment" are not clear ACs.

### Step 2 Failure Modes

- **/plan when /spec was needed.** Agent builds against an incomplete
  spec, hits a gap mid-build, has to escalate. The cost is already
  paid.
- **/spec when /plan was sufficient.** Cheap; produces an extra review
  cycle but no incident.
- **Skipping both.** The "just go" path. Highest variance in
  outcomes; lowest QA pass rate on first attempt.

---

## Step 3 HITL Gate Triggers

The risk level from step 1 plus the routing decision from step 2 drive
the gate at step 3.

### Gate Trigger Matrix

| Gate Type | Triggered When |
|---|---|
| HITL | `riskLevel = HIGH`; or agent at RESTRICTED tier; or task touches a locked region |
| DELEGATION | An authorized human is unavailable but a delegate exists with valid TTL |
| ESCALATION | A prior gate has timed out, or the 3-strike threshold has been hit |
| APPROVAL | `riskLevel = CRITICAL`; or task affects public-API surface |
| BOARDROOM SESSION | `riskLevel = CRITICAL` combined with cross-team scope; or `recurrenceCount ≥ 3` |

Gate types are detailed in `hitl-gates.md`.

### Dependency Install Rule

Adding, removing, or upgrading runtime or build dependencies is treated
as MEDIUM risk by default and elevates to HIGH if the dependency is
used in a HIGH-risk domain (auth, payment, schema, audit, public-API
surface). HITL is required at HIGH; the manifest must list the package
name, version, and reason. Transitive dependency upgrades through a
lockfile-only operation follow the same rule.

This rule exists because dependency changes are the most common silent
risk amplifier a routine "bump versions" operation can move a
project's effective trust posture without any visible behavior change.

### When a Boardroom Session is Required

The Boardroom is the highest-cost gate. It is reserved for:

1. CRITICAL risk on a task that crosses workspaces or schemas
2. `recurrenceCount ≥ 3` surfaced in pre-task retrieval
3. An agent at PROBATION attempting a HIGH-risk task
4. A task that would commit changes to control plane artifacts (hooks,
   policy files, audit log structure)
5. An explicit escalation from a Team Orchestrator to Division
   Orchestrator (enterprise scale only)

Boardroom sessions are decision points, not status meetings. A
Boardroom session that does not produce a recorded decision was not a
Boardroom session.

---

## The Pre-Spawn Output

Pre-spawn produces three artifacts, in order:

1. **A classified task** `riskLevel`, `domains`, and
   `interfacesTouched` populated.
2. **A routing decision** /spec or /plan.
3. **An AgentTaskManifest** all gate triggers resolved,
   `priorFailureContext` populated, HITL approvals recorded if any
   were obtained, `evalPlan` present for MEDIUM and HIGH.

If any of these is missing, the spawn does not happen. The hook layer
(`check-agent-spawn`) checks for the manifest; the absence of one
produces `exit(2)`.

---

## Pre-Spawn at Different Risk Levels

The full protocol runs every time. Work distributes differently by
risk.

### LOW Risk Pre-Spawn

- Step 1: confirmed LOW; failure library still queried
- Step 2: usually /plan (ACs typically clear for low-risk work)
- Step 3: no HITL, no Boardroom; recurrence check still runs
- Time cost: 1–3 minutes

### MEDIUM Risk Pre-Spawn

- Step 1: classification with file-list scrutiny
- Step 2: /spec for new behaviors; /plan for bug fixes against existing
  specs
- Step 3: HITL fires by default for executing agents at STANDARD tier
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
| HITL approval as a checkpoint, not a decision | Approval theater; signature without scrutiny |
| "Just approve so we can move" | Pre-spawn becoming ceremony, not control |
| Dependency change merged without manifest review | Silent risk amplification |

---

## Related

- `docs/control-plane/build-state-machine.md` the lifecycle pre-spawn
  feeds into.
- `docs/control-plane/hitl-gates.md` the gate types step 3 may fire.
- `docs/control-plane/hook-system.md` the OS-level backstop that
  catches missing manifests.
- `schemas/v1/agent-task-manifest.schema.json` the artifact pre-spawn
  produces.
