# Session Scoring Walkthrough Single Workspace [v1.0]

A full annotated session, end to end. The scenario is a `billing-rate-bug`: a bug in tier-boundary rate computation. Risk is medium because the file touches business logic but no customer-facing surface; the fix flows through the standard pre-spawn path with a manifest, a QA loop with a first-attempt fail and a re-QA pass, trust scoring with evidence per dimension, and one FailureRecord.

This walkthrough is sanitized. There are no product references, no supplier names, no real repo paths. `[PROJECT_REPO]` is the placeholder for the project root.

---

## Session metadata

- **Session ID:** S-2026-04-22-001
- **Date:** 2026-04-22
- **Duration:** 09:30 - 12:15 (2h 45m)
- **Founder:** [REDACTED]
- **Agents involved:** orchestrator, agent-srv, qa-agent, fix-agent

---

## Pre-spawn protocol

The pre-spawn protocol has three steps. Each step has an exit condition; failing the exit condition routes to escalation, not to spawn.

### STEP 1 Risk classification

**Input:** Bug report from the founder. "Tier-boundary rate computation returns the lower-tier rate when the input is exactly equal to the boundary value. Expected: equal-to-boundary returns the higher-tier rate."

**Risk dimensions assessed by the orchestrator:**

| Dimension | Assessment |
|---|---|
| Customer impact if regression ships | Medium. Internal tooling currently. Could affect billing accuracy if propagated. |
| Reversibility | High. The function is pure; no persisted state changes. |
| Domains touched | `data_integrity` (rate calculation), `api_integration` (function called by an internal API) |
| Prior failure history in this domain | One prior FailureRecord: FAIL-2026-04-12-001 (`schema_violation` in `data_integrity`). Not directly related but surfaces a domain-level expectation: open the contract before writing. |
| Subagent depth needed | 1 (one agent-srv to fix; one qa-agent to verify) |

**Classification result:** `riskLevel: medium`.

**Exit condition for STEP 1:** Risk level assigned with rationale. **Met.**

### STEP 2 Manifest creation

The orchestrator authors `[PROJECT_REPO]/manifests/TASK-S20260422-001.md`. Content (rendered as JSON for AJV validation against `schemas/v1/agent-task-manifest.schema.json`):

```json
{
  "taskId": "01HW2YA6NXBZ4S0K3K9C5R8RQ7",
  "taskType": "bug",
  "taskDescription": "Tier-boundary rate computation returns lower-tier rate when input equals boundary. Expected: equal-to-boundary returns higher-tier rate.",
  "domains": ["data_integrity", "api_integration"],
  "riskLevel": "medium",
  "interfacesTouched": [
    "[PROJECT_REPO]/server/services/billingRate.js",
    "[PROJECT_REPO]/test/unit/billingRate.test.js"
  ],
  "contractsReferenced": [
    "[PROJECT_REPO]/contracts/billing_rate.contract.json"
  ],
  "verificationRequired": ["unit_test", "qa_agent_review"],
  "blockingDependencies": [],
  "priorFailureContext": [
    {
      "failureId": "FAIL-2026-04-12-001",
      "preventionCheck": "Open the contract file before writing any field touching billing_rate."
    }
  ],
  "evalPlan": "Run [PROJECT_REPO]/test/unit/billingRate.test.js. The test must exercise: (a) input below boundary, (b) input above boundary, (c) input EXACTLY at boundary. The boundary case is the regression test for this fix.",
  "assignedAgent": "agent-srv",
  "createdAt": "2026-04-22T09:35:00Z"
}
```

**Pre-task retrieval performed.** The orchestrator searched the failure-record index by domain (`data_integrity`) and by file (`billingRate.js`). One match: FAIL-2026-04-12-001. The match is included in `priorFailureContext`. The orchestrator's brief to agent-srv includes the prevention rule explicitly.

**Exit condition for STEP 2:** Manifest validates against the schema; pre-task retrieval performed; eval plan present (required for medium risk). **Met.**

### STEP 3 Spawn or escalate

**Decision logic:**

- riskLevel `low` → spawn directly.
- riskLevel `medium` → spawn; founder reviews at decision points (BUILD complete, QA verdict).
- riskLevel `high` → HITL gate before spawn; founder approves manifest first.
- Any domain with active recurrence (`recurrenceCount >= 3` in the named class) → Boardroom session before spawn.

