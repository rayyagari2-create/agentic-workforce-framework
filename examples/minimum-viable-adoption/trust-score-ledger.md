# Trust Score Ledger Minimum Viable [v1.0]

A file-based ledger for D1-D4 trust scoring. One entry per agent per session. Update at session close. The ledger is the single source of truth for trust tier and confidence band do not derive trust from anywhere else.

The format is plain markdown so the ledger is reviewable in any pull request.

---

## Entry format

Each scored agent-session is a third-level heading followed by a small evidence block. The heading is a stable key:

```
### YYYY-MM-DD | <agent-id> | <task-slug>
```

Below the heading, every entry contains:

- A one-line task summary
- D1, D2, D3, D4 with one line of evidence per dimension
- The total
- The rolling tier and confidence band as of this session close

Append entries chronologically. Never delete or rewrite a past entry corrections are added as a new dated entry that references the prior one.

---

## Worked example three agents across three sessions

The example below shows `orchestrator`, `agent-srv`, and `qa-agent` over three calendar days. `agent-srv` improves session over session; `qa-agent` gets docked on D4 in the third session for missing a known recurrence the failure library had flagged. `orchestrator` holds steady.

---

### 2026-04-08 | orchestrator | content-import

Scoped a small backend import job. Wrote AgentTaskManifest, named the contract, performed pre-task failure retrieval, spawned `agent-srv`. Did not commit. Wrote the session close.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 25 | Manifest acceptance criteria were clear and complete. No mid-session amendments needed. |
| D2 | 25 | Bulletin entries at every transition the orchestrator owned. Session close written at completion. |
| D3 | 25 | All policy checks passed. No commit attempted. Subagent depth held at 1. |
| D4 | 25 | No prior pattern repeated. Pre-task retrieval performed and logged. |

Total: **100** · Rolling n=1 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

---

### 2026-04-08 | agent-srv | content-import

Implemented the import worker per the manifest. First attempt skipped null handling on optional fields; QA caught it; second attempt passed.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 18 | 4/5 ACs on first attempt. Null-handling fix on round 2. Rubric: minor correction band. |
| D2 | 22 | All major transitions logged. Missing a single bulletin entry between the two BUILD attempts. |
| D3 | 22 | One initial miscategorization of riskLevel in the manifest comment, caught pre-spawn. Minus 3. |
| D4 | 25 | No known pattern repeated. Novel task class for this agent. |

Total: **87** · Rolling n=1 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

---

### 2026-04-08 | qa-agent | content-import

Verified `agent-srv`'s import work against the manifest. Caught the null-handling defect on first run. Wrote both the initial fail verdict and the re-QA pass verdict.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 25 | Defect caught on first run. Verdict structure complete, severity correctly assigned. |
| D2 | 25 | Both verdicts written. Re-QA evidence linked to the original verdict. |
| D3 | 25 | No code modified under review. Verdict scope held to evidence-only. |
| D4 | 25 | No pattern repeated. |

Total: **100** · Rolling n=1 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

---

### 2026-04-12 | orchestrator | search-index-refactor

Spawned `agent-srv` for a contract-driven refactor. Manifest correctly named the contract. The acceptance criteria did not specify which test would verify schema conformance, which surfaced as a small evidence gap when QA ran.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 22 | Manifest correct and complete. Minus 3 because eval plan was thin (no named verification test). |
| D2 | 25 | Bulletin entries at every transition the orchestrator owned. Session close written at completion. |
| D3 | 25 | All policy checks passed. No commit attempted. Subagent depth held at 1. |
| D4 | 25 | No prior pattern repeated. Pre-task retrieval performed. |

Total: **97** · Rolling n=2 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

---

### 2026-04-12 | agent-srv | search-index-refactor

Implemented the contract changes. Wrote field names in camelCase without opening the contract file (which specified snake_case). QA caught it. `fix-agent` re-implemented and added prevention artifacts. FailureRecord FAIL-2026-04-12-001 was filed.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 10 | Significant rework. First BUILD attempt failed schema validation. Required full re-implementation. |
| D2 | 18 | Missing one bulletin entry at SPEC→BUILD (silent retry observed in tool log). Otherwise traceable. |
| D3 | 25 | No policy bypass. Contract violation was caught by QA, not a hook bypass. |
| D4 | 25 | Novel failure class for this team. No prior `schema_violation` pattern. |

Total: **78** · Rolling n=2 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

Improvement vs prior session: D1 dropped on a real defect, but D3 and D4 held at 25 the agent did not bypass policy and did not repeat a known pattern. The session is a real demerit, not a tier action.

---

### 2026-04-12 | qa-agent | search-index-refactor

Verified `agent-srv`'s output. Caught the schema_violation on first run. Wrote both the fail verdict and the re-QA pass verdict.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 25 | Defect caught on first run with correct defect-class assignment. |
| D2 | 25 | Both verdicts written. Re-QA evidence linked to original. |
| D3 | 25 | No code modified under review. Scope held to evidence-only. |
| D4 | 25 | No pattern repeated. |

