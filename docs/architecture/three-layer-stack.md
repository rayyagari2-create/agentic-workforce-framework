# The Three-Layer Governance Stack

This framework is one of three governance layers that operate together when
you run autonomous agents. Each layer governs a distinct concern. None of
the layers replaces the others, and none of them is sufficient on its own.

This document explains what each layer governs, where the responsibilities
sit, and why the boundaries are drawn the way they are.

---

## The Three Layers

| Layer | Technology Class | What It Governs |
|---|---|---|
| **Runtime policy layer** | AGT-style identity + policy + sandboxing (e.g., Microsoft AGT) | What agents are **permitted** to do |
| **Scheduled automation** | Routines (e.g., Claude Code Routines) | **When** lightweight tasks run |
| **Behavioral accountability** | This framework | Whether agents **can be trusted** to do it |

Read the table top to bottom. The runtime policy layer is the most
granular: per tool call, per file, per network request. The automation
layer is the most periodic: scheduled checks, event triggers. The
behavioral accountability layer is the longest-running: trust earned over
sessions, failure memory accumulated over time.

---

## Layer 1 — Runtime Policy Layer

**Class:** AGT-style runtime policy enforcement. The reference
implementation uses Microsoft AGT in shadow mode. Other policy layers
exist; the framework is designed to sit above any of them.

**What it governs:**

- **Identity.** Each agent has a cryptographic DID. Tool calls are signed.
- **Policy.** YAML or rule-driven policy decides whether a given tool call
  is permitted given the agent's role, the file in scope, and the
  workspace context.
- **Sandboxing.** Permission levels constrain what an agent can read,
  write, and execute.
- **Audit.** Append-only, cryptographically chained log of every policy
  decision.
- **Protocol bridges.** Adapters for A2A, MCP, IATP.

**Cadence:** Sub-millisecond. Every tool use is a policy decision.

**What it does not govern:** The runtime policy layer does not know
whether the agent is good at its job. It only knows whether the agent is
allowed to attempt the action. An agent that has failed seventeen times
in a row is still permitted to try the same tool call, as long as
policy allows it. That is by design — the policy layer is a deterministic
gate, not a behavioral judgment.

**Operating modes:**

- *Shadow.* Intercepts and logs, does not block. Used during validation.
- *Enforce.* Intercepts and blocks. The production default.
- *Degraded.* Falls back to OS-level hooks if the policy layer is
  unavailable. Alerts the operator.

---

## Layer 2 — Scheduled Automation

**Class:** Routines — saved configurations of prompt + repos + MCP
connectors that fire on schedule, API call, or GitHub event.

**What it governs:**

- **When** lightweight, repeatable, unattended tasks run.
- **Filter rules** — for example, a GitHub-triggered Routine that only
  runs on `claude/`-prefixed branches to avoid consuming the daily cap on
  external PRs.
- **The narrow contract** that Routines write only to `routine_runs` and
  surface output for human review.

**Cadence:** Trigger-driven. Cron, API, or repository event.

**What it does not govern:** A Routine cannot reason about whether an
agent should be promoted. It cannot block a tool call. It cannot enforce
a HITL gate. Routines are work, not governance — they are the
"scheduled tasks" of the agent workforce, not its supervisors.

**Why it is its own layer:** Scheduled automation is qualitatively
different from agent work. The Orchestrator + QA loop is too stateful and
too governance-heavy to run on a cron timer. Routines fill the gap where
short, stateless, repeatable tasks need to happen unattended. Putting
them in their own layer keeps that distinction visible.

See [ADR-0002](decision-records/0002-routines-are-not-agents.md) for the
full rationale on routines vs agents.

---

## Layer 3 — Behavioral Accountability (This Framework)

**Class:** The Agentic Workforce Framework. Identity, trust scoring,
failure memory, autonomy gates, pre-spawn protocol, HITL gates, and the
operating model that wraps all of those.

**What it governs:**

- **Identity over time.** Persistent agent identity across sessions.
- **Trust history.** D1-D4 scoring per session, accumulated.
- **Failure memory.** 17-class taxonomy, recurrence detection, pre-task
  retrieval — agents check their own failure history before starting.
- **Autonomy gates.** HIGH / STANDARD / RESTRICTED / PROBATION /
  PROVISIONAL. The gate widens or narrows based on demonstrated
  behavior.
- **Pre-spawn protocol.** A three-step decision tree before any agent
  spawns.
- **HITL gates.** Human-in-the-loop approval chains, with TTL-bounded
  delegation and 3-strike escalation.
- **Failure-to-prevention pipeline.** Every failure produces a
  prevention rule that the next pre-spawn check enforces.

**Cadence:** Per session for trust scoring. Per task for pre-spawn and
HITL gates. Per incident for failure records.

