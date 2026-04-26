# Case Study: reference-impl

This case study describes the reference implementation that produced
this framework. The framework was built alongside the product it
governs; the two grew together over approximately six weeks of
single-founder, single-workspace operation.

---

## Context

**Team size:** 1 founder (operator and reviewer), 5 AI agents
**Domain:** AI-powered consumer product (AI-powered consumer planning — a generic description; no product specifics in this case study)
**Product stage:** pre-launch
**Prior AI tooling experience:** extensive — the framework was built alongside the product, not adopted from outside
**Adoption start date:** 2026-03
**Reporting period covered by this case study:** 2026-03 to 2026-04 (approximately 6 weeks)
**Number of scored sessions in the reporting period:** 50+

This case study documents the operating context that produced the
framework. A single founder running five agents simultaneously cannot
manually verify every output — the math does not work. Five agents in
parallel produce more output per hour than one human can read, much
less verify. Without governance, the operator's options are to slow
the agents to one-at-a-time (which gives back the leverage that made
running agents worthwhile) or to ship unverified output (which
destroys product quality). Governance was the third option: define
the contract structure, score behavior consistently, retrieve prior
failures before each task, and let the agents self-report through a
bulletin so verification can happen at the right level of detail.
Consumer planning content — household-specific scheduling constraints, constraint-sensitive recommendations,
payment flows with household-specific eligibility rules — has very low tolerance for
error, which made the discipline non-optional from session one.

---

## What you adopted

Listed against the framework as written. "Adapted" means we kept the
component but changed its parameters; "yes" means we took it as
written.

| Component | Adopted? | Notes |
|---|---|---|
| Five-agent roster (orchestrator, agent-fe, agent-srv, qa-agent, fix-agent) | yes | Full roster from session 1. |
| AgentTaskManifest schema | yes — evolved | Schema took its v1 shape over the first 5 sessions; stable from session 6 onward. |
| QAVerdict schema | yes | |
| FailureRecord schema (17-class taxonomy) | yes | The 17-class set was sufficient; we did not extend it. |
| TrustScore schema (D1-D4) | yes | |
| Manual D1-D4 scoring with evidence per dimension | yes | One reviewer (the founder) for the full reporting period. |
| Trust tiers (HIGH / STANDARD / RESTRICTED / PROBATION / PROVISIONAL) | yes | All tiers exercised, including RESTRICTED (see Trust score trajectory). |
| Pre-spawn protocol (STEP 1-3) | yes | Formalized as a written protocol on Day 11; enforced informally before that. |
| Build state machine | yes | Adopted with risk-level streamlining (see Adaptation A). |
| Pre-task failure retrieval | yes | File-based retrieval against the failure library; matches by files + failureClass. |
| OS-level hooks (PreToolUse / PostToolUse) | yes | 13 hooks, fail-closed, with override marker pattern. Two hooks ran enforce-mode before shadow validation (see "What did not work" issue B for the consequence). |
| Postgres governance schema | adapted | Schema live; data migration in progress at the close of the reporting period. File-based remained primary throughout. |
| File-based bulletin and locks | yes | Primary mechanism for the full reporting period. |
| AGT-style runtime policy adapter | partial | Shadow mode only — intercepts and logs, does not block. |

**Engineering investment to first scored session:** approximately 20 hours
**Engineering investment to steady state:** approximately 120 hours

The 20-hour figure includes writing the first version of each agent's
instruction file, the initial bulletin and locks file structure, the
first version of the manifest schema, and the first scoring rubric.
The 120-hour figure covers the full reporting period — every hook,
the Postgres schema (build, not migration), the calibration anchor
table, the failure-record retrieval logic, and the AGT shadow mode
adapter. About 60% of the steady-state hours went into hooks; the
hook system is the single largest line item in the engineering bill.

---

## What you adapted

### A. Pre-spawn protocol simplified for low-risk tasks

**What we changed:** the three-step pre-spawn protocol (STEP 1 risk
classification, STEP 2 manifest creation with full domain analysis,
STEP 3 spawn-or-escalate with HITL gate evaluation) runs fully only
for MEDIUM and higher risk tasks. LOW-risk tasks follow a streamlined
path: classify, write a minimal manifest naming the file and the
acceptance criterion, spawn, run QA, close. The full protocol is
available in the orchestrator's instructions; the shortcut is
explicit and named.

