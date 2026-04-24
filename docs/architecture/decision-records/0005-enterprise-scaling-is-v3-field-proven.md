# ADR 0005 — Enterprise Scaling Ships When It Is Field-Proven

## Status

Accepted.

## Context

The framework contains a complete enterprise scaling model: workspaces,
divisions, Division Orchestrators, role-agent alignment at team/division/
enterprise scale, work queues, approval gate chains, delegation rules,
persistent agent identity that travels across workspaces, and cross-workspace
bulletin and lock management.

The model is designed end-to-end. The schema is specified. The governance
implications are worked through: trust follows the instance across workspaces;
Division Orchestrators route but do not execute; HITL authority is role-gated
and delegatable with explicit TTL; delegates cannot re-delegate.

What is *not* true: it has not yet been field-proven at multi-team scale.

The reference implementation today is single-founder, single-workspace. The
numbers in the governance-overhead table (Section 11.9) are illustrative
estimates, not measured facts. The Division Orchestrator pattern has not
arbitrated a real cross-team escalation. Persistent agent identity has not
survived a real workspace reassignment outside the design.

A recurring failure mode in this space is publishing speculative design as if it
were validated architecture. Readers adopt it, discover the gaps at scale, and
lose trust in the entire framework — including the parts that *are* validated.

## Decision

Enterprise scaling content ships under the following rules:

1. **The concepts ship at v1.0 in documentation form.** Adopters need to see the
   scaling path before they commit. Hiding it would force them to guess.
2. **Every subsection is labeled "Designed — not yet field-proven at multi-team
   scale."** The label is not buried; it sits at the top of each subsection.
3. **The schema ships at v3.0, not v1.0.** `database/enterprise/` is present at
   launch as a README pointing at the model, but the SQL files themselves carry
   the v3.0 status marker. Adopters who need the schema early can read it; the
   authoritative drop is the v3.0 release that aligns with a field-proven
   implementation.
4. **The public README carries a maturity label.** Specifically:
   > Status: Production-informed reference architecture. Current
   > implementation: single-founder / single-workspace. Enterprise scaling
   > model: designed extension — not yet field-proven at multi-team scale.
5. **Governance overhead estimates are labeled illustrative.** The 15-20%,
   20-25%, 25-30% numbers are placeholders until multi-team deployments produce
   measurement. They are not removed — adopters need an order-of-magnitude
   estimate — but they are explicitly flagged.
6. **The scaling path does not break the v1.0 model.** None of Section 11
   changes any LIVE, Wave 1, or Wave 2 architecture. The enterprise model is
   additive, and the single-workspace deployment remains a fully valid
   terminal state.

## Consequences

**Positive.**

- Adopters can evaluate whether the framework's scaling path matches theirs
  before committing. Hiding the model would force them to guess and guess wrong.
- The maturity label sets honest expectations. Reviewers get "here is the
  v3.0 target" without "here is what we run today" getting confused.
- The v1.0 single-workspace deployment is a complete, coherent terminal state.
  Teams that never scale to multiple workspaces are not second-class citizens
  and never have to adopt the enterprise extension.

**Negative.**

- Some readers will want the v3.0 schema available as a ready-to-run
  migration. The current packaging gives them the schema files but marks them
  as a designed extension — this is the honest tradeoff.
- "Designed, not yet field-proven" is a claim we have to keep updating as real
  data arrives. Removing the label requires evidence of multi-team deployment
  behavior, not just intent.

**Follow-on.**

- Every enterprise-scaling doc carries the "Designed — not yet field-proven at
  multi-team scale" label at subsection level.
- The Reference Implementation Status table in the README is authoritative on
  which capabilities are LIVE vs DESIGNED. PRs that claim LIVE for a
  not-yet-field-proven capability are rejected.
- When the reference implementation validates a capability at multi-team scale,
  the label is removed in a dedicated PR with linked evidence — not silently.
