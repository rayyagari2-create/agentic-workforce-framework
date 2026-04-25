# Adapter Pattern for Routines

Routines call into the framework and the framework calls into the routine
platform only through a single adapter. The adapter is the one place
where the framework meets the outside world. This isolation is deliberate:
it lets the framework evolve without breaking deployed routines, and it
lets the routine platform change without rippling into framework code.

---

## Why an adapter

There are three kinds of change you want to absorb without ripping up your
routine fleet:

1. **Routine platform API changes.** Beta endpoints get renamed. Headers
   change. Auth schemes evolve. If routines call the API directly, every
   such change becomes a multi-file edit.

2. **Framework-side schema changes.** The shape of `routine_runs` evolves.
   New telemetry fields are added. Correlation ID conventions get refined.
   If routine code knows the schema, every schema change touches every
   routine.

3. **Trigger source changes.** A routine that listens on GitHub today might
   listen on GitLab tomorrow. The trigger payload differs; the routine
   logic does not.

The adapter is the single chokepoint that absorbs all three.

---

## The interface

A routine adapter exposes a small surface typically four operations:

```
RoutineAdapter
  fire(triggerId, contextText, correlationId) → result
  logRun(routineId, triggerType, payload, result, correlationId) → void
  getToken(triggerId) → string         // private; reads from secrets
  health() → { ok, lastRunAt, ... }    // for monitoring
```

`fire` is the only operation that crosses the network boundary. `logRun`
writes to the framework's local `routine_runs` table. `getToken` is private
and reads from the operator's secrets store. `health` is a read-only
reflection used by monitoring routines.

Anything more than this is over-design. The adapter is supposed to be small.

---

## Single call site

A common mistake is to put the adapter behind a *factory* that lets each
caller subclass it. Do not do this. The whole point is that **there is one
call site** for every operation. If two parts of the framework both call
`adapter.fire(...)`, that is fine. If two parts of the framework both
construct their own adapter, you have lost the property the pattern was
supposed to give you.

Concretely:

- One module exports the adapter as a singleton.
- Every caller imports that singleton.
- Tests stub the singleton (or the underlying `fetch`), not the import.

---

## Correlation ID threading

Every adapter call **must** carry a correlation ID. The correlation ID is
the thread that connects:

- The originating event (PR opened, schedule fired, API called)
- The routine run row in `routine_runs`
- Any audit log entries the routine writes
- Any downstream side effects (PR comments, Slack messages, alerts)

The correlation ID is generated **upstream** at the point the routine is
fired and passed through. The adapter does not generate it. If the caller
forgets to pass one, the adapter rejects the call. (Generating one inside
the adapter would mask the upstream bug; rejecting is louder and faster
to fix.)

A typical correlation ID is a ULID sortable by creation time, globally
unique, URL-safe.

```
correlation_id = 01HX5YGZ1FQ8N3PCSE7DR2V0WJ
```

---

## Skeleton implementation

```javascript
// adapters/routineAdapter.js
"use strict";

const ROUTINES_BASE_URL = process.env.ROUTINES_BASE_URL;
const ROUTINES_BETA_HEADER = process.env.ROUTINES_BETA_HEADER;

class RoutineAdapter {
  async fire(triggerId, contextText, correlationId) {
    if (!correlationId) {
      throw new Error("correlation_id is required");
    }
    const token = this._getToken(triggerId);
    const response = await fetch(
      `${ROUTINES_BASE_URL}/${triggerId}/fire`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "anthropic-beta": ROUTINES_BETA_HEADER,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify({ text: contextText }),
      }
    );
    const result = await response.json();
    await this._logRun(triggerId, "api", contextText, result, correlationId);
    return result;
  }

  async _logRun(routineId, triggerType, payload, result, correlationId) {
    // Writes to the routine_runs table. See database/governance/005_routine_runs.sql.
  }

  _getToken(triggerId) {
    const envKey = `ROUTINE_TOKEN_${triggerId.toUpperCase()}`;
    const token = process.env[envKey];
    if (!token) {
      throw new Error(`Routine token not found for ${triggerId}`);
    }
    return token;
  }
}

module.exports = new RoutineAdapter();
```

This is a sketch, not a production-ready implementation. Add timeouts,
retries, structured error mapping, and metrics emission to taste.

---

