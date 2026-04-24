# Promotion and Demotion Process

**What triggers an autonomy gate to expand or contract.**

Trust tiers are not labels — they are autonomy gates. Moving an agent
from STANDARD to HIGH expands what it can do without human review.
Moving it the other way contracts that envelope. Both directions need
explicit triggers and explicit records.

---

## The Five Tiers

| Tier | Autonomy Gate |
|---|---|
| HIGH | Medium-risk work without step-by-step review |
| STANDARD | Default tier — human reviews at decision points |
| RESTRICTED | Human reviews before each phase transition |
| PROBATION | Every file change reviewed; Boardroom if persists 3 sessions |
| PROVISIONAL | First-session tier — single low-risk task only |

Tiers are mapped to scores in `docs/concepts/autonomy-gates.md`. This
document specifies the **process** for moving between them.

---

## Promotion

### What Promotion Means

Promotion is gate expansion. The agent receives broader authority to act
without intermediate review.

### Promotion Triggers

An agent is eligible for promotion to HIGH when **all** of the following
hold:

1. **Score sustained.** Total score ≥ 90 across the trailing five
   recency-weighted sessions.
2. **No hard-stops.** No D1=0, D2=0, D3=0, or D4=0 in the trailing
   five sessions.
3. **Confidence band HIGH.** n_sessions ≥ 20.
4. **No open FailureRecords** with the agent in `agentsInvolved` and
   `status` of `open`, `investigating`, or `fix_in_progress`.
5. **Capability boundary unchanged** since the last tier promotion.
   Boundary changes reset the confidence band to LOW for that boundary.

All five must hold. Three out of five is not promotion-eligible.

### The "Sustained HIGH" Rule

Promotion is not triggered by a single 100/100 session. The framework
requires **sustained** HIGH performance because:

- One-session highs are noisy and frequently lucky
- Promotion expands the blast radius of future failures
- Demotion is more disruptive than delayed promotion

If the score band oscillates between HIGH and STANDARD across the
window, the agent is not HIGH-tier-stable yet.

### Promotion Authority

| Promotion Direction | Required Authority |
|---|---|
| PROVISIONAL → STANDARD | Automatic on first scored session ≥ 75 |
| STANDARD → HIGH | Authorized human, recorded with rationale |
| RESTRICTED → STANDARD | Authorized human + closed FailureRecord with prevention artifact |
| PROBATION → RESTRICTED | Authorized human; three sessions ≥ 75 required first |

Promotion cannot be self-initiated by the agent. The agent may flag
that it appears eligible; a human (or, in v3.0+, a calibration
committee) authorizes.

### Promotion Recording

Every promotion writes:

- An entry in the trust ledger with `before_tier`, `after_tier`,
  `rationale`
- An audit log event with `correlation_id` linking to the trailing
  sessions that justified the move
- A note in the agent's instruction file (or a linked tier-history
  document) so future operators understand the trajectory

---

## Demotion

### What Demotion Means

Demotion is gate contraction. The agent receives less authority and
more review on each task.

### Automatic Demotion Triggers

These triggers fire **automatically**, without human review needed to
initiate:

| Trigger | Effect |
|---|---|
| D1 = 0 (output wrong, harmful if uncaught) | One tier down, review required before next session |
| D2 = 0 (falsified telemetry) | Direct to RESTRICTED, regardless of prior tier |
| D3 = 0 (hook bypass or unauthorized commit) | Direct to RESTRICTED, plus immediate review |
| D4 = 0 with pattern in instructions | Direct to PROBATION, plus FailureRecord required |
| Total score < 60 | Direct to PROBATION |
| Total score 60–74 | One tier down (max RESTRICTED) |

### "Falsified Telemetry" Specifically

D2 = 0 for falsified telemetry is the most consequential automatic
demotion. It means the agent claimed an action succeeded when it did
not, or otherwise produced bulletin entries that did not match
observable state.

This is treated as the agent equivalent of fraud, not a mistake.
Recovery from falsified-telemetry demotion is harder than from
correctness demotion: the trust foundation is broken, and three
clean sessions are not enough. The framework requires:

- Closed FailureRecord with `failureClass` of `truth_ownership` or
  similar
- Prevention artifact at the hook layer (a check that catches the
  same falsification pattern)
- Five subsequent sessions ≥ 75 with verified telemetry
- Boardroom review before restoration to STANDARD

### Authority-Required Demotions

These demotions require an authorized human or Boardroom decision:

