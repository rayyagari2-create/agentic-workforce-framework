# Routine Templates

This directory contains framework-level templates for common routine
patterns. Each template is sanitized — no project-specific names, no
private repository paths, no vendor-coupled assumptions beyond the
trigger model itself.

---

## Template index

| File                              | Purpose                                              | Status |
|-----------------------------------|------------------------------------------------------|--------|
| `r1-pr-test.md`                   | Run test suite on agent-authored PRs                 | v1.0   |
| `r4-security-scan.md`             | Security scan on agent-authored PRs                  | v1.0   |
| `r10-nightly-trust-score.md`      | Nightly D1-D4 scoring routine                        | v2.0   |
| `r-alert-triage.md`               | API-triggered alert classification                   | v2.0   |
| `r-deploy-verification.md`        | Deploy pipeline smoke test + health check            | v3.0   |

---

## How to use a template

1. **Copy the template file** into your own routines directory.
2. **Parameterize** by replacing the placeholders (see below).
3. **Register the routine** with your trigger engine — schedule, API, or
   GitHub — using the routine platform's setup flow.
4. **Test** the routine end-to-end against a non-production target before
   wiring it into your live pipeline.
5. **Wire the adapter.** Make sure all routine-side calls back into your
   framework go through the adapter described in
   `routines/adapter-pattern.md`.

---

## Parameterization

Every template uses the same placeholder set. Replace these tokens with
values for your environment:

| Placeholder         | Meaning                                          | Example                               |
|---------------------|--------------------------------------------------|---------------------------------------|
| `[YOUR_REPO]`       | Repository the routine reads or writes to        | `your-org/your-app`                   |
| `[BRANCH_PREFIX]`   | Branch filter for GitHub triggers                | `agent/`                              |
| `[ROUTINE_ID]`      | Unique routine identifier                        | `r1-pr-test`                          |
| `[CORRELATION_KEY]` | Field used to thread correlation IDs             | `x-correlation-id`                    |
| `[ALERT_CHANNEL]`   | Where the routine posts results                  | `#agent-runs`                         |
| `[REVIEWER_GROUP]`  | Human reviewer group for HITL gate               | `@security-reviewers`                 |

If a template introduces a placeholder beyond this set, it is documented
inline at the top of the template file.

---

## YAML frontmatter

Each template begins with a YAML frontmatter block that captures the
operational config in a single place. The fields are stable across
templates so an operator can quickly diff one routine against another:

```yaml
---
id: r1-pr-test
status: v1.0
trigger:
  type: github
  events: [pull_request.opened, pull_request.synchronized]
  filter:
    head_branch_prefix: agent/
repos:
  - "[YOUR_REPO]"
mcp_connectors:
  - github
governance:
  human_review_required: true
  writes_to: [routine_runs]
  does_not_write_to: [trust_scores]
---
```

Treat the frontmatter as authoritative. The prose below it is documentation;
the frontmatter is the spec.

---

## Governance contract for every template

All templates in this directory share these guarantees:

- **Routines write only to `routine_runs`.** They never write to
  `trust_scores`, `failure_records`, or `agent_events` directly. If a
  routine's output should influence trust, it produces a payload and
  hands it off to the Eval/Telemetry Service.
- **Human review gate.** Any routine output that affects merge,
  deploy, or production traffic requires a human reviewer step before the
  effect lands.
- **Correlation ID required.** Every routine run threads a correlation ID
  from trigger to log. See `routines/adapter-pattern.md`.
- **Branch filter for GitHub triggers.** Templates with GitHub triggers
  filter to a branch prefix (default `agent/`) to avoid burning the
  daily quota on external PRs.

---

## When to write your own template

Use the existing templates first. If your routine pattern looks like one
of them, parameterize the existing template and ship.

Write a new template only when:

- The trigger source differs (e.g., GitLab, Bitbucket, internal bus)
- The output target differs (e.g., a dashboard, not a PR comment)
- The governance shape differs (e.g., a no-human-review routine for a
  fully closed-loop pipeline — rare and approached with caution)

When you write a new template, follow the same conventions: YAML
frontmatter, governance contract, parameterized placeholders, sanitized
examples.
