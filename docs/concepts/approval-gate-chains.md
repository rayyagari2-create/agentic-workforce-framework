# Approval Gate Chains

> **Status:** The HITL gate type is live in the reference implementation
> (single-workspace, single reviewer). DELEGATION, ESCALATION and
> APPROVAL gate types are designed for multi-reviewer teams — not yet
> field-proven. See `database/enterprise/` for the schema.

## Opening — What Approval Gate Chains Are

At single-founder scale, every HITL approval lands in one person's inbox;
there is no question who decides and no question of routing. At enterprise
scale that model collapses: a single inbox cannot serve multiple teams,
a single human cannot weigh approvals across domains they do not own,
and unilateral sign-off on cross-team CRITICAL work defeats the point of
having multiple authority levels in the first place. Approval gate chains
are the structured escalation paths that route an approval to the correct
authority, allow it to be temporarily delegated, and escalate it upward
when prior steps time out — without compressing authority levels into a
single approver and without creating bottlenecks that block work
indefinitely.

---

## Gate Types

A gate is a hard pause in the build state machine. The agent does not
proceed until an authorized human decision is recorded. Four gate types
exist; each fires under different conditions and routes to a different
authority class.

| Gate Type | Triggered When | Who Approves | Can Delegate? |
|---|---|---|---|
| HITL | riskLevel = HIGH; agent at RESTRICTED; locked region touched | Designated reviewer for this workspace | Yes, with TTL |
| DELEGATION | Authorized reviewer unavailable; delegate exists with valid TTL | Designated delegate | No — re-delegation prohibited |
| ESCALATION | Gate timed out; 3-strike threshold hit; Team Orchestrator cannot approve | Next authority level up | No |
| APPROVAL | riskLevel = CRITICAL; public-API surface change | CTO-equivalent authority | No |

The gate type is recorded as a discrete enum value in `gate_records`. A
single task may produce a chain of rows — a HITL row, a DELEGATION row
that fired because the primary reviewer was unavailable, an ESCALATION
row that fired because the delegate also declined. The chain is
reconstructed by traversing `prior_gate_id`.

Gates fire **before** the agent spawns, never after. A gate that fires
after work has already started is retroactive sign-off, which is the
failure mode the framework is built to prevent.

---

## The Single-Workspace Model

At single-founder scale, HITL is the only gate type exercised in
practice. One person approves all HIGH-risk tasks. The other gate types
— DELEGATION, ESCALATION and APPROVAL — are designed for multi-reviewer
teams and are not exercised when there is exactly one designated
reviewer. Implement HITL first: get the manifest discipline, the
mandatory rationale field and the audit threading right at
single-workspace scale before introducing the other gate types. Adding
DELEGATION before HITL is reliable in practice creates the audit gaps
that the multi-reviewer model exists to prevent.

---

## The Enterprise Approval Chain

A HIGH-risk or CRITICAL-risk task may pass through a chain of gates
before resolving. The chain captures both planned routing (HITL →
escalate when nobody is available) and the multi-authority requirement
on CRITICAL work.

```
HIGH-risk task in Team A:
    Team Orchestrator A → HITL gate triggers
    → Routes to: Tech Lead A (approval authority for team scope)
    → If Tech Lead A unavailable: escalates to Division Orchestrator
    → Division Orchestrator → VP-equivalent approval

CRITICAL-risk task (cross-team, schema change):
    Team Orchestrator → cannot approve
    → Escalates to Division Orchestrator
    → Division Orchestrator → requires CTO-equivalent approval
    → CTO approves → Division Orchestrator authorizes Team Orchestrator
    → Team Orchestrator spawns the executing agent
```

### HIGH-risk task in a single team

The approval lands at the lowest authority level that owns the work.
Only when that level is unavailable does the chain extend — first
through DELEGATION (a designated deputy with a valid TTL), then through
ESCALATION (the next authority level up). The gate row at each step
records why the prior step did not resolve — `decision = EXPIRED` for
a TTL miss, `decision = ESCALATED` for an explicit upward route — so
the audit trail can prove the chain was not artificially short-circuited.

### CRITICAL-risk task requiring cross-team coordination

CRITICAL work routes to APPROVAL even when a Division Orchestrator is
fully available. The APPROVAL gate type requires multi-authority
sign-off; a single signature on CRITICAL work defeats the property the
gate type exists to enforce. Every transition lands as its own row in
`gate_records`, with the same `correlation_id` threading the entire
chain so post-mortems can reconstruct the sequence in order.

