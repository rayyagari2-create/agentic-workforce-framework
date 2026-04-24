# Pull Request

## Summary

<!--
One or two sentences describing what this PR does. Aimed at someone scanning the PR list.
-->

## What changed

<!--
List the files or areas touched. Be specific. Examples:
- Added `docs/concepts/autonomy-gates.md` covering trust tier promotion rules
- Updated `schemas/v1/failure-record.schema.json` to add `correlationId` as optional
- Fixed broken link in `examples/single-workspace/README.md`
-->

## Rationale

<!--
What problem does this solve for the reader?
Concrete is better than abstract. "Adopters reading the trust-scoring doc could not
find the hard-stop rules without scrolling — moved them above the calibration anchors"
is more useful than "improved trust-scoring docs."
-->

## Testing / validation

<!--
How was this validated?

For schema changes:
- AJV validation result against representative instances
- Backward compatibility statement (does this break existing instances?)
- Schema version (v1.x patch / v2.x new)

For docs:
- Cross-references checked
- Code blocks render correctly
- Examples align with current schemas

For example or case-study additions:
- Sanitization checklist applied (no private repo names, product names, internal paths)
- Template structure followed
-->

## Extraction safety confirmation

<!--
This framework is built from a private reference implementation. PRs must confirm no
private context leaks into the public repo.
-->

- [ ] No private repository names or paths (use `[PROJECT_REPO]` as placeholder)
- [ ] No product names from any private implementation
- [ ] No customer, supplier, or vendor names (unless the framework's behavior depends on the named tool — Postgres, AGT, Claude Code are acceptable)
- [ ] No production data values
- [ ] No internal architecture details that are not also public

## Checklist

- [ ] Change is scoped to a single area (concepts/docs, case study, schema, hook example, or example)
- [ ] Extraction safety check passed (see above)
- [ ] `CHANGELOG.md` updated (if user-visible)
- [ ] Cross-references updated if terms or paths changed
- [ ] Rationale is in the description (what problem does this solve for the reader)

<!--
A scoped PR is one a reviewer can hold in their head. Two unrelated docs changes
in the same PR is two PRs.
-->
