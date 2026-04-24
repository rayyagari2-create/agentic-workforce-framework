# Operating Model

**How you actually run an autonomous agent workforce, day to day.**

This is the primary promise of this repo. The framework is not a library
you import — it is an operating model you adopt. Concepts give you the
vocabulary, architecture explains how the pieces fit together, and the
operating model tells you what you do on Tuesday morning when an agent
finishes a task.

---

## How This Section Differs From Concepts and Architecture

Three sections of the docs tree look superficially similar. They answer
three different questions.

| Section | Question Answered | Example |
|---|---|---|
| `docs/concepts/` | **What is it?** | What is a trust score? What is a failure class? |
| `docs/architecture/` | **How does it fit together?** | How do the four planes interact? What writes to what? |
| `docs/operating-model/` | **How do I run it?** | When do I score? Who can promote? What happens on incident? |

If you are looking for a definition, go to `concepts/`.
If you are looking for a diagram or boundary rule, go to `architecture/`.
If you are looking for a process — a thing a human or agent does at a
specific moment — you are in the right place.

---

## Why This Section Exists

Most published "AI governance" content stops at concepts and schemas.
That gap is the reason agent teams stall after the first three sessions.
The schema tells you what a trust score looks like. It does not tell you:

- When to score
- Who scores
- What evidence is required
- What happens when the score drops two sessions in a row
- When an agent should be retired
- How a manager agent escalates without becoming a bottleneck

This section closes those gaps.

---

## Reading Order

The files in this section are sequenced. Read in order on first pass.

1. **[agent-lifecycle.md](agent-lifecycle.md)** — Onboarding, active duty,
   restricted, retired. The full arc of a single agent identity.
2. **[task-assignment.md](task-assignment.md)** — How a unit of work moves
   from the queue to a specific agent, with a manifest attached.
3. **[manager-agent-pattern.md](manager-agent-pattern.md)** — The
   orchestrator as engineering manager. Span of control. What it cannot
   do alone.
4. **[performance-review-cycle.md](performance-review-cycle.md)** — When
   to score a session, what counts as a session, how to record evidence
   for D1 through D4.
5. **[promotion-demotion-process.md](promotion-demotion-process.md)** —
   What triggers an autonomy gate to expand or contract.
6. **[incident-management.md](incident-management.md)** — The failure
   record flow, recurrence checks, escalation to the Boardroom.

---

## The Operating Model in One Page

```
ONBOARDING                 ACTIVE                          REVIEW
─────────────              ─────────────────────           ──────────────
Agent created          →   Tasks routed via queue     →   Score per session
Tier = PROVISIONAL         Manifest per task              D1-D4 with evidence
Instruction file           Pre-spawn protocol             Confidence band
Capability boundary        QA verdict per output           updates with n
                          ↓
                        INCIDENT
                        ─────────────────────
                        FailureRecord written
                        Recurrence check
                        Fix-Agent routed
                        Prevention artifact
                          ↓
                        OUTCOME
                        ─────────────────────
                        Promotion (sustained HIGH)
                        Demotion (D4=0 or hard-stop)
                        Retirement (superseded)
```

Everything in this section is one of the boxes above, expanded.

---

## Operating Model Invariants

These rules hold across every file in this section. If a process
description appears to contradict one of these invariants, the invariant
wins.

1. **No agent self-scores.** Trust scoring is observer-assigned. The
   asymmetry is intentional. An agent grading its own session is a
   conflict of interest by construction.
2. **Every session is scored.** Not periodically. Not when convenient.
   At session close, before next session begins.
3. **Every score requires evidence.** One line per dimension, minimum.
   A score without evidence is not a score — it is a guess.
4. **Trust travels with the agent instance, not the role.** A
   QA-Agent in Workspace A and a QA-Agent in Workspace B have separate
   trust trajectories.
5. **Subagents cannot spawn subagents.** The orchestrator is the only
   manager. This is enforced at the hook layer, not by convention.
6. **No commit without an authorized human.** Agents propose. A human
   approves. The framework does not change this — it makes the approval
   surface tractable.

---

## What This Section Does Not Cover

- **Concept definitions** — see `docs/concepts/`
- **Schema fields** — see `schemas/v1/`
- **Hook implementation** — see `hooks/` and `docs/control-plane/hook-system.md`
- **Database tables** — see `database/`
- **Calibration anchors** — see `calibration/`

---

## Related Reading

After completing this section, the natural next stop depends on your
role:

- **Engineering leader rolling this out** — `docs/guides/single-team-adoption.md`
- **Platform engineer integrating with a runtime layer** — `docs/guides/runtime-policy-integration.md`
- **AI governance owner** — `docs/control-plane/README.md`
- **First-time adopter** — `docs/guides/getting-started.md`
