# Calibration

Trust scoring (D1-D4) is only as useful as the calibration behind it. A
score is a number; a calibrated score is **the same number applied
consistently across scorers, sessions, and time**. Without calibration,
D1-D4 drifts. Two scorers give different D1 scores to the same session.
The same scorer rates a Tuesday session more harshly than a Friday session.
Trust tier promotions become arbitrary, and the whole accountability model
loses its meaning.

This directory contains the operational discipline that keeps scoring
honest.

---

## Why calibration matters

The argument is short:

1. Trust scoring is **observer-assigned** by design — agents do not score
   themselves. The asymmetry is intentional.
2. Observer-assigned scoring produces noisy labels unless the observers
   are calibrated against a shared rubric.
3. Noisy labels propagate into autonomy gate decisions. An agent gets
   promoted to HIGH tier on inflated scores, then blows up on a real
   high-stakes task — and the post-mortem reveals the scores were never
   trustworthy.

Calibration is the practice that prevents step 3.

---

## What's in this directory

| File                          | Purpose                                                |
|-------------------------------|--------------------------------------------------------|
| `README.md`                   | This file — why calibration matters and how to use the directory |
| `d1-d4-rubric.md`             | The full rubric. Score bands, anchors, hard-stops, evidence rules |
| `anchor-examples.md`          | Worked, annotated multi-session scoring examples       |
| `confidence-band-guide.md`    | Confidence band mapping (n=sessions → band) and gate implications |
| `scoring-ledger-template.md`  | Copy-paste markdown table for tracking scores over time |
| `anti-patterns.md`            | Common scoring mistakes and how to remediate them      |

---

## How often to recalibrate

Calibration is not one-time setup. The rubric drifts because:

- Tasks change. The behavior that earned a 22 last quarter may earn an 18
  this quarter as the task surface evolves.
- Scorers change. New reviewers join. Existing reviewers' standards drift.
- The agent system changes. Capabilities grow. What used to be a stretch
  task becomes a routine task.

Recommended cadence:

| Trigger                                        | Calibration action                              |
|------------------------------------------------|-------------------------------------------------|
| Onboarding a new scorer                        | Walk through `anchor-examples.md` together; score 3 prior sessions and compare to recorded scores |
| Quarterly                                      | Re-score 5 random recent sessions across two scorers; investigate any divergence ≥ 5 points |
| New agent role introduced                      | Score the role's first 5 sessions with two scorers; reconcile to one truth                      |
| Score distribution shifts noticeably           | Investigate. Inflation? Drift? Real performance change? Use anti-patterns.md as a checklist     |
| After any tier promotion that surprised people | Re-score the qualifying sessions with a second scorer |

If calibration finds drift, the fix is to **re-score the affected sessions
with the corrected rubric and update the ledger**. Do not silently leave
old scores in place; that compounds the drift.

---

## Recommended reading order

1. `d1-d4-rubric.md` — the rubric and what each dimension actually scores
2. `confidence-band-guide.md` — understand bands before reading examples
3. `anchor-examples.md` — see the rubric applied to realistic sessions
4. `anti-patterns.md` — learn what to avoid
5. `scoring-ledger-template.md` — start scoring your own sessions

---

## What calibration is not

- **It is not perfectionism.** Two well-calibrated scorers can give the
  same session a 22 and a 24 and both be defensible. The rubric defines
  bands, not exact integers. Agreement *within a band* is the goal.
- **It is not a bureaucracy.** A scoring session that takes 30 minutes is
  too long. The rubric is designed to fit on one page; the worked examples
  exist so you can score most sessions in 5 minutes after a week of practice.
- **It is not a replacement for evidence.** A calibrated rubric without
  evidence in the ledger is still arbitrary. Every score must include a
  one-line justification per dimension. See `anti-patterns.md`.
