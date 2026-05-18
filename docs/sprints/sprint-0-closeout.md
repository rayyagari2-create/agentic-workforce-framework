# Sprint 0 Closeout

Status: COMPLETE
Date: 2026-05-17
Tag: v0.1.0-sprint-0
Demo command: node examples/awf-demo/src/run-demo.js

## DoD Checklist
- [x] Core data model (10 tables, tenant/division/workspace scope)
- [x] Audit service running as separate process
- [x] Hash chain verified including division_id
- [x] AWFAgentRuntime interface v1.0
- [x] Simulated adapter implements all 6 methods
- [x] Work intake from JSON
- [x] Risk classifier (10 rules, all tests passing)
- [x] Priority queue with SKIP LOCKED
- [x] Single approval gate
- [x] Agent assignment (5 roles)
- [x] D1-D4 reference scorer
- [x] QA verdict production (AJV-validated)
- [x] CLI demo runs end to end (9 steps, VERIFIED)
- [x] README updated
- [ ] Distribution list (parked, research pending)

## Known Limitations
- D1 and D2 are candidate scores. Calibration requires n >= 20 sessions.
- Runtime adapters for Claude Code and Codex ship in Sprint 2.
- Single workspace only. Multi-workspace RLS ships in Sprint 2.

## Evidence
- 24 audit events per demo run
- Hash chain: VERIFIED on every run
- runtime breakdown: pre_execution 19, simulated 5
