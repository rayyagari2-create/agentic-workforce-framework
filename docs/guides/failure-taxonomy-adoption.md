# Failure Taxonomy Adoption

**Adapt the 17-class failure taxonomy: rename, subset, extend.**

The framework ships with 17 failure classes that cover the patterns
observed across agent systems. Some teams will find these classes
exactly fit; many will need to adapt vocabulary or extend coverage
for novel patterns. This guide covers how to adapt without losing
the recurrence detection that makes the taxonomy worth having.

---

## When to Read This Guide

Read this when:

- You have run a few sessions and started writing FailureRecords
- A failure does not seem to fit any of the 17 classes
- The default class names use vocabulary that is wrong for your domain
- Some classes (e.g., `payment_bypass`) clearly do not apply to your
  system

---

## The 17 Default Classes

```
schema_violation        schema rule broken
state_desync            two stores disagree about the same fact
reveal_leak             restricted content shown when it shouldn't be
payment_bypass          payment-gated action ran without payment
render_error            UI failure with no recovery
api_contract_break      caller relies on contract that changed
date_time_handling      TZ, DST, or format error in dates
null_reference          null/undefined unhandled
race_condition          outcome depends on ordering
prompt_regression       prompt change degraded behavior
entitlement_bypass      restricted feature accessed without entitlement
data_loss               data discarded that should have been retained
security_vulnerability  exploitable weakness
performance_degradation measurable performance regression
ux_regression           usability regression
truth_ownership         wrong component wrote to canonical store
client_side_truth       client treated as authoritative when server should be
```

These are the v1.0 enum values in `failure-record.schema.json`. They
are deliberately specific generic class names like "bug" or "error"
defeat the recurrence detection design.

---

## Four Adaptation Modes

You can adapt in four ways, in order of how invasive each is:

1. **Rename** keep the class, change the label for your domain.
2. **Subset** omit classes that do not apply to your system.
3. **Extend** add a class for a novel failure mode.
4. **Retire** remove a class that has become obsolete.

You can also do combinations. Most teams will rename a few, subset
a few, extend rarely, and retire only after the taxonomy has been
in use for a long time.

---

## Mode 1 Rename

Rename when the default class is conceptually right but the vocabulary
is wrong for your domain.

### When to Rename

- The class name uses domain language that doesn't match yours
  (`payment_bypass` doesn't apply but a similar concept does)
- The class is correct but the team consistently calls it something
  else
- The class needs more specificity for your system (e.g., splitting
  `state_desync` into `db_cache_desync` and `service_db_desync`)

### How to Rename

1. **Identify the original class** the rename maps to.
2. **Document the mapping.** In your team's
   `calibration/failure-taxonomy-notes.md`, write:

   ```
   billing_bypass → maps to payment_bypass
   Reason: our system uses "billing" not "payment"; same failure shape.
   ```

3. **Use the renamed class consistently.** Every FailureRecord uses
   the renamed value.
4. **Update the schema enum.** When you fork the schema or extend it
   for your deployment, the enum reflects your renames.

### What to Avoid

- Renaming to a less-specific term ("error", "issue") that loses
  classification value.
- Renaming the same default class to multiple new names across the
  team the recurrence check breaks.

---

## Mode 2 Subset

Subset when classes clearly do not apply to your system.

### When to Subset

- You don't have payments → omit `payment_bypass`, `entitlement_bypass`
- You don't have a frontend → omit `render_error`, `ux_regression`
- You don't have time-sensitive data → de-emphasize `date_time_handling`

### How to Subset

1. **Document the omission.** In your team's notes:

   ```
   Omitted: payment_bypass, entitlement_bypass, reveal_leak
   Reason: internal-only system, no monetization or restricted content.
   ```

2. **Update your schema enum** (if you maintain a deployment-specific
   fork) to remove the omitted values.
3. **Keep the schema validation strict.** A FailureRecord with an
   omitted class is a write error, not a soft warning.

### What to Avoid

- Subsetting classes you "don't think will happen." If you might be
  wrong, keep the class. The cost of an unused class is zero.
- Removing too many classes such that the remaining list is too small
  to support recurrence detection. Below 8–10 classes the taxonomy
  becomes too coarse.

---

## Mode 3 Extend

Extend when a real failure pattern does not fit any existing class.
This is the most consequential adaptation and the most disciplined.

### When to Extend

- A failure occurs that genuinely doesn't fit any of the 17 (or your
  subset)
- The pattern is likely to recur (one-offs do not warrant new classes)
- Forcing the failure into an existing class would distort recurrence
  detection (the failure would never match other instances)

### When NOT to Extend

- The failure fits an existing class but feels "different" usually
  an instance, not a new class
- You want a class for "everything else" that is the catch-all
  anti-pattern (see below)