**What it does not govern:** This framework does not enforce policy at
the tool-call level. That is Layer 1's job. This framework does not run
scheduled work. That is Layer 2's job. This framework does not produce
agent output. That is the workforce plane within this framework's own
architecture.

**Why it is its own layer:** Behavioral accountability is the layer
agent frameworks usually skip. Most teams have a runtime policy layer (or
will get one). Most teams have scheduled automation (or will get it).
What is missing is the layer that asks: *Is this agent becoming more or
less trustworthy over time? Should it be doing this task at all, given
its history?* That question requires identity, evidence, and a
long-running trust signal. That is what this framework provides.

---

## How the Layers Complement

A practical example, walking through how the layers cooperate on a
single task:

1. The Orchestrator decides to spawn a Backend Agent on a task that
   touches `server/auth/`.
2. **Layer 3 (this framework) — pre-spawn protocol** runs first. The
   Backend Agent's trust tier is checked against the task's risk
   classification. The failure library is queried for prior incidents in
   `server/auth/`. The pre-spawn protocol decides whether to /spec, /plan,
   or escalate to a Boardroom session.
3. **Layer 1 (runtime policy)** registers the Backend Agent's identity
   for this session. Policy rules decide which tool calls are permitted
   for this agent in this workspace.
4. The Backend Agent works. Every tool call goes through **Layer 1**,
   which permits or blocks based on policy.
5. **Layer 2 (scheduled automation)**, on the resulting PR, fires the
   R1 PR Test Routine and the R4 Security Scan Routine. Output is posted
   to the PR for human reviewer review.
6. The QA Agent verifies. **Layer 3** records the QA Verdict and writes
   the D1-D4 trust score for this session.
7. At session close, **Layer 3** evaluates whether the trust tier should
   change.

Each layer fired at its own cadence. None of them tried to do another
layer's job. The result is an audit trail across all three layers that
combines: identity (who), policy decision (whether allowed), trust score
(how well), failure records (what went wrong), and routine runs (what
checks passed).

---

## What Each Layer Does Not Do

Equally important: what each layer is **not** responsible for.

| Layer | Does Not Do |
|---|---|
| Runtime policy layer | Long-running trust signals. Agent retirement. Pre-task failure retrieval. |
| Scheduled automation | Block tool calls. Score agents. Spawn agents. Write to governance tables (other than `routine_runs`). |
| Behavioral accountability (this framework) | Per-tool-call enforcement. Cryptographic identity. Sandboxing. Network policy. |

Each row is a real source of confusion in adoption. A team that expects
the runtime policy layer to give them trust history ends up
re-implementing trust history at the policy layer — badly. A team that
expects this framework to enforce per-tool-call policy ends up writing
hooks that duplicate what AGT already does. Read the table, then read it
again.

---

## Why None Replaces the Others

A common misconception is that a sufficiently powerful runtime policy
layer makes behavioral accountability unnecessary. It does not. Here is
why.

**Policy enforcement is per-action.** It says yes or no to a single
tool call given the current state. It does not look across sessions.
A perfectly enforced policy still permits an agent that has failed
seventeen times to try the same thing again — because policy does not
encode "this agent is bad at this kind of task."

**Trust history is per-agent over time.** It says: this agent has done
this kind of work fifteen times. It has succeeded thirteen times and
failed twice. Both failures involved a recurring pattern that is now
recorded in the failure library. The autonomy gate has narrowed
accordingly. The next task it picks up at HIGH risk will require human
approval — not because policy says so, but because behavior says so.

**Scheduled automation is for the work around the work.** Tests,
scans, alerts, reports. It is not where governance lives.

The three layers are orthogonal. Each captures a kind of signal the
others cannot capture cleanly. Combining all three is what makes
autonomous agent operation safe at scale.

---

## Reference Implementation Status

The reference implementation runs:

| Layer | Status |
|---|---|
| Runtime policy layer | Microsoft AGT in shadow mode. Enforcement mode pending shadow validation. |
| Scheduled automation | R1 and R4 templates published. Cloud execution next. |
| Behavioral accountability (this framework) | Live. Manual D1-D4 scoring across 15+ sessions. File-based failure memory. 13 hooks. |

See `docs/reference-implementation.md` for the sanitized description of
the private reference implementation that informs this framework.

---

## Related

- [four-plane-model.md](four-plane-model.md) — How this framework is
  organized internally.
- [mcp-a2a-integration.md](mcp-a2a-integration.md) — How MCP and A2A
  protocols sit relative to the three layers.
- `docs/guides/runtime-policy-integration.md` — How to integrate this
  framework with a runtime policy layer in adapter / shadow / enforce
  modes.
