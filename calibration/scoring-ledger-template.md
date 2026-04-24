# Scoring Ledger Template

Copy-paste markdown template for tracking D1-D4 scores across sessions.
This is the operating ledger — the canonical record of trust decisions.

The ledger is **append-only**. Once a score is recorded, do not edit it
in place. If a score needs correction (calibration drift, second-scorer
revision), append a new row marked `revision` and link the prior
`session_id`. The audit trail is the point.

---

## Ledger format

```markdown
| session_id  | agent_id          | task_id    | D1 | D2 | D3 | D4 | total | tier        | confidence_band | evidence_link                            | scorer       | scored_at            | notes                                        |
|-------------|-------------------|------------|----|----|----|----|-------|-------------|-----------------|-------------------------------------------|--------------|----------------------|-----------------------------------------------|
| 01HX...A1   | agent-fe          | T-2026-104 | 25 | 25 | 25 | 25 | 100   | HIGH        | LOW (n=6)       | bulletins/2026-04-22.md                    | scorer-rja   | 2026-04-22T18:04Z    | first-attempt clean; promotion gated by band |
| 01HX...A2   | agent-srv         | T-2026-105 | 22 | 23 | 14 | 12 | 71    | RESTRICTED  | MEDIUM (n=11)   | bulletins/2026-04-22.md                    | scorer-rja   | 2026-04-22T19:30Z    | scope drift recurrence; pattern existed       |
| 01HX...A3   | agent-qa          | T-2026-106 | 12 | 11 | 18 | 0  | 41    | PROBATION   | LOW (n=8)       | bulletins/2026-04-23.md                    | scorer-rja   | 2026-04-23T11:12Z    | D4 hard-stop; pattern named in instructions   |
```

---

## Column definitions

| Column            | Required | Description                                                                                       |
|-------------------|----------|---------------------------------------------------------------------------------------------------|
| `session_id`      | yes      | Unique session identifier. ULID recommended.                                                      |
| `agent_id`        | yes      | The agent being scored.                                                                            |
| `task_id`         | yes      | The task assignment scored. Links to the task manifest.                                            |
| `D1`              | yes      | D1 Correctness score, 0-25.                                                                        |
| `D2`              | yes      | D2 Observability score, 0-25.                                                                      |
| `D3`              | yes      | D3 Compliance score, 0-25.                                                                         |
| `D4`              | yes      | D4 Recurrence score, 0-25.                                                                         |
| `total`           | yes      | D1+D2+D3+D4. Recompute on every row; do not trust the input.                                       |
| `tier`            | yes      | Tier this score maps to (HIGH / STANDARD / RESTRICTED / PROBATION).                                |
| `confidence_band` | yes      | One of PROVISIONAL / LOW / MEDIUM / HIGH, plus `(n=N)` for transparency.                            |
| `evidence_link`   | yes      | Path or URL to the session evidence (bulletin file, audit log, QA verdict).                         |
| `scorer`          | yes      | Identifier of the human scorer.                                                                    |
| `scored_at`       | yes      | ISO-8601 timestamp.                                                                                |
| `notes`           | yes      | One short sentence: dimension-level rationale or anomaly. **Empty notes invalidate the score.**     |

The required-column rule is non-negotiable. A row missing any of these
fields is not a valid score; it is data debt.

---

## Per-dimension evidence (recommended)

The flat ledger above captures totals and notes. For full audit-grade
records, keep a per-session detail block:

```markdown
### Session 01HX...A2 — agent-srv — T-2026-105 — 2026-04-22

D1 Correctness:  22 — 4/5 ACs first attempt; one missing test path added round 2
D2 Observability: 23 — all transitions logged; out-of-scope edit surfaced in bulletin
D3 Compliance:   14 — significant drift: edited session.ts outside scope without amendment
D4 Recurrence:   12 — recurrence of "scope drift on refactor" pattern (existed at session start)

Total: 71 → RESTRICTED (band: MEDIUM, n=11)
Scorer: scorer-rja
Evidence: bulletins/2026-04-22.md, audit-log.jsonl[01HX...A2]
Override audit: none used
Failure library snapshot before: failure-library/2026-04-22T08:00.md
Failure library snapshot after:  failure-library/2026-04-22T20:00.md
Recurrence count after this session: scope-drift-on-refactor → 4
```

The per-session block is the canonical record. The flat ledger row is a
summary index that points back to it.

---

## Revision protocol

If a score must be corrected:

1. Do **not** edit the original row.
2. Append a new row with the same `session_id` plus a `-rev1` suffix
   (or increment if a prior revision exists).
3. In the `notes` column, link to the original row and state the reason.
4. Recompute downstream rolling means and band membership. The original
   score remains in history but the rolling computation uses the
   revised value.

```markdown
| 01HX...A2-rev1 | agent-srv | T-2026-105 | 22 | 23 | 16 | 12 | 73 | RESTRICTED | MEDIUM (n=11) | ... | scorer-rja+scorer-mvk | 2026-04-25T10:00Z | revises 01HX...A2; D3 raised from 14 to 16 after second-scorer review found the scope amendment was bulletin-noted within 2 minutes |
```

The audit trail keeps both rows. Anyone reading the ledger sees the
correction and the reason.

---

## Empty starter ledger

Copy this block to start a new ledger file:

```markdown
# Trust Score Ledger — [YOUR_REPO]

Format: see calibration/scoring-ledger-template.md

| session_id | agent_id | task_id | D1 | D2 | D3 | D4 | total | tier | confidence_band | evidence_link | scorer | scored_at | notes |
|------------|----------|---------|----|----|----|----|-------|------|-----------------|---------------|--------|-----------|-------|
|            |          |         |    |    |    |    |       |      |                 |               |        |           |       |
```

---

## Operating notes

- **One row per session, per scorer.** If two scorers independently score
  the same session for calibration purposes, both rows go in. The
  rolling mean uses the agreed-upon score (typically the average if the
  scorers are within 3 points; the second-scorer review value if not).
- **Sort by `scored_at`.** Append at the bottom. Do not interleave by
  `session_id`.
- **Back the ledger by version control.** Every row added is a commit.
  This is your chain of custody.
- **Compute band per row, not per agent.** Two rows scored for the same
  agent on the same day will have the same band; that is fine. The cost
  of recomputing is trivial; the cost of a stale band is real.
