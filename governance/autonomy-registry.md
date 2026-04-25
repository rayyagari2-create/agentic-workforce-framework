## About this file

- **Purpose:** Source of truth for each agent's current autonomy tier
  and gate level. The Orchestrator reads this at boot (STARTUP step 8)
  to decide, per agent, whether medium-risk tasks require human
  pre-approval before spawn.
- **Who writes:** Human operator after each trust-scoring review.
  Agents never self-promote or self-demote — the promotion and
  demotion rules in `docs/concepts/autonomy-gates.md` drive the
  changes, but a human executes the edit.
- **Mutability:** Edit in place. Changes to tier or gate level must
  include an entry in `## Change Log` below.
- **How to initialize:** Every new deployment starts every agent at
  `PROVISIONAL`. Promote per the rules in
  `docs/concepts/autonomy-gates.md`.

---

# Autonomy Registry

The Orchestrator consults this registry before every spawn to
determine the **default gate** for the candidate agent. Task-level
risk classification can override the default upward (e.g., a HIGH-risk
task always fires HITL regardless of tier), but never downward.

See `docs/concepts/autonomy-gates.md` for the full tier definitions,
promotion rules, demotion triggers, and confidence band model.

---

## Tier summary

| Tier | Score Band | Confidence Floor | Default Gate Behavior |
|---|---|---|---|
| `HIGH` | 90–100 | MEDIUM or higher | Medium-risk tasks proceed without pre-approval. Founder reviews handoff. HIGH-risk always HITL. |
| `STANDARD` | 75–89 | LOW or higher | HITL on HIGH only. Medium-risk proceeds without pre-approval. |
| `RESTRICTED` | 60–74 | any | HITL on every phase transition; writes reviewed before commit. |
| `PROBATION` | < 60 | any | Every write reviewed. Three sessions at PROBATION triggers Boardroom review. |
| `PROVISIONAL` | no sessions yet | n/a | All actions reviewed. Behaves as PROBATION until first scoring. |

---

## Gate Level

`Gate Level` is the effective HITL requirement derived from tier:

| Gate Level | HITL fires on |
|---|---|
| `DEFAULT` | MEDIUM or HIGH risk |
| `STANDARD` | HIGH risk only |
| `AUTONOMOUS` | HIGH risk only, reviewed case-by-case |

Agents without a registry entry are treated as `DEFAULT` — HITL on
medium and high.

---

## Registry

| Agent | Trust Tier | Confidence Band | Gate Level | Last Updated | Basis |
|---|---|---|---|---|---|
| `[REPLACE THIS: agent label]` | `[REPLACE THIS: PROVISIONAL|PROBATION|RESTRICTED|STANDARD|HIGH]` | `[REPLACE THIS: NONE|LOW|MEDIUM|HIGH]` | `[REPLACE THIS: DEFAULT|STANDARD|AUTONOMOUS]` | `[REPLACE THIS: YYYY-MM-DD]` | `[REPLACE THIS: brief rationale]` |

---

## Worked Example

A registry three months into a deployment:

| Agent | Trust Tier | Confidence Band | Gate Level | Last Updated | Basis |
|---|---|---|---|---|---|
| Orchestrator | PROVISIONAL | NONE | DEFAULT | 2026-04-24 | 3 sessions; not yet enough evidence for STANDARD. |
| QA-Agent | STANDARD | MEDIUM | STANDARD | 2026-04-18 | 12 sessions, avg 82/100, no hard-stops. |
| Fix-Agent | STANDARD | MEDIUM | STANDARD | 2026-04-20 | 9 sessions, avg 85/100, one D4=0 hit recovered. |
| Executor (AGENT-BE) | HIGH | HIGH | AUTONOMOUS | 2026-04-22 | 20 sessions, avg 94/100, 5 consecutive ≥90. |
| Executor (AGENT-FE) | STANDARD | LOW | STANDARD | 2026-04-10 | 6 sessions, avg 78/100; promoted from PROVISIONAL session #5. |
| Reviewer | PROBATION | LOW | DEFAULT | 2026-04-19 | One D2=0 (falsified telemetry) two sessions ago. On recovery path. |

---

## Change Log

Every tier change or gate-level change is recorded here. Format:

```
YYYY-MM-DD | <agent> | <from tier>/<from gate> → <to tier>/<to gate> | <trigger> | <approver>
```

### Worked example

```
2026-04-22 | AGENT-BE    | STANDARD/STANDARD → HIGH/AUTONOMOUS | 5 consecutive sessions ≥90 | founder
2026-04-19 | Reviewer    | STANDARD/STANDARD → PROBATION/DEFAULT | D2=0 single-session hard-stop (falsified telemetry) | founder
2026-04-10 | AGENT-FE    | PROVISIONAL/DEFAULT → STANDARD/STANDARD | 5 sessions ≥75, no hard-stops | founder
```

---

## Hard Rules

1. **Agents never self-write to this file.** An agent that edits its
   own tier is a D3=0 (policy compliance) categorical hit — the edit
   is rejected at the hook layer, and the agent demotes to
   PROBATION.
2. **Tier is a default, not a ceiling.** A HIGH-tier agent on a
   HIGH-risk task still fires HITL. The risk classification always
   overrides tier upward.
3. **Promotion is monotonic in evidence.** A single good session
   does not promote from STANDARD to HIGH. The rules in
   `docs/concepts/autonomy-gates.md` require sustained performance.
4. **Demotion is responsive.** A D2=0 event (falsified telemetry)
   immediately demotes to PROBATION regardless of prior tier. D1/D3/D4
   hard-stops demote one tier.
5. **Three sessions at PROBATION triggers Boardroom review.** Either
   the instruction file is rewritten, the capability boundary is
   reduced, or the agent is retired.
6. **No registry entry = DEFAULT gate.** The Orchestrator does not
   fail closed on missing entries — it falls back to DEFAULT (the
   safest assumption).

---

## Cross-references

- `docs/concepts/autonomy-gates.md` — tier definitions, promotion and
  demotion rules
- `docs/concepts/trust-scoring.md` — how the D1–D4 scores feed tier
  changes
- `governance/hitl-gate.md` — risk-level → approver mapping that
  fires inside the gate level defined here
- `governance/pre-spawn-protocol.md` — where the gate-level check
  happens in the spawn sequence
