# Changelog

All notable changes to the Agentic Workforce Framework will be documented in this file.

This project adheres to semantic versioning for schemas and documentation. Breaking changes to any schema require a new version path (e.g., `schemas/v2/`), never an in-place modification of a shipped schema.

---

## [v0.2.0] - 2026-05-20

### Added

- Sprint 2 cross-runtime governance proof, published as a sanitized
  replay. Shows the same five-stage governance lifecycle running
  across an event-rich adapter profile (Claude Code) and a
  policy-rich adapter profile (Codex), with one verified audit
  chain across both runs.
- `examples/cross-runtime/terminal-demo.md` — sanitized terminal
  transcript of the cross-runtime demo (synthetic runtime outputs,
  real AWF lifecycle stages).
- `examples/cross-runtime/README.md` — explainer covering what the
  demo proves, the five governance stages and the trust subject
  model per runtime type.
- `docs/adapter-designs/DESIGN-01.md` — Runtime Adapter Capability
  Model. Defines the 12 capability surfaces, operational qualifiers
  and enforcement tiers used to evaluate any runtime by evidence
  and control surface, not brand.
- `docs/adapter-designs/DESIGN-02.md` — Trust Subject Model. Defines
  the seven trust subject types (`agent`, `subagent`, `role_profile`,
  `session`, `graph_node`, `human_runtime`, `task`), `subject_key`
  construction rules and cross-runtime trust rules.
- `docs/adapter-designs/DESIGN-03.md` — Adapter Enforcement Limits.
  Defines the overclaiming prevention standard and per-tier claims
  language.
- README: Sprint 2 proof statement, Sprint 2 status table entries
  and pointer to the cross-runtime demo.

### Changed

- README sprint status updated to mark Sprint 2 COMPLETE.
- Implementation Status rows for Claude Code / Codex runtime adapters
  updated to reflect that production implementations live in the
  commercial control-plane repo while design foundations and the
  sanitized demo ship publicly.

### Status

- Public demo is a sanitized replay of the Sprint 2 governance proof.
  Real adapter implementations and production evidence remain private.
- D1/D2 remain candidate scores in the public reference.
  Calibration still requires n >= 20 sessions.

---

## [v0.1.0-sprint-0] - 2026-05-17

### Added
- Sprint 0 end-to-end demo (node examples/awf-demo/src/run-demo.js)
- Postgres core schema: 10 tables with full tenant/division/workspace scope
- Hash-chained audit service as a separate process with tamper-evident verification
- AWFAgentRuntime interface v1.0 (vendor-neutral adapter contract)
- SimulatedRuntimeAdapter with [PREVIEW] labeling
- Work intake from JSON (GitHub Issues format)
- Risk classifier (10 rules, deterministic, pure function)
- Priority queue with SELECT FOR UPDATE SKIP LOCKED
- Single approval gate (high/critical risk gated to tech_lead)
- Agent assignment (5 roles, task-class routing)
- D1-D4 reference scorer (D3/D4 deterministic, D1/D2 candidate)
- QA verdict production (AJV-validated, 4 outcomes)
- Root workspace package.json with npm install and npm run demo
- Audit append-only trigger (migration 008)
- demo-output/ gitignored, sample outputs in examples/awf-demo/sample-output/

### Status
- D1/D2 scoring is heuristic. Full calibration requires n >= 20 sessions.
- Runtime adapters for Claude Code and Codex ship in Sprint 2.
- Distribution list (E0-14) parked pending research.

---

## [CLI v0.1.0] - 2026-04-28

### Added

- Published installable AWF CLI package: agentic-workforce-framework
- Added awf init to scaffold framework artifacts into a target repo
- Added awf check to validate starter framework setup
- Added awf add <module> for modular installs
- Added Claude Code scaffold support:
  - agent templates
  - hook examples
  - settings example file
- Added runtime-agnostic scaffold support for Cursor, Windsurf and Other
- Added modules:
  - five-agent-team
  - trust-scoring
  - failure-memory
  - task-manifest
  - claude-code-hooks

