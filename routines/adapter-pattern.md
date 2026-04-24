# Adapter Pattern for Routines

Routines call into the framework — and the framework calls into the routine
platform — only through a single adapter. The adapter is the one place
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

A routine adapter exposes a small surface — typically four operations:

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

The correlation ID is generated **upstream** — at the point the routine is
fired — and passed through. The adapter does not generate it. If the caller
forgets to pass one, the adapter rejects the call. (Generating one inside
the adapter would mask the upstream bug; rejecting is louder and faster
to fix.)

A typical correlation ID is a ULID — sortable by creation time, globally
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
"R10 needs a custom field" is a smell — the right answer is a generic
`metadata` JSONB column.

**Correlation IDs generated inside the adapter.**
If the adapter mints its own ID, upstream callers cannot link their
events to the routine run. Pass the ID through; refuse calls without one.

**Shared mutable state in the adapter.**
The adapter is a transport. It should not cache state across calls beyond
read-only configuration. Stateful adapters become accidental databases.

---

## Migration safety

When the routine platform changes its API surface, the adapter is the only
file that changes. The framework upgrade procedure is:

1. Update the adapter.
2. Run the adapter's contract tests.
3. Run a single canary routine end-to-end.
4. Roll out.

If step 1 produces a multi-file diff, the isolation has broken somewhere
upstream. Find the leak before continuing.
