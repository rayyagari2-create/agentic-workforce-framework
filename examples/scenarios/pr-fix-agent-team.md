# End-to-End Scenario: Checkout Validation Bug

**A complete walkthrough of one task through the framework. Every
artifact shown.**

> Format note: human-readable IDs (`TASK-2026-04-25-001`,
> `FAIL-2026-04-25-001`, `QA-2026-04-25-001`) are used throughout
> the walkthrough for legibility. The schemas (`AgentTaskManifest`,
> `QAVerdict`) require ULIDs in production; treat the readable IDs
> as display labels backed by the ULIDs your implementation
> generates.

---

## Scenario

A QA Agent running acceptance criteria on a checkout flow discovers
that input validation is not firing correctly on the payment form.
The defect is in a single file. The Orchestrator classifies it as
MEDIUM risk and routes it to Fix Agent.

This walkthrough shows every step, every artifact and every
governance event from discovery to session close. Nine steps,
seven artifact types, one repeated failure pattern caught at
recurrenceCount=2.

---

## Step 1 — Orchestrator receives the task

The founder reports the defect to the Orchestrator.

**Bulletin entries:**

```
[2026-04-25 10:14] [ORCHESTRATOR] ACTIVATED: checkout-validation-bug
[2026-04-25 10:14] [SESSION] TASK: Fix input validation on payment form
```

The Orchestrator runs the pre-spawn protocol:

- **Step 1 (risk classification + failure retrieval):** Reads failure
  library. Finds one prior entry matching `domain=ui_rendering` and
  `files=src/components/CheckoutForm.js`.
- **Step 2 (risk classification):** Single file, no auth or payment
  write path affected, no schema change. `riskLevel = MEDIUM`.
- **Step 3 (gate triggers):** No prior `recurrenceCount >= 2` for
  this pattern (the prior record is the first occurrence). No
  Boardroom required. MEDIUM at STANDARD-tier executing agent fires
  default HITL — but for this team's policy, MEDIUM HITL is reviewer
  notification rather than blocking approval. Proceeds to manifest.

**Failure library check bulletin entry:**

```
[2026-04-25 10:14] [ORCHESTRATOR] FAILURE-LIB: entry found for
  src/components/CheckoutForm.js — prior validation gap, FAIL-2026-04-10-002,
  session 2026-04-10
```

The orchestrator has now satisfied the failure-retrieval requirement
for D4 evidence later. The bulletin entry is the durable proof that
the check was performed; absence of this line in the bulletin is the
signal that the retrieval step was skipped.

---

## Step 2 — Orchestrator writes the AgentTaskManifest

The manifest is the contract. It conforms to
[`schemas/v1/agent-task-manifest.schema.json`](../../schemas/v1/agent-task-manifest.schema.json):

> Note: The following example uses human-readable IDs for
> legibility. Production records must use ULIDs to conform
> to the schema. Example ULID: 01HW2YA6NXBZ4S0K3K9C5R8RQ7

```json
{
  "taskId": "TASK-2026-04-25-001",
  "taskType": "bug",
  "taskDescription": "Fix input validation on the payment form: onSubmit handler is bound but required-field validation does not fire before submit completes.",
  "domains": ["frontend", "checkout"],
  "riskLevel": "medium",
  "interfacesTouched": ["src/components/CheckoutForm.js"],
  "contractsReferenced": null,
  "verificationRequired": ["manual_verification", "qa_agent_review"],
  "blockingDependencies": null,
  "priorFailureContext": [
    {
      "failureId": "FAIL-2026-04-10-002",
      "preventionCheck": "Confirm onSubmit is bound to the <form> element, not to an inner <button>. Verify via grep before declaring the fix complete."
    }
  ],
  "evalPlan": "QA-Agent runs three acceptance criteria: (1) onSubmit handler fires on form submission; (2) required-field validation surfaces an inline error before any network call when fields are empty; (3) the existing happy-path checkout still completes when fields are populated.",
  "assignedAgent": "fix-agent",
  "createdAt": "2026-04-25T10:15:00Z",
  "completedAt": null,
  "result": null,
  "correlationId": "session-2026-04-25"
}
```

