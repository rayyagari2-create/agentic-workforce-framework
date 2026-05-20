# Examples Decision Guide

Reference implementations of the Agentic Workforce Framework, organized by deployment scope. Pick the example that matches where you are today, not where you want to be in six months.

---

## Which example matches your situation

| Your situation | Start here | Status |
|---|---|---|
| Zero infra. You have model APIs and prompt files. You want to run a scored session inside of a day. | [`minimum-viable-adoption/`](minimum-viable-adoption/) | [v1.0] |
| Single workspace. You have or are willing to stand up Postgres, hooks, and a file-based bulletin. You want the full reference implementation. | [`single-workspace/`](single-workspace/) | [v1.0] |
| Multi-team, multiple workspaces, division-level orchestration. | [`multi-team/`](multi-team/) | [v3.0] placeholder |
| You want to understand Sprint 2 cross-runtime governance proof. | [`cross-runtime/`](cross-runtime/) | v0.2.0 sanitized replay of validated proof |
| You have adopted this framework and want to share results. | Submit a [`case-studies/`](case-studies/) entry | [v1.0] |

---

## Reading order

1. Start with [`minimum-viable-adoption/README.md`](minimum-viable-adoption/README.md) regardless of your target scope. The mental model is the same. The infra differs.
2. If you are operating a real workforce, move to [`single-workspace/README.md`](single-workspace/README.md). That is the depth required for production.
3. Only consider [`multi-team/`](multi-team/) when single-workspace governance is running reliably for at least one quarter. The Division Orchestrator model is designed but not yet field-proven.

---

## What each directory contains

### `minimum-viable-adoption/` [v1.0]

The lowest-friction entry point. File-based ledger, no Postgres, no hooks, no routines. Five-agent generic roster. One scored session, one failure record, one session close. Designed to be runnable inside of a working day.

Use this when you need to demonstrate value to your team before asking for the engineering time to build the full single-workspace stack.

### `single-workspace/` [v1.0]

The full single-workspace reference. Trust history per agent, autonomy gates per agent, ADRs, instruction-file ownership. Includes a session scoring walkthrough that follows pre-spawn protocol through the QA loop and into trust scoring with evidence per dimension.

Use this when you have committed to the framework and are ready to invest the engineering time.

### `multi-team/` [v3.0] placeholder

Reserved for the v3.0 multi-team extension. The Division Orchestrator model is designed but not yet field-proven. Content ships when the reference implementation has validated it at multi-team scale.

### `case-studies/` [FUTURE] folder, [v1.0] template

Community-contributed adoption stories. The folder ships now with a template and submission instructions. The most useful case studies show what was adapted and what did not work that is the section a reader learns from.

---

## Submitting a case study

If you have adopted any part of this framework even just D1-D4 trust scoring on a single agent your experience is useful to the next reader. See [`case-studies/README.md`](case-studies/README.md) for submission instructions and [`case-studies/TEMPLATE.md`](case-studies/TEMPLATE.md) for the format.

The template asks for what did not work. That section is required. A case study with only successes is an advertisement, not a case study.
