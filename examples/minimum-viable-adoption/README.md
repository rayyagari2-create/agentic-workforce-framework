# Minimum Viable Adoption [v1.0]

The lowest-friction entry point to the Agentic Workforce Framework. File-based everything. No Postgres, no hooks, no routines. Designed so a small team can run one scored session inside of a working day and decide whether to invest further.

---

## Goal

Run one full scored session against a generic five-agent roster, produce one failure record, and write one session close. By the end of the day, you have:

- A roster with five named agents and capability boundaries
- One AgentTaskManifest for a single bounded task
- One QAVerdict
- One D1-D4 trust score with evidence per dimension
- One FailureRecord (because something will go wrong, and that is the point)
- One session close that hands off cleanly into the next session

---

## What you skip initially

| Skipped | Why | Add it when |
|---|---|---|
| OS-level hooks (PreToolUse / PostToolUse) | Requires a hook runner (Claude Code or equivalent) and time to write and test the hooks fail-closed | You have run 10+ sessions and identified a recurring violation that hooks could prevent |
| Postgres governance schema | File-based tracking is sufficient for a five-agent roster doing under 20 sessions a month | Your ledger has more than 50 sessions or you need cross-agent queries |
| Routines (R1, R4, R10) | These are scheduled automation. None of them are required to run a scored session. | You have a recurring scheduled need that fits the routine model typically not in the first month |
| Approval gate chains (HITL / DELEGATION / ESCALATION / APPROVAL) | The minimum viable HITL is "founder reviews before each commit." That is sufficient for tier RESTRICTED and PROBATION agents. | You have multiple approvers, TTL requirements, or escalation paths that file-based notes cannot track |
| Manager Agents / Division Orchestrators | One human plus one Orchestrator agent is enough for a five-agent team | You are scaling beyond one workspace |
| Automated trust scoring | Scoring should be manual until you have calibrated. Automated scoring without calibration produces drift that takes months to detect. | You have 20+ sessions of manual scores and a confident D1-D4 rubric |

---

## What you do not skip

These are the parts of the framework that produce value on day one.

1. **Capability boundaries per agent.** Each agent has a job description and the boundary is enforced by the orchestrator at task assignment. See `agent-roster.md`.
2. **AgentTaskManifest before any medium-risk task.** Even if it is a markdown file. The manifest is the contract.
3. **Per-session D1-D4 scoring with evidence.** No score without one line of evidence per dimension.
4. **FailureRecord every time something breaks.** Even if it is a markdown file. No failure goes uncaptured.
5. **Pre-task failure retrieval.** Before assigning a task, the orchestrator (or you) reads the relevant failure records. This is the single highest-leverage practice in the framework.
6. **Session close.** Every session ends with a written close that names what happened, what was scored, and what the next session starts with.

---

## File layout

The minimum viable layout is six markdown files in one directory. No tooling required.

```
your-team/
├── agent-roster.md              # Who the agents are, what they can do
├── trust-score-ledger.md        # session_id × agent_id × D1 × D2 × D3 × D4 × total × tier
├── failure-records/
│   ├── README.md                # Index
│   ├── FAIL-2026-04-15-001.md   # One file per failure record
│   └── FAIL-2026-04-22-001.md
├── manifests/
│   └── TASK-001.md              # One file per AgentTaskManifest
├── qa-verdicts/
│   └── QA-001.md                # One file per QAVerdict
└── sessions/
    └── 2026-04-22-session-close.md  # One file per session close
```

Use the examples in this directory as starting templates.

---

## The day-one path

Estimated time: 4-6 hours of engineering time, spread across one working day.

| Step | Time | Output |
|---|---|---|
| 1. Define your roster from `agent-roster.md`. Adjust names if useful. Set every agent to PROVISIONAL. | 30 min | `agent-roster.md` |
| 2. Pick a small bounded task (a `billing-rate-bug` or a `content-import` is a good starter something with clear acceptance criteria). | 15 min | One sentence |
| 3. Write the AgentTaskManifest. Mark riskLevel `low` or `medium`. List interfacesTouched, verificationRequired, evalPlan. | 20 min | `manifests/TASK-001.md` |
| 4. Run the task. Watch what the agent does. | 1-2 hr | Code change + agent bulletin entries |
| 5. QA-Agent runs through acceptance criteria. Produce QAVerdict. | 30 min | `qa-verdicts/QA-001.md` |
| 6. Score D1-D4 with one line of evidence per dimension. Add to ledger. | 30 min | New row in `trust-score-ledger.md` |
| 7. If anything broke, write a FailureRecord. | 30 min | `failure-records/FAIL-YYYY-MM-DD-NNN.md` |
| 8. Write the session close. Hand off cleanly to next session. | 30 min | `sessions/YYYY-MM-DD-session-close.md` |

---

## What you will catch on day one

The minimum viable adoption is not minimum value. From the reference implementation's first ten sessions, the file-based setup caught:

- Schema violations where an agent wrote a field that did not exist in the contract
- Acceptance criteria that the agent claimed met but were not actually implemented
- An agent assigned a task outside its capability boundary
- Repeat defects where the same root cause produced two different surface symptoms

You do not need hooks to catch these. You need a written manifest, written QA, written scores, and written failure records. The discipline does the work.

---

## When to graduate to single-workspace

Move to [`../single-workspace/`](../single-workspace/) when one or more is true:

- You have run 15+ scored sessions and the manual ledger is becoming unwieldy
- You have caught the same failure class twice and want enforcement, not just documentation
- You have a second human reviewer and need traceability across reviewers
- You are spending more time on ledger hygiene than on the actual work

The graduation is incremental. Add Postgres first. Add hooks second. Add routines last.
