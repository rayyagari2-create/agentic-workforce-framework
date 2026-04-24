# Getting Started

**A 30-minute path: feel the loop once before customizing.**

The goal of this guide is not to set up production governance. It is
to run one scored session end-to-end, write one FailureRecord, and
record one trust tier — so the framework's loop is in your hands
rather than in your head.

You will defer hooks, Postgres, and routines. Those come later. They
all assume you have already felt the loop work.

---

## Before You Start

You need:

- A repo where one or more agents will be working (any language, any
  scope)
- A markdown editor and a place to put files (the same repo is fine)
- 30 minutes
- One agent task you would have given anyway in the next day or two

You do not need:

- Hooks
- Postgres
- A runtime policy layer
- A Boardroom Agent
- Multi-workspace anything

---

## The Four Steps

```
STEP 1 (5 min)  — define your agent roster
STEP 2 (15 min) — run one scored session
STEP 3 (5 min)  — write a FailureRecord (if needed)
STEP 4 (5 min)  — set trust tiers for next session
```

---

## Step 1 — Define Your Agent Roster (5 minutes)

The roster is the list of agents you have, with roles and human
equivalents. The "agents-as-employees" model means each agent maps to
a recognizable human role.

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
truly minimal start. Five is the sweet spot for most teams.

### Check Each Agent Has Three Things

For each agent in your roster, write down:

1. **An ID.** Stable, lowercase, no spaces. This is how trust scores
   attach.
2. **A human equivalent.** Engineering Manager, Frontend Engineer, QA
   Lead, etc. This grounds your review expectations.
3. **A capability boundary.** What files/directories this agent may
   modify. Be exclusive: two agents should not own the same path.

### Set Initial Trust Tier

Every agent starts at `PROVISIONAL`. Do not assign HIGH or STANDARD
based on how confident you feel. Trust must be earned through scored
sessions; PROVISIONAL is the honest starting point.

You now have a roster file. Commit it. This is the first piece of
durable state in the framework.

---

## Step 2 — Run Your First Scored Session (15 minutes)

A "session" is a bounded unit of agent work. You will run one task
end-to-end and produce a trust score for the agent that did the work.

### 2a — Pick a Real Task

Pick something you would have asked an agent to do anyway. Not a toy.
A real task you can evaluate honestly.

The task does not need to be high-risk. In fact, lower risk is better
for the first session — you want to feel the scoring loop, not the
HITL escalation loop.

### 2b — Write a Minimal Manifest

Use the schema at `schemas/v1/agent-task-manifest.schema.json` as a
reference. For a first session, capture by hand (markdown file, JSON
file, whatever):

- `taskId` — any ULID-like ID, or just a date-counter
- `taskType` — feature / bug / refactor
- `domains` — the areas touched (use placeholders like `billing`,
  `content`, `search` from your codebase)
- `riskLevel` — low or medium
- `interfacesTouched` — file paths
- `verificationRequired` — what verifies this is done (unit_test,
  manual, etc.)
- `assignedAgent` — the agent ID from your roster

This is the agent's brief. Keep it short; the discipline of writing
it is the point.

### 2c — Run the Task

Hand the manifest to the agent. Let it run. Pay attention to:

- What the agent does that matches the manifest
- What it does that drifts from the manifest
- What it skips that the manifest required
- What evidence the agent produces that the work was done correctly

Write notes as you observe. These notes become your scoring evidence
in step 2d.

### 2d — Score D1-D4 With Evidence

At session close — the moment the work is done or the agent has
escalated — score the four dimensions.

Use the rubric from `calibration/d1-d4-rubric.md`. Each dimension
gets 0, 10, 18, or 25.

**Required: one line of evidence per dimension.** Without evidence,
the score is not a score; it is a vibe.

Example:

```
Session: 2026-04-24-001
Agent: agent-fe
Task: TASK-2026-04-24-A1

D1 Correctness: 18 — Met 5/6 ACs first attempt, one rework needed for null-handling
D2 Observability: 25 — Bulletin entries at all phase transitions, no gaps
D3 Compliance: 25 — Stayed within capability boundary, no policy domain touched
D4 Recurrence: 25 — No prior FailureRecord matched; novel task class

Total: 93/100
Trust tier: HIGH (this session)
n_sessions: 1
Confidence band: PROVISIONAL (n < 5)
```

