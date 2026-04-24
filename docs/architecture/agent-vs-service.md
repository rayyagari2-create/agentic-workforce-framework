# Agent vs Service vs Hybrid vs Routine

The framework names four kinds of components: **agents**, **services**,
**hybrids**, and **routines**. The names are not interchangeable, and the
distinctions are not cosmetic. Each kind has different governance
treatment, different identity properties, and different write rules.

This document is the classification rubric. Use it when you are deciding
what to call a new component.

---

## The Rubric

| Kind | Reasoning | Identity | Trust History | Writes Canonical Truth |
|---|---|---|---|---|
| **Agent** | Yes — under uncertainty | Persistent | Yes — D1-D4 over sessions | Sometimes (per role) |
| **Service** | No — deterministic | Persistent | No | Yes — owns canonical tables |
| **Hybrid** | Yes — in reasoning subpart | Persistent | Per subpart | Only the persistence subpart writes |
| **Routine** | Light — short prompt | None — runs as user | None | Only `routine_runs` |

These four rows are the entire rubric. Anything else is a refinement of
one of these rows.

---

## Agent

An **agent** is a component that reasons under uncertainty, chooses among
options, has a persistent identity, and accumulates a trust history.

**Defining properties:**

- **Reasons under uncertainty.** An agent picks among options when the
  correct answer is not deterministic. The Orchestrator picks among
  routing options. The QA Agent classifies defects. The Fix Agent picks a
  remediation strategy.
- **Persistent identity.** An agent has an ID that survives across
  sessions. In v1.0 this is a string ID; in Wave 1 the AGT adapter adds a
  cryptographic DID.
- **Trust history.** An agent accumulates D1-D4 scores per session and
  carries an autonomy gate that expands or contracts based on
  demonstrated behavior. See [docs/concepts/trust-scoring.md].
- **Pre-spawn protocol applies.** Spawning an agent goes through the
  three-step pre-spawn decision tree.

**Examples in this framework:** Orchestrator, Frontend Agent, Backend
Agent, QA Agent, Fix Agent. Optional Wave 2 entries: Code Review Agent,
Boardroom.

**Write rules:** Agents write to their domain artifacts (code, test
results, handoff records). Agents never self-score — trust is
observer-assigned. Agents never write to `trust_scores`, `failure_records`,
or `audit_log` directly except through the designated owner.

---

## Service

A **service** is a component with deterministic logic, no reasoning, and
ownership of canonical truth.

**Defining properties:**

- **Deterministic.** Given the same input, the service produces the same
  output. There is no LLM-driven judgment.
- **Owns canonical truth.** A service is the sole writer to one or more
  canonical tables. Other components may read; only the service writes.
- **No trust history.** A service is not scored on D1-D4. Its correctness
  is verified by tests and by schema validation, not by behavioral trust.
- **Tightly schema-bound.** A service that drifts from its schema is a
  bug, not a behavioral incident.

**Examples in this framework:** Eval/Telemetry Service (the sole writer
to `trust_scores`), Deploy Service (executes defined deployment steps).

**Write rules:** A service is the only writer to its canonical table.
Cross-service writes are prohibited. A service does not pick up a task
from a queue — it is invoked directly through its API.

---

## Hybrid

A **hybrid** is a component whose reasoning is agent-shaped but whose
truth-handling must remain service-shaped. This is the most common
classification mistake in agent frameworks: treating a hybrid as one
unified thing produces components that reason and write at the same
time, which is exactly what causes governance failures.

**The universal hybrid rule:**

```
Reasoning layer:   may rank · infer · annotate · recommend
Persistence layer: exclusively owns writes · deterministic · schema-validated
Hard rule:         the reasoning layer NEVER writes to canonical tables directly
```

A hybrid has at least two internal subparts. The reasoning subpart
produces annotations, rankings, or recommendations. The persistence
subpart receives those outputs and applies them to the canonical store
through a deterministic, schema-validated path. The two subparts are
named separately in the component spec, and their write access is listed
explicitly.

**Why this matters:** Without an explicit sub-boundary, "hybrid" is a
hand-wave that hides whether the reasoning side or the deterministic
side owns the write. With an explicit sub-boundary, the answer is in the
component definition.

