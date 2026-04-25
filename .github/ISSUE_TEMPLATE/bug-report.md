---
name: Bug report
about: Report a defect in a schema, hook example, or documentation
title: "[bug] "
labels: bug
---

## What is broken

<!-- Pick one and describe. -->
- [ ] Schema (`schemas/v1/...`)
- [ ] Hook example (`hooks/...`)
- [ ] Documentation (`docs/...`, `README.md`, etc.)
- [ ] Database SQL (`database/...`)
- [ ] Example (`examples/...`)
- [ ] Other (describe below)

Short description of what is wrong:

## File path or URL

<!--
Paste the path within the repo or the GitHub URL.
Example: `schemas/v1/failure-record.schema.json`
or https://github.com/<org>/<repo>/blob/main/docs/concepts/trust-scoring.md#confidence-bands
-->

## Expected behavior

What you expected to see, validate, or run successfully.

## Actual behavior

What actually happened. Include error messages verbatim. Trim long stack traces to the relevant frames.

## Reproduction steps

1.
2.
3.

If the bug is in a schema:
- The instance that should validate but does not (or vice versa)
- The validator you used (AJV version, etc.)
- The validator's error output

If the bug is in a hook example:
- The PreToolUse / PostToolUse input shape you fed it
- The expected exit code and the observed exit code

## Version

- [ ] Tracking `main`
- [ ] Pinned to v1.0
- [ ] Other (specify):

## Additional context

Anything else useful related issues, prior discussions, screenshots if applicable.
