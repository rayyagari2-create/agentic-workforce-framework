## About this file

- **Purpose:** Pending improvement proposals surfaced by agents during
  sessions. The Orchestrator never self-applies changes to instruction
  files, policies, or contracts — instead, it files a proposal here
  and the founder reviews.
- **Who writes:** Any agent can append. Orchestrator is the common
  case (most proposals originate from Orchestrator's retrospectives).
  Human reviewer changes `Status` when accepting, rejecting, or
  deferring.
- **Mutability:** Append new rows; edit the `Status` column of
  existing rows. Never delete rows — rejected proposals stay
  visible for future reference.
- **How to initialize:** Start empty. Entries accrue as the workforce
  runs.

---

# Evolution Queue

Proposals for improvements the workforce cannot self-apply. These are
the artifact of the **learning boundary rule**:

> Orchestrator routes and plans. Orchestrator does NOT self-apply
> changes to instruction files, policy files, contract schemas, or
> domain-specific change-controlled artifacts.

Anything that would touch those files gets logged here. The founder
reviews the queue on a cadence (typical: weekly) and promotes
accepted proposals into the normal sprint queue.

---

## Format

```
ID          | Priority | Description                        | Filed       | Status
```

| Field | Rule |
|---|---|
| `ID` | `EVO-YYYY-NNN`, sequential per calendar year |
| `Priority` | `P0` (critical; blocks release), `P1` (important; next release), `P2` (nice-to-have; backlog), `P3` (speculative) |
| `Description` | One-line summary. Full rationale goes in the **Proposal body** section below, linked by ID. |
| `Filed` | `YYYY-MM-DD` from the session the proposal was surfaced |
| `Status` | `pending`, `under_review`, `accepted`, `rejected`, `deferred`, `implemented` |

---

## Proposal Queue

| ID | Priority | Description | Filed | Status |
|---|---|---|---|---|
| `[REPLACE THIS: EVO-YYYY-NNN]` | `[REPLACE THIS: P0|P1|P2|P3]` | `[REPLACE THIS: one-line]` | `[REPLACE THIS: YYYY-MM-DD]` | `[REPLACE THIS: pending|under_review|accepted|rejected|deferred|implemented]` |

---

## Worked examples

### Example queue rows

| ID | Priority | Description | Filed | Status |
|---|---|---|---|---|
| EVO-2026-005 | P0 | Add a lint rule that rejects raw `Date.now()` in src/billing — drift-tripped BUG-2026-04-22-002 | 2026-04-23 | pending |
| EVO-2026-006 | P1 | Extend routing-table.md with a `schema-migration` row distinct from generic `backend` | 2026-04-23 | under_review |
| EVO-2026-007 | P2 | Allow failure-library grep to match on symptom prefix, not just file path | 2026-04-24 | pending |

### Proposal bodies

Full rationale goes below. The summary row links here by ID.

#### EVO-2026-005

**Proposal:** Add a lint rule that rejects raw `Date.now()` in
`src/billing/`.

**Surfaced by:** QA-Agent, session 2026-04-23.

**Why:** BUG-2026-04-22-002 was a regression where a billing period
end calculation used `Date.now()` instead of the frozen transaction
timestamp. Pre-task retrieval would not have caught it (different
file than the prior occurrence). A lint rule catches the class, not
the instance.

**Recommended change:** Add
`billing/no-raw-date-now` rule to eslint config; run in CI.

**Who applies:** Human (eslint config is in `locked-states.md`).

**Priority rationale:** P0 because billing correctness is
release-blocking and the failure class has `recurrenceCount = 2`.

---

#### EVO-2026-006

**Proposal:** Extend routing-table.md with a `schema-migration` row
distinct from generic `backend`.

**Surfaced by:** Orchestrator, session 2026-04-23.

**Why:** Migrations currently route to the generic backend executor,
but they require different HITL behavior (always HIGH risk, always
Tech Lead approval). Conflating the two under one row produces
misclassification at /debug.

**Recommended change:** Add
`task type: schema-migration | assigned agent: AGENT-DB | risk level:
HIGH | requires HITL: always` to `governance/routing-table.md`.

**Who applies:** Human (routing-table.md is a policy artifact).

**Priority rationale:** P1 — not blocking, but next session that
touches migrations would benefit.

---

#### EVO-2026-007

**Proposal:** Allow failure-library grep to match on symptom prefix,
not just file path.

**Surfaced by:** Orchestrator, session 2026-04-24.

**Why:** A failure reported by a user rarely cites a file path; it
cites a symptom ("checkout button stuck"). Current retrieval only
matches by path, so user-reported symptom matches are missed.

**Recommended change:** Add a second grep pass over symptoms where
the task description is tokenized and matched against entries'
`symptom` field.

**Who applies:** Human (touches Orchestrator instruction file).

**Priority rationale:** P2 — improves quality of pre-task retrieval
but current path-based matching is not broken.

---

## Cross-references

- `agents/orchestrator.md` → `LEARNING BOUNDARY RULE` — the rule
  that funnels into this queue
- `governance/build-status.md` — accepted proposals move to the
  sprint queue there
