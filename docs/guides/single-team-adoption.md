# Single-Team Adoption

**Single-workspace setup: what to implement first, what to defer,
minimum viable governance.**

This guide is for a team that has run the 30-minute path in
[getting-started.md](getting-started.md) and is ready to make the
operating model real. The target is a stable single-workspace
operation that can sustain weeks of agent work without governance
collapse.

---

## When to Read This Guide

Read this when:

- You have completed `getting-started.md` and run 3+ sessions
- You are adopting the framework for a real team, not as a demo
- You want a clear sequence for what to add and when

If you are at multi-team scale, this guide is still the foundation —
read it before `enterprise-adoption.md`.

---

## The Implementation Sequence

```
TIER 1 MUST HAVE             (the minimum viable)
   ↓
TIER 2 STRONGLY RECOMMENDED  (after 5–10 sessions)
   ↓
TIER 3 DEFER UNTIL NEEDED    (after 20+ sessions or specific signals)
```

Implementing in this order is itself a design choice. The framework
is incremental; jumping ahead to TIER 3 without TIER 1 in place
produces governance theater.

---

## Tier 1 Must Have

### 1. Agent Roster

A markdown file or simple registry listing every agent with:

- Stable agent ID
- Human equivalent
- Capability boundary
- Trust tier (start at PROVISIONAL)
- Instruction file path

Example: `examples/minimum-viable-adoption/agent-roster.md`.

### 2. AgentTaskManifest for Medium and High Risk

For LOW-risk work, the manifest can be informal. For MEDIUM and HIGH,
it must conform to the schema (`schemas/v1/agent-task-manifest.schema.json`).

The manifest can live as a markdown file, a JSON file, or a row in a
simple ledger. Format is flexible; the **fields** are not.

A spawn without a manifest, on a MEDIUM/HIGH task, is a process
violation.

### 3. Trust Score Ledger

A markdown file (or simple table) where every session is recorded
with:

- session_id
- agent_id
- D1, D2, D3, D4 scores with one line of evidence each
- total
- trust tier
- n_sessions, confidence band

Template: `calibration/scoring-ledger-template.md`.

Score every session. Score at session close. Score with evidence.

### 4. Failure Library

A markdown file (or simple registry) where every FailureRecord lives.
Records conform to `schemas/v1/failure-record.schema.json`.

Pre-task retrieval at this scale is manual: before spawning an agent,
read the failure library entries that match the task's domain and
files. Surface the matches into the manifest's `priorFailureContext`.

### 5. Manual Pre-Spawn Discipline

The pre-spawn protocol (see `docs/control-plane/pre-spawn-protocol.md`)
is a process at this scale, not an automated tool. Before spawning:

1. Classify (LOW / MEDIUM / HIGH / CRITICAL)
2. Decide /spec or /plan
3. Trigger gates (HITL for HIGH; Boardroom for CRITICAL)

This is the operator's discipline, run on every spawn.

### 6. HITL on HIGH-Risk Work

Every HIGH-risk task gets explicit human approval before commit.
Approval includes one line of rationale. Approval is recorded with
the task.

---

## Tier 2 Strongly Recommended (after 5–10 sessions)

### 1. Calibration Notes

After running enough sessions to see scoring patterns, calibrate.
Read [trust-calibration.md](trust-calibration.md). Document team-specific
anchor language in `calibration/team-notes.md` (or equivalent).

### 2. Pre-Task Retrieval Discipline

If your failure library has more than 10 records, manual retrieval
becomes inconsistent. Define a discipline:

- Search the library by `domain` and `files` for every spawn
- Surface every match (not just the obvious ones)
- Document matches in the manifest's `priorFailureContext`

A simple grep-based tool is sufficient at this scale. Postgres
retrieval is TIER 3.

### 3. Append-Only Audit Trail (File-Based)

Even without Postgres, you can maintain append-only audit discipline:

- One file per session with phase transitions, gate events, tool uses
- Files are committed to the repo; git history is the append-only
  guarantee
- Correlation IDs are session IDs; they thread through the session
  file

This is the file-based equivalent of the audit log. It is enough for
single-team scale.

### 4. Session Close Discipline

Every session ends with the same checklist:

1. QA verdict produced and recorded
2. Trust score for each agent that ran (D1-D4 with evidence)
3. FailureRecords written for any incidents
4. Bulletin/audit file committed
5. Manifest marked complete with result

