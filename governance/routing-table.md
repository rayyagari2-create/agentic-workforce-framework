## About this file

- **Purpose:** Maps task types to the agent that owns them. The
  Orchestrator reads this at boot (STARTUP step 9) and consults it
  at every routing decision. Without this table, the Orchestrator
  has no basis for routing.
- **Who writes:** Human operator. Changes to routing go through code
  review — this file is a policy artifact.
- **Mutability:** Human-mutable. Agents may surface proposed changes
  via the evolution queue; they may not edit this file directly.
- **How to initialize:** Replace `[REPLACE THIS]` markers with your
  project's agent roster and risk policy. Start with the generic
  rows shown in the **Routing Table** below and extend as your
  workforce grows.

---

# Routing Table

The Orchestrator's Phase 2 (Dependency Map) decides *which files*
change. This file decides *which agent* owns those files and *whether
HITL fires by default*.

---

## Pre-Routing Checks (mandatory before a routing decision)

Before reading this table, the Orchestrator runs two retrieval steps:

### 1. Contract Registry Lookup

Read `[REPLACE THIS: path to contracts index, e.g., "docs/contracts/README.md"]`.
Identify any contracts governing files in this task's scope.

For each contract that applies:

- Read the contract file.
- Note interface constraints, required fields, event shapes.
- Include the contract reference in the agent's instruction.
- Append:
  ```
  [YYYY-MM-DD HH:MM] [ORCHESTRATOR] CONTRACT: <contract name> applies to <file>
  ```

If no contracts apply:

- Append:
  ```
  [YYYY-MM-DD HH:MM] [ORCHESTRATOR] CONTRACT: none applicable
  ```

**Rule:** Agents must receive the relevant contract before touching
any file governed by one. Discovering a contract violation after the
fact is not acceptable.

### 2. Failure Library Check

Read `governance/failure-library.md` in full. For each file in scope:

- Grep for the exact path string.
- For each match, copy the full entry (symptom / root cause /
  prevention) into the agent's manifest verbatim.
- Append:
  ```
  [YYYY-MM-DD HH:MM] [ORCHESTRATOR] FAILURE-LIB: match for <path|domain|agent>
  ```

See `governance/failure-library.md` → **Pre-task Retrieval Protocol**
for the full query.

---

## Routing Table

After a routing decision is made, append:

```
[YYYY-MM-DD HH:MM] [ORCHESTRATOR] ROUTING: <task type> → <agent>
```

Rows are matched top-to-bottom. The first matching row wins. Leaf
rows (specific paths) precede catch-alls.

| Task type | Assigned agent | Risk level (default) | Requires HITL (default) | Notes |
|---|---|---|---|---|
| `[REPLACE THIS: e.g., "single-file fix"]` | `[REPLACE THIS: e.g., "Fix-Agent"]` | `[REPLACE THIS: low|medium|high|critical]` | `[REPLACE THIS: never|medium+|high+|always]` | `[REPLACE THIS: one-line rationale]` |
| `[REPLACE THIS: e.g., "feature implementation (backend)"]` | `[REPLACE THIS: e.g., "Executor-BE"]` | `medium` | `medium+` | |
| `[REPLACE THIS: e.g., "feature implementation (frontend)"]` | `[REPLACE THIS: e.g., "Executor-FE"]` | `medium` | `medium+` | |
| `[REPLACE THIS: e.g., "schema change"]` | `[REPLACE THIS: e.g., "Executor-BE"]` | `high` | `always` | DB/schema changes are always HIGH. |
| `[REPLACE THIS: e.g., "security audit"]` | `[REPLACE THIS: e.g., "Reviewer"]` | `high` | `always` | |
| `[REPLACE THIS: e.g., "dependency update"]` | `[REPLACE THIS: e.g., "Executor-BE"]` | `medium` | `medium+` | Elevates to `high` if dep used in auth/payments/schema. |
| `[REPLACE THIS: e.g., "documentation update"]` | `[REPLACE THIS: e.g., "Fix-Agent"]` | `low` | `never` | Docs only, no code. |
| `[REPLACE THIS: e.g., "QA audit"]` | `QA-Agent` | `low` | `never` | Read-only verification. |
| `[REPLACE THIS: e.g., "multi-file refactor (4+ files)"]` | `Executor-1..N` | `medium` | `medium+` | Full wave sequencing via Phases 1–7. |
| `[REPLACE THIS: e.g., "control-plane artifact change"]` | `Orchestrator (flag to human)` | `critical` | `always` | Locked states; Boardroom required. |

