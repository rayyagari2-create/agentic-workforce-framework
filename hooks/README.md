# Hooks

OS-level enforcement examples for agentic workforces. These hooks implement the
Claude Code hook protocol small scripts that the runtime invokes before or
after a tool call, and that decide whether the call proceeds.

All examples in this directory are **sanitized templates**. Paths such as
`.agent-workspace/bulletin.md`, `.agent-workspace/locks/`, and
`.agent-workspace/failure-library/` are placeholders. Adapt them to your
project layout before use.

---

## Hook types

The framework uses two hook lifecycle points:

### PreToolUse

Fires **before** a tool call is executed. Receives the proposed tool name and
inputs. Returns a decision via exit code:

- `exit(0)` allow the call to proceed
- `exit(2)` hard block; the runtime refuses the call and surfaces the
  message to the agent

PreToolUse is the enforcement point. This is where you check locks, verify
read-before-write, validate spawn authority, and enforce risk gates.

### PostToolUse

Fires **after** a tool call has executed. Receives the tool result. Cannot
block the call (it already ran), but it can record, audit, and emit telemetry.

PostToolUse is the observation point. This is where you append to the audit
log, capture before/after state, and emit correlation IDs.

---

## Exit code protocol

| Exit code | Meaning              |
|-----------|----------------------|
| 0         | Allow                |
| 2         | Hard block           |
| anything else | Treated as block (fail-closed default) |

`exit(1)` is **ambiguous**: many runtimes treat it as a generic error. The
hook framework rejects ambiguity. Use only `0` or `2`. Anything else is
interpreted as `2` by the runtime and any uncaught exception in the hook
script is also treated as `2`.

This is the **fail-closed default**. If the hook crashes, cannot read its
inputs, or hits an unexpected branch, the call is blocked. Hooks are the
last line of defense silent failure here is worse than a false positive.

**PreToolUse enforcement hooks** use exit(0) to allow and exit(2)
to block. Any unexpected error should fail closed (exit(2)) in
enforce mode. These hooks run before the tool call executes and
can prevent it.

**PostToolUse hooks are observational.** They run after the tool
call has already completed and cannot prevent it. A PostToolUse
audit hook may exit non-zero to surface an audit gap to the
operator, but deployments should document how their runtime
treats PostToolUse non-zero exits. Do not assume PostToolUse
exit(2) blocks anything.

**SDK compatibility.** These examples target command-based runtime
hook execution (exit 0 = allow, exit 2 = hard block). SDK-native
hook APIs may require structured JSON responses instead of
exit-code-only behavior. Validate hook protocol compatibility
before using these examples with an SDK runner.

---

## When to use a hook vs runtime policy

Hooks and the runtime policy layer (the AGT-style enforcement layer above the
agent) solve different problems. Pick deliberately.

| Use a hook when                                  | Use the runtime policy layer when            |
|--------------------------------------------------|----------------------------------------------|
| Enforcement is **local to a single tool call**   | Enforcement requires identity (DID, roles)   |
| The check is fast (<100ms)                       | The check involves cross-session state       |
| The check is deterministic                       | The check is rule-based and policy-versioned |
| You need fail-closed defaults                    | You need sandboxing and isolation            |
| Example: read-before-write, lock acquisition     | Example: which agent may call which MCP tool |

Hooks are **mechanism**. The runtime policy layer is **policy**. Hooks
enforce; the runtime decides what to enforce.

A mature deployment uses both: the runtime policy layer makes the call about
*what* is allowed for *which agent in which workspace*, and hooks enforce the
*shape* of every individual tool call.

---

## Three-Point Agent Spawn Control Loop

Agent spawning is governed by three hooks at three lifecycle points. Each
catches a class of failure the others cannot:

| Lifecycle point        | Hook                                  | Purpose                                          |
|------------------------|---------------------------------------|--------------------------------------------------|
| PreToolUse (Agent)     | `check-agent-spawn.example.js`        | Pre-spawn manifest validation                    |
| SubagentStart          | `check-subagent-start.example.js`     | Start-time runtime state verification            |
| PostToolUse (Agent)    | `check-agent-spawn-result.example.js` | Result audit and bulletin check                  |

