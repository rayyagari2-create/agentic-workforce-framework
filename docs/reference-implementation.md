# Reference Implementation

This framework was extracted from a private reference implementation that has
been operating in single-workspace mode for a sustained period. The framework
is "production-informed": every concept here was tested against real agent
sessions, real failures, and real recoveries before being published.

This document describes the reference implementation in sanitized form. It
exists to back the "production-informed" claim with concrete capability
status — what is live, what is partial, what is designed but not yet shipped.
It does not include product-specific flows, supplier integrations, or any
private repository paths.

---

## Deployment shape

**Single-workspace.** One operator. One repository. One set of agents.
The entire framework was built and exercised inside this single workspace
before any extension to multi-team scale was attempted. Multi-workspace and
enterprise scaling are designed extensions — not yet field-proven.

**File-based governance, migrating to Postgres.** Trust scoring, failure
memory, bulletins, and locks all started as file-based artifacts in the
private repository. The Postgres governance schema is live (tables created,
constraints in place) but production data is still being written to files
during the migration.

**Operator-in-the-loop scoring.** D1-D4 scoring is performed manually at
session close. Automated trust scoring (R10-style routines that send a
payload to a telemetry service for D1-D4 computation) is designed but not
yet implemented. Every score in the reference implementation has a human
evidence line attached to it.

---

## The five-agent team

The reference implementation runs a five-agent team. These are the only
agents with sufficient session history to support a trust tier claim.

| Role | Classification | What It Does |
|---|---|---|
| Orchestrator | Agent | Routes tasks, makes spawn decisions, coordinates session-level state, runs the pre-spawn protocol. |
| Frontend Agent | Agent | Owns frontend file scope. Renders, verifies, and revises UI changes within a declared boundary. |
| Backend Agent | Agent | Owns server-side file scope. Implements API and persistence-layer changes within a declared boundary. |
| QA Agent | Agent | Produces structured QAVerdicts after each task. Flags failures, generates D1 evidence input. |
| Fix Agent | Agent | Investigates root cause, writes FailureRecords, owns recurrence-count tracking. |

All five are at HIGH tier on the most recent scoring window. The frontend
and backend agents reached HIGH after the reference implementation accumulated
enough sessions to clear MEDIUM confidence band. The orchestrator was at
RESTRICTED briefly during an instruction-file regression and recovered to
HIGH over three subsequent sessions — a documented promotion-recovery cycle
that informed the demotion and recovery rules in
[concepts/autonomy-gates.md](concepts/autonomy-gates.md).

---

## Capability status

Honest accounting. No mixing of current state with target state.

| Capability | Status |
|---|---|
| Single-workspace orchestrator model | Live. Running in private reference implementation. |
| D1-D4 trust scoring | Live. Manual scoring with evidence line per dimension. 15+ sessions completed. |
| Failure memory | Live. File-based, 17-class taxonomy. Recurrence detection working — multiple recurrence escalations have fired and produced fixes. |
| Hook enforcement | Live. Local runtime. 13 hooks across pre-tool-use and post-tool-use boundaries. Fail-closed by default. |
| AGT-style runtime policy adapter | Shadow mode live. The adapter intercepts and logs but does not yet block. Enforcement-mode promotion is pending shadow validation. |
| Postgres governance schema | Schema live. Tables, constraints, and indexes are in place. Data migration from file-based to Postgres is in progress. |
| R1 PR test routine | Designed. Template published. Not yet running on the reference repo. |
| R4 security scan routine | Designed. Template published. Not yet running on the reference repo. |
| Automated trust scoring (R10-style) | Designed. Held until shadow-mode validation completes and the Eval/Telemetry write-rule is enforced. |
| Enterprise multi-workspace model | Designed. Schema published. Not yet field-proven at multi-team scale. |
| Approval gate chains | Designed. Schema published. Single-operator model has not exercised the full chain. |

The pattern: anything labeled "live" has run in production sessions and
produced observable governance value. Anything labeled "designed" has a
schema, a documented protocol, or a template — but has not been exercised
under real load. The framework is honest about this distinction because
governance claims that are not field-proven are governance fiction.

---

## What the reference implementation has measured

The framework's core claims are backed by reference implementation observations:

- **Trust scoring discriminates.** The same agent has scored 100/100 on a
  novel task and scored below 60 on a regression. The score reflected the
  difference. The autonomy gate fired or did not fire accordingly.
