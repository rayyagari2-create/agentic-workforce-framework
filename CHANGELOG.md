# Changelog

All notable changes to the Agentic Workforce Framework will be documented in this file.

This project adheres to semantic versioning for schemas and documentation. Breaking changes to any schema require a new version path (e.g., `schemas/v2/`), never an in-place modification of a shipped schema.

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
