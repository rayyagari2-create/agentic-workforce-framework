# claude-code-settings.example.json

A sanitized Claude Code `settings.json` showing how to wire the three-point
agent spawn control loop and how to scope `Agent(...)` permissions to a
fixed roster.

JSON does not support comments, so the explanation lives here.

---

## Replacing the placeholders

The `permissions.allow` list uses bracketed placeholder names like
`[ORCHESTRATOR_AGENT]`, `[SERVER_AGENT]`, etc. You **must** replace these
with the actual agent role names you defined in `agents/`. Claude Code
matches the literal string after `Agent(` against the `subagent_type`
field in the spawn payload — a placeholder left in the file will not match
any real agent.

Recommended substitution:

| Placeholder            | Replace with the role name of your...      |
|------------------------|--------------------------------------------|
| `[ORCHESTRATOR_AGENT]` | top-level orchestrator                     |
| `[SERVER_AGENT]`       | backend / server-side worker agent         |
| `[FRONTEND_AGENT]`     | frontend / UI worker agent                 |
| `[QA_AGENT]`           | QA / verification agent                    |
| `[FIX_AGENT]`          | bug-fix / remediation agent                |

If you have additional roles, add them to the `allow` list. If you do not
use a role, remove its line — every entry in `allow` is an attack surface
if the role's instruction file is ever compromised.

---

## What each section does

### `hooks.PreToolUse` (matcher: `Agent`)

Runs `check-agent-spawn.example.js` before every `Agent(...)` call. The
hook performs the eight-step sidecar manifest verification documented in
[`hooks/README.md`](README.md). Exit code 2 hard-blocks the spawn; exit 0
allows it.

### `hooks.SubagentStart` (matcher: `""`)

Runs `check-subagent-start.example.js` at the moment the subagent process
starts. The empty matcher means "fire on every subagent start" — there is
only one start event per spawn, so over-broad matching is not a cost
concern. This hook re-reads runtime state (locks, bulletin head, autonomy
registry) to catch drift between manifest creation and actual execution.

### `hooks.PostToolUse` (matcher: `Agent`)

Runs `check-agent-spawn-result.example.js` after every `Agent(...)` call
returns. PostToolUse hooks **cannot block** — the call has already run —
but they can audit the result, confirm bulletin entries the subagent was
required to write, and feed the trust scoring pipeline.

### `permissions.allow`

The fixed roster of subagent roles permitted to be spawned. `Agent(<role>)`
is matched against `tool_input.subagent_type` exactly. Anything not on this
list cannot be spawned regardless of how the request is constructed.

### `permissions.deny`

Explicitly denies built-in subagent types that ship with Claude Code
(`Explore`, `Plan`) so they cannot be invoked from inside this workspace.
Use the framework's own agents instead — they carry the manifest, trust,
and audit affordances the built-ins lack.

---

## Installing

1. Copy `claude-code-settings.example.json` to `.claude/settings.json` in
   your project.
2. Replace every `[PLACEHOLDER]` agent name with a real role.
3. Strip the `.example` suffix from each hook filename, or update the
   `command` strings to point at your sanitized copies.
4. Verify the hook files are executable and accessible from the working
   directory Claude Code launches in.
5. Test fail-closed behavior before relying on it: corrupt a manifest
   sidecar and confirm the spawn is blocked with a descriptive error.
