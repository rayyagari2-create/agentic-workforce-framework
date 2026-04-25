## About this file

- **Purpose:** The three-step decision tree the Orchestrator runs
  before every spawn. Enforces that no agent starts without a
  classified task, a routing decision, a valid AgentTaskManifest,
  and (when required) a resolved HITL gate.
- **Who writes:** Human operator. Agents read; agents never write.
  Proposed changes go through the evolution queue.
- **Mutability:** Human-mutable. Read by the Orchestrator at boot
  (STARTUP step 11) and by the `check-agent-spawn` hook at every
  Task tool call.
- **How to initialize:** Replace `[REPLACE THIS]` markers for
  project-specific thresholds (failure-library path, risk
  elevations, recurrence ceilings).

---

# Pre-Spawn Protocol

Three gates protect build quality: **/debug**, **/plan**, **/spec**.
The decision tree below determines which gate applies. This is not a
judgment call. Follow the tree.

```
/debug → /spec or /plan → HITL (HIGH+ risk) → SPAWN
```

The build state machine that follows pre-spawn is specified in
`docs/control-plane/build-state-machine.md`. Pre-spawn is the gate
at the front of that machine.

---

## Decision Tree (mandatory — no exceptions)

### Step 1 — Does this require code changes?

Does the task touch any code file, create any file, or install any
dependency?

```
  NO  → No gate required. Proceed to spawn.
         (Docs, bulletin edits, lock releases, handoffs,
          trust scores — no code = no gate.)
  YES → Continue to STEP 2.
```

**Worked example — NO branch:**

A task to add a note to `governance/evolution-queue.md`. No code
touched. No gate required. Orchestrator proceeds directly to SPAWN
(for a Fix-Agent) without /debug, /spec, or /plan.

**Worked example — YES branch:**

A task to add a new endpoint in `src/api/orders.ts`. Code file
touched. Must continue to Step 2.

---

### Step 2 — Is this a P0 or a recurring failure class?

Is this a P0 bug, **or** does the failure class have
`recurrenceCount ≥ [REPLACE THIS: threshold, e.g., 2]` in
`governance/failure-library.md`?

```
  YES → Run /debug FIRST.
         /debug output feeds /spec.
         Never skip /debug on a P0 or recurrence.
         Never fix what you haven't diagnosed.
  NO  → Continue to STEP 3.
```

**Rule:** /debug produces a root-cause hypothesis, a file-scope list,
and a set of failed assertions. It is the input to /spec. Skipping
/debug on a recurrence means fixing a symptom again.

**Worked example — YES branch:**

A P0 bug "users can't complete checkout" is filed. Failure library
shows `recurrenceCount: 3` for `race_condition` in
`src/checkout/submit.ts`. /debug runs first — produces a hypothesis
(stale request deduplication key) and a failed assertion (two
concurrent submits with same key produce two charges). /debug output
feeds /spec.

---

### Step 3 — Is this multi-file or does it have sequencing dependencies?

Does the task touch 2+ files, **or** does any file depend on another
file in scope?

```
  YES → Run /plan.
         Two files with a sequencing dependency = /plan.
         Not /spec. Not "well-defined enough to skip."
         /plan produces wave structure, per-slice
         acceptance criteria, dependency map, and
         explicit out-of-scope list.
         Founder approves plan. Then execute waves.
  NO  → Run /spec.
         Single file or single clearly-scoped change.
         /spec produces acceptance criteria, assumptions,
         DO NOT TOUCH list, verification plan.
         Founder approves spec. Then spawn.
```

**Rule:** "Well-defined enough to skip" is never a valid reason to
skip /spec or /plan. The gate exists precisely for tasks that feel
obvious.

**Worked example — YES branch:**

Task: "Add cursor pagination to /api/orders." Two files: the API
handler (`src/api/orders.ts`) and the query builder
(`src/db/orders.ts`). The handler depends on the query builder's
output shape. /plan runs — produces Wave 0 (query builder publishes
`PAGINATION_SHAPE`), Wave 1 (handler wires to shape), per-wave
acceptance criteria, and out-of-scope list.

**Worked example — NO branch:**