**Bulletin entry:**

```
[2026-04-25 10:15] [ORCHESTRATOR] MANIFEST: TASK-2026-04-25-001
  riskLevel=medium domains=2 interfacesTouched=1
```

---

### Manifest and Sidecar Convention

The reference implementation uses a single manifest sidecar file:

`docs/manifests/<taskId>.json`

This file acts as both the task manifest and the hook-readable
sidecar. The hook extracts `taskId` from the Agent description,
reads this file, verifies `session_id` and freshness, then
validates the spawn.

For stricter enterprise deployments, teams may split this into
two physical files:

- `docs/manifests/<taskId>.manifest.json` — full task contract
- `docs/manifests/<taskId>.sidecar.json` — minimal hook-readable
  spawn authorization record

The split-file model is optional. The default reference
implementation stays single-file to keep adoption simple and
avoid unnecessary orchestration complexity.

In this scenario, we show the stricter enterprise split-file
pattern for clarity. The minimal reference implementation uses
`docs/manifests/<taskId>.json`.

## Step 3 — Orchestrator writes the manifest sidecar

The manifest sidecar is a separate artifact from the AgentTaskManifest
itself. It is the runtime payload the PreToolUse hook reads to
validate a spawn. The Orchestrator writes the sidecar JSON to disk
before calling the Agent tool. The hook resolves the path from the
`[MANIFEST:TASK-...]` token in the spawn description.

> Note: The following example uses human-readable IDs for
> legibility. Production records must use ULIDs to conform
> to the schema. Example ULID: 01HW2YA6NXBZ4S0K3K9C5R8RQ7

```json
{
  "taskId": "TASK-2026-04-25-001",
  "session_id": "abc-123-session",
  "runtime_subagent_type": "general-purpose",
  "agent_role": "fix-agent",
  "riskLevel": "medium",
  "domains": ["frontend", "checkout"],
  "riskClass": "frontend-ui",
  "hitlApproved": false,
  "issuedAt": "2026-04-25T10:15:30Z",
  "promptHash": "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
  "tool_use_id": null
}
```

> `hitlApproved=false` is correct for MEDIUM risk. HITL is only
> required at HIGH/CRITICAL or for agents at RESTRICTED tier.
> `tool_use_id` is null at sidecar-write time; the PostToolUse hook
> populates it when the spawn returns.

**Bulletin entry:**

```
[2026-04-25 10:15] [ORCHESTRATOR] SIDECAR: docs/manifests/TASK-2026-04-25-001.json
  written
```

---

## Step 4 — PreToolUse hook validates the spawn

The Orchestrator calls the Agent tool with
`description = "Fix CheckoutForm validation [MANIFEST:TASK-2026-04-25-001]"`
and `subagent_type = "fix-agent"`. The PreToolUse hook fires and runs
its 15-step validation.

Key steps for this scenario:

```
Step  5: [MANIFEST:TASK-2026-04-25-001] token found in description.
Step  7: Resolves docs/manifests/TASK-2026-04-25-001.json
Step  8: File found and readable.
Step  9: JSON parses correctly.
Step 10: AJV schema validation passes.
Step 11: subagent_type 'fix-agent' is in allowed roster.
Step 12: riskLevel=medium, hitlApproved not required. Passes.
Step 13: issuedAt within 30-minute TTL. Passes.
Step 14: [MANIFEST:TASK-2026-04-25-001] stripped from description.
Step 15: audit_log entry written. exit(0).
```

**Audit log entry written by the PostToolUse hook:**

