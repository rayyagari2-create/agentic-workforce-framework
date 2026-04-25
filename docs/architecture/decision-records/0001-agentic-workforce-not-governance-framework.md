# ADR 0001 This is an Agentic Workforce Framework, Not a Governance Framework

## Status

Accepted.

## Context

Enterprise AI agents are moving from isolated tools to autonomous digital workers.
They plan, execute, review, escalate, and collaborate across increasingly complex
workflows. The early framing for this project was "AI governance" the layer that
gates what models are permitted to do.

Two architectural observations made that framing wrong:

1. **Runtime policy enforcement already exists at the infrastructure layer.**
   Microsoft AGT (MIT, April 2026) provides deterministic, sub-millisecond policy
   enforcement with 0.00% bypass, zero-trust agent identity, sandboxing, OWASP
   coverage, and an append-only cryptographically chained audit trail. It answers
   *what agents are permitted to do.* A second framework that restates the same
   question adds no value.

2. **The unsolved question is behavioral, not permissive.** Given that an agent is
   *permitted* to act, we still do not know whether it can be *trusted* to act —
   and whether that trust is improving or degrading. No runtime policy layer
   answers that. Trust tiers, D1-D4 scoring, failure memory, and pre-spawn
   protocols live one layer up from runtime policy and cannot be collapsed into it.

The organizing metaphor that fits the problem is a workforce: persistent identity,
role boundaries, task assignment, performance review, promotion and demotion,
incident reports, and an HR policy engine. Governance is the control plane inside
that workforce not the architecture of the whole thing.

## Decision

Position this framework as an **agentic workforce framework**. The workforce plane
is the headline: roles, agents, teams, handoffs, persistent identity.

The four planes are, in order of prominence:

1. **Agentic workforce plane** agents, teams, orchestrators, role assignment,
   task execution, handoffs, persistent identity.
2. **Autonomy plane** trust tiers, D1-D4 scoring, failure memory, autonomy gates,
   promotion and demotion, work queues.
3. **Control plane** runtime policy enforcement, HITL gates, audit log, approval
   gate chains, delegation, compliance evidence. (Commonly referred to as
   "AI governance.")
4. **Automation plane** routines, scheduled checks, PR scans, alert triage,
   deploy verification.

The public positioning is therefore:

> The runtime policy layer governs *what* your agents do.
> This framework governs *whether they can be trusted to do it* and whether that
> trust is improving or degrading over time.

## Consequences

**Positive.**

- Naming is precise and non-overlapping with the runtime policy layer. Questions
  like "is this AGT?" have a clean answer.
- The workforce metaphor maps directly to concepts HR and operations leaders
  already use: job descriptions, performance reviews, PIPs, promotions,
  incident reports. Adoption does not require inventing new vocabulary.
- Trust scoring, failure memory, and autonomy gates sit on the autonomy plane,
  where they belong. Trying to fit them into "governance" produced conceptual
  friction every time.

**Negative.**

- "Agentic workforce" is a less familiar phrase than "AI governance" and will
  need explicit positioning in external communications.
- The control plane still carries the name many readers associate with the
  entire space. The docs therefore call it out explicitly as "commonly referred
  to as AI governance" so readers do not get lost.

**Follow-on.**

- Public-facing docs (README, four-plane model, architecture diagrams) lead with
  the workforce plane.
- Governance-first language is confined to the control plane section.
