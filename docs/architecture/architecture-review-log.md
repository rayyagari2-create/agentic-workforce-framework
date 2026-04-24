# Architecture Review Log

This document is a chronological log of architecture concerns raised by
external reviewers and how each was resolved. The point of publishing
this log is to demonstrate that the design was iterated under outside
pressure, rather than written in a single pass and frozen.

The entries below are drawn from the v10.1, v10.2, and v10.3 hardening
cycles of the source architecture specification. Each entry follows the
same format:

- **Date** — when the concern was raised.
- **Reviewer role** — what kind of reviewer surfaced it.
- **Concern** — what they flagged.
- **Resolution** — how it was addressed.
- **Hardening change** — the concrete change in the architecture.

Reviewer names and identifying details are not published. The roles
(CTO review, external reviewer, internal hardening pass) are sufficient
to characterize the source.

---

## Format

| Date | Reviewer | Concern | Resolution | Hardening change |
|---|---|---|---|---|

---

## Entries

### 2026-04-24 — v10.3 (Final Internal Cleanup)

| Date | Reviewer | Concern | Resolution | Hardening change |
|---|---|---|---|---|
| 2026-04-24 | Internal hardening pass | Lingering private project references in the routine inventory | Replaced all remaining private project references with `[PROJECT_REPO]` placeholders; "founder reviews" wording replaced with "human reviewer reviews before merge" | Routine templates fully sanitized; ready for public extraction |
| 2026-04-24 | Internal hardening pass | Persistent agent identity table had ambiguous mutability — unclear which fields could change | Full table rewrite of `agent_instances` with explicit immutable identity columns and explicit mutable lifecycle columns (operator_assignment, status, archived_at) | Mutability rule documented per column; every mutation produces an audit event |
| 2026-04-24 | Internal hardening pass | Workspace table did not anchor to a division — Division Orchestrator authority had no schema substrate | Added `division_id` column to `workspaces`; added a separate `divisions` table | Division Orchestrator authority is now schema-anchored, not just narrative |
| 2026-04-24 | Internal hardening pass | Delegation re-delegation rule asserted DB-level constraint that is actually application-layer | Wording corrected to identify the rule as application-layer enforcement | Documentation no longer claims a constraint that does not exist; honest scoping of the enforcement layer |
| 2026-04-24 | Internal hardening pass | Section 4 numbering inconsistent across diagrams | Renumbered: 4.4 Public-Safe Diagram, 4.5 Four-Plane Detail, 4.6 Enterprise Scaling | Public-safe diagram is the diagram referenced in the public README and in this directory's [four-plane-model.md](four-plane-model.md) |

---

### 2026-04-24 — v10.2 (CTO Second Review)

| Date | Reviewer | Concern | Resolution | Hardening change |
|---|---|---|---|---|
| 2026-04-24 | CTO review (P0) | Work queue items table status enum did not match the lifecycle described in the prose | Aligned `work_queue_items.status` to the eight-state lifecycle exactly | Schema matches narrative; no drift between architecture document and SQL |
| 2026-04-24 | CTO review (P0) | Operational lifecycle mutability rule was missing — unclear whether status transitions counted as audit-log mutations | Added explicit operational lifecycle mutability rule: lifecycle field updates produce new audit events, never edit prior ones | Audit log invariant clarified; recorded as [ADR-0004](decision-records/0004-append-only-audit-log.md) |
| 2026-04-24 | CTO review (P0) | `agent_instances` mutability was unclear — operator assignment could appear to be immutable | Specified `operator_assignment`, `status`, `archived_at` as mutable; identity fields immutable | Mutable / immutable columns explicit per row |
| 2026-04-24 | CTO review (P0) | `gate_records` "append-only" wording was misleading — lifecycle fields legitimately mutate | Wording corrected to "append-only audit entries; lifecycle fields mutable with audit event" | Same invariant applied consistently across `work_queue_items`, `agent_instances`, and `gate_records` |
| 2026-04-24 | CTO review (P1) | No `divisions` table existed — Division Orchestrator authority had no anchor | Added `divisions` table at C.1.1 with `parent_division_id` for hierarchical divisions | Division authority schema-anchored |
| 2026-04-24 | CTO review (P1) | Internal architecture diagrams contained private product names and were not flagged as private | Section 4 internal diagrams labeled non-public-extractable; public-safe four-plane diagram added at 4.4 | Clear separation between internal and public diagrams; this directory uses the public-safe diagram |
| 2026-04-24 | CTO review (P1) | Public-facing name was inconsistent — internal product name appeared in places that should reference the public framework | Public-facing name standardized as "Agentic Workforce Framework" everywhere | Public framework name is consistent |
| 2026-04-24 | CTO review (P2) | No explicit "what ships at v1.0 vs what is excluded" statement — readers could not tell what is in scope | Public Repo Launch Scope section added | Explicit v1.0 includes / excludes list |
| 2026-04-24 | CTO review (P2) | Reference Implementation Status was scattered — no single table summarizing what was live vs designed | Reference Implementation Status table added; required in public README | Honest accounting in one place; no mixing of current and target state |

---

### 2026-04-24 — v10.1 (CTO First Review)

