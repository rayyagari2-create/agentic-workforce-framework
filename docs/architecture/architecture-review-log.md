# Architecture Review Log

This document is the architecture hardening log: a chronological record
of concerns raised by external reviewers, the framework's response, and
the resulting status. The point of publishing it is to demonstrate that
the design was iterated under outside scrutiny rather than written in
isolation.

Each entry below is a concern (Cn), the response, and the
implementation status (LIVE, WAVE 1, WAVE 2, WAVE 3+, or Acknowledged).

---

## Status Legend

| Symbol | Meaning |
|---|---|
| 🟢 LIVE | Resolved and running today |
| 🔵 WAVE 1 | Resolution scheduled for Wave 1 |
| 🟣 WAVE 2 | Resolution scheduled for Wave 2 |
| ⚪ WAVE 3+ | Resolution scheduled for Wave 3+ |
| 🟢 Acknowledged | Concern accepted; framework documents the trade-off |

---

## C1 — Evidence Thinness

**Concern:** The framework cites a small number of sessions of operating
data. With low session counts, claims about trust calibration and
failure patterns are statistically thin.

**Response:** The framework publishes a governance metrics table in
[YOUR_REPO] that grows on every session close. Statistical confidence
bands (`PROVISIONAL` for n<5, `LOW` for 5–9, `MEDIUM` for 10–19, `HIGH`
for ≥20) are part of the trust score schema, so any consumer of a
trust score can see how much evidence backs it. Confidence bands are
applied identically everywhere — the framework does not paper over
small-n with optimistic labeling.

**Status:** 🔵 WAVE 1 — metrics table grows each session.

---

## C2 — Solo Execution Risk

**Concern:** A framework written and operated primarily by a single
author carries execution risk. Bus factor of one is a credibility
problem for a governance-focused project.

**Response:** Acknowledged. The framework leans on Routines to
accelerate the recurring work that does not require full agent
governance. Wave scoping is ruthless: Wave 1 work is small and
demonstrable, not aspirational. The enterprise scaling model
(separate document) defines the path from single-operator to
multi-team operation, including persistent agent identity, work
queues, and approval gate chains — designed extensions, not yet
field-proven at multi-team scale.

**Status:** 🟢 Acknowledged. The README maturity label states the
single-operator current state explicitly.

---

## C3 — Production Proof

**Concern:** Production claims need production evidence before public
publication. A framework that documents what it intends to do without
case studies is a design doc, not a reference architecture.

**Response:** The public README leads with an evidence table and case
studies before publication. Reference Implementation Status table is
required in the public README and lists each capability's actual
status, with no mixing of current and target state.

**Status:** 🟣 WAVE 2 — case studies + evidence table required at
publication.

---

## C4 — Meta-Governance

**Concern:** What happens when the governance system itself fails? A
governance framework that does not specify its own failure modes is
incomplete.

**Response:** A dedicated meta-governance section enumerates the
failure modes (operator unavailable to score, D1-D4 inconsistency over
time, failure record root cause wrong, pre-spawn protocol producing a
wrong recommendation, trust score driving wrong autonomy, AGT policy
too restrictive, parallel session bulletin collision, hook
false-positive blocking legitimate work) and the response for each.
Recovery protocols for trust-tier degradation and governance data loss
are documented.

**Status:** 🔵 WAVE 1 — see meta-governance section.

---

## C5 — Governance vs Safety Conflation

**Concern:** "Governance," "safety," and "policy enforcement" are
conflated in much of the agent literature. A framework that does not
state the distinction explicitly inherits the confusion.

**Response:** The framework adopts a verbatim positioning statement
for the public README. It draws three lines:

> **What this framework is:**
> A behavioral accountability system. It tracks whether agents are
> becoming more or less trustworthy over time, gates autonomy on
> demonstrated behavior, and maintains institutional failure memory.
> It governs the operational reliability of agents — not the safety of
> their outputs.
>
> **What this framework is not:**
> An AI safety system. It does not make claims about model output
> quality, hallucination rates, or harmful content. Those concerns
> belong to the model provider layer and the application layer.
>
> **How the layers relate:**
> AGT governs what agents are permitted to do (policy enforcement).
> This framework governs whether agents can be trusted to do it
> (behavioral accountability). The model provider governs what the
> model produces (model safety). These three layers are complementary.
> None replaces the other.