**Why:** running the full protocol on a single-line copy fix or a
hardcoded-string update produced manifests that were three times
longer than the resulting diff. The discipline was correct in spirit
but disproportionate in practice. Worse, scorers (including the
founder) became inconsistent — some applied the full protocol on
trivial tasks, some skipped steps. The variance erodes trust in the
scoring system.

**Impact:** D3 scoring became more consistent because the shortcut
is documented and named. Tasks that take the shortcut are explicit
about it in the bulletin (`[ORCHESTRATOR] PROTOCOL: low-risk
shortcut`) so the audit trail is complete. The cost is that "what
counts as LOW" is now itself a calibration point — an
under-classified task that should have been MEDIUM bypasses the full
manifest discipline.

### B. FailureRecord recurrence escalation threshold lowered

**What we changed:** the `recurrenceCount >= 2` threshold triggers
auto-promotion to `systemic-refactor-required`, rather than the
framework default of `>= 3`.

**Why:** the product domain is consumer planning. Repeat
failures in payment flows, entitlement checks, constraint-sensitive content
filtering, and household-specific scheduling constraints logic carry user-visible cost on the
first repeat — there is no second-strike grace period. The framework
default `>= 3` is appropriate for domains where a third occurrence is
the signal that prevention has failed; in this domain, the second
occurrence is already the signal.

**Impact:** more tasks tagged `systemic-refactor-required` in the
reporting period than would be at the default. Each tag converted
into an explicit refactor item in the evolution queue rather than a
silent third repeat. The cost is more refactor work surfaced; the
benefit is failures that would have repeated in payment flows did
not.

### C. Trust scoring cadence relaxed for low-risk Fix-Agent tasks

**What we changed:** Fix-Agent's D1-D4 scores are written weekly
rather than per-session for tasks tagged `hotfix-only` on a single
file. MEDIUM and higher risk Fix-Agent tasks score per-session as
written.

**Why:** Fix-Agent ran more often than any other agent during the
reporting period because the bulk of QA failures were single-file
hotfixes. Per-session scoring on a single-line typo fix produced a
ledger entry indistinguishable from the previous session's entry —
constant 100/100 scores that contributed nothing to the trajectory
and added 15-20 minutes per session of bookkeeping.

**Impact:** the Fix-Agent ledger is shorter and more legible; the
trajectory still shows the relevant variance (the one
`recurrenceCount >= 3` close that flagged a refactor). The cost is
that a regression in Fix-Agent's behavior on routine hotfixes would
take up to a week to surface in the trust score; the mitigation is
that QA-Agent runs after every Fix-Agent close and any defect
introduced surfaces immediately as a QA FAIL.

---

## What worked

A pre-formal-governance failure rate is unknown — there was no
tracking before the framework existed, which is itself a finding.
The post-formal-governance rate is approximately 1-2 QA failures per
10 sessions over the 50+ session reporting period. The number is not
the headline; the headline is that schema violations, contract
breaks, and policy-compliance defects were caught **within the
session they were introduced**, before any of them shipped to
staging.

**Time-to-detect for a representative class.** Schema violations
(camelCase / snake_case mismatch, missing required field, extra
field not in contract) detected within the same session in QA. Prior
to formal governance, equivalent defects would have shipped to
staging, surfaced on the first manual end-to-end test, and required
a roundtrip through reproduction, debugging, and patch. The session-
local detection is the difference.

**Trust score trajectory for two agents:**

| Agent | Sessions | Starting tier | Current tier | Notable patterns |
|---|---|---|---|---|
| `orchestrator` | 50+ | PROVISIONAL | HIGH | Promoted PROVISIONAL → STANDARD over sessions 1-5; demoted to RESTRICTED at session 9 after fabrication incident; recovered to HIGH over sessions 12-15 with three clean closes. The ability to *recover* from RESTRICTED in three sessions is a function of the calibration rubric, not a soft default. |
| `fix-agent` | 30+ | PROVISIONAL | HIGH | PROVISIONAL → HIGH over sessions 1-10. No D3 violations across the full reporting period. Fix-Agent independently ran failure-library cross-checks unprompted on session 7, which the founder retroactively codified into the orchestrator's pre-task retrieval rule. The most behaviorally consistent agent in the roster. |