- The pattern has occurred once wait for a second instance before
  extending

### How to Extend

1. **Write the new class definition.** A class needs:

   - **Name** lowercase, snake_case
   - **One-sentence definition** what the class captures
   - **Boundary** what is in vs out (often by contrast with adjacent
     classes)
   - **Example** at least one realistic FailureRecord that fits

2. **Document in your team notes.**

   ```
   Extension: data_freshness_violation
   Definition: data displayed to user is stale beyond defined freshness
   contract.
   Boundary: distinct from state_desync (which is internal disagreement)
   and api_contract_break (which is structural).
   Example: pricing data 4 hours old shown without staleness indicator.
   ```

3. **Update your schema enum.**

4. **Set initial recurrenceCount thresholds.** Use the standard
   thresholds (≥2 escalation, ≥3 benchmark, ≥5 systemic-refactor) unless
   you have a specific reason to differ.

### Constraint: All Classes Must Be Classifiable

Every class default or extended must have:

- A clear definition that distinguishes it from adjacent classes
- An example that fits unambiguously
- A failure mode that produces the symptom

If you cannot write these, the class is too vague. Either tighten it
or do not add it.

---

## Mode 4 Retire

Retire when a class has become obsolete because the system changed
underneath it. Retiring is distinct from subsetting: subsetting
happens at adoption (the class never applied); retiring happens after
the class has been in use and stops applying.

### When to Retire

- The system component the class describes has been removed (e.g.,
  an entire subsystem retired)
- A class has been split into two more-specific classes via Extend,
  and the original is no longer used for new records
- A class has produced zero matches in 12+ months **and** the failure
  mode is genuinely no longer possible (not just "we got lucky")

### When NOT to Retire

- The class has produced zero matches recently but the failure mode
  is still possible the absence is success, not obsolescence
- The class is rarely used but its prevention contracts (tests, code
  paths) still exist keep the class so future regressions can match
- You want to consolidate "low-traffic" classes that loses
  recurrence resolution

### How to Retire

1. **Mark the class deprecated.** In your team notes:

   ```
   Retired: render_error
   Effective: 2026-Q3, taxonomy v3.0
   Reason: frontend layer removed; system is API-only
   Last record: FAIL-2026-02-14-003
   ```

2. **Do NOT delete historical records.** A FailureRecord with a
   retired `failureClass` is still a valid historical record. Only
   prevent new writes.

3. **Update the schema enum** preserve the value but mark
   deprecated. New records cannot use a deprecated class; old records
   keep their classification.

4. **Increment your taxonomy version** (see Versioning below).

### What Retired Classes Still Do

A retired class still participates in:

- Historical recurrence reports ("we had X of these between Y and Z")
- Trust trajectory backfill (D4 scoring of prior sessions)
- Audit reads ("show all P0 records in 2025")

It does NOT participate in:

- New FailureRecord writes
- Prospective recurrence detection on new sessions

---

## Versioning Your Taxonomy

A taxonomy that adapts must be versioned. Without versioning, two
problems emerge: (1) historical records become ambiguous because the
class definitions have shifted under them, and (2) cross-team
deployments cannot tell whether their taxonomies are aligned.

### What to Version

- The set of active classes (which are valid for new records)
- Each class's definition and boundary
- The set of retired classes (still valid for historical reads)
- Renames (mapping from old name to new name)
- Subsets (which default classes are explicitly omitted)

### Versioning Scheme

Use semantic versioning adapted for taxonomies:

| Change Type | Version Bump | Example |
|---|---|---|
| Major | Class retired, renamed in a way that breaks historical matching, or boundary substantially redefined | v2.0 → v3.0 |
| Minor | New class added (Extend), or boundary clarified non-disruptively | v2.0 → v2.1 |
| Patch | Description text edited, examples added, no semantic change | v2.0 → v2.0.1 |

Start at v1.0. The shipped 17-class taxonomy is your starting point;
your first adaptation is v1.1 (minor) or v2.0 (major) depending on
whether you retired or renamed any defaults.

### Where to Record the Version

- **In every FailureRecord.** Add a `taxonomyVersion` field (e.g.,
  `v2.1`). The schema can record the active version at write time.
- **In your team notes.** A header line: `Taxonomy version: v2.1
  (effective 2026-Q3)`.
- **In the schema enum file.** A comment block at the top of the enum
  declaration.
- **In a changelog.** A `calibration/failure-taxonomy-changelog.md`
  with one entry per version, listing what changed and why.

### Migration Discipline

When you bump the major version (a retire or breaking rename):

1. **Freeze writes on the old version for 24–48 hours** while the
   schema and team notes update lands.
2. **Do not rewrite historical records** to the new version. They
   keep their original `taxonomyVersion` value.