```json
{
  "id": "uuid-audit-001",
  "session_id": "abc-123-session",
  "event_type": "agent_spawn_authorized",
  "subject_agent": "fix-agent",
  "task_id": "TASK-2026-04-25-001",
  "decision": "allow",
  "matched_rule": "allow-valid-manifest",
  "hook_mode": "enforce",
  "created_at": "2026-04-25T10:15:31Z"
}
```

The hook chain has now produced two pieces of evidence: the in-band
sidecar that authorized the spawn, and the out-of-band audit log
entry that records the decision. Either alone is insufficient; the
pair is the spawn's accountability record.

---

## Step 5 — Fix Agent executes

Fix Agent runs its startup sequence: reads its instruction file,
reads the manifest's `priorFailureContext`, pulls the referenced
FailureRecord, locks the file, makes the repair, and verifies
in-place before declaring done.

**Bulletin entries:**

```
[2026-04-25 10:16] [FIX-AGENT] ACTIVATED: src/components/CheckoutForm.js
  — input validation not firing
[2026-04-25 10:16] [FIX-AGENT] READING: failure-library — found prior entry
  FAIL-2026-04-10-002 (onSubmit binding to inner button, not form)
[2026-04-25 10:16] [FIX-AGENT] LOCKED: src/components/CheckoutForm.js
[2026-04-25 10:17] [FIX-AGENT] WORKING: step 1 of 3 — reading file
[2026-04-25 10:18] [FIX-AGENT] WORKING: step 2 of 3 — applying fix
  (rebind onSubmit from <button onClick> to <form onSubmit>)
[2026-04-25 10:19] [FIX-AGENT] WORKING: step 3 of 3 — verifying fix
[2026-04-25 10:20] [FIX-AGENT] VERIFYING: empty-form submit surfaces
  inline validation error; no network call observed
[2026-04-25 10:20] [FIX-AGENT] VERIFYING: up-chain — CheckoutPage renders
  with the updated CheckoutForm; no prop break
[2026-04-25 10:21] [FIX-AGENT] VERIFYING: data rendering check
  — no NaN, no undefined in form state at submit
[2026-04-25 10:21] [FIX-AGENT] TAG: hotfix-plus-prevention — prior
  failure class, prevention artifact required
[2026-04-25 10:21] [FIX-AGENT] UNLOCKED: src/components/CheckoutForm.js
```

The bulletin captures every phase transition (ACTIVATED → READING →
LOCKED → WORKING ×3 → VERIFYING ×3 → TAG → UNLOCKED). This is the
trail D2 will be scored against — silence between activations would
be a D2 deduction even on a correct fix.

---

## Step 6 — Fix Agent writes the FailureRecord

The fix is complete in code; the framework requires the FailureRecord
before close. It conforms to
[`schemas/v1/failure-record.schema.json`](../../schemas/v1/failure-record.schema.json):

> Note: The following example uses human-readable IDs for
> legibility. Production records must use ULIDs to conform
> to the schema. Example ULID: 01HW2YA6NXBZ4S0K3K9C5R8RQ7

```json
{
  "failureId": "FAIL-2026-04-25-001",
  "timestamp": "2026-04-25T10:22:00Z",
  "domain": "ui_rendering",
  "agentsInvolved": ["fix-agent", "qa-agent"],
  "files": ["src/components/CheckoutForm.js"],
  "symptom": "Input validation on payment form not firing on submit. User can submit the form without required fields populated.",
  "rootCause": "onSubmit handler bound to the inner submit <button>'s onClick instead of the parent <form>'s onSubmit. React's synthetic submit event was not propagating to the form's native submit lifecycle, so the form's required-field validation never ran.",
  "failureClass": "render_error",
  "severity": "P1",
  "userImpact": "Users could submit the payment form without required-field validation firing. Order would proceed to the payment processor with empty fields and return a generic API error rather than an inline form error, producing a confusing failure for the user.",
  "detectionSource": "qa_agent",
  "recommendedPrevention": "Bind onSubmit to the <form>, not to <button onClick>. Add a contract test asserting that submitting an empty form surfaces the validation error before any network call is made.",
  "regressionTestAdded": true,
  "preventionArtifacts": [
    {
      "type": "regression_test",
      "location": "tests/checkout-validation.test.js",
      "description": "Submit empty CheckoutForm; assert inline validation error surfaces and no network request is issued."
    },
    {
      "type": "memory_update",
      "location": "docs/failure-library.md",
      "description": "Promote render_error/onSubmit-binding entry to recurrenceCount=2; flag for systemic review at recurrenceCount>=3."
    }
  ],
  "recurrenceCount": 2,
  "repeatOfFailureIds": ["FAIL-2026-04-10-002"],
  "status": "resolved",
  "rootCauseConfirmed": true,
  "fixTag": "hotfix-plus-prevention",
  "correlationId": "session-2026-04-25"
}
```

