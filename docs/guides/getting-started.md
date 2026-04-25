# Getting Started

**A 30-minute practical path: feel the loop once before customizing.**

The goal of this guide is not to set up production governance. It is
to run one scored session end-to-end, write one FailureRecord, install
one hook, and set trust tiers honestly so the framework's loop is
in your hands rather than in your head.

You will defer Postgres, routines, multi-workspace, and Boardroom
review. Those come later. They all assume you have already felt the
loop work.

---

## Before You Start

You need:

- A repo where one or more agents will be working (any language, any
  scope)
- A markdown editor and a place to put files (the same repo is fine)
- 30 minutes
- One agent task you would have given anyway in the next day or two
- A runtime that supports pre-tool-use hooks (for Step 5)

You do not need:

- Postgres
- A runtime policy layer
- A Boardroom Agent
- Multi-workspace anything
- Automated trust scoring

---

## The Five Steps

```
STEP 1 (5 min) define your agent roster
STEP 2 (2 min) set starting trust tier for each agent
STEP 3 (15 min) run your first scored session (D1-D4 with evidence)
STEP 4 (5 min) write your first FailureRecord (if needed)
STEP 5 (3 min) set up your first hook (check-bulletin)
```

---

## Step 1 Define Your Agent Roster (5 minutes)

The roster is the list of agents you have, with roles and human
equivalents. The "agents-as-employees" model means each agent maps to
a recognizable human role and is governed like one.

### The Mapping

Each agent in your roster gets a human-equivalent role. The mapping
makes review expectations concrete: an agent acting as "QA Lead" is
expected to behave the way a QA Lead would.

| HR Concept | Agent Equivalent |
|---|---|
| Job description | Capability boundary + instruction file |
| Reference check before task | Pre-task failure retrieval |
| Performance review | D1-D4 trust scoring per session |
| KPIs / OKRs | Acceptance criteria + QAVerdict |
| PIP | RESTRICTED / PROBATION trust tier |
| Manager | Orchestrator |
| Employment contract | AgentTaskManifest |
| Work log | Agent bulletin |
| Incident report | FailureRecord |

### Use the Example as a Starting Point

Copy from `examples/minimum-viable-adoption/agent-roster.md`. The
default minimum-viable roster has five agents:

| Agent ID | Human Equivalent | Capability Boundary |
|---|---|---|
| `orchestrator` | Engineering Manager | Routes tasks, owns QA loop, no execution |
| `agent-fe` | Frontend Engineer | `src/frontend/*` |
| `agent-srv` | Backend Engineer | `src/server/*` |
| `qa-agent` | QA Lead | Verification, no production code |
| `fix-agent` | SRE | Failure records, prevention artifacts |

You can shrink this further (just orchestrator + one executor + QA) for
a truly minimal start. Five is the sweet spot for most teams.

### Check Each Agent Has Three Things

For each agent in your roster, write down:

1. **An ID.** Stable, lowercase, no spaces. This is how trust scores
   attach.
2. **A human equivalent.** Engineering Manager, Frontend Engineer, QA
   Lead, etc. This grounds your review expectations.
3. **A capability boundary.** What files/directories this agent may
   modify. Be exclusive: two agents should not own the same path.

You now have a roster file. Commit it. This is the first piece of
durable state in the framework.

---

## Step 2 Set Starting Trust Tier for Each Agent (2 minutes)

Every agent starts at **PROVISIONAL**. Do not assign HIGH or STANDARD
based on how confident you feel. Trust must be earned through scored
sessions; PROVISIONAL is the honest starting point.

### The Tiers

| Score | Tier | Autonomy |
|---|---|---|
| 90–100 | HIGH | Medium-risk without step-by-step review |
| 75–89 | STANDARD | Default reviewer checks decision points |
| 60–74 | RESTRICTED | Reviewer checks before each phase transition |
| < 60 | PROBATION | Every file change reviewed |
| n/a | PROVISIONAL | Insufficient session count for any tier |

### Set the Starting Tier

In the roster file, add a `trust_tier: PROVISIONAL` line for every
agent. Also add `n_sessions: 0` and `confidence_band: PROVISIONAL`.

```
- id: agent-fe
  human_equivalent: Frontend Engineer
  capability_boundary: src/frontend/*
  trust_tier: PROVISIONAL
  n_sessions: 0
  confidence_band: PROVISIONAL
```

The dual requirement matters: operational tier depends on **both** a
score band and a confidence band. A high score in one session is not
enough confidence band only leaves PROVISIONAL after 5 sessions.

---

## Step 3 Run Your First Scored Session (15 minutes)

A "session" is a bounded unit of agent work. You will run one task
end-to-end and produce a trust score for the agent that did the work.

