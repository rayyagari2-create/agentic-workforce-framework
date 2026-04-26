# Routines Roadmap

These are planned routine templates — not yet shipped in v1.0.

| Routine | Purpose | Status |
|---|---|---|
| r10-nightly-trust-score.md | Nightly automated D1-D4 trust scoring | Planned |
| r-alert-triage.md | Alert triage and routing routine | Planned |
| r-deploy-verification.md | Post-deploy verification routine | Planned |

These routines depend on infrastructure not yet in the
reference implementation:

- r10 requires the Eval/Telemetry Service write path to
  trust_scores to be operational.
- r-alert-triage requires a monitoring integration layer.
- r-deploy-verification requires a CI/CD integration layer.

Do not implement these until the v1.0 routines (R1 and R4)
are running reliably in your environment.
