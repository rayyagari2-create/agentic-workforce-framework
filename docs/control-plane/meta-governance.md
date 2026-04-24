# Meta-Governance

**The eight failure modes of governance itself.**

A governance system can fail in two ways: failing to catch a problem,
and being so heavy that the team works around it. This document
enumerates the eight failure modes specific to governance, the
anti-patterns that produce each, and the hierarchy of responses.

This is the answer to the most important question about any governance
framework: **what happens when your governance system breaks?**

---

## Why Meta-Governance Exists

Governance frameworks tend to assume their own correctness. They
specify how agents must behave; they rarely specify what to do when
the governance layer itself becomes the problem.

The 8 failure modes below are the patterns observed across agent
systems, including the reference implementation behind this framework.
Each has a detection signal and a response. Together they form a
discipline of watching the watchers.

---

## The Eight Failure Modes

| # | Mode | One-line summary |
|---|---|---|
| 1 | Governance Theater | Approvals without scrutiny; ceremony without effect |
| 2 | Score Inflation | All scores drift upward; band loses meaning |
| 3 | Hook Bypass via Override | Override used routinely instead of exceptionally |
| 4 | Silent Audit Suppression | Events not logged because logging "broke" |
| 5 | Role Drift | Agents acting outside their instruction file |
| 6 | Agent Spawn-Storm | Cascading subagent creation without checks |
| 7 | Manifest Skipping | Tasks dispatched without manifests |
| 8 | Recurrence Overlooked | Same failure repeats; library not consulted |

Each is detailed below.

---

## 1. Governance Theater

**Symptom:** HITL approvals are happening but reviewers are not
actually reviewing. Rationales are boilerplate. Approval timestamps
correlate with end-of-day rather than with the action.

**Anti-pattern:** "I trust this agent, just approve."

**Detection:**

- Reviewer approves > 95% of HITL gates with the same one-line
  rationale.
- Approval-to-incident correlation is zero.
- Reviewers do not catch issues that are visibly in the diff.

**Response:**

- Sample 10% of approvals weekly; do a real review afterward.
- If the sample reveals issues that the original review missed, the
  gate is theater.