### 3a Pick a Real Task

Pick something you would have asked an agent to do anyway. Not a toy.
A real task you can evaluate honestly.

The task does not need to be high-risk. In fact, lower risk is better
for the first session you want to feel the scoring loop, not the
HITL escalation loop.

### 3b Write a Minimal Manifest

Use the schema at `schemas/v1/agent-task-manifest.schema.json` as a
reference. For a first session, capture by hand (markdown file, JSON
file, whatever):

- `taskId` any ULID-like ID, or just a date-counter
- `taskType` feature / bug / refactor
- `domains` the areas touched (use placeholders like `billing`,
  `content`, `search` from your codebase)
- `riskLevel` low or medium
- `interfacesTouched` file paths
- `verificationRequired` what verifies this is done (unit_test,
  manual, etc.)
- `assignedAgent` the agent ID from your roster

This is the agent's brief. Keep it short; the discipline of writing
it is the point.

### 3c Run the Task

Hand the manifest to the agent. Let it run. Pay attention to:

- What the agent does that matches the manifest
- What it does that drifts from the manifest
- What it skips that the manifest required
- What evidence the agent produces that the work was done correctly

Write notes as you observe. These notes become your scoring evidence
in step 3d.

### 3d Score D1-D4 With Evidence

At session close the moment the work is done or the agent has
escalated score the four dimensions.

Use the rubric from `calibration/d1-d4-rubric.md`. Each dimension
gets 0, 10, 18, or 25.

| Dimension | What It Captures | Hard-Stop Rule |
|---|---|---|
| D1 Correctness | Did the output meet acceptance criteria? | D1=0: output wrong in a way that could harm if uncaught |
| D2 Observability | Did the agent leave a faithful record? | D2=0: falsified telemetry → automatic demotion |
| D3 Compliance | Did the agent stay within hooks, scope, policy? | D3=0: hook bypass or unauthorized commit |
| D4 Recurrence | Did the agent avoid known failure patterns? | D4=0: repeated pattern that was provided in instructions |

**Required: one line of evidence per dimension.** Without evidence,
the score is not a score; it is a vibe.

Example:

```
Session: 2026-04-24-001
Agent: agent-fe
Task: TASK-2026-04-24-A1

D1 Correctness: 18 Met 5/6 ACs first attempt, one rework needed for null-handling
D2 Observability: 25 Bulletin entries at all phase transitions, no gaps
D3 Compliance: 25 Stayed within capability boundary, no policy domain touched
D4 Recurrence: 25 No prior FailureRecord matched; novel task class

Total: 93/100
Trust tier (this session): HIGH
n_sessions: 1
Confidence band: PROVISIONAL (n < 5)
Operational tier: PROVISIONAL (confidence band gates promotion)
```

### 3e Append to Your Scoring Ledger

Open (or create) a markdown file like `agents/trust-ledger.md`. Append
the score block above. This is your durable record. After 5 sessions
you will start being able to read trends.

A template lives in `calibration/scoring-ledger-template.md`.

---

## Step 4 Write Your First FailureRecord (5 minutes, if needed)

A FailureRecord is required if any of these happened in the session:

- QA found a defect (verdict: fail or pass_with_notes with substantive
  notes)
- A hard-stop fired (D1=0, D2=0, D3=0, D4=0)
- The agent escalated mid-session
- A bug shipped that traces back to the agent's work

If none of these happened, skip to step 5.

### 4a Use the Schema

The schema is at `schemas/v1/failure-record.schema.json`. The
required fields:

- `failureId` `FAIL-YYYY-MM-DD-NNN` format
- `timestamp`
- `domain`
- `agentsInvolved`
- `files`
- `symptom` what was observable
- `rootCause` what was actually wrong (confirmed, not guessed)
- `failureClass` one of the 17 classes
- `severity` P0 / P1 / P2 / P3
- `customerImpact` plain English
- `detectionSource` how it was found
- `recurrenceCount` start at 1 unless this matches a prior record
- `status` start at `open` or `resolved` if you fixed it inline
- `fixTag` `hotfix-only`, `hotfix-plus-prevention`, or
  `systemic-refactor-required`

### 4b Add a Prevention Artifact

A FailureRecord cannot be `status: resolved` without at least one
prevention artifact. The cheapest valid artifact for a first
FailureRecord is a regression test. The next cheapest is an
instruction update for the agent.

If you genuinely cannot produce one, mark the status `open` and come
back to it. Don't fake closure.

### 4c Append to Your Failure Library

Open (or create) `failures/failure-library.md`. Append the record.
Like the trust ledger, this becomes durable institutional memory.

The failure library is the source for D4 scoring. Every future spawn
should retrieve matches by `domain` and `files` before the agent runs.

