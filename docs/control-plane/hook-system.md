# Hook System

**OS-level enforcement: PreToolUse, PostToolUse, fail-closed, and the
override pattern.**

Hooks are the deterministic backstop. Where the build state machine and
HITL gates are policy, hooks are the wire fence. They run outside the
agent process, so an agent cannot reason its way around them.

A hook decision is binary: `exit(0)` allows the action; `exit(2)`
blocks it. There is no soft-fail.

---

## The PreToolUse / PostToolUse Model

The agent runtime invokes hooks at two moments per tool call:

```
        agent calls a tool
                │
                ▼
       ┌─────────────────┐
       │  PreToolUse hook │
       │   exit(0) →      │ ─────► tool executes
       │   exit(2) →      │ ─────► tool BLOCKED; agent receives error
       └─────────────────┘
                │
                ▼ (only if PreToolUse passed)
        tool runs to completion
                │
                ▼
       ┌─────────────────┐
       │  PostToolUse hook│
       │   exit(0) →      │ ─────► result returned to agent
       │   exit(2) →      │ ─────► result REJECTED; logged; agent receives error
       └─────────────────┘
```

**PreToolUse** is the primary enforcement surface. It validates that
the agent has the right to perform the action it just requested, given
the current state of the bulletin, locks, manifest, and policy
artifacts.

**PostToolUse** validates the result. The most common case is
verifying that an audit-relevant action (a write to a governance file,
a commit attempt, a session-complete declaration) was accompanied by
the required side effects (audit log entry, bulletin entry, QA
verdict).

Both can block. PreToolUse blocks an action before it happens;
PostToolUse blocks a result from being returned and forces the agent
to retry or escalate.

---

## The exit(0) / exit(2) Protocol

```
exit(0)  →  ALLOW. Hook ran cleanly; no policy violation found.
exit(2)  →  BLOCK. Hook ran cleanly; policy violation detected.
exit(*)  →  BLOCK. Hook itself failed (parse error, missing dependency,
            unhandled exception). Treated as exit(2) — fail closed.
```

There is no `exit(1)` for "warning" or "advisory." A hook that found
something it did not like must block. If the policy itself is uncertain,
the hook author has not written the policy correctly.

### Why Two Exit Codes Only

The temptation to add an "exit(1) = warn" path is exactly the failure
mode the hook system exists to prevent. A warning that the agent can
choose to ignore is not enforcement; it is decoration. Either the
action is permitted or it is not.

If the policy genuinely needs a "soft" path — for example, a deprecation
that should warn now and block later — the right pattern is:

1. Hook runs as `exit(0)` today
2. Hook writes a `policy_violations` record with severity=WARN
3. Operator monitors the WARN volume
4. When ready, the hook is updated to `exit(2)` for the same condition

The decision to upgrade WARN to BLOCK lives in policy, not in the hook
exit code.

---

## Fail-Closed Design Principle

**Every hook fails closed.** A read error, a parse error, an
unexpected exception — any non-zero exit that is not the deliberate
`exit(2)` — is treated as a block.

The reason is asymmetric cost:

- **False positive (block when allow was correct):** annoying. The
  human investigates, the override pattern (below) is available, the
  policy may be refined. Cost is bounded.
- **False negative (allow when block was correct):** the action that
  should not have happened, happened. State is mutated. The audit
  trail is missing the would-have-been block. Cost is unbounded.

Fail-closed keeps the worse failure mode rare.

The single exception in the current implementation is one
known-fail-open path in `check-locked-states.js` when the locked-states
file is unreadable. It is filed as a P2 in the evolution queue and is
the kind of remediation work the hook system itself cannot prevent —
it requires human attention.

---

## Override Pattern with TTL

There must be a way to override a hook block without disabling the
hook. Disabling is permanent and silent; override is bounded and
visible.

### The Override Marker

```
Path:       .control-plane/.override-active
Format:     a single line containing an ISO 8601 timestamp
Lifetime:   10 minutes from creation
Authority:  any caller with a valid unexpired marker is granted override
```

A hook that finds the marker and validates the timestamp will allow the
action it would otherwise block. The marker is consumed on use — every
override is logged.

### Override Properties

1. **TTL is short by design.** 10 minutes is enough for a single
   targeted action; not enough to forget the marker exists.
2. **Scope is per-marker, not per-caller.** The marker grants override
   to whatever action runs while it is active. This was a deliberate
   correction from earlier designs that gated by caller type — caller
   type was a worse signal than marker presence.
3. **Every use is logged.** `audit/overrides.log` records the marker
   creation, the action that triggered the hook, and the outcome.
4. **The marker is in a control-plane directory** — agent processes
   cannot create the marker themselves. Creating an override is a
   human-only operation.

### When to Use the Override

The override exists for:

1. Diagnosing a hook false-positive in real time (validate the
   block, then refine the hook)
2. Recovering from a state where a hook is blocking work that needs to
   be done immediately for an unrelated reason
3. One-off operations where the hook policy does not yet have a
   structured exception path (and where the operation is too rare to
   justify writing one)

The override is **not** for:

- Routine work that "the hook is annoying about." If the hook is
  routinely annoying, the policy is wrong; refine the hook.
- Bypassing pre-spawn protocol. The override does not grant a path
  around the manifest requirement.
