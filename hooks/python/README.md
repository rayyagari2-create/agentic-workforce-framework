# Python Hooks for Agentic Workforce Framework

Python ports of the framework's reference Claude Code hooks. **For Python-first
teams. Shadow/parallel validation recommended before retiring the JS hooks.**

> **Requirement: Python 3.10+.** No third-party dependencies — every hook uses
> only the standard library (`sys`, `json`, `os`, `re`, `pathlib`, `hashlib`,
> `datetime`).

## Hook contract

Every hook in this directory follows the same I/O contract:

- Reads the Claude Code hook payload as a single JSON document on stdin.
- `exit(2)` is a **hard block** — the runtime refuses the tool call and
  surfaces the stderr message to the agent.
- `exit(0)` **allows** the call.
- No other exit codes are emitted by these hooks.

This matches the JS reference hooks so the two implementations can run in
parallel, and a deviation from one is a deviation from the other.

## Hooks

### `pre_tool_use/check_agent_spawn.py`
Validates Agent-tool spawns against a sidecar manifest: `[MANIFEST:taskId]`
token in the description, required fields, session_id match, roster, mtime
freshness (≤ 60s), prompt-hash, HITL approval for high/critical risk, and
a 30-minute TTL.

### `pre_tool_use/check_audit_write.py`
Append-only guard for the audit log. Blocks any `Write` or `Edit` whose
`file_path` equals `AUDIT_LOG`. Audit entries are written exclusively by
`post_tool_use/audit_write.py`.

### `pre_tool_use/check_bulletin_order.py`
Enforces WORKING-before-DONE on the shared bulletin file. A `[DONE]` entry is
allowed only if a `[WORKING]` entry already exists somewhere in the bulletin
file. (Raw Claude Code payloads do not carry a `session_id`, so session-scoped
matching is not possible — this hook checks the looser file-wide invariant.)

### `pre_tool_use/check_founder_override.py`
Gates writes to founder-protected paths. Allows the call only when a
TTL-bounded override file exists with a valid `issued_at` (≤ 15 minutes old)
and a non-trivial reason. (The depth-based subagent gate from the JS hook is
omitted because raw payloads do not carry `agent_depth`; the override file
is the sole gate.)

### `pre_tool_use/check_locked_states.py`
Path-qualified lock matching. Each entry in `LOCKED_STATES` names a
fully-qualified path; any `Write`/`Edit` to that exact path is blocked.
Full-path equality (not basename) avoids false-positive matches across
same-named files in different directories. (Raw Claude Code payloads do not
carry `agent_id`, so owner-based unlocking from the JS hook is omitted —
locked paths are blocked unconditionally.)

### `pre_tool_use/check_orchestrator_edit.py`
Blocks all `Write`/`Edit` calls targeting orchestrator-protected paths in
`AWF_ORCHESTRATOR_PATHS`. (Raw Claude Code payloads do not carry
`agent_depth`, so the orchestrator cannot be distinguished from a subagent;
mutate these paths via the founder-override flow or another out-of-band
mechanism.)

### `post_tool_use/audit_write.py`
Appends one JSONL audit entry per tool call. Logs an SHA-256 of the
canonicalized `tool_input` rather than the input itself, so audit entries
remain compact and tamper-evident.

## Install

1. **Copy** the hooks you want into your project's `.claude/hooks/`
   directory (the layout under `.claude/hooks/` does not have to match the
   layout in this repo — Claude Code wires by absolute path).
2. **Make the files executable**: `chmod +x .claude/hooks/<file>.py`.
3. **Wire** them in `.claude/settings.json` (see below).
4. **Set environment variables** referenced by each hook (search each file
   for `os.environ.get` to find them — placeholders like
   `{path/to/your/...}` make a missing configuration fail loudly).

## Settings — Python only

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_agent_spawn.py" }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_audit_write.py" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_bulletin_order.py" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_founder_override.py" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_locked_states.py" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_orchestrator_edit.py" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/audit_write.py" }
        ]
      }
    ]
  }
}
```

## Settings — parallel mode (JS + Python)

Run both implementations in shadow mode while you migrate. Both fire on every
matching call; if either one exits 2, Claude Code blocks. Compare the JS and
Python decisions in your audit log; once they agree across a representative
window of traffic, retire the JS commands by removing them from the array.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          { "type": "command",
            "command": "node /abs/path/to/.claude/hooks/check-agent-spawn.js" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_agent_spawn.py" }
        ]
      },
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command",
            "command": "node /abs/path/to/.claude/hooks/check-bulletin-order.js" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_bulletin_order.py" },
          { "type": "command",
            "command": "node /abs/path/to/.claude/hooks/check-locked-states.js" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/check_locked_states.py" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command",
            "command": "node /abs/path/to/.claude/hooks/audit-write.js" },
          { "type": "command",
            "command": "python3 /abs/path/to/.claude/hooks/audit_write.py" }
        ]
      }
    ]
  }
}
```

While running in parallel, point the two implementations at distinct audit
logs (set `AUDIT_LOG` differently in each command's environment) so you can
diff their decision streams.

## Environment variables

| Variable                     | Used by                                                                                  | Default                              |
|------------------------------|------------------------------------------------------------------------------------------|--------------------------------------|
| `AWF_PROJECT_ROOT`           | `check_agent_spawn`                                                                      | `os.getcwd()`                        |
| `AWF_MANIFEST_DIR`           | `check_agent_spawn`                                                                      | `{path/to/manifests}`                |
| `AWF_ORCHESTRATOR_PATHS`     | `check_orchestrator_edit`                                                                | manifests dir + roster + config      |
| `BULLETIN_PATH`              | `check_bulletin_order`                                                                   | `{path/to/your/bulletin.md}`         |
| `LOCKED_STATES`              | `check_locked_states`                                                                    | `{path/to/your/locks/locked-states.json}` |
| `FOUNDER_OVERRIDE_FILE`      | `check_founder_override`                                                                 | `{path/to/your/founder-override.json}` |
| `FOUNDER_PROTECTED_PATHS`    | `check_founder_override`                                                                 | `{path/to/founder-only-config.json}:{path/to/release-keys}/` |
| `AUDIT_LOG`                  | `check_audit_write`, `audit_write`, `check_bulletin_order`, `check_locked_states`        | `{path/to/your/audit-log.jsonl}`     |
| `HOOK_MODE`                  | `check_agent_spawn` (`shadow` or `enforce`)                                              | `shadow`                             |

## Smoke-testing a single hook

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"/tmp/audit.jsonl","content":"x"}}' \
  | AUDIT_LOG=/tmp/audit.jsonl \
    python3 hooks/python/pre_tool_use/check_audit_write.py
echo "exit=$?"   # → exit=2
```

Every hook follows the same shape, so the same `echo … | python3 hook.py;
echo "exit=$?"` recipe works for all of them — feed an allow case and a
violation case in turn.
