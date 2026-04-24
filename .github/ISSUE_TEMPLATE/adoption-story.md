---
name: Adoption story
about: "We are using this and here is what we found"
title: "[adoption] "
labels: adoption-story
---

## Team size and domain

- Engineers: <e.g. 7>
- AI/ML engineers (separately, if relevant): <e.g. 1>
- Domain (generic): <e.g. fintech, devtools, content platform, internal ops tooling>
- Product stage: <pre-launch / growth / mature>
- Prior AI tooling experience: <none / experimenting / running multiple agents already>

## Which parts adopted

What you took as written. Be specific.

- [ ] Five-agent roster
- [ ] D1-D4 trust scoring with evidence per dimension
- [ ] FailureRecord schema and lifecycle
- [ ] Pre-spawn protocol
- [ ] OS-level hooks
- [ ] Postgres governance schema
- [ ] File-based bulletin
- [ ] Pre-task failure retrieval
- [ ] Other (describe):

Approximate engineering time invested:

## Which parts adapted

What you changed and why. One or two bullets per adaptation.

- <Adaptation 1>: <what changed, why>
- <Adaptation 2>: <what changed, why>

## Outcomes

Brief description of what you observed. Quantitative where possible.

- Number of scored sessions:
- Trust score trajectory for one or two agents:
- Failures caught that would have shipped without the framework (specific examples — sanitized):
- Parts of the framework that produced the most value:
- Parts of the framework that produced the least value:

## What did not work

Honest answer. Anything that did not produce the expected value, or that you abandoned.

If you cannot identify anything yet, the team may be too early in adoption — that is fine; submit again in a few months.

## Would you like this to become a case study?

- [ ] Yes — I am willing to write a full case study using [`examples/case-studies/TEMPLATE.md`](../../examples/case-studies/TEMPLATE.md). I will open a PR.
- [ ] Yes — but I would prefer the maintainers to draft from this issue and review with me before publishing.
- [ ] No — I am sharing for the framework's benefit but not ready to publish a public case study.
- [ ] Not sure yet — happy to discuss.

## Additional context

Optional. Anything else that would help future readers learn from your adoption.
