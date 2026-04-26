# Roadmap

This roadmap describes how the reference pattern will mature
over time.

The current version is intentionally scoped to a five-agent
team and single-workspace operating model because those
patterns are validated, explainable and suitable for
enterprise review today.

Future versions expand runtime coverage, automation depth
and enterprise operating models only after the reference
implementation validates them.

Each version ships when the reference implementation has
validated it, not on a fixed calendar.

---

## v1.0 - Reference Pattern

Published reference architecture for governed autonomous
agent teams.

Includes:

- Five-agent reference team:
  - Orchestrator
  - Frontend Agent
  - Backend Agent
  - QA Agent
  - Fix Agent
- Single-workspace operating model
- Claude Code native hook interception examples
- D1-D4 trust scoring with calibration anchors
- Failure memory with 17-class taxonomy
- Pre-spawn protocol
- Build state machine
- Enterprise architecture published as a reference pattern
- Postgres governance schema
- JSON schemas for core artifacts
- Control ownership matrix
- Threat model
- End-to-end governance scenario

---

## v1.5 - Runtime Expansion

Planned expansion of the reference pattern across additional
governance agents and runtime environments.

Expected additions:

- Additional agents:
  - security-check
  - evolve
  - code-review
- Runtime adapter variants for non-Claude Code environments
- Automated schema validation in CI
- Additional hook examples
- Community case studies from early adopters
- Expanded documentation for implementation teams

---

## v2.0 - Expanded Reference Pattern

Designed expansion for larger agent teams and stronger
automation support.

Expected additions:

- Additional agents:
  - chief-of-staff
  - deep-research
- Multi-workspace model field validation
- Automated trust scoring pattern
- Full approval gate chain implementation
- Expanded audit trail examples
- More complete enterprise operating model guidance

---

## v3.0 - Enterprise Scale Pattern

Planned maturity layer for enterprise-scale governance,
reporting and compliance support.

Expected additions:

- Enterprise division model field-proven
- Full row-level security policy suite for enterprise tables
- Compliance export capability
- Eval/Telemetry service reference pattern
- Deploy service reference pattern
- Enterprise reporting patterns
- Expanded control evidence mapping

---

## Contributing

Community contributions are welcome in focused areas:

- Case studies
- Schema extensions
- Concept documentation
- Runtime adapter examples
- Enterprise adoption notes

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution
guidelines.

Runtime adapter contributions for Codex, Cursor, Windsurf
and other agent runtimes are especially welcome.

To preserve the integrity of the reference architecture,
contributions should extend the pattern without weakening
the core governance principles:

- Human approval before production-impacting actions
- Append-only audit trail
- Trust scoring based on evidence
- Failure memory with recurrence tracking
- Clear separation between agents, services and routines
