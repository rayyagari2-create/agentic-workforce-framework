## About this file

- **Purpose:** The live file-lock table. Source of truth for which
  agent currently owns which file in an active session. Two agents
  must never hold the same file concurrently.
- **Who writes:** Orchestrator writes on lock acquisition. The owning
  agent writes the `RELEASED` line on release. No one else modifies
  this file.
- **Mutability:** Append-on-acquire; append-on-release. Never delete
  prior rows within a session. Prior sessions' released entries may
  be archived on session close.
- **How to initialize:** Start with the empty table below. The
  Orchestrator populates it during Phase 3 (File Ownership Map).

---

# Agent Locks

The Orchestrator populates this table during Phase 3 of the
orchestration loop. Every file an executor will touch in the session
is locked here before Phase 5 (Spawn). No lock = no spawn.

---

## Format

Each lock is a block with these fields, separated by a blank line:

```
FILE:        <path>
LOCKED BY:   <agent label, e.g., AGENT-1>
TASK:        <one-line task description>
STATUS:      IN PROGRESS | RELEASED
WAVE:        <wave number>
STARTED:     <ISO 8601 timestamp>
RELEASED:    <ISO 8601 timestamp, or "-" if still IN PROGRESS>
TASK SLUG:   <short identifier used in handoffs>
```

**Hard rules:**

1. Every lock must be released in the **same session** it was
   acquired. A lock left `IN PROGRESS` at session close is a D2=0
   hit (falsified session close) — the session cannot close.
2. Only the Orchestrator writes `STATUS: IN PROGRESS` (on acquire).
   Only the owning agent writes `RELEASED` with the release timestamp.
3. Never delete a row mid-session. Released rows remain visible until
   the Orchestrator archives the session.
4. Wave-`N` agents may not start until all wave-`N-1` locks on files
   they depend on show `STATUS: RELEASED`.

---

## Active Locks

<!-- Orchestrator appends below this line. Format example follows. -->

```
FILE:        [REPLACE THIS: path]
LOCKED BY:   [REPLACE THIS: agent label]
TASK:        [REPLACE THIS: one-line description]
STATUS:      IN PROGRESS
WAVE:        [REPLACE THIS: wave number]
STARTED:     [REPLACE THIS: ISO 8601 timestamp]
RELEASED:    -
TASK SLUG:   [REPLACE THIS: short identifier]
```

---

## Worked Example

A populated lock entry for a single file in an active session:

```
FILE:        src/auth/session.ts
LOCKED BY:   AGENT-1
TASK:        Migrate session token storage to signed JWT
STATUS:      IN PROGRESS
WAVE:        1
STARTED:     2026-04-24T14:35:02Z
RELEASED:    -
TASK SLUG:   auth-jwt-migration
```

After the agent completes and writes the release line:

```
FILE:        src/auth/session.ts
LOCKED BY:   AGENT-1
TASK:        Migrate session token storage to signed JWT
STATUS:      RELEASED
WAVE:        1
STARTED:     2026-04-24T14:35:02Z
RELEASED:    2026-04-24T15:02:17Z
TASK SLUG:   auth-jwt-migration
```

---

## Lock Acquisition Sequence

The Orchestrator executes this sequence in Phase 3 for every file in
the ownership map:

1. Read this file. Check that no existing `IN PROGRESS` lock names
   the same path.
2. If a conflict exists → halt. Surface the conflict to the founder.
3. If no conflict → append a new lock block with `STATUS: IN PROGRESS`
   and `RELEASED: -`.
4. Append a bulletin entry:
   ```
   [YYYY-MM-DD HH:MM] [ORCHESTRATOR] LOCKED: <file> for <agent> wave <N>
   ```

## Lock Release Sequence

The owning agent, as its last action before returning to the
Orchestrator:

1. Finds its own block in this file (matching on `FILE` + `LOCKED BY`
   + `STATUS: IN PROGRESS`).
2. Edits `STATUS: IN PROGRESS` → `STATUS: RELEASED`.
3. Edits `RELEASED: -` → `RELEASED: <current ISO 8601 timestamp>`.
4. Appends a bulletin entry:
   ```
   [YYYY-MM-DD HH:MM] [AGENT-N] RELEASED: <file list>
   ```

---

## Cross-references

- `agents/orchestrator.md` — Phase 3 and Phase 5 consume this file
- `governance/locked-states.md` — files that are **never** unlockable
  without HITL
- `governance/agent-bulletin.md` — companion audit trail
