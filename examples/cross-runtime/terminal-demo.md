# AWF Cross-Runtime Demo

> This is a sanitized replay of the Sprint 2 cross-runtime proof
> pattern. Runtime adapter implementations and private production
> evidence remain in the commercial control-plane repo.

## Running the demo

```bash
npm run demo:cross-runtime
```

## Terminal transcript

```text
AWF Cross-Runtime Governance Demo
correlation_id: demo-7f4a91c2

Loading governed work item...
  task_class: api_integration
  risk_level: medium
  allowed_paths: [src/, server/]

Classifying risk... medium — workspace-write permitted

=== RUN 1: Event-rich adapter (Claude Code profile) ===
Workspace inspection: hitl-gate detected

HITL APPROVAL REQUIRED
Review the task and type approve to proceed: approve

HUMAN_APPROVAL_RECORDED

Adapter executing... (simulated)
TOOL_USE_STARTED
TOOL_USE_COMPLETED
TOOL_USE_STARTED
TOOL_USE_COMPLETED
AGENT_RUN_COMPLETED

Artifacts:
  files_changed: 2
  evidence_strength: E1

D1 Correctness:   18 — candidate
D2 Observability: 25 — handoff present
D3 Policy:        25 — no violations
D4 Recurrence:    25 — no known pattern
Total: 93 → HIGH

=== RUN 2: Policy-rich adapter (Codex profile) ===
Workspace inspection: hitl-gate detected
AGENTS.md governance injected

HITL APPROVAL REQUIRED
Review the task and type approve to proceed: approve

HUMAN_APPROVAL_RECORDED

Adapter executing... (simulated)
AGENT_RUN_COMPLETED

Artifacts:
  files_changed: 4
  evidence_strength: E1

D1 Correctness:   18 — candidate
D2 Observability: 25 — handoff present
D3 Policy:        25 — no violations
D4 Recurrence:    25 — no known pattern
Total: 93 → HIGH

=== Audit Verification ===
audit.events: 42 row(s), chain OK
runtime breakdown:
  event_rich_adapter:   18
  policy_rich_adapter:  12
  pre_execution:        12
VERIFIED

┌─────────────────────────────────────────┐
│ AWF Cross-Runtime Demo                  │
├──────────────────┬──────────────────────┤
│ Event-rich       │ Policy-rich          │
│ files: 2         │ files: 4             │
│ score: 93 HIGH   │ score: 93 HIGH       │
├──────────────────┴──────────────────────┤
│ Audit chain: VERIFIED                   │
├─────────────────────────────────────────┤
│ AWF governs heterogeneous agent         │
│ runtimes from one control plane.        │
│ Not just a claim. A validated pattern,  │
│ shown here as a sanitized replay.       │
└─────────────────────────────────────────┘
```
