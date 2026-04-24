# Compliance Evidence

**What each control plane capability contributes to compliance frameworks.**

This framework is not a compliance product. It does not certify
anything. But the artifacts the control plane produces — audit log,
trust scores, FailureRecords, gate records, override logs — are
exactly the kinds of evidence compliance frameworks ask for.

This document maps the framework's outputs to the relevant frameworks
so that adopters know what they get for free and what they still owe.

---

## Caveat — Read First

The framework provides **control evidence**. It does not provide
compliance certifications. EU AI Act high-risk system status, NIST AI
RMF maturity, SOC 2 attestation, and HIPAA readiness all require
organizational processes that go beyond what any single framework can
deliver. The contribution is concrete: defined evidence with defined
schemas, ready to be presented to auditors.

Always verify with your compliance, legal, and audit teams before
representing any of this as certified status.

---

## EU AI Act

The EU AI Act treats certain agent systems as **high-risk AI systems**.
High-risk systems carry obligations including risk management, data
governance, human oversight, accuracy/robustness, and post-market
monitoring.

### What This Framework Contributes

| EU AI Act Requirement | Framework Capability | Evidence Produced |
|---|---|---|
| Risk management system (Art. 9) | Pre-spawn protocol; risk classification; HITL gates | `gate_records`, manifest with `riskLevel`, audit log |
| Data governance and quality (Art. 10) | Truth ownership matrix; single-writer rules per data store | Schema definitions; write-rule documentation |
| Technical documentation (Art. 11) | Architecture, operating model, control plane docs | This repo, plus reference implementation docs |
| Record-keeping (Art. 12) | Append-only audit log; correlation ID threading | `audit_log` rows; replayable session histories |
| Transparency to deployers (Art. 13) | Capability boundaries; agent rosters; trust tier visibility | Instruction files; trust ledger |
| Human oversight (Art. 14) | HITL gates; APPROVAL gates; Boardroom escalation | Gate records; approval rationale fields |
| Accuracy, robustness, cybersecurity (Art. 15) | Hook system; fail-closed defaults; audit log integrity | Hook configurations; degraded-mode events |
| Post-market monitoring (Art. 17) | Trust scoring; FailureRecords; recurrence detection | Trust ledger; failure library |
| Reporting of serious incidents (Art. 62) | Incident management flow; FailureRecord with severity | Failure records with P0/P1 severity flagged |

### What You Still Owe

- A documented risk management process at the organizational level
  that uses these artifacts
- Conformity assessment procedures
- Quality management system
- Notification to supervisory authorities for serious incidents

The framework gives you the data inputs. The compliance program is
yours.

---

## NIST AI RMF

The NIST AI Risk Management Framework organizes AI risk activities
into four functions: **Govern, Map, Measure, Manage**.

### What This Framework Contributes — Per Function

#### Govern

| RMF Govern subcategory | Framework Capability |
|---|---|
| GOVERN 1.1 — legal and regulatory requirements understood | Compliance evidence section (this document) |
| GOVERN 1.2 — risk management policies | Pre-spawn protocol; HITL gates |
| GOVERN 2 — accountability structures | Manager agent pattern; agents-as-employees model |
| GOVERN 3 — workforce diversity, equity (org concern) | (out of scope for technical framework) |
| GOVERN 4 — culture of risk consciousness | Failure memory; recurrence detection; meta-governance section |
| GOVERN 5 — engagement with relevant AI actors | Reference implementation status; case studies |
| GOVERN 6 — third-party risk policies | Runtime policy integration; adapter pattern |

#### Map

| RMF Map subcategory | Framework Capability |
|---|---|
| MAP 1 — context characterization | Capability boundaries; domain enums; risk classification |
| MAP 2 — categorization of AI systems | Agent vs service rubric; classification table |
| MAP 3 — capabilities and characteristics | Agent roster; instruction files; trust history |
| MAP 4 — risks and benefits to all relevant AI actors | Pre-spawn risk classification; gate types per risk |
| MAP 5 — impacts to individuals and society | Customer impact field on FailureRecords; severity classification |

#### Measure

| RMF Measure subcategory | Framework Capability |
|---|---|
| MEASURE 1 — appropriate methods identified | D1-D4 trust scoring with calibration anchors |
| MEASURE 2 — trustworthiness evaluated | Score evolution over n_sessions; confidence band |
| MEASURE 3 — mechanisms for tracking risks over time | Trust ledger; FailureRecord recurrenceCount; audit log replay |
| MEASURE 4 — feedback about effectiveness | Failure library; pre-task retrieval as feedback to next session |

#### Manage

| RMF Manage subcategory | Framework Capability |
|---|---|
| MANAGE 1 — risks prioritized and treated | risk_level enum; trust gates; HITL gating |
| MANAGE 2 — strategies to maximize benefits | Promotion process; autonomy gate expansion |
| MANAGE 3 — risks of third-party entities | Runtime policy adapter; shadow-to-enforce migration |
| MANAGE 4 — risk treatments documented and monitored | FailureRecord prevention artifacts; closure tags |

### What You Still Owe

- Organizational policy that ties these technical artifacts to
  decision-making
- Stakeholder engagement processes
- Risk tolerance definitions specific to your domain
- Periodic review cycles at the organization level

---

## SOC 2

SOC 2 evaluates controls relevant to **Security, Availability,
Processing Integrity, Confidentiality, and Privacy**. The trust
service criteria most relevant to agent systems are Security,
Availability, and Processing Integrity.

### What This Framework Contributes

#### Security

