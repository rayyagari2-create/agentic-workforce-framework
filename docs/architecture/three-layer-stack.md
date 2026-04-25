# The Three-Layer Infrastructure Stack

This framework is one of three governance and operations layers that
operate together when you run autonomous agents in production. Each
layer governs a distinct concern. None of the layers replaces the
others, and none of them is sufficient on its own.

This document explains what each layer governs, how they complement one
another, and where the protocol roles (MCP and A2A) fit into the stack.

---

## 1. The Three Layers

| Layer | Technology | What It Governs |
|---|---|---|
| **Runtime governance** | Microsoft AGT | What agents can do — identity, policy, sandboxing |
| **Scheduled automation** | Claude Code Routines | When lightweight tasks run — scheduled, event-triggered |
| **Behavioral accountability** | Agentic Workforce Framework | Whether agents can be trusted — trust over time, failure memory |

These three layers are complementary. AGT and Routines are external
infrastructure operated by their respective vendors. The behavioral
accountability layer is the framework you are reading.

---

## 2. Runtime Governance — What Agents Can Do

The runtime governance layer answers the question: *what is this agent
permitted to do right now, in this call, with these inputs?*

It enforces identity, policy, and sandboxing at sub-millisecond
latency, deterministically, with no model inference in the hot path.
It produces an append-only, cryptographically chained audit log of
every permission check.

**Today, the canonical implementation is Microsoft AGT** (April 2026,
MIT-licensed). AGT provides:

- DID-based agent identity with Ed25519 cryptographic signing.
- Sub-millisecond deterministic policy enforcement, 0.00% bypass rate.
- Five-level execution sandboxing.
- OWASP top-10 coverage with 9,500+ tests.
- Append-only audit trail, cryptographically chained.
- Protocol bridges (A2A, MCP, IATP).
- Control evidence supporting EU AI Act, NIST AI RMF, HIPAA, SOC 2.

**Operating modes:**

| Mode | Behavior | When |
|---|---|---|
| Shadow | Intercepts, logs, does not block | During rollout; calibration |
| Enforce | Intercepts and blocks — production default | After shadow validation |
| Degraded (unavailable) | Falls back to OS-level hooks, alerts operator | AGT outage |

The runtime governance layer is binary: a request is permitted or it is
not. There is no concept of "permitted with low trust" at this layer.
Trust does not enter the runtime decision.

**Adapter pattern:** This framework expects an adapter (e.g.,
`agtAdapter.js`) that wraps the AGT SDK. Internal callers never reach
AGT directly. The adapter absorbs SDK breaking changes and provides a
single integration surface for permission checks.

---

## 3. Scheduled Automation — When Tasks Run

The scheduled automation layer answers the question: *what work should
happen on a schedule, on an event, or in response to an external
signal?*

It runs short-lived, stateless, trigger-driven jobs on cloud
infrastructure. It is the right home for the recurring work that sits
around the agent system: nightly checks, PR scans, alert triage,
deploy verification.

**Today, the canonical implementation is Claude Code Routines.** A
Routine is a saved configuration — a prompt, one or more repositories,
and a set of MCP connectors — packaged once and executed automatically
on Anthropic-managed cloud infrastructure.

**Three trigger types:**

- **Schedule.** Recurring cadence (hourly, daily, weekdays, weekly, or
  custom cron). Minimum interval: 1 hour.
- **API.** Dedicated HTTP endpoint per Routine. POST with bearer token
  starts a new session.
- **GitHub.** Repository events (pull request opened/synchronized,
  release events). Requires the GitHub App installed on the repository.

A single Routine can combine all three trigger types.

**Routines are not full agents.** They are stateless per run, run as
the invoking user's identity, and accumulate no D1-D4 trust history.
Output review by a human (or a higher-tier agent) replaces the
pre-spawn protocol. They write only to a routine-runs log; they never
write to canonical truth tables directly.

A routine that needs to compute a trust scoring payload sends that
payload to the Eval/Telemetry Service — the service is the only writer
to `trust_scores`. Routines never write to `trust_scores` directly. No
exceptions.

**Cap management:** The Routines tier has a daily run cap. To prevent
every external PR from consuming the cap, GitHub-trigger Routines are
filtered to claude-prefixed branches only.

---

## 4. Behavioral Accountability — Whether Agents Can Be Trusted

The behavioral accountability layer answers the question: *over time,
is this agent becoming more trustworthy or less? And how should that
change what we let it do unsupervised?*

It is the layer the public framework occupies. It governs:

- **D1-D4 trust scoring** per session, with calibration anchors and a
  one-line evidence requirement per dimension.
- **Trust tiers** (HIGH, STANDARD, RESTRICTED, PROBATION,
  PROVISIONAL) that gate autonomy at the work-routing layer.
