## About this file

- **Purpose:** Institutional memory of failures. Every agent reads
  this before touching a file; every agent writes an entry when a
  non-obvious root cause is discovered. Pre-task retrieval happens
  here — the Orchestrator greps this file by path, domain, and
  agent before every spawn.
- **Who writes:** QA-Agent writes the initial entry on detection.
  Fix-Agent writes the resolution fields on close. Any agent that
  self-reports a violation writes an entry. Human operators may
  edit to correct misclassifications.
- **Mutability:** Append new entries. Edit existing entries' `status`,
  `recurrenceCount`, and `preventionArtifacts` fields only. Never
  delete prior entries — history is the whole point.
- **How to initialize:** Start empty, with the heading structure
  below. Entries accrue as the QA loop runs.

---

# Failure Library

Entries conform to the field set in
`schemas/v1/failure-record.schema.json`. Markdown here is a
human-readable mirror of what a database-backed FailureRecord table
holds at enterprise scale.

---

## Pre-task Retrieval Protocol

The Orchestrator runs this query before every spawn:

```
1. Build the file-scope list from the task (interfacesTouched).
2. Read this file in full.
3. For each file in scope:
     grep this file for the exact path string
4. For each domain in scope:
     grep this file for the domain value
5. For the assigned agent:
     grep this file for entries in agentsInvolved
6. For every match:
     → Copy the full entry into the agent's manifest
       (field: priorFailureContext)
     → Append to bulletin:
       [YYYY-MM-DD HH:MM] [ORCHESTRATOR] FAILURE-LIB: match for [path|domain|agent]
7. If no matches:
     → Append:
       [YYYY-MM-DD HH:MM] [ORCHESTRATOR] FAILURE-LIB: no matches in scope
```

**Rule:** Agents receive matching failure entries **before** they
start. Pre-task retrieval — not post-task review. If an agent repeats
a known failure pattern that was in the library, that is an
orchestrator fault, scored on D4.

---

## Recurrence Thresholds

| `recurrenceCount` | Effect |
|---|---|
| `1` | Surface in manifest; agent reads pre-spawn |
| `≥ 2` | Manifest annotated; Orchestrator notes elevated risk (systemic flag) |
| `≥ 3` | Boardroom session triggered; spawn does not proceed without it |
| `≥ 5` | Systemic refactor is the only resolution — `fixTag: systemic-refactor-required` unavoidable |

The Orchestrator updates `recurrenceCount` by matching `failureClass`
+ `domain`. A new failure in the same class within the same domain
increments the count on the existing entry and appends a new
`repeatOfFailureIds` reference.

---

## Entry Format

Each entry is a block. Blocks are separated by `---`.

```
failureId:              FAIL-YYYY-MM-DD-NNN
timestamp:              YYYY-MM-DDTHH:MM:SSZ (ISO 8601)
domain:                 [REPLACE THIS: e.g., "auth", "payments", "api"]
agentsInvolved:         [orchestrator | qa-agent | fix-agent | executor | reviewer]
files:                  [path/to/file-1, path/to/file-2]
symptom:                [REPLACE THIS: what the user or QA observed]
rootCause:              [REPLACE THIS: why it actually broke]
failureClass:           [one of: schema_violation | state_desync | render_error |
                         api_contract_break | date_time_handling | null_reference |
                         race_condition | prompt_regression | data_loss |
                         security_vulnerability | performance_degradation |
                         ux_regression | truth_ownership | client_side_truth |
                         policy_violation | scope_violation | hook_bypass]
severity:               P0 | P1 | P2 | P3
userImpact:             [REPLACE THIS: plain-English impact]
detectionSource:        [one of: qa_agent | fix_agent | human_reviewer |
                         automated_test | runtime_monitoring | user_report]
recommendedPrevention:  [REPLACE THIS: what should prevent recurrence]
regressionTestAdded:    true | false
preventionArtifacts:
  - type:       [regression_test | schema_validation | guardrail | skill_update |
                 instruction_update | policy_update | memory_update |
                 trust_adjustment | contract_update]
    location:   [path or identifier]
    description: [what this artifact prevents]
recurrenceCount:        1
repeatOfFailureIds:     [prior FailureRecord IDs of the same class, or empty]
status:                 open | investigating | fix_in_progress | resolved | wont_fix
rootCauseConfirmed:     true | false
fixTag:                 hotfix-only | hotfix-plus-prevention | systemic-refactor-required
correlationId:          [UUID or null]
```

