---
id: r1-pr-test
status: v1.0
title: Test Suite on PR
trigger:
  type: github
  events:
    - pull_request.opened
    - pull_request.synchronized
  filter:
    head_branch_prefix: "agent/"
repos:
  - "[YOUR_REPO]"
mcp_connectors:
  - github
governance:
  human_review_required: true
  writes_to:
    - routine_runs
  does_not_write_to:
    - trust_scores
    - failure_records
risk_level: low
---

# R1 — Test Suite on PR

A GitHub-triggered routine that runs the project's test suite against
agent-authored pull requests and reports the result back to the PR.

This template is the canonical "low-risk, read-only validation" routine.
It is the first routine most adopters ship.

---

## What it does

- Fires when a pull request is opened or updated against `[YOUR_REPO]`
- Runs the project's full test suite (unit, integration, end-to-end)
- Posts a comment on the PR with a pass/fail summary
- On failure, lists the failing test names and surfaces the first failure's
  log excerpt
- Records one row in `routine_runs` per execution

It does **not**:

- Write to any branch
- Merge the PR
- Modify the failure library or trust scores
- Spawn any agents

---

## Filter pattern: agent-prefixed branches only

The trigger filter restricts execution to PRs whose head branch begins with
`agent/`. This is the single most important configuration line in the
template.

**Why:** without the filter, the routine fires on every PR — including PRs
authored by humans on branches like `feature/...` or `fix/...`. That has
two bad consequences:

1. **Quota burn.** The daily routine cap is finite. External contributor
   PRs can saturate it before any agent work has run.
2. **Trust score pollution.** A scored routine run on a human-authored PR
   would attribute test results to no agent in particular, muddying the
   `routine_runs` log.

**The filter ensures the routine scores only agent-authored work.** Human
PRs go through the standard human review path; the routine ignores them.

---

## Governance note

This routine writes only to `routine_runs`. It does **not** write to
`trust_scores`. Test pass/fail is *evidence* that contributes to the D1
score for the agent who authored the PR — but the actual D1 write is
performed by the Eval/Telemetry Service after a human reviewer signs off.

The routine's role is to gather and surface evidence, not to score.

---

## Input contract

The routine receives a GitHub `pull_request` event payload. The fields it
uses:

| Field                    | Use                                          |
|--------------------------|----------------------------------------------|
| `pull_request.head.ref`  | Branch name (used for the prefix filter)     |
| `pull_request.head.sha`  | Commit hash to test                          |
| `pull_request.number`    | PR number for posting comments               |
| `pull_request.user.login`| Caller identity (for routine_runs metadata)  |
| `repository.full_name`   | Target repo                                  |

---

## Output contract

| Output target          | Content                                                |
|------------------------|--------------------------------------------------------|
| PR comment             | Pass/fail summary, test counts, failure list (if any)  |
| `routine_runs` row     | Trigger type, correlation ID, status, duration, ref    |
| Operator alert channel | Posted only on infrastructure error (not on test fail) |

The routine **does not** post to alerts on test failures — that is normal
agent feedback flow, not an operational incident. It posts to alerts only
when the routine itself is broken (cannot check out, cannot run, etc.).

---

## Example config

```yaml
id: r1-pr-test
prompt: |
  You are running on a pull request against [YOUR_REPO].
  The head branch is {{pull_request.head.ref}}, commit {{pull_request.head.sha}}.

  1. Check out the head commit.
  2. Run the project's full test suite.
  3. If all tests pass: post a PR comment with a pass summary including
     test count and duration.
  4. If any tests fail: post a PR comment listing the failing test names
     and the first 50 lines of the first failure's log.
  5. In all cases, exit cleanly so the routine_runs row is recorded.

  Do not modify any files. Do not push to any branch. Do not approve or
  merge the PR.
trigger:
  type: github
  events:
    - pull_request.opened
    - pull_request.synchronized
  filter:
    head_branch_prefix: "agent/"
repos:
  - "[YOUR_REPO]"
connectors:
  - github
environment:
  CI: "true"
```

---

## Failure modes

| Failure                                  | Routine behavior                              |
|------------------------------------------|------------------------------------------------|
| Test suite fails                         | Post failure summary; routine_runs status: `pass_with_findings` |
| Test suite cannot run (broken setup)     | Post infra-error comment; routine_runs status: `error` |
| GitHub API rate-limit hit                | Routine retries via the adapter; eventually fails with `error` |
| PR head branch does not match filter     | Routine does not fire (filter rejects upstream) |
| Routine quota exhausted                  | Trigger is queued or dropped per platform policy |

---

## Testing the template

Before wiring this routine into a live repository:

1. Open a draft PR against a non-production fork on a branch named
   `agent/test-r1-canary`.
2. Verify the routine fires.
3. Verify it posts a PR comment.
4. Verify a `routine_runs` row appears with the correct trigger type and
   correlation ID.
5. Open a PR on a branch *not* matching `agent/` and confirm the routine
   does **not** fire.

Once all five checks pass, promote to production.