## Anti-patterns

**Direct API calls from routine logic.**
If a routine's prompt or its post-run handler reaches for `fetch()` against
the routine platform, you have lost the isolation. Route through the
adapter.

**Adapter that knows about routine semantics.**
The adapter does not care what R1 vs R4 means. It transports calls. If you
find adapter code branching on routine ID, push that logic up.

**Per-routine schemas.**
Every routine writes to `routine_runs` through the same `_logRun` path.
"R10 needs a custom field" is a smell the right answer is a generic
`metadata` JSONB column.

**Correlation IDs generated inside the adapter.**
If the adapter mints its own ID, upstream callers cannot link their
events to the routine run. Pass the ID through; refuse calls without one.

**Shared mutable state in the adapter.**
The adapter is a transport. It should not cache state across calls beyond
read-only configuration. Stateful adapters become accidental databases.

---

## How to add a new routine

Adding a new routine is a code change in three places and three places only. If your change touches more than these, the adapter is being bypassed somewhere and the leak needs to be found before the new routine ships.

The three places:

1. **A routine definition.** A short YAML or JSON file (or a row in your routine registry) that captures the trigger, the prompt, the repos, the MCP connectors, and the governance class (LOW / MEDIUM / HIGH). The definition does not contain code; it is configuration.
2. **A token entry in the secrets store.** The adapter's `_getToken` reads `ROUTINE_TOKEN_<UPPERCASE_TRIGGER_ID>` from the environment. The new routine's token is stored at the same path convention. No exceptions for "just this one."
3. **A row in `routine_runs` becomes possible automatically.** No schema change is required for a new routine `routine_runs` is generic over routine ID, and the adapter writes through `_logRun` regardless of which routine fired.

### The procedure

```
1. Define the routine
   - Pick a stable trigger ID (lowercase, hyphenated, includes the version
     suffix if you expect to revise: e.g. r5-pack-freshness-v1)
   - Write the prompt as a separate file under routines/templates/
   - Decide trigger types: schedule / API / GitHub / combination
   - Classify governance: LOW (read-only), MEDIUM (writes branches),
     HIGH (writes main, sends external messages, touches money)
   - HIGH-class routines require explicit approval before first fire

2. Register the trigger
   - Use the routine platform CLI to create the trigger
   - Note the trigger ID and the bearer token returned at creation
   - Tokens are shown ONCE store immediately in the secrets store
     under ROUTINE_TOKEN_<TRIGGER_ID_UPPERCASE>

3. Wire it through the adapter
   - No code change to the adapter itself
   - Add a constant in your routine catalog (e.g. routines/catalog.js)
     that maps the routine name to its trigger ID
   - The adapter is invoked with that constant, not with a literal string

4. Add the contract test
   - One test per routine: fires the routine against a stub of the
     routine platform, asserts the call shape and the routine_runs row
   - This is the only test that needs to know about the new routine
     specifically

5. Canary
   - First production fire of the routine is a manual API trigger from
     the operator with a test correlation ID
   - Verify the routine_runs row, the audit_log event, and the routine's
     output before enabling the schedule or GitHub trigger
```

### What does not need to change

- `RoutineAdapter` class. The adapter is generic over routine IDs it does not branch on the new routine.
- The `routine_runs` schema. Generic over routine ID.
- The downstream consumers (audit log writer, alert dispatcher). They read `routine_runs` agnostically.
- Other routines. The new routine is additive; existing fleet behavior is unaffected.

If you find yourself editing the adapter to add a special case for the new routine, stop and re-read this section. The adapter is not where routine-specific logic goes.

### Governance gates for the first fire

A new routine should not fire fully autonomously on day one. The recommended ramp:

| Day | Trigger | Reviewer |
|---|---|---|
| 1 | Manual API trigger only | Operator reviews each output before re-firing |
| 2-7 | Manual API trigger only | Operator reviews on first fire of each calendar day |
| 8-14 | Schedule enabled, but daily summary review | Operator reviews the schedule's outputs daily |
| 15+ | Full automation | Operator reviews on alert only |

The ramp is not procedural ceremony it is a calibration window. New routines fail in shapes the operator did not anticipate. Catching those shapes during the ramp is much cheaper than catching them after a week of unattended fires.

---

## How to handle breaking changes in the upstream API