---

## Chain Composition Rules

These rules govern how gates compose into chains. Each rule exists
because the failure mode it prevents is one observed in real approval
workflows.

1. **A gate fires BEFORE the agent spawns — never after.** A gate that
   fires after work has already started is retroactive sign-off, not
   approval. The manifest is the artifact that proves authority
   preceded action.
2. **The Orchestrator surfaces the manifest, risk assessment and
   rationale before waiting for approval.** Approvers cannot sign what
   they have not been shown. The same content visible to the approver
   is the content recorded in the gate row.
3. **Approval is explicit — silence is not approval.** A gate with no
   recorded decision stays PENDING; a PENDING gate that ages past its
   TTL becomes EXPIRED and triggers ESCALATION. There is no path from
   "the approver did not respond" to "the work proceeds."
4. **Every approval decision is recorded in `gate_records`.** This
   includes APPROVED, REJECTED, EXPIRED and ESCALATED outcomes. The
   `rationale` field is mandatory for every decision, including
   APPROVED — silent approval is the most common audit failure.
5. **HITL approval for HIGH-risk tasks requires `hitlApproved = true`
   in the sidecar manifest before the hook allows spawn.** The
   PreToolUse hook reads the sidecar; a HIGH-risk manifest without
   `hitlApproved = true` is rejected at the hook layer regardless of
   what is recorded elsewhere.
6. **A Team Orchestrator cannot approve what requires Division approval
   — authority levels do not compress upward.** If a task's risk
   classification or scope sits above the orchestrator's tier, the
   orchestrator has no path to self-approve; the gate must escalate.
   The hierarchy exists precisely to prevent the lower tier from
   short-circuiting the upper one.

---

## 3-Strike Escalation

If a gate has fired three times on the same task without resolution —
three QA FAIL strikes, three timeouts, or any combination that drives
`strike_count` to 3 on the corresponding `work_queue_items` row — the
task escalates automatically to the next authority level. The runtime
fires an ESCALATION gate before the next attempt; the lower tier no
longer has discretion to retry.

The 3-strike rule prevents two failure modes at once. First, it prevents
approval loops where the same gate is repeatedly fired and resolved
without the underlying work converging — a sign that something deeper
than a single decision is broken. Second, it forces visibility upward:
a task that has cost three approval cycles deserves the attention of
an authority level that can change the scope, retire the agent, or
rewrite the instruction file. The lower tier does not get to keep
paying the cost.

The strike escalation is the gate-level expression of the framework's
broader rule: repeated failures on the same class are a serious signal,
and the response is not another retry — it is structural intervention.

---

## Schema Reference

The persistence layer for gate chains lives in `database/enterprise/`.
`006_gate_records.sql` defines the `gate_records` table — one row per
HITL/DELEGATION/ESCALATION/APPROVAL decision, with the `prior_gate_id`
self-reference that lets a chain be reconstructed in order, the
mandatory `rationale` column, and the `expires_at` TTL that drives the
EXPIRED → ESCALATION sweep. `007_delegation_rules.sql` defines the
explicit, TTL-bounded delegation grants that make the DELEGATION gate
type possible. `schemas/v1/agent-task-manifest.schema.json` is the
manifest schema the Orchestrator generates and the approver sees. The
HITL approval flag itself (`hitlApproved`) is set on the sidecar
manifest written by the Orchestrator and read by the PreToolUse hook;
the sidecar contract is documented in `governance/locked-states.md`.

---

## Cross-references

- HITL gate types and authority levels: `docs/control-plane/hitl-gates.md`
- Explicit-only delegation rules: [delegation.md](delegation.md)
- Where gates fire in the lifecycle: `docs/control-plane/pre-spawn-protocol.md`
- Audit recording of gate decisions: `docs/control-plane/audit-trail-patterns.md`
- Hook enforcement for spawn-blocking: `docs/control-plane/hook-system.md`
- Build state machine and 3-strike rule: `docs/control-plane/build-state-machine.md`
- Trust scoring and autonomy gates: [trust-scoring.md](trust-scoring.md), [autonomy-gates.md](autonomy-gates.md)
- Enterprise scaling architecture: `docs/architecture/enterprise-scaling.md`