**Bulletin entries:**

```
[2026-04-25 10:22] [FIX-AGENT] FAILURE RECORD: written — FAIL-2026-04-25-001
[2026-04-25 10:22] [FIX-AGENT] PREVENTION: regression_test —
  tests/checkout-validation.test.js
[2026-04-25 10:22] [FIX-AGENT] PREVENTION: memory_update —
  docs/failure-library.md
[2026-04-25 10:23] [FIX-AGENT] ESCALATING: render_error recurrence 2
  — routing to Orchestrator for systemic-review watch
[2026-04-25 10:23] [FIX-AGENT] DONE: handoff to QA-Agent
```

---

## Step 7 — QA Agent verifies

The Orchestrator spawns QA-Agent with a manifest derived from the
parent task. QA-Agent walks the three acceptance criteria from
`evalPlan` and produces a verdict. It conforms to
[`schemas/v1/qa-verdict.schema.json`](../../schemas/v1/qa-verdict.schema.json):

> Note: The following example uses human-readable IDs for
> legibility. Production records must use ULIDs to conform
> to the schema. Example ULID: 01HW2YA6NXBZ4S0K3K9C5R8RQ7

```json
{
  "verdictId": "QA-2026-04-25-001",
  "taskId": "TASK-2026-04-25-001",
  "qaDecision": "pass",
  "defectClass": null,
  "novelty": "repeat",
  "repeatReferenceIds": ["FAIL-2026-04-10-002"],
  "findings": [
    {
      "category": "ac_verified",
      "description": "AC-1: onSubmit handler fires on form submission. Verified via instrumentation log in dev build; submit event reaches the form's onSubmit handler before any network call is initiated.",
      "severity": "info",
      "file": "src/components/CheckoutForm.js",
      "lineRange": "42-58"
    },
    {
      "category": "ac_verified",
      "description": "AC-2: required-field validation surfaces an inline error before any network call when fields are empty. Verified by submitting empty form, observing inline error, network panel shows zero requests.",
      "severity": "info",
      "file": "src/components/CheckoutForm.js",
      "lineRange": "60-92"
    },
    {
      "category": "ac_verified",
      "description": "AC-3: existing happy-path checkout still completes when all fields are populated. Verified by running the existing checkout-happy-path integration test; pass.",
      "severity": "info",
      "file": "tests/checkout-validation.test.js",
      "lineRange": null
    }
  ],
  "recommendedPreventionArtifact": "regression_test:tests/checkout-validation.test.js",
  "missingEval": null,
  "recommendedEscalation": "escalated_review",
  "trustScoreDelta": {
    "agentId": "fix-agent",
    "dimension": "D4",
    "direction": "decrement",
    "reason": "recurrenceCount hit 2 for the render_error/onSubmit-binding pattern. Partial D4 deduction; full prevention artifact filed and pattern flagged for systemic review."
  },
  "timestamp": "2026-04-25T10:31:00Z",
  "correlationId": "session-2026-04-25"
}
```

**Bulletin entries:**

