# Failure Record Annotated Examples [v1.0]

Two complete annotated FailureRecords. Every required field from `schemas/v1/failure-record.schema.json` is filled. Each field has a note beside it explaining the correct way to fill it and the most common mistake teams make.

- **Example 1 `search-index-refactor` schema violation.** Low severity. First occurrence of the class. P2, recurrenceCount=1, fixTag `hotfix-plus-prevention`.
- **Example 2 `auth-flow date drift` recurring time-handling defect.** High severity. Third occurrence of the class. P0, recurrenceCount=3, fixTag `systemic-refactor-required`.

The pair shows what a healthy first-occurrence record looks like and what an escalating recurrence record looks like different severities, different fix tags, different prevention strategies.

---

## Example 1 Low severity (P2), first occurrence

The scenario: an executing agent submitted code referencing `indexedAt` (camelCase) when the contract specifies `indexed_at` (snake_case). QA caught it before any commit. This is a `schema_violation` the agent assumed a contract shape rather than reading the contract file.

```yaml
# ---------------------------------------------------------------
# FailureRecord search-index-refactor schema violation
# ---------------------------------------------------------------

failureId: FAIL-2026-04-12-001
# Format: FAIL-YYYY-MM-DD-NNN. NNN is ordinal within the day.
# Common mistake: using ULID here. The schema separates the human-readable
# failureId from the database row primary key. NNN starts at 001 each day.

timestamp: "2026-04-12T14:32:18Z"
# ISO 8601 with timezone. Use UTC ("Z") for the file-based ledger to avoid
# timezone confusion when multiple humans contribute. Common mistake:
# writing local time without offset.

domain: data_integrity
# Domain classification used by pre-task retrieval. For a refactor that
# wrote the wrong field name into a contract, the domain is `data_integrity` —
# the integrity of the contract was violated.
# Common mistake: choosing `api_integration` because the failure surfaced
# in an API call. Pick the domain by root cause, not surface symptom.

agentsInvolved:
  - executor      # implemented the wrong field name
  - qa-agent      # caught it in verification
  - fix-agent     # wrote this record
# Order is creation order, not severity order. The generic schema uses
# `executor` for the role that did the work adapt to your concrete agent
# id (e.g. `agent-srv`) only if you have a project-specific enum extension.
# Common mistake: omitting the orchestrator. Include the orchestrator
# only if the orchestrator's manifest contributed to the failure
# (e.g. manifest did not name the contract). Here, the orchestrator
# did name the contract the executor ignored it. Orchestrator not listed.

files:
  - "[PROJECT_REPO]/server/services/searchIndex.js"
  - "[PROJECT_REPO]/contracts/search_index.contract.json"
# File paths involved. Use [PROJECT_REPO] as a placeholder never paste
# real private paths into a public-facing record.
# Common mistake: listing only the file the agent wrote to. Also list
# the contract file the agent should have read pre-task retrieval
# matches on file paths, so the contract path must be here for the
# next session to surface this record correctly.

symptom: |
  Search index write failed with "unknown field: indexedAt".
  QA-Agent's integration test against the contract schema produced a
  schema_validation failure on the first run after the executor claimed
  BUILD complete.
# Observable symptom what QA or a user saw. Plain English.
# Common mistake: writing the root cause here. The symptom is what was
# OBSERVED. The root cause goes in `rootCause`. Keep them separate.

rootCause: |
  The executor assumed camelCase field naming based on JavaScript convention
  rather than reading contracts/search_index.contract.json. The contract
  specifies snake_case (`indexed_at`). The manifest named the contract in
  contractsReferenced, but the agent did not open the contract before
  writing the implementation.
# Confirmed root cause after investigation. Should answer "why did this
# happen?" not "what happened?".
# Common mistake: stopping at "agent wrote the wrong field name." That is
# the proximate cause. The root cause is "agent did not read the contract
# before writing." That is what prevention has to address.

failureClass: schema_violation
# One of the 17 enum values. `schema_violation` is the right class because
# the contract schema was violated.
# Common mistake: choosing `api_contract_break`. That class is for
# breaking an external API consumer. Internal schema/contract violations
# are `schema_violation`.

severity: P2
# P0 = user-facing, blocks release.
# P1 = user-facing, can ship with workaround.
# P2 = internal-only, no user impact, rework required.
# P3 = cosmetic.
# This is internal caught by QA before any commit. P2.
# Common mistake: inflating to P1 because "schema violations are serious."
# Severity is about USER IMPACT, not how bad the agent looks.

userImpact: |
  No user impact. Caught in QA before any commit. The session was
  delayed by approximately 30 minutes for the fix and re-QA.
# Plain English. If there is no user impact, say so.
# Common mistake: writing "potential" user impact for internal-only
# failures. Stick to actual.

detectionSource: qa_agent
# How the failure was detected.
# `qa_agent` is correct here QA-Agent's verification run caught it.
# Common mistake: writing `automated_test` because QA ran a test. The
# test is the mechanism; QA-Agent is the source. If a hook had blocked
# the write, the source would be `runtime_monitoring`.

recommendedPrevention: |
  Add a pre-build check to the executor instruction file: "Before writing
  any field that touches a contract, open the contract file named in
  contractsReferenced and grep for the field name. Field names that do not
  appear in the contract require an explicit contract update they cannot
  be added implicitly."
# What should be done to prevent recurrence.
# Common mistake: writing "be more careful" or "review contracts." That is
# advice, not prevention. Prevention has to be a concrete artifact or
# instruction change. If the recommendation cannot be checked by another
# agent or a hook, it is not prevention.

regressionTestAdded: true
# Boolean. True if a regression test was added as part of the fix.
# A failed schema_validation case in the contract test suite. Without a
# regression test, the failure record cannot close as `hotfix-plus-prevention`.

preventionArtifacts:
  - type: regression_test
    location: "[PROJECT_REPO]/test/contract/search-index-snake-case.test.js"
    description: "Asserts that searchIndex writes use snake_case field names matching the contract."
  - type: instruction_update
    location: "[PROJECT_REPO]/agents/executor/instructions.md"
    description: "Adds the 'open the contract before writing' rule to the executor pre-build checklist."
  - type: schema_validation
    location: "[PROJECT_REPO]/server/services/searchIndex.js"
    description: "Inserts an AJV validation step before any contract write fails closed."
# At least ONE prevention artifact is required for fix closure with
# `hotfix-plus-prevention`. Three is good the test catches the regression,
# the instruction update prevents the agent from making the same mistake,
# and the schema validation catches it at runtime regardless of agent.
# Common mistake: listing only the regression test. A test catches the
# specific case, not the class. Add at least one artifact at the class
# level (instruction, schema validation, or guardrail).

recurrenceCount: 1
# How many times this failure CLASS has occurred in your team's history.
# This is the first schema_violation recurrenceCount = 1.
# Common mistake: counting recurrences of the specific symptom. The schema
# uses CLASS-level counts because the prevention rule is class-level.
# >=2 triggers auto-promotion to a benchmark task. >=3 triggers benchmark
# addition. >=5 makes systemic-refactor-required unavoidable.

repeatOfFailureIds: []
# Empty because this is the first occurrence of the class.
# Common mistake: writing null or omitting the field. Use an empty array.
# Defensive to include it even when 1 explicit is better than implicit.

status: resolved
# One of: open / investigating / fix_in_progress / resolved / wont_fix.
# Resolved means the fix is in and the prevention artifacts are in place.
# Common mistake: marking `resolved` before the regression test runs green.
# A resolved record means the test passes AND the prevention artifact
# exists AND the artifact is wired up (hook installed, instruction
# committed, etc.).

rootCauseConfirmed: true
# True only if root cause has been verified by reproducing, testing
# the prevention, or by code-level confirmation. Not just hypothesized.
# Common mistake: setting true based on the agent's narrative. A confirmed
# root cause means a human or a test has verified it.

fixTag: hotfix-plus-prevention
# Three-tag completion classification.
# `hotfix-only`: just patches the symptom. Lowest tier of fix.
# `hotfix-plus-prevention`: fixes AND adds at least one prevention artifact.
# `systemic-refactor-required`: this class has recurred enough times that
# a focused fix is no longer sufficient. Triggered by recurrenceCount >= 5,
# but may be invoked earlier by reviewer judgment.
# Common mistake: tagging hotfix-only with prevention artifacts attached.
# If you have prevention artifacts, the tag is hotfix-plus-prevention.

correlationId: "S-2026-04-12-001"
# Correlation ID linking to the session that surfaced this failure.
# Use the session_id from the trust ledger here. Makes audit trace easy.
# Common mistake: leaving null. Always link to the session the failure
# never exists without a session that surfaced it.
```

