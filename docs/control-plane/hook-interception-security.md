# Hook Interception Security

**The security principles that govern how OS-level hooks
intercept and validate agent actions.**

## Why Hook Security Matters

The hook layer is the enforcement boundary between the agent's
intent and actual system action. A hook that can be bypassed,
spoofed or injected into provides no real control. These
principles define how hooks must be designed to remain
trustworthy enforcement points.

## Core Security Principles

### Description carries only a manifest pointer

The Agent tool description field carries one structured token:

```
[MANIFEST:taskId]
```

Do not place full policy, secrets, business data, privilege claims
or routing instructions in the description. The hook extracts
the task ID and reads the sidecar manifest file independently.
The manifest is the contract. The description is the pointer.

Example:

```
description: "[MANIFEST:TASK-2026-04-25-001] Fix checkout validation"
```

The hook extracts `TASK-2026-04-25-001`, reads
`docs/manifests/TASK-2026-04-25-001.json`, and validates it.
The agent never sees the manifest content directly.

### Manifest must pass sidecar validation

Before any spawn is authorized, the manifest must pass:

- `session_id` matches the live Claude Code session
  (or sentinel `'session-id-unavailable'` with mtime as fallback)
- `issuedAt` is within the manifest TTL (30 minutes recommended)
- file path is normalized and within the expected manifests directory
- JSON schema validation passes (AJV against manifest schema)
- `agent_role` is in the allowed roster
- `taskId` is non-guessable (ULID or session-scoped identifier)

If any check fails: `exit(2)`. Block the spawn.

### Dual freshness gate: mtime + issuedAt

The hook validates manifest freshness through two independent checks.

**Primary freshness gate: file mtime must be <= 60 seconds old.**
This is filesystem evidence — external to the JSON payload and
harder to spoof. An attacker can copy sidecar JSON with a
manipulated `issuedAt`; they cannot fake the file mtime without
write access to the filesystem.

**Secondary freshness gate: `issuedAt` within configured TTL**
(default 30 minutes). This provides a longer window that
survives system clock skew and slow orchestrator operations.

Both checks must pass. A sidecar that passes `issuedAt` but fails
mtime is a replay candidate. A sidecar that passes mtime but
has an invalid `issuedAt` is malformed.

### subagent_type / agent_role model

Claude Code runtime `subagent_type` is always `"general-purpose"`
for all agent spawns via the Agent tool. This is the runtime
harness type — it does not identify which agent is spawning.

Framework agent identity lives in two places:

1. `manifest.agent_role` — the sidecar field validated by the hook
2. The allow list in `claude-code-settings` — grants permission to
   `Agent(general-purpose)`, not to individual named agents

The hook validates `manifest.agent_role` against the allowed
roster. Never attempt to derive agent identity from
`tool_input.subagent_type`.

### Fail closed for missing or invalid manifests

If the hook cannot read the manifest file: block.
If the manifest JSON is malformed: block.
If the manifest schema validation fails: block.
If the manifest is stale: block.

The only path to `exit(0)` is full validation success.

## Audit Failure Policy

The hook layer distinguishes between DENY and ALLOW decisions
when audit writes fail:

**DENY decisions**: the block stands regardless of audit failure.
The spawn does not proceed. Audit failure is logged to stderr
so operators know the audit trail has a gap.

**ALLOW decisions**: the spawn proceeds. Audit failure is logged
to stderr. Do not block legitimate approved spawns because
the audit bridge is unavailable — that turns every audit
outage into a denial-of-service attack on the agent workforce.

The audit trail is critical. But operational continuity for
approved spawns takes precedence over audit completeness.
If audit failures are frequent, treat it as an infrastructure
incident, not a governance gap.

### Fail closed for HIGH and CRITICAL risk tasks

For tasks with `riskLevel` HIGH or CRITICAL:

- `hitlApproved` must be `true` in the manifest
- The orchestrator must have obtained explicit human approval
  before writing the manifest
- The hook verifies `hitlApproved=true` before allowing spawn

Missing or false `hitlApproved` on HIGH/CRITICAL = `exit(2)`.

### Fail open only for explicitly low-risk, non-mutating reads

The one legitimate fail-open case: if a hook parse error occurs
on a non-Agent tool call that is clearly read-only and
non-mutating (documentation search, read-only inspection), the
hook may `exit(0)` after logging the error.

This is the exception. The default is fail closed.
Apply this exception only after explicit deliberate review,
not as a general error handling pattern.

### PostToolUse must verify result

PreToolUse validates intent before execution.
PostToolUse validates what actually happened after execution.

The PostToolUse hook should record:

- `outcome`: success / failure / unknown
- manifest correlation (which task this was)
- output summary (truncated, no PII)
- agent identity (`subagent_type` from manifest)

This gives the audit trail start-to-end coverage, not just
pre-execution intent.

### Prompt header is backup, not primary

The agent's prompt may contain a human-readable manifest
summary for the agent's reference. The hook must NOT rely
on prompt content for its validation decisions. Prompt content
is agent-visible and can be influenced by prompt injection.

Primary control field: sidecar manifest file (out of band)
Backup reference: prompt header (human-readable, not trusted)

## Hook Failure Modes to Avoid

| Anti-Pattern | Risk | Correct Approach |
|---|---|---|
| Trusting the prompt body for policy decisions | Prompt injection can override controls | Read the sidecar manifest file independently |
| Fail open on hook errors | Infrastructure failures become security gaps | Fail closed by default; log the error; block |
| Logging the full prompt in the audit trail | PII, secrets or business data in logs | Log manifest metadata only; truncate output summaries |
| Single-point PreToolUse with no PostToolUse | No verification that what was intended actually happened | Three-point control loop (Pre → SubagentStart → Post) |
| Permanent allow lists without TTL | Stale permissions accumulate over time | Manifest TTL enforced on every spawn; no permanent grants |

## Related Files

- `hooks/pre-tool-use/check-agent-spawn.example.js` — reference implementation
- `hooks/sub-agent-start/check-subagent-start.example.js` — correlation hook
- `hooks/post-tool-use/check-agent-spawn-result.example.js` — outcome recorder
- `security/threat-model.md` — STRIDE-style threat coverage
- `hooks/claude-code-settings.example.json` — three-point control loop wiring
