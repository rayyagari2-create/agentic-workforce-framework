# Hook System

**OS-level enforcement for agent actions: PreToolUse, PostToolUse,
fail-closed by default.**

Hooks are the deterministic backstop. When higher layers fail —
classification missed, gate skipped, manifest forgotten — hooks fire at
the moment the agent attempts the action. They are the layer that
makes "you cannot do that" mean cannot.

---

## Why OS-Level

Hooks live below the model. They run as small programs invoked at
defined moments by the agent runtime. The model cannot persuade them.
The agent cannot rewrite them. They produce binary outcomes — allow
or block — regardless of how convincing the agent's reasoning is.

This is the property that distinguishes the control plane from the
operating model. Operating model rules can be argued with. Hooks
cannot.

---

## The Two Hook Points

```
agent decides action ──► PreToolUse hook ──► action runs ──► PostToolUse hook
                              │                                      │
                              │                                      │
                          allow / block                          audit / annotate
```

### PreToolUse

Runs **before** an action executes. Receives the action description as
input, exits with a status code. The runtime interprets the status
code and either permits or blocks the action.

Use cases:

- Validate the action is permitted (e.g., file lock held, manifest
  attached)
- Enforce ordering rules (bulletin written before commit, lock
  acquired before edit)
- Check pre-task failure retrieval was performed
- Block subagent spawning from within a subagent

### PostToolUse

Runs **after** an action completes. Cannot block the action that just
ran, but can:

- Write audit log entries
- Annotate the action with metadata
- Trigger follow-on checks (e.g., audit-write hook always runs after
  any tool use)
- Surface anomalies to the next PreToolUse

---

## Exit Code Protocol

| Exit Code | Meaning |
|---|---|
| `0` | Allow — action proceeds |
| `2` | **Hard block** — action does not run |
| any other (1, 3, ...) | Treated as error → **fail-closed** → block |

This is non-negotiable. A hook that crashes does not allow the action;
it blocks. The fail-closed default is what makes the system robust to
hook bugs.

### Why Fail-Closed

The alternative (fail-open: hook crashes → allow) treats the hook as
advisory. That is what happens by accident in most agent systems:
"the check broke, but the work still got through." This framework
inverts the default — broken check stops the work.

The cost is occasional false negatives (legitimate work blocked by a
hook bug). The mitigation is the operator override pattern below.

---

## Standard Hook Inventory

The framework ships a sanitized set of hook examples in `hooks/`. Each
covers a specific enforcement concern.

### PreToolUse Hooks

| Hook | Enforces |
|---|---|
| `check-bulletin` | Bulletin write format and required fields |
| `check-bulletin-order` | Append-only ordering — WORKING before DONE |
| `check-lock` | File lock held before edit |
| `check-locked-states` | Path-qualified locked region matching |
| `check-failure-lib` | Pre-task failure retrieval performed |
| `check-agent-spawn` | Spawn authorization — manifest attached, parent is orchestrator |
| `check-orchestrator-edit` | Operator-zone directories (e.g., `.claude/`) protected from agent edits |
| `check-git` | Git operations gated on appropriate authority |

### PostToolUse Hooks

| Hook | Records |
|---|---|
| `audit-write` | Append-only audit log entry for every tool use |

### Utility Hooks

| Hook | Purpose |
|---|---|
| `override-pattern.example` | Operator override with TTL — fail-closed even when overriding |
| `fail-closed-template.example` | Starting template for any new hook |

Implementations are example-only and use template placeholders. Your
deployment substitutes paths and identifiers.

---

## Hook Inputs and Outputs

A PreToolUse hook receives a structured payload describing the action:

```
{
  "tool": "Edit",
  "params": { "file": "src/billing/invoice.ts", "..." : "..." },
  "agent_id": "agent-fe",
  "session_id": "...",
  "manifest_id": "...",
  "correlation_id": "..."
}
```

The hook reads what it needs and exits. It may also write to:

- The audit log (always — every hook decision is recorded)
- A diagnostic log (optional — for hook debugging)

A hook that mutates application state is doing too much. Hooks decide;
they do not act on the world.

---

## Operator Override

Sometimes legitimate work is blocked by a false-positive. The override
pattern provides an escape valve **without abandoning fail-closed.**

### How Override Works

