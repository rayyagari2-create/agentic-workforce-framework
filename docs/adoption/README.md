# Adoption Path

**Four maturity levels. Start where you are. Move up when ready.**

The framework is designed for incremental adoption. You do not need
divisions, workspaces, Postgres or automation routines to get value
on day one. Start with the controls that cost the least and produce
the most signal. Add layers as the team grows and the need for
enforcement increases.

Every level builds on the previous. Do not skip levels. The most
common mistake is adopting Level 3 tooling before Level 1 discipline
is stable.

---

## Level 1 — Single Team

**Who this is for:** One operator. One repository. A small team of
executing agents. This is where every adoption starts.

**What you adopt:**

| Component | Why | Where to start |
|---|---|---|
| Agent roster with capability boundaries | Agents need defined job descriptions before they can be governed | [`agents/orchestrator.md`](../../agents/orchestrator.md) |
| AgentTaskManifest for MEDIUM+ tasks | The manifest is the contract. Without it, there is nothing to enforce | [`schemas/v1/agent-task-manifest.schema.json`](../../schemas/v1/agent-task-manifest.schema.json) |
| File-based bulletin and locks | Observability must exist before scoring can mean anything | [`governance/agent-bulletin.md`](../../governance/agent-bulletin.md) |
| Manual D1-D4 trust scoring | Calibrate by hand first. Automation before calibration produces noise | [`calibration/d1-d4-rubric.md`](../../calibration/d1-d4-rubric.md) |
| FailureRecord for every defect | Recurrence detection requires a record of prior failures | [`schemas/v1/failure-record.schema.json`](../../schemas/v1/failure-record.schema.json) |
| Pre-task failure retrieval | The highest-leverage practice. The agent reads its own failure history before starting | [`docs/control-plane/pre-spawn-protocol.md`](../control-plane/pre-spawn-protocol.md) |
| Manual HITL approval for HIGH-risk tasks | One person approves all high-risk work. No tooling required. | [`docs/control-plane/hitl-gates.md`](../control-plane/hitl-gates.md) |

**What you skip at Level 1:**
Postgres, hooks, routines, work queues, delegation, enterprise schema.
Add these when file-based governance becomes the bottleneck — typically
after 15+ sessions.

**Time to first scored session:** 4-6 hours.

**Graduate to Level 2 when:**
- You have 15+ scored sessions and the file-based ledger is unwieldy
- You have caught the same failure class twice and want enforcement
- A second reviewer has joined and you need cross-reviewer traceability

See: [`examples/minimum-viable-adoption/`](../../examples/minimum-viable-adoption/)

---

## Level 2 — Single Team with Enforcement

**Who this is for:** A team that has run 15+ sessions at Level 1 and
is ready to add technical enforcement on top of documented discipline.

**What you add:**

| Component | Why | Where to start |
|---|---|---|
| Postgres governance schema | File-based ledger does not scale or query. Postgres enables cross-session analysis | [`database/governance/`](../../database/governance/) |
| OS-level hooks (start with 2-3) | Add hooks only for violations you have actually observed. Not hypothetical ones | [`hooks/pre-tool-use/`](../../hooks/pre-tool-use/) |
| Three-point spawn control loop | PreToolUse + SubagentStart + PostToolUse gives full lifecycle coverage | [`hooks/claude-code-settings.example.json`](../../hooks/claude-code-settings.example.json) |
| Manifest sidecar validation | The hook validates the manifest before the spawn fires | [`hooks/pre-tool-use/check-agent-spawn.example.js`](../../hooks/pre-tool-use/check-agent-spawn.example.js) |
| Automated failure library retrieval | Orchestrator pulls failure library entries before every spawn, not from memory | [`docs/control-plane/pre-spawn-protocol.md`](../control-plane/pre-spawn-protocol.md) |

**Key principle:** Add hooks for violations you have observed, not
violations you are worried about. Hypothetical hooks fire on edge
cases and erode trust in the hook system.

**Start in shadow mode.** Run `HOOK_MODE=shadow` for 10+ sessions
before switching to `HOOK_MODE=enforce`. Shadow mode logs violations
without blocking. Enforcement mode blocks. The shadow window is the
period that tells you whether your hooks codify reality or fantasy —
if a shadow run produces violations on legitimate work, the hook is
wrong, not the work.

**Graduate to Level 3 when:**
- You have multiple teams working in parallel
- You need workspace isolation between teams
- A second workspace is needed for a different project or domain

See: [`examples/single-workspace/`](../../examples/single-workspace/)

---

## Level 3 — Multi-Team

**Who this is for:** Multiple teams working in parallel, requiring
workspace isolation, role-gated approvals and cross-team visibility.

**What you add:**