**Status:** 🟣 WAVE 2 — verbatim statement is required in the public
README.

---

## C6 — Failure Modes Underspecified

**Concern:** The framework documents the happy path more clearly than
the failure path. What happens at the edges — partial failures, hook
false positives, conflicting trust signals — was under-specified.

**Response:** Resolved by C4. The meta-governance section enumerates
the failure modes and recovery protocols. Each entry pairs a detection
signal with a response, so operators have a checklist when something
goes wrong.

**Status:** Resolved by C4 (meta-governance section).

---

## C7 — 23 Agents Before Proving 5

**Concern:** The roster of named components ran ahead of the count of
components actually demonstrated in production. Publishing a wide
roster on a narrow evidence base undermines credibility.

**Response:** The public roster publishes only LIVE agents at launch,
with their accumulated trust history. Components that are designed but
not yet deployed are labeled WAVE 1 / WAVE 2 / WAVE 3+ in the roster,
not promoted as live. No agent is published with a trust score unless
it has at least 5 sessions of D1-D4 data — the `PROVISIONAL` confidence
band threshold.

**Status:** 🟣 WAVE 2 — roster discipline applied at publication.

---

## C8 — D1-D4 Calibration: Noisy Labels

**Concern:** A single human assigning all D1-D4 scores produces noisy
labels, which over time degrades the autonomy gate's signal. The
framework's central mechanism — observer-assigned trust — depends on
the observers being calibrated.

**Response:** Five calibration layers, three implemented today:

| Layer | Mechanism | Status |
|---|---|---|
| 1 | Evidence requirement — one line per dimension | 🟢 LIVE |
| 2 | Calibration anchor table (full rubric in `concepts/trust-scoring.md`) | 🟢 LIVE |
| 3 | Automated scoring routine — D1-D4 payload computed from QAVerdicts | ⚪ WAVE 3+ |
| 4 | Cross-scorer calibration sessions (enterprise) | ⚪ WAVE 3+ |
| 5 | Calibration committee — 3+ scorers per high-stakes decision | ⚪ WAVE 3+ |

The first two layers ship in v1.0. The remaining three are the
enterprise-scale calibration story and ship at Wave 3+.

**Status:** 🟢 Layers 1 + 2 implemented in the trust scoring spec.
⚪ Layers 3-5 scheduled for Wave 3+.

---

## C9 — Public Framework Needs Measured Data

**Concern:** A public framework that publishes governance claims
without measured data inherits the credibility problem of every
white paper that has never run a workload.

**Response:** Case studies and a trust evolution chart are required
before the public framework is published. Minimum threshold: two
failure-to-fix case studies — concrete sessions where the framework
detected a failure, attributed it to a class, applied the
prevention artifact, and verified the failure did not recur.

**Status:** 🟣 WAVE 2 — case studies + trust evolution chart required
before publication.

---

## How to Add to This Log

A concern is added to this log when:

1. It is raised by a reviewer outside the team that wrote the
   framework. (Concerns the team already knew about belong in the
   evolution queue, not here.)
2. The framework either implements a response or accepts the
   trade-off. Either outcome is documented.
3. The status label is set per the legend. No concern is left at
   "in progress" — either there is a target wave or it is
   acknowledged.

Removing an entry from this log is not allowed. If a resolution turns
out to be wrong, add a follow-up entry that supersedes it; do not
delete the original. The log is append-only, like the audit log it
governs.

---

## Related

- `docs/concepts/trust-scoring.md` — D1-D4 calibration anchors
  (response to C8 layers 1 + 2).
- `docs/architecture/three-layer-stack.md` — How AGT, Routines, and
  this framework fit together (response to C5).
- `docs/architecture/agent-roster.md` — The framework plane roster
  (response to C7).
