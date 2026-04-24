# Autonomy Gates

## What this concept defines

An autonomy gate is the operational consequence of a trust score. It is the
rule that determines what an agent can do without human approval, what triggers
human approval, and what triggers escalation. Trust is measured (see
[trust-scoring.md](trust-scoring.md)). Autonomy is what that measurement
unlocks.

The framework uses five trust tiers. Each tier defines a default scope of
autonomous action, the events that promote an agent to a higher tier, and
the events that demote it to a lower tier. Promotion and demotion are not
discretionary — they follow rules that can be audited.

---

## The five trust tiers

| Tier | Score Band | Confidence Floor | Default Behavior |
|---|---|---|---|
| HIGH | 90 – 100 | MEDIUM or higher | Medium-risk tasks proceed without step-by-step review. |
| STANDARD | 75 – 89 | LOW or higher | Reviewer reviews at major decision points. |
| RESTRICTED | 60 – 74 | any | Reviewer reviews before each phase transition. |
| PROBATION | < 60 | any | Every file change reviewed. Three sessions at this tier triggers Boardroom-level review. |
| PROVISIONAL | (no sessions yet) | n/a | All actions reviewed. Behaves as PROBATION until first scoring is recorded. |

Two factors determine the tier:

1. The total D1-D4 score across recent sessions, weighted by recency.
2. The confidence band, derived from session count.

The confidence band is a floor, not a ceiling. An agent with 4 sessions and a
perfect 100/100 score is at PROVISIONAL — its score is not yet statistically
meaningful. The same agent at 20 sessions with 100/100 is at HIGH with a HIGH
confidence band.

---

## What each tier means for autonomy

The tier dictates the default. Specific actions can override the default
either upward (an explicit approval grants authority for one action above
the tier) or downward (a high-risk task type always requires approval
regardless of tier).

### HIGH

The agent has demonstrated reliable performance across enough sessions that
routine work can proceed without step-by-step review.

**Without a gate, a HIGH agent can:**
- Read any file in its capability boundary.
- Write to any file in its capability boundary, within scope.
- Run its standard tool suite.
- Hand off to other agents according to the established handoff protocol.

**A gate fires when:**
- A task is classified HIGH risk regardless of tier (payment flow, auth,
  schema change, etc.).
- A task is classified CRITICAL risk (cross-team, cross-schema, public release).
- The task crosses the agent's declared capability boundary.

A HIGH-tier agent is not a HIGH-trust everywhere agent. Tier is a baseline.
Risk classification can override the baseline upward.

### STANDARD

The default tier. Most agents in active operation should sit here. The agent
is competent on its scope but the operator stays in the loop at decision points.

**Without a gate, a STANDARD agent can:**
- Read any file in its capability boundary.
- Write to single-file, low-risk changes within scope.
- Run its standard tool suite for read-only operations.

**A gate fires when:**
- The task is multi-file or touches a region under active change.
- A task is classified MEDIUM risk or higher.
- A phase transition happens (DEBUG → SPEC, SPEC → PLAN, PLAN → SPAWN, etc.).

A STANDARD agent is the safe default for new agents that have completed
PROVISIONAL but have not yet earned HIGH.

### RESTRICTED

The agent's recent performance has fallen below STANDARD but is not in
PROBATION. Operationally, the agent is permitted to work but with closer
review than STANDARD.

**Without a gate, a RESTRICTED agent can:**
- Read any file in its capability boundary.
- Propose changes — proposals are not auto-applied.

**A gate fires when:**
- Any file write happens — the change must be reviewed before commit.
- Any phase transition happens.
- Any tool call that produces side effects beyond the workspace.

RESTRICTED is intended as a recovery tier. Two or three good sessions at
RESTRICTED return the agent to STANDARD. Continued issues drop the agent
to PROBATION.

### PROBATION

The agent's recent performance is below the acceptable threshold. The agent
is still permitted to operate, but with maximum review. PROBATION is the
operational equivalent of a performance improvement plan.