### Why this record is complete

- Every required field is filled with content, not boilerplate.
- The root cause names a concrete behavior (the agent did not read the contract), not a generic phrase.
- The prevention artifacts include at least one class-level artifact (instruction update + schema validation), not only a regression test.
- The recurrence count is class-level, and the field is present even at value 1.
- The correlation ID links to the session that surfaced the failure.
- The status `resolved` is only set after artifacts are in place and the regression test passes.

---

## Example 2 High severity (P0), recurrence > 1

The scenario: a date-handling defect where authentication-flow code computes session expiry using the wrong timezone offset. The fix in two prior occurrences was a local hotfix and an instruction update neither held. On the third occurrence the defect surfaced in production: users in non-UTC timezones were silently logged out mid-session. P0. The class has recurred enough that a focused fix is no longer credible the team escalates to `systemic-refactor-required`.

```yaml
# ---------------------------------------------------------------
# FailureRecord auth-flow date drift, third occurrence
# ---------------------------------------------------------------

failureId: FAIL-2026-04-22-001
# Format unchanged. Different date, ordinal 001 of the day.

timestamp: "2026-04-22T09:14:02Z"
# UTC. The session that surfaced this defect ran early-morning Pacific.

domain: auth_security
# Domain classification. The defect is in authentication-flow code and
# affects session validity, so the domain is `auth_security`.
# Common mistake: classifying as `data_integrity` because dates are
# "data". The domain reflects the system the defect lives in, not the
# data type involved. Auth-flow defects are `auth_security` regardless
# of whether the proximate cause is a date bug.

agentsInvolved:
  - executor      # implemented the latest auth-flow change that re-introduced the defect
  - reviewer      # security-check reviewer that missed the regression
  - qa-agent      # caught the symptom on production smoke tests
  - fix-agent     # wrote this record
# Note `reviewer` is included here the security-check reviewer is part
# of the failure trail because it failed to flag a regression in a known
# defect class. Including the reviewer in agentsInvolved is what triggers
# the recurrence-of-pattern signal on the reviewer in the next session.

files:
  - "[PROJECT_REPO]/server/auth/sessionExpiry.js"
  - "[PROJECT_REPO]/server/auth/middleware.js"
  - "[PROJECT_REPO]/lib/time/zone.js"
  - "[PROJECT_REPO]/test/auth/session-expiry.test.js"
# Four file paths. The session-expiry test file is included because the
# regression test for the prior occurrence existed and did not catch this
# regression. That test will be hardened as part of the fix.
# Common mistake: only listing the file where the bug was introduced.
# Pre-task retrieval is path-based listing the test file makes future
# work in this area surface this record.

symptom: |
  Production users in timezones west of UTC reported being logged out
  approximately 5-7 hours into a session. The session expiry timestamp
  was being computed in local server time and compared against UTC client
  timestamps in the auth middleware. Smoke tests caught the regression
  20 minutes after deploy; rollback completed in 8 minutes.
# Observable symptom. User-facing and clearly described.
# Note "computed in local server time and compared against UTC" that is
# the symptom (what was observed), not the root cause (which is broader).

rootCause: |
  The `sessionExpiry.js` module re-introduced a `new Date()` call in the
  expiry-computation path during a refactor that consolidated three
  expiry helpers. The reviewer treated the refactor as a no-op
  consolidation rather than as work touching a known-defect class
  (`date_time_handling`). The pre-task retrieval bundle included
  FAIL-2026-03-04-002 and FAIL-2026-03-29-001 both prior occurrences
  of this same pattern but the reviewer's verdict did not cite either.
  The regression test `session-expiry.test.js` was running with a fixed
  UTC clock and did not exercise the timezone-offset path.
# Names two failures: the executor re-introduced the defect during a
# refactor, AND the reviewer missed the regression despite explicit
# pattern context being available. Both are root causes the recurrence
# is what makes this severity P0.

failureClass: date_time_handling
# Same class as the two prior occurrences. The class name is what links
# the recurrence chain together.

severity: P0
# P0: user-facing, blocks release. Production users were silently logged
# out. Trust impact on the product is significant. P0 is correct.
# Common mistake: rating P1 because the rollback was fast. Severity is
# about IMPACT, not response time. A 28-minute production exposure
# affecting auth is P0.

userImpact: |
  Users in non-UTC timezones (estimated ~62% of active users at the time
  of deploy) were logged out unexpectedly during the 28-minute exposure
  window. No data loss; users could log back in. Approximately 1,400
  unexpected re-auths during the window per platform telemetry. Two
  in-flight bookings were interrupted. Customer support absorbed 19
  inbound tickets within 2 hours.
# Quantified where possible. "Approximately" + a unit + a window is
# better than "many users affected."
# Common mistake: writing "no data loss, low impact." Even when the data
# survives, an auth disruption is a real user impact and a real trust
# cost. Quantify the disruption.

detectionSource: runtime_monitoring
# `runtime_monitoring` is correct production smoke tests caught it
# post-deploy. The QA-Agent confirmed and wrote the verdict, but the
# detection source is the production monitor, not QA.
# Common mistake: writing `qa_agent` because QA-Agent wrote the verdict.
# QA confirmed; monitoring detected. They are different.

recommendedPrevention: |
  Three prevention artifacts, structural rather than local:
  1. Convert `sessionExpiry.js` to use the shared `lib/time/zone.js`
     helper exclusively. Forbid `new Date()` in any auth/* path via a
     lint rule.
  2. Harden `session-expiry.test.js`: parametrize across UTC, UTC-8,
     UTC+9, and UTC-12. Pin the system clock for each test.
  3. Add a pre-spawn guard for the security-check reviewer: any session
     whose pre-task retrieval surfaces a `date_time_handling` pattern
     for the auth domain must produce an explicit verdict citing the
     prior pattern IDs. The reviewer cannot pass a date-touching auth
     change without naming the prior failures.
  Items 1 and 2 prevent the bug; item 3 prevents the reviewer-side
  miss that allowed the regression through.
# Three concrete artifacts addressing both the executor and reviewer
# failure paths. Lint rules and parametrized tests are the right level —
# they catch the class, not just the instance.

regressionTestAdded: true
# Boolean. True. The hardened parametrized test in artifact 2 above is
# the regression test.

preventionArtifacts:
  - type: regression_test
    location: "[PROJECT_REPO]/test/auth/session-expiry.test.js"
    description: "Parametrizes across 4 timezones with a pinned clock. Asserts that expiry computation uses UTC throughout."
  - type: guardrail
    location: "[PROJECT_REPO]/eslint.auth.js"
    description: "Custom lint rule: any `new Date()` call inside server/auth/* fails CI. Forces use of lib/time/zone.js helper."
  - type: instruction_update
    location: "[PROJECT_REPO]/agents/reviewer/instructions.md"
    description: "Reviewer must cite prior failure IDs by class when pre-task retrieval surfaces a matching class for the session domain. Verdicts that do not cite are auto-failed."
  - type: contract_update
    location: "[PROJECT_REPO]/contracts/auth/session.contract.json"
    description: "Session contract now specifies expiry as a UTC ISO-8601 string with required `Z` suffix. Schema validation rejects offsets."
# Four artifacts. Two structural (lint rule, contract). Two procedural
# (test parametrization, reviewer instruction). The fix is wider than
# the bug because the bug has now happened three times the prevention
# has to be wider than "fix this instance."

recurrenceCount: 3
# This is the third occurrence of the `date_time_handling` class for
# this team. recurrenceCount = 3.
# At >= 3, the framework rules trigger: this class becomes a benchmark
# task in onboarding. The reviewer instruction for any session in the
# `auth_security` domain must list this class explicitly.

repeatOfFailureIds:
  - FAIL-2026-03-04-002
  - FAIL-2026-03-29-001
# Two prior occurrences. Listed in order of occurrence.
# Common mistake: only listing the most recent prior. Always list all
# prior occurrences of the class the recurrence chain is what
# justifies the systemic-refactor-required tag.

status: resolved
# Resolved after all four prevention artifacts landed and the parametrized
# test was confirmed green in CI. The lint rule was confirmed firing on
# a deliberate test commit before close.

rootCauseConfirmed: true
# Confirmed by reproducing the original failure (deployed to a staging
# environment with a non-UTC system clock, observed the exact symptom)
# and then verifying the fix in the same environment.

fixTag: systemic-refactor-required
# Three-tag completion classification.
# `systemic-refactor-required` is correct because:
#   - recurrenceCount = 3 (the framework's >=5 rule is the floor for
#     unavoidability, but reviewer judgment may invoke it earlier)
#   - Two prior fixes did not hold; a localized hotfix-plus-prevention
#     would be the third local fix and would not address the class
#   - The prevention required spans 4 files across 3 layers (lint,
#     test, contract, instruction). That breadth is what the
#     `systemic-refactor-required` tag exists to record.
# Common mistake: tagging `hotfix-plus-prevention` because there are
# prevention artifacts. The tag is about the SCOPE of the fix, not
# whether prevention exists. A class that has recurred 3 times needs
# the systemic tag so future review can see the escalation.

correlationId: "S-2026-04-22-001"
# Session that surfaced the third occurrence.
```

