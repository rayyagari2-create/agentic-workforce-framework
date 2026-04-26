# FAQ

---

## Is this a product?

No. This is a reference architecture and operating model.
There is no hosted service, no SaaS offering and no
commercial product tied to this repo. You implement it
in your own stack.

---

## Is this only for Claude Code?

No. The governance model (trust scoring, failure memory,
manifests, approval gates, audit trail) is runtime-agnostic.

The hook examples are written for Claude Code's PreToolUse
and PostToolUse hook system. If you use a different agent
runtime, adapt the hook examples to your runtime's
pre-execution interception mechanism. The governance
behavior is identical.

---

## Is this an AI safety framework?

No. This framework governs operational reliability and
behavioral accountability, not model output safety.

It tracks whether agents are becoming more or less
trustworthy over time. It does not make claims about
hallucination rates, harmful content or model output
quality. Those concerns belong to the model provider layer.

See the "What this framework is not" section in the README.

---

## Is this production-ready?

The single-workspace operating model is production-informed.
It has been running in a private reference implementation
across 50+ scored sessions.

The enterprise scaling model (divisions, workspaces, work
queues, approval gate chains) is a Reference Pattern:
architecturally designed and published, but not yet
field-proven at multi-team scale.

Do not deploy the enterprise schema in production until
the single-workspace model is stable in your environment.

---

## What is the minimum an enterprise team should adopt?

The minimum viable governance stack:

1. Agent roster with capability boundaries
2. AgentTaskManifest for MEDIUM and higher risk tasks
3. Manual D1-D4 trust scoring with evidence
4. FailureRecord per defect
5. Pre-task failure retrieval

That stack requires no Postgres, no hooks and no routines.
It produces governance value on day one.

See [ADOPTION.md](../ADOPTION.md) for the full path.

---

## Why five agents?

Five agents cover the core build loop:

- **Orchestrator**: routes work, manages session state
- **Frontend Agent**: owns UI scope
- **Backend Agent**: owns server scope
- **QA Agent**: verifies outcomes
- **Fix Agent**: repairs defects

This is the minimum team that can build, verify and repair
software autonomously. Additional agents (security-check,
code-review, chief-of-staff) extend the team but are not
required to start.

---

## Why not fully automate approvals?

Because trust must be earned before autonomy can expand.

Automated approvals remove the human signal that trust
scoring depends on. Without a human verifying high-risk
work, you have no ground truth for whether the agent's
judgment is improving or degrading.

The framework is designed to expand autonomy gradually as
evidence accumulates, not to eliminate human judgment.
HITL approval for HIGH-risk tasks is a feature, not a
limitation.

---

## How does this differ from a normal CI/CD workflow?

CI/CD governs code deployment. This framework governs
agent behavior.

CI/CD answers: "Did the code pass tests?"
This framework answers: "Can this agent be trusted to
write the code in the first place, and is that trust
improving or degrading over time?"

The two are complementary. The framework's R1 routine
(PR test) integrates with CI/CD. The governance layer
sits above it.

---

## Why use file-based governance before Postgres?

Because discipline must precede tooling.

File-based governance forces you to write things down:
manifests, failure records, trust scores, before
automating them. Teams that skip file-based governance
and go directly to Postgres often automate inconsistent
or uncalibrated practices that produce governance theater
rather than governance value.

Start file-based. Migrate to Postgres when the ledger
is unwieldy, typically after 50+ sessions.