| Component | Why | Where to start |
|---|---|---|
| Enterprise schema (divisions, workspaces) | `workspace_id` scoping isolates teams. Divisions anchor the org structure | [`database/enterprise/001_divisions.sql`](../../database/enterprise/001_divisions.sql) |
| Persistent agent instances | Trust score travels with the agent across teams. Not reset on reassignment | [`database/enterprise/004_agent_instances.sql`](../../database/enterprise/004_agent_instances.sql) |
| Work queue system | Decouples task definition from execution. Work persists across sessions | [`database/enterprise/005_work_queue_items.sql`](../../database/enterprise/005_work_queue_items.sql) |
| Approval gate chains | HITL approval routes to the correct authority. Team Orchestrator cannot approve Division-scope decisions | [`database/enterprise/006_gate_records.sql`](../../database/enterprise/006_gate_records.sql) |
| Bulletin lane protocol | Parallel sessions use LANE-A / LANE-B prefixes to prevent bulletin collision | [`docs/control-plane/build-state-machine.md`](../control-plane/build-state-machine.md) |
| Division Orchestrator | Routes work across teams. Does not execute tasks. Approves cross-team escalations | [`docs/architecture/enterprise-scaling.md`](../architecture/enterprise-scaling.md) |

**Status: Reference Pattern.** The multi-team model is designed and
documented. Not yet field-proven at scale. Implement Level 1 and
Level 2 reliably before attempting Level 3. The single most common
multi-team failure mode is treating the extension as a substitute for
single-workspace discipline rather than as an addition to it.

See: [`examples/multi-team/`](../../examples/multi-team/)

---

## Level 4 — Regulated Enterprise

**Who this is for:** Organizations with formal audit, compliance or
regulatory requirements around autonomous agent operations.

**What you add:**

| Component | Why | Where to start |
|---|---|---|
| Formal separation of duties | Agents cannot write their own audit records. Eval service is the only trust score writer | [`docs/control-plane/control-ownership-matrix.md`](../control-plane/control-ownership-matrix.md) |
| Append-only audit evidence | All `audit_log` entries are immutable. No modification after write | [`database/governance/001_audit_log.sql`](../../database/governance/001_audit_log.sql) |
| Policy evidence records | Every HITL decision, delegation and escalation produces a `gate_record` | [`database/enterprise/006_gate_records.sql`](../../database/enterprise/006_gate_records.sql) |
| Trust-based autonomy gates | Agent autonomy expands and contracts based on behavioral evidence across sessions | [`docs/concepts/autonomy-gates.md`](../concepts/autonomy-gates.md) |
| Compliance export capability | Audit log queryable for evidence extraction. Schema supports point-in-time recovery | [`database/governance/001_audit_log.sql`](../../database/governance/001_audit_log.sql) |
| Threat model coverage | Hook interception security, manifest spoofing controls, cross-workspace isolation | [`security/threat-model.md`](../../security/threat-model.md) |

**Status: Planned.** The Level 4 model defines the target architecture
for regulated deployments. The schema and controls are designed.
Formal compliance certification requires legal and compliance review
beyond this framework.

---

## Adoption Anti-Patterns

The five most common mistakes, in rough order of how much damage they do:

1. **Adopting Level 3 tooling before Level 1 discipline is stable.**
   The most common mistake. Postgres and hooks cannot compensate for
   teams that do not yet write manifests or score sessions consistently.
   The tools amplify whatever discipline exists; on top of no discipline,
   they amplify nothing.

2. **Running hooks in enforce mode before shadow validation.**
   Hypothetical hooks block legitimate work. Run shadow mode for 10+
   sessions before enforcing. A hook that fires once on an edge case
   the team agrees should not be blocked is one that the team will
   route around the next time it fires — and the hook system loses
   credibility from there.

3. **Skipping failure records because "nothing broke."**
   Something always breaks. The value of failure records is recurrence
   detection, not incident reporting. The session where you skip the
   record because it was a small thing is the session whose pattern
   repeats six weeks later with no entry in the library to surface it.

4. **Automating trust scoring before manual calibration is stable.**
   Automated scoring from uncalibrated human scores produces drift
   that takes months to detect. Run at least 15 manual sessions with
   one calibrated reviewer before letting any automated scorer touch
   the ledger.

5. **Treating the adoption path as optional sequence.**
   Each level assumes the previous level is stable. Skipping produces
   fragile governance that fails under pressure — typically at the
   moment a real incident requires the audit trail to be intact and
   the trail turns out to be missing the layers that would have made
   it readable.

---

## Related

- [`examples/minimum-viable-adoption/`](../../examples/minimum-viable-adoption/) — Level 1 reference, file-based, no Postgres, no hooks.
- [`examples/single-workspace/`](../../examples/single-workspace/) — Level 2 reference, the single-workspace operating model the framework runs against today.
- [`examples/multi-team/`](../../examples/multi-team/) — Level 3 reference pattern, designed but not yet field-proven.
- [`docs/architecture/enterprise-scaling.md`](../architecture/enterprise-scaling.md) — the architectural model that Level 3 and Level 4 are built on.
- [`docs/control-plane/`](../control-plane/) — the control-plane documents (pre-spawn protocol, HITL gates, build state machine, hook system) that every level relies on.
