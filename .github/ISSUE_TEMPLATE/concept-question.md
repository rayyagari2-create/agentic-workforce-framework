---
name: Concept or design question
about: Ask about an architecture or design decision in the framework
title: "[concept] "
labels: question
---

## What are you trying to do

A short paragraph describing your situation. Examples:

- "I'm setting up D1-D4 scoring for a five-engineer team and trying to decide whether to score the orchestrator separately."
- "I'm reading the four-plane model and unclear how the control plane interacts with a runtime policy layer like AGT."
- "I'm adapting the failure taxonomy and want to know whether `data_integrity` and `schema_violation` are meant to be one or two failure classes."

Be concrete enough that someone reading this can imagine your situation. We are unlikely to be able to answer "should I use this framework?" without context.

## What part of the framework are you unsure about

Link to the specific concept or section. Examples:

- `docs/concepts/trust-scoring.md#hard-stop-rules`
- `docs/architecture/four-plane-model.md`
- `examples/single-workspace/session-scoring-walkthrough.md`
- `schemas/v1/failure-record.schema.json` field `recurrenceCount`

If your question spans multiple files, list them.

## What have you tried / what have you read

What you have already worked through. This helps the maintainers avoid pointing you at content you have already seen. Examples:

- "I read the trust-scoring concept doc and the calibration anchors. The PROVISIONAL band makes sense; what is unclear is when to promote past it."
- "I tried the minimum viable adoption walkthrough and got to the session close. Now I'm trying to decide what to add next."

## Specific question

State the question in one or two sentences. Examples:

- "Does the orchestrator's D1 score include the quality of its own manifests, or only the success of the agents it spawned?"
- "When the same root cause produces two different surface symptoms in the same session, is that one FailureRecord or two?"

A specific question is far easier to answer than a general one. If you have multiple questions, open one issue per question.

## Additional context

Optional. Domain you are working in (in generic terms fintech, devtools, content platform), team size, current adoption stage. Helps the maintainers tailor the answer.
