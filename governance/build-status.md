## About this file

- **Purpose:** Current work queue. The Orchestrator reads this at
  startup (STARTUP step 5) to decide what to do next. Holds the
  active sprint, open P0/P1 bugs, and a short-form reference to the
  evolution queue.
- **Who writes:** Human operator and Orchestrator. The founder adds
  and reorders sprint items; the Orchestrator appends completion
  notes and moves items between sections.
- **Mutability:** Mutable. Completed sprint items move to an
  `## Archive` section at session close. P0/P1 bug rows are edited in
  place as status changes.
- **How to initialize:** Fill in the current sprint and any known
  bugs. Empty sections stay with the heading present (the Orchestrator
  expects the structure).

---

# Build Status

**Last updated:** `[REPLACE THIS: YYYY-MM-DD]`
**Active session:** `[REPLACE THIS: session ID, or "—" if idle]`

---

## P0 Reconciliation Rule

The Orchestrator's STARTUP reads this file and lists every open P0 to
the founder before accepting any new task. No feature work begins while
a P0 is open unless the founder explicitly clears it. See
`agents/orchestrator.md` → `P0 RECONCILIATION`.

---

## Current Sprint

Items the workforce is actively working on. Order matters — top of
list is highest priority.

| ID | Title | Owner | Status | Notes |
|---|---|---|---|---|
| `[REPLACE THIS: SPRINT-YYYY-NNN]` | `[REPLACE THIS: one-line title]` | `[REPLACE THIS: agent label or "unassigned"]` | `pending | in_progress | blocked | done` | `[REPLACE THIS: one-line note or "-"]` |

### Worked example

| ID | Title | Owner | Status | Notes |
|---|---|---|---|---|
| SPRINT-2026-012 | Add cursor pagination to /api/orders | AGENT-1 | in_progress | Waiting on SCHEMA-READY from AGENT-2 |
| SPRINT-2026-013 | Migrate session token storage to JWT | unassigned | pending | Blocked on SPRINT-2026-012 |
| SPRINT-2026-014 | Add rate limit to login endpoint | AGENT-3 | done | Shipped session #14 |

---

## P0 Bugs (open)

User-facing, blocks release. Must be resolved before sprint items
continue.

| ID | Title | Filed | Age | Files | Notes |
|---|---|---|---|---|---|
| `[REPLACE THIS: BUG-YYYY-MM-DD-NNN]` | `[REPLACE THIS: symptom]` | `[REPLACE THIS: YYYY-MM-DD]` | `[REPLACE THIS: N days]` | `[REPLACE THIS: comma-separated paths]` | `[REPLACE THIS: note or "-"]` |

### Worked example

| ID | Title | Filed | Age | Files | Notes |
|---|---|---|---|---|---|
| BUG-2026-04-22-001 | Login fails for users with email > 254 chars | 2026-04-22 | 2 days | src/auth/validate.ts | Regression after auth refactor |

---

## P1 Bugs (open)

Functional issues, not release-blocking but fix before next release.

| ID | Title | Filed | Files | Notes |
|---|---|---|---|---|
| `[REPLACE THIS: BUG-YYYY-MM-DD-NNN]` | `[REPLACE THIS: symptom]` | `[REPLACE THIS: YYYY-MM-DD]` | `[REPLACE THIS: paths]` | `[REPLACE THIS: note]` |

### Worked example

| ID | Title | Filed | Files | Notes |
|---|---|---|---|---|
| BUG-2026-04-20-003 | Admin dashboard timestamp shows UTC instead of user locale | 2026-04-20 | src/admin/TimeCell.tsx | Display only; no data corruption |

---

## Evolution Queue Items (summary)

Short-form pointer to the full proposals in
`governance/evolution-queue.md`. The Orchestrator reads this list to
know which improvements are queued without loading the full queue
file on every boot.

| ID | Priority | One-line |
|---|---|---|
| `[REPLACE THIS: EVO-YYYY-NNN]` | `P0 | P1 | P2 | P3` | `[REPLACE THIS: one-line summary]` |

### Worked example

| ID | Priority | One-line |
|---|---|---|
| EVO-2026-005 | P1 | Add cursor pagination pattern to routing table |
| EVO-2026-007 | P2 | Expand failure-library search to match by symptom prefix |

---

## Archive

Completed sprint items move here on session close. Retain for trust
scoring and retrospective review.

| ID | Title | Completed | Session |
|---|---|---|---|
| `[REPLACE THIS]` | `[REPLACE THIS]` | `[REPLACE THIS: YYYY-MM-DD]` | `[REPLACE THIS: session ID]` |

---

## Cross-references

- `governance/failure-library.md` — where resolved bug patterns land
  after QA closes them
- `governance/evolution-queue.md` — the full list this file summarizes
- `agents/orchestrator.md` — STARTUP step 5 reads this file
