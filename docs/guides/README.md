# Guides

**Adoption and implementation guides pick your path.**

The guides in this section are organized around the question "where
am I?" rather than "what do I want to learn?" Each guide assumes a
specific starting position and gets you to the next position.

---

## Pick Your Path

### "I am brand new and want a working scored session in under an hour."

Go to **[getting-started.md](getting-started.md)** a 30-minute path
that walks through:

1. Defining a five-agent roster from the example
2. Running your first scored session with D1-D4 evidence
3. Writing your first FailureRecord (if anything went wrong)
4. Setting trust tier to PROVISIONAL for next session

You will defer hooks, Postgres, and routines. They come later. The
goal is to feel the loop once before customizing.

### "I have run a few sessions and need to calibrate my scoring."

Go to **[trust-calibration.md](trust-calibration.md)** covers:

- How to calibrate D1-D4 anchors for your domain and risk tolerance
- When to tighten anchors
- How to recalibrate after drift is detected
- The most common calibration mistakes

You will end with a calibrated rubric you can apply consistently across
scorers.

### "The 17-class failure taxonomy doesn't quite fit my domain."

Go to **[failure-taxonomy-adoption.md](failure-taxonomy-adoption.md)**
— covers:

- When to rename a class for domain vocabulary
- When to subset (omit classes that do not apply)
- When to extend (add a class for novel failure modes)
- The constraint: additions must be classifiable; no catch-all
  "other" class

You will end with a taxonomy that fits your domain and still supports
recurrence detection.

### "I am a single team rolling this out for real."

Go to **[single-team-adoption.md](single-team-adoption.md)** covers:

- Single-workspace setup
- What to implement first (scoring ledger, failure records, manifest)
- What to defer (multi-workspace, Division Orchestrator)
- Minimum viable governance

You will end with a working operating model at single-team scale,
with a clear roadmap for what comes next.

### "I am scaling up to multiple teams or divisions."

Go to **[enterprise-adoption.md](enterprise-adoption.md)** covers
multi-workspace, Division Orchestrator, approval gate chains, and
what "enterprise-ready" requires.

**Status: [v3.0] not yet shipped.** The model is designed but not
yet field-proven. Do not implement this layer until your single-workspace
governance is running reliably.

### "I have a runtime policy layer and want this framework to sit above it."

Go to **[runtime-policy-integration.md](runtime-policy-integration.md)**
— covers:

- The adapter pattern
- Shadow-to-enforce migration path
- What signals the framework emits to the runtime layer
- What the runtime layer signals back

You will end with a clean separation between behavioral accountability
(this framework) and runtime policy enforcement (your existing layer).

---

## Reading Order Across Guides

For a team adopting from scratch, an effective sequence is:

1. **getting-started.md** feel the loop
2. **single-team-adoption.md** make it real
3. **trust-calibration.md** make it consistent
4. **failure-taxonomy-adoption.md** make it fit
5. **runtime-policy-integration.md** make it sit cleanly above your
   runtime layer (if applicable)
6. **enterprise-adoption.md** only when single-team is reliable

Skipping ahead to enterprise-adoption is a known anti-pattern. The
single-workspace operating model is the foundation; without it, the
enterprise pattern is theory.

---

## What These Guides Are Not

- **They are not a complete reference.** Concepts live in
  `docs/concepts/`. Architecture lives in `docs/architecture/`. Operating
  model lives in `docs/operating-model/`. Control plane lives in
  `docs/control-plane/`. Guides assume you can reach the references.
- **They are not prescriptive at the implementation level.** They tell
  you what to do; they do not tell you what tool to do it with. The
  framework is intentionally tool-agnostic.
- **They are not a replacement for the schemas.** Schemas in
  `schemas/v1/` are the source of truth for record formats. Guides
  reference schemas; they do not duplicate them.

---

## Related

- `docs/operating-model/README.md` the operating model the guides
  put into practice.
- `docs/control-plane/README.md` the enforcement layer the guides
  reference.
- `examples/minimum-viable-adoption/` the minimum viable adoption
  example pointed to by `getting-started.md`.
- `calibration/` the calibration artifacts referenced by
  `trust-calibration.md`.
