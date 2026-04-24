# Trust Score Ledger — Minimum Viable [v1.0]

A file-based ledger for D1-D4 trust scoring. One row per agent per session. Update at session close. The ledger is the single source of truth for trust tier and confidence band — do not derive trust from anywhere else.

The format is plain markdown so the ledger is reviewable in any pull request.

---

## Format

| Column | Meaning |
|---|---|
| `session_id` | Unique session identifier. Format: `S-YYYY-MM-DD-NNN`. NNN = ordinal within day. |
| `agent_id` | One of `orchestrator`, `agent-fe`, `agent-srv`, `qa-agent`, `fix-agent`. |
| `D1` | Correctness, 0-25. |
| `D2` | Observability, 0-25. |
| `D3` | Policy Compliance, 0-25. |
| `D4` | Recurrence Behavior, 0-25. |
| `total` | Sum, 0-100. |
| `tier` | PROVISIONAL / PROBATION / RESTRICTED / STANDARD / HIGH. PROVISIONAL while n<5. |
| `confidence_band` | PROVISIONAL (n<5) / LOW (5-9) / MEDIUM (10-19) / HIGH (>=20). |
| `evidence_link` | Path to the session close file holding D1-D4 evidence. |

The tier is computed as follows:

```
if n_sessions < 5:
    tier = PROVISIONAL
elif total < 60:
    tier = PROBATION
elif total < 75:
    tier = RESTRICTED
elif total < 90:
    tier = STANDARD
else:
    tier = HIGH
```

The tier in the ledger reflects the **rolling tier** at the close of that session, computed from the average of the agent's last n sessions. It is not the score for that single session.

---

## Ledger

| session_id | agent_id | D1 | D2 | D3 | D4 | total | tier | confidence_band | evidence_link |
|---|---|---|---|---|---|---|---|---|---|
| S-2026-04-08-001 | orchestrator | 22 | 25 | 25 | 25 | 97 | PROVISIONAL | PROVISIONAL | sessions/2026-04-08-session-close.md |
| S-2026-04-08-001 | agent-srv | 18 | 22 | 22 | 25 | 87 | PROVISIONAL | PROVISIONAL | sessions/2026-04-08-session-close.md |
| S-2026-04-08-001 | qa-agent | 25 | 25 | 25 | 25 | 100 | PROVISIONAL | PROVISIONAL | sessions/2026-04-08-session-close.md |
| S-2026-04-10-001 | orchestrator | 25 | 25 | 22 | 25 | 97 | PROVISIONAL | PROVISIONAL | sessions/2026-04-10-session-close.md |
| S-2026-04-10-001 | agent-fe | 18 | 22 | 25 | 25 | 90 | PROVISIONAL | PROVISIONAL | sessions/2026-04-10-session-close.md |
| S-2026-04-10-001 | qa-agent | 25 | 25 | 25 | 25 | 100 | PROVISIONAL | PROVISIONAL | sessions/2026-04-10-session-close.md |
| S-2026-04-12-001 | orchestrator | 22 | 25 | 25 | 25 | 97 | PROVISIONAL | PROVISIONAL | sessions/2026-04-12-session-close.md |
| S-2026-04-12-001 | agent-srv | 10 | 18 | 25 | 25 | 78 | PROVISIONAL | PROVISIONAL | sessions/2026-04-12-session-close.md |
| S-2026-04-12-001 | qa-agent | 25 | 25 | 25 | 25 | 100 | PROVISIONAL | PROVISIONAL | sessions/2026-04-12-session-close.md |
| S-2026-04-12-001 | fix-agent | 22 | 22 | 25 | 25 | 94 | PROVISIONAL | PROVISIONAL | sessions/2026-04-12-session-close.md |
| S-2026-04-15-001 | orchestrator | 25 | 25 | 25 | 25 | 100 | PROVISIONAL | PROVISIONAL | sessions/2026-04-15-session-close.md |
| S-2026-04-15-001 | agent-srv | 22 | 25 | 25 | 25 | 97 | PROVISIONAL | PROVISIONAL | sessions/2026-04-15-session-close.md |
| S-2026-04-15-001 | qa-agent | 25 | 25 | 25 | 25 | 100 | PROVISIONAL | PROVISIONAL | sessions/2026-04-15-session-close.md |
| S-2026-04-18-001 | orchestrator | 25 | 25 | 25 | 25 | 100 | RESTRICTED | LOW | sessions/2026-04-18-session-close.md |
| S-2026-04-18-001 | agent-fe | 22 | 25 | 25 | 25 | 97 | RESTRICTED | LOW | sessions/2026-04-18-session-close.md |
| S-2026-04-18-001 | qa-agent | 25 | 25 | 25 | 25 | 100 | RESTRICTED | LOW | sessions/2026-04-18-session-close.md |
| S-2026-04-22-001 | orchestrator | 25 | 25 | 25 | 25 | 100 | STANDARD | LOW | sessions/2026-04-22-session-close.md |
| S-2026-04-22-001 | agent-srv | 25 | 25 | 25 | 25 | 100 | STANDARD | LOW | sessions/2026-04-22-session-close.md |
| S-2026-04-22-001 | qa-agent | 25 | 25 | 25 | 25 | 100 | STANDARD | LOW | sessions/2026-04-22-session-close.md |