---

## Worked Examples

### Example 1 — Resolved entry

```
failureId:              FAIL-2026-04-22-001
timestamp:              2026-04-22T14:12:03Z
domain:                 auth
agentsInvolved:         [executor, qa-agent]
files:                  [src/auth/validate.ts]
symptom:                Login fails for users with email addresses longer than 254 characters.
rootCause:              Input validator used RFC 5321 local-part limit (64 chars) as total length cap, but RFC 5321 allows up to 254 chars total.
failureClass:           api_contract_break
severity:               P1
userImpact:             Roughly 0.3% of users (enterprise email addresses) could not sign in.
detectionSource:        qa_agent
recommendedPrevention:  Replace hand-rolled validator with the email-validator package; add a regression test at the 254-char boundary.
regressionTestAdded:    true
preventionArtifacts:
  - type:       regression_test
    location:   tests/auth/validate.test.ts::email-length-boundary
    description: Asserts 254-char emails are accepted, 255-char rejected.
  - type:       instruction_update
    location:   governance/project-conventions.md::voice-and-style
    description: Notes that input validators must cite the RFC section they implement.
recurrenceCount:        1
repeatOfFailureIds:     []
status:                 resolved
rootCauseConfirmed:     true
fixTag:                 hotfix-plus-prevention
correlationId:          01HJ8M-auth-email-len
```

### Example 2 — Open entry

```
failureId:              FAIL-2026-04-24-002
timestamp:              2026-04-24T09:41:18Z
domain:                 api
agentsInvolved:         [executor]
files:                  [src/api/orders.ts, src/db/orders.ts]
symptom:                Pagination cursor becomes invalid when an order is deleted between page fetches — the next page skips results.
rootCause:              Under investigation. Hypothesis: cursor encodes `created_at` but ties are not broken by `id`, so deletions ripple.
failureClass:           state_desync
severity:               P1
userImpact:             Users browsing long order histories may miss recent orders after a deletion.
detectionSource:        qa_agent
recommendedPrevention:  [REPLACE THIS: TBD after root cause confirmed]
regressionTestAdded:    false
preventionArtifacts:    []
recurrenceCount:        1
repeatOfFailureIds:     []
status:                 investigating
rootCauseConfirmed:     false
fixTag:                 hotfix-only
correlationId:          01HJ8N-orders-pagination-cursor
```

---

## Fix Closure Rule

A Fix-Agent cannot close a failure record (`status: resolved`) without
at least one entry in `preventionArtifacts`. A resolved record with an
empty `preventionArtifacts` array is a D4=0 (repeat-pattern) hit —
prevention is mandatory for closure, not optional.

The three valid `fixTag` values capture intent:

- `hotfix-only` — the code change fixes the symptom; no prevention
  added. Only valid for `severity: P3` with `recurrenceCount: 1`.
- `hotfix-plus-prevention` — the normal case. Symptom fixed and at
  least one regression test, schema validation, or instruction update
  added.
- `systemic-refactor-required` — the class of failure cannot be
  prevented by a point fix. Use when `recurrenceCount ≥ 5` or when
  the root cause lives in architecture, not implementation.

---

## Entries

<!-- New entries appended below. Keep newest at top within each section
     (status: open, investigating, fix_in_progress), then resolved. -->

### Open

_None._

### Investigating

_None._

### Fix in progress

_None._

### Resolved

_None._

### Won't fix

_None._

---

## Cross-references

- `schemas/v1/failure-record.schema.json` — canonical field definitions
- `docs/concepts/failure-memory.md` — the concept behind this file
- `governance/build-status.md` — bug rows link to failure IDs on close
- `agents/orchestrator.md` → `Pre-Task Retrieval` — the query above is
  also referenced there
