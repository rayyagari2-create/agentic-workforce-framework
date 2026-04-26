# Schemas

Generic, product-agnostic JSON Schemas for the Agentic Workforce Framework.
All schemas are written for **AJV with JSON Schema Draft 2020-12**.

These schemas describe the four governance contracts that any single-workspace
deployment must produce and consume:

- **AgentTaskManifest** the dispatch contract. No manifest = no dispatch.
- **QAVerdict** structured QA result with defect classification and trust impact.
- **FailureRecord** entry in the self-learning failure library (17-class taxonomy).
- **TrustScore** D1-D4 session score plus the 8-dimension long-term profile.

## v1 schemas (current)

| File | Title | One-line purpose |
| --- | --- | --- |
| [`v1/agent-task-manifest.schema.json`](v1/agent-task-manifest.schema.json) | `AgentTaskManifest` | Mission context, files in scope, risk level, verification required |
| [`v1/qa-verdict.schema.json`](v1/qa-verdict.schema.json) | `QAVerdict` | Structured QA verdict with per-finding evidence and trust delta |
| [`v1/failure-record.schema.json`](v1/failure-record.schema.json) | `FailureRecord` | 17-class taxonomy, recurrence count, prevention artifacts, agents involved |
| [`v1/trust-score.schema.json`](v1/trust-score.schema.json) | `TrustScore` | D1-D4 session score plus 8-dimension continuous profile, trust tier, confidence band |
| [AgentSpawnSidecar](v1/agent-spawn-sidecar.schema.json) | Hook-readable spawn authorization record. Written by the Orchestrator before Agent tool call. Validated by PreToolUse hook. The enforcement artifact for agent spawn governance. |

> **Schema dependency:** The AgentSpawnSidecar schema is the
> most security-critical schema in this repo. Every agent spawn
> in enforce mode depends on a valid sidecar. The other four
> schemas govern accountability artifacts (manifests, verdicts,
> records, scores) that are produced during and after execution.

## Validation

All schemas declare `"$schema": "https://json-schema.org/draft/2020-12/schema"`.
Use AJV 8.x or any validator that supports Draft 2020-12.

```bash
npm install ajv ajv-formats
```

```js
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "./v1/agent-task-manifest.schema.json" assert { type: "json" };

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const ok = validate(manifestObject);
if (!ok) console.error(validate.errors);
```

Notes:

- Pass `strict: true`. The schemas are strict every object sets
  `additionalProperties: false` so unknown fields fail loudly.
- Use `ajv-formats` for `date-time` validation.
- `null` is an explicit allowed value on optional fields where present
  (encoded as `"type": ["string", "null"]`, etc.). This is intentional —
  it lets a row in the database set the field explicitly to "not yet known"
  rather than omitting it.

## Versioning policy

Schemas are versioned under `v1/`, `v2/`, ... directories. The rules are:

1. **Once a schema ships under `vN/`, it is frozen.** No structural changes,
   no enum additions or removals, no required-field changes. Field
   descriptions may be clarified.
2. **Breaking changes require a new version path.** Add the new schema under
   `vN+1/` and treat the old one as the legacy contract.
3. **Backward-compatible extension is via a new minor file** in the same
   version directory (e.g., `v1/agent-task-manifest.v1_1.schema.json`)
   referenced by `$id`. Prefer this only when the change is truly additive
   and optional.
4. **Implementations may extend enums locally.** A project running this
   framework MAY constrain a generic `string` field (e.g., `domain`) to a
   project-specific enum in its own schema overlay. The reverse —
   loosening a v1 enum requires a v2 bump.
5. **The 17-class `failureClass` enum is intentionally cross-cutting.** It is
   designed to apply to any domain and SHOULD NOT be subset by implementers.
   Implementers may add classes, but additions require a v2 bump.

## Sanitization note

These schemas are derived from a private reference implementation. All
product-specific identifiers (domain names like `pricing`, `reveal`,
`payment`; agent names like `chief-of-staff`, `boardroom`, `evolve`) have
been removed. Domains are open strings; agent identifiers use generic role
names (`orchestrator`, `qa-agent`, `fix-agent`, `executor`, `reviewer`).
Implementers SHOULD substitute their own domain and role taxonomies via
overlays rather than forking these files.

## Status

- **v1.0** current, ships at public launch.
- **v2.0** reserved (see [`v2/README.md`](v2/README.md)).
