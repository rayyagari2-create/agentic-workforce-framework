# Architecture Decision Records (ADRs)

This directory contains the Architecture Decision Records for the
Agentic Workforce Framework. Each ADR captures one decision that has
more than one defensible answer, the context that made it necessary, the
decision taken, the consequences, and the alternatives considered.

ADRs exist so that adopters and future maintainers can reconstruct
**why** the framework is shaped the way it is. A line of code or a
schema field with no recorded rationale tends to drift; the same
decision recorded as an ADR survives turnover, version bumps, and
re-litigation.

---

## ADR Format

Every ADR in this directory follows the same structure:

```
# ADR NNNN: Short title in sentence case

## Status
Accepted | Superseded by ADR-XXXX | Deprecated

## Context
What forces are in play. What the situation was when this decision
needed to be made. Anything an outside reader needs to evaluate the
rest of the document.

## Decision
The decision itself, stated unambiguously. One paragraph or one
short list. Not a discussion the discussion lives below.

## Consequences
What follows from this decision. Both the good (which is the point)
and the bad (which is the cost). At least one negative consequence
should appear in every accepted ADR if there are none, the decision
is probably underspecified.

## Alternatives Considered
Options that were on the table and were rejected. Each alternative
gets a short description and an explanation of why it was rejected.
This is how a future reviewer evaluates whether the decision still
holds when conditions change.
```

---

## Conventions

- **Numbered sequentially.** Once a number is assigned, it does not
  move. Even if an ADR is superseded, the number stays attached to the
  superseded record. The new decision gets a new number.
- **Status is one of three.** *Accepted* the decision is current.
  *Superseded by ADR-XXXX* the decision was replaced; the link is
  required. *Deprecated* the decision applied to a feature that no
  longer exists.
- **Tense.** Written in plain present tense. "We decide..." or "The
  framework treats..." not "We have decided..." or "It was decided
  that..."
- **No marketing.** ADRs record decisions, not advantages. If a
  consequence is unpleasant, that is what the *Consequences* section is
  for.

---

## Index

| ADR | Status | Title |
|---|---|---|
| [0001](0001-agentic-workforce-not-governance-framework.md) | Accepted | The framework leads with the agentic workforce model. Governance is the control plane, not the architecture. |
| [0002](0002-routines-are-not-agents.md) | Accepted | Routines are not agents. They have no persistent identity, no trust history, and write only to `routine_runs`. |
| [0003](0003-trust-scores-require-calibration.md) | Accepted | D1-D4 trust scoring requires calibration anchors and per-dimension evidence. Calibration ships with the framework in `calibration/`. |
| [0004](0004-append-only-audit-log.md) | Accepted | The audit log is append-only. Updates to lifecycle fields produce new audit events; they do not mutate prior entries. |
| [0005](0005-enterprise-scaling-is-v3-field-proven.md) | Accepted | The enterprise multi-workspace extension is designed but not shipped. It moves to v3.0 once field-proven. |

---

## Adding a New ADR

When a new decision warrants an ADR:

1. Pick the next number in sequence. Numbers do not get reused.
2. Copy the format above into a new file:
   `NNNN-short-title.md`.
3. Fill the four sections. *Alternatives Considered* is required, not
   optional at least two alternatives should appear, including the
   "do nothing / keep the status quo" alternative if relevant.
4. Update the index in this file.
5. Reference the ADR from any architecture document that depends on
   the decision.

If a new ADR supersedes an existing one, mark the old ADR's status as
`Superseded by ADR-XXXX` and link both ways. The old ADR stays in the
directory.

---

## What Does Not Belong Here

ADRs are for **architecture** decisions. They are not for:

- Bug fixes those go in `CHANGELOG.md`.
- Implementation details that do not affect the public framework
  contract those go in inline comments or in
  `docs/reference-implementation.md`.
- Open design questions those go in `docs/concepts/` or in issues,
  until they are resolved into a decision.
- Cosmetic preferences those go in style guides.

If you are not sure whether something is an architecture decision,
ask: *would a future maintainer's understanding of the framework be
worse if this decision were lost?* If yes, it is an ADR.