- **PreToolUse → `check-agent-spawn.example.js`** verifies that a sidecar
  manifest exists, was minted by the orchestrator within the freshness
  window, and matches the session, intended agent role, and SHA-256 of the
  prompt. Blocks spawns that lack provenance.
- **SubagentStart → `check-subagent-start.example.js`** runs once the
  subagent process is starting. Re-reads runtime state files (locks,
  bulletin head, autonomy registry) at the moment of execution to catch
  state drift between manifest creation and actual spawn.
- **PostToolUse → `check-agent-spawn-result.example.js`** audits the spawn
  result, confirms the bulletin entry the subagent was required to write,
  and records the trust event. Cannot block (the call already ran), but it
  records the violation and feeds the next pre-spawn decision.

The public repo does not expose all hooks from the private reference
implementation. The private reference implementation currently uses 13
hooks covering agent spawn, file locks, bulletin order, audit writes, git
gates, build state, and post-agent result validation. This public repo
includes sanitized examples of the core agent spawn control pattern.

---

## File layout

```
hooks/
├── README.md
├── claude-code-settings.example.json
├── claude-code-settings-README.md
├── pre-tool-use/
│   ├── README.md
│   ├── check-agent-spawn.example.js      ← Claude Code native
│   ├── check-bulletin-order.example.js   ← Framework-enriched
│   ├── check-bulletin.example.js         ← Framework-enriched
│   ├── check-failure-lib.example.js      ← Framework-enriched
│   ├── check-lock.example.js             ← Framework-enriched
│   └── check-locked-states.example.js    ← Framework-enriched
├── sub-agent-start/
│   ├── check-subagent-start.example.js   ← Claude Code native
│   └── (README if exists)
├── post-tool-use/
│   ├── README.md
│   ├── audit-write.example.js            ← Framework-enriched
│   └── check-agent-spawn-result.example.js ← Claude Code native
└── utils/
    ├── fail-closed-template.example.js
    ├── normalize-claude-code-payload.example.js
    └── override-pattern.example.js
```

---

## Claude Code Native vs Framework-Enriched Hooks

Claude Code native hooks work with the standard Claude Code
PreToolUse payload shape out of the box. No enrichment required.

Framework-enriched hooks require additional context fields
(agent_id, agent_depth, session_reads, etc.) that Claude Code
does not provide by default. These hooks need a payload
enrichment layer before use. See the warning block at the top
of each enriched hook file.

| Hook | Category |
|---|---|
| check-agent-spawn.example.js | Claude Code native |
| check-subagent-start.example.js | Claude Code native |
| check-agent-spawn-result.example.js | Claude Code native |
| audit-write.example.js | Framework-enriched |
| check-bulletin.example.js | Framework-enriched |
| check-bulletin-order.example.js | Framework-enriched |
| check-failure-lib.example.js | Framework-enriched |
| check-lock.example.js | Framework-enriched |
| check-locked-states.example.js | Framework-enriched |

---

## Adapting these examples

1. Copy the file. Strip the `.example` from the name.
2. Replace `.agent-workspace/...` paths with the actual paths in your project.
3. Replace the placeholder audit log location with your audit destination.
4. Wire the hook into your runtime's hook configuration. For Claude Code,
   that is the `hooks` section of `settings.json`.
5. Test fail-closed behavior: deliberately corrupt the input and verify the
   hook exits `2`, not `0`.

The example files are intentionally short and commented. They are starting
points, not finished implementations.

---

## Invariants to preserve when adapting

- Never write a hook that exits `0` on a `try/catch` fallback path.
- Always write to the audit log **after** the enforcement decision, regardless
  of which branch was taken. A blocked call is still an event worth
  recording.
- Subagents never inherit operator overrides. Check `context.agent_depth`
  or equivalent.
- Path matching uses **full paths**, not basenames. See
  `check-locked-states.example.js`.
- Hook files live in an operator-controlled directory and are **not editable
  by agents**. If your runtime allows agents to write to the hook directory,
  every other guarantee in this framework collapses.
