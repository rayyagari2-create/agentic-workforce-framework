# Runtime Policy Integration

**How this framework sits above a runtime policy layer: adapter pattern
and shadow-to-enforce migration.**

This framework governs **whether agents can be trusted** to do what
they do. A runtime policy layer governs **what agents are permitted**
to do. They are complementary; neither replaces the other. This guide
covers how to make them work together.

---

## When to Read This Guide

Read this when:

- You have a runtime policy layer (or plan to add one) that handles
  identity, capability/permission enforcement, sandboxing, or audit
- You want this framework to sit cleanly above that layer rather than
  duplicating its concerns
- You are planning the migration from "framework only" to "framework +
  runtime layer"

---

## What "Runtime Policy Layer" Means Here

A runtime policy layer is the infrastructure that decides, at action
time, whether the action is permitted. Examples of capabilities a
runtime layer typically provides:

- Identity (cryptographic agent ID, e.g., DID-based)
- Policy enforcement (per-agent capability rules)
- Execution sandboxing (resource and network isolation)
- Audit trail at the action level
- Cross-protocol bridges (MCP, A2A, IATP, etc.)

The framework is designed to sit above any runtime layer with these
capabilities. It does not assume a specific implementation.

---

## The Three-Layer Stack

```
┌────────────────────────────────────────────────────────────┐
│  BEHAVIORAL ACCOUNTABILITY (this framework)                 │
│  Trust over time, failure memory, autonomy gates,           │
│  HITL / approval chains, operating model                    │
├────────────────────────────────────────────────────────────┤
│  RUNTIME POLICY LAYER                                       │
│  Identity, capabilities, sandboxing, action-level audit     │
├────────────────────────────────────────────────────────────┤
│  AGENT RUNTIME / ORCHESTRATION SUBSTRATE                    │
│  Process / container / model invocation                     │
└────────────────────────────────────────────────────────────┘
```

Each layer governs something distinct. Each layer is opinionated about
what is in scope. The framework's contribution is the top layer.

---

## What the Framework Provides That the Runtime Layer Doesn't

| Capability | Runtime Layer | This Framework |
|---|---|---|
| Per-action permission check | ✓ | |
| Cryptographic agent identity | ✓ | |
| Sandboxing | ✓ | |
| Action-level audit | ✓ | Compatible with |
| **Trust over time** | | ✓ |
| **Failure memory and recurrence** | | ✓ |
| **Autonomy gate based on behavioral history** | | ✓ |
| **HITL approval chains with delegation** | | ✓ |
| **Performance review cycle** | | ✓ |
| **Operating model** | | ✓ |

The runtime layer answers "is this action allowed?" The framework
answers "is this agent trusted enough to be doing this work?" Both
questions are needed; neither alone is sufficient.

---

## The Adapter Pattern

The framework integrates with the runtime layer through an adapter,
not through direct API calls.

### Why an Adapter

- **Insulates from breaking changes.** Runtime layers are typically
  evolving; an adapter means breaking changes hit one file, not the
  whole codebase.
- **Single call site.** All runtime layer interaction routes through
  the adapter; you can audit it as one surface.
- **Mockable for testing.** Tests can run against an adapter mock
  without standing up the runtime layer.
- **Migration-friendly.** Shadow-to-enforce migration (below) lives
  in the adapter.

### Adapter Responsibilities

A runtime adapter handles:

1. **Identity registration.** When an agent is onboarded or spawned,
   the adapter registers the agent with the runtime layer and obtains
   its identity token / DID.
2. **Action submission.** Before any agent action, the adapter calls
   the runtime layer's policy check. The framework's hooks may also
   fire; both decisions must pass.
3. **Audit forwarding.** The adapter forwards relevant framework
   events (spawn, gate decision, FailureRecord) to the runtime layer's
   audit channel.
4. **Capability sync.** When an agent's capability boundary changes
   in the framework (e.g., due to demotion), the adapter informs the
   runtime layer.
5. **Health check.** The adapter monitors runtime layer availability;
   on outage, the framework enters degraded mode (see
   `docs/control-plane/hook-system.md`).

### Adapter Boundary

The adapter is **the only place** that calls runtime layer APIs. The
rest of the framework calls the adapter, not the runtime layer.

This is the same pattern used for routine integration (`routineAdapter`
in the v10.3 spec). One file absorbs API churn; the rest of the
codebase is stable.

---

## What Signals the Framework Emits

The framework emits signals that the adapter forwards to the runtime
layer:

| Framework Event | Runtime Layer Concern |
|---|---|
| Agent onboarding | Identity registration |
| Spawn (with manifest) | Action authorization context |
| Tool use / action attempt | Per-action policy check |
| Trust tier change | Capability boundary update |
| Agent restriction | Capability boundary tightening |
| Agent retirement | Identity revocation |
| FailureRecord with severity P0 | Incident notification |
| Hook violation | Action denial event |
| HITL approval | Privileged action authorization |
| Override use | Elevated privilege event |

The runtime layer may or may not act on each. The framework emits;
the adapter forwards what is relevant.