Skip-the-checklist is the most common decay mode at this stage.

### 5. Quarterly Recalibration Review

Every quarter, spend an hour:

- Review trust scores for inflation
- Review failure library for taxonomy drift
- Review override usage (if hooks are installed) for hook bypass
- Review HITL approval rationale for theater

This is the meta-governance review at single-team scale.

---

## Tier 3 Defer Until Needed

These are valuable but should not be implemented before TIER 1 and 2
are stable.

### Hooks

Adopt when:

- File-based discipline has been stable for 5+ sessions
- A pattern is consistently violated despite operator discipline
- You have a runtime that supports the hook protocol

Hook examples are in `hooks/`. Start fail-closed. Keep the operator
override pattern.

### Postgres Governance Schema

Adopt when:

- The markdown-based ledgers feel limiting (typically 20+ sessions in)
- You want queryable history (e.g., "show me all P0 incidents in
  Q2")
- Multiple scorers need concurrent write access

Schema is in `database/governance/`. Run the audit log first; the
trust scores and failure records second.

### Routines (R1, R4)

Adopt when:

- You have GitHub PR workflow
- You have daily routine cap available
- The relevant scans (PR test, security scan) are valuable

Templates are in `routines/templates/`. Start with R1 (PR test) it
has the lowest governance overhead.

### Boardroom Agent

Adopt when:

- 3-strike escalations happen often enough that the orchestrator
  cannot handle them
- Cross-domain incidents need adjudication

The Boardroom Agent is part of v2.0 design. Manual Boardroom (operator
review) is sufficient at single-team scale.

### Automated Trust Scoring (R10)

Adopt when:

- Manual scoring is well-calibrated and the volume warrants automation
- You have telemetry confidence (Eval/Telemetry Service is reliable)

R10 is v3.0+. Manual is the default at single-team scale.

### Multi-Workspace

Do not adopt at single-team scale. See
[enterprise-adoption.md](enterprise-adoption.md) for when this becomes
relevant.

---

## Minimum Viable Governance

Across the tiers above, "minimum viable governance" is TIER 1 plus the
following discipline:

- Every session is scored, with evidence
- Every failure is recorded, with prevention artifact for closure
- Every HIGH-risk task has a HITL approval
- Pre-task retrieval runs (manually) before every spawn
- Audit/bulletin files are committed before session close

This is the floor. Less than this is not "lightweight" it is "not
enough to know whether the framework is working."

---

## Common Single-Team Adoption Mistakes

| Mistake | Effect |
|---|---|
| Skipping pre-spawn for "quick tasks" | Underclassification; HITL fails to fire when it should |
| Treating manifests as overhead | Manifests are the artifact QA verifies against; without them, QA is vibes |
| Manual pre-task retrieval falling out of practice | D4 scoring becomes meaningless; recurrences accumulate |
| Running 20+ sessions before calibrating | Inflation has set in by the time you notice |
| Adopting Postgres before file-based discipline is stable | The schema is correct; the discipline isn't; database fills with bad data |
| Skipping FailureRecord on minor issues | Library remains thin; recurrence detection has nothing to match |

---

## When You Are Ready to Expand Autonomy Gates

At single-team scale, autonomy expansion is the most consequential
governance decision the operator makes. Expanding too early erases
the value of the trust tier; expanding too late wastes review
capacity on agents that have demonstrably earned room.

### What "Expanding the Autonomy Gate" Means

Each agent has a current trust tier (PROVISIONAL → RESTRICTED →
STANDARD → HIGH). The tier controls how much human review each
session requires. Expanding the gate means promoting the agent's
operational tier, which reduces the number of decision points
requiring approval.

| Operational Tier | Review Pattern |
|---|---|
| PROVISIONAL | Every decision point reviewed; n_sessions < 5 |
| RESTRICTED | Reviewer checks before each phase transition |
| STANDARD | Reviewer checks at decision points, not every transition |
| HIGH | Medium-risk work proceeds without step-by-step review |

### The Two Required Bands

Promotion requires **both** a score band and a confidence band. A
high score with low confidence is not enough. A high confidence with
a STANDARD score is not enough.

| Promotion | Required Score Band | Required Confidence Band |
|---|---|---|
| PROVISIONAL → RESTRICTED | Most recent 5 sessions average ≥ 60 | LOW (n ≥ 5) |
| RESTRICTED → STANDARD | Most recent 10 sessions average ≥ 75 | MEDIUM (n ≥ 10) |
| STANDARD → HIGH | Most recent 20 sessions average ≥ 90 | HIGH (n ≥ 20) |

The confidence band is non-negotiable. n_sessions < 20 cannot reach
HIGH operational tier even if every session scored 100.

### Other Promotion Preconditions

In addition to the band thresholds:

- **No D1=0, D2=0, or D3=0 in the trailing 5 sessions.** Hard-stops
  reset the cooling-off period.
- **No FailureRecord with `recurrenceCount ≥ 2` opened in the
  trailing 5 sessions** for which the agent was responsible.
- **Calibration is current.** If the team's calibration session is
  more than 6 months old (see [trust-calibration.md](trust-calibration.md)),
  do not promote until calibration is refreshed. Score inflation is
  the most common cause of premature promotion.
- **HITL approvals reviewed for theater.** If the trailing 10 HITL
  approvals on this agent's work were rubber-stamps, the score is
  unreliable fix the review process before promoting.

### Demotion Is Faster Than Promotion

Demotion is automatic and immediate. Do not wait for a meeting.

| Trigger | Demotion |
|---|---|
| D1=0, D2=0, or D3=0 in any session | Drop one tier |
| D4=0 with pre-task pattern provided | Drop one tier |
| 3 consecutive sessions at PROBATION | Boardroom review (manual at single-team scale) |
| Trailing 5 average drops below the band threshold for current tier | Drop to the band the trailing 5 supports |

The asymmetry is intentional. Trust takes 20 sessions to earn and
one session to lose. That is the design it is what makes the tier
meaningful.

### A Concrete Promotion Decision

```
Agent: agent-fe
Current tier: STANDARD
n_sessions: 22
Trailing 20 average: 91
Trailing 5 D1=0/D2=0/D3=0: none
Trailing 5 FailureRecord recurrenceCount ≥ 2: none
Calibration last refreshed: 3 months ago
HITL theater review: passed (3/10 approvals were corrections)

Decision: promote to HIGH
Effective: next session
Recorded in: trust-ledger.md, with one-line rationale
Recorded by: operator
```

The decision is documented because demotion criteria reference the
same evidence. If the agent regresses, the demotion is anchored to
the same record.

### When to Refuse a Promotion

Refuse even when the bands clear if:

- The trailing sessions were unusually easy promotion would
  generalize a narrow signal
- The agent's instruction file changed in the last 5 sessions —
  promotion before calibrating to the new behavior is premature
- The team is short on reviewers and is feeling pressure to "trust
  the agent more" this is the worst possible reason; promotion
  must be evidence-driven, never workload-driven

A refusal is recorded with rationale, the same as a promotion.

---

## What Single-Team Looks Like When It's Working

After 4–8 weeks of adoption:

- Trust ledger has 15+ scored sessions
- Failure library has 5–15 records, most with prevention artifacts
- The team can identify their highest-risk agent and their lowest-risk
  agent by trust trajectory
- HITL approvals are caught issues (not signature lines)
- Recurrence count > 1 is rare (because pre-task retrieval is working)

If most of the above holds, you are at the level where considering
TIER 3 capabilities makes sense. If they don't, the issue is
discipline, not tooling.

---

## When to Move Beyond Single-Team

The framework's enterprise features are designed for multi-team
environments. Move there when:

- You have a second team adopting the framework
- Single-team discipline is reliable for 8+ weeks
- Cross-team coordination is producing friction that workspace
  isolation would resolve

Read [enterprise-adoption.md](enterprise-adoption.md) at that point.
The enterprise model is **designed but not yet field-proven**, so
expect to be ahead of the framework's own validation curve.

---

## Related

- `docs/guides/getting-started.md` the prerequisite path.
- `docs/guides/trust-calibration.md` TIER 2 calibration step.
- `docs/guides/failure-taxonomy-adoption.md` TIER 2 taxonomy step.
- `docs/operating-model/README.md` the operating model this guide
  puts into practice.
- `docs/control-plane/pre-spawn-protocol.md` TIER 1 pre-spawn
  discipline.
- `examples/minimum-viable-adoption/` the starting templates.