This is `medium` with `recurrenceCount = 1` for the prior pattern. Spawn proceeds.

**Spawn:** `agent-srv` invoked with the manifest as input.

---

## Task execution

### agent-srv BUILD phase

Bulletin entries (timestamps, sanitized):

```
2026-04-22T09:38:12Z [agent-srv] PHASE=BUILD STATE=START
  Read [PROJECT_REPO]/contracts/billing_rate.contract.json (per FAIL-2026-04-12-001 prevention rule).
  Contract specifies: rate(input) returns the rate for the tier where input belongs.
  Tier boundaries are inclusive on the upper end.
  Read [PROJECT_REPO]/server/services/billingRate.js. Found the bug: comparison is `<=` lower bound and `<` upper bound. Should be `<` lower and `<=` upper.

2026-04-22T09:42:45Z [agent-srv] PHASE=BUILD STATE=WORKING
  Modified billingRate.js lines 42-58. Comparison flipped to `<` lower bound, `<=` upper bound.
  Added regression test in billingRate.test.js for the exact-boundary case.

2026-04-22T09:48:03Z [agent-srv] PHASE=BUILD STATE=DONE
  All edits complete. Ran the unit test suite: 7/7 pass including the new boundary case.
  Handing off to qa-agent.
```

Hooks fired during BUILD:

| Hook | Result |
|---|---|
| `check-bulletin` (PreToolUse, before each write) | exit(0) agent-srv read its prior bulletin entries before writing the next |
| `check-bulletin-order` | exit(0) START before WORKING before DONE |
| `check-locked-states` | exit(0) `billingRate.js` and `billingRate.test.js` were both in `interfacesTouched` |
| `check-failure-lib` (pre-task, at BUILD start) | exit(0) FAIL-2026-04-12-001 surfaced; agent-srv acknowledged in bulletin |
| `audit-write` (PostToolUse) | exit(0) every tool use logged to `audit_log` table |

### qa-agent QA phase first attempt

```
2026-04-22T09:51:27Z [qa-agent] PHASE=QA STATE=START
  Reading manifest TASK-S20260422-001 acceptance criteria.
  Reading agent-srv handoff and the bulletin.
```

qa-agent ran the test suite. **6/7 pass. One unexpected failure** in a test that was not in the manifest's eval plan: `billingRate.contract.test.js` a contract test that asserts `rate(input)` for input === 0 returns the zero-tier rate.

The fix introduced a regression: input === 0 is now treated as below the lowest-tier boundary (because the lower bound is `<` and 0 is at the lower boundary), so the function falls through to a default rate that is not the zero-tier rate.

QAVerdict QA-S20260422-001:

```json
{
  "verdictId": "01HW2YBA0Z5R7S0H2C9B1K3M5N",
  "taskId": "01HW2YA6NXBZ4S0K3K9C5R8RQ7",
  "qaDecision": "fail",
  "defectClass": "render_error",
  "novelty": "new",
  "repeatReferenceIds": null,
  "findings": [
    {
      "category": "boundary_condition",
      "description": "The fix corrected the upper-boundary case but introduced a regression at input === 0: comparison `<` lower bound now excludes 0 from the zero-tier range. Default rate returned instead of zero-tier rate.",
      "severity": "major",
      "file": "[PROJECT_REPO]/server/services/billingRate.js",
      "lineRange": "42-58"
    },
    {
      "category": "missing_eval",
      "description": "The original eval plan did not include input === 0. The contract specifies behavior at this value. Manifest's eval plan was incomplete.",
      "severity": "minor",
      "file": "[PROJECT_REPO]/manifests/TASK-S20260422-001.md",
      "lineRange": null
    }
  ],
  "recommendedPreventionArtifact": "regression_test for input === 0 case; instruction update for agent-srv to enumerate all contract-tested boundaries before BUILD",
  "missingEval": "input === 0 boundary",
  "recommendedEscalation": "fix_agent",
  "trustScoreDelta": {
    "agentId": "agent-srv",
    "dimension": "correctness",
    "direction": "decrement",
    "reason": "Boundary-condition regression introduced while fixing a different boundary."
  },
  "timestamp": "2026-04-22T10:14:08Z",
  "correlationId": "S-2026-04-22-001"
}
```

QA decision: `fail`. Routed to `fix-agent`.

