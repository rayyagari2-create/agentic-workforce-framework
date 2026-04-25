# Meta-Governance

**The eight failure modes of governance itself, the recovery
protocols, and the escape hatches.**

The most important question for any enterprise governance system is
*what happens when the governance system breaks?* This document is the
answer.

If governance can fail silently, it is not governance it is theatre.
If it can fail loudly but not be recovered from, it becomes a liability.
The framework treats meta-governance as a first-class concern, and
this document specifies the failure modes, the detection signal for
each, the response, and the bounded escape hatches.

---

## The Eight Failure Mode Classes

Each row is a class of failure that the governance system itself can
exhibit. Rows are not anti-patterns of the agents they are
anti-patterns of the governance layer.

| # | Failure Mode | Detection | Response |
|---|---|---|---|
| 1 | Authority unavailable to score | Sessions accumulate without trust score update | Chief-of-Staff Agent flags in next session; scores batch-assigned on return |
| 2 | D1-D4 score inconsistency over time | Confidence band LOW + recency weight drift | Trust-scoring routine flags anomalies; calibration review triggered |
| 3 | Failure record root cause wrong | Same failure class recurs after "resolved" | `recurrenceCount` increments → auto-escalation catches it |
| 4 | Pre-spawn protocol produces wrong recommendation | QA fails post-spawn | Fix-Agent writes FailureRecord; `/debug` re-run mandatory before next spawn |
| 5 | Trust score drives wrong autonomy gate | Agent at HIGH causes regression | D4 = 0 that session; trust tier drops; instruction review mandatory |
| 6 | Runtime policy too restrictive | Legitimate agent action blocked | Shadow mode diagnostic; policy refined in `agent_policies` table |
| 7 | Parallel session bulletin collision | Interleaved bulletin entries | Lane-prefix convention; database-backed bulletin permanent fix |
| 8 | Hook false-positive blocks legitimate work | Agent stopped on a non-locked file | Override marker (TTL 10 min); override logged to audit |

These eight are not exhaustive. They are the eight that have been
observed in practice often enough to warrant explicit recovery
protocols. New failure modes are added to this table when they are
observed, with the detection signal and response defined before the
next session in which they could recur.

---

## Anti-Patterns of the Governance Layer

These are the failure modes restated as the patterns to avoid.

| Anti-Pattern | Why It Is Dangerous |
|---|---|
| Approval theater | Approver signs without scrutiny the audit trail records "reviewed" but the human did not actually decide |
| Score inflation | All sessions get high D1-D4 because the human does not want to seem critical the autonomy gate signal degrades |
| Failure library overgeneralization | Vague failure entries match too broadly; pre-task retrieval becomes noise |
| Hook bypass via "just this once" | The override pattern was used for routine work; it stops being an exception |
| Pre-spawn becoming ceremony | The protocol is run but the outputs are not used to refine the manifest |
| Trust score and capability boundary out of sync | Agent at HIGH tier with a capability boundary that no longer matches its role |
| Ungoverned governance changes | Hook updates, policy edits, and audit format changes applied without HITL the enforcement layer drifts |
| "We'll add the audit log entry later" | A control plane action without immediate audit is unrecoverable; the trail can never be reconstructed |
| Treating shadow mode as the destination | Runtime policy stays in shadow forever because enforcement is "scary"; the system runs without enforcement indefinitely |

The single most common anti-pattern across all categories is **using
the existence of a control instead of the result of a control**. A
hook that always fires `exit(0)` is not a hook. A HITL gate that is
always approved is not a gate. A trust score that does not vary is
not a score.

---

## Enforcement Hierarchy

When a governance failure is detected, the response escalates through
a fixed hierarchy. Each level has explicit authority and explicit cost.