Note: `Trust tier: HIGH (this session)` reflects this session's score.
The agent's **operational** tier is still PROVISIONAL because n=1. See
step 4.

### 2e — Append to Your Scoring Ledger

Open (or create) a markdown file like `agents/trust-ledger.md`. Append
the score block above. This is your durable record. After 5 sessions
you will start being able to read trends.

A template lives in `calibration/scoring-ledger-template.md`.

---

## Step 3 — Write a FailureRecord (if anything went wrong)

A FailureRecord is required if any of these happened in the session:

- QA found a defect (verdict: fail or pass_with_notes with substantive
  notes)
- A hard-stop fired (D1=0, D2=0, D3=0, D4=0)
- The agent escalated mid-session
- A bug shipped that traces back to the agent's work

If none of these happened, skip step 3 and move to step 4.

### 3a — Use the Schema

The schema is at `schemas/v1/failure-record.schema.json`. The
required fields:

- `failureId` — `FAIL-YYYY-MM-DD-NNN` format
- `timestamp`
- `domain`
- `agentsInvolved`
- `files`
- `symptom` — what was observable
- `rootCause` — what was actually wrong (confirmed, not guessed)
- `failureClass` — one of the 17 classes
- `severity` — P0 / P1 / P2 / P3
- `customerImpact` — plain English
- `detectionSource` — how it was found
- `recurrenceCount` — start at 1 unless this matches a prior record
- `status` — start at `open` or `resolved` if you fixed it inline
- `fixTag` — `hotfix-only`, `hotfix-plus-prevention`, or
  `systemic-refactor-required`

### 3b — Add a Prevention Artifact

A FailureRecord cannot be `status: resolved` without at least one
prevention artifact. The cheapest valid artifact for a first
FailureRecord is a regression test. The next cheapest is an
instruction update for the agent.

If you genuinely cannot produce one, mark the status `open` and come
back to it. Don't fake closure.

### 3c — Append to Your Failure Library

Open (or create) `failures/failure-library.md`. Append the record.
Like the trust ledger, this becomes durable institutional memory.

---

## Step 4 — Set Trust Tier for Next Session

After your first session, the agent's score-this-session may be HIGH,
but its **operational tier** is still PROVISIONAL because n=1.

Trust tiers in operation use both score **and** confidence band. With
n=1, confidence band is PROVISIONAL regardless of score.

### Set the Tier

In your roster file (or a separate trust ledger), record:

```
agent-fe
  trust_tier: PROVISIONAL
  last_score: 93
  n_sessions: 1
  confidence_band: PROVISIONAL
  notes: First session. Met 5/6 ACs. Single null-handling miss; not a
         recurrence-class.
```

The next session also runs at PROVISIONAL. When n=5 (after four more
scored sessions), confidence band becomes LOW; at n=10 it becomes
MEDIUM; at n=20 it becomes HIGH. Promotion to HIGH operational tier
requires HIGH score band **and** HIGH confidence band.

This dual requirement is intentional. A 93 in session 1 is not enough
evidence to expand autonomy.

---

## What to Defer

The following are explicitly **not** part of the 30-minute path:

| Capability | When to Add |
|---|---|
| Hooks | When file-based discipline is reliable for 5+ sessions and you have a runtime that supports them |
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

That is the loop. Everything else in this framework is variation,
scaling, or hardening of these four artifacts. Run the loop three more
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

---

## Related

- `examples/minimum-viable-adoption/agent-roster.md` — copy-paste roster
- `examples/minimum-viable-adoption/trust-score-ledger.md` — ledger
  template
- `examples/minimum-viable-adoption/failure-record-example.md` —
  annotated example
- `calibration/d1-d4-rubric.md` — the rubric in full
- `docs/operating-model/performance-review-cycle.md` — the scoring
  cadence in detail
