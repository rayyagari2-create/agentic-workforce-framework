## About this file

- **Purpose:** Single source of truth for project-specific strings the
  Orchestrator and all agents must use consistently. Naming, model
  string, voice, bulletin format, session close format.
- **Who writes:** Human operator at deployment. Changes to this file
  after bootstrap go through the evolution queue, not direct edits.
- **Mutability:** Human-mutable only. Agents read; agents never write.
- **How to initialize:** Replace every `[REPLACE THIS: ...]` marker
  below. Every `[REPLACE THIS]` is a mandatory field — leaving one
  unfilled produces inconsistent behavior across agents.

---

# Project Conventions

The Orchestrator reads this file first. Every downstream file (bulletin,
locks, handoffs, manifests) references values defined here. Changing a
value here changes the grammar of the entire workforce — do it
deliberately.

---

## Project Identity

| Field | Value |
|---|---|
| Project name | `[REPLACE THIS: short project name, e.g., "my-app"]` |
| Long name | `[REPLACE THIS: human-readable name, e.g., "My Example Application"]` |
| Repository URL | `[REPLACE THIS: git remote URL, e.g., "https://github.com/org/my-app"]` |
| Primary branch | `[REPLACE THIS: e.g., "main"]` |
| Product personas in scope | `[REPLACE THIS: comma-separated list of personas/products, or "none"]` |

**Worked example:**

| Field | Value |
|---|---|
| Project name | `orderbook` |
| Long name | `Orderbook Trading Platform` |
| Repository URL | `https://github.com/acme-co/orderbook` |
| Primary branch | `main` |
| Product personas in scope | `trader, admin` |

---

## Model Configuration

| Field | Value |
|---|---|
| Default model string | `[REPLACE THIS: exact model ID, e.g., "claude-opus-4-7"]` |
| QA-Agent model | `[REPLACE THIS: same or different from default]` |
| Fix-Agent model | `[REPLACE THIS: same or different from default]` |
| Executor model | `[REPLACE THIS]` |
| Model string enforcement | `[REPLACE THIS: "strict" | "advisory"]` |

**Rule:** If `strict`, a Phase 8 baseline guard must grep for hardcoded
model strings that do not match. Any new hit fails the verification
gate. See `agents/orchestrator.md` → BASELINE SNAPSHOT.

**Worked example:**

| Field | Value |
|---|---|
| Default model string | `claude-opus-4-7` |
| QA-Agent model | `claude-opus-4-7` |
| Fix-Agent model | `claude-sonnet-4-6` |
| Executor model | `claude-sonnet-4-6` |
| Model string enforcement | `strict` |

---

## Agent Naming

| Field | Value |
|---|---|
| Orchestrator label | `ORCHESTRATOR` |
| Executor prefix | `[REPLACE THIS: e.g., "AGENT-"]` |
| Executor numbering | `[REPLACE THIS: e.g., "sequential per session (AGENT-1, AGENT-2, ...)"]` |
| QA-Agent label | `QA-AGENT` |
| Fix-Agent label | `FIX-AGENT` |
| Reviewer label | `REVIEWER` |
| Session label | `SESSION` |

**Rule:** Labels are the uppercase strings agents write in bulletin
entries. The executor prefix appears in locks, handoffs, and sidecar
manifests. Consistency across these is non-negotiable — the hook
layer greps for exact labels.

**Worked example:**

The executor prefix `AGENT-` produces lock entries like
`LOCKED BY: AGENT-1`, bulletin entries like `[AGENT-1] WORKING: ...`,
and handoff filenames like `2026-04-24-14-AGENT-1.md`.

---

## Bulletin Entry Format

Every bulletin entry uses this exact format:

```
[YYYY-MM-DD HH:MM] [AGENT-LABEL] STATUS: message
```

