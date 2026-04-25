# Division Orchestrator — Worked Approval Chain [v3.0 — designed, not field-proven]

> **Status: Designed, not yet field-proven at multi-team scale. Ships with v3.0.**
>
> The Division Orchestrator and the approval gate chain described below
> are part of the v3.0 enterprise extension. The architectural model is
> documented in [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md).
> The reference implementation today runs the single-workspace operating
> model — see [`../single-workspace/`](../single-workspace/). Treat this
> file as a worked example of the design target, not as something
> running in production.

This file walks through one CRITICAL-risk task end-to-end so a reader
can see how approval authority routes upward, who decides what, and
what the audit log records at each step. It is the v3.0 counterpart to
the single-workspace [session-scoring-walkthrough](../single-workspace/session-scoring-walkthrough.md).

---

## The hierarchy at a glance

```
Division Orchestrator (VP-equivalent)
    │
    ├── Team Orchestrator A (Tech Lead Domain X)
    │       ├── Frontend Agent (workspace A)
    │       ├── Backend Agent  (workspace A)
    │       ├── QA Agent       (workspace A)
    │       └── Fix Agent      (workspace A)
    │
    └── Team Orchestrator B (Tech Lead Domain Y)
            ├── Backend Agent  (workspace B)
            ├── QA Agent       (workspace B)
            └── Fix Agent      (workspace B)
```

**Two rules govern the example below.**

1. **Manager Agents route — they do not execute.** Division Orchestrator
   spawns Team Orchestrators only. Team Orchestrators spawn executing
   agents only. No Manager Agent writes application code.
2. **Authority is role-gated. Invocation is workspace-scoped.** Any
   authorized member of a workspace may invoke the Team Orchestrator
   in that workspace. Approval of a HIGH-risk task is the Tech Lead's
   role; approval of a CRITICAL-risk task is the Division Orchestrator's
   role; approval beyond that escalates to a CTO-equivalent human.
   These are separate layers and conflating them is the bottleneck the
   chain is designed to avoid.

---

## Scenario

**Context.** Two teams share a common contract — a shape used by both
Team A's frontend (consumer) and Team B's backend (producer). Team A
wants to add a new field to the shape so its UI can render an
additional state. Adding the field requires changes across:

- Team A's frontend (consumer code reads the new field)
- Team B's backend (producer code writes the new field)
- The shared contract schema (under change-controlled `contracts/`)
- Team B's database (a new column to source the field)

This is a CRITICAL-risk task because it crosses team boundaries AND
modifies a change-controlled artifact (the shared contract) AND
requires a database migration. Per the manifest's `riskLevel` enum,
CRITICAL triggers Boardroom-equivalent review, which at v3.0 maps to
Division Orchestrator authority with mandatory CTO-equivalent human
approval.

**Actors in this scenario** (all roles, none individuals):

- **Team A Tech Lead** — Tech Lead authority for workspace A.
- **Team B Tech Lead** — Tech Lead authority for workspace B.
- **Division Orchestrator (Manager Agent)** — coordinates approvals
  across teams; cannot itself approve a CRITICAL-risk change.
- **CTO-equivalent** — human with authority to approve CRITICAL
  cross-team schema changes.

---

## The chain

### Step 1 — Team A Tech Lead invokes Team Orchestrator A

Team A Tech Lead invokes Team Orchestrator A in workspace A:

> "Add a new field `<field>` to the shared contract so Team A's UI can
> render the new state."

Team Orchestrator A runs the pre-spawn protocol (STEP 1 risk
classification). Inputs: files in scope, contracts referenced, domains
touched, agent roster available.

**STEP 1 output:**

```
riskLevel:    critical
domains:      [contracts/shared, team-a/frontend, team-b/backend,
               team-b/db/migrations]
crossTeam:    true
contractChange: true
migration:    true
verificationRequired:
  [schema_validation, contract_versioning_review,
   integration_test, qa_agent_review, human_approval]
```

Team Orchestrator A appends to the workspace-A bulletin:

```
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A] CLASSIFY: riskLevel=critical
                   crossTeam=true contractChange=true
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A] HITL-GATE: cannot self-approve
                   critical task — escalating to Division Orchestrator
```

Team Orchestrator A does NOT spawn any executing agent. CRITICAL is
above the team scope.

---

### Step 2 — Team Orchestrator A escalates to Division Orchestrator

Team Orchestrator A creates a `gate_record` in the enterprise schema:

```
gateRecordId:   <ULID>
workspaceId:    workspace-A
gateType:       ESCALATION
escalationReason: critical-cross-team-contract-change
proposedManifest:
  taskType:    feature
  riskLevel:   critical
  domains:     [contracts/shared, team-a/frontend, team-b/backend,
                team-b/db/migrations]
  interfacesTouched:
               [shared-contract: <name>, db-table: <name>]
  blockingDependencies: [contract update completes Wave 0]
status:         PENDING
ttl:            48h
```

Division Orchestrator polls (or is triggered by) the
`gate_records.status=PENDING` queue and reads the proposal.