---

## Step 5 Set Up Your First Hook: check-bulletin (3 minutes)

Hooks are the enforcement edge of the framework. They run on every
relevant tool call and either allow it (`exit 0`) or block it (`exit 2`).
The first hook to install is `check-bulletin` it enforces
read-before-write on the bulletin file, which is the cheapest way to
prevent stale-state writes when more than one agent is active.

You only need this one hook to start. Add others later as patterns
warrant.

### 5a Copy the Example

The example hook lives at `hooks/pre-tool-use/check-bulletin.example.js`.
Copy it to your runtime's hook directory. The example:

- Reads the tool-call payload from stdin
- Allows non-Write tools and writes that don't target the bulletin
- For writes to the bulletin, requires the bulletin path to appear in
  `context.session_reads`
- Audits every decision (allow or block) to a JSONL log
- Fails closed on any uncaught error

### 5b Configure Your Runtime

The hook expects these conventions:

- Bulletin path: `.agent-workspace/bulletin.md` (change in the script
  if your repo uses a different path)
- Audit log: `.agent-workspace/audit-log.jsonl`
- Tool payload on stdin includes `tool_name`, `tool_input.file_path`,
  and `context.session_reads` (a list of paths the agent has read
  this session)

Whatever runtime you use must produce that payload shape on every
pre-tool-use event. Adapt the script to match your runtime's actual
event format if needed.

### 5c Test It Fires

Run a deliberate failing case to confirm the hook is wired up:

1. Start a fresh session for an agent (no prior reads)
2. Have the agent attempt to write to the bulletin without reading it
3. The hook should `exit 2`, the tool call should be blocked, and the
   audit log should record `decision=block, reason=bulletin_not_read_in_session`

If the hook does not fire, the runtime is not invoking it. Fix the
wiring before depending on it.

### 5d What This Hook Does NOT Do

The check-bulletin hook prevents one specific failure mode:
stale-state bulletin writes. It does not enforce trust tier gates,
HITL approvals, capability boundaries, or audit log integrity. Those
are separate hooks (see `hooks/pre-tool-use/`).

The discipline is to start with one hook, see it fire on a real
violation, and add more only when a real pattern justifies the next
one.

---

## What to Defer

The following are explicitly **not** part of the 30-minute path:

| Capability | When to Add |
|---|---|
| Additional hooks (lock, failure-lib, agent-spawn) | After check-bulletin is stable for 5+ sessions |
| Postgres-backed governance | When the markdown ledger feels limiting (typically after 20+ sessions) |
| Routines (R1, R4) | When you have GitHub PR workflow and your daily run cap permits it |
| Multi-workspace | When you have a second team adopting and the single-team model is stable |
| Boardroom Agent | When QA-fail-3-strike escalations are happening regularly enough to need automation |
| Automated trust scoring (R10) | When manual scoring is well-calibrated and the volume warrants automation |

Adding any of these earlier is a common pattern that produces governance
theater. The discipline is to walk before running.

---

## After 30 Minutes

You should have:

- A roster file with five (or fewer) agents at PROVISIONAL
- One scoring ledger entry with D1-D4 evidence
- One AgentTaskManifest (any format)
- Possibly one FailureRecord if something went wrong
- One hook installed and confirmed firing

That is the loop. Everything else in this framework is variation,
scaling, or hardening of these five artifacts. Run the loop three more
times before reading further into the docs.

When you are ready for the next layer of discipline, read
[single-team-adoption.md](single-team-adoption.md).

---

## Common First-Time Mistakes

| Mistake | Effect |
|---|---|
| Starting at HIGH or STANDARD because you "know" the agent is good | Skipping the evidence step undermines the whole model |
| Skipping the manifest "for a quick task" | The QA-Agent has nothing to verify against |
| Scoring without evidence | Calibration cannot improve; the band is meaningless |
| Setting confidence band based on the score | Confidence is from n_sessions only; never from the score |
| Closing a FailureRecord without a prevention artifact | The record cannot serve future recurrence checks |
| Installing the hook fail-open ("just log, don't block") | A hook that doesn't block isn't enforcement; it is observability |
| Adding five hooks before the first one has fired on a real violation | Hook stack becomes untrusted before it has proven useful |

---

## Related

- `examples/minimum-viable-adoption/agent-roster.md` copy-paste roster
- `examples/minimum-viable-adoption/trust-score-ledger.md` ledger
  template
- `examples/minimum-viable-adoption/failure-record-example.md` —
  annotated example
- `calibration/d1-d4-rubric.md` the rubric in full
- `hooks/pre-tool-use/check-bulletin.example.js` the hook from step 5
- `docs/operating-model/performance-review-cycle.md` the scoring
  cadence in detail