---

## What Signals the Framework Receives

Symmetrically, the runtime layer emits events the framework consumes:

| Runtime Layer Event | Framework Concern |
|---|---|
| Policy denial | Logged to audit; may produce FailureRecord if it indicates agent drift |
| Sandbox violation | FailureRecord with `failureClass: security_vulnerability` |
| Authentication failure | Logged; may indicate identity issue |
| Performance threshold breach | Performance degradation FailureRecord |
| Audit log integrity violation | Critical pause operations, escalate |

The adapter ingests these events and translates them into framework
artifacts.

---

## Shadow-to-Enforce Migration

When introducing a runtime layer (or upgrading enforcement), the
framework supports a **shadow-to-enforce** pattern.

### Shadow Mode

In shadow mode, the runtime layer:

- Receives every signal the adapter forwards
- Runs every policy check
- Records every decision
- **Does not block** actions proceed regardless of runtime layer
  outcome

This is the safest way to introduce runtime policy without disrupting
operations. The runtime layer is observing; the framework continues
to operate as before.

### What to Watch in Shadow

While in shadow:

- **False-positive rate.** If the runtime would have blocked actions
  that were legitimate, the policy needs refinement before enforce
  mode.
- **False-negative rate.** Actions the runtime missed that the
  framework caught these tell you where runtime coverage is
  incomplete.
- **Performance overhead.** Runtime layer call latency multiplied by
  action count.
- **Audit divergence.** Where the runtime layer's audit and the
  framework's audit disagree about what happened.

### Migration to Enforce

Move to enforce mode when:

- Shadow has run for at least one full week of typical workload
- False-positive rate is < 1% (legitimate actions blocked)
- Performance overhead is acceptable
- Audit divergence is zero or fully understood

The flip from shadow to enforce is a configuration change, not a
code change. The adapter is the boundary; the rest of the framework
does not change.

### Per-Action Granularity

You can enforce on some actions and shadow on others. Common
sequencing:

1. Start: shadow on all
2. Move first: high-confidence policies (e.g., audit log writes,
   identity changes)
3. Move next: file-touch policies
4. Move last: high-volume action types (where false-positive impact
   would be largest)

Granular migration is slower but lower-risk.

---

## What Both Layers Do, and Why That Is Fine

There is unavoidable overlap between the framework and the runtime
layer:

| Capability | Both Have It | What Each Does |
|---|---|---|
| Audit trail | ✓ | Runtime: action-level. Framework: session and gate level. Different granularity, complementary. |
| Identity | ✓ | Runtime: cryptographic. Framework: stable agent ID. The adapter links them. |
| Policy decisions | ✓ | Runtime: action permission. Framework: trust gate. Both must pass for the action to proceed. |
| Audit log | ✓ | Runtime: per-action stream. Framework: governance event log. Cross-referenced by correlation_id. |

Overlap is not duplication. Each layer answers a different question.

### What Should Go in Each

| Concern | Belongs To |
|---|---|
| "Is this action permitted given the agent's identity?" | Runtime layer |
| "Has this agent demonstrated trust over time?" | Framework |
| "Did this action conform to the operating model?" | Framework |
| "Is this resource access allowed?" | Runtime layer |
| "Was a HITL approval recorded?" | Framework |
| "Is this network call permitted?" | Runtime layer |
| "Did pre-task retrieval surface a recurrence?" | Framework |

If a concern fits both layers, the rule is: **runtime if it can be
deterministically encoded; framework if it requires behavioral
history.**

---

## Common Integration Mistakes

| Mistake | Effect |
|---|---|
| Calling the runtime layer's API directly from many places | Breaking changes hit the whole codebase |
| Skipping shadow mode and going straight to enforce | Outages from false-positives in real workload |
| Treating runtime layer audit as sufficient | Loses the session-level and gate-level context the framework provides |
| Using framework hooks to do runtime layer work | Hooks should be lightweight; permission checks belong in the runtime |
| Letting the two layers' identity systems drift | Audit cross-referencing breaks |
| Operating without an adapter ("just call the API") | Cannot mock for tests; cannot migrate cleanly |

---

## Health and Outage Handling

When the runtime layer is down:

- The adapter detects via health check
- The framework enters degraded mode (see `hook-system.md`)
- High-risk actions are blocked
- Low-risk actions may proceed if a fallback hook exists
- Operator is alerted
- Recovery is operator-initiated and logged

When the framework is down (rare; the framework is mostly stateless
discipline):

- The runtime layer continues to enforce its own policies
- New actions cannot be governed by the framework's discipline (no
  pre-spawn, no HITL gates, no scoring)
- Operations should pause until the framework is restored

---

## Related

- `docs/control-plane/hook-system.md` degraded mode behavior.
- `docs/control-plane/audit-trail-patterns.md` how the framework's
  audit log is structured for cross-referencing.
- `docs/architecture/three-layer-stack.md` the layer stack overview.
- `docs/architecture/mcp-a2a-integration.md` protocol bridges (MCP,
  A2A) commonly handled by runtime layers.