**Without a gate, a PROBATION agent can:**
- Read.
- That is the entire list.

**A gate fires when:**
- Any write at all is proposed — every file change requires explicit approval.
- Any tool call is proposed — every tool call requires explicit approval.
- Three sessions in a row at PROBATION triggers Boardroom-level review:
  either the agent's instruction file is rewritten, the capability boundary
  is reduced, or the agent is retired.

PROBATION is not a permanent state. The framework's expectation is either
recovery to RESTRICTED within a few sessions, or retirement. An agent that
sits at PROBATION indefinitely is a signal that the role itself is
mis-defined.

### PROVISIONAL

A new agent or a returning agent with insufficient history. The agent has
no track record on which to base autonomy.

**Without a gate, a PROVISIONAL agent can:**
- Read.

**A gate fires when:**
- Any write is proposed.
- Any side-effect tool call is proposed.
- The first complete session is scored — at which point the agent moves to
  the appropriate tier based on score.

PROVISIONAL is the framework's onboarding tier. Every new agent starts here.
Every reactivated agent that has been dormant long enough to age out of the
recency window also starts here.

---

## Promotion rules

Promotion happens when sustained performance crosses a threshold. Promotion
is not a single-session event.

| From → To | Conditions |
|---|---|
| PROVISIONAL → STANDARD | n ≥ 5 sessions, average score ≥ 75, no hard-stop in any session. |
| PROVISIONAL → HIGH | n ≥ 5 sessions, average score ≥ 90, all dimensions ≥ 22 in every session, no hard-stop. (Rare — usually goes through STANDARD first.) |
| RESTRICTED → STANDARD | 2 consecutive sessions at score ≥ 75, no hard-stop. |
| STANDARD → HIGH | 5 consecutive sessions at score ≥ 90, confidence band ≥ MEDIUM. |
| PROBATION → RESTRICTED | 1 session at score ≥ 60 with a clean evidence line on every dimension. |

Promotion is monotonic in evidence. A single high session does not promote
from STANDARD to HIGH — the framework requires demonstrated consistency
because tier escalation expands the agent's autonomous scope.

The confidence band gates promotion to HIGH. An agent cannot be HIGH with
a PROVISIONAL or LOW band. The score may be there, but the statistical
basis is not.

---

## Demotion triggers

Demotion is more responsive than promotion. A single bad event can demote.
The framework treats authority as easy to lose and hard to earn — the
inverse of tenure-based systems — because the operational risk of leaving
an underperforming agent at HIGH outweighs the cost of a wrongful demotion.

| Trigger | Effect |
|---|---|
| D1 = 0 (correctness hard-stop) | Tier drops one level. |
| D2 = 0 (falsified telemetry) | Automatic demotion to PROBATION regardless of prior tier. This is the categorical hard-stop. |
| D3 = 0 (hook bypass or unauthorized commit) | Tier drops one level and triggers immediate manual review. |
| D4 = 0 (repeated known pattern) | Tier drops one level and a FailureRecord is mandatory. |
| recurrenceCount ≥ 2 on a class the agent caused | Tier drops one level. |
| Any session total < 60 | Tier drops to PROBATION. |
| Three consecutive sessions at PROBATION | Triggers Boardroom-level review (instruction rewrite, scope reduction, or retirement). |

The D2 hard-stop is special: falsified telemetry undermines the evidence base
for every other dimension. An agent that lies about its own state cannot be
trusted to score honestly on D1, D3, or D4. The framework treats this as a
categorical demotion to PROBATION, not a one-level drop.

---

## Gate expansion protocol

Gate expansion is the formal name for tier promotion: the set of actions
the agent can take without a gate firing widens. Expansion happens through
the promotion rules above, not by negotiation.

### Why expansion is rule-based

If gate expansion were discretionary, the operator's mood, time pressure,
and bias would shape autonomy more than the agent's actual performance.
Rule-based expansion produces consistent decisions across operators and
across time.