The adapter exists for this case. When the routine platform breaks the contract renaming an endpoint, changing a header, retiring a beta flag, swapping auth schemes the adapter is the only file that changes. The framework above does not know.

That is the promise. Holding the promise requires discipline.

### The four kinds of breaking change

Different breaks need different responses. Group them up front:

1. **Wire-level rename.** A path or header changes. Old form returns 404 / 410. The adapter's URL or header values change. No semantic shift.
2. **Auth scheme swap.** Bearer token becomes mTLS, or scope-bound, or session-cookie. The adapter's `_getToken` and request construction change. Secrets layout may change.
3. **Payload shape change.** Request body or response body changes structure. The adapter's serializer/deserializer changes. Downstream consumers of the adapter's return value may also need to change that's a leak unless you are explicit about it.
4. **Behavioral change.** Same wire shape, different semantics. (E.g., the `text` field used to be optional context, now it is the prompt.) This is the hardest case the adapter looks the same, but the meaning of its arguments has shifted.

### The procedure

For all four:

```
1. Read the upstream changelog
   - Identify which kind of change this is (wire / auth / payload / behavioral)
   - Identify the old version → new version transition window
   - Note any deprecated headers or beta flags

2. Set up a parallel adapter, do not edit in place
   - RoutineAdapterV2 alongside RoutineAdapter
   - The framework uses an env var or feature flag to pick which one
   - Old routines fire through V1; canary fires through V2

3. Update contract tests
   - The adapter's contract test is the source of truth for what
     "fires correctly" means
   - The test asserts the request shape sent to the upstream match
     the new version's expectations

4. Canary one routine
   - Pick the lowest-risk routine in the fleet (typically a read-only
     PR scan)
   - Run it through V2 with a test correlation ID
   - Confirm routine_runs row, audit_log event, and output match V1
     behavior on the same input

5. Roll the fleet
   - Switch the env var from V1 to V2 for one routine at a time
   - Wait one full schedule cycle for each before moving to the next
   - Keep V1 alive until every routine has been confirmed on V2

6. Retire V1
   - After all routines are stable on V2, delete V1
   - Update the adapter to drop the version suffix
   - Document the migration in CHANGELOG
```

### When the adapter cannot fully absorb the change

Wire renames and auth swaps absorb cleanly. Payload changes and behavioral changes sometimes leak.

**Payload shape changes when they leak:** the adapter's return value (the routine's result object) changes shape. If callers of `adapter.fire()` read fields from that result, they break. The right response: the adapter normalizes the new payload back to the old shape, so callers do not change. If normalization is lossy or impossible, document the leak explicitly and update callers in a single coordinated PR do not let the change ripple silently.

**Behavioral changes what to do:** these are not absorbable. The adapter's call shape may not change but the semantic contract has. Treat as a fleet-wide migration: each routine's prompt or downstream handling needs review against the new behavior. The adapter remains the single point of truth for *how* to call upstream; the routines remain the source of truth for *what to do with the result*.

### Failure modes to avoid

- **Editing the adapter in place under load.** A live adapter being edited mid-deploy is a classic outage cause. Run V1 and V2 in parallel and switch. Never edit-and-pray.
- **Skipping the canary.** If "it compiled" is the bar, you do not have a contract test. Run the canary against a non-production routine first.
- **Deferring the V1 retirement.** Two adapters in production indefinitely become an excuse for routine-specific branches. Once the fleet is on V2, retire V1.
- **Letting upstream beta-flag changes through.** Beta flags break in unannounced ways. The adapter is where you pin the beta header version; bumping it is an explicit change with its own contract test, not a casual edit.

### The promise restated

The framework above the adapter does not know that the upstream API changed. The adapter absorbed it. Routine prompts did not change. `routine_runs` schema did not change. The audit log format did not change. If any of those did change, the isolation broke and the migration is incomplete.

---

## Migration safety

When the routine platform changes its API surface, the adapter is the only file that changes. The framework upgrade procedure (the abridged version of the procedure above):

1. Update the adapter in a parallel V2, not in place.
2. Run the adapter's contract tests.
3. Run a single canary routine end-to-end.
4. Roll out one routine at a time.
5. Retire V1.

If step 1 produces a multi-file diff outside the adapter, the isolation has broken somewhere upstream. Find the leak before continuing.