- Skipping QA. A SESSION COMPLETE without QA PASS is blocked by the
  hook layer; the override would log the bypass but the trust impact
  remains.

---

## Degraded Mode Behavior

When the runtime policy enforcement layer (the upstream policy SDK) is
unavailable, the system falls back to OS-level hooks alone.

### What Degraded Mode Looks Like

```
Normal:    Runtime policy layer (sub-ms) → hooks (defense in depth)
Degraded:  hooks (now the only enforcement)
```

In normal operation, hooks are a backstop — most violations are caught
upstream by the policy SDK. In degraded mode, hooks become primary.

### Degraded Mode Rules

1. **The fallback is automatic.** When the policy SDK does not
   respond, the adapter logs the unavailability and routes enforcement
   to the hook layer.
2. **An alert fires.** Operators are notified that the upstream layer
   is unavailable. Degraded mode is not a quiet state.
3. **Hooks were designed assuming this.** The hook coverage is
   intentionally redundant with policy SDK coverage for the highest-risk
   actions (commits, audit writes, control plane edits).
4. **Some checks may not be available.** Cryptographic identity checks,
   for example, depend on the policy SDK. In degraded mode, the system
   may have to refuse certain actions entirely rather than approve
   without identity verification.

The degraded mode rule is "fail safer, not faster." If a check cannot
be performed, the action is blocked.

---

## Hook Categories

Hooks group into five categories by what they enforce.

### Category 1 — Bulletin and Audit

| Hook | Enforces |
|---|---|
| `check-bulletin` | Bulletin write format is well-formed |
| `check-bulletin-order` | Append-only ordering of bulletin entries |
| `check-audit-write` | Audit log writes match the schema and signing requirement |
| `audit-write` | Performs the audit write itself (called by other hooks) |

These hooks make the audit trail trustworthy. A malformed bulletin
entry is rejected before it lands; an out-of-order entry is rejected;
an audit write that does not carry a correlation ID is rejected.

### Category 2 — Failure Library

| Hook | Enforces |
|---|---|
| `check-failure-lib` | Failure library writes match the FailureRecord schema |

Bad data in the failure library degrades pre-task retrieval, which
degrades pre-spawn classification, which degrades risk routing. The
failure library is too load-bearing to allow malformed entries.

### Category 3 — Locks and File Scope

| Hook | Enforces |
|---|---|
| `check-lock` | An agent cannot edit a file it does not hold a lock on |
| `check-locked-states` | Path-qualified enforcement of LOCKED-STATES (region-aware basename matching) |

These hooks prevent two agents from stepping on each other and
prevent any agent from editing a region marked as locked by an
operator decision.

### Category 4 — Spawn and Authority

| Hook | Enforces |
|---|---|
| `check-agent-spawn` | A spawn must reference a complete AgentTaskManifest |
| `check-subagent-start` | Subagents may not spawn subagents |
| `check-agent-spawn-result` | The spawn result is well-formed |

These are the hook-level expression of the pre-spawn protocol and the
"orchestrator owns routing" invariant.

### Category 5 — Git and Control Plane

| Hook | Enforces |
|---|---|
| `check-git` | Git operations require explicit human authorization for commits to protected branches |
| `check-orchestrator-edit` | The control plane directory is human-only — no agent edits |
| `check-override` | Validates the override marker (TTL, log record) |

Category 5 protects the artifacts that the rest of the system depends
on. An agent that could edit the control plane directory could disable
its own enforcement; the hook prevents that class of failure
categorically.

---

## Hook Governance Rules

These apply across all categories.

1. **All hooks are operator-zone.** They live in a control-plane
   directory. Agents have no access to read or edit the hook source.
2. **All hooks fail-closed.** Read or parse errors `exit(2)`, never
   `exit(0)`. Repeated for emphasis because this is the most important
   single rule.
3. **Override marker grants any caller override access.** Scope is
   controlled by TTL (10 minutes), not by caller type.
4. **Every override is logged** to the override log on every use.
5. **Hook updates require the same governance as control plane
   changes.** A hook change is a CRITICAL-risk action — it touches the
   enforcement layer. Boardroom session required.

---

## What Hooks Do Not Do

- **Hooks do not assess intent.** They check observable conditions
  (manifest presence, lock ownership, format conformance). They do not
  ask "is this the right thing to do."
- **Hooks do not score.** Trust scoring belongs in the autonomy plane.
  Hooks may flag a violation; the trust impact is computed by the
  scoring layer.
- **Hooks do not negotiate.** A hook cannot ask the agent to refine
  and retry. It blocks; the agent's caller (the orchestrator or the
  human) decides what to do.
- **Hooks do not replace runtime policy.** When both layers are
  available, runtime policy is primary; hooks are defense in depth.
  Degraded mode inverts that, with the limitations noted above.

---

## Related

- `pre-spawn-protocol.md` — defines the manifest that
  `check-agent-spawn` validates.
- `build-state-machine.md` — defines the QA invariants
  PostToolUse hooks enforce on session-complete.
- `audit-trail-patterns.md` — defines the audit format that
  `check-audit-write` enforces.
- `hitl-gates.md` — defines the gate decisions that hooks check the
  presence of.
- `meta-governance.md` — addresses the hook false-positive failure
  mode in the broader governance failure context.
