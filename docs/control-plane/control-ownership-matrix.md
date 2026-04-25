# Control Ownership Matrix

**Who owns each control, what enforces it and what evidence it produces.**

This matrix maps every major control in the framework to its owner,
enforcement mechanism and audit evidence. Enterprise teams use this
to understand accountability, verify coverage and satisfy audit
requirements.

## How to read this matrix

- **Owner:** the role or component responsible for the control
- **Enforced By:** the technical mechanism that implements the control
- **Evidence:** the artifact or table that proves the control fired
- **Status:** the maturity label for this control

## Control Matrix

| Control | Owner | Enforced By | Evidence | Status |
|---|---|---|---|---|
| Agent spawn authorization | Orchestrator | PreToolUse hook (check-agent-spawn) | manifest sidecar + audit_log | Implemented |
| Scope boundary enforcement | Agent + Manifest | File locks + check-lock hook + PostToolUse audit | agent_events + lock release entry | Implemented |
| HITL approval for HIGH risk | Human approver | PreToolUse hook (hitlApproved check) + gate_records | gate_records table | Implemented |
| D1-D4 trust scoring | Human operator (manual) / Eval service (automated) | Scoring rubric + evidence requirement | trust_scores table | Implemented (manual) / Planned (automated) |
| Failure recurrence detection | QA Agent + Fix Agent + Orchestrator | Pre-task failure library check | failure_records table | Implemented |
| Audit log integrity | PostToolUse hook (append-only writer) | check-audit-write hook; append-only constraint | audit_log table | Implemented |
| Bulletin append-only enforcement | check-bulletin-order hook | PreToolUse hook on Write operations | audit_log + bulletin file | Implemented |
| Agent spawn result verification | PostToolUse hook | check-agent-spawn-result hook | audit_log | Implemented |
| Delegation TTL enforcement | Enterprise admin | delegation_rules.valid_until + application layer | delegation_rules table | Reference Pattern |
| Work queue assignment trust gate | Team Orchestrator | Trust tier check at assignment time | work_queue_items + trust_scores | Reference Pattern |
| Cross-workspace isolation | Workspace admin | workspace_id scoping; Postgres RLS | agent_events.workspace_id; workspaces table | Reference Pattern |
| Approval gate chain routing | Division Orchestrator | gate_records + escalation rules | gate_records table | Reference Pattern |
| Automated trust scoring | Eval/Telemetry Service | R10 routine + Eval service write path | trust_scores table | Planned |

## Separation of Duties

### Key separation of duties principles

1. **Agents cannot write to the audit log.** Only the PostToolUse hook
   writes `audit_log` entries.

2. **Agents cannot self-score trust.** Only the human operator or the
   Eval/Telemetry Service writes to `trust_scores`.

3. **The Orchestrator cannot approve its own HIGH-risk spawns.**
   HITL approval requires a human actor or delegated authority.

4. **A delegate cannot re-delegate.** Delegation authority has a
   single hop limit and a mandatory TTL.

5. **Subagents cannot spawn subagents.** Only the Orchestrator
   holds Task tool authority.

## Evidence Traceability

Every control in this matrix produces a verifiable artifact.
For an enterprise audit or compliance review, the evidence chain is:

```
Spawn request → manifest sidecar → hook validation → audit_log entry
→ agent_events entry → QA verdict → trust_scores update
→ failure_records (if applicable) → gate_records (if HITL required)
```

The chain is complete when every link is present. A missing link
indicates a governance gap, not a clean bill of health.
