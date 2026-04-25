# Agent vs Service Classification

The framework names four kinds of components: **agents**, **services**,
**hybrids**, and **routines**. The names are not interchangeable, and the
distinctions are not cosmetic. Each kind has different governance
treatment, different identity properties, and different write rules.

This document is the classification rubric. Use it when you are deciding
what to call a new component.

---

## 1. The Rubric

**Agent:** reasons under uncertainty, chooses among options, benefits from
trust scoring.

**Service:** deterministic logic, owns canonical truth, tightly
policy/schema-bound.

**Hybrid:** reasoning is agentic; truth-handling must remain service-like.

**Routine:** short-lived, trigger-driven, stateless per-run not a
long-running agent.

| Kind | Reasoning | Identity | Trust History | Writes Canonical Truth |
|---|---|---|---|---|
| **Agent** | Yes under uncertainty | Persistent | Yes D1-D4 over sessions | Sometimes (per role) |
| **Service** | No deterministic | Persistent | No | Yes owns canonical tables |
| **Hybrid** | Yes in reasoning subpart | Persistent | Per subpart | Only the persistence subpart writes |
| **Routine** | Light short prompt | None runs as user | None | Only `routine_runs` |

These four rows are the entire rubric. Anything else is a refinement of
one of these rows.

---

## 2. Framework Plane Classification

Every framework-plane component carries one of these four classifications.
The classification is fixed when the component is named. Reclassifying
a component is a non-trivial governance event it implies the
write-access boundary is changing.

| Name | Classification | Reason |
|---|---|---|
| Orchestrator | Agent | Reasons about task routing, risk, spawn decisions |
| QA Agent | Agent | Reasons about defect classification, novelty, escalation |
| Fix Agent | Agent | Reasons about root cause, fix strategy, prevention |
| Code Review Agent | Agent | Reasons about code quality, contract stability, risk |
| Security Check Agent | Agent | Reasons about security posture and violation severity |
| Boardroom Agent | Agent | Reasons about escalation decisions, agent retirement |
| Deep Research Agent | Agent | Reasons over evidence, produces synthesis |
| Chief of Staff Agent | Agent | Reasons about session state, task prioritization |
| Frontend Agent | Agent | Exercises judgment on complex frontend changes |
| Backend Agent | Agent | Exercises judgment on complex server-side changes |
| Evolve Service | Service | Applies approved changes mechanically no discretion |
| Eval/Telemetry Service | Service | Computes trust scores from defined inputs deterministic |
| Deploy Service | Service | Executes defined deployment steps deterministic |
| Routines (framework plane) | Routine | Short-lived, trigger-driven, stateless |

The framework plane v1.0 contains 10 Agents, 3 Services, and Routines.
Hybrids are not present at the framework plane in v1.0 they appear in
reference implementations that ship a product layer on top of the
framework.

---

## 3. Hybrid Sub-Boundary Rule

A "hybrid" without a precise internal split is a hand-wave. The
classification carries weight only when the component spec defines
exactly which subpart reasons and which subpart owns writes.

A hybrid has at least two internal subparts:

- **Reasoning subpart.** Agent-shaped. Produces annotations, rankings,
  recommendations, or routing decisions. Its outputs are advisory.
  Its outputs are scored on D1-D4. It has no direct write access to
  canonical tables.
- **Persistence subpart.** Service-shaped. Receives the reasoning
  subpart's outputs and applies them to canonical storage through a
  deterministic, schema-validated path. It is the only writer to its
  canonical tables.

Both subparts are named separately in the component spec, and each
subpart's write access is listed explicitly. Without that explicit
sub-boundary, the component is not a valid hybrid yet it is an
under-specified component that needs to be further decomposed before
classification.

**Generic sub-boundary template:**

| Subpart | Type | Owns | Write Access |
|---|---|---|---|
| Source / option selection | Agent-shaped | Which sources to call, order, fallback | None decisions only |
| Evidence / confidence evaluation | Agent-shaped | Weighting freshness, source reliability, contradictions | None annotation only |
| Normalization | Deterministic service | Raw payload → internal schema | Writes to canonical table |
| Cache / freshness tracking | Deterministic service | Freshness metadata, expiry, invalidation | Writes metadata fields only |

Every hybrid component spec must instantiate this template with the
component's specific subparts and tables. A hybrid without an
instantiated template is incomplete.

---

## 4. Universal Hybrid Rule

This rule applies to every hybrid component, without exception:

```
Reasoning layer:   may rank · infer · annotate · recommend
Persistence layer: exclusively owns writes · deterministic · schema-validated
Hard rule:         the reasoning layer NEVER writes to canonical tables directly
```

The reasoning layer of a hybrid never writes to a canonical table. Its
outputs flow through the persistence layer, which validates them
against the schema and applies them through the deterministic write
path. This is the difference between a hybrid that holds together under
production load and a "hybrid" that is really an agent with database
credentials.

If the reasoning subpart and the persistence subpart are not separated —
in code, in process, in identity, and in write-access the component
is not a hybrid. It is an agent with a write side, which is the
classification mistake the rubric exists to prevent.

---

## 5. Decision Tree

When you are deciding what to call a new component, walk through these
questions in order. The first answer that resolves tells you what kind
of component it is.

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
                  └── No  → Not a valid hybrid yet define the sub-boundary
                            before classifying
```

The decision tree is strict. A "kind of agent that also writes to a
schema-bound table" is not a category it is a hybrid that has not been
specified yet.

---

## 6. Tabular Decision Reference

| Question | Agent | Service | Hybrid | Routine |
|---|---|---|---|---|
| Reasons under uncertainty? | Yes | No | Yes (reasoning subpart) | Light, short prompt |
| Has persistent identity (DID)? | Yes | Yes | Yes | No (runs as user) |
| Has D1-D4 trust history? | Yes | No | Reasoning subpart only | No |
| Pre-spawn protocol applies? | Yes | No | Yes | No (output review instead) |
| Writes to canonical table? | Per role, narrow | Yes owns it | Persistence subpart only | Only `routine_runs` |
| Long-running session? | Yes | Yes | Yes | No short, stateless |
| Failure memory tracked? | Yes | No | Reasoning subpart | No |
| Promotion / demotion possible? | Yes | No | Per subpart | No |

---

## 7. Why This Distinction Matters

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
- The write rules are obvious for any given table, exactly one
  component writes to it.
- Trust scoring stays meaningful, because it is applied only where
  reasoning under uncertainty is happening.
- Routines stay lightweight, because they are not trying to be agents.

The classification is what allows the rest of the framework the
schemas, the audit log, the autonomy gates to be precise.

---

## Related

- [agent-roster.md](agent-roster.md) Framework plane roster, classified.
- [decision-records/0002-routines-are-not-agents.md](decision-records/0002-routines-are-not-agents.md) —
  Why routines are not agents.