### Notes

The CLI does not run agents directly. It scaffolds the operating model
around the user's chosen runtime.

---

## [v1.0] 2026-04-24

### Added Initial public release

**Core concepts** `docs/concepts/`

- Agentic workforce model (agents-as-employees framing)
- D1-D4 trust scoring with 100-point scale, calibration anchors, and hard-stop rules
- Failure memory with 17-class taxonomy and pre-task retrieval pattern
- Autonomy gates across five trust tiers (HIGH / STANDARD / RESTRICTED / PROBATION / PROVISIONAL)

**Architecture** `docs/architecture/`

- Four-plane model: Agentic Workforce, Autonomy, Control, Automation
- Agent vs service vs hybrid vs routine classification rubric
- Three-layer governance stack: runtime policy + routines + behavioral
- MCP / A2A integration patterns
- Enterprise scaling model (designed, not yet field-proven labeled throughout)
- Five Architecture Decision Records (ADRs 0001–0005)

**Operating model** `docs/operating-model/`

- Agent lifecycle (onboarding → active → restricted → retired)
- Task assignment and manifest creation
- Manager-agent pattern and escalation triggers
- Performance review cycle and session-level scoring
- Promotion / demotion process with reset conditions
- Incident management and failure record routing

**Control plane** `docs/control-plane/`

- Pre-spawn protocol decision tree
- Build state machine (DEBUG through COMPLETE)
- HITL gate chain patterns with TTL and 3-strike escalation
- OS-level hook system with exit(0) / exit(2) protocol and fail-closed design
- Meta-governance with eight failure modes and enforcement hierarchy
- Append-only audit trail pattern
- Compliance evidence mapping (EU AI Act, NIST AI RMF, SOC 2, HIPAA readiness)

**Schemas** `schemas/v1/`

- `AgentTaskManifest` mission context, files in scope, risk level
- `QAVerdict` structured pass/fail with per-criterion evidence
- `FailureRecord` 17-class taxonomy, recurrenceCount, prevention rule
- `TrustScore` D1-D4 per dimension, trust tier, confidence band

All schemas are AJV Draft 2020-12 compatible.

**Database** `database/governance/`

- 001_audit_log.sql append-only audit trail
- 002_agent_events.sql activity events
- 003_trust_scores.sql per-session D1-D4 records
- 004_failure_records.sql 17-class failure library
- 005_routine_runs.sql routine execution log

**Hooks** `hooks/`

- PreToolUse examples: bulletin, lock, locked-states, agent spawn, failure lib, bulletin order
- PostToolUse example: audit log write
- Utilities: override pattern with TTL, fail-closed template

All hook examples follow the exit(2) = hard block protocol and fail closed by default.

**Routines** `routines/`

- Routine model and adapter pattern documentation
- R1 PR test template (Playwright-on-PR)
- R4 security scan template

**Calibration** `calibration/`

- D1-D4 rubric with calibration anchors
- Anchor examples across scoring sessions
- Confidence band guide (n=sessions to band mapping)
- Scoring ledger template
- Anti-patterns document

**Examples** `examples/`

- Minimum viable adoption path (no hooks, no Postgres, no routines)
- Single-workspace reference
- Case study template

**Guides** `docs/guides/`

- Getting started (30-minute path)
- Trust calibration
- Failure taxonomy adoption
- Single-team adoption
- Runtime policy integration

### Reserved

- `schemas/v2/` reserved for work queue and gate record schemas
- `database/enterprise/` reserved for v3.0 multi-workspace extension
- `examples/multi-team/` reserved for v3.0 enterprise reference
- `.github/workflows/` reserved for schema validation CI

### Status Notes

- Enterprise scaling model (Section 11, ADR 0005) is designed but not yet field-proven at multi-team scale. Every v3.0 directory is labeled explicitly.
- Automated trust scoring, work queue system, and approval gate chains are designed but not yet shipped. These are v2.0 / v3.0 targets.