3. **Recurrence detection across versions** uses a mapping table
   (renames map old → new; retires are dropped). The mapping is part
   of your team notes.
4. **Cross-team alignment** (multi-team deployments) requires every
   team to be on a known version. A team running v3.0 cannot share
   recurrence reports with a team on v2.1 without a translation
   layer.

### What Not to Version

- Description text fixes (typos, grammar) these are patch-level at
  most, do not require a migration
- Adding examples to an existing class informational, not semantic
- Calibration notes about how to apply a class those live in
  `calibration/team-notes.md`, not in the taxonomy version

---

## The Catch-All Anti-Pattern

### Why "Other" Is Forbidden

A common temptation is to add an "other" class for failures that do
not fit. The framework explicitly forbids this.

Reason: a catch-all class accumulates failures that should be
classified. Once "other" exists, the discipline of looking for the
correct class collapses. Within ten sessions, "other" becomes the
largest class, and recurrence detection becomes impossible every
failure in "other" matches every other failure in "other," producing
useless noise.

### What to Do Instead

If you have a failure that doesn't fit any class:

- **First**, re-read the existing classes carefully. Most "doesn't
  fit" cases turn out to be a class the writer hadn't fully internalized.
- **If it genuinely doesn't fit**, mark the FailureRecord status as
  `investigating` rather than picking the wrong class.
- **After two or more such cases**, extend the taxonomy with a new
  class (mode 3 above).
- **Until extension**, the records sit in `investigating`. This is
  intentional friction it forces the conversation that produces a
  good extension.

---

## Cross-Domain Vocabulary Notes

Different domains have different conventions for naming failures. The
taxonomy adapts.

| Domain | Adaptation Examples |
|---|---|
| Internal tools | Subset away `payment_bypass`, `reveal_leak`, `entitlement_bypass`; rename `ux_regression` to internal-tooling-specific |
| API platform | Emphasize `api_contract_break`, `schema_violation`; rename `render_error` if there is no UI |
| Data pipelines | Extend with `data_freshness_violation`, `pipeline_skew`; emphasize `data_loss`, `state_desync` |
| Infrastructure | Extend with `availability_violation`, `dependency_failure`; subset UI classes |
| Healthcare | Extend with `phi_exposure`; emphasize `data_loss`, `truth_ownership` |
| Financial services | Emphasize `payment_bypass`, `state_desync`, `truth_ownership`; extend with `reconciliation_drift` |

These are starting points, not prescriptions. Adapt to your domain
honestly.

---

## Maintaining the Adapted Taxonomy

The adapted taxonomy is a living document. Maintenance:

| Activity | Cadence |
|---|---|
| Review extensions for class coherence | Quarterly |
| Audit `investigating`-status records to see if extension is needed | Monthly |
| Verify cross-team consistency (multi-team deployments) | Per release cycle |
| Recalibrate severity assignment per class | Annually |
| Review retire candidates (zero-match in 12+ months) | Annually |
| Bump taxonomy version when applicable | On change |

A taxonomy that is set once and never reviewed will drift away from
the actual failure modes the team experiences. Treat it as code —
versioned, reviewed, refined.

---

## Common Failure Taxonomy Mistakes

| Mistake | Effect |
|---|---|
| Adding "other" or "miscellaneous" | Recurrence detection collapses |
| Renaming inconsistently across the team | Recurrence detection misses matches |
| Extending too eagerly (one-offs) | Taxonomy bloats; matching becomes harder |
| Subsetting too aggressively | Lose the language for failure modes that haven't happened yet but will |
| Retiring a class because it's quiet, not because it's obsolete | Loses the language for a failure mode that is still possible |
| Deleting historical records when retiring a class | Audit/recurrence views break; trust scoring loses backfill |
| Skipping taxonomy version bumps | Cross-team and historical comparisons silently misalign |
| Skipping the boundary documentation | Future writers misclassify |
| Mapping a domain term to two default classes | Pattern detection produces false positives |

---

## Validation

For each class in your final taxonomy:

- Can a writer assign this class to a new failure unambiguously? If
  not, the class is too vague.
- Are any two classes overlapping such that a single failure could
  reasonably get either? If so, sharpen the boundaries.
- Does each class correspond to a distinct prevention pattern? If two
  classes always produce the same prevention type, they may be the
  same class.

A well-adapted taxonomy passes these three tests.

---

## Related

- `schemas/v1/failure-record.schema.json` the schema (where the
  enum lives).
- `docs/concepts/failure-memory.md` the conceptual model behind
  the taxonomy.
- `docs/operating-model/incident-management.md` how the taxonomy
  is used at incident time.
- `calibration/d1-d4-rubric.md` D4 scoring depends on a working
  taxonomy.
