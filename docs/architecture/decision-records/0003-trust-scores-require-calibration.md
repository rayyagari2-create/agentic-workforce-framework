# ADR 0003 Trust Scores Require Calibration

## Status

Accepted.

## Context

D1-D4 is a 100-point session score across four dimensions: correctness,
observability, policy compliance, and recurrence behavior. The score drives the
autonomy tier (HIGH, STANDARD, RESTRICTED, PROBATION) and therefore determines
how much human review an agent attracts on the next task.

The architectural reviewer raised the single strongest objection to this design:
**single-scorer trust labels are noisy.** One human assigning all scores produces
drift across scorers, across sessions, and across domains. Noisy labels degrade
the autonomy-gate signal; a degraded signal is worse than no signal because it
creates false confidence in a broken dial.

Two empirical observations reinforce this concern:

- At n < 5 sessions there is not enough evidence to distinguish signal from
  noise at all. Acting on a tier drawn from four sessions is acting on a rumor.
- Even at larger n, human scorers anchor on the most recent session and
  under-weight older evidence. Without a recency-weighting rule this produces
  phantom promotions and phantom demotions.

Any D1-D4 system that skips calibration produces numbers that look like data
and behave like opinion.

## Decision

Calibration is a **non-negotiable operational discipline** not a nice-to-have.
Five layers of calibration are defined, and at minimum the first two ship at
public launch.

| Layer | Mechanism                                                  | Ships    |
|-------|------------------------------------------------------------|----------|
| 1     | Evidence requirement one line per dimension, per score   | v1.0     |
| 2     | Calibration anchor table per score band, per dimension   | v1.0     |
| 3     | Automated scoring routine computes from QAVerdicts       | v2.0     |
| 4     | Cross-scorer calibration sessions at enterprise scale      | v3.0     |
| 5     | Calibration committee for high-stakes decisions (3+ scorers)| v3.0     |

Three further rules apply to every deployment regardless of scale:

1. **No score without evidence.** Every D1-D4 number is paired with one line of
   evidence. A score recorded without evidence is void.
2. **Confidence bands reflect sample size honestly.** `n<5` is `PROVISIONAL`,
   `5-9` is `LOW`, `10-19` is `MEDIUM`, `n>=20` is `HIGH`. `n=15` is `MEDIUM` —
   no other interpretation, anywhere, ever.
3. **Recency weights apply at >30 and >90 days.** Sessions older than 30 days
   carry 0.5x weight. Sessions older than 90 days carry 0.25x weight. This
   prevents stale HIGH-tier agents from holding expanded autonomy on the basis
   of evidence that has aged out.

Hard-stop rules (per dimension) exist and bypass the aggregate score:

- D1 = 0: output wrong in a way that could harm if not caught.
- D2 = 0: falsified telemetry triggers automatic trust demotion.
- D3 = 0: hook bypass or unauthorized commit triggers immediate review.
- D4 = 0: pattern repeated after it was surfaced in instructions requires a
  mandatory failure library entry.

## Consequences

**Positive.**

- Trust tier changes are defensible. Every tier change has evidence lines plus
  a confidence band that acknowledges sample size.
- The calibration anchors give scorers a shared reference point. D1 = 18 in one
  domain means the same thing as D1 = 18 in another, because both reference the
  same anchor.
- Hard-stop rules protect against the failure mode where an average score
  obscures a dimension-specific catastrophe. A D3 = 0 does not average away.

**Negative.**

- Evidence requirements raise the cost of scoring a session. This is intentional
  a cheap-to-record score is a cheap-to-ignore score.
- `PROVISIONAL` tier persists until n >= 5. Adopters want to see HIGH tiers early;
  they cannot, and no tooling will fabricate the data.
- At single-founder scale, Layers 4-5 (cross-scorer calibration, committee) are
  not available. This is a known limitation, not a flaw in the design the
  calibration layers are additive.

**Follow-on.**

- `calibration/d1-d4-rubric.md` carries the anchor table, the evidence format,
  and the hard-stop rules as a single reference document.
- The trust score schema requires evidence fields at the schema level, not just
  by convention missing evidence fails schema validation.
- The enterprise layer introduces cross-scorer review when multiple humans score
  the same session; disagreements > 5 points require explicit resolution.
