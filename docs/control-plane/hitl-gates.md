# HITL Gates

**Human-in-the-loop gates: types, authority hierarchy, and the
3-strike escalation pattern.**

A HITL gate is a point in the build flow where a human must record an
approval before the agent continues. Gates are the primary mechanism
by which authority is reserved for humans even as agents operate
autonomously between gates.

---

## The Four Gate Types

The framework recognizes four gate types. Each has a different
authority profile and different timing.

| Type | What It Is |
|---|---|
| **HITL** | Direct human approval required for a specific action |
| **DELEGATION** | Authority delegated from one human to another, with TTL |
| **ESCALATION** | A gate that fires because a prior gate timed out or failed |
| **APPROVAL** | A formal approval, usually for CRITICAL-risk decisions, recorded with rationale |

The types are not synonyms. They differ in who can issue, how long the
authorization lasts, and what is recorded.

---

## HITL

The default gate type. A specific human, in role, approves a specific
action.

### When HITL Fires

| Trigger | Reason |
|---|---|
| `riskLevel = HIGH` | Hard rule — no exceptions |
| Agent at RESTRICTED tier | Per-phase review required |
| Task touches a locked region | Locked regions enumerate themselves; the lock declares HITL |
| Pre-task retrieval surfaced a matching FailureRecord with prevention not in place | Recurrence risk |
| Prompt requested it | Operator asked for review |

### What HITL Approval Records

A HITL approval is not a thumbs-up. It is a record with:

- The reviewer's identity
- The specific action being approved (file diff, plan, decision)
- The rationale (one line minimum)
- A timestamp
- A correlation ID linking to the manifest and session

A HITL approval without rationale is a hook violation in v1.0+.
The reviewer is being asked to think, not just to click.

---

## DELEGATION

When the primary approver is unavailable, authority can be delegated.
Delegation is **explicit and time-bounded.**

### Delegation Rules

| Rule | Detail |
|---|---|
| Explicit | Delegation is recorded — never implicit, never inferred |
| TTL required | Every delegation has an expiration time; no permanent delegations |
| No re-delegation | A delegate cannot pass authority on to a third party |
| Audit on every use | Every approval made under delegation logs both delegator and delegate |
| Scope-bounded | Delegation specifies which gate types and max risk level the delegate may approve |

### Delegation Schema

The schema (see `database/enterprise/007_delegation_rules.sql`) records:

- `delegator_id` — original authority
- `delegate_id` — the human receiving authority
- `gate_types` — which gate types this delegation covers
- `max_risk_level` — ceiling on what the delegate may approve
- `valid_from`, `valid_until` — the TTL bounds

A delegation that has expired produces an ESCALATION on the next gate
attempt.

### Why No Re-Delegation

Re-delegation creates authority chains that nobody audits. By the
third hop, the original delegator does not know who is approving in
their name. The framework forbids re-delegation as a structural
guarantee.

---

## ESCALATION

When a gate fails to resolve — timeout, missing approver, or hit the
3-strike threshold — it escalates upward.

### Escalation Triggers

| Trigger | Escalates To |
|---|---|
| HITL gate timeout (configurable, default 24h) | Delegate (if exists) → Manager → Boardroom |
| 3 consecutive QA failures on a task | Boardroom |
| Hook violation during a HITL-approved action | Operator + audit log |
| Delegation expired without resolution | Original delegator |
| Risk reclassified upward mid-flow | Higher authority for new risk tier |

### Escalation Recording

Every escalation produces a row in `gate_records` (see
`database/enterprise/006_gate_records.sql`) with `gate_type =
ESCALATION` and a reference to the gate it superseded. The chain is
queryable: from a final approval, you can trace every prior gate.

---

## APPROVAL

A formal approval — usually for CRITICAL-risk decisions or for actions
that affect control plane artifacts (hooks, policy, audit log
structure).

### When APPROVAL Fires Instead of HITL

- `riskLevel = CRITICAL`
- Changes to control plane code or configuration
- Cross-team or cross-workspace decisions
- Schema migrations to governance tables
- Decisions to retire an agent

### APPROVAL vs HITL

| Property | HITL | APPROVAL |
|---|---|---|
| Frequency | Common in normal flow | Rare; reserved for high-stakes decisions |
| Authority | Role-defined approver | Higher role (Lead, VP, CTO equivalent) |
| Recording | Rationale required | Rationale + decision context required |
| Reversal | Can be revoked at next gate | Hard to reverse — recorded as a decision |
| Boardroom involvement | Optional | Often required first |

---

## Authority Hierarchy

At single-team scale, authority is one person — the operator.
Everything routes there.

At enterprise scale, authority is role-gated and structured:

```
            ┌─────────────────────────────┐
            │  EXECUTIVE / CTO-EQUIVALENT │
            │  CRITICAL approvals         │
            │  Cross-division decisions   │
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐
            │  DIVISION ORCHESTRATOR /    │
            │  VP-EQUIVALENT              │
            │  Cross-team approvals       │
            │  HIGH-risk delegation       │
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐
            │  TEAM LEAD                   │
            │  Team-scope HIGH approvals   │
            │  Standard delegation        │
            └─────────────┬───────────────┘
                          ▼
            ┌─────────────────────────────┐
            │  AUTHORIZED REVIEWER         │
            │  MEDIUM approvals           │
            │  Standard QA decisions      │
            └─────────────────────────────┘
```

A gate cannot be approved by an authority below its required level.
The Team Orchestrator (a manager agent) cannot approve what needs
Division-level authority — it must escalate.

### Workspace vs Authority Separation

Two layers stay distinct:

- **Workspace scope:** any authorized member may invoke the
  orchestrator within their workspace.
- **Approval authority:** specific gates require specific roles.

Conflating these creates bottlenecks where everything requires the
top role to even start. The framework keeps them separate by design.

---

## The 3-Strike Escalation Pattern

A standard pattern across the framework: try, retry, escalate.

```
ATTEMPT 1 — primary approver
   │
   ├─ approved → continue
   │
   └─ no response in TTL → ATTEMPT 2

ATTEMPT 2 — delegate (if exists)
   │
   ├─ approved → continue (delegation logged)
   │
   └─ no response → ATTEMPT 3

ATTEMPT 3 — escalation upward
   │
   ├─ approved at higher level → continue
   │
   └─ no response → BOARDROOM (or human halt)
```

The same shape is mirrored in the QA loop (see `build-state-machine.md`):
fail × 3 escalates to Boardroom. The shape generalizes: three attempts
is the cap on retry-without-escalation, framework-wide.

### Why Three

- One attempt is insufficient signal (might be transient).
- Two attempts confirms a real blocker.
- Three attempts confirms the pattern; further retries compound cost
  without changing outcome.

The number is heuristic but consistently applied. Changing it for
"this special case" is the slippery slope into governance theater.

---

## HITL Manifest Format

A HITL approval reuses the `AgentTaskManifest` envelope. The approval
is a record attached to a manifest, not a separate document type.

### What the Approval Adds

When a HITL gate is satisfied, the manifest gains:

- `approvalRecord.gateType` — HITL / DELEGATION / ESCALATION / APPROVAL
- `approvalRecord.approvedBy` — the human who approved
- `approvalRecord.approvedAt` — timestamp
- `approvalRecord.rationale` — one line minimum
- `approvalRecord.delegationChain` — populated if approval came via
  DELEGATION

The manifest with approval attached is the artifact that authorizes
the spawned agent to proceed past the gate. An agent that proceeds
without an approval record produces a hook violation.

### Reuse, Not New Schema

The framework deliberately does not introduce a separate HITL document
type. Reusing the manifest envelope:

- Keeps approval co-located with the work it authorizes
- Preserves correlation IDs across the gate boundary
- Avoids schema sprawl

---

## When HITL Should Be More Than a Click

If reviewers are routinely approving without changing decisions, the
gate has become ceremonial. Diagnostics:

- Are reviewers reading the manifest?
- Is the rationale field consistently meaningful, or boilerplate?
- Is the same reviewer approving every gate? Calibration check needed.
- Are HITL approvals correlated with reduced incidents, or
  uncorrelated?

A gate that does not catch anything is a gate to be removed or
relocated, not preserved out of caution. See `meta-governance.md` for
the "governance theater" failure mode.

---

## Common HITL Mistakes

| Mistake | Effect |
|---|---|
| Approving without reading the diff | Approval becomes signature; no actual review |
| Skipping rationale "to save time" | Future incidents have no record of why approval was given |
| Treating delegation as transitive | Authority chain becomes unauditable |
| Using HITL for LOW-risk work routinely | Reviewer fatigue; signal degrades |
| Letting HITL gates time out without escalation | The session sits indefinitely; queue depth grows |

---

## Related

- `docs/control-plane/pre-spawn-protocol.md` — where HITL gates fire
  in the pre-spawn flow.
- `docs/control-plane/build-state-machine.md` — phase boundaries
  where HITL may fire.
- `docs/concepts/approval-gate-chains.md` (v2.0) — chain composition
  in detail.
- `database/enterprise/006_gate_records.sql` — the gate records
  schema.
- `database/enterprise/007_delegation_rules.sql` — the delegation
  schema.