Task: "Fix typo in error message in `src/auth/errors.ts`." Single
file, no dependencies. /spec runs — produces AC ("error message
reads 'Invalid password' not 'Invalid passowrd'"), DO NOT TOUCH list
(every other file in `src/auth/`), verification plan (grep for the
typo in the changed region).

---

## Dependency Install Rule — non-negotiable

Any task adding, removing, or upgrading a runtime or build
dependency must include the dependency name and version in the
/spec or /plan **before** installation.

The Orchestrator does not run `[REPLACE THIS: e.g., "npm install"]`,
`[REPLACE THIS: e.g., "pip install"]`, or any equivalent before the
spec or plan is approved. Installing a dependency changes the
lockfile — a material decision that requires founder approval.

The manifest must list:

- Package name
- Version (exact, not a range)
- Reason
- Risk level (elevates to `HIGH` if the dependency is used in a
  HIGH-risk domain per `governance/hitl-gate.md`)

---

## After Founder Approves Spec or Plan

Only then: lock files, write manifest, spawn agents.

- No tool calls other than `Read` are permitted before founder
  approval.
- "Cleared to proceed" on a task description is **not** approval of a
  spec or plan. The founder must see and explicitly approve the
  spec or plan output before spawning begins.

---

## What /spec and /plan Do

| Tool | Reads | Produces |
|---|---|---|
| `/spec` | files, `governance/locked-states.md`, `governance/failure-library.md` | Acceptance criteria, assumptions, DO NOT TOUCH list, verification plan, risk flags |
| `/plan` | same as /spec | same as /spec **plus** wave sequencing, dependency map, parallel vs sequential identification, per-slice criteria |

These are not overhead. They are the reason failures don't recur.

---

## HITL Gate (Step 3.5 — when applicable)

After /spec or /plan is approved, if the task's `riskLevel` is HIGH
or CRITICAL, the HITL gate fires before SPAWN. The Orchestrator
presents the full manifest to the founder (or the role-appropriate
approver per `governance/hitl-gate.md`) and waits for explicit
"proceed" before spawning.

See `governance/hitl-gate.md` for the full gate model, approval
authority, delegation rules, and 3-strike escalation.

---

## AgentTaskManifest (required before SPAWN)

Before calling the Task tool, the Orchestrator produces a manifest
conforming to `schemas/v1/agent-task-manifest.schema.json`:

```
taskId:               [SESSION-DATE]-[agent]-[task-slug] or ULID
taskType:             feature | bug | refactor | security | eval | migration
domains:              [exact/file/path/1, exact/file/path/2]
riskLevel:            low | medium | high | critical
interfacesTouched:    [API or data shapes being changed — omit if none]
verificationRequired: [verification checks from the public enum]
blockingDependencies: [READY signals required before agent starts — omit if none]
priorFailureContext:  [matching failure-library entries, or empty]
assignedAgent:        orchestrator | qa-agent | fix-agent | executor | reviewer
createdAt:            <ISO 8601>
```

**Required fields:** `taskId`, `taskType`, `domains`, `riskLevel`,
`verificationRequired`, `assignedAgent`, `createdAt`.

**Optional:** `interfacesTouched`, `blockingDependencies`,
`priorFailureContext` (empty allowed).

### Risk Level Guide

| Risk | When |
|---|---|
| `low` | Isolated change, no shared interfaces touched |
| `medium` | Touches shared state, store, or API contract |
| `high` | Touches payment, auth, data persistence, or a file in `governance/locked-states.md` |
| `critical` | Cross-schema, policy change, or control-plane artifact change — Boardroom review required |

### Rule

No agent is spawned without a valid manifest. Fix-Agent tasks still
get manifests — no size exception. If you cannot produce a manifest,
the task is not defined well enough to execute.

---

## Sidecar Manifest (required before every Task tool call)

After appending the AgentTaskManifest bulletin entry, the
Orchestrator writes a sidecar JSON at
`[REPLACE THIS: e.g., "manifests/"]<taskId>.json` before calling the
Task tool. The `check-agent-spawn` hook reads this file; no sidecar
= spawn blocked.

See `agents/orchestrator.md` → **SIDECAR MANIFEST** for the exact
six-step sequence (compose prompt, hash, write sidecar, append
bulletin, embed manifest token, call Task).

---

## Pre-Spawn Output

Pre-spawn produces three artifacts, in order:

1. **A classified task** — `riskLevel`, `domains`, and
   `interfacesTouched` populated.
2. **A routing decision** — /spec or /plan, produced and approved.
3. **An AgentTaskManifest + sidecar** — all gate triggers resolved,
   `priorFailureContext` populated, HITL approvals recorded if any
   were obtained.

If any of the three is missing, the spawn does not happen. The
`check-agent-spawn` hook produces `exit(2)`.

---

## Common Mistakes

| Mistake | Effect |
|---|---|
| Skipping Step 1 because the task "feels" low risk | Underclassification; HITL doesn't fire. |
| /plan when ACs are vague | Failed QA loops; rework. |
| Treating recurrence retrieval as advisory | D4 hit when the pattern repeats. |
| HITL approval as a checkpoint, not a decision | Approval theater; signature without scrutiny. |
| "Just approve so we can move" | Pre-spawn becoming ceremony, not control. |
| Dependency change merged without manifest review | Silent risk amplification. |

---

## Cross-references

- `docs/control-plane/pre-spawn-protocol.md` — conceptual model
  (this file is the deployment-specific operationalization)
- `docs/control-plane/build-state-machine.md` — the lifecycle
  pre-spawn feeds into
- `governance/hitl-gate.md` — the gate types Step 3.5 may fire
- `governance/routing-table.md` — produces the `assignedAgent`
  input to the manifest
- `governance/failure-library.md` — queried in Step 2 for
  recurrence
- `schemas/v1/agent-task-manifest.schema.json` — the artifact
  pre-spawn produces