### fix-agent FIX phase

```
2026-04-22T10:18:33Z [fix-agent] PHASE=FIX STATE=START
  Reading QAVerdict QA-S20260422-001 and the contract billing_rate.contract.json.
  Confirming root cause: the comparison logic excludes input === 0 from the zero-tier.
```

fix-agent's analysis: the contract says tier boundaries are inclusive on the upper end AND the lowest tier (zero-tier) is inclusive on the lower end (input >= 0). The implementation needs three cases, not the two the original author assumed:

- input === 0: zero-tier rate
- 0 < input <= upper bound of tier N: tier N rate
- input > maximum boundary: highest tier rate (or default)

Implementation: change the comparison to dispatch on `>=` lower for the lowest tier and `<` lower / `<=` upper for all other tiers. Or cleaner rewrite as a tier-table lookup with `findIndex`. fix-agent chose the lookup rewrite because it is testable per-tier rather than per-comparison.

Bulletin:

```
2026-04-22T10:32:11Z [fix-agent] PHASE=FIX STATE=WORKING
  Rewrote billingRate.js as a tier-table lookup. Added contract-driven test cases.

2026-04-22T10:48:29Z [fix-agent] PHASE=FIX STATE=DONE
  All boundary cases pass. Handing back to qa-agent for re-QA.
  FailureRecord FAIL-2026-04-22-001 created (open) will close after re-QA pass.
```

### qa-agent re-QA phase

```
2026-04-22T10:51:02Z [qa-agent] PHASE=QA STATE=START
  Re-running full test suite including the new contract-driven cases.
  10/10 pass. Boundary cases: input === 0, input === lower bound (any tier), input === upper bound (any tier), input above maximum.
```

QAVerdict QA-S20260422-002:

```json
{
  "verdictId": "01HW2YDM7K8N4P2J6S1Q3R5V8W",
  "taskId": "01HW2YA6NXBZ4S0K3K9C5R8RQ7",
  "qaDecision": "pass",
  "defectClass": null,
  "novelty": "new",
  "repeatReferenceIds": null,
  "findings": [
    {
      "category": "verified",
      "description": "All 10 boundary cases pass. Implementation is now contract-conformant.",
      "severity": "info",
      "file": "[PROJECT_REPO]/server/services/billingRate.js",
      "lineRange": "1-78"
    }
  ],
  "recommendedEscalation": "none",
  "timestamp": "2026-04-22T11:02:44Z",
  "correlationId": "S-2026-04-22-001"
}
```

QA decision: `pass`. Founder reviewed and committed.

### fix-agent close FailureRecord

```yaml
failureId: FAIL-2026-04-22-001
timestamp: "2026-04-22T10:48:29Z"
domain: data_integrity
agentsInvolved: [agent-srv, qa-agent, fix-agent]
files:
  - "[PROJECT_REPO]/server/services/billingRate.js"
  - "[PROJECT_REPO]/contracts/billing_rate.contract.json"
symptom: "Fix for upper-boundary case introduced a regression at input === 0."
rootCause: |
  The original implementation used a two-case comparison (lower-bound vs upper-bound).
  The fix flipped the inclusivity but did not enumerate all contract-specified boundaries.
  The contract has a third boundary (input === 0 → zero-tier) that neither the original
  code nor the first fix attempt accounted for.
failureClass: render_error
severity: P2
customerImpact: "No customer impact. Caught in re-QA before commit."
detectionSource: qa_agent
recommendedPrevention: |
  agent-srv instruction file: before any BUILD on a contract-governed function,
  enumerate ALL boundary cases specified by the contract and write a test case for each.
  Boundary enumeration is a pre-build step; the manifest's evalPlan should reflect it.
regressionTestAdded: true
preventionArtifacts:
  - type: regression_test
    location: "[PROJECT_REPO]/test/unit/billingRate.test.js"
    description: "Contract-driven boundary tests: input === 0, lower of every tier, upper of every tier, above maximum."
  - type: instruction_update
    location: "[PROJECT_REPO]/agents/agent-srv/instructions.md"
    description: "Adds the 'enumerate all contract boundaries' rule to the pre-build checklist."
recurrenceCount: 1
repeatOfFailureIds: []
status: resolved
rootCauseConfirmed: true
fixTag: hotfix-plus-prevention
correlationId: "S-2026-04-22-001"
commandCenterLink: null
```

