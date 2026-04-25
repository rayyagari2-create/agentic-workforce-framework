# PostToolUse hooks

PostToolUse hooks run **after** a tool call has executed. They cannot block
the call it has already happened. They exist to record, observe, and emit
audit-grade evidence.

## Input contract

The runtime invokes the hook with a JSON payload on stdin that includes the
tool result:

```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": ".agent-workspace/bulletin.md",
    "content": "..."
  },
  "tool_result": {
    "status": "success",
    "bytes_written": 412
  },
  "context": {
    "session_id": "01HX...",
    "agent_id": "agent-orchestrator",
    "agent_depth": 0,
    "correlation_id": "01HX..."
  }
}
```

The exact shape depends on your runtime. Treat all fields as optional and
parse defensively.

## Output contract

PostToolUse hooks do **not** block. The runtime ignores their exit code for
the purpose of allowing or denying the tool call (the call already ran).

That said, **exit code still matters for observability**:

- `exit(0)` hook ran cleanly
- non-zero exit hook failed; the runtime should surface the failure to
  the operator

## Failure must not be silent

This is the most important rule for PostToolUse hooks: **never swallow an
error**. A PostToolUse hook that silently drops an audit write is worse than
no hook at all it produces the *appearance* of an audit trail without the
substance.

If the hook hits an error:

1. Re-raise / let the exception propagate, **or**
2. Write a clear diagnostic to stderr and exit non-zero

Do not catch and continue. Do not write to stdout and hope the operator
notices. The runtime is the channel; use it.

## Atomic writes

PostToolUse hooks frequently append to log files. Append-only writes are
inherently safer than read-modify-write, but for shared log files you should
still use `O_APPEND` semantics (the default for `appendFile` in Node) and
avoid truncating the file under any circumstance.

If the log destination becomes unavailable (full disk, permission flip,
file moved), the hook should fail loudly. The audit log is the spine of
the trust system; degraded mode here is not acceptable.

## Performance

PostToolUse hooks run on every successful tool call. Keep them under
~200ms. If you need heavier processing (e.g., correlation-aware diff
extraction), enqueue the work to a background process and have the hook
just append the event marker.

## Testing checklist

For every PostToolUse hook you ship, verify:

1. Happy path: well-formed input → exits `0`, audit entry written
2. Malformed input: invalid JSON on stdin → exits non-zero, error visible
3. Destination unavailable: append target unwritable → exits non-zero, error
   visible
4. Concurrent calls: two hooks running at once → no interleaved or torn
   writes in the audit log
