# Contributing to the Agentic Workforce Framework

Thank you for your interest in contributing. This framework is production-informed from a private reference implementation and benefits most from contributions that reflect real-world adoption experience.

Contributions are welcome in three distinct areas. Each has its own process.

---

## 1. Concepts and Documentation

Corrections, clarifications, and additions to the framework docs under `/docs/`.

**What we accept:**

- Corrections to factual or logical errors in concept, architecture, operating-model, or control-plane documents
- Clarifications where existing text is ambiguous or could mislead an adopter
- Missing cross-references between documents
- Expansions to the glossary
- Improvements to diagrams or worked examples

**Process:**

1. Open a GitHub issue first for anything larger than a typo use the "Concept question" template for design questions and a plain bug report for factual errors.
2. For a small correction you can send a PR directly. Keep the PR scoped to the single change.
3. For a substantive change, discuss in the issue before writing.
4. Every PR that modifies documentation must run through the extraction safety check: no references to private repositories, product names, or internal paths. The PR template includes this checkbox.
5. Include a one-paragraph rationale in the PR description. Explain the reader problem the change solves, not just what you changed.

**What we do not accept in concepts and docs:**

- Speculative concepts that have not been validated in at least one real implementation
- Promotional content for third-party tools or libraries
- Renaming of core terms without prior discussion terms are load-bearing across many files

---

## 2. Case Studies

Adoption stories from teams who have implemented or adapted the framework. Case studies are one of the most valuable contribution types because they test whether the framework holds up outside its origin context.

**What we accept:**

- Single-team adoption stories
- Multi-team extensions (especially v3.0 multi-workspace feedback)
- Adaptations where you changed the framework to fit your domain we want to know what you changed and why
- Honest reports where parts of the framework did not work for you

**Process:**

1. Start from [`examples/case-studies/TEMPLATE.md`](examples/case-studies/TEMPLATE.md) copy it into a new file `examples/case-studies/<your-team-or-project>.md`.
2. Sanitize before submission. Do not include customer names, internal agent names that reveal product strategy, or trade secrets. The case study should be useful to a reader who knows nothing about your business.
3. Include the required sections from the template: context, what you adopted, what you adapted, measured outcomes, what did not work.
4. Open a PR. A maintainer will review for clarity and sanitization before merge.

**What we prioritize:**

A case study that documents what you *adapted* is more useful than one that documents what you kept. If the framework worked perfectly as-is, the interesting signal is whether it can flex. If you adapted substantially, write that up honestly.

---

## 3. Schema Extensions

Proposals for new JSON schemas, new versions of existing schemas, or extensions to SQL governance schemas.

**What we accept:**

- New schemas that cover capabilities not in v1.0 (e.g., gate records, work queue items when v2.0 opens)
- New versions of existing schemas submitted as `schemas/v2/` and up, never as a modification to a shipped version
- Additive SQL extensions to `database/governance/` or `database/enterprise/`

**Process:**

1. Open a schema-extension request issue describing: the problem the schema solves, what must be in it, what consumers of the schema look like, and why it cannot be handled by an existing schema.
2. Include a backward-compatibility statement. If the change is additive and backward-compatible, say so. If it is breaking, a new version path is required.
3. Once scope is agreed, submit a PR containing the schema, a README update, and at least one worked example in `examples/`.
4. Every schema must be AJV Draft 2020-12 compatible. Run validation locally before submitting.
5. Schemas must be generic. No domain-specific enums (no product feature names, no business-specific categories) unless the schema is explicitly scoped to that domain.

**Hard rules for schema changes:**

- Shipped schemas in `schemas/v1/` are frozen. Breaking changes require a new `v2/` path.
- A schema change that alters the append-only audit log contract is a breaking change.
- A schema change that adds a required field is a breaking change.
- A schema change that widens an enum or adds an optional field is additive and can ship as a minor version.

---

## Public-safe content rules

Every contribution must be publishable in a public repository without exposing
private material. The following are not accepted in any PR:

- Product-specific examples drawn from a private codebase (rewrite as generic)
- Proprietary company references, internal team names, or branded product names
- Real customer data, session transcripts, or user-identifiable content
- Patent-sensitive implementation details (formulas, scoring weights, or
  ranking logic that is commercially significant)
- Real file paths from a private repository — use placeholders such as
  `[PROJECT_REPO]`, `path/to/your/project-conventions.md`, or `<workspace>/`
- Internal operational identifiers (tenant IDs, environment names, hostnames,
  ticket numbers from private trackers)

If you are unsure whether a given example is public-safe, generalize it before
submitting and note the change in the PR description.

---

## Status labels for capability claims

Any PR that introduces a new capability claim — in docs, schemas, or examples —
must label it using the four-label legend defined in the README:

- **Implemented** — used in the reference implementation today
- **Reference Pattern** — architecture pattern ready for adoption, not tied to
  a specific product implementation
- **Experimental** — actively being validated in the reference implementation
- **Planned** — future roadmap concept, not yet designed or built

Rules:

- Governance claims (anything asserting that the framework enforces, blocks,
  scores, or audits something) require either evidence from the reference
  implementation or a `Reference Pattern` / `Planned` label. Unevidenced
  governance claims will be rejected.
- A capability moves to `Implemented` only after sustained use in the
  reference implementation. New work is at most `Experimental` until then.
- The Implementation Status table in the README is the canonical list.
  PRs that add capabilities must update that table.

---

## Pull Request Checklist

Every PR must:

- [ ] Pass the extraction safety check no private repository names, product names, or internal paths
- [ ] Use public-safe placeholders for any file paths
- [ ] Apply a status label (Implemented / Reference Pattern / Experimental / Planned) to any new capability claim
- [ ] Include a rationale in the description schema changes additionally require a backward-compatibility statement
- [ ] Touch only the scope described in the title
- [ ] Update relevant cross-references if terms or paths change
- [ ] Update `CHANGELOG.md` for any user-visible change

---

## Communication

- For questions: open an issue with the "Concept question" template.
- For bugs: open an issue with the bug report template.
- For security issues: follow [SECURITY.md](SECURITY.md), do not open a public issue.

---

## Code of Conduct

Treat other contributors as colleagues. Assume good faith. Disagree with ideas, not people. A framework that governs autonomous agent behavior is held to a high standard; the community building it should be too.
