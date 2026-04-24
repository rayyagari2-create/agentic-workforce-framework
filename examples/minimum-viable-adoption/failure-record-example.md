# Failure Record — Annotated Example [v1.0]

A complete annotated FailureRecord. Every field from `schemas/v1/failure-record.schema.json` is filled in, with a note beside each field explaining how to fill it correctly and the most common mistake teams make.

The scenario is a generic `search-index-refactor`: an agent wrote a field that did not exist in the contract. The agent submitted code referencing `indexedAt` (camelCase) when the contract specifies `indexed_at` (snake_case). QA caught it. This is a `schema_violation` — the agent assumed a contract shape rather than reading the contract.

---

## Full record (YAML, easier to annotate)

```yaml
# ---------------------------------------------------------------
# FailureRecord — search-index-refactor schema violation
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
# One of the 12 enum values. For a `search-index-refactor` writing the
# wrong field name into a contract, the domain is `data_integrity` —
# the integrity of the contract was violated.
# Common mistake: choosing `api_integration` because the failure surfaced
# in an API call. Pick the domain by root cause, not surface symptom.

agentsInvolved:
  - agent-srv     # implemented the wrong field name
  - qa-agent      # caught it in verification
  - fix-agent     # wrote this record
# Order is creation order, not severity order.
# Common mistake: omitting the orchestrator. Include the orchestrator
# only if the orchestrator's manifest contributed to the failure
# (e.g. manifest did not name the contract). Here, the orchestrator
# did name the contract — agent-srv ignored it. Orchestrator not listed.

files:
  - "[PROJECT_REPO]/server/services/searchIndex.js"
  - "[PROJECT_REPO]/contracts/search_index.contract.json"
# File paths involved. Use [PROJECT_REPO] as a placeholder — never paste
# real private paths into a public-facing record.
# Common mistake: listing only the file the agent wrote to. Also list
# the contract file the agent should have read — pre-task retrieval
# matches on file paths, so the contract path must be here for the
# next session to surface this record correctly.

symptom: |
  Search index write failed with "unknown field: indexedAt".
  QA-Agent's integration test against the contract schema produced a
  schema_validation failure on the first run after agent-srv claimed BUILD complete.
# Observable symptom — what QA or a user saw. Plain English.
# Common mistake: writing the root cause here. The symptom is what was
# OBSERVED. The root cause goes in `rootCause`. Keep them separate.

rootCause: |
  agent-srv assumed camelCase field naming based on JavaScript convention
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
# P0 = customer-facing, blocks launch.
# P1 = customer-facing, can ship with workaround.
# P2 = internal-only, no customer impact, rework required.
# P3 = cosmetic.
# This is internal — caught by QA before any commit. P2.
# Common mistake: inflating to P1 because "schema violations are serious."
# Severity is about CUSTOMER IMPACT, not how bad the agent looks.

customerImpact: |
  No customer impact. Caught in QA before any commit. The session was
  delayed by approximately 30 minutes for the fix and re-QA.
# Plain English. If there is no customer impact, say so.
# Common mistake: writing "potential" customer impact for internal-only
# failures. Stick to actual.

detectionSource: qa_agent
# How the failure was detected.
# `qa_agent` is correct here — QA-Agent's verification run caught it.
# Common mistake: writing `automated_test` because QA ran a test. The
# test is the mechanism; QA-Agent is the source. If a hook had blocked
# the write, the source would be `runtime_monitoring`.

recommendedPrevention: |
  Add a pre-build check to the agent-srv instruction file: "Before writing
  any field that touches a contract, open the contract file named in
  contractsReferenced and grep for the field name. Field names that do not
  appear in the contract require an explicit contract update — they cannot
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
    location: "[PROJECT_REPO]/agents/agent-srv/instructions.md"
    description: "Adds the 'open the contract before writing' rule to the agent-srv pre-build checklist."
  - type: schema_validation
    location: "[PROJECT_REPO]/server/services/searchIndex.js"
    description: "Inserts an AJV validation step before any contract write — fails closed."
# At least ONE prevention artifact is required for fix closure with
# `hotfix-plus-prevention`. Three is good — the test catches the regression,
# the instruction update prevents the agent from making the same mistake,
# and the schema validation catches it at runtime regardless of agent.
# Common mistake: listing only the regression test. A test catches the
# specific case, not the class. Add at least one artifact at the class
# level (instruction, schema validation, or guardrail).

recurrenceCount: 1
# How many times this failure CLASS has occurred in your team's history.
# This is the first schema_violation — recurrenceCount = 1.
# Common mistake: counting recurrences of the specific symptom. The schema
# uses CLASS-level counts because the prevention rule is class-level.
# >=2 triggers auto-promotion to a benchmark task. >=3 triggers benchmark
# addition. >=5 makes systemic-refactor-required unavoidable.

repeatOfFailureIds: []
# Empty because this is the first occurrence of the class.
# Common mistake: writing null or omitting the field. Use an empty array.
# Required field per the schema (when recurrenceCount > 1) and
# defensive to include it even when 1 — explicit is better than implicit.

status: resolved
# One of: open / investigating / fix_in_progress / resolved / wont_fix.
# Resolved means the fix is in and the prevention artifacts are in place.
# Common mistake: marking `resolved` before the regression test runs green.
# A resolved record means the test passes AND the prevention artifact
# exists AND the artifact is wired up (hook installed, instruction
# committed, etc.).

rootCauseConfirmed: true
# True only if root cause has been verified — by reproducing, testing
# the prevention, or by code-level confirmation. Not just hypothesized.
# Common mistake: setting true based on the agent's narrative. A confirmed
# root cause means a human or a test has verified it.

fixTag: hotfix-plus-prevention
# Three-tag completion classification.
# `hotfix-only`: just patches the symptom. Lowest tier of fix.
# `hotfix-plus-prevention`: fixes AND adds at least one prevention artifact.
# `systemic-refactor-required`: this class has recurred enough times that
# a focused fix is no longer sufficient. Triggered by recurrenceCount >= 5.
# Common mistake: tagging hotfix-only with prevention artifacts attached.
# If you have prevention artifacts, the tag is hotfix-plus-prevention.

correlationId: "S-2026-04-12-001"
# Correlation ID linking to the session that surfaced this failure.
# Use the session_id from the trust ledger here. Makes audit trace easy.
# Common mistake: leaving null. Always link to the session — the failure
# never exists without a session that surfaced it.

commandCenterLink: null
# Reserved for the v3+ Command Center. Null in v1.0.
```

---

## Summary

This failure record is complete because:

- Every required field is filled with content, not boilerplate.
- The root cause names a concrete behavior (the agent did not read the contract), not a generic phrase.
- The prevention artifacts include at least one class-level artifact (instruction update or schema validation), not only a regression test.
- The recurrence count is class-level, and the field is present even at value 1.
- The correlation ID links to the session that surfaced the failure.
- The status `resolved` is only set after artifacts are in place and the regression test passes.

The pattern to internalize: a FailureRecord is the team's institutional memory for a specific class of mistake. The agent that comes after this one will encounter this record at pre-task retrieval and will be expected to apply the prevention. If the prevention is not concrete enough to apply, the record has not done its job.
