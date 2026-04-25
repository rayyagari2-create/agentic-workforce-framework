# Security Policy

The Agentic Workforce Framework ships schemas, SQL, and hook patterns that are intended to govern autonomous agent behavior. Security issues in these artifacts even in examples can propagate into downstream deployments. We take them seriously.

> This is a reference framework, not a hosted service. There is no
> production endpoint, no hosted control plane, and no managed
> deployment. The artifacts shipped here are documentation, schemas,
> SQL, and example code intended to be adopted into your own stack.

---

## Supported Versions

Only the latest v1.x release receives security fixes. Once v2.0 ships, v1.x will receive security fixes for a further six months, after which it will be marked unsupported.

| Version | Supported |
|---|---|
| v1.x (current) | Yes security fixes and patch releases |
| Pre-v1.0 | No |

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

**Never include secrets, credentials, or sensitive material in issues, PRs,
or comments — public or private.** That includes API keys, tokens, session
cookies, customer data, internal hostnames, tenant identifiers, and excerpts
from private logs. If a reproduction requires sensitive data, redact it
before sending and describe the shape of the data instead.

Report vulnerabilities privately by emailing **security@agentic-workforce-framework.org** (placeholder confirm the maintainer email in the repo maintainer list before depending on it).

Alternatively, use GitHub's private vulnerability reporting on this repository: Security tab → Report a vulnerability.

### What to include in your report

- A description of the vulnerability and the artifact affected (schema, SQL file, hook example, documentation)
- Steps to reproduce, or a proof-of-concept
- The impact you believe this has on deployments that use this framework
- Any suggested mitigation or fix

We will acknowledge receipt within **three business days** and provide an initial assessment within **ten business days**.

---

## Classes of Vulnerability We Care About

This framework is not a running service, so the typical vulnerability classes differ from a web application. The ones that matter here:

**Schema vulnerabilities**

- JSON schemas that fail to constrain input in a way that allows injection into downstream consumers
- Schema fields that encourage storing secrets or PII without constraint
- Ambiguous validation that allows semantic drift across implementations

**SQL vulnerabilities**

- DDL that omits row-level security (RLS) guidance where it is load-bearing
- Migration patterns that could violate the append-only audit guarantee
- Default privileges that are too permissive

**Hook pattern vulnerabilities**

- Example hooks that fail open on error (any hook must fail closed if an example does not, it is a vulnerability)
- Example hooks that could be bypassed by path manipulation, environment variable injection, or subagent spawn
- Audit-log examples that could be silenced by a caller

**Documentation vulnerabilities**

- Documentation that suggests governance patterns that could be bypassed in practice
- Overclaims of enforcement strength in a way that would mislead an adopter into under-protecting a deployment

---

## Responsible Disclosure

We follow a coordinated disclosure model:

1. You report privately.
2. We acknowledge and investigate.
3. We develop a fix, tested against the reference implementation patterns.
4. We coordinate a release date with the reporter.
5. We publish a patched version with a security advisory.
6. After the advisory, the reporter may publish details.

**Timeline:** we target a 90-day maximum from report to public advisory. Vulnerabilities with active exploitation in the wild are accelerated.

**Credit:** reporters are credited in the security advisory unless they prefer to remain anonymous. We do not offer bug bounties at this time.

---

## Safe Harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, destruction of data, and interruption of services
- Report vulnerabilities through the channels described above
- Give us reasonable time to address the issue before public disclosure
- Do not exploit the vulnerability beyond what is necessary to demonstrate it

---

## What not to publish in PRs and issues

Contributors must not include any of the following in PRs, issues, comments,
or discussion threads on this repository:

- Tokens, API keys, OAuth secrets, or any other credential
- Tenant IDs, organization IDs, or customer-identifying values
- Real customer data, session transcripts, or user-identifiable content
- Production logs or audit-log excerpts that contain real identifiers
- Internal system names, hostnames, environment names, or private URLs
- Real file paths from a private repository — use placeholders
- Internal ticket numbers or links to private trackers

If you discover that any of the above was accidentally committed, contact
the maintainers privately via the channel in "Reporting a Vulnerability"
above so the repository history can be addressed.

---

## Dependencies

This framework has no runtime dependencies it ships documentation, schemas, SQL, and example code. Schema validation uses AJV or any JSON Schema Draft 2020-12 validator; vulnerabilities in those validators are not in scope here and should be reported upstream.

---

## Downstream Adopter Guidance

If you have adopted this framework and discover a vulnerability in your own implementation that stems from framework guidance, report it here so we can update the guidance. We are especially interested in:

- Patterns from the docs that turned out to be exploitable in practice
- Assumptions in the framework that did not hold in production
- Enforcement gaps between what the docs describe and what the examples implement

Reports of this kind are the most valuable they improve the framework for everyone.