### Why this record is complete

- Names two failure paths (executor re-introduction + reviewer miss), not just one.
- Quantifies user impact in a window, with concrete metrics.
- Lists all prior occurrences of the class the recurrence chain is auditable.
- Prevention is broader than the bug: lint rule, contract, parametrized tests, reviewer instruction. Structural, not just procedural.
- `systemic-refactor-required` is justified by recurrence count AND fix scope, not just one of those.
- Confirmation of root cause was reproducible verified in a staging environment matching production conditions, not just hypothesized.

### What changed between Example 1 and Example 2

| | Example 1 | Example 2 |
|---|---|---|
| Severity | P2 | P0 |
| recurrenceCount | 1 | 3 |
| repeatOfFailureIds | `[]` | 2 prior IDs |
| Number of prevention artifacts | 3 | 4 |
| Artifact scope | All within one file area | Lint, test, contract, instruction cross-cutting |
| fixTag | `hotfix-plus-prevention` | `systemic-refactor-required` |
| detectionSource | `qa_agent` | `runtime_monitoring` |
| Reviewer in agentsInvolved? | No | Yes the reviewer-side miss is part of the trail |

Both records share the same skeleton. The escalation is visible in the field values, not in any structural difference. That is the point: a single schema captures the full severity range. The recurrence count, the fix tag, and the prevention scope are what differ.

---

## Pattern to internalize

A FailureRecord is the team's institutional memory for a specific class of mistake. The agent that comes after this one will encounter this record at pre-task retrieval and will be expected to apply the prevention. If the prevention is not concrete enough to apply, the record has not done its job.

A record at recurrenceCount=1 documents a discovery. A record at recurrenceCount=3 documents a system-level failure to learn and the prevention has to scale accordingly. The fix tag (`hotfix-plus-prevention` vs `systemic-refactor-required`) is how the framework signals that escalation in the audit trail.