| SOC 2 Concern | Framework Capability |
|---|---|
| Logical access controls | Capability boundaries; hook-enforced operator-zone |
| Change management | Pre-spawn protocol; HITL approval; manifest required for medium/high risk |
| Audit logging | Append-only audit log; correlation ID; before/after state |
| Incident response | Incident management flow; FailureRecord lifecycle |

#### Availability

| SOC 2 Concern | Framework Capability |
|---|---|
| Recovery from incidents | Recovery protocols (operating model § agent lifecycle); degraded mode |
| System monitoring | Audit log; meta-governance signals; trust score drift detection |

#### Processing Integrity

| SOC 2 Concern | Framework Capability |
|---|---|
| Inputs valid and authorized | AgentTaskManifest schema validation; hook-enforced manifest |
| Processing complete and accurate | QA verdict; verification required field; trust scoring D1 |
| Outputs delivered to right destinations | Truth ownership matrix; single-writer rules |

### Evidence Outputs

For a SOC 2 audit period, the framework produces:

- Audit log rows for the audit window (append-only, queryable)
- Trust ledger entries per session
- FailureRecords with prevention artifacts
- Gate records (HITL, delegation, escalation, approval)
- Override usage log (operator overrides with rationale and TTL)
- Hook configuration history (kept under version control)

These are the inputs to a SOC 2 control narrative. They are not a
SOC 2 attestation by themselves.

### What You Still Owe

- Control descriptions written for your environment
- Continuous monitoring and management responses
- Independent auditor engagement
- Sample selection and walk-through preparation

---

## HIPAA Readiness

HIPAA applies when the system processes Protected Health Information
(PHI). The framework's contributions to HIPAA readiness center on the
**administrative, physical, and technical safeguards** required by the
Security Rule.

### What This Framework Contributes

| HIPAA Concern | Framework Capability |
|---|---|
| Access controls (164.312(a)) | Capability boundaries; hook-enforced operator-zone; trust tier gating |
| Audit controls (164.312(b)) | Append-only audit log; correlation IDs; replayable history |
| Integrity controls (164.312(c)) | Truth ownership; cryptographic chaining option; before/after capture |
| Authentication (164.312(d)) | Operator identity in actor_id; subagent inheritance rules; override identity capture |
| Transmission security (164.312(e)) | (delegated to runtime policy layer; not in this framework) |
| Information access management (164.308(a)(4)) | Promotion/demotion process; capability boundary changes audited |
| Audit log retention | Append-only design supports long retention; partitioning for cost |
| Incident reporting (164.308(a)(6)) | Incident management flow; FailureRecord severity flagging |

### What You Still Owe

- Business associate agreements
- PHI flow diagrams
- Risk analysis specific to PHI handling
- Workforce training
- Physical safeguards
- Encryption and transmission security at the infrastructure layer
- Breach notification procedures

The framework operates at the agent governance layer; PHI handling
infrastructure is a separate concern that this framework can sit
above but does not implement.

---

## Cross-Framework Evidence Inventory

The same artifacts serve multiple frameworks. Build the artifact once;
present it to each.

| Artifact | EU AI Act | NIST AI RMF | SOC 2 | HIPAA |
|---|---|---|---|---|
| Audit log (append-only) | Art. 12 | Measure 3 | Audit logging | 164.312(b) |
| Trust ledger | Art. 9, 17 | Measure 2 | Processing integrity | — |
| Failure library | Art. 17, 62 | Govern 4; Manage 4 | Incident response | 164.308(a)(6) |
| AgentTaskManifest | Art. 11 | Map 1 | Change management | — |
| Gate records | Art. 14 | Govern 2 | Logical access | 164.308(a)(4) |
| Override log | Art. 14 | Manage 1 | Logical access | 164.312(a) |
| Capability boundaries | Art. 13 | Map 1 | Logical access | 164.312(a) |
| Truth ownership matrix | Art. 10 | Map 1 | Processing integrity | 164.312(c) |

This is the framework's central proposition for compliance: one
disciplined operating model produces evidence usable by multiple
frameworks simultaneously.

---

## Evidence Hygiene

To remain auditable, the evidence has to retain certain properties:

- **Append-only.** Already covered. The most consequential property.
- **Time-bounded.** Each event is timestamped to the second.
- **Identity-bound.** Every event has an actor.
- **Correlation-traceable.** A correlation ID links related events.
- **Schema-validated.** Records conform to schemas; malformed records
  do not enter the log.

A pile of unstructured text is not evidence; it is something an
auditor will discount. Schemas and append-only-ness are what turn
records into evidence.

---

## Limitations

This framework's contributions to compliance are real but bounded:

- It governs agent behavior. It does not govern model selection,
  training data, or model output safety.
- It captures evidence. It does not interpret regulations for you.
- It operates above runtime infrastructure. Network security, key
  management, encryption-in-transit are runtime concerns, not
  framework concerns.
- It tracks behavioral trust. It does not certify that an agent's
  outputs are factually correct, unbiased, or non-discriminatory.
  Those are concerns for the model layer and the application layer.

The framework's claim is narrow and specific: **whether agents can be
trusted to do what they do, over time, with auditable evidence.** Read
the safety separation statement in
`docs/control-plane/meta-governance.md` and the framework's main
README for the full distinction.

---

## Related

- `docs/control-plane/audit-trail-patterns.md` — the audit log design
  that produces most of the evidence above.
- `docs/control-plane/hitl-gates.md` — the gate types referenced
  throughout.
- `docs/operating-model/incident-management.md` — the incident
  reporting flow.
- `docs/concepts/trust-scoring.md` — the scoring model whose outputs
  appear in the evidence inventory.
