# Control Plane

**The set of capabilities commonly referred to as "AI governance".**

The directory is named `control-plane/` to be consistent with the
four-plane architecture model. Governance is **the control plane, not
the whole architecture.** The headline of this framework is the
agentic workforce; governance makes it safe to run autonomously.

---

## What "Control Plane" Means Here

In the four-plane model:

```
╔════════════════════════════════════════════════════════════════╗
║  AGENTIC WORKFORCE PLANE — agents, roles, orchestration         ║
╠════════════════════════════════════════════════════════════════╣
║  AUTONOMY PLANE — trust scoring, failure memory, autonomy gates ║
╠════════════════════════════════════════════════════════════════╣
║  CONTROL PLANE — pre-spawn protocol, HITL, hooks, audit         ║
╠════════════════════════════════════════════════════════════════╣
║  AUTOMATION PLANE — routines, scheduled scans, alerts           ║
╚════════════════════════════════════════════════════════════════╝
```

The control plane sits between the autonomy plane (which decides who is
trusted enough to do what) and the agentic workforce plane (which
contains the agents themselves). The control plane is the place where
**enforcement** happens.

Three properties distinguish enforcement from policy:

1. **Enforcement is deterministic.** A hook that fires either blocks or
   allows. There is no "the model thinks this is fine."
2. **Enforcement is fail-closed.** An error in the enforcement layer
   blocks, never allows.
3. **Enforcement is auditable.** Every decision the control plane
   makes leaves a trail.

Concepts and operating model can be persuaded, debated, refined.
Control plane is fences — and fences need to actually stop things.

---

## Why Governance Is Not the Whole Architecture

A persistent error in the AI agent space is treating governance as the
top-level concern. That framing makes governance a brake on the system,
which produces two reactions:

- Skip it (because brakes slow you down)
- Make it ceremonial (visible review with no actual enforcement)

The four-plane model corrects this. The agentic workforce is the
product. Trust scoring is what makes the workforce knowable. Control
plane is what makes it operable. Automation is what makes it scale.
None of these is more important than the others; they are
load-bearing in different directions.

If governance becomes a bottleneck, it is failing — see
`meta-governance.md` for the eight ways governance fails.

---

## Enforcement Hierarchy

The control plane enforces through layered checks. Each layer catches
something the prior layer missed. This is intentional defense-in-depth.

```
┌──────────────────────────────────────────────────────────────┐
│  LAYER 1 — PRE-SPAWN PROTOCOL                                 │
│  Decision tree: risk classification, /spec or /plan, gates    │
│  Catches: routing errors, missing acceptance criteria         │
├──────────────────────────────────────────────────────────────┤
│  LAYER 2 — BUILD STATE MACHINE                                │
│  Lifecycle phases: DEBUG → DESIGN → BUILD → QA → FIX → DONE   │
│  Catches: skipped phases, premature commits                   │
├──────────────────────────────────────────────────────────────┤
│  LAYER 3 — HITL GATES                                         │
│  Human approval for HIGH/CRITICAL risk; delegation chains     │
│  Catches: agents acting beyond authority                      │
├──────────────────────────────────────────────────────────────┤
│  LAYER 4 — OS-LEVEL HOOKS                                     │
│  PreToolUse / PostToolUse — exit(2) hard block                │
│  Catches: anything that gets past the higher layers           │
├──────────────────────────────────────────────────────────────┤
│  LAYER 5 — AUDIT TRAIL                                        │
│  Append-only event log; correlation ID threading              │
│  Catches: nothing — but enables forensics for what was missed │
└──────────────────────────────────────────────────────────────┘
```

A determined or careless agent can fail at any one layer. The
hierarchy ensures it cannot fail at all five simultaneously without
producing visible signal.

---

## Files in This Section

| File | Purpose |
|---|---|
| `pre-spawn-protocol.md` | Three-step decision tree before any agent spawns |
| `build-state-machine.md` | Phase lifecycle and loop conditions |
| `hitl-gates.md` | Gate types, authority, escalation patterns |
| `hook-system.md` | OS-level enforcement model and override pattern |
| `meta-governance.md` | The 8 failure modes of governance itself |
| `audit-trail-patterns.md` | Append-only design and correlation IDs |
| `compliance-evidence.md` | Mapping to EU AI Act, NIST AI RMF, SOC 2, HIPAA |

---

## Reading Order

For a first read, in order:

1. `pre-spawn-protocol.md` — the gate at the start
2. `build-state-machine.md` — the path through a session
3. `hitl-gates.md` — when humans must approve
4. `hook-system.md` — the OS-level backstop
5. `audit-trail-patterns.md` — the record of what happened
6. `compliance-evidence.md` — what regulatory frameworks see
7. `meta-governance.md` — what to do when governance itself fails

---

## What This Section Does Not Cover

- **What agents do** — see `docs/concepts/` and the workforce plane
- **How trust is scored** — see `calibration/` and
  `docs/operating-model/performance-review-cycle.md`
- **The runtime policy layer** — this framework sits above any runtime
  policy enforcement layer; see
  `docs/guides/runtime-policy-integration.md`

---

## Naming Note

Earlier drafts of this framework used `docs/governance/`. The
directory was renamed to `control-plane/` for consistency with the
four-plane model. The capabilities here are commonly called "AI
governance" in industry literature; the framework prefers the more
precise term.

If you arrive here from a link to `docs/governance/`, the content has
moved here. Schemas and external interfaces are unaffected.