```
LEVEL 1 Automated correction
   Trust tier drop, hook block, recurrence flag
   No human intervention; logged to audit

LEVEL 2 Operator review at next session
   Chief-of-Staff Agent surfaces the issue
   Operator decides on instruction refinement, capability boundary
   change, or no action

LEVEL 3 Boardroom session
   Triggered by 3+ session probation, recurrence ≥ 3, control plane
   change, or cross-team CRITICAL
   Decision is recorded; outcome is one of: instruction rewrite,
   capability boundary reduction, agent retirement, or escalation

LEVEL 4 Compliance / risk escalation
   Triggered when a governance failure has produced an externally
   visible incident (regulatory, customer, contract)
   Outside the scope of the framework; the framework provides the
   audit trail evidence for the external process
```

Levels 1–3 live inside the framework. Level 4 is the boundary at which
the framework hands evidence to whatever external process exists at the
host organization.

---

## Recovery Protocols

### Trust Tier Degradation

```
1. Detect:    D4 = 0, or recurrenceCount ≥ 2
2. Immediate: Trust tier drops one level automatically
3. Review:    Orchestrator reads failure library before next spawn
4. Persist:   If PROBATION persists 3 sessions → Boardroom review
5. Boardroom: Either instruction rewrite, capability boundary
              reduction, or retirement
```

Trust tier degradation is **automatic at step 2**. The human
intervention is at step 3 (read the failure library) and step 5
(Boardroom decision). Steps 1, 2, and 4 happen without human action.

### Governance Data Loss

The recovery path depends on the storage medium.

```
File-based (current):
   Git history is the recovery path. All governance files committed.

Postgres-backed (Wave 2):
   Point-in-time recovery. Audit log is cryptographically chained —
   cannot be silently corrupted.
```

Either way, the governance store is recoverable. The framework requires
that the governance store live somewhere with point-in-time recovery
or version history; in-memory or unversioned storage is not permitted.

### Hook False-Positive

```
1. Detect:    Agent reports it cannot proceed on a file that should
              be in scope
2. Triage:    Operator examines the hook output
3. Override:  If the action is correct, operator creates the override
              marker (10-minute TTL)
4. Log:       Override is recorded in the override log automatically
5. Refine:    Hook is updated to handle the case; refinement happens
              in a separate session, not under override pressure
```

The 10-minute TTL on the override marker is intentional. It is enough
time to perform the immediate action. It is not enough time to forget
the marker exists. Step 5 is mandatory an override that is not
followed by a hook refinement is a governance failure on its own.

### Pre-Spawn Wrong Recommendation

```
1. Detect:    QA FAIL on a task that pre-spawn classified as LOW or
              MEDIUM with high confidence
2. Capture:   Fix-Agent writes a FailureRecord including the pre-spawn
              classification and the actual outcome
3. Re-run:    /debug must re-run end-to-end before the next spawn for
              the same task; no "try one more time" without it
4. Update:    The classifier inputs (file list, domain detection)
              are reviewed; if a heuristic was wrong, it is updated
5. Score:     The orchestrator's D1 takes a hit for the misclassification
```

This is the protocol for the most common single failure mode the
"the orchestrator was confident and wrong" case.

### Runtime Policy Too Restrictive

```
1. Detect:    Legitimate agent action blocked by upstream policy SDK
2. Diagnose:  Adapter logs the block with full payload; operator
              reviews
3. Decision:  Either (a) the action is genuinely blocked-correct and
              the agent's plan was wrong, or (b) the policy is wrong
4. Refine:    If (b), the policy is updated in agent_policies; the
              update itself is a control plane change → HITL required
```