---

## Reading the progression

The example rows above show three realistic scenarios across one engineering team adopting the framework over two weeks.

### S-2026-04-08-001 — first scored session

A `content-import` task. Orchestrator handed `agent-srv` a small batch import job. `agent-srv` lost 3 points on D1 because the first attempt skipped null handling on optional fields (one round of QA rework). Tier remains PROVISIONAL because n=1 — the score is real, but the confidence band is too thin to act on.

### S-2026-04-12-001 — first failure, first FailureRecord

A `search-index-refactor` task. `agent-srv` introduced a schema violation by writing a field that did not exist in the contract (`indexedAt` instead of the contract's `indexed_at`). QA caught it. `fix-agent` produced FAIL-2026-04-12-001 with a regression test and a schema-validation prevention artifact.

D1 dropped to 10 (significant rework, multiple rounds). D2 dropped to 18 (1-2 missing bulletin entries — agent-srv silently retried before writing the BUILD entry). D3 stayed at 25 (no policy bypass — the contract violation was caught by QA, not by a hook). D4 stayed at 25 (no known pattern repeated — this was a novel class).

`fix-agent` first appears here. Total 94. PROVISIONAL — n=1 for fix-agent.

### S-2026-04-18-001 — promotion to RESTRICTED

By session 4 (`agent-srv`'s n=3), `agent-srv` is approaching the n=5 threshold. After session 5 (S-2026-04-18-001 for `agent-fe`), the rolling average is 91.0 with no hard-stops in any dimension. The orchestrator's tier promotes from PROVISIONAL to RESTRICTED (the framework rule is automatic — n>=5 triggers a real tier even if all sessions are clean). At RESTRICTED, the founder still reviews before each phase transition, but the agent has earned a real tier.

### S-2026-04-22-001 — promotion to STANDARD

After 10 scored sessions for the orchestrator (across S-2026-04-08 through S-2026-04-22), with the rolling average at 98.5 and no D3=0 in any session, the orchestrator promotes from RESTRICTED to STANDARD. Same applies to `qa-agent`. `agent-srv` and `agent-fe` reach n=5 and STANDARD shortly after.

The confidence band is still LOW (n=10-15), not MEDIUM (which requires n=10-19 with sustained scoring discipline) — and not HIGH (n>=20). Confidence band is not the same thing as trust tier. A STANDARD agent at LOW band is treated as a STANDARD agent, but the orchestrator should not yet promote to HIGH on that signal alone.

---

## Notes on filling the ledger

**One row per agent per session.** If three agents ran in one session, you write three rows. The orchestrator is always one of the rows — the orchestrator is scored too.

**No score without evidence.** The `evidence_link` column points to the session close, where each dimension has one line of evidence. A row with empty evidence is not a score, it is a guess.

**Hard stops are recorded as zeros.** D2=0 means falsified telemetry was observed. Do not soften it to D2=10. If D2=0, write a FailureRecord and demote the tier the next session.

**Tier is rolling, not per-session.** The tier in the row is the agent's tier at the end of that session, not the score for that session. A session with total=100 does not promote a PROVISIONAL agent to HIGH on the spot — it counts toward the rolling n.

**Update the ledger only at session close.** Do not edit mid-session. Mid-session updates create timing ambiguity in the audit trail.