- **Failure memory** — a structured taxonomy of past failures, with
  pre-task retrieval and recurrence escalation.
- **Pre-spawn protocol** — `/debug → /spec → /plan → HITL → SPAWN` —
  applied before any agent is dispatched on non-trivial work.
- **HITL gates** — human-in-the-loop checkpoints classified by risk
  level (LOW / MEDIUM / HIGH / CRITICAL).
- **Build state machine** — eight states, no skipping, agents never
  commit without human approval.

This layer is observer-assigned. No agent self-scores. Trust is
recorded by the QA Agent and the human reviewer; failure records are
written by the Fix Agent; the Eval/Telemetry Service is the only
writer to `trust_scores` (Wave 3+).

The behavioral layer is what makes the agents-as-employees model real
rather than metaphorical. An agent has a job description (its
capability boundary), a performance review (D1-D4), a personnel file
(its trust history and failure records), and an autonomy gate that
expands or contracts based on demonstrated behavior.

---

## 5. How the Layers Complement One Another

The three layers govern orthogonal concerns. Each is necessary; none
is sufficient.

**Runtime governance without behavioral accountability:**
A perfectly enforced policy with no signal about whether the agent is
becoming more or less reliable over time. Eventually you either let
risky agents run anyway (because policy doesn't capture the
trajectory) or you set policy so conservatively that nothing
useful runs unsupervised.

**Behavioral accountability without runtime governance:**
A trust score that nobody enforces. The agent earns HIGH trust over
twenty sessions, then exfiltrates a secret on session twenty-one
because nothing was actually preventing the action. The trust score
described what was happening; it did not prevent what shouldn't.

**Either of the above without scheduled automation:**
You have a governance system but no infrastructure for the recurring
work that sits around it — the nightly checks, the PR scans, the
alert triage. You end up running a build agent when you should be
running a routine, and the build agent's expensive governance overhead
gets applied to work that does not warrant it.

**All three together:**
AGT decides whether the action is permitted (now). The framework
records whether the agent is becoming more or less trustworthy (over
time) and gates its autonomy accordingly. Routines handle the
scheduled and event-triggered work that does not need a full agent.
Each layer can change without forcing changes in the others, because
their concerns are separate.

---

## 6. Protocol Roles — MCP and A2A

Two protocols cross all three layers. They are complementary, not
competing.

| Protocol | Role | Layer it Sits In |
|---|---|---|
| **MCP** (Model Context Protocol) | Intelligence gathering — read external sources | Intelligence layer |
| **A2A** (Agent-to-Agent) | Execution — agent spawning, task handoff | Execution layer |

**MCP fills context.** When an agent needs to read from a database,
hit a third-party API, or pull repository state, MCP is the protocol
that brokers the read. MCP connections are configured per workspace
and per Routine; AGT mediates the permission checks at the runtime
governance layer.

**A2A executes work.** When the Orchestrator dispatches a task to an
executing agent, the dispatch goes through A2A. AGT registers the
spawned agent's identity at spawn time. The behavioral layer applies
the pre-spawn protocol before A2A is invoked.

The two protocols sit at different points in the request flow:

```
[ behavioral layer ] →   pre-spawn protocol decides whether to dispatch
[ A2A ]              →   the dispatch happens
[ AGT ]              →   permission check on the spawn
[ MCP ]              →   the spawned agent reads its context
[ AGT ]              →   permission check on each MCP read
[ work executes ]
[ A2A ]              →   handoff back to Orchestrator
[ behavioral layer ] →   QAVerdict, trust score, failure record
```

A request that fails AGT's check at any step is blocked at runtime,
regardless of trust score. A request that succeeds at AGT but
produces a poor outcome contributes to D1-D4 and the trust trajectory
at the behavioral layer.

For deeper detail on MCP and A2A patterns, see
[mcp-a2a-integration.md](mcp-a2a-integration.md).

---

## 7. Layer Ownership

| Layer | Owner | Public Framework Stake |
|---|---|---|
| Runtime governance | Microsoft (AGT) — open source, MIT | Adapter pattern only |
| Scheduled automation | Anthropic (Claude Code Routines) | Adapter + R1 / R4 templates |
| Behavioral accountability | This framework | Full ownership |

The public framework defines the behavioral layer end-to-end. It
defines the integration *patterns* for the other two layers — adapters,
expected interfaces, write-rule discipline — without owning the
underlying implementations.

This is intentional. AGT and Routines move on their own release
schedules. The framework absorbs their change rate through adapters,
which is the same pattern this framework recommends for any external
dependency.

---

## Related

- [mcp-a2a-integration.md](mcp-a2a-integration.md) — MCP and A2A in detail.
- [agent-vs-service.md](agent-vs-service.md) — Component classification.
- `docs/concepts/trust-scoring.md` — D1-D4 trust scoring.
