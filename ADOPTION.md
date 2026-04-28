# Adoption Guide

A practical guide for enterprise teams evaluating or
implementing the Agentic Workforce Framework.

---

## Who this is for

Engineering leaders, platform teams and AI governance teams
building or operating autonomous agent systems that need
durable accountability beyond prompt files and API calls.

This framework is most useful when:

- You are running more than one agent simultaneously
- Agents are making decisions that affect production systems
- You need an audit trail for agent actions
- You need to track whether agent behavior is improving
  or degrading over time
- You have multiple humans who need to approve high-risk
  agent work

---

## What to implement first

Start with the minimum viable governance stack. In order:

1. **Agent roster with capability boundaries.** Define who
   each agent is and what it is allowed to touch. Without
   this, nothing else is enforceable.

2. **AgentTaskManifest for MEDIUM and HIGH risk tasks.**
   The manifest is the contract between the operator and
   the agent. Without it there is nothing to enforce.

3. **Manual D1-D4 trust scoring with evidence.**
   Score by hand before automating. Calibration requires
   human judgment. Automated scoring from uncalibrated
   scores produces drift.

4. **FailureRecord for every defect.**
   Recurrence detection requires a record of prior failures.
   The failure library is the agent's institutional memory.

5. **Pre-task failure retrieval.**
   Before any task starts the orchestrator checks the failure
   library for that domain. This is the highest-leverage
   practice in the framework and requires no tooling.

See [examples/minimum-viable-adoption/](examples/minimum-viable-adoption/)
for a day-one path that produces a scored session in 4-6 hours.

---

## Fast scaffold path

For a starter setup, use the AWF CLI:

    npx agentic-workforce-framework@latest init
    npx agentic-workforce-framework@latest check

For Claude Code, select the Claude Code runtime. The CLI scaffolds
the reference agents, framework artifacts, schemas and Claude Code
hook examples.

For Cursor, Windsurf and other runtimes, select the runtime-agnostic
option. The CLI scaffolds the framework artifacts, but agent invocation
and hook wiring must be adapted to that runtime.

The CLI is a scaffold, not a runtime. It installs the operating model
artifacts so teams can adapt them into their own agent environment.

---

## What not to implement first

**Do not start with hooks.** Hooks enforce governance that
must first exist as documented discipline. Add hooks only
for violations you have actually observed, not hypothetical
ones. Hypothetical hooks block legitimate work.

**Do not start with Postgres.** File-based governance is
sufficient for the first 15 sessions. Migrate to Postgres
when the file-based ledger becomes unwieldy.

**Do not start with the enterprise schema.** The enterprise
model (divisions, workspaces, work queues) is a Reference
Pattern, not field-proven. Implement single-workspace
governance reliably before attempting multi-workspace.

**Do not automate trust scoring before calibrating manually.**
Manual scoring for the first 20 sessions reveals calibration
gaps that automated systems will silently amplify.

---

## Minimum viable governance stack

The minimum stack that produces governance value on day one:

| Component | Implementation | Where |
|---|---|---|
| Starter scaffold | awf init and awf check | packages/awf-cli/ |
| Agent roster | Instruction files with capability boundaries | agents/ |
| Task contract | AgentTaskManifest markdown or JSON | schemas/v1/agent-task-manifest.schema.json |
| Observability | File-based agent bulletin | governance/agent-bulletin.md |
| Trust scoring | Manual D1-D4 with one evidence line per dimension | calibration/d1-d4-rubric.md |
| Failure memory | FailureRecord per defect and pre-task retrieval | schemas/v1/failure-record.schema.json |
| Human approval | One operator reviews HIGH-risk work before spawn | docs/control-plane/hitl-gates.md |

No Postgres. No hooks. No routines. Just discipline and
written records.

---

## How to adapt this to your runtime

The reference implementation runs on Claude Code. The
governance model is runtime-agnostic.

What is runtime-specific:
- Hook wiring (PreToolUse / PostToolUse syntax)
- Slash command format for agent instruction files
- Manifest token injection mechanism

What is runtime-agnostic:
- D1-D4 trust scoring
- Failure record format and recurrence detection
- AgentTaskManifest structure
- Pre-spawn protocol decision tree
- HITL approval gates
- Audit trail requirements

To adapt for a different runtime:
1. Copy the agent instruction files and reformat for your
   runtime's invocation syntax
2. Implement the manifest sidecar pattern using your
   runtime's pre-execution hook equivalent
3. Keep all governance schemas identical, they are not
   runtime-dependent

See [agents/README.md](agents/README.md) for the
five-point customization checklist.

---

## How to evaluate readiness

You are ready to adopt the framework when:

- [ ] You can name every agent on your team and describe
      its capability boundary in one sentence
- [ ] You have written at least one AgentTaskManifest
      for a MEDIUM-risk task
- [ ] You have scored at least one session using D1-D4
      with evidence per dimension
- [ ] You have written at least one FailureRecord
- [ ] You have run pre-task failure retrieval at least once

You are ready to add hooks when:

- [ ] You have 15+ scored sessions
- [ ] You have observed at least one violation that a hook
      would have caught
- [ ] Your shadow-mode hook run shows no false positives
      over 10 sessions

You are ready for Postgres when:

- [ ] File-based ledger has more than 50 sessions
- [ ] You need cross-session queries the file system
      cannot answer
- [ ] A second human reviewer has joined and traceability
      across reviewers is required
