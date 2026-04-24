# Incident Management

**The failure record flow, recurrence checks, Fix-Agent routing, and
escalation to Boardroom.**

A failure that is observed but not recorded is institutional memory
loss. A failure that is recorded but not analyzed for recurrence is
shelfware. This document specifies the operating discipline that turns
incidents into learning.

---

## What Counts as an Incident

An incident is any event that warrants a FailureRecord. The threshold
is intentionally low. It includes:

- A QA-Agent FAIL verdict on a non-trivial criterion
- A hard-stop trigger in any D1-D4 dimension
- A hook violation (block or near-block)
- A bug discovered in production that traces back to agent work
- A policy violation flagged by the runtime layer
- A prompt injection attempt that succeeded or nearly succeeded
- Falsified telemetry, regardless of whether it caused harm

If you are unsure whether an event is an incident — write the record.
The cost of an unnecessary FailureRecord is low. The cost of a missed
recurrence is high.

---

## The Incident Flow

```
EVENT
   │
   ▼
SURFACE (QA-Agent / hook / human / runtime)
   │
   ▼
ROUTE TO FIX-AGENT
   │
   ▼
RECURRENCE CHECK    ─── matches found ───►   ESCALATE
   │
   ▼
WRITE FAILURERECORD
   │
   ▼
PROPOSE PREVENTION
   │
   ▼
CLOSURE (with fixTag + prevention artifact)
```

Each step has owners and required outputs.

---

## Step 1 — Surface

A failure is surfaced by one of:

| Source | Typical Signal |
|---|---|
| QA-Agent | QAVerdict.verdict = `fail` or `pass_with_notes` |
| Hook | exit(2) block, logged to audit |
| Human | Direct observation during review |
| Runtime layer | Policy violation event |
| Automated test | Regression failure linked to agent commit |
| User report | Bug report tracing to agent-produced code |

The surface event must include enough context to identify the agent(s)
involved, the file(s) touched, and the symptom. If any of these are
missing, the first job is to recover them — not to write the record.

---

## Step 2 — Route to Fix-Agent

The Fix-Agent owns the FailureRecord lifecycle. Other agents and
humans may **observe** failures; only Fix-Agent **writes** them. This
is the truth-ownership rule for failure data.

At single-team scale, the operator may invoke the Fix-Agent role
manually. The discipline is the same: one agent writes failure records,
not many.

### Why Single-Writer

Multiple writers produce duplicate records, inconsistent classification,
and gaps in recurrence detection. Single-writer ensures every failure
goes through the same classification pipeline.

---

## Step 3 — Recurrence Check

This is the most important step in the flow.

### What the Check Does

Before writing a new FailureRecord, the Fix-Agent queries the failure
library for matches on:

- `failureClass` — same category
- `domain` — same functional area
- `files` — overlap with the new failure's file set
- `agentsInvolved` — same agent(s)

A match raises the new failure's `recurrenceCount`. The first
occurrence is recurrence 1; the second is 2; and so on.

### Recurrence Thresholds

| recurrenceCount | Effect |
|---|---|
| 1 | First occurrence — write record, propose prevention |
| ≥ 2 | Auto-escalation: agent's trust score takes D4 hit; instruction review required before next spawn |
| ≥ 3 | Benchmark addition required: a regression test or schema check that catches this exact pattern in the future |
| ≥ 5 | `systemic-refactor-required` becomes the only valid `fixTag`; fix-and-forget is no longer an option |

### Why These Thresholds

- One failure is normal.
- Two failures means the prevention from the first did not work.
- Three failures means the pattern is structural, not local.
- Five failures means the design is incompatible with reliable
  prevention; refactor is now required by policy.

The thresholds are not negotiable. An operator who feels the threshold
should be relaxed for "this special case" is observing exactly the
pattern the threshold exists to surface.

---

## Step 4 — Write the FailureRecord

The schema is at `schemas/v1/failure-record.schema.json`. Required
fields:

- `failureId` — format `FAIL-YYYY-MM-DD-NNN`
- `timestamp`
- `domain`
- `agentsInvolved`
- `files`
- `symptom` (observable, in plain language)
- `rootCause` (confirmed, not hypothesized)
- `failureClass` (one of 17)
- `severity` (P0–P3)
- `customerImpact`
- `detectionSource`
- `recurrenceCount`
- `status`
- `fixTag`

Fields commonly skipped that should not be:

- `rootCauseConfirmed` — true only if verified, not hypothesized
- `regressionTestAdded` — boolean; honest answer required
- `correlationId` — links the record to the session that produced it

### The 17 Failure Classes

The class enum is fixed in v1.0:

```
schema_violation, state_desync, reveal_leak, payment_bypass,
render_error, api_contract_break, date_time_handling, null_reference,
race_condition, prompt_regression, entitlement_bypass, data_loss,
security_vulnerability, performance_degradation, ux_regression,
truth_ownership, client_side_truth
```

There is no `other` class. If a failure does not fit, the taxonomy is
incomplete and must be extended deliberately (see
`docs/guides/failure-taxonomy-adoption.md`). Catch-all classes are an
anti-pattern.

---

## Step 5 — Propose Prevention

A FailureRecord is not closed by writing it. It is closed by **a
prevention artifact** linked to it.

### Prevention Artifact Types

| Type | Used For |
|---|---|
| `regression_test` | The most common — a test that fails before the fix and passes after |
| `schema_validation` | When the failure is a schema-class issue and a validation rule prevents it |
| `guardrail` | A runtime check (assertion, gate) that prevents the same shape |
| `instruction_update` | When the agent's brief did not cover the case |
| `policy_update` | When the runtime policy layer needs a new rule |
| `memory_update` | When the failure library needs a new entry referenced pre-task |
| `trust_adjustment` | When the agent's tier or boundary needs to change |
| `contract_update` | When the contract file governing the domain was insufficient |

