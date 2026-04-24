# Case Studies — Submission Guide [v1.0]

Community-contributed adoption stories. The folder is [FUTURE] — there are no entries yet — but the submission template ships now so the first contribution is unblocked.

The most useful case studies show what was adapted and what did not work. A case study with only successes is an advertisement, not a case study. The framework is more useful for the next reader when you write the parts you struggled with.

---

## What a case study must include

A submission is rejected if any of the following are missing.

### 1. Context

- Team size (engineers and AI/ML engineers separately if relevant)
- Domain (e.g. fintech, devtools, content platform — generic; no company name required)
- Product stage (pre-launch, growth, mature)
- Prior experience with AI agent tooling (none / experimenting / running multiple agents already)

This section sets the reader's calibration. A case study from a 200-engineer mature platform reads differently from a five-engineer pre-launch team.

### 2. What you adopted

- Which parts of the framework you took as written
- D1-D4 trust scoring, FailureRecord lifecycle, autonomy gates, hooks, schemas — list specifically
- Approximate timeline from first read to first scored session
- Engineering investment in hours

Be specific. "We adopted the framework" is not adoption. "We adopted D1-D4 manual scoring, the FailureRecord schema, and the pre-spawn protocol; we did not adopt hooks or the build state machine" is adoption.

### 3. What you adapted

- What you renamed (agent IDs, dimensions, tiers)
- What you subset (omitted dimensions, omitted hooks, simplified state machine)
- What you extended (added a sixth dimension, added a tier between RESTRICTED and STANDARD, added a new failure class)
- Why each change was made

A renamed agent is fine. A removed dimension changes the scoring semantics — say so.

### 4. Measured outcomes

Quantitative where possible. The framework's claim is behavioral accountability over time, so the relevant metrics are:

- Failure rate per session (before adoption vs. after)
- Time-to-detect for a representative class of defect
- Trust score trajectory for one or two agents over the first 10-20 sessions
- Number of repeat failures vs. novel failures

Qualitative observations are welcome but cannot replace the metrics. If you cannot produce metrics yet, label the case study explicitly as "early adoption — quantitative outcomes pending."

### 5. What did not work — REQUIRED

This is the section the reader learns from. Be honest.

- A part of the framework you tried and gave up on
- A scoring dimension that did not produce useful signal
- A hook that fired too often or not enough
- A tier promotion rule you had to weaken or strengthen
- A failure class that did not match your domain

If you cannot identify anything that did not work, the case study is too early. Wait until you have run 15+ scored sessions before submitting.

### 6. What you would do differently

- One or two paragraphs
- Aimed at the next reader, not at the framework authors
- Concrete: "Skip Postgres for the first month — the file-based ledger is fine until n=15" is useful. "Move slower" is not.

---

## How to submit

1. Copy [`TEMPLATE.md`](TEMPLATE.md) to a new file named `<your-team>.md` in this directory. Pick a generic identifier, not your company name.
2. Fill in every section. Sections marked REQUIRED cannot be empty.
3. Sanitize the content. No customer names, no internal repo paths, no production data, no trade secrets.
4. Open a pull request against the framework repo. Title the PR `case-study: <your-team>`.
5. Tag the PR with the `case-study` label.

The PR will be reviewed for sanitization and completeness. The framework maintainers do not edit the substance of a case study — they may ask you to remove identifying information or to flesh out a thin section.

---

## Sanitization checklist

Before opening the PR, confirm:

- [ ] No customer or supplier names
- [ ] No internal repo paths — use `[PROJECT_REPO]` as the placeholder
- [ ] No production data values (real billing rates, real user IDs, real request bodies)
- [ ] No proprietary domain names — generic descriptions are fine
- [ ] No trade secrets, even by paraphrase
- [ ] The team identifier in the filename is not the legal company name
- [ ] If the case study mentions a third-party vendor, the vendor is named only when the framework's behavior depends on it (e.g. "we use Postgres" is fine; "we use Vendor X for Y" is fine if the choice is load-bearing in the case study)

---

## What the framework maintainers will do

- Review for sanitization and completeness
- Ask clarifying questions in the PR
- Merge if the submission meets the requirements above
- Reference your case study in framework documentation when readers ask "has anyone done X?"

What the maintainers will not do:

- Edit your conclusions
- Soften your "what did not work" section
- Use your case study as marketing material without acknowledging the negative findings

---

## Why honest case studies matter

The framework was built alongside one production reference implementation. It is informed by ~15 sessions of single-founder, single-workspace use. The enterprise scaling model is designed, not yet field-proven. Every case study from a different team configuration moves the framework from "production-informed" to "validated across multiple teams."

A case study where everything went well is less useful to the next reader than a case study where one part broke and you wrote down why. The next reader will face the same break. Your write-up shortens their loop.
