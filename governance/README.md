## About this file

- **Purpose:** Entry point for the `governance/` directory. Explains that
  these are **runtime operational files** the Orchestrator reads at
  startup — not documentation.
- **Who writes:** Humans (initial setup). After bootstrap, the
  Orchestrator and executing agents write to most of these files during
  sessions.
- **Mutability:** Read-only (this file itself). The files it describes
  have per-file mutability rules stated in their own headers.
- **How to initialize:** Copy the entire `governance/` directory into
  your deployment, then fill in `[REPLACE THIS]` markers in the order
  listed under **Setup order** below.

---

# Governance Directory

These files are the Orchestrator's live operating memory. Every time the
Orchestrator boots, it reads this directory in a defined order. Every
session appends entries here. These are not docs.

## Runtime files vs documentation

| `governance/` (this directory) | `docs/` (elsewhere in the repo) |
|---|---|
| Runtime operational state | Concept and protocol documentation |
| Read by the Orchestrator at every session startup | Read by humans and by agents during onboarding |
| Mutated continuously (bulletin, locks, build-status) | Stable; changes tracked in git |
| Template values filled per deployment | Deployment-agnostic |
| Part of the live control plane | Part of the framework itself |

If you are looking for *how autonomy tiers work* or *what a HITL gate
is*, read `docs/`. If you are looking for *which agent currently holds
which file* or *what the next P0 bug is*, read `governance/`.

## Setup order

Fill in files in this order on first deployment. Each depends on the
ones above.

1. **`project-conventions.md`** — repo name, model string, agent naming,
   voice. Every downstream file references these.
2. **`locked-states.md`** — files the workforce may never touch without
   explicit human override. Write these *before* any agent runs.
3. **`autonomy-registry.md`** — per-agent trust tier and gate level.
   New deployments start every agent at PROVISIONAL.
4. **`routing-table.md`** — which agent handles which task type. Without
   this, the Orchestrator cannot route.
5. **`hitl-gate.md`** — HITL configuration: risk levels, approvers,
   delegation rules, TTLs.
6. **`pre-spawn-protocol.md`** — the three-step decision tree the
   Orchestrator runs before every spawn.
7. **`agent-locks.md`** — start empty. Populated at runtime.
8. **`agent-bulletin.md`** — start empty (or with a `SESSION: INIT`
   entry). Append-only from then on.
9. **`build-status.md`** — populate with initial sprint, P0/P1 bugs,
   and evolution queue entries from your backlog.
10. **`failure-library.md`** — start empty. Grows as the QA loop runs
    and Fix-Agent closes out failures.
11. **`evolution-queue.md`** — start empty. Grows as agents surface
    improvement proposals.

## How the Orchestrator uses these files

The Orchestrator's startup sequence reads them in the order defined in
`agents/orchestrator.md` under the `STARTUP` section. Each file is read
once, and the Orchestrator writes a bulletin entry after each read:

```
[YYYY-MM-DD HH:MM] [SESSION] READING: governance/<filename>
```

The order matters. `project-conventions.md` must be read before
`agent-bulletin.md` because bulletin entry format depends on the naming
conventions. See the `STARTUP` section of `agents/orchestrator.md` for
the authoritative sequence.

## Worked example: a new deployment

A solo founder cloning this framework into a new project:

1. Clones the repo, creates `governance/` by copying this directory.
2. Opens `project-conventions.md`, replaces `[REPLACE THIS]` markers
   with their repo name (`my-new-app`), the model string
   (`claude-opus-4-7`), and their agent naming scheme.
3. Opens `locked-states.md`, adds entries for `package.json`,
   `schema.prisma`, and `.env*` — files they never want auto-edited.
4. Opens `autonomy-registry.md`, sets every agent to `PROVISIONAL`
   (default for a new workforce).
5. Leaves `agent-bulletin.md`, `agent-locks.md`, `failure-library.md`,
   and `evolution-queue.md` empty.
6. Populates `build-status.md` with their first sprint and any known
   bugs.
7. Runs `/orchestrator` — the Orchestrator reads all 12 files, prints
   the confirm-back block, and waits for the first task.

---

## Cross-references

- **Orchestrator startup:** `agents/orchestrator.md` — the `STARTUP`
  section lists the read order and the bulletin entries written at
  each step.
- **Pre-spawn protocol:** `docs/control-plane/pre-spawn-protocol.md`
- **HITL gate types:** `docs/control-plane/hitl-gates.md`
- **Autonomy tiers:** `docs/concepts/autonomy-gates.md`
- **Build state machine:** `docs/control-plane/build-state-machine.md`
