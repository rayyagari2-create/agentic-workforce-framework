# ADR 0002 — Routines Are Not Agents

## Status

Accepted.

## Context

Claude Code Routines (and equivalent scheduled/event-triggered automation
primitives) can run prompts on a cadence, react to GitHub events, or fire from a
dedicated HTTP endpoint. They run autonomously on managed cloud infrastructure,
carry the user's connector identity, and can be composed with MCP sources.

Superficially, a routine looks like an agent: it takes a prompt, makes tool calls,
and produces work. That superficial similarity has caused confusion in more than
one design discussion — specifically: can a routine *replace* an Orchestrator? Can
a routine *self-score* and write to the trust tables?

The architectural distinction is sharp, and collapsing it would break the
trust model.

| Property              | Agent                                    | Routine                                   |
|-----------------------|------------------------------------------|-------------------------------------------|
| State                 | Stateful across sessions                 | Stateless — each run is a new session     |
| Duration              | Long-running, maintains context          | Short-lived, trigger-driven               |
| Governance            | D1-D4 trust scoring, pre-spawn protocol  | Lightweight — output review replaces it   |
| Identity              | Runtime-policy-layer cryptographic DID   | Runs as the user's connector identity     |
| Complexity ceiling    | High — full reasoning loops              | Low to medium — unattended, repeatable    |
| When to use           | Reasoning under uncertainty              | Scheduled scans, event triggers, reports  |

## Decision

**Routines are a distinct component class.** They occupy the automation plane,
which sits between the team-governance layer and the individual-execution layer.
They are not full agents and do not receive D1-D4 trust scores.

Three hard rules follow from this:

1. **Routines never write to `trust_scores` directly.** A routine that computes a
   scoring payload forwards it to the Eval/Telemetry Service. The Eval/Telemetry
   Service is the only writer to `trust_scores`. No exceptions.
2. **Routines never write to `failure_records` directly.** The Fix-Agent writes
   failure records. A routine that detects a failure-shaped event files it
   through the Fix-Agent path.
3. **The routine adapter is the only writer to `routine_runs`.** Routines return.
   The adapter logs.

Correspondingly, routines *can* own scheduled, event-triggered, repeatable work
that does not need full reasoning: PR test runs, security scans on PR, destination
data freshness checks, alert triage classification, deploy verification smoke
tests, nightly digests.

## Consequences

**Positive.**

- The trust model stays coherent. No actor outside the Eval/Telemetry Service
  writes to `trust_scores`; no actor outside the Fix-Agent writes to
  `failure_records`. This is enforceable at the schema level and at code review.
- The routine adapter isolates routine-system breaking changes behind one call
  site — the same pattern used for the runtime policy layer (AGT adapter).
- The agent/routine distinction gives operators a clear question to ask before
  building a new automation: *does this need reasoning under uncertainty?* If no,
  it's a routine. If yes, it's an agent.

**Negative.**

- Daily-cap limits on routines (plan-tier dependent) require filtering. The
  recommended filter is "only fire on branches prefixed with the agent's branch
  convention" — prevents every external PR from consuming the cap.
- The cloud execution environment means routine runs carry the user's connector
  identity, not an agent DID. The audit trail must therefore capture
  `fired_by` explicitly and correlate it to the triggering entity.

**Follow-on.**

- `routines/` is a top-level directory — routines are a framework artifact, not
  just docs.
- Every routine template includes a "Governance" note that names the human
  reviewer and the write rules.
- R10 (nightly trust scoring) ships only after the Eval/Telemetry Service is
  live. Until then, trust scoring remains human-assigned.
