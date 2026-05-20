# Cross-Runtime Governance Demo

This runnable sanitized replay of the Sprint 2 proof pattern shows
AWF governing **two heterogeneous agent runtimes** —
an event-rich adapter (Claude Code profile) and a policy-rich adapter
(Codex profile) — through a single control plane, producing **one
verified audit chain** across both runs.

See [`terminal-demo.md`](terminal-demo.md) for the full sanitized transcript.

---

## What this demo proves

1. The same AWF governance lifecycle applies to runtimes with very
   different control surfaces.
2. A single HITL gate model works for both event-emitting and
   policy-injected adapters.
3. D1-D4 trust scoring produces comparable scores across runtimes,
   computed from each adapter's available evidence.
4. The hash-chained audit log captures events from both runtimes into
   one tamper-evident chain, with per-runtime attribution preserved.
5. A heterogeneous fleet of agent runtimes can be governed from one
   control plane — not as an aspiration, but as a sanitized replay
   of a validated private proof.

---

## The five governance stages

Every governed run, regardless of runtime, passes through the same
five stages. The demo exercises each one twice — once per adapter
profile — and verifies the audit chain at the end.

| Stage | What happens |
|---|---|
| 1. Intake | Load the governed work item, classify risk, resolve allowed paths and verification requirements. |
| 2. Approval | Workspace inspection detects the HITL gate; the human approver records `HUMAN_APPROVAL_RECORDED` before the adapter is permitted to start. |
| 3. Context injection | Runtime-appropriate governance context is delivered. Event-rich adapters receive workspace inspection hints; policy-rich adapters receive injected `AGENTS.md` governance content. |
| 4. Execution | The adapter runs the agent. Event-rich adapters emit per-tool lifecycle events (`TOOL_USE_STARTED`, `TOOL_USE_COMPLETED`); policy-rich adapters surface coarser run-level evidence. Both terminate in `AGENT_RUN_COMPLETED`. |
| 5. Audit | Events are appended to the hash-chained audit log. D1-D4 is computed from the captured evidence. The chain is verified end-to-end and runtime attribution is preserved per event. |

---

## Trust subject model per runtime type

AWF does not treat every runtime as if it had a stable per-agent
identity. Each runtime is mapped to the **trust subject type** that
matches what it actually exposes. Trust accumulates against that
subject, not against the runtime brand.

| Adapter profile | Runtime example | Trust subject type | Why |
|---|---|---|---|
| Event-rich | Claude Code | `agent` | Stable named agents in `.claude/agents/`, per-tool event stream, per-session evidence per named agent. |
| Policy-rich | Codex | `role_profile` | No stable per-agent identity exposed; trust attaches to (role + workspace + repo + task_type + risk_lane + sandbox_mode + skill_set). |

Other subject types — `subagent`, `session`, `graph_node`,
`human_runtime`, `task` — are defined in
[DESIGN-02](../../docs/adapter-designs/DESIGN-02.md) and apply to
runtimes outside this demo.

The practical consequence: a Claude Code agent trusted at HIGH for
a workspace does not implicitly trust a Codex role on the same task.
Each subject earns its own trust on its own evidence.

---

## How the two adapters differ

| Capability surface | Event-rich (Claude Code profile) | Policy-rich (Codex profile) |
|---|---|---|
| Pre-execution governance | Workspace inspection hint | `AGENTS.md` injected at session start |
| Execution evidence | Per-tool events (E1+) | Run-level outcome (E1) |
| Hook surface | PreToolUse / PostToolUse hooks | Sandbox-mode enforcement + post-run inspection |
| Enforcement tier | Event-driven fail-closed | Policy-driven fail-closed |

Both produced the same final trust score in the demo (93 → HIGH)
because the work item, risk lane and verification outcome were
identical. The **path to that score differs by adapter**, and the
audit chain records that difference per event.

---

## Reading the audit verification

```
audit.events: 42 row(s), chain OK
runtime breakdown:
  event_rich_adapter:   18
  policy_rich_adapter:  12
  pre_execution:        12
```

- `chain OK` — every audit row's `prev_hash` matches the actual prior
  hash. No insertions, no deletions, no reorderings.
- The event-rich adapter emits more rows because it captures per-tool
  events. The policy-rich adapter emits fewer because its evidence is
  run-level. **Both** contribute to the same chain.
- `pre_execution` rows cover intake, classification and approval —
  the stages that run before either adapter starts.

---

## Disclaimer

The public demo uses simulated adapter outputs that mirror the
Sprint 2 proof pattern. Real adapter implementations remain in the
commercial control-plane repo.

---

## Further reading

- [DESIGN-01 — Runtime Adapter Capability Model](../../docs/adapter-designs/DESIGN-01.md)
- [DESIGN-02 — Trust Subject Model](../../docs/adapter-designs/DESIGN-02.md)
- [DESIGN-03 — Adapter Enforcement Limits](../../docs/adapter-designs/DESIGN-03.md)