```
[2026-04-25 10:25] [ORCHESTRATOR] QA: spawning QA-Agent
[2026-04-25 10:25] [QA-AGENT] ACTIVATED: TASK-2026-04-25-001
[2026-04-25 10:31] [QA-AGENT] VERDICT: pass — 3/3 ACs verified;
  novelty=repeat; recommendedEscalation=escalated_review
[2026-04-25 10:31] [ORCHESTRATOR] QA: PASS — proceeding to session close
```

`novelty=repeat` and `recommendedEscalation=escalated_review` are the
load-bearing fields here. QA does not act on the recurrence — its
job is to surface and route. The Orchestrator picks up the
escalation in the session close.

---

## Step 8 — Trust score update

At session close, the operator scores Fix Agent and QA Agent. Each
score conforms to [`schemas/v1/trust-score.schema.json`](../../schemas/v1/trust-score.schema.json),
with one line of evidence per dimension per the
[D1-D4 rubric](../../calibration/d1-d4-rubric.md).

> Note: The following example uses human-readable IDs for
> legibility. Production records must use ULIDs to conform
> to the schema. Example ULID: 01HW2YA6NXBZ4S0K3K9C5R8RQ7

**Fix Agent:**

```json
{
  "agentId": "fix-agent",
  "domain": "ui_rendering",
  "trustTier": "HIGH",
  "sessionScore": {
    "d1": 23,
    "d1Evidence": "Fix correct on first QA attempt. -2 for the recurrence drag on first-attempt judgment: the prior failure was in the library and the agent still walked into the same bind-site mistake before catching it via the prevention check.",
    "d2": 25,
    "d2Evidence": "Bulletin entry at every phase transition (ACTIVATED → READING → LOCKED → WORKING ×3 → VERIFYING ×3 → TAG → UNLOCKED). FailureRecord written. Locks acquired and released cleanly.",
    "d3": 25,
    "d3Evidence": "Single file in scope; scope held. No unauthorized actions. Pre-spawn manifest's interfacesTouched matched the actual diff. No override flags used.",
    "d4": 18,
    "d4Evidence": "Prior render_error pattern existed in the failure library; agent read it via pre-task retrieval (FAILURE-LIB bulletin entry present). Pattern still recurred at the bind site. recurrenceCount now 2; partial credit for catching it inside the session and writing the prevention artifact.",
    "total": 91
  },
  "dimensions": {
    "correctness": 0.93,
    "repeatDefectRate": 0.07,
    "falseCompletionRate": 0.0,
    "catchEffectiveness": 0.0,
    "policyCompliance": 1.0,
    "contractStability": 1.0,
    "recoveryEffectiveness": 0.95,
    "regressionRecurrence": 0.07
  },
  "totalRuns": 14,
  "nSessions": 14,
  "confidenceBand": "MEDIUM",
  "recencyWeight": 1.0,
  "lastUpdated": "2026-04-25T10:45:00Z",
  "notes": "Total 91 → HIGH tier. D4=18 because recurrenceCount hit 2 for render_error/onSubmit-binding. Prevention artifact filed. Pattern flagged to Orchestrator for systemic-review watch at recurrenceCount>=3."
}
```

**QA Agent:**

```json
{
  "agentId": "qa-agent",
  "domain": "ui_rendering",
  "trustTier": "HIGH",
  "sessionScore": {
    "d1": 25,
    "d1Evidence": "3/3 acceptance criteria verified on first QA pass. Findings well-categorized with file/line context. Repeat defect surfaced via novelty=repeat with prior failure reference.",
    "d2": 25,
    "d2Evidence": "Structured QAVerdict written. Bulletin entries at QA spawn and QA close. Per-AC findings logged with file/line context.",
    "d3": 25,
    "d3Evidence": "Read-only role respected — no writes outside the verdict file. No self-spawning. recommendedEscalation routed to escalated_review for the recurrence; QA never attempted to act on it.",
    "d4": 25,
    "d4Evidence": "No known QA pattern repeated. QA's own failure library checked at session start; no entries matched.",
    "total": 100
  },
  "dimensions": {
    "correctness": 1.0,
    "repeatDefectRate": 0.0,
    "falseCompletionRate": 0.0,
    "catchEffectiveness": 0.92,
    "policyCompliance": 1.0,
    "contractStability": 1.0,
    "recoveryEffectiveness": 1.0,
    "regressionRecurrence": 0.0
  },
  "totalRuns": 14,
  "nSessions": 14,
  "confidenceBand": "MEDIUM",
  "recencyWeight": 1.0,
  "lastUpdated": "2026-04-25T10:45:00Z",
  "notes": "Total 100 → HIGH tier. Clean session. Recurrence detected and routed correctly without QA attempting to remediate."
}
```

