# Case Study: <Generic Team Identifier>

> Copy this file to `examples/case-studies/<your-team>.md` and replace every `< >` placeholder. Sections marked REQUIRED cannot be left empty. See [`README.md`](README.md) for submission instructions and the sanitization checklist.

---

## Context

**Team size:** <e.g. 7 engineers, 1 ML engineer, 0 dedicated platform engineers>
**Domain:** <generic — e.g. fintech, devtools, content platform, internal ops tooling>
**Product stage:** <pre-launch / growth / mature>
**Prior AI tooling experience:** <none / experimented with single-agent prompts / running multiple agents already>
**Adoption start date:** <YYYY-MM>
**Reporting period covered by this case study:** <e.g. 2026-04-01 to 2026-07-01>
**Number of scored sessions in the reporting period:** <integer>

A short paragraph (2-4 sentences) describing the team's situation at adoption start. What problem were you trying to solve? Why this framework, not another approach? What were you skeptical about going in?

---

## What you adopted

List the parts of the framework you took as written. Be specific.

| Component | Adopted? | Notes |
|---|---|---|
| Five-agent roster (orchestrator, agent-fe, agent-srv, qa-agent, fix-agent) | <yes / no / partial> | <if partial, which agents> |
| AgentTaskManifest schema | <yes / no / adapted> | |
| QAVerdict schema | <yes / no / adapted> | |
| FailureRecord schema (17-class taxonomy) | <yes / no / adapted> | |
| TrustScore schema (D1-D4) | <yes / no / adapted> | |
| Manual D1-D4 scoring with evidence per dimension | <yes / no> | |
| Trust tiers (HIGH / STANDARD / RESTRICTED / PROBATION / PROVISIONAL) | <yes / no / adapted> | |
| Pre-spawn protocol (STEP 1-3) | <yes / no / adapted> | |
| Build state machine | <yes / no / adapted> | |
| Pre-task failure retrieval | <yes / no> | |
| OS-level hooks (PreToolUse / PostToolUse) | <yes / no / partial> | <if partial, which hooks> |
| Postgres governance schema | <yes / no / adapted> | |
| File-based bulletin and locks | <yes / no> | |
| AGT-style runtime policy adapter | <yes / no> | |

**Engineering investment to first scored session:** <approximate hours>
**Engineering investment to steady state:** <approximate hours>

---

## What you adapted

For each adaptation, describe what you changed and why.

### <Adaptation 1 — short title>

What you changed: <e.g. "renamed `agent-srv` to `backend-engineer`">
Why: <e.g. "team prefers explicit role names; the existing instruction file template required no other changes">
Impact: <e.g. "no measurable impact on scoring or governance; pure naming">

### <Adaptation 2 — short title>

What you changed:
Why:
Impact:

### <Adaptation 3 — short title>

What you changed:
Why:
Impact:

(Repeat per adaptation. Common adaptations: renamed dimensions, added a sixth dimension, added a tier between RESTRICTED and STANDARD, subset the failure-class taxonomy, custom calibration anchors for your domain.)

---

## What worked

A paragraph or two on outcomes. Quantitative where possible.

**Failure rate per session:**
- Before adoption: <approximate, with caveat about how you measured>
- After adoption: <approximate, with measurement window>

**Time-to-detect for a representative class:**
- Before adoption: <e.g. "a week, often after staging deployment">
- After adoption: <e.g. "within the same session, in QA">

**Trust score trajectory — one or two agents:**

| Agent | Sessions | Starting tier | Current tier | Notable patterns |
|---|---|---|---|---|
| <agent_id> | <n> | <PROVISIONAL> | <RESTRICTED / STANDARD / HIGH> | <one sentence> |
| <agent_id> | <n> | <PROVISIONAL> | <...> | |

**Repeat vs. novel failures:**
- Total failures recorded: <integer>
- Repeat (recurrenceCount >= 2): <integer>
- Novel: <integer>

**Specific catches you would not have caught without the framework:**

- <One bullet per concrete catch. Generic descriptions of the scenario, no product specifics.>
- <Example: "schema_violation in a `billing-rate-bug` — caught by pre-task retrieval injecting a prior FailureRecord into the brief">

---

## What did not work — REQUIRED

This is the section the reader learns from. Be honest. Minimum one item; ideally three or more.

### <Issue 1 — short title>

What we tried: <e.g. "We adopted the build state machine end-to-end on day one">
What broke: <e.g. "Engineers found the state-transition discipline too heavy for low-risk tasks">
What we did instead: <e.g. "We applied the state machine only to medium and high-risk tasks; low-risk tasks skip it">
What the next reader should know: <e.g. "Build state machine compliance is correlated with task risk level — adopt it gradually">

### <Issue 2 — short title>

What we tried:
What broke:
What we did instead:
What the next reader should know:

### <Issue 3 — short title>

What we tried:
What broke:
What we did instead:
What the next reader should know:

(Common issues: D4 dimension under-used, hooks fire too often during exploratory work, calibration drift between two reviewers, schema_violation false positives from contract-versioning ambiguity, Postgres migration timing, FailureRecord proliferation without consolidation.)

---

## What you would do differently

One or two paragraphs aimed at the next reader. Concrete advice, not generalities.

Examples of useful advice:
- "Stay file-based until n=15. Postgres before that is premature."
- "Add hooks one at a time, only for violations you have actually observed. Hypothetical hooks fire on edge cases and erode trust."
- "Calibrate D1-D4 with two reviewers scoring the same session in the first month, then reconcile. Calibration is the difference between trust scores meaning something and noise."

---

## Sanitization confirmation

- [ ] No customer or supplier names
- [ ] No internal repo paths — `[PROJECT_REPO]` used as placeholder
- [ ] No production data values
- [ ] No proprietary domain names
- [ ] No trade secrets
- [ ] Team identifier in the filename is not the legal company name

---

## Contact

<Optional. Email or GitHub handle if you are willing to answer follow-up questions from other adopters. Leave blank if not.>

---

## License

By submitting this case study, you agree to publish it under the same MIT license as the framework. Your team retains all rights to the underlying systems, data, and decisions described. This case study is a description, not a transfer.