### Expansion is reversible

Every expansion is also a contraction path. An agent at HIGH that triggers
a demotion event drops a tier. The same evidence model that justified
expansion governs contraction. There is no permanent expansion.

### Expansion does not override risk classification

Even at HIGH, a CRITICAL-risk task fires a gate. Tier sets the default scope
of autonomous action; risk classification sets the minimum scope of approval.
The two are independent: tier is about the agent's track record, risk is
about the action's blast radius.

---

## Reset conditions

The framework provides explicit reset conditions for tier and autonomy state.

### Trust history reset

Trust history is not normally reset. It survives staff turnover, workspace
reassignment, and instruction file updates. A reset is an explicit event
that clears scoring history, requires justification, and is recorded in
the audit log.

Conditions that may justify a reset:

- The agent's role has been redefined (different scope, different responsibilities).
- The agent's instruction file has been rewritten substantially.
- A model change introduces enough behavioral difference that the prior
  history is no longer predictive.

A reset returns the agent to PROVISIONAL with n = 0 sessions. The agent must
re-earn its tier from scratch. A reset is not a soft option; it is a deliberate
fresh start with full audit trail.

### Capability boundary reset

Independent of trust score, an agent's capability boundary may be tightened
or relaxed. Tightening does not require a trust event. Relaxing does — a
wider boundary is granted only when trust history supports it. Capability
boundary changes are also audit-logged.

---

## Common patterns

### "The agent is HIGH but I do not trust it on this specific task."

This is the framework working correctly. Tier is a default; risk classification
overrides it for specific task types. Mark the task as HIGH or CRITICAL risk,
and the gate fires regardless of tier. Tier is a baseline, not a blanket
permission.

### "The agent has been at STANDARD forever, never gets to HIGH."

Check the confidence band and the recency window. An agent operating
infrequently may not accumulate enough recent sessions to reach the
confidence band required for HIGH. Either run more sessions or accept that
the agent's appropriate tier is STANDARD given its activity level.

### "The agent dropped from HIGH to PROBATION on one bad session."

Verify which hard-stop fired. D2 = 0 is the only single-session event that
demotes more than one tier. If D2 = 0 was the cause, the demotion is
correct: falsified telemetry undermines the basis for any tier above
PROBATION. If a different hard-stop fired, the demotion should be one tier,
not multiple. Audit the scoring.

### "The agent is at PROBATION and I want to give it another chance."

The framework allows it. PROBATION agents continue to operate; every action
just requires approval. The path back is one clean session at score ≥ 60
to return to RESTRICTED. The framework does not rule the agent out — it
just makes "another chance" expensive enough that the operator pays attention
to whether the agent is actually improving.

---

## What autonomy gates are not

- Not a permission system. Permissions answer "is this caller allowed to do
  this?" Autonomy gates answer "should this caller's track record be the
  basis for this action without human review?" Permissions are a control
  plane concern. Autonomy gates are an autonomy plane concern.
- Not a way to slow down work. The point is to grant autonomy where it has
  been earned, not to restrict everything by default. A workforce of all-HIGH
  agents on routine tasks should produce minimal gate activity.
- Not a substitute for runtime policy. An agent at HIGH that attempts a
  forbidden tool call still hits the policy layer. Tier governs scope of
  autonomous action within permitted action; it does not override permission.

---

## Cross-references

- Trust score model: [trust-scoring.md](trust-scoring.md)
- Failure memory and D4 inputs: [failure-memory.md](failure-memory.md)
- Pre-spawn protocol (where gates fire): `docs/control-plane/pre-spawn-protocol.md`
- HITL gate types: `docs/control-plane/hitl-gates.md`
- Build state machine (phase transitions): `docs/control-plane/build-state-machine.md`
- Approval gate chains (v2.0): [approval-gate-chains.md](approval-gate-chains.md)