| Component | Rule |
|---|---|
| Timestamp | `YYYY-MM-DD HH:MM` from `Bash(date +"%Y-%m-%d %H:%M")`. Never approximated. |
| Agent label | Uppercase. Matches the labels defined above. |
| Status | One of: `STARTUP`, `READING`, `WORKING`, `BLOCKED`, `DONE`, `HITL_REQUIRED`, `PROGRESS`, `COMPLETE`, `RELEASED`, `VERIFYING`, `LOCKED`, `STARTED`, `ACTIVATED`, `CONFIRMED`, `TASK`, `BASELINE`, `ANALYZING`, `MANIFEST`, `SIDECAR`, `SPAWNING`, `RETURN`, `VALIDATE`, `QA`, `QA-CYCLE`, `QA-FIX`, `SESSION COMPLETE`, `FINAL VERIFICATION`, `VERIFICATION`, `WAVE`, `WAVE COMPLETE`, `DEPENDENCY MAP`, `OWNERSHIP`, `WAVES PLANNED`, `P0-CHECK`, `ENUM-PARITY`, `FIX-LOOP`, `ESCALATING`, `MONITORING`, `UNBLOCKING`, `READY` |
| Separator | `:` after STATUS, one space, then message |
| Message | One line. Multi-line content belongs in handoffs, not bulletin. |

**Rule:** Entries are **append-only**. Never insert in the middle.
Never edit a prior entry. Edits to the bulletin are a D2=0 (falsified
telemetry) hard-stop.

**Worked example:**

```
[2026-04-24 14:32] [ORCHESTRATOR] ACTIVATED: refactor auth middleware
[2026-04-24 14:33] [SESSION] READING: governance/project-conventions.md
[2026-04-24 14:35] [AGENT-1] STARTED: migrate session token storage
[2026-04-24 14:41] [AGENT-1] BLOCKED: waiting on SCHEMA-READY signal
[2026-04-24 15:02] [AGENT-1] RELEASED: src/auth/session.ts
```

---

## Handoff File Format

On completion, every executing agent writes a handoff file at:

```
[REPLACE THIS: e.g., "handoffs/"]YYYY-MM-DD-HH-AGENT-N.md
```

Handoff content must include the fields specified in
`agents/orchestrator.md` under `HANDOFF FORMAT`:

- Built
- Files changed
- Interfaces published
- Decisions made
- Not finished
- Flags
- Next

---

## Manifest and Sidecar Paths

| Field | Value |
|---|---|
| Manifest sidecar directory | `[REPLACE THIS: e.g., "manifests/"]` |
| Trust score file | `[REPLACE THIS: e.g., "governance/agent-trust-scores.md"]` |
| Handoffs directory | `[REPLACE THIS: e.g., "handoffs/"]` |

---

## Voice and Style

Copy, error messages, user-facing strings in this project must conform
to:

- Tone: `[REPLACE THIS: e.g., "direct, no marketing hype, no emojis"]`
- Person: `[REPLACE THIS: e.g., "second person for user-facing, third for logs"]`
- Forbidden strings: `[REPLACE THIS: comma-separated list of forbidden brand or competitor terms, or "none"]`

**Rule:** Forbidden strings become part of the Phase 8 baseline guard.
Any new occurrence fails the verification gate.

**Worked example:**

- Tone: `direct, terse, no em-dashes`
- Person: `second person for user-facing errors`
- Forbidden strings: `none`

---

## Session Close Format

At session close, the Orchestrator presents this block to the founder:

```
RELEASE READY — all checks pass.
Project:       [project name]
Model:         [model string]
Built:         [what shipped]
Files changed: [count]
QA:            PASS ([runtime tests active/not active])
Baseline:      [guard counts verbatim from STARTUP]
Final:         [guard counts at close]
Delta:         [per-guard delta, all ≤ 0]

Trust scoring: The following agents ran — [list]. Please score each
in [trust score file path] before committing.

Commit approval required — no agent has pushed to git.
```

**Rule:** This block is the only valid format for session close. Any
deviation is a D2=0 hit.

---

## Cross-references

- `agents/orchestrator.md` — the consumer of every value in this file
- `governance/agent-bulletin.md` — uses the bulletin entry format
- `governance/agent-locks.md` — uses agent naming
- `governance/hitl-gate.md` — references forbidden-string guards