### Closure Rule

A FailureRecord cannot be closed (`status: resolved`) without at least
one prevention artifact. This is enforced at write time by the schema
validation. It is not optional, it is not deferrable, it is not
overrideable.

If a prevention artifact cannot be produced (true edge cases exist),
the appropriate close is `wont_fix` with rationale. `wont_fix` does
not extinguish the record; it just stops the active workstream. The
record is still queried by future recurrence checks.

---

## Step 6 — The Three Fix Tags

Every closed FailureRecord receives one of three tags:

| fixTag | Meaning |
|---|---|
| `hotfix-only` | Symptom corrected; root cause not addressed; high recurrence risk |
| `hotfix-plus-prevention` | Symptom corrected and prevention artifact in place |
| `systemic-refactor-required` | Pattern is too deep for local prevention; refactor scheduled |

### Hotfix-Only Is a Last Resort

`hotfix-only` is permitted only when prevention is genuinely not
feasible (e.g., the affected code is being deleted in the next
release). It cannot be used to ship faster while skipping prevention.

`hotfix-only` records auto-flag for re-review on every subsequent
session in the affected domain. They are technical debt with a name
and a deadline.

---

## Pre-Task Failure Retrieval

The companion to incident management is **pre-task retrieval** — the
mechanism that uses the failure library to prevent recurrence in the
first place.

### When Retrieval Runs

In the pre-spawn protocol (see
`docs/control-plane/pre-spawn-protocol.md`), before the AgentTaskManifest
is finalized, the orchestrator queries the failure library for matches
on:

- The task's domain
- Files in `interfacesTouched`
- The agent likely to be assigned

Matches are written into the manifest's `priorFailureContext`. The
agent reads them at spawn.

### Retrieval as Reference Check

This is the equivalent of a reference check before assignment. An agent
that ignores a surfaced FailureRecord and then triggers the same
failure earns D4 = 0. The hard-stop is intentionally severe: ignoring
a known pattern is the agent equivalent of negligence.

---

## Escalation to Boardroom

Some incidents are too consequential for the Fix-Agent to close alone.

### Boardroom Triggers

| Trigger | Why |
|---|---|
| `recurrenceCount` ≥ 3 | Pattern is structural; benchmark required |
| Severity P0 with customer impact | Customer-facing failure needs senior review |
| Agent at PROBATION for three consecutive sessions | Recovery path failing; retirement may be required |
| Cross-team failure spanning multiple workspaces | Single-team Fix-Agent cannot close |
| Falsified-telemetry hard-stop (D2 = 0) | Trust foundation breach; requires Boardroom adjudication |
| `fixTag = systemic-refactor-required` | Refactor scope and ownership decision |

### What Boardroom Does

The Boardroom is itself an agent (`boardroom-agent`, currently v2.0)
that:

- Reviews the FailureRecord and the trailing five sessions of the
  involved agent(s)
- Reads relevant prior FailureRecords to assess pattern depth
- Recommends an outcome — instruction rewrite, boundary reduction,
  prevention investment, or retirement
- Escalates to a human for final approval

A Boardroom recommendation is advisory; the final decision is human.

---

## Prevention Rule Enforcement

The framework's enforcement of "every fix must have prevention" runs
at three layers:

1. **Schema layer.** `failure-record.schema.json` requires
   `preventionArtifacts` to have at least one item before `status` can
   be `resolved`. Validation runs at write.
2. **Hook layer.** `check-failure-lib` rejects writes that mark
   `resolved` without a populated `preventionArtifacts` array.
3. **Operating layer.** The Fix-Agent's instruction file requires
   producing the artifact before closing the record. Reviewed at
   scoring time.

Three layers because each catches a different failure mode: schema
catches schema violations, hook catches schema-conformant bypasses,
operating catches subtle skipping (artifact named but not actually
created).

---

## Recovery Without Recurrence

A FailureRecord with `recurrenceCount = 1`, prevention artifact in
place, and three subsequent clean sessions, has done its job. The
agent's trust trajectory recovers naturally; the record stays in the
library as institutional memory but no longer drives demotions.

This is the success case the framework is designed for. Most failures
should follow this trajectory. If most failures are reaching
recurrenceCount ≥ 2, prevention quality is the bottleneck, not
detection.

---

## Common Mistakes

| Mistake | Why It Hurts |
|---|---|
| Writing the record after the fix is shipped | Prevention quality not reviewed before deploy |
| Marking `rootCauseConfirmed: true` when only hypothesized | Prevention artifact addresses the wrong cause |
| Closing with `regressionTestAdded: false` and a trivial guardrail | Recurrence likely; trust hit later |
| Using `hotfix-only` to "move on" | Technical debt accumulates without a name |
| Skipping recurrence check because "this looks new" | Misses subtle pattern repetition |
| Single human writes records in narrative form, no schema | Recurrence detection cannot run; library is shelfware |

---

## Related

- `schemas/v1/failure-record.schema.json` — the schema in full.
- `docs/concepts/failure-memory.md` — the conceptual model.
- `docs/control-plane/pre-spawn-protocol.md` — where pre-task retrieval
  runs.
- `docs/operating-model/promotion-demotion-process.md` — how D4 hits
  drive demotion.
- `docs/guides/failure-taxonomy-adoption.md` — adapting the 17 classes
  for your domain.