**Examples in this framework:** None at v1.0. Hybrids appear in the
private reference implementation's product layer, where reasoning
agents annotate offers or evidence and a deterministic persistence
layer applies the writes.

**Trust history:** The reasoning subpart of a hybrid is scored. The
persistence subpart is verified by tests. They are separate.

---

## Routine

A **routine** is short-lived, trigger-driven, stateless, and has no
identity of its own.

**Defining properties:**

- **Trigger-driven.** Schedule, API, or GitHub event. Three trigger
  types, documented in `routines/README.md`.
- **Stateless.** Each run is a new session with no accumulated context.
- **No persistent identity.** A routine runs as the invoking user's
  identity. There is no AGT DID for the routine itself.
- **No trust history.** A routine is not scored on D1-D4. Output review
  by a human (or by a higher-tier agent) replaces the pre-spawn protocol.
- **Writes only to `routine_runs`.** No exceptions. A routine that
  computes a trust scoring payload sends it to the Eval/Telemetry Service;
  the Service writes the score. The routine writes the run record.

**Examples in this framework:** R1 PR Test (Playwright on every PR), R4
Security Scan (sensitive data scan on every PR). Future: R10 Nightly
Trust Score (Wave 3+), R11 Alert Triage (Wave 3+).

**Write rules:** Routines write to `routine_runs` and nothing else.
This is the most aggressively enforced rule in the framework. See
[ADR-0002](decision-records/0002-routines-are-not-agents.md).

---

## Decision Tree

When you are deciding what to call a new component, walk through these
questions in order. The first "no" tells you what kind of component it is.

```
Is this trigger-driven (cron, API, GitHub event), stateless, no identity?
├── Yes → ROUTINE
└── No
    │
    Does it reason under uncertainty?
    ├── No → SERVICE
    └── Yes
        │
        Does it also need to write to canonical tables?
        ├── No  → AGENT
        └── Yes → HYBRID
                  │
                  Did you define the reasoning subpart and the persistence
                  subpart separately, with explicit write access per subpart?
                  ├── Yes → Valid hybrid
                  └── No  → Not a valid hybrid yet — define the sub-boundary
                            before classifying
```

The decision tree is strict. A "kind of agent that also writes to a
schema-bound table" is not a category — it is a hybrid that has not been
specified yet.

---

## Tabular Decision Reference

| Question | Agent | Service | Hybrid | Routine |
|---|---|---|---|---|
| Reasons under uncertainty? | Yes | No | Yes (reasoning subpart) | Light, short prompt |
| Has persistent identity (DID)? | Yes | Yes | Yes | No (runs as user) |
| Has D1-D4 trust history? | Yes | No | Reasoning subpart only | No |
| Pre-spawn protocol applies? | Yes | No | Yes | No (output review instead) |
| Writes to canonical table? | Per role, narrow | Yes — owns it | Persistence subpart only | Only `routine_runs` |
| Long-running session? | Yes | Yes | Yes | No — short, stateless |
| Failure memory tracked? | Yes | No | Reasoning subpart | No |
| Promotion / demotion possible? | Yes | No | Per subpart | No |

---

## Why This Distinction Matters

In a framework that does not separate these kinds:

- Routines accumulate trust scores no one trusts, because they have no
  history and no identity.
- Hybrids end up writing to canonical tables from their reasoning loop,
  which produces silent data corruption.
- Services drift from their schemas because they are mistaken for agents
  and given "judgment latitude."
- Agents lose their trust history because every component is treated as
  a fresh tool call.

In a framework that does separate them:

- Each kind has the governance treatment that fits its risk profile.
- The write rules are obvious — for any given table, exactly one
  component writes to it.
- Trust scoring stays meaningful, because it is applied only where
  reasoning under uncertainty is happening.
- Routines stay lightweight, because they are not trying to be agents.

The classification is what allows the rest of the framework — the
schemas, the audit log, the autonomy gates — to be precise.

---

## Related

- [agent-roster.md](agent-roster.md) — The five agents at v1.0, classified.
- [ADR-0002](decision-records/0002-routines-are-not-agents.md) —
  Why routines are not agents.
- `docs/concepts/agentic-workforce-model.md` — The agents-as-employees
  framing.