1. The operator places an override marker (e.g., a sentinel file with
   a TTL) in a designated location.
2. Affected hooks check for the marker.
3. If the marker exists and has not expired, the hook permits the
   action.
4. The override use is logged to the audit trail with the operator's
   identity and the action that was permitted.
5. The marker auto-expires after a short TTL (default 10 minutes).

### Override Rules

| Rule | Detail |
|---|---|
| TTL-bounded | No permanent overrides ever |
| Audit on every use | Every action permitted by override is logged |
| Subagents do not inherit | Override applies to the operator's actions, not to spawned agents acting on their own |
| Single override at a time | Granular overrides preferred over broad ones |
| Override use is a tracked metric | Frequent override is a signal to refine hooks, not a steady state |

### Why Subagents Do Not Inherit

If an override granted to the operator transitively applied to all
spawned agents, the override would become a backdoor: spawn an agent
during an override window, and the agent runs unchecked. The framework
prevents this — the override checks the immediate caller's identity,
not the session.

This rule is enforced in the override hook itself. See
`hooks/utils/override-pattern.example.js` for the pattern.

---

## Degraded Mode

When the runtime that supports hooks is itself unavailable or
malfunctioning, the framework enters **degraded mode**.

### Degraded Mode Behavior

- All higher-risk actions are blocked (default-deny)
- LOW-risk actions may proceed if a fallback hook is available
- The operator is alerted
- A degraded-mode event is logged
- No work moves to COMPLETE while degraded

### Recovery

Recovery is operator-initiated. The framework does not silently
"recover" — every entry into and exit from degraded mode is logged
and reviewed.

---

## Hook Governance

Hooks are themselves governance artifacts. They are also code, and
therefore can have bugs. The framework treats them with the same
discipline applied to any code path.

| Rule | Detail |
|---|---|
| Hooks live in operator-zone | Agents cannot read or modify hooks |
| Hook changes go through normal review | Manifest, QA, audit |
| Hook bugs produce FailureRecords | Same lifecycle as any other defect |
| New hooks start fail-closed | Use the template; do not invent your own default |
| Hook performance is a tracked metric | A slow hook silently degrades agent throughput |

A hook that is treated as "cannot be wrong" eventually is wrong, and
when it fails, fails silently. The discipline above prevents that.

---

## Hooks vs Runtime Policy Layer

The framework's hook system is separate from a runtime policy layer
(such as a runtime governance / identity / sandboxing layer in your
infrastructure). They are complementary, not competing.

| Layer | What It Governs |
|---|---|
| Runtime policy layer | What agents are permitted to do — identity, capabilities, network |
| Hooks (this framework) | Whether the agent followed the operating model — manifest attached, bulletin written, lock held |

Hooks operate at the action-level inside an agent session. The
runtime policy layer operates at the agent-level — defining what
the agent is allowed to attempt at all. Both are needed; neither
replaces the other. See `docs/guides/runtime-policy-integration.md`.

---

## Hook Performance

Hooks run synchronously on the agent's critical path. A 200ms hook
multiplied by 50 actions per session is 10 seconds of overhead. Two
slow hooks compound.

Performance discipline:

- Hooks should complete in ≤ 50ms typical, ≤ 200ms worst case
- A hook that needs network access should fail fast on timeout
- Database queries from hooks should be index-only
- File-based reads should be small (line-by-line, not whole-file)

A hook that exceeds these budgets is itself a candidate for FailureRecord.

---

## Common Hook Mistakes

| Mistake | Effect |
|---|---|
| Fail-open by accident — exit(0) on error path | The check silently doesn't run |
| Mutating state inside a hook | Hooks should decide, not act |
| Forgetting to audit override use | Backdoor with no record |
| Subagent inherits override | Spawn-then-act bypass |
| Slow hook with a critical-path query | Throughput degrades; pressure builds to disable hooks |
| New hook without the fail-closed template | Drifts from the framework default |

---

## Related

- `docs/control-plane/audit-trail-patterns.md` — what hooks write to
  the audit log.
- `docs/control-plane/meta-governance.md` — "hook bypass via override"
  is failure mode #3.
- `docs/guides/runtime-policy-integration.md` — separation between
  hook layer and runtime policy layer.
- `hooks/` — sanitized example implementations.