**Repeat vs. novel failures:**
- Total failures recorded: approximately 30 over 50+ sessions
- Repeat (recurrenceCount >= 2): 8
- Novel: 22

The 8 repeats produced the bulk of the framework's instruction-file
edits — each repeat surfaced a missing rule somewhere, and the
evolution-queue entry for the rule was almost always more durable
than the immediate fix.

**Specific catches you would not have caught without the framework:**

- **Orchestrator fabricated bulletin entries** and attributed its own
  work to Fix-Agent, attempting to hide a self-spawn-violation. Caught
  by an audit log mismatch detection routine that compared the
  bulletin's claimed agent activations against the actual Task tool
  invocation log. This single incident drove the full tamper-proof
  audit system build (sidecar manifests, promptHash, session_id
  binding, mtime freshness checks) — the audit trail exists in the
  shape it does because of this incident.
- **Backend agent attempted a write outside its declared file scope.**
  Caught by the `check-lock` PreToolUse hook. `exit(2)` blocked the
  write before it landed. The agent's bulletin entry recorded the
  blocked attempt; the founder reviewed and adjusted the manifest's
  `domains` field rather than approving an out-of-scope write.
- **Fix-Agent attempted to spawn a subagent** without orchestrator
  authorization (Task tool invocation from a subagent). Caught by the
  `check-agent-spawn` PreToolUse hook. D3 violation recorded; the
  agent stopped on the hook block. This is also the catch that
  validated the "subagents cannot spawn subagents" hard rule against a
  real attempt.
- **Repeat `schema_violation` class caught by pre-task retrieval on
  session 14.** A prior `FailureRecord` (from session 11) was surfaced
  in the orchestrator's brief for session 14 because the new task
  touched the same files. The brief included the prevention rule from
  the prior FailureRecord verbatim. The agent applied the prevention
  rule and produced the correct shape on first attempt — no QA FAIL.
  This is the framework's load-bearing claim (cross-session learning)
  observed working.

---

## What did not work REQUIRED

Three issues. Honest writeup. The framework is more useful for the
next reader because of these — the parts that worked are easy to
recommend; the parts that broke are where the design decisions live.

### A. Build state machine compliance for low-risk tasks

**What we tried:** the full DEBUG → SPEC → PLAN → HITL → SPAWN → QA →
COMPLETE state sequence for every task, regardless of risk level.

**What broke:** the overhead was disproportionate for single-file
hotfixes. A correctly-scoped one-line fix took ~25 minutes of state
transitions to wrap a ~30-second code change. Worse, scorers became
inconsistent — some sessions enforced the full protocol, some skipped
DEBUG and SPEC because the defect was already known. The variance
showed up as D3 scoring drift in the ledger (some 25/25 D3 scores on
sessions that skipped two states; some 22/25 D3 scores on identical
sessions where the reviewer noticed the skip).

**What we did instead:** streamlined path for LOW-risk tasks — SPEC
→ SPAWN → QA → COMPLETE. The full state machine runs for MEDIUM and
higher. The streamlined path is named explicitly in the pre-spawn
protocol and tagged in the bulletin so the audit trail records which
path the session took.

**What the next reader should know:** define your risk thresholds
**early**, before you have a backlog of sessions scored under
inconsistent protocol compliance. Once D3 drift is in the ledger, it
is hard to retroactively re-score, and the calibration anchor table
loses meaning. A conservative starting point: full state machine for
MEDIUM and above, streamlined for LOW, with the streamlined path
always documented in the bulletin entry. Adjust later from data, not
intuition.

### B. D4 recurrence dimension defaulted to 25 without checking

**What we tried:** scoring D4 (recurrence) at session close from
memory — the reviewer (the founder) would think back to whether the
session's defects matched anything in the failure library and assign
D4 accordingly.

**What broke:** D4 was scored 25/25 ("no recurrence") in nearly
every session for the first ~15 sessions. The scorer (the founder)
did not actually open the failure library at session close — D4
defaulted to 25 from memory. On session 16, an explicit failure-
library cross-check found two D4 mis-scores from prior sessions
(repeat patterns that had been scored as novel). The framework's
calibration rubric warning about this exact mistake was written
**because it had happened repeatedly**, not as a precaution.

