# Concepts

This directory holds the core mental models behind the Agentic Workforce Framework.
Read these before architecture or operating-model docs. The concepts define *what*
the framework is. Architecture defines *how* it fits together. The operating model
defines *how you actually run it*. The control plane defines *what enforces it*.

A concept file is short, durable, and answers one question: "what is this thing,
and why does the framework treat it this way?" It does not specify implementation
details, schemas, or operational procedures. Those live in their own directories.

---

## What a concept file is, vs everything else

| Doc Type | Question It Answers | Example |
|---|---|---|
| Concept | What is this idea, and why does it exist? | Trust scoring is a 100-point per-session signal across four dimensions. |
| Architecture | How does the system fit together? | The four-plane model places trust scoring in the autonomy plane. |
| Operating model | How does the workforce run day to day? | When to score a session, who scores, how evidence is captured. |
| Control plane | What mechanisms enforce policy at runtime? | Hooks, HITL gates, audit log, pre-spawn protocol. |

Concepts are the vocabulary. Everything else uses these terms with precise meaning.

---

## Reading order for new adopters

Read in this order. Each concept builds on the prior one.

### 1. [Agentic Workforce Model](agentic-workforce-model.md)

The agents-as-employees framing. Defines the four classifications (agent, service,
hybrid, routine) and the rule that one role maps to one persistent agent identity.
Establishes why every other concept exists: if you do not treat agents as accountable
workers, none of the trust, failure, or autonomy machinery is needed.

### 2. [Trust Scoring](trust-scoring.md)

The D1-D4 model. Each session gets a score across Correctness, Observability,
Compliance, and Recurrence. Trust scores accumulate per agent, with a confidence
band based on session count. Trust scores drive autonomy gates. Without calibration,
trust scoring drifts and loses signal.

### 3. [Failure Memory](failure-memory.md)

The 17-class failure taxonomy and how recurrence is detected. Failures are
structured records, not narratives. Agents read their own failure history before
spawning on a new task. Recurrence triggers escalation: two occurrences flag the
class, three add it to a benchmark, five force a systemic refactor.

### 4. [Autonomy Gates](autonomy-gates.md)

The five trust tiers (HIGH, STANDARD, RESTRICTED, PROBATION, PROVISIONAL) and
what each unlocks. Promotion rules, demotion triggers, and gate expansion protocol.
Trust tier is a control on what an agent can do without human review it is the
operational consequence of the trust score.

---

## Concepts in this directory

### [v1.0] shipped

| File | Summary |
|---|---|
| [agentic-workforce-model.md](agentic-workforce-model.md) | Agents-as-employees framing, classification rubric, role-agent alignment, universal hybrid rule. |
| [trust-scoring.md](trust-scoring.md) | D1-D4 scoring on a 100-point scale per session. Calibration anchors, confidence bands, hard-stop rules. |
| [failure-memory.md](failure-memory.md) | 17-class taxonomy, recurrence detection, pre-task retrieval, failure record lifecycle. |
| [autonomy-gates.md](autonomy-gates.md) | Five trust tiers, promotion and demotion rules, gate expansion protocol. |

### [v2.0] designed, not yet shipped

| File | Summary |
|---|---|
| [work-queues.md](work-queues.md) | Task lifecycle, queue states, assignment model, blocked resolution. |
| [approval-gate-chains.md](approval-gate-chains.md) | Gate types, chain composition, TTL rules, escalation paths. |

### [v3.0] designed, not yet field-proven

| File | Summary |
|---|---|
| [delegation.md](delegation.md) | Explicit-only delegation, re-delegation constraint, TTL enforcement, audit requirements. |

---

## How concepts relate to schemas and database tables

Each concept has a corresponding schema or table where the abstraction is made
concrete. The concept file tells you what the thing is. The schema tells you
how to encode it.

| Concept | Schema | Database Table |
|---|---|---|
| Trust scoring | `schemas/v1/trust-score.schema.json` | `trust_scores` |
| Failure memory | `schemas/v1/failure-record.schema.json` | `failure_records` |
| Agentic workforce model (task assignment) | `schemas/v1/agent-task-manifest.schema.json` | `work_queue_items` (v3.0) |
| QA loop (input to D1) | `schemas/v1/qa-verdict.schema.json` | `agent_events` |
| Autonomy gates | (no schema derived from trust score) | `agent_instances.trust_level` (v3.0) |

---

## How to use these concepts

A concept is useful in three places:

1. **Onboarding.** Hand a new operator the four v1.0 concept files and they have
   the vocabulary to read every other doc in the repo without confusion.
2. **Calibration.** When two scorers disagree on a D1-D4 score, the concept file
   plus the calibration anchor table is the tiebreaker. Drift is reduced when
   everyone reads the same concept.
3. **Adaptation.** When you adapt the framework to a different domain (legal,
   ops, support), start from the concepts and decide which are universal and
   which need translation. The 17-class failure taxonomy, for example, is a
   starting point you may rename, subset, or extend it. The trust-scoring
   four-dimension model is universal.

---

## What is intentionally not in these files

- No mention of any specific product, agent name, file path, or supplier from
  the private reference implementation.
- No code. Concepts are language-agnostic and runtime-agnostic.
- No schemas. Schemas live in `schemas/v1/`. Concepts reference them by name.
- No operational procedures. Those live in `docs/operating-model/`.

Concepts are the long-lived layer. They change rarely. Operational details
change with each implementation.

---

## See also

See also: [Controlled Learning Protocol](../operating-model/controlled-learning-protocol.md)
for how failure memory feeds into instruction evolution and trust scoring.
