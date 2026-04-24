# Routines

Routines are lightweight, scheduled, or event-triggered automation. They
execute on cloud infrastructure on a defined cadence or in response to a
trigger event. They are part of the framework's automation plane — they sit
**around** the agent system, not inside it.

This directory contains the framework-level definitions, the adapter pattern
that isolates routines from framework drift, and a set of public templates.

---

## What a routine is

A routine is a saved configuration consisting of:

- A **prompt** — the instructions the routine executes
- One or more **repositories** the routine can read or write
- A set of **connectors** (MCP, GitHub, etc.) the routine has access to
- A **trigger** that fires the routine

A routine has **no persistent identity** and **no trust history**. Every run
is a fresh session. Routines are deterministic infrastructure: they execute
the same prompt against the same connectors on the same schedule.

A routine writes only to the routine execution log (`routine_runs` in the
database schema). Routines never write to `trust_scores` directly. The
Eval/Telemetry Service is the sole writer to trust_scores; if you need a
routine to influence trust scoring, the routine produces a *payload* and
hands it off — it does not perform the write itself.

---

## Three trigger types

| Trigger type | Description                                            | Use when                                  |
|--------------|--------------------------------------------------------|-------------------------------------------|
| **Schedule** | Recurring cadence — hourly, daily, weekly, custom cron | Periodic scans, digests, freshness checks |
| **API**      | Dedicated HTTP endpoint, fired by external system      | Pipeline hooks, alert triage, deploy events |
| **GitHub**   | Reacts to repository events (PR, release)              | PR-time validation, release verification  |

A single routine can subscribe to more than one trigger type, but most
templates use a single trigger to keep behavior easy to reason about.

### Schedule triggers

Schedule triggers run on the routine platform's clock. Minimum interval
depends on the platform; expect a 1-hour floor on most consumer plans.
Custom cron expressions are typically supported on higher tiers.

### API triggers

Each API-triggered routine has a unique HTTP endpoint protected by a bearer
token. The token is shown once at creation time and must be stored in a
secrets manager. POST to the endpoint with a JSON body to fire a run; an
optional `text` field passes per-run context to the routine prompt.

### GitHub triggers

GitHub-triggered routines fire on repository events (`pull_request.opened`,
`pull_request.synchronized`, `release.published`, etc.) when the routine
platform's GitHub App is installed on the repository.

**Branch filtering is critical for cap management.** Without a filter, every
external PR consumes a daily run. The recommended convention is to fire
only on agent-prefixed branches (e.g., `agent/*`). See
`templates/r1-pr-test.md` for an example.

---

## Usage limits

Routine platforms typically meter daily runs by plan tier. The exact numbers
vary by vendor and change over time; the operating principle is constant:

- A small daily quota is included with each plan tier
- Overage runs are billed metered if the operator opts in
- The cap resets per account, not per routine

**Plan implication:** if your team's routines collectively burn through the
daily cap by 11am, the rest of the day's events are dropped or queued. Build
your routines with this in mind. Filter aggressively. Avoid routines that
fire on every event when they only need to fire on a subset.

---

## Agent vs routine — the distinction

This is the most important conceptual line in this directory.

| Aspect                | Agent                                  | Routine                              |
|-----------------------|----------------------------------------|--------------------------------------|
| State                 | Stateful across sessions               | Stateless — every run is fresh       |
| Duration              | Long-running, holds context            | Short-lived, trigger-driven          |
| Identity              | Persistent ID, trust history           | No identity, no trust history        |
| Governance            | D1-D4 trust scoring, pre-spawn protocol | Output review replaces pre-spawn    |
| Scoring write target  | `trust_scores` (via Eval Service)      | `routine_runs` only — never `trust_scores` |
| Reasoning             | Reasoning under uncertainty            | Deterministic logic, repeatable      |
| Complexity            | High                                    | Low to medium                        |
| When to use           | Complex builds, ambiguous tasks        | Scheduled scans, alerts, reports     |

**Routines are not a replacement for agents.** They handle the scheduled
and event-driven work that sits *around* the agent system. The orchestrator
+ QA loop is too stateful, too complex, and too governance-heavy to live in
a routine.

---

## What's in this directory

```
routines/
├── README.md                              ← this file
├── adapter-pattern.md                     ← isolation pattern, correlation IDs
└── templates/
    ├── README.md                          ← template index, parameterization
    ├── r1-pr-test.md                      ← Playwright on PR (v1.0)
    ├── r4-security-scan.md                ← Security scan on PR (v1.0)
    ├── r10-nightly-trust-score.md         ← [v2.0] placeholder
    ├── r-alert-triage.md                  ← [v2.0] placeholder
    └── r-deploy-verification.md           ← [v3.0] placeholder
```

---

## Reading order

1. Read this file for the conceptual model.
2. Read `adapter-pattern.md` to understand how routines integrate with the
   framework without coupling to it.
3. Read `templates/README.md` for parameterization conventions.
4. Pick a template that matches your use case and copy it.