---

## Step 9 — Session close

The Orchestrator runs final verification (re-render of the touched
file, baseline-delta check) and writes the session close.

**Final bulletin entries:**

```
[2026-04-25 10:42] [ORCHESTRATOR] VERIFICATION: PASS — baseline delta zero
  outside src/components/CheckoutForm.js and tests/checkout-validation.test.js
[2026-04-25 10:45] [ORCHESTRATOR] TRUST SCORE: fix-agent total=91 (HIGH);
  qa-agent total=100 (HIGH); written to ledger
[2026-04-25 10:45] [ORCHESTRATOR] ESCALATION: render_error recurrenceCount=2
  noted; systemic-review watch active. Boardroom session triggered if
  recurrenceCount reaches 3.
[2026-04-25 10:45] [ORCHESTRATOR] SESSION COMPLETE: checkout-validation-bug
  fixed. QA PASS. FailureRecord written. Recurrence escalated.
```

The session close is the durable handoff to the next session.
A future Orchestrator activation reads this entry, sees the
recurrence watch on `render_error`, and surfaces it again on any
task that touches `src/components/CheckoutForm.js` — closing the
loop the framework was designed to close.

---

## Artifact Summary

Every artifact produced by this session:

| Artifact | Location | Purpose |
|---|---|---|
| AgentTaskManifest | `docs/manifests/TASK-2026-04-25-001.json` | Task contract |
| Manifest sidecar | `docs/manifests/TASK-2026-04-25-001.json` | Hook validation target |
| Audit log entry | `audit_log` table | Spawn authorization record; out-of-band proof the hook decided allow |
| Agent bulletin | `docs/agent-bulletin.md` | Real-time state log; the trail D2 is scored against |
| FailureRecord | `docs/failure-records/FAIL-2026-04-25-001.json` | Defect record and prevention artifacts; the recurrence-detection input for future sessions |
| QAVerdict | `docs/qa-verdicts/QA-2026-04-25-001.json` | Verification record; the input D1 is scored against |
| TrustScore — Fix Agent | `docs/agent-trust-scores.md` | Behavioral accountability over time |
| TrustScore — QA Agent | `docs/agent-trust-scores.md` | Behavioral accountability over time |
| Regression test | `tests/checkout-validation.test.js` | Prevention artifact; the codified guard against this specific recurrence |

> The reference implementation uses a single file for both the
> task manifest and the hook-readable sidecar. See the Manifest
> and Sidecar Convention note earlier in this document for the
> optional enterprise split-file pattern.

---

## What this scenario illustrates

One MEDIUM-risk single-file bug fix produced nine distinct artifacts,
six bulletin phases, and one escalation flag carried into the next
session. That ratio is the price of the framework, and it is the
point of the framework: every step has an artifact, every artifact
has a purpose, and the recurrence flag is the link between this
session and the next.

The piece that turns this from documentation into an operating model
is **Step 1's failure library check**. Without it, the agent would
have walked into the same `onSubmit`-binding mistake with no signal,
the recurrence would not have been detected, and `recurrenceCount`
would have stayed at 1 instead of reaching 2 — the threshold that
makes the prevention artifact mandatory and the systemic-review
watch active. The framework's value is concentrated in that one
bulletin line written before the spawn fires.
