## About this file

- **Purpose:** The list of files (and file-path patterns) that agents
  may never touch without explicit founder/operator override. Locked
  states are a hard backstop for high-blast-radius files that should
  change only with human review.
- **Who writes:** Human operator only. Agents read; agents never write.
  An agent that edits this file is a D3=0 (policy compliance) hit.
- **Mutability:** Human-mutable. Treat edits as policy changes — go
  through code review.
- **How to initialize:** Start with the baseline entries below. Add any
  files whose unsupervised modification would constitute a policy
  incident (schema files, policy files, infra config, secrets).

---

# Locked States

These entries are read by the Orchestrator at startup and by the
PreToolUse hook on every tool call. A file in this list can only be
modified when:

1. The task's manifest `riskLevel = HIGH` or `CRITICAL`, AND
2. `hitlApproved = true` in the sidecar, AND
3. The human approver's ID is recorded in the gate decisions.

Any other write attempt is blocked at the hook layer.

---

## Why path-qualified matching matters

Lock entries are **path-qualified**, not basename-only. A basename-only
lock (e.g., `config.json`) would block every `config.json` in the repo,
including vendored dependencies and test fixtures. A path-qualified
lock (e.g., `src/runtime/config.json`) blocks exactly the intended
file.

**Correct:**

```
src/runtime/config.json
schemas/v1/*.schema.json
infra/terraform/production/**
```

**Incorrect:**

```
config.json            ← matches everything named config.json
*.schema.json          ← matches tests, fixtures, vendor copies
```

**Path qualification rules:**

- Use full paths from repo root, not basenames.
- Use `**` for recursive directory matches.
- Use `*` for single-level globs.
- Never use bare filenames unless the file only exists once in the
  entire repo and you want to lock every instance if that changes.

---

## Lock Entries

Each entry is one line. Comments start with `#`.

Format:

```
<path-or-glob>    # <reason for lock>
```

```
# ─── Control plane artifacts (framework internals) ──────────────────
[REPLACE THIS: e.g., ".claude/settings.json"]                     # hook configuration
[REPLACE THIS: e.g., ".claude/hooks/**"]                          # hook scripts
[REPLACE THIS: e.g., "agents/**"]                                 # agent instruction files
[REPLACE THIS: e.g., "schemas/v1/**"]                             # contract schemas
[REPLACE THIS: e.g., "governance/locked-states.md"]               # this file itself

# ─── Deployment and secrets ─────────────────────────────────────────
[REPLACE THIS: e.g., ".env"]                                      # local environment
[REPLACE THIS: e.g., ".env.*"]                                    # environment variants
[REPLACE THIS: e.g., "infra/**"]                                  # infrastructure as code
[REPLACE THIS: e.g., ".github/workflows/**"]                      # CI pipelines

# ─── Data and schema ────────────────────────────────────────────────
[REPLACE THIS: e.g., "prisma/schema.prisma"]                      # database schema
[REPLACE THIS: e.g., "db/migrations/**"]                          # migrations

# ─── Dependency manifests ───────────────────────────────────────────
[REPLACE THIS: e.g., "package.json"]                              # runtime deps (see dependency install rule)
[REPLACE THIS: e.g., "package-lock.json"]
[REPLACE THIS: e.g., "Cargo.toml"]

# ─── Project-specific (add your own) ────────────────────────────────
[REPLACE THIS: project-specific high-risk file path]              # [REPLACE THIS: reason]
```

---

## Worked Example

A populated `locked-states.md` for a TypeScript web app:

```
# ─── Control plane artifacts ────────────────────────────────────────
.claude/settings.json                              # hook configuration
.claude/hooks/**                                   # hook scripts
agents/**                                          # agent instruction files
schemas/v1/**                                      # contract schemas
governance/locked-states.md                        # this file

# ─── Deployment and secrets ─────────────────────────────────────────
.env                                               # local environment
.env.*                                             # environment variants
infra/terraform/production/**                      # prod infrastructure
.github/workflows/**                               # CI pipelines

# ─── Data and schema ────────────────────────────────────────────────
prisma/schema.prisma                               # database schema
prisma/migrations/**                               # migrations

# ─── Dependency manifests ───────────────────────────────────────────
package.json                                       # runtime deps
package-lock.json                                  # lockfile
pnpm-workspace.yaml                                # workspace config

# ─── Project-specific ───────────────────────────────────────────────
src/auth/policy.ts                                 # auth policy rules
src/payments/webhook-secret.ts                     # webhook secret handling
```

---

## Override Protocol

To modify a locked file, the Orchestrator must:

1. Classify the task as `HIGH` or `CRITICAL` in the manifest.
2. Surface the HITL gate before spawn. The founder sees the full
   manifest and the locked paths that would be touched.
3. Receive explicit approval — the approver's ID is recorded in the
   gate decision.
4. Write `hitlApproved: true` in the sidecar JSON with the approver's
   ID.
5. The hook verifies the approver has authority for that risk level
   (see `governance/hitl-gate.md`).
6. On approval, the agent proceeds. On rejection, the task returns to
   the queue.

There is no silent bypass. An agent that attempts to edit a locked
file without `hitlApproved=true` hits the hook and fails with
`exit(2)`.

---

## Cross-references

- `governance/hitl-gate.md` — risk-level → approver mapping
- `docs/control-plane/hook-system.md` — how the hook reads this file
- `docs/control-plane/pre-spawn-protocol.md` — the gate that fires
  before a locked-file spawn