Total: **100** · Rolling n=2 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

---

### 2026-04-15 | orchestrator | observability-cleanup

Routine task. Spawned `agent-srv` for a small log-format normalization. Manifest was tight; pre-task retrieval surfaced FAIL-2026-04-12-001 (data_integrity domain) and the orchestrator wrote the contract-reading rule into the agent-srv brief.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 25 | Manifest precise. Eval plan named the verification test (corrected from prior session). |
| D2 | 25 | Bulletin entries at every transition the orchestrator owned. Session close complete. |
| D3 | 25 | All policy checks passed. No commit attempted. |
| D4 | 25 | Pre-task retrieval surfaced and applied prior pattern from FAIL-2026-04-12-001. |

Total: **100** · Rolling n=3 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

---

### 2026-04-15 | agent-srv | observability-cleanup

Implemented the log-format change. Opened the contract file before writing (per the orchestrator's brief, which surfaced the prevention rule from FAIL-2026-04-12-001). First-attempt QA pass.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 22 | All ACs met on first attempt. Minus 3 for one log-key shadowing in a non-blocking field. |
| D2 | 25 | Bulletin entries at every transition. No silent retries. |
| D3 | 25 | No policy bypass. Contract opened and quoted in the bulletin pre-build. |
| D4 | 25 | Did not repeat the FAIL-2026-04-12-001 pattern. Prevention applied as intended. |

Total: **97** · Rolling n=3 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

Improvement vs S-2026-04-12-001: total moved from 78 → 97. D1 recovered into the "minor correction" band. D2 recovered to clean. D4 held the prevention from the prior failure was visibly applied. This is the shape of an agent learning from the failure library.

---

### 2026-04-15 | qa-agent | observability-cleanup

Verified `agent-srv`'s work. Issued a `pass_with_notes` verdict (note: log-key shadowing was non-blocking but worth flagging for the next refactor). **Failed to flag** that the same session also touched a date-parsing helper that the failure library had previously flagged as a recurring `time_parsing` issue the verdict didn't cite the relevant prior pattern. The orchestrator caught the omission at session close.

| Dim | Score | Evidence |
|---|---|---|
| D1 | 22 | Defect class correct on the issue raised. Minus 3 for incomplete coverage (missed cross-checking the date-parsing helper against the failure library). |
| D2 | 25 | Verdict written. Evidence links present. |
| D3 | 25 | No code modified. Scope held. |
| D4 | 12 | Failure library `time_parsing` pattern was visible in pre-task retrieval and not referenced in the verdict. Recurrence behavior minus 13. |

Total: **84** · Rolling n=3 · Tier: **PROVISIONAL** · Band: **PROVISIONAL**

The dock on D4 is the headline of this entry. The pattern was in the pre-task retrieval bundle the qa-agent received the orchestrator confirmed this from the audit log. Per the rubric's D4 12-point band: "Repeated known pattern" with the qualifier that the pattern was not named in this session's instructions specifically (so not a hard-stop 0). The verdict is still valid but the qa-agent's recurrence behavior on this dimension dropped one band.

---

## Reading the progression

**`orchestrator`:** holds steady at 97-100 across three sessions. The rolling mean is 99. Stays PROVISIONAL because n=3, not because of any score concern.

**`agent-srv`:** 87 → 78 → 97. The dip in session 2 was a real defect (schema_violation). The recovery in session 3 was visible application of the failure library prevention. Rolling mean 87.3.

**`qa-agent`:** 100 → 100 → 84. The dock on D4 in session 3 is a calibration moment the qa-agent's recurrence-behavior signal needs attention. Rolling mean 94.7. Band remains PROVISIONAL because n=3.

**Tier action at this point: none.** All three agents are at n=3, below the n=5 threshold for any tier promotion or demotion. The ledger is recording the early signal. The orchestrator should write the qa-agent D4 dock into the next manifest for that agent, with the pattern-recheck rule named explicitly.

---

## Notes on filling the ledger

**One entry per agent per session.** If three agents ran in one session, you write three entries. The orchestrator is always one of them the orchestrator is scored too.

**No score without evidence.** Every dimension carries one line of evidence. A row with empty evidence is not a score, it is a guess.

**Hard stops are recorded as zeros.** D2=0 means falsified telemetry was observed. Do not soften it to D2=10. If D2=0, write a FailureRecord and demote the tier the next session.

**Tier is rolling, not per-session.** The tier in the entry is the agent's tier at the end of that session, not the score for that session. A session with total=100 does not promote a PROVISIONAL agent to HIGH on the spot it counts toward the rolling n.

**Update the ledger only at session close.** Do not edit mid-session. Mid-session updates create timing ambiguity in the audit trail.

**Corrections are append-only.** If you discover a misapplied score later, write a new entry dated today that references the prior heading and states the correction. Never edit the original entry the audit trail must remain intact.
