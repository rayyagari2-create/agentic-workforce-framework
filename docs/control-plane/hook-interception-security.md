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
- `subagent_type` is in the allowed roster
- `taskId` is non-guessable (ULID or session-scoped identifier)

If any check fails: `exit(2)`. Block the spawn.

### Fail closed for missing or invalid manifests

If the hook cannot read the manifest file: block.
If the manifest JSON is malformed: block.
If the manifest schema validation fails: block.
If the manifest is stale: block.

The only path to `exit(0)` is full validation success.

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
