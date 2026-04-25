---
id: r4-security-scan
status: v1.0
title: Security Scan on PR
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
risk_level: medium
hitl_gate:
  trigger_severity: major
  reviewer_group: "[REVIEWER_GROUP]"
---

# R4 Security Scan on PR

A GitHub-triggered routine that scans agent-authored pull requests for
common security issues and surfaces findings to a human reviewer before
the PR can merge.

Unlike R1 (test suite), R4 has a **hard human review gate**: any finding
above MAJOR severity blocks merge until a designated reviewer signs off.

---

## What it scans for

The routine flags four categories of issue. These categories are the
operationally useful ones narrow enough to be high signal, broad enough
to catch the most common failure modes.

### 1. Secrets

- API tokens, private keys, AWS credentials in source files
- `.env` files committed to the repo
- Credentials embedded in test fixtures or sample configs
- High-entropy strings in non-test paths

### 2. Dependency CVEs

- Direct dependencies with known CVEs at HIGH or CRITICAL severity
- Transitive dependencies with HIGH+ CVEs (informational, not blocking)
- Dependencies pinned to versions older than the most recent secure release

### 3. Unsafe patterns

- `eval()` or equivalent dynamic-execution constructs
- `Function(string)` constructors
- Dynamic `require()` / `import()` with non-literal arguments
- Shell command construction by string interpolation
- Unsanitized HTML insertion (`innerHTML` with non-escaped values)
- Use of cryptographic primitives flagged by the language ecosystem
  (e.g., MD5 for security purposes, hardcoded IVs, ECB mode)

### 4. Sensitive-data exposure

- Logging that includes user PII, auth tokens, or session IDs
- Error responses that leak stack traces or internal paths to clients
- Unredacted request/response bodies in audit-style logs

---

## Severity classification

Findings are classified into four severity bands. The band determines
whether the routine blocks the merge gate.

| Severity   | Examples                                                | Gate behavior                |
|------------|---------------------------------------------------------|------------------------------|
| CRITICAL   | Live API key in source; eval of user input              | **Block** reviewer required |
| MAJOR      | Hardcoded credential in test; high-CVE dep; unsafe eval | **Block** reviewer required |
| MINOR      | Old-but-not-vulnerable dep; logging session ID          | Annotate; do not block       |
| INFO       | Style issues, non-security findings                     | Annotate; do not block       |

**The MAJOR threshold is operational, not theoretical.** A routine that
blocks on MINOR findings is a routine that gets disabled within a week.
Tune the threshold to match your risk tolerance, but keep MAJOR as the
default.

---

## Human review gate

When the routine reports any finding at MAJOR severity or above:

1. The PR is labeled `security-review-required`
2. The PR's status check `security/scan` is set to `failure`
3. A summary comment is posted listing the findings, their severity, and
   their file/line locations
4. The configured `[REVIEWER_GROUP]` is requested as a PR reviewer
5. The merge button is disabled by branch protection until the reviewer
   removes the label or marks the check as resolved

The routine does **not** dismiss its own findings. Only a member of
`[REVIEWER_GROUP]` can clear the gate.

---

## Output format

PR comment template (used on every run with findings):

```markdown
### Security scan {{pull_request.head.sha[:7]}}

**Status:** {{status}}    **Findings:** {{count_total}}
**Critical:** {{count_critical}} · **Major:** {{count_major}} · **Minor:** {{count_minor}}

#### Findings

| Severity | Category   | File                  | Line | Note                           |
|----------|------------|-----------------------|------|--------------------------------|
| MAJOR    | secret     | src/config/api.ts     | 42   | High-entropy string detected   |
| MINOR    | dep-cve    | package.json          | -    | lodash@4.17.10 (CVE-...)       |
| INFO     | unsafe     | scripts/build.js      | 17   | Dynamic require with literal   |

[Full report (correlation_id={{correlation_id}})]({{report_url}})
```

If no findings: a single-line `### Security scan clean` comment.

---

## Governance note

R4 writes only to `routine_runs`. It does **not** write to
`failure_records`. A confirmed finding may eventually become a failure
record but only after a human reviewer triages it. The routine surfaces
evidence; the operator decides whether it constitutes a failure event.

---

## Example config

```yaml
id: r4-security-scan
prompt: |
  You are running a security scan on a pull request against [YOUR_REPO].
  Head branch: {{pull_request.head.ref}}, commit: {{pull_request.head.sha}}.

  1. Diff the PR against the base branch.
  2. For each changed file, scan for:
     - secrets (API tokens, keys, credentials)
     - dependency CVEs (HIGH/CRITICAL only)
     - unsafe patterns (eval, dynamic require, shell injection,
       unsafe innerHTML, weak crypto primitives)
     - sensitive-data exposure (PII in logs, stack traces in responses)
  3. Classify each finding into CRITICAL / MAJOR / MINOR / INFO.
  4. Post a PR comment using the template in the routine README.
  5. If any finding is MAJOR or CRITICAL:
     - Label the PR `security-review-required`
     - Request review from [REVIEWER_GROUP]
     - Set the `security/scan` status check to failure
  6. If clean, post the clean-summary comment and pass the status check.

  Do not modify files. Do not push. Do not merge.
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
```

---

## Failure modes

| Failure                              | Routine behavior                              |
|--------------------------------------|------------------------------------------------|
| Scanner crash                        | Post infra-error comment; routine_runs: `error` |
| MAJOR+ finding                       | Block merge; request reviewer; routine_runs: `pass_with_findings` |
| Only MINOR/INFO findings             | Annotate; merge not blocked; routine_runs: `pass` |
| Branch filter rejects PR             | Routine does not fire                          |
| Quota exhausted                      | Trigger queued or dropped per platform policy  |

---

## Tuning the rule set

The four scan categories above are the v1 default. As you accumulate
operational experience, you will want to:

- **Add patterns** specific to your stack (framework-specific anti-patterns)
- **Remove noisy rules** that produce false positives faster than your
  reviewers can clear them
- **Promote MINOR rules to MAJOR** when a class of issue keeps slipping
  through

Track every rule change in a routine-versioning log so the operator can
correlate finding-rate changes against rule changes.