- **Failure memory prevents recurrence.** A documented failure class that
  re-occurred three times triggered the systemic-refactor-required tag,
  and the structural fix that followed eliminated the class. Pre-task
  retrieval has demonstrably caused agents to recognize and avoid recurring
  patterns.
- **Hooks block what they should block.** The fail-closed default has
  produced false positives (legitimate work briefly blocked) — those are
  filed as evolution items and resolved by tightening hook logic, not by
  loosening fail-closed semantics. The hook system has never silently
  permitted an action it should have blocked.
- **Shadow-mode adapter catches what enforcement-mode would catch.** Shadow
  logs are reviewed at session close. The adapter has detected policy
  violations that would have been blocked in enforcement mode. This is the
  validation evidence required before promoting to enforce.

---

## What is intentionally not public

The reference implementation contains material that is private and will remain
so. Each category has a specific reason.

### Product-specific flows

Domain-specific runtime pipelines (the agent flows that produce the actual
product output) are not public. They are not framework concepts; they are
business logic. Including them would dilute the framework with material
that does not generalize.

### Patent-specific scoring logic

The reference implementation contains scoring logic that is patent-protected
and commercially significant. The framework's trust-scoring D1-D4 model is
generic and public. The product's user-facing scoring is private. The
distinction is enforced: no patent-protected formulas appear in any public
file.

### Commercial pricing, payment, and entitlement flows

These are product business logic. They have governance implications that
the framework captures generically (entitlement_bypass and payment_bypass
are two of the seventeen failure classes), but the actual implementation
is private.

### Real file paths and private repo names

Every public reference uses placeholders: `[PROJECT_REPO]`, generic domain
names (`billing`, `search`, `content`), and template path patterns. No
public file contains the real paths or names from the reference implementation.

### Real agent instruction files

The instruction files for the five agents in the reference implementation
contain product-specific scope, product-specific failure patterns, and
product-specific tool boundaries. Public examples in this repository use
generic capability boundaries that demonstrate the structure without
exposing the content.

### Supplier and integration economics

Any third-party integration in the reference implementation has commercial
terms, rate limits, and pricing tied to it. None of that material is
public. The framework's MCP and A2A integration concepts are abstract;
the specific integrations are private.

---

## Why publish the framework if the implementation is private

The framework and the implementation are two different artifacts.

The framework is a set of concepts, schemas, and patterns. It is generic by
construction. Anyone with autonomous agents can adopt it, adapt it, and
extend it. The framework is what was extracted, sanitized, and published.

The implementation is the application of the framework to one specific
product. It contains business logic, pricing, supplier relationships,
patent-protected scoring, and product-specific flows. None of this generalizes.
Publishing it would mix two layers of value — the abstract framework and the
specific product — and damage both.

The framework benefits from being shared: it gets adopted, critiqued,
extended, and stress-tested by other operators. The implementation does
not benefit from being shared and would lose competitive value if exposed.
Drawing the line between them is the entire point of the public extraction
exercise documented in this repository.

---

## What you can replicate from this document

If you want to validate the framework against your own agents, the
reference implementation suggests a minimum viable adoption path:

1. **Define five agent roles.** Orchestrator, two executing agents, QA, Fix.
   This is the smallest team that exercises every framework concept.
2. **Score one session manually with full evidence.** D1-D4 with one line
   of evidence per dimension. Confidence band PROVISIONAL.
3. **Write one FailureRecord on a real failure.** Use the schema. Fill every
   required field. Set fixTag based on whether you produced a prevention
   artifact.
4. **Wait for a recurrence.** When a failure class fires twice, observe what
   the auto-promotion rule does for your team. This is the pivotal moment
   that proves whether failure memory is operational or theatrical.
5. **Promote one agent to HIGH.** Five sessions of consistent ≥ 90 scores,
   confidence band MEDIUM. Observe what happens to the operator's review
   workload after promotion. The visible reduction is the framework's
   value proposition.

The reference implementation passed each of these stages in order. The
framework as published is what survived that process.

---

## Cross-references

- Framework overview: `README.md` (repo root)
- Concept index: [concepts/README.md](concepts/README.md)
- Schemas: `schemas/v1/`
- Calibration: `calibration/`
- Hooks (sanitized examples): `hooks/`
- Database (governance schema): `database/governance/`
- Enterprise extension (designed, not field-proven): `database/enterprise/`
