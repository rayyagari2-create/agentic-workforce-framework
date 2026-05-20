# AWF Public Roadmap

This roadmap covers the public framework standards repository only.
Runtime adapter implementations, private production-reference evidence
and the commercial control-plane remain in a separate private repository.

---

## Public / Private Boundary

| Public (this repo) | Private (commercial repo) |
|---|---|
| Framework concepts and standards | Runtime adapter implementations |
| Schemas and rubrics | Gate 2 / Gate 3 execution evidence |
| D1-D4 trust scoring model | Commercial control-plane |
| Trust subject model | Private production-reference implementation |
| Adapter capability model | Real Claude Code and Codex adapter code |
| Enforcement limit standards | Private audit chain evidence |
| Sanitized demo patterns | |
| Governed skills and plugin scaffolds | |

---

## v0.1.0 — Sprint 0 + Sprint 1: Reference Framework Foundation
**Status: COMPLETE**

- CLI scaffold and demo runner
- Five-agent reference operating model
- D1-D4 trust scoring rubric and calibration anchors
- Failure memory taxonomy (17 classes)
- AgentTaskManifest, QAVerdict, FailureRecord, TrustScore schemas
- Simulated governance demo
- Postgres governance schema (core + enterprise extension)
- OS-level hook examples (sanitized)

---

## v0.2.0 — Sprint 2: Cross-Runtime Governance Proof
**Status: CURRENT**

AWF has validated the cross-runtime governance pattern across two real
agent runtime families — Claude Code (Anthropic) and Codex (OpenAI) —
through a private production-reference implementation.

Public scope released:
- Runtime Adapter Capability Model (DESIGN-01) — 12 capability surfaces,
  7 runtime profiles, evidence strength model E0-E3
- Trust Subject Model (DESIGN-02) — 7 trust subject types, subject_key
  patterns, cross-runtime trust rules
- Adapter Enforcement Limits (DESIGN-03) — per-tier claims language,
  overclaiming prevention standard
- Sanitized cross-runtime demo replay in examples/cross-runtime/

Private scope (not in this repo):
- Real Claude Code and Codex adapter implementations
- Gate 3 production validation evidence
- Commercial control-plane implementation

---

## v0.3.0 — Public Governance Schemas
**Status: PLANNED**

- trust_subjects reference schema
- trust_capability_profiles reference schema
- Evidence strength schema (E0-E3 formal definition)
- AdapterCapabilityProfile schema
- Public validation CLI commands for framework artifacts:
  awf validate manifest
  awf validate trust
  awf validate failure

---

## v0.4.0 — Governed Skills and Plugin Scaffolding
**Status: PLANNED**

- AWF governed skills model
- AGENTS.md governance template library
- Runtime-specific plugin manifest scaffolds (Claude Code, Codex,
  Cursor, OpenClaw patterns) — sanitized, no proprietary adapter code
- awf init command for scaffolding governance in a new repo

---

## v0.5.0 — Community Adapter Examples
**Status: PLANNED**

- Simulated event-rich adapter (Claude Code profile) — no real SDK
- Simulated policy-rich adapter (Codex profile) — no real SDK
- Simulated artifact-rich adapter (Devin profile) — no real API
- LangGraph embedded governance example
- GitHub Actions artifact adapter example

---

## v1.0 — Public Reference Standard
**Status: DIRECTIONAL**

- Stable schemas (no breaking changes without major version bump)
- Stable D1-D4 scoring model
- Stable trust subject model
- Stable adapter capability model
- Stable enforcement claim language
- Complete sanitized demo suite
- Adoption guide and case study library
- Community adapter contribution path

---

## Contributing

Public contributions are welcome in:
- Schema extensions and schema versions
- Adapter capability profiles for new runtimes
- Simulated adapter examples (no real SDK code required)
- Governed skills and AGENTS.md templates
- Enforcement-limit documentation for additional runtime tiers
- Case studies and adoption guides

Commercial runtime adapters and private production-reference
implementations are maintained separately and are not accepting
public contributions.

See CONTRIBUTING.md for guidelines.

---

*Roadmap owner: Ramesh Ayyagari*
*Last updated: 2026-05-20*
*Change process: roadmap updates require explicit milestone decision*
