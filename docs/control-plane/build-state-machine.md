# Build State Machine

**The lifecycle every build session passes through, end to end.**

The state machine is the contract that frames a session. No state is
skippable. Each transition has explicit entry and exit conditions. The
QA-Agent verdict is the only path from QA into COMPLETE.

---

## The Eight States

```
IDLE → DEBUG → SPEC → PLAN → HITL → SPAWN → QA → COMPLETE
```

No state skipping. Agents never commit without human review of the
verdict. QA FAIL routes back to the orchestrator never to another
subagent.

---

## State Diagram (Full)

```
                         ┌──────────────────────────┐
                         │           IDLE            │
                         │  no active task           │
                         └──────────┬────────────────┘
                                    │ task picked up
                                    ▼
                         ┌──────────────────────────┐
                         │          DEBUG            │
                         │  classify risk            │
                         │  retrieve failure library │
                         └──────────┬────────────────┘
                                    │ classification done
                                    ▼
                         ┌──────────────────────────┐
                         │           SPEC            │
                         │  produce/refine ACs       │
                         │  (skipped only if ACs     │
                         │   already clear)          │
                         └──────────┬────────────────┘
                                    │ ACs clear + contracts current
                                    ▼
                         ┌──────────────────────────┐
                         │           PLAN            │
                         │  build plan against spec  │
                         └──────────┬────────────────┘
                                    │ plan complete
                                    ▼
                         ┌──────────────────────────┐
                         │           HITL            │       ┌── if no trigger ──┐
                         │  human gate (HIGH risk    │ ──────┘                   │
                         │   mandatory; CRITICAL =   │                            │
                         │   Boardroom)              │                            │
                         └──────────┬────────────────┘                            │
                                    │ approved (or N/A)                            │
                                    ▼                                              │
                         ┌──────────────────────────┐  ◄─────────────────────────┘
                         │          SPAWN            │
                         │  agent runs against       │
                         │  manifest; locks active   │
                         └──────────┬────────────────┘
                                    │ work submitted
                                    ▼
                         ┌──────────────────────────┐
                         │            QA             │
                         │  QA-Agent runs verdict    │
                         └──┬─────────────┬─────────┘
                            │             │
                       PASS │             │ FAIL
                            │             │
                            ▼             ▼
                  ┌──────────────┐  ┌──────────────────────┐
                  │   COMPLETE    │  │  back to orchestrator │
                  │  locks        │  │  → DEBUG re-run       │
                  │  released;    │  │  → re-route through   │
                  │  human review │  │     SPEC/PLAN/SPAWN   │
                  │  before       │  │  → counts as 1 strike │
                  │  commit       │  └──────────────────────┘
                  └──────────────┘
```

---

## Phase Details

### IDLE

The orchestrator has no active task. Bulletin reflects the previous
session close. Locks are released.

**Exit:** A task is selected from the queue (or assigned by a human).

---

### DEBUG

`/debug` runs. The orchestrator classifies the task per the risk table
and queries the failure library for matching FailureRecords. Outputs
are added to the AgentTaskManifest.

**Exit conditions:**
- `riskLevel` set
- `interfacesTouched` populated
- `priorFailureContext` populated (may be empty list)
- `domains` set

If any output is missing, the state does not advance. See
`pre-spawn-protocol.md` for the classification table and recurrence
thresholds.

---

### SPEC

`/spec` runs when ACs are unclear, contracts are missing or stale, or
domain edge cases are not enumerated. Outputs are documents (acceptance
criteria, contracts, edge cases) not code.

**Exit conditions:**
- ACs are testable, cover the success path and named failure cases
- Contracts referenced are current
- Routing rule re-evaluated: SPEC may transition directly to PLAN if
  the spec was the only blocker

`/spec` is skippable only when the routing rule from
`pre-spawn-protocol.md` evaluates "ACs clear, contracts current."

---

### PLAN

`/plan` runs against the (now-clear) spec. Produces step-by-step
actions, files to touch, order of operations. Output is a document.

**Exit conditions:**
- Plan covers every AC
- Files-to-touch list is consistent with `interfacesTouched`
- Plan does not introduce out-of-scope changes (an indicator the spec
  was incomplete return to SPEC if so)

---

### HITL

The HITL state fires whenever any HITL gate trigger from
`hitl-gates.md` matches. HIGH risk is always HITL. CRITICAL risk is a
Boardroom session.

**Exit conditions:**
- Approval recorded in `manual_reviews` (or `gate_records` at
  enterprise scale)
- Or: approval declined → task returns to the queue with rationale
- Or: delegation invoked under valid TTL

If no HITL trigger fires, this state is a pass-through (the manifest
records "no HITL required" with the riskLevel).

---

### SPAWN

The agent runs against the manifest. Locks are active. The agent
writes events to the bulletin at every phase transition. The agent may
not spawn subagents (hard rule, enforced by `check-agent-spawn`).

**Exit conditions:**
- Work artifact submitted
- Bulletin entries present at every transition
- Agent emits a self-report (D2 evidence)

Silent execution is a D2 = 0 violation. The session does not advance
to QA without bulletin entries.

---

### QA

The QA-Agent runs against the work artifact and produces a QAVerdict
with `verdict ∈ {pass, pass_with_notes, fail}`. The verdict is the
only path out of QA.

**Verdict routing:**