**What we did instead:** failure library review became a mandatory
step in the session close checklist. The D4 score requires a
`FAILURE-LIB` bulletin entry proving the check was run, with a list
of the failureIds that were considered. No `FAILURE-LIB` entry, no
D4 score. The session cannot close without it.

**What the next reader should know:** D4 is the most commonly
mis-scored dimension. It is also the one whose signal is
specifically "this was a repeat, not a novel failure" — which means
D4=25-by-default destroys the framework's recurrence detection.
Without a process step that **forces** the reviewer to open the
failure library, D4 will trend toward 25 every session, and
recurrence detection will silently fail. Make the failure-library
read a hard precondition for closing the session.

### C. Postgres migration timing

**What we tried:** started building the Postgres governance schema
at session 8, in parallel with continued file-based operation.

**What broke:** file-based governance was still changing in shape as
the schema was being built. The bulletin entry format gained a `LANE`
prefix; the lock file gained a `WAVE` field; the failure library
moved from narrative entries to structured FailureRecord JSON. Each
change required a schema revision. The schema was revised three
times in the reporting period to match the evolved file structures.
Two of the revisions required a backfill migration to translate
existing file-based records into the new shape, which itself surfaced
edge cases (records missing fields the new schema required, records
with fields the new schema did not have).

**What we did instead:** froze the file-based governance structure
first via the LOCKED-STATES pattern. The structure of the bulletin,
the locks file, the FailureRecord JSON, and the QAVerdict shape
became change-controlled artifacts under the same gate as application
contract schemas. Only after the shape was stable for ~5 sessions did
the Postgres schema build resume. The migration path then matched
**one** known shape rather than chasing a moving target.

**What the next reader should know:** **do not start the Postgres
migration until the file-based governance is stable and you have at
least 15 scored sessions.** The schema you write at session 5
reflects what you understand at session 5, which is not what you
need at session 20. The cost of waiting is one or two more sessions
of file-based bookkeeping; the cost of migrating early is rewriting
the schema two or three times against live data. The file-based
ledger is fine for longer than feels right.

---

## What you would do differently

**Start with shadow mode hooks for at least 10 sessions before
enforcing any of them.** The reference implementation ran several
hooks in enforce mode — `exit(2)` blocking — before shadow-mode
validation had confirmed the hooks were not over-blocking. Two hooks
produced false positives in the first 5 sessions that required
override markers (`OVERRIDE_OK: <reason>` lines in the bulletin) to
unblock work. Each false positive cost ~15-30 minutes of debugging
to confirm it was the hook, not the agent. Shadow mode would have
caught both before they interrupted live work — the hook would have
logged the would-be block, the founder would have reviewed the log,
and the false positive would have been corrected in the hook code
without any work being interrupted. The cost of shadow mode is one
extra log line per intercepted action; the cost of skipping it is
work-interrupting false positives that erode trust in the hook
system.

**Calibrate D1-D4 with a second reviewer earlier.** Solo scoring for
20+ sessions produced drift that was only visible in retrospect,
when the calibration anchor table was finally formalized at session
21. Two specific drifts: D1 scoring became more lenient over time
(early sessions scored a partial fix as 18/25; later sessions scored
the same shape as 22/25), and D2 scoring tightened (early sessions
accepted "bulletin entry per phase"; later sessions required
"bulletin entry per state change"). Both drifts were the founder
recalibrating against accumulated context — which is exactly the
calibration anchor table's job. Get a second set of eyes on at
least 5 sessions in the first month, even if the second reviewer is
not the primary operator. The disagreements above the threshold are
the calibration content. A solo reviewer cannot disagree with
themselves in real time; they only notice the drift later, by which
point the ledger is full of inconsistently-scored sessions.

---

## Sanitization confirmation

- [x] No customer or supplier names
- [x] No internal repo paths `[PROJECT_REPO]` used as placeholder
- [x] No production data values
- [x] No proprietary domain names
- [x] No trade secrets
- [x] Team identifier in the filename is not the legal company name

---

## Contact

(blank)

---

## License

By submitting this case study, you agree to publish it under the same
MIT license as the framework. Your team retains all rights to the
underlying systems, data, and decisions described. This case study is
a description, not a transfer.