- Either remove the gate (it isn't catching anything) or escalate
  reviewer authority to someone with capacity.
- A theater gate is worse than no gate — it produces false confidence.

---

## 2. Score Inflation

**Symptom:** D1-D4 averages drift upward across the team over time.
Confidence band moves into HIGH faster than evidence warrants.

**Anti-pattern:** "Everyone is doing well; 25 across the board."

**Detection:**

- Mean score across the team trends upward for 10+ sessions
- D4 = 25 in nearly every session despite recurrences in the failure
  library
- Calibration spot-check vs anchor table reveals systematic
  over-scoring

**Response:**

- Recalibrate against `calibration/d1-d4-rubric.md` anchor examples.
- Walk through three recent sessions; rescore using the rubric.
- If the rescored values differ by ≥ 5 points on average, calibration
  drift is confirmed.
- Update scoring discipline; notify the scorer; spot-check follow-up
  sessions.

---

## 3. Hook Bypass via Override

**Symptom:** The operator override marker is being placed routinely.
Override events appear in the audit log every session, not occasionally.

**Anti-pattern:** "The hook keeps blocking; I'll just override."

**Detection:**

- Override events ≥ 1 per session, sustained
- Same hook overridden repeatedly — indicates a hook bug or a workflow
  gap
- Override applied broadly rather than narrowly

**Response:**

- Investigate the hook that is being overridden. If it is producing
  false-positives, fix the hook.
- If the hook is correct and the workflow is the problem, fix the
  workflow.
- If neither is the case, the override is the problem. Tighten override
  scope (TTL, target hooks, narrower conditions).
- Track override frequency as a quarterly metric. Trending up is the
  signal to act.

---

## 4. Silent Audit Suppression

**Symptom:** Audit log gaps. Events that should be present are not.
The team explains "the logger had an issue."

**Anti-pattern:** "We'll just retry without the audit; it won't matter
this time."

**Detection:**

- `audit-write` PostToolUse hook reports failures
- Correlation IDs in the trust ledger have no matching audit events
- Phase transitions visible in the bulletin have no audit row

**Response:**

- The audit log is the source of truth for "what happened." Gaps are
  not tolerable.
- Treat any silent audit suppression as a P1 incident — write a
  FailureRecord with `failureClass: data_loss`.
- Restore audit completeness before any further work proceeds.
- If the underlying cause is the audit infrastructure (storage,
  network), this is a degraded-mode condition. See
  `hook-system.md`.

---

## 5. Role Drift

**Symptom:** An agent is acting outside its instruction file. A
QA-Agent is writing code; an executor is making routing decisions; an
orchestrator is editing hooks.

**Anti-pattern:** "It was the closest agent, so I asked it to do this
adjacent thing."

**Detection:**

- Files modified by an agent fall outside its declared capability
  boundary
- An agent's bulletin entries describe activities not in its
  instruction file
- Trust score average for the agent diverges from the score for its
  declared role

**Response:**

- Stop the agent. Read the instruction file.
- If the activity is genuinely required, change the instruction file
  through the normal Evolution process (human-approved, separate
  session).
- If the activity was role drift, write a FailureRecord with
  `failureClass: truth_ownership`. The drift is a specific failure
  class, not a "general issue."
- Capability boundary breach is a Boardroom-level event if it
  recurs.

---

## 6. Agent Spawn-Storm

**Symptom:** Cascading subagent creation. One agent spawns another to
handle a sub-task; that agent spawns another; total session depth
exceeds 2 levels.

**Anti-pattern:** "Let me have this agent spawn a helper to do that
part."

**Detection:**

- `check-agent-spawn` hook firing on subagents (subagents may not
  spawn)
- Audit log shows spawn events nested 3+ levels deep
- Session correlation IDs branching uncontrollably

**Response:**

- Subagents cannot spawn subagents. This is enforced at the hook
  layer (`check-subagent-start`).
- A spawn-storm is a sign that work was decomposed wrong. Re-plan at
  the orchestrator level rather than letting subagents subdivide.
- If the workload genuinely needs deeper decomposition, restructure
  with multiple sequential spawns from the orchestrator, not with
  nested spawns.

---

## 7. Manifest Skipping

**Symptom:** Tasks dispatched without an `AgentTaskManifest`. The
agent is told what to do in a chat message; no manifest exists.

**Anti-pattern:** "It's a quick task; manifest is overhead."

**Detection:**

- `check-agent-spawn` hook reports missing manifest
- Audit log has session events with no associated `taskId`
- QA-Agent has no acceptance criteria to verify against

**Response:**

- No manifest, no dispatch. This is a hard rule.
- "Quick task" is the most common rationalization for skipping. The
  manifest for a quick task is short. It is still required.
- Backfilling a manifest after the fact is permitted but logged as a
  process violation. Do this only when the spawn already happened
  and stopping mid-action would lose more than the violation costs.

---

## 8. Recurrence Overlooked

**Symptom:** A failure recurs and nobody notices. The failure library
contains a record for the same pattern; pre-task retrieval did not
surface it.

**Anti-pattern:** "Pre-task retrieval is too slow; we'll skip it for
now."

**Detection:**

- New FailureRecord matches an existing one on (`failureClass`,
  `domain`, files) but `recurrenceCount` is 1
- The matching record exists but was not in `priorFailureContext`
- D4 = 25 was scored despite a known pattern repeating

**Response:**

- Audit pre-task retrieval logs. Was retrieval performed? Did it
  return results?
- If retrieval was skipped: hook violation, FailureRecord, retraining.
- If retrieval ran but missed the match: classifier or query is
  broken; tighten matching rules.
- Recurrences that were overlooked must be reclassified retroactively
  with the correct `recurrenceCount`.

---

## Anti-Patterns Cross-Reference

Anti-patterns recur across the failure modes. Watch for these phrases:

| Phrase | Suggests |
|---|---|
| "Just approve" | Mode 1 — Governance Theater |
| "Everyone scored 25" | Mode 2 — Score Inflation |
| "I'll just override" | Mode 3 — Hook Bypass |
| "The logger had an issue" | Mode 4 — Audit Suppression |
| "It's the closest agent" | Mode 5 — Role Drift |
| "Spawn a helper" | Mode 6 — Spawn-Storm |
| "Manifest is overhead" | Mode 7 — Manifest Skipping |
| "Retrieval is too slow" | Mode 8 — Recurrence Overlooked |

These are observed phrases, not strawmen. Each is the natural argument
that produces the corresponding failure mode.

---

## Enforcement Hierarchy

When a meta-governance failure is detected, the response follows a
hierarchy:

```
LAYER 1 — TIGHTEN THE OPERATING DISCIPLINE
   (recalibration, instruction update, training)
       ↓ if persists
LAYER 2 — TIGHTEN THE SCHEMA OR HOOK
   (add a check that catches the specific failure)
       ↓ if persists
LAYER 3 — REDUCE SCOPE OR DEMOTE
   (smaller capability boundary, lower trust tier)
       ↓ if persists
LAYER 4 — BOARDROOM REVIEW
   (instruction rewrite, retirement, structural change)
```

Each layer is more disruptive than the prior. Apply the cheapest layer
first; escalate only when the cheaper layer fails.

The hierarchy is not "always apply layer 4." That is its own anti-pattern
(over-correction creates governance theater of a different kind).

---

## Governance Escape Hatches

Sometimes the operating model needs to be broken intentionally. A
genuine emergency, a one-off corner case, a system that has not yet
incorporated a new pattern. The framework permits this — but
disciplines it.

### When to Break the Rule

- Genuine production incident requiring action faster than gate
  resolution
- The framework has not yet handled this case (a known gap)
- Operator judgment that the rule produces worse outcomes here

### How to Break the Rule

| Requirement | Detail |
|---|---|
| Rationale documented | Free-text, recorded in the audit log |
| Audit log entry | Every escape-hatch use is logged with operator identity |
| Time-bounded | The exception applies to this action, not to future actions |
| Follow-up FailureRecord | Within 24 hours, write a record describing the gap |
| Schema or hook update proposed | If this is a recurring case, the framework needs to absorb it |

### What to Avoid

- Repeated use of the escape hatch in the same shape — that is a
  governance gap, not an exception
- Escape hatch with no follow-up FailureRecord
- Escape hatch invoked by an agent — only humans may break governance
  rules; agents cannot

The escape hatch exists because rigid rules are themselves a failure
mode. It is disciplined because undisciplined exceptions become the
rule.

---

## Watching the Watchers

The team should review meta-governance signals quarterly:

- Override frequency trend
- Theater rate (gates that approved without catching anything)
- Score inflation rate (mean drift over rolling window)
- Audit log completeness
- Manifest coverage
- Recurrence detection rate

Each becomes a leading indicator. A trend going wrong on one of these
is a much earlier signal than waiting for an incident to occur.

---

## Related

- `docs/operating-model/incident-management.md` — the incident flow
  for failures (including governance failures).
- `docs/control-plane/hook-system.md` — fail-closed defaults and
  override pattern.
- `calibration/anti-patterns.md` — scoring-specific anti-patterns
  (overlap with mode 2).
- `docs/control-plane/audit-trail-patterns.md` — the log that detects
  several of these modes.
