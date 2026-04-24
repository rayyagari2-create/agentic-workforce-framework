# Failure Memory

## What this concept defines

Failure memory is the framework's institutional incident system. Every agent
failure is recorded as a structured FailureRecord — not a narrative log entry
or a chat message — with a fixed taxonomy, a recurrence count, and a prevention
artifact. Agents read their own failure history before starting a related task.

Failure memory is what makes "the agent learned from that mistake" a measurable
claim instead of an aspiration. If a failure class recurs after being resolved,
the recurrence count proves the prior fix was insufficient. If a failure class
is novel, the structured record enables future agents to recognize and avoid it.

---

## The 17-class failure taxonomy

Every failure is classified into exactly one of seventeen categories. The
taxonomy is intentionally narrow: a small number of classes makes pattern
matching reliable. Each class has a precise definition.

| Class | What It Means |
|---|---|
| schema_violation | Output did not match the declared schema. Validation would have caught it; either validation was skipped, or the agent generated invalid structure. |
| state_desync | Two systems that should hold the same state held different values. Usually indicates missing write coordination or a stale read. |
| reveal_leak | Information that was supposed to be gated by an entitlement or access check was returned without that check. |
| payment_bypass | A monetary or billing operation occurred without the required gate or audit trail. |
| render_error | Frontend or output renderer crashed, threw, or produced unreadable output. |
| api_contract_break | An integration call failed because the agent assumed a contract that no longer holds. New endpoint, deprecated field, or schema change. |
| date_time_handling | Timezone, date arithmetic, locale, or daylight-saving error. The most reliable single source of subtle bugs. |
| null_reference | Code or output dereferenced a null or undefined value, usually from an optional field that was assumed non-null. |
| race_condition | Two operations interleaved in an order the code did not guard against. State, lock, or write ordering. |
| prompt_regression | A change to instructions or prompts caused output quality to drop on previously working cases. |
| entitlement_bypass | An access check was missed, skipped, or returned the wrong answer. Authorization-class failure. |
| data_loss | A write was lost, overwritten, or never persisted when it should have been. |
| security_vulnerability | A vector that could be exploited — secret in code, unvalidated input, missing sanitization, exposed key. |
| performance_degradation | Latency, throughput, or resource use moved outside the acceptable envelope. |
| ux_regression | A user-facing flow that previously worked correctly now produces a worse experience. |
| truth_ownership | A component wrote to a table or store that another component owns canonical truth for. Write-ownership rule violated. |
| client_side_truth | Authoritative state was held client-side and could be tampered with, instead of being held server-side and verified. |

The list is fixed in v1.0. Adding a new class requires a schema version
change. Subsetting or renaming the list for a different domain is encouraged —
see `docs/guides/failure-taxonomy-adoption.md`.

### Why exactly these seventeen

The taxonomy emerged from real failures observed in a production reference
implementation, not from a brainstorm. Each class is here because it recurred
across multiple sessions and multiple agents. A class that appeared once was
not added to the taxonomy. A class that appeared multiple times in a single
agent was added.

The list is short enough to memorize. It is long enough to capture the
real distribution of failures. If your domain produces failures that genuinely
do not match any of the seventeen, that is a signal to extend — not to
shoehorn the failure into a class that does not fit.

---

## What a FailureRecord contains

A FailureRecord is structured. Free-form prose is not enough — the framework
needs fields that can be queried, grouped, and counted.

| Field | Purpose |
|---|---|
| failureId | Stable identifier in the form FAIL-YYYY-MM-DD-NNN |
| failureClass | One of the seventeen classes above |
| domain | Domain classification for pre-task retrieval matching |
| agentsInvolved | Which agents created or detected the failure |
| files | File paths in scope when the failure occurred — used for retrieval matching |
| symptom | Observable symptom as seen by a user or QA |
| rootCause | Confirmed root cause after investigation |
| recurrenceCount | How many times this class has occurred to date |
| repeatOfFailureIds | Prior FailureRecord IDs of the same class |
| severity | P0 / P1 / P2 / P3 |
| customerImpact | Plain-English description of impact on the end user |
| detectionSource | qa_agent / fix_agent / human_reviewer / automated_test / runtime_monitoring / user_report |
| status | open / investigating / fix_in_progress / resolved / wont_fix |
| fixTag | hotfix-only / hotfix-plus-prevention / systemic-refactor-required |
| preventionArtifacts | Concrete artifacts produced — regression test, schema validation, instruction update, etc. |
| rootCauseConfirmed | Boolean — true only if the root cause has been verified, not hypothesized |
| regressionTestAdded | Boolean — was a regression test added with the fix? |

Full schema: `schemas/v1/failure-record.schema.json`.

The structured form is what makes failure memory queryable. "Show me every
state_desync failure in the last 30 days" returns a usable list. "Show me
similar failures the agent has seen on these files" is a real lookup, not a
text search.

---

## Recurrence detection

Recurrence is the heart of failure memory. A single failure is an incident.
A repeating failure is a pattern. Patterns escalate.

### Recurrence escalation rules

| Recurrence Count | Action |
|---|---|
| 1 (novel) | FailureRecord written. Prevention artifact required for closure. |
| ≥ 2 | Auto-promote: the failure class is flagged in the agent's instruction file. The agent is now expected to recognize and avoid it. |
| ≥ 3 | Add to benchmark: a regression test or evaluation check is added that exercises the failure pattern. The benchmark runs on every relevant change. |
| ≥ 5 | Systemic refactor required: the agent or the surrounding architecture has a structural problem. A point fix is no longer sufficient. The fixTag becomes systemic-refactor-required and must be carried forward until structural change is made. |