Division Orchestrator's role at this step is to:

1. Confirm the request matches its own authority (CRITICAL → MUST
   route to CTO; Division Orchestrator cannot self-approve).
2. Confirm Team B is reachable and would be affected; spawn no work
   yet — **only the contract review and the routing decision happen
   here**.
3. Open a parallel `gate_record` for Team Orchestrator B (with
   `gateType: APPROVAL_REQUEST`), so Team B is aware before
   work begins.
4. Compose a human-facing approval brief and route to the CTO-equivalent.

Division Orchestrator's bulletin (cross-workspace summary lane,
visible to both workspaces):

```
[YYYY-MM-DD HH:MM] [DIV-ORCH] RECEIVED: ESCALATION from team-orch-a
                   gateRecordId=<ULID>
[YYYY-MM-DD HH:MM] [DIV-ORCH] CLASSIFY: critical+cross-team —
                   cannot self-approve — routing to CTO
[YYYY-MM-DD HH:MM] [DIV-ORCH] OPEN: APPROVAL_REQUEST gate to team-orch-b
                   workspaceId=workspace-B
[YYYY-MM-DD HH:MM] [DIV-ORCH] BRIEF: human approval requested,
                   summary attached
```

---

### Step 3 — CTO-equivalent reviews the brief

The brief Division Orchestrator routes is short and load-bearing.
Roughly:

```
APPROVAL REQUESTED — CRITICAL cross-team schema change

Proposing team:       Team A
Affected team:        Team B
Contract changing:    contracts/shared/<name>
Field being added:    <field-name> : <field-type>
Database migration:   workspace-B db, new column on table <name>
Frontend consumer:    workspace-A, component <name>
Risk reasoning:       cross-team + contract + migration

Approver authority:   CTO (CRITICAL is above Division Orchestrator)
TTL:                  48h

Trust context:
  Team Orchestrator A:  HIGH (n=N sessions, rolling avg X)
  Team Orchestrator B:  HIGH (n=N sessions, rolling avg X)
  Backend Agent (B):    STANDARD (n=N, last D3 score Y)
  Frontend Agent (A):   STANDARD (n=N, last D3 score Y)

Failure-library matches: <N entries> on
  files=[contracts/shared/<name>] OR failureClass=schema_violation
```

**The brief is pre-decision context, not a recommendation.** Division
Orchestrator does not advocate. The CTO either approves, rejects, or
requests more information.

If approved, the CTO-equivalent records the decision against the
`gate_record`:

```
gateRecordId:    <ULID>
status:          APPROVED
approver:        cto-equivalent (role-gated identity)
decisionAt:      [ISO 8601]
rationale:       [one paragraph — why this change is approved,
                  what the boundary conditions are, when re-review
                  is needed]
delegationTtl:   72h (for the resulting work to begin and complete)
```

---

### Step 4 — Division Orchestrator authorizes Team Orchestrators

With CTO approval recorded, Division Orchestrator now authorizes the
two Team Orchestrators to begin coordinated work.

Division Orchestrator does NOT spawn executing agents — only Team
Orchestrators do that. Division Orchestrator's authorization is a
write to the `gate_records` and a notification to each Team
Orchestrator.

Bulletin entries (cross-workspace summary lane):

```
[YYYY-MM-DD HH:MM] [DIV-ORCH] APPROVED: gateRecordId=<ULID> by CTO
                   delegationTtl=72h
[YYYY-MM-DD HH:MM] [DIV-ORCH] AUTHORIZE: team-orch-a to spawn Wave 0
                   (contract update) and Wave 2 (frontend consumer)
[YYYY-MM-DD HH:MM] [DIV-ORCH] AUTHORIZE: team-orch-b to spawn Wave 1
                   (backend producer + db migration)
[YYYY-MM-DD HH:MM] [DIV-ORCH] WAVE-PLAN: Wave 0 → Wave 1 → Wave 2
```