| Verdict | Routing |
|---|---|
| `pass` | → COMPLETE |
| `pass_with_notes` | → COMPLETE; notes added to evolution queue |
| `fail` | → orchestrator (re-route through DEBUG → SPEC/PLAN → SPAWN) |

The QA-Agent does not route a FAIL to another subagent. Routing
authority belongs to the orchestrator.

---

### COMPLETE

Locks are released. Work is ready for human review. Trust score for
the session is recorded (manual at single-founder scale, automated
nightly via the trust-scoring routine at enterprise scale).

A SESSION COMPLETE bulletin entry without a QA PASS is blocked at the
hook layer. There is no path to COMPLETE that bypasses QA.

---

## Loop Conditions

### QA FAIL Loop

```
QA → orchestrator → DEBUG → SPEC/PLAN → SPAWN → QA
```

Each pass through this loop consumes one strike against the agent for
this task. Three strikes triggers escalation (see below).

### Recurrence Loop

If `recurrenceCount` for the failure class hits 2 during pre-task
retrieval, the manifest is annotated. At 3, the spawn does not happen
— a Boardroom session is required first. At 5, a systemic refactor is
the only resolution.

### HITL Decline Loop

```
HITL (declined) → IDLE (with rationale)
```

The task does not advance. It returns to the queue with a rationale
recorded in `manual_reviews`. The same task cannot re-enter HITL
without a refinement of the manifest.

---

## QA Enforcement Rules

The QA-Agent is the only authority that can mark a session COMPLETE.

- The orchestrator cannot self-certify (no agent self-scores; no
  agent self-passes QA)
- The agent that did the work cannot QA its own work
- The QA-Agent must produce a QAVerdict per the schema, with per-AC
  pass/fail and evidence
- A `pass_with_notes` verdict is a pass; the notes go to the evolution
  queue, they do not block the session

The hook layer catches:

- A SESSION COMPLETE bulletin entry without a corresponding QA PASS
  → `exit(2)`
- An attempt to commit without a QA PASS → `exit(2)`
- A QAVerdict missing required fields → `exit(2)`

---

## Escalation Triggers

| Trigger | Escalation |
|---|---|
| 3 consecutive QA FAIL on the same task | Orchestrator halts; human review of root cause before next spawn |
| Agent at PROBATION persists 3 sessions | Boardroom review |
| Trust tier drop crosses HIGH → STANDARD or STANDARD → RESTRICTED | Instruction review mandatory before next spawn |
| `recurrenceCount ≥ 3` for the same failure class | Boardroom session before any further attempt |
| QA-Agent itself fails (verdict malformed; agent crashes) | Halt; human investigates QA-Agent before any other agent runs |
| Attempted commit without QA PASS | Hook block + audit log entry + trust score impact |

---

## The 3-Strike Rule

Each QA FAIL on the same task counts as one strike.

| Strike | Response |
|---|---|
| Strike 1 | Standard re-route through DEBUG → SPEC/PLAN → SPAWN |
| Strike 2 | Orchestrator must re-run /debug end-to-end before next spawn; failure library entry mandatory if not already present |
| Strike 3 | Halt. Human review of root cause required before any further attempt. Counts toward the agent's D4 score for the session. |

The 3-strike rule exists because the second-most-common pattern in
agent failure is "fix attempt that doesn't fix anything, repeated."
The strike count makes that pattern visible quickly.

After strike 3, the orchestrator may:

1. Re-spec the task (the spec was the problem)
2. Re-route to a different agent (capability mismatch)
3. Escalate to a Boardroom session (the task itself is the problem)
4. Send the task back to the queue with a "needs decomposition" note

The orchestrator may not "try one more time" without one of the above.

---

## Parallel Session Rules

Two or more orchestrator sessions are safe **if and only if** file
scopes are completely disjoint.

**Lane assignment protocol:**

- Each parallel orchestrator is assigned a lane: `[LANE-A]`, `[LANE-B]`,
  `[LANE-C]`
- Lane declared in the first bulletin entry of each session
- `agent-locks` checked by both before spawning if the other lane
  holds a lock on a file in scope, halt and surface to the human
- Bulletin entries prefixed with the lane ID interleaving is readable

Row-level locking via the database backbone removes collision risk at
Wave 2. Until then, lane-prefixed file-based bulletin entries are the
mechanism.

---

## State Machine Invariants

These hold across every session:

1. **No state skipping.** A session that records "SPEC" without
   producing a spec artifact is a violation.
2. **QA is the only exit from work.** No path from SPAWN to COMPLETE
   bypasses QA.
3. **The agent that did the work cannot QA the work.** Symmetric with
   "no agent self-scores."
4. **Bulletin entries at every transition.** Silent execution is D2 = 0.
5. **The orchestrator owns routing.** Subagents cannot route to
   subagents.
6. **Locks released only at COMPLETE.** Not at SPAWN exit, not at QA
   exit only when the session reaches COMPLETE.

A session that violates any of these invariants is recorded as a
governance failure and triggers the meta-governance review path.

---

## Related

- `pre-spawn-protocol.md` the gate before SPAWN; produces the
  manifest the state machine consumes.
- `hitl-gates.md` gate type detail for the HITL state.
- `hook-system.md` the OS-level backstop that enforces the
  invariants.
- `meta-governance.md` what to do when the state machine itself
  fails.
- `audit-trail-patterns.md` how state transitions are recorded.