---

## Worked examples

### Generic row shapes

| Task type | Assigned agent | Risk level | Requires HITL | Notes |
|---|---|---|---|---|
| single-file fix | Fix-Agent | low | never | Isolated change in one file. |
| feature implementation (backend) | Executor-BE | medium | medium+ | New endpoint or service logic. |
| feature implementation (frontend) | Executor-FE | medium | medium+ | New screen or component. |
| schema change | Executor-BE | high | always | Migration or contract schema. |
| security audit | Reviewer | high | always | Surface-level threat review. |
| dependency update | Executor-BE | medium | medium+ | Elevates to high for security deps. |
| documentation update | Fix-Agent | low | never | Markdown-only; no code. |
| QA audit | QA-Agent | low | never | Verdict-producing; no writes. |
| multi-file refactor | Executor-1..N | medium | medium+ | Dependency map + waves. |
| control-plane artifact change | Orchestrator (escalate) | critical | always | Hooks, policies, contract schemas. |

### Routing examples (narrative)

```
"Fix a typo in the onboarding copy"
→ Single file, docs-only → Fix-Agent (risk=low, no HITL)

"Add pagination to /api/orders"
→ Backend feature, 2 files → Executor-BE (risk=medium, HITL on medium+)

"Migrate sessions table to include a revoked_at column"
→ Schema change → Executor-BE (risk=high, always HITL)

"Review auth flow for timing attacks"
→ Security audit → Reviewer (risk=high, always HITL)

"Bump axios from 1.6.0 to 1.7.0"
→ Dependency update, not in auth/payments → Executor-BE (risk=medium)

"Bump jsonwebtoken from 9.0.0 to 9.0.2"
→ Dependency update in auth domain → elevated to risk=high, always HITL

"Rewrite the Orchestrator instruction file"
→ Control-plane artifact → Orchestrator escalates to founder
  (risk=critical, Boardroom session required)
```

---

## Separate Session Rule

**Default:** Orchestrator spawns all agents via the Task tool. The
founder never manually spawns agents.

**Exception:** If a task genuinely requires a separate session
(worktree isolation, different permissions, long-running background
work that would block the Orchestrator), the Orchestrator explains
**why** to the founder before handing off. Never hand off by default.

---

## Risk Elevation Rules

Two rules automatically elevate a row's default risk level:

1. **Dependency install rule.** Any task adding, removing, or
   upgrading a runtime or build dependency is `medium` by default.
   It elevates to `high` if the dependency is used in a HIGH-risk
   domain (auth, payment, schema, audit, public-API surface). The
   manifest must list the package name, version, and reason.
2. **Locked-states rule.** Any task touching a file in
   `governance/locked-states.md` is `high` regardless of the row's
   nominal risk level. HITL is always required; `hitlApproved=true`
   must appear in the sidecar JSON.

See `governance/pre-spawn-protocol.md` → **Step 1** for the full
classification flow.

---

## Cross-references

- `governance/pre-spawn-protocol.md` — the decision tree that
  consumes this routing output
- `governance/hitl-gate.md` — what the "Requires HITL" column
  resolves to for a specific risk level and agent
- `governance/failure-library.md` — read before routing, per the
  Pre-Routing Checks above
- `docs/operating-model/task-assignment.md` — the conceptual model
  behind this table