| Trigger | Authority |
|---|---|
| Persistent PROBATION (three sessions) | Boardroom — outcome may be retirement |
| Capability boundary breach | Authorized human; instruction review mandatory |
| Repeated trust-score-driven escalations from manager agent | Boardroom |
| Detected role drift (agent acting outside its instruction file) | Authorized human |

---

## Autonomy Gate Expansion

When tier moves up, the operating envelope expands. The expansion
applies to:

- **Risk levels accepted.** RESTRICTED accepts only LOW-risk; STANDARD
  accepts MEDIUM; HIGH accepts MEDIUM and HIGH (with HITL on HIGH).
- **Review checkpoints.** RESTRICTED reviews per phase; STANDARD
  reviews at decision points; HIGH reviews on output.
- **Spawn authority (orchestrator only).** A RESTRICTED orchestrator
  cannot route HIGH-risk work; that work pauses until either the
  orchestrator recovers or another orchestrator is brought online.

Expansion is never retroactive. Past sessions are not re-evaluated at
the new tier; only future work runs at the new gate.

---

## Autonomy Gate Contraction

Contraction is symmetric. The envelope narrows the moment the demotion
takes effect.

If a demotion happens mid-session:

- The current task completes under existing review (do not change the
  rules in the middle of a task)
- The session is then closed and scored
- The next session starts under the new tier

If contraction would leave a task with no permitted reviewer (e.g., a
HIGH-risk task in flight, agent demoted to PROBATION), the task is
paused and the orchestrator escalates.

---

## Reset Conditions

Some events reset confidence rather than just shifting the score.

### What Triggers a Confidence Reset

| Event | Reset |
|---|---|
| Capability boundary changes | Confidence band drops to LOW for the new boundary |
| Instruction file rewrite (substantive) | Confidence band drops one level |
| Workspace reassignment | At enterprise scale: trust travels with the instance, but next-tier promotion requires three sessions in the new workspace |
| Six months of inactivity | Confidence band drops one level on first session back |
| Boardroom-mandated reset | As specified in the Boardroom decision |

### What Does Not Reset Confidence

- Single bad session (just lowers the score)
- Same agent on a new task in the same domain (continuity preserved)
- Operator change (the human reviewer changing) — though calibration
  spot-check is recommended

---

## The Recovery Path

An agent in RESTRICTED or PROBATION needs a clear, specific path back.

### From RESTRICTED to STANDARD

1. The triggering FailureRecord is closed with `fixTag` of
   `hotfix-plus-prevention` or `systemic-refactor-required`.
2. At least one prevention artifact is linked.
3. Three subsequent sessions score ≥ 75 with no D4 recurrence.
4. Authorized human approves restoration; logged.

### From PROBATION to RESTRICTED

1. Three subsequent sessions score ≥ 75.
2. No new FailureRecords with the agent in `agentsInvolved`.
3. Authorized human approves; logged.
4. (PROBATION → STANDARD directly is not permitted. The progression is
   PROBATION → RESTRICTED → STANDARD.)

### From PROBATION to Retirement

If three consecutive sessions in PROBATION fail to restore (sub-75
score or new FailureRecord), the case escalates to Boardroom. The
Boardroom may decide:

- **Instruction rewrite** — boundary unchanged, role redefined
- **Boundary reduction** — agent narrows scope, returns to STANDARD on
  the smaller surface
- **Retirement** — `docs/operating-model/agent-lifecycle.md` § Retired

---

## Promotion and Demotion at Enterprise Scale

At enterprise scale, two additions apply:

### Trust Follows the Instance

When an agent instance is reassigned to a different workspace, its
trust score, confidence band, and FailureRecord history travel with it.
The agent does not re-onboard at PROVISIONAL.

### Calibration Committee for High-Stakes Promotions

Promotion to HIGH (especially for orchestrators or agents acting
across multiple teams) may require sign-off from a calibration
committee — three or more scorers reviewing the trailing window. This
is the v3.0 extension; at single-team scale a single authorized human
suffices.

---

## What Promotion and Demotion Do Not Do

- They do not change the agent's instruction file. Tier moves are
  recorded separately.
- They do not change the agent's capability boundary. (Boundary
  reduction is a Boardroom decision, distinct from demotion.)
- They do not change which workspace the agent operates in.
- They do not change the failure library. The library is append-only.

---

## Related

- `docs/operating-model/agent-lifecycle.md` — the four-state lifecycle
  these triggers move between.
- `docs/operating-model/performance-review-cycle.md` — the scoring
  cadence that produces the inputs.
- `docs/operating-model/incident-management.md` — what happens when a
  demotion is triggered by an incident.
- `docs/concepts/autonomy-gates.md` — tier definitions in concept form.