The wave plan is significant: contract first (Wave 0, owned by
Team A's contract steward), then backend producer (Wave 1, Team B),
then frontend consumer (Wave 2, Team A). This is the dependency
order — contracts unblock the producer; producer unblocks the
consumer.

---

### Step 5 — Team Orchestrators execute within their scopes

Each Team Orchestrator now runs the standard single-workspace
sequence within its workspace, scoped to the wave it owns. The work
is identical to single-workspace execution; the difference is that
the manifest carries the `gateRecordId` reference, and the bulletin
entries are tagged with the workspace identifier.

**Team Orchestrator A — Wave 0 (contract update)**

```
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] AUTHORIZED: gateRecordId=<ULID>
                   wave=0 task=contract-update
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] MANIFEST: taskId=<ULID>
                   riskLevel=critical (carried from gate)
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] SPAWN: contract-steward agent
                   for contracts/shared/<name>
... agent works, QA loop runs, session closes ...
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] WAVE 0 COMPLETE: contract
                   v<N> published; READY signal posted
```

**Team Orchestrator B — Wave 1 (backend producer + migration)**

Reads Team A's READY signal, confirms the contract version is the one
the gate authorized, then spawns its own agents:

```
[YYYY-MM-DD HH:MM] [TEAM-ORCH-B][WS-B] AUTHORIZED: gateRecordId=<ULID>
                   wave=1 task=backend-producer + db-migration
[YYYY-MM-DD HH:MM] [TEAM-ORCH-B][WS-B] DEPENDENCY: confirmed contract
                   v<N> READY in cross-workspace bulletin
[YYYY-MM-DD HH:MM] [TEAM-ORCH-B][WS-B] HITL-GATE: db migration
                   triggers founder confirmation in WS-B
... HITL approval recorded, agent works, QA loop runs ...
[YYYY-MM-DD HH:MM] [TEAM-ORCH-B][WS-B] WAVE 1 COMPLETE: producer +
                   migration shipped; READY signal posted
```

**Team Orchestrator A — Wave 2 (frontend consumer)**

```
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] AUTHORIZED: gateRecordId=<ULID>
                   wave=2 task=frontend-consumer
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] DEPENDENCY: confirmed
                   producer + migration READY in cross-workspace
                   bulletin
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] SPAWN: agent-fe for
                   workspace-A consumer
... agent works, QA loop runs, session closes ...
[YYYY-MM-DD HH:MM] [TEAM-ORCH-A][WS-A] WAVE 2 COMPLETE: consumer
                   shipped; gateRecordId=<ULID> ready to close
```

---

### Step 6 — Closing the gate record

Once all three waves report COMPLETE and each workspace's QA-Agent
has returned PASS, Division Orchestrator marks the gate record as
satisfied:

```
gateRecordId:    <ULID>
status:          CLOSED
closedAt:        [ISO 8601]
closeReason:     all-waves-complete-qa-pass
audit:
  - wave 0: workspace-A QA verdict <verdictId>: pass
  - wave 1: workspace-B QA verdict <verdictId>: pass
  - wave 2: workspace-A QA verdict <verdictId>: pass
```

The CTO-equivalent's original approval is now the audit anchor for
this change. If a regression appears later, the gate record is the
starting point — it names the contract version, the approver, the
TTL, the three QA verdicts, and the agents that ran. None of that is
recoverable from a single workspace's bulletin alone.

---

## What this scenario illustrates

**The Division Orchestrator never approves a CRITICAL change itself.**
Its job is to compose the brief, route it to the human authority, and
turn the recorded decision into authorized work for the Team
Orchestrators. That separation is the difference between centralized
policy and centralized execution; the model federates execution while
keeping policy decisions traceable to their human approver.

**Team Orchestrators never escalate around each other.** Team A does
not spawn an agent that touches Team B's files even with permission.
Cross-team work is resolved through the contract layer (Wave 0) and
each team's own agents executing within their workspace.

**The bulletin is workspace-scoped by default.** Cross-workspace
visibility is the Division Orchestrator's lane, not full transparency
across all bulletins. Workspace A's agents do not read workspace B's
bulletin directly — they read the cross-workspace summary lane,
which the Division Orchestrator publishes.

**Trust scores travel with the agent, not with the workspace.** When
Backend Agent in workspace B participates in Wave 1, its trust
trajectory continues from wherever it ended its last session, in any
workspace. A reassignment from workspace B to workspace C does not
reset its history. This is what makes the agents-as-employees model
genuinely enterprise-grade rather than a metaphor.

**The audit trail is the gate record, not the bulletin.** Bulletins
are append-only message buses; they record what happened. Gate
records are append-only authorization records; they record who
approved what, when, and on what TTL. Both exist; the gate record is
what an auditor reads first.

---

## What this scenario does NOT cover

This file is one worked path through the chain. The following are
designed but not walked through here — see
[`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md)
for the architectural model:

- Delegation (a Tech Lead delegating their approval authority for a
  bounded TTL — explicit only, no re-delegation).
- Reject paths (CTO rejects the brief; Division Orchestrator
  records the rejection; Team Orchestrator A surfaces the rejection
  to the requesting Tech Lead).
- Timeout paths (TTL expires before approval; gate record auto-closes
  as `EXPIRED`; Team Orchestrator A must re-open if the work is still
  needed).
- Three-fail QA escalation (an agent's third QA failure on the same
  wave routes to Team Orchestrator and from there to Division
  Orchestrator review; a worked example of escalation up the chain
  rather than approval down it).

These will ship with the v3.0 reference once field-proven.

---

## Related

- [`docs/architecture/enterprise-scaling.md`](../../docs/architecture/enterprise-scaling.md) —
  the full architectural model behind this example.
- [`workspace-setup-template.md`](workspace-setup-template.md) —
  workspace structure, role-agent alignment, lane protocol, escalation
  table.
- [`README.md`](README.md) — multi-team status and prerequisites.
- [`../single-workspace/`](../single-workspace/) — the operating model
  this extends. Run that first.