---

## Trust scoring with evidence

The four agents that ran in this session each get a row in the trust ledger. Evidence per dimension is one line.

### orchestrator

| Dim | Score | Evidence |
|---|---|---|
| D1 Correctness | 25 | Manifest correct, complete, with non-trivial eval plan and pre-task retrieval applied. |
| D2 Observability | 25 | All bulletin entries written. Session close written. Manifest correlation ID present on every artifact. |
| D3 Compliance | 25 | No policy violations. Subagent depth held at 1. Did not commit. Did not write FailureRecord directly. |
| D4 Recurrence | 25 | Surfaced FAIL-2026-04-12-001 and applied its prevention rule in the manifest. |
| **Total** | **100** | Tier (rolling, n=12 → 13): STANDARD. Confidence band: LOW. |

### agent-srv

| Dim | Score | Evidence |
|---|---|---|
| D1 Correctness | 18 | First BUILD attempt fixed the named bug but introduced a regression at input === 0. One round of fix-agent intervention. Per the rubric: "Minor correction, one round fixed it." |
| D2 Observability | 25 | Bulletin entries at every transition. Read the contract per the prevention rule and logged it. |
| D3 Compliance | 25 | No hook violations. No file outside `interfacesTouched`. No commit attempted. |
| D4 Recurrence | 22 | Did not repeat the FAIL-2026-04-12-001 pattern (read the contract). New failure class introduced (render_error at boundary). Minus 3 because pattern-adjacent: thinking-too-narrowly persists across the same domain. |
| **Total** | **90** | Tier (rolling, n=8 → 9): RESTRICTED. Confidence band: LOW. |

### qa-agent

| Dim | Score | Evidence |
|---|---|---|
| D1 Correctness | 25 | Caught the regression on first run by including the contract test, even though the manifest's eval plan did not require it. Surfaced `missingEval` in the verdict. |
| D2 Observability | 25 | Both verdicts (fail then pass) written with full findings and severity. |
| D3 Compliance | 25 | No policy issue. Did not modify code under review. |
| D4 Recurrence | 25 | No pattern repeated. |
| **Total** | **100** | Tier (rolling, n=12 → 13): STANDARD. Confidence band: LOW. |

### fix-agent

| Dim | Score | Evidence |
|---|---|---|
| D1 Correctness | 25 | Fix passed re-QA on first attempt with all 10 boundary cases. Chose the cleaner tier-table refactor over a one-line patch. |
| D2 Observability | 25 | FailureRecord complete. Bulletin entries at every transition. |
| D3 Compliance | 25 | All required prevention artifacts in place. Did not self-close. Founder approved closure. |
| D4 Recurrence | 25 | Novel failure. No pattern repeated. |
| **Total** | **100** | Tier (rolling, n=3 → 4): PROVISIONAL. Confidence band: PROVISIONAL. |

---

## Failure record created

| Failure ID | Class | Severity | Status | Tag |
|---|---|---|---|---|
| FAIL-2026-04-22-001 | render_error | P2 | resolved | hotfix-plus-prevention |

Surfaced for next session: any task touching `data_integrity` domain with a contract-governed function, OR any task on `billingRate.js`. Pre-task retrieval will inject the prevention rule: "enumerate all contract boundaries before BUILD."

---

## What this walkthrough demonstrates

The framework's value here is in the boundary-condition catch. Without the framework:

- The original bug would have been fixed in a one-line change.
- The regression at input === 0 would have shipped because the developer's mental model had two boundaries, not three.
- The contract test would have surfaced the regression in staging or in production if no contract tests existed.

With the framework:

- The manifest required `contractsReferenced`. The agent read the contract.
- QA-Agent's verdict structure required findings per acceptance criterion AND surfaced the eval-plan gap (`missingEval`).
- The first fix attempt failed in QA, not in production.
- The second fix attempt added a class-level prevention artifact (instruction update), so the next agent will apply boundary enumeration without prompting.
- The trust ledger captured one round of rework as D1=18, not a binary pass/fail. Patterns will surface across sessions.

The cost was approximately 30 minutes of additional governance time vs. a hypothetical "just patch it" session. The benefit is institutional: the pattern is recorded, the prevention is in the next agent's instructions, and the trust score reflects a real capability boundary that the team can act on.