| Date | Reviewer | Concern | Resolution | Hardening change |
|---|---|---|---|---|
| 2026-04-24 | CTO review (P0) | Confidence band for n=15 was incorrectly labeled LOW; the rubric clearly placed it at MEDIUM | Confidence band corrected: PROVISIONAL (n<5) · LOW (5–9) · MEDIUM (10–19) · HIGH (≥20) | The rule is applied identically everywhere; no other interpretation tolerated |
| 2026-04-24 | CTO review (P0) | Component counts were inconsistent across sections — agents counted differently in different tables | Counts unified: 10 Agents and 3 Services in framework plane; hybrids counted separately, not folded | Hybrids are their own count; classification rubric is enforced consistently |
| 2026-04-24 | CTO review (P0) | An automated scoring routine appeared to write directly to `trust_scores` — circumvents the single-writer rule | Routine writes only to `routine_runs`; the Eval/Telemetry Service is the sole writer to `trust_scores` | Recorded as [ADR-0002](decision-records/0002-routines-are-not-agents.md) |
| 2026-04-24 | CTO review (P0) | Private project file paths leaked into routine inventory — would have surfaced in public extraction | All private repo path references replaced with `[PROJECT_REPO]` | Sanitization rule enforced before any public extraction pass |
| 2026-04-24 | CTO review (P1) | Executive summary led with governance, framing the project as a compliance product | Executive summary reframed to lead with the agentic workforce model; governance described as the control plane, not the architecture | Recorded as [ADR-0001](decision-records/0001-agentic-workforce-not-governance-framework.md) |
| 2026-04-24 | CTO review (P1) | Trust scope was unclear at multi-team scale — appeared to be per-role rather than per-instance | Trust model corrected: scope is per-workspace, trust is per-agent-instance | Persistent agent identity carries trust across teams; documented in [enterprise-scaling.md](enterprise-scaling.md) |
| 2026-04-24 | CTO review (P1) | Database backbone table mixed schema status with data migration status — readers could not tell whether a table was running | Layer 8 governance table split into Schema Status and Data Migration columns | Honest reporting of where schema-live ends and data-live begins |
| 2026-04-24 | CTO review (Add) | No public extraction rule was documented — risk of private content slipping through | Public extraction rule added near the legend; Public Framework Boundary section added | Sanitization rule has a single source of truth |
| 2026-04-24 | CTO review (Add) | No public framework maturity label — risk of public readers assuming everything is shipped | "Production-informed reference architecture" maturity label added; required in public README | Honest accounting; enterprise scaling explicitly labeled as designed but not field-proven |
| 2026-04-24 | CTO review (Add) | No public-safe four-plane diagram — articles and talks would risk leaking private names | Public-safe four-plane diagram added at Section 4.4 | This is the diagram used in [four-plane-model.md](four-plane-model.md) |

---

### Earlier — External Reviewer Concerns Addressed in v10

The following entries are summarized from earlier external review
exchanges. They are listed in compressed form because their resolutions
are now part of the steady-state architecture.

| Date | Reviewer | Concern | Resolution | Hardening change |
|---|---|---|---|---|
| 2026-04 | External reviewer | Evidence thinness — claims about behavioral governance lacked numeric backing | Wave 1 commitment to grow the governance metrics table at every session close | Governance metrics table is the running record of measured outcomes |
| 2026-04 | External reviewer | Solo execution risk — single-founder operation is a single point of failure | Acknowledged. Routines accelerate the work; ruthless wave scoping limits surface; enterprise scaling path defined | Wave-scoped delivery; v3.0 enterprise extension exists but is honestly labeled as not yet field-proven |
| 2026-04 | External reviewer | Production proof — public README needs evidence and case studies before publication | Wave 2 commitment: public README leads with evidence table and case studies | Implementation status table in public README is the running honest accounting |
| 2026-04 | External reviewer | Meta-governance underspecified — what happens when governance itself fails? | Section 12 (Meta-Governance) added with eight failure-mode classes and recovery protocols | Meta-governance is its own concept document at `docs/control-plane/meta-governance.md` |
| 2026-04 | External reviewer | Governance vs safety conflation — the framework was being read as an AI safety system | Verbatim public statement clarifying that this framework is a behavioral accountability system, not an AI safety system | Public statement is reproduced in the root README; the layers (model safety / runtime policy / behavioral accountability) are kept distinct |
| 2026-04 | External reviewer | Failure modes underspecified — what fails first? | Resolved by Section 12 (Meta-Governance) | Eight failure-mode classes documented |
| 2026-04 | External reviewer | Twenty-three agents named before the first five are proven | Public repo publishes only the live agent roster at launch (five agents). No agent named with a trust score unless it has at least five sessions of data | The public agent roster is honest; aspirational agents are clearly labeled as future work |
| 2026-04 | External reviewer | D1-D4 calibration risk — noisy labels degrade the signal | Calibration anchors (Layer 1) and per-dimension evidence requirement (Layer 2) implemented; automated scoring routine deferred to Wave 3+ as a Layer 3 addition | Recorded as [ADR-0003](decision-records/0003-trust-scores-require-calibration.md); calibration anchors ship at v1.0 |
| 2026-04 | External reviewer | The public framework should not publish without measured data | Wave 2 commitment: case studies and a trust evolution chart required before publication, with a minimum of two failure-to-fix case studies | The reference implementation is the source of measured data; case studies are tracked in `examples/case-studies/` |

---

## Reading This Log

The log is intentionally adversarial in tone. Reviewers are quoted by
the kind of concern they raised, not by their own framing. Each
resolution is summarized at the level of the concrete change made — not
at the level of "we considered this carefully."

This is the form that makes the log useful. A future adopter who sees
something they disagree with in this architecture can check whether the
same concern was raised earlier and how it was resolved. If the same
concern was raised and addressed, the resolution is auditable. If it was
not raised, that is information too — it means the concern is new, and
worth a fresh round of review.

The log is updated when a new concern is raised by an external reviewer
and resolved by an architecture change. Internal restatements that do
not change architecture do not appear here.

---

## Related

- [decision-records/](decision-records/) — Architecture Decision Records
  for the resolutions that warranted their own ADR.
- The source architecture specification is private. The entries above
  are the public-extractable summary of its v10.1 / v10.2 / v10.3
  changelog.