These thresholds are not arbitrary. Two occurrences may be coincidence. Three
is a pattern. Five is a structural defect. The rules force the framework to
escalate from "fix this one" to "fix the conditions that produce this" before
the failure becomes background noise.

### How recurrence is computed

When a new FailureRecord is created, the system queries the failure library
for prior records with the same failureClass. The recurrenceCount of the new
record equals the count of prior records of the same class plus one. The
repeatOfFailureIds field references the prior IDs.

If the new failure also touches the same files or the same domain as a prior
failure of the same class, the match is stronger and the auto-promotion happens
immediately. If only the class matches, the count still increments but
context-specific escalation may wait for evidence the same code path is
implicated.

---

## Pre-task failure retrieval

Before an agent spawns on a task, it reads its own failure history. The
retrieval is not optional and not advisory — it is part of the pre-spawn
protocol and enforced by a hook.

### What the agent retrieves

The retrieval queries the failure library for records matching:

- The agent's own ID (failures the agent created)
- The files in scope for the new task (failures that touched these files)
- The domain of the new task (failures in the same domain)

The returned records are presented to the agent as part of its task context
before any work begins. The agent must acknowledge the retrieval before
proceeding.

### Why this is enforced, not encouraged

If retrieval is optional, agents skip it under time pressure. The result is
that known failure patterns recur, and the failure library — which is
expensive to build — produces no operational value. Enforcement at the hook
layer means the agent literally cannot proceed without the retrieval.

The pre-task retrieval is the framework's reference-check-before-task primitive.
It treats the agent as an employee whose past matters. An agent that has caused
three state_desync failures on a particular file should be reminded of that
before being asked to modify that file again.

### What the agent does with retrieved failures

For each retrieved failure record, the agent:

1. Confirms it has read the symptom and root cause
2. Verifies the prevention artifact applies to the current task
3. Either acknowledges the prevention artifact is sufficient (the failure
   should not recur) or flags that additional precaution is needed for this
   task (escalating to the orchestrator if so)

If the agent proceeds and the same failure class recurs anyway, that is a D4 = 0.
The agent had the information and did not act on it.

---

## Failure record lifecycle

A FailureRecord progresses through a fixed set of statuses.

| Status | Meaning |
|---|---|
| open | Failure detected, not yet investigated |
| investigating | Root cause being identified |
| fix_in_progress | Fix is being implemented |
| resolved | Fix complete, prevention artifact in place, regression test added |
| wont_fix | Determined not to be worth fixing — must be explicitly justified |

Status transitions are append-only in the audit log. A record cannot skip from
open to resolved without passing through investigating and fix_in_progress.
The status machine prevents "resolved" from being declared without confirming
a root cause and producing a prevention artifact.

### Closure requirements

A FailureRecord cannot be closed (status = resolved) unless:

1. rootCauseConfirmed is true — the cause has been verified, not just guessed
2. At least one preventionArtifact is recorded — a regression test, a schema
   validation, an instruction update, a guardrail, or another concrete artifact
3. fixTag is set to one of the three completion classifications

The fixTag is intentionally three-valued. Most fixes should be
hotfix-plus-prevention: the immediate symptom is resolved AND a prevention
artifact prevents recurrence. hotfix-only is for emergency triage and should
flip to hotfix-plus-prevention before the record closes. systemic-refactor-required
is the high-cost case where a structural change is needed and not yet in place —
the record stays open until the structural change ships.

---

## Truth ownership for failure records

The framework specifies who writes to the failure library:

- A QA agent flags potential failures and produces failure data as part of its
  verdict.
- A fix agent (or its equivalent in your implementation) writes the
  FailureRecord. The fix agent owns the rootCause field because that is the
  outcome of investigation.
- No other agent writes to the failure library directly.

This write rule prevents the failure library from becoming a free-form log
where every agent contributes its own theory of what went wrong. There is
one canonical record per failure, owned by the agent responsible for
investigation.

---

## Failure memory vs logging

Failure memory is not a log. The distinction matters.

| Logging | Failure Memory |
|---|---|
| Records every event | Records only investigated failures |
| Free-form text | Structured fields, fixed taxonomy |
| Read by humans during incidents | Read by agents before tasks |
| Volume scales with traffic | Volume scales with novel failure classes |
| Retention is policy-driven | Retention is permanent (institutional memory) |

A logging system answers "what happened in the last hour?" A failure memory
answers "what mistakes have we made on this kind of task before?" Both are
useful. They are not the same artifact.

---

## What failure memory is not

- Not a bug tracker. Bug trackers track work items. Failure memory tracks
  failure patterns. The same fix may close ten bug tickets and produce one
  FailureRecord — or vice versa.
- Not a postmortem document. Postmortems are narratives written by humans
  for humans. FailureRecords are structured records written for agents.
- Not a chat log. Failure memory is queryable by class, domain, file, and
  agent. Chat logs are not.
- Not optional. Skipping failure recording for a "small" failure removes the
  ability to detect recurrence. The framework treats every failure as
  potentially recurring.

---

## Cross-references

- Schema: `schemas/v1/failure-record.schema.json`
- Trust scoring D4 input: [trust-scoring.md](trust-scoring.md)
- Pre-spawn protocol: `docs/control-plane/pre-spawn-protocol.md`
- Hook enforcement of retrieval: `hooks/pre-tool-use/check-failure-lib.example.js`
- Fix agent role: `docs/architecture/agent-roster.md`
- Adapting the taxonomy to your domain: `docs/guides/failure-taxonomy-adoption.md`
