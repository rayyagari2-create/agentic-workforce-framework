# claude-code-settings.example.json

A sanitized Claude Code `settings.json` showing how to wire the three-point
agent spawn control loop and how to scope `Agent(...)` permissions in
Claude Code's runtime model.

JSON does not support comments, so the explanation lives here.

---

## The general-purpose model

Claude Code always passes `subagent_type: "general-purpose"` to the Agent
tool, regardless of which framework agent is spawning. The runtime
subagent_type is the harness type — it does **not** identify the agent.

This means the permission allow list contains a single entry:

```json
"allow": [
  "Agent(general-purpose)"
]
```

That single entry covers every spawn from every framework agent. Adding
`Agent([ORCHESTRATOR_AGENT])` or `Agent([SERVER_AGENT])` to this list does
nothing — Claude Code never invokes the Agent tool with those values.

Framework agent identity lives in two places, both outside the Claude Code
permission system:

1. **`manifest.agent_role`** — the sidecar manifest field that names the
   spawning agent. The PreToolUse hook validates this against an allowed
   roster (`ALLOWED_AGENT_ROLES` in `check-agent-spawn.example.js`).
2. **The hook layer** — `check-agent-spawn.example.js` reads the sidecar
   and enforces the roster. The Claude Code permission system grants
   permission to spawn at all; the hook decides which role may spawn.

If you want a fixed roster of allowed agent roles, edit
`ALLOWED_AGENT_ROLES` in the hook. Do not try to enumerate roles in
`permissions.allow` — that is a layer mismatch.

---

## What each section does

### `hooks.PreToolUse` (matcher: `Agent`)

Runs `check-agent-spawn.example.js` before every `Agent(...)` call. The
hook performs the full sidecar manifest verification documented in
[`hooks/README.md`](README.md) (roster, mtime, promptHash, schema, HITL,
TTL). Exit code 2 hard-blocks the spawn; exit 0 allows it.

Install path: `.claude/hooks/pre-tool-use/check-agent-spawn.js`

### `hooks.SubagentStart` (matcher: `""`)

Runs `check-subagent-start.example.js` at the moment the subagent process
starts. The empty matcher means "fire on every subagent start" — there is
only one start event per spawn, so over-broad matching is not a cost
concern. This hook re-reads runtime state (locks, bulletin head, autonomy
registry) to catch drift between manifest creation and actual execution.

Install path: `.claude/hooks/sub-agent-start/check-subagent-start.js`

### `hooks.PostToolUse` (matcher: `Agent`)

Runs `check-agent-spawn-result.example.js` after every `Agent(...)` call
returns. PostToolUse hooks **cannot block** — the call has already run —
but they can audit the result, confirm bulletin entries the subagent was
required to write, and feed the trust scoring pipeline.

Install path: `.claude/hooks/post-tool-use/check-agent-spawn-result.js`

### `permissions.allow`

Contains the single entry `Agent(general-purpose)`. Claude Code matches
`Agent(<value>)` against `tool_input.subagent_type` exactly, and Claude
Code always uses `general-purpose` as the runtime subagent_type. Role
identity is enforced by the hook (`manifest.agent_role`), not by this
list.

### `permissions.deny`

Explicitly denies built-in subagent types that ship with Claude Code
(`Explore`, `Plan`) so they cannot be invoked from inside this workspace.
Use the framework's own agents instead — they carry the manifest, trust,
and audit affordances the built-ins lack.

---

## Installing

1. Copy `claude-code-settings.example.json` to `.claude/settings.json` in
   your project.
2. Strip the `.example` suffix from each hook filename, preserving the
   subdirectory structure under `.claude/hooks/`:
   - `.claude/hooks/pre-tool-use/check-agent-spawn.js`
   - `.claude/hooks/sub-agent-start/check-subagent-start.js`
   - `.claude/hooks/post-tool-use/check-agent-spawn-result.js`
3. Edit `ALLOWED_AGENT_ROLES` in `check-agent-spawn.js` to list the
   `agent_role` values your orchestrator writes into sidecar manifests.
4. Verify the hook files are executable and accessible from the working
   directory Claude Code launches in. If your runtime starts the hook
   from a different working directory, set `AWF_PROJECT_ROOT` to your
   repo root.
5. Test fail-closed behavior before relying on it: corrupt a manifest
   sidecar and confirm the spawn is blocked with a descriptive error.
