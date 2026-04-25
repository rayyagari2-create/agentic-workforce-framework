# PreToolUse hooks

PreToolUse hooks run **before** a tool call. They decide whether the call
proceeds.

## Input contract

The runtime invokes the hook with a JSON payload on stdin:

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": ".agent-workspace/bulletin.md",
    "content": "..."
  },
  "context": {
    "session_id": "01HX...",
    "agent_id": "agent-orchestrator",
    "agent_depth": 0,
    "correlation_id": "01HX...",
    "session_reads": [".agent-workspace/bulletin.md"],
    "acquired_locks": [],
    "task": {
      "task_id": "01HX...",
      "risk": "medium"
    }
  }
}
```

The exact field names depend on your runtime. Adapt as needed; the **shape**
matters more than the field names. Your hook code should treat the payload
defensively every field could be missing.

## Output contract

A PreToolUse hook signals its decision via **exit code only**:

- `exit(0)` allow the tool call to proceed
- `exit(2)` block the tool call

The hook may write a human-readable explanation to stderr; the runtime will
surface it to the agent on block. Do not rely on stdout the runtime may
ignore it.

## Audit requirement

**Every** PreToolUse hook MUST write an audit entry both on allow and on
block. A blocked call is just as much an event as an allowed one, and an
audit log that only records permitted calls is incomplete by design.

The audit write happens **after** the decision is made, but **before** the
process exits. The order matters: if the audit write fails, the hook should
still exit fail-closed (`exit(2)`).

In production, the audit write is typically delegated to a small helper that
appends a JSONL line atomically. See
`hooks/post-tool-use/audit-write.example.js` for a template.

## Fail-closed default

Hooks fail closed. This is non-negotiable.

- If the input cannot be parsed → `exit(2)`
- If a required context field is missing → `exit(2)`
- If a referenced state file cannot be read → `exit(2)`
- If the hook hits an unexpected branch → `exit(2)`
- If the hook throws an uncaught exception → process crashes → runtime
  treats it as `exit(2)`

A `try/catch` block that silently swallows the error and falls through to
`exit(0)` is a critical bug. **Treat such code as a fail-open vulnerability
and remove it on sight.**

## Performance

Hooks run on the hot path of every tool call. Keep them fast.

- Target <100ms wall-clock
- Avoid network calls. If you must, use a local cache and a tight timeout.
- Avoid heavy file scans. Pre-compute summaries (e.g., a locked-files index)
  and refresh them on a timer rather than per-call.

## Testing checklist

For every PreToolUse hook you ship, verify:

1. Allow case: well-formed input, all preconditions met → exits `0`
2. Block case: well-formed input, precondition violated → exits `2`
3. Malformed input: invalid JSON on stdin → exits `2`
4. Missing context: required field absent → exits `2`
5. Crash path: throw inside the main logic → process exits non-zero (and the
   runtime treats it as block)
6. Audit: every code path writes exactly one audit entry