The refinement step requires HITL because policy changes are control
plane changes. A policy change applied without HITL is itself a
governance failure (failure mode #6's anti-pattern).

---

## Governance Escape Hatches

There are exactly three escape hatches built into the framework. They
exist because the alternative (no escape) makes the framework
brittle. They are bounded in scope and observable in use.

### Escape Hatch 1 Hook Override Marker

**What:** A 10-minute TTL marker that grants override on any hook
block.

**Bounded by:** TTL (10 minutes); single marker per active session;
mandatory audit log entry on use.

**When to use:** Diagnosing a false positive; recovering from a
blocking state where the action genuinely needs to happen now.

**When not to use:** Routine work; bypassing pre-spawn; bypassing QA.

The override does not weaken the audit trail every override is
logged. It creates a visible record that an exception was made.

### Escape Hatch 2 Operator Reclassification (Upward Only)

**What:** A human can override the orchestrator's risk classification.

**Bounded by:** Upward only without justification (LOW → MEDIUM → HIGH
→ CRITICAL); downward requires written rationale logged to audit.

**When to use:** When the orchestrator has missed a domain dependency
or a regulatory implication.

**When not to use:** To "speed up" by downgrading. The downward path
is heavily logged precisely because it is the dangerous direction.

### Escape Hatch 3 Boardroom Decision to Retire an Agent

**What:** A Boardroom session can decide to retire an agent remove
it from active use, archive its instruction file, redirect work to
other agents.

**Bounded by:** Boardroom-level authority; recorded decision with
rationale; cannot be reversed without another Boardroom session.

**When to use:** PROBATION persists 3 sessions; capability boundary
no longer matches role; the agent is not improving despite refinement.

**When not to use:** As a substitute for instruction refinement. Most
failing agents do not need to be retired; they need a better
instruction set.

These three escape hatches are the only ways out of the protocol once
it is started. Adding a fourth requires a control plane change, which
itself requires HITL the constraint is recursive on purpose.

---

## Self-Reporting Protocol

Agents are required to self-report. The protocol has three
mandatory components.

### Mandatory Bulletin Writes

Every agent writes to the bulletin at every phase transition. Silent
execution is a D2 = 0 violation. The bulletin is the primary
observability channel for the agent's reasoning state.

A bulletin entry includes:

- The agent's identity (`agent_instance_id`)
- The phase transition (`from_state` → `to_state`)
- The artifact produced (link or content reference)
- A timestamp
- A correlation ID

A phase transition without a bulletin entry is treated as if the
transition did not happen the next hook check that depends on the
state being current will block.

### SESSION COMPLETE Blocked Without QA PASS

The agent cannot declare a session complete without a corresponding
QA-Agent verdict of `pass` or `pass_with_notes`. This is enforced at
the hook layer:

```
PostToolUse on SESSION COMPLETE:
   - Verify QAVerdict exists for the session
   - Verify QAVerdict.verdict ∈ {pass, pass_with_notes}
   - If either check fails: exit(2) and log the attempt
```

This is the single most important self-reporting rule. An agent that
could declare itself done without independent verification could
silently bypass the entire QA layer.

### Evolution Queue Writes

Findings, observations, and "this is working but could be better"
notes that the QA-Agent records as `pass_with_notes` are written to
the evolution queue. The queue is reviewed periodically (typical:
weekly) by an authorized human, and items are either:

- Promoted to a task and routed through pre-spawn
- Marked as accepted-as-is (with rationale)
- Rejected (with rationale)

The evolution queue is the place where "we noticed this but it's not
urgent" lives. Without it, observations either get lost or get
escalated as urgent both are failure modes.

---

## When Meta-Governance Itself Fails

The recursive question is: what happens when the meta-governance
system fails when a governance failure is not detected, or is
detected but the response is not executed?

The framework's answer is that meta-governance failures are
**externally visible**. The audit trail is append-only and
cryptographically chained (Wave 2). A governance failure that is not
detected internally will be visible to any external party reviewing
the audit trail typically during a compliance review, an incident
investigation, or a post-mortem.

This is the explicit boundary of the framework: it does not claim
that nothing can go wrong. It claims that anything that goes wrong
**leaves a trail**. The trail is the precondition for any external
recovery process.

---

## Related

- `pre-spawn-protocol.md` failure mode #4 lives here
- `build-state-machine.md` failure modes #4, #5, #7 manifest in the
  state machine
- `hitl-gates.md` failure modes #1, #5 manifest at gates
- `hook-system.md` failure mode #8 lives here; the override pattern
  is detailed there
- `audit-trail-patterns.md` the trail that makes every failure
  externally observable
- `compliance-evidence.md` what the audit trail provides to
  external compliance frameworks
