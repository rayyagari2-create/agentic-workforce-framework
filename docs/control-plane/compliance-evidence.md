# Compliance Evidence

**What each control plane capability contributes to EU AI Act,
NIST AI RMF, SOC 2, and HIPAA readiness.**

This document maps the framework's control plane to the evidence each
of four major compliance frameworks expects. The framework
**contributes evidence supporting** these frameworks; it does not, on
its own, constitute end-to-end compliance.

The distinction is load-bearing: an organization's compliance posture
is the responsibility of that organization. The framework provides
the artifacts (audit trails, gate records, trust scores, failure
records, policy logs) that those compliance processes consume.

---

## How to Read This Document

Each framework section answers two questions:

1. **What does the framework expect?** A short, accurate restatement
   of the relevant control area.
2. **What does the control plane contribute?** The specific
   capability, the artifact it produces, and the limitation on what
   that artifact alone can show.

The phrasing convention is **"contributes evidence supporting"** —
not "complies with" and not "satisfies." Every claim is bounded.

---

## EU AI Act

The EU AI Act establishes a risk-tiered regulatory regime for AI
systems. The control plane contributes evidence to the obligations
applicable to high-risk AI systems and general-purpose AI systems.

| AI Act Obligation Area | Control Plane Contribution | Limitation |
|---|---|---|
| Risk management system | Pre-spawn risk classification (LOW / MEDIUM / HIGH / CRITICAL) per task; risk-tier escalation; recurrence detection | Risk classification is per-task; framework does not produce the system-level risk assessment the Act requires |
| Data and data governance | Failure library taxonomy provides traceable failure-class records; trust scores capture per-agent behavioral evolution | Does not address training-data lineage or representativeness |
| Technical documentation | Audit trail captures every control plane action with before/after state and correlation IDs | Documentation requirements extend beyond audit logs (e.g., model cards, system architecture descriptions) |
| Recordkeeping | Append-only audit log; per-session agent runs; per-decision gate records; immutable failure records | Records cover agent operation; do not cover end-user interactions unless those are routed through the framework |
| Transparency / instructions for use | Manifest format captures task definition, risk level, and prior-failure context; trust tier visible to operators | The framework does not generate end-user-facing transparency artifacts |
| Human oversight | HITL gates at HIGH risk; APPROVAL gates at CRITICAL risk; Boardroom sessions; override marker creates auditable exception path | Oversight mechanisms are evidence; effectiveness depends on the human reviewers' actual scrutiny |
| Accuracy, robustness, cybersecurity | Trust scoring D1 (correctness) and D2 (observability) capture per-session quality; failure memory drives recurrence detection | Does not measure model-level accuracy or hallucination rates — those are model-provider concerns |
| Post-market monitoring | Trust score evolution over time; failure record recurrence; routine-based alerting | Framework provides the operational data feed; the post-market monitoring system itself is organizational |
| Serious incident reporting | Audit trail provides reconstructable forensic record per correlation ID; failure records capture incident classification | Reporting workflow to authorities is outside framework scope |

**What the framework contributes most directly:** A defensible answer
to "show me the human oversight" and "show me the audit trail." Both
are append-only, correlation-ID-threaded, and reconstructable.

---

## NIST AI RMF (AI 100-1)

The NIST AI Risk Management Framework organizes AI risk management
into four functions: GOVERN, MAP, MEASURE, MANAGE. The control plane
contributes evidence across all four.

### GOVERN

| RMF Subcategory (selected) | Control Plane Contribution |
|---|---|
| GV-1 — Policies, processes, procedures | Pre-spawn protocol, build state machine, HITL gates, hook system are documented procedures with enforcement |
| GV-3 — Roles and responsibilities | Approval authority levels (Team / Division / Enterprise); delegation rules with TTL; role-gated authority distinct from invocation rights |
| GV-4 — Accountability structures | Audit trail with `actor_id` on every entry; Boardroom decision records; trust score evolution per agent instance |
| GV-6 — Stakeholder engagement | Self-reporting protocol mandates bulletin writes at every transition (operator visibility) |

### MAP

| RMF Subcategory (selected) | Control Plane Contribution |
|---|---|
| MP-1 — AI system context | AgentTaskManifest captures task scope, domain, files in scope, prior failure context |
| MP-3 — Risk identification | Risk classification table; pre-task failure retrieval; recurrence escalation thresholds |
| MP-5 — Impacts characterization | Risk levels are explicit (LOW → CRITICAL); higher levels require explicit human acknowledgment |

### MEASURE

| RMF Subcategory (selected) | Control Plane Contribution |
|---|---|
| MS-1 — Methods identified for testing | QAVerdict format captures per-AC pass/fail with evidence; trust score evidence requirement (one line per dimension) |
| MS-2 — Performance assessed | D1-D4 trust scoring with calibration anchors; confidence band reflects sample size; recency weighting decays old data |
| MS-4 — Feedback mechanisms | Failure library with three-tag close; evolution queue captures `pass_with_notes` observations |

### MANAGE

| RMF Subcategory (selected) | Control Plane Contribution |
|---|---|
| MG-1 — Risk responses | Trust tier degradation is automatic; Boardroom escalation is explicit; agent retirement is a recorded decision |
| MG-2 — Risk treatment documented | Manifest captures decisions; gate records capture rationale; audit log captures before/after on every mutation |
| MG-3 — Risks from third-party AI | Runtime policy adapter wraps upstream policy SDK; degraded mode behavior defined when third-party layer unavailable |
| MG-4 — Risk treatment monitored | Recurrence count drives escalation; routine layer enables scheduled monitoring |

**What the framework contributes most directly to NIST AI RMF:** A
working implementation of GOVERN-3 (roles and responsibilities) and
MEASURE-2 (performance assessed) that is observable, append-only, and
defensible.

---

## SOC 2

SOC 2 is organized around five trust service criteria. The framework
is most relevant to **Security**, **Availability**, and **Processing
Integrity**, with auxiliary contribution to **Confidentiality**.

### Security (Common Criteria)

| Criterion (selected) | Control Plane Contribution |
|---|---|
| CC2.1 — Information communicated to those responsible | Self-reporting protocol; bulletin writes at every transition; Chief-of-Staff Agent flags anomalies for operator review |
| CC4.1 — Internal control monitoring | Trust scoring captures per-session performance; failure library captures recurrence; routine layer runs scheduled monitoring |
| CC5.1 — Logical access controls | Capability boundaries per agent; role-gated approval authority; control plane directory is operator-zone (no agent access) |
| CC6.1 — Logical access — provisioning | Persistent agent identity with cryptographic DID; agent instance lifecycle (active / suspended / archived); workspace assignment |
| CC6.6 — Logical access — modifications | Operational lifecycle mutability rule limits which fields can change; every mutation emits an audit entry |
| CC7.2 — System monitoring | Routine-based scheduled checks; PR scan routines; alert triage routine |
| CC7.3 — Detection and monitoring of incidents | Failure library with classification; recurrence escalation; 3-strike rule on QA failures |
| CC8.1 — Change management | HITL gates at HIGH/CRITICAL; control plane changes require Boardroom session; hook updates are CRITICAL-risk by default |
| CC9.1 — Risk mitigation activities | Pre-spawn risk classification; failure retrieval; trust tier downgrade on D4 violations |

### Availability

| Criterion | Control Plane Contribution |
|---|---|
| A1.2 — Environmental protections, software, data backup | Audit log append-only with point-in-time recovery (database tier); cryptographic chaining (Wave 1+) |
| A1.3 — Recovery testing | Recovery protocols defined per failure mode in `meta-governance.md` |

### Processing Integrity

| Criterion | Control Plane Contribution |
|---|---|
| PI1.1 — System processing accuracy | Build state machine has no skippable states; QA-Agent verdict is the only path to COMPLETE; hook layer enforces invariants |
| PI1.2 — Processing input validation | AgentTaskManifest schema validation; QAVerdict schema validation; FailureRecord schema validation |
| PI1.3 — Processing completeness | SESSION COMPLETE blocked without QA PASS; bulletin entries required at every transition |
| PI1.4 — Processing output validity | PostToolUse hooks validate side effects of audit-relevant actions |
| PI1.5 — Processing output stored completely | Audit trail captures before/after for every lifecycle mutation; correlation ID threading enables reconstruction |

### Confidentiality

| Criterion | Control Plane Contribution |
|---|---|
| C1.1 — Confidential information identified | Capability boundaries identify which agents may access which data scopes; cross-schema writes prohibited |
| C1.2 — Disposal of confidential information | Agent instance archived state; delegation TTL prevents indefinite extension of authority |

**What the framework contributes most directly to SOC 2:** Strong
evidence for CC2 (communication), CC4 (monitoring), CC5 (access),
CC6 (provisioning/modifications), CC8 (change management), and the
Processing Integrity criteria. These are the areas where a working
operational system + audit trail is exactly the artifact a SOC 2
auditor expects.

---

## HIPAA Readiness

HIPAA's Security Rule applies to electronic Protected Health
Information (ePHI). The framework does not, on its own, make a system
HIPAA-compliant — that requires the entire data handling stack
(encryption at rest and in transit, BAA contracts, ePHI segregation,
breach notification process, etc.) to be in scope.

The framework contributes evidence to several **Administrative
Safeguards** and the **Audit Controls** technical safeguard.

### Administrative Safeguards (45 CFR § 164.308)

| Standard | Control Plane Contribution |
|---|---|
| § 164.308(a)(1)(ii)(D) — Information system activity review | Audit trail with append-only retention; routine-based scheduled review |
| § 164.308(a)(2) — Assigned security responsibility | Approval authority levels; Boardroom session as final escalation point |
| § 164.308(a)(3) — Workforce security | Role-gated authority distinct from invocation; trust tier as evidence of demonstrated trustworthiness |
| § 164.308(a)(4) — Information access management | Capability boundaries per agent; cross-schema writes prohibited |
| § 164.308(a)(5)(ii)(C) — Log-in monitoring | Audit trail captures every action with `actor_id` and timestamp |
| § 164.308(a)(6) — Security incident procedures | Failure library captures incidents; meta-governance recovery protocols |
| § 164.308(a)(7)(ii)(B) — Disaster recovery plan | Recovery protocols in `meta-governance.md`; audit trail point-in-time recovery |
| § 164.308(a)(8) — Evaluation | Trust scoring with calibration anchors; recurrence detection drives improvement |

### Technical Safeguards (45 CFR § 164.312)

| Standard | Control Plane Contribution |
|---|---|
| § 164.312(b) — Audit controls | Append-only audit log with cryptographic signing (Wave 1+); correlation-ID threading enables reconstruction |
| § 164.312(c)(1) — Integrity (ePHI alteration/destruction) | Operational lifecycle mutability rule + audit before/after capture provides evidence of every mutation |
| § 164.312(d) — Person or entity authentication | AGT DID for agent identity; `actor_id` on every audit entry — note: this addresses agent-actor authentication, not end-user authentication |

**Key limitation for HIPAA readiness:** The framework provides the
audit, integrity, and oversight mechanisms. It does **not** address:

- Encryption of ePHI at rest or in transit
- Business Associate Agreements with subprocessors
- ePHI minimum-necessary disclosure logic
- Breach notification workflow
- Patient access rights (45 CFR § 164.524) and amendment rights
  (§ 164.526)

A HIPAA readiness assessment must address those areas through other
controls. The framework's contribution is bounded to the
administrative-and-audit surface.

---

## Cross-Framework Mapping (At a Glance)

| Control Plane Capability | EU AI Act | NIST AI RMF | SOC 2 | HIPAA |
|---|---|---|---|---|
| Pre-spawn protocol | Risk management; recordkeeping | MAP-3, MAP-5 | CC9.1, PI1.1 | § 164.308(a)(1) |
| Build state machine | Recordkeeping; transparency | MEASURE | PI1.1, PI1.3 | § 164.312(b) |
| HITL gates | Human oversight | GOVERN-3, MANAGE-1 | CC5, CC8 | § 164.308(a)(3) |
| Hook system | Cybersecurity (enforcement) | GOVERN-1 | CC5, CC6, CC8 | § 164.312(c)(1) |
| Audit trail | Recordkeeping; serious incident reporting | GOVERN-4, MEASURE | CC2, CC4, PI1.5, A1.2 | § 164.312(b) |
| Trust scoring | Accuracy; post-market monitoring | MEASURE-2 | CC4, CC7 | § 164.308(a)(8) |
| Failure library | Post-market monitoring | MAP-3, MEASURE-4, MANAGE-4 | CC7.3 | § 164.308(a)(6) |
| Capability boundaries | Robustness | GOVERN-3 | CC5, CC6 | § 164.308(a)(4) |
| Meta-governance recovery protocols | Risk management | MANAGE-1 | A1.3 | § 164.308(a)(7) |

---

## What This Document Is Not

This document is **not**:

- A compliance certification
- A substitute for organizational compliance assessment
- A claim that adopting the framework satisfies any of these
  frameworks end-to-end
- Legal or regulatory advice

The framework's value to compliance is **operational evidence**.
Compliance frameworks audit organizations for whether the right
practices are in place and whether the evidence supports the claim.
The control plane produces the evidence in a form that is append-only,
threaded by correlation ID, and reconstructable. That is what a
compliance review consumes.

If a regulator or auditor asks "show me how a HIGH-risk AI action was
reviewed and approved," the framework produces an answer. If they
ask "are you EU AI Act compliant," that is a question for the
organization's compliance function, not the framework.

---

## Wave Status of Compliance-Relevant Capabilities

| Capability | Status | Notes |
|---|---|---|
| Audit trail (file-based) | LIVE | Git history is recovery path |
| Audit trail (database, append-only) | Wave 2 | Cryptographic chaining; point-in-time recovery |
| Trust scoring with evidence requirement | LIVE | Manual scoring; automated nightly routine in Wave 3+ |
| HITL gates | LIVE (single-workspace) / Wave 3+ (chains) | Gate chains and delegation TTL are enterprise-scale extensions |
| Hook layer | LIVE | OS-level enforcement, fail-closed |
| Runtime policy SDK adapter | LIVE shadow / Wave 1 enforcement | Provides upstream evidence (sub-ms enforcement; OWASP coverage) |
| Persistent agent identity + DID | Wave 1 | Identity persists across workspaces |
| Approval gate chains | Wave 3+ | Multi-authority delegation chains |
| Routine-based scheduled monitoring | Wave 1 | PR scans; alert triage |

The maturity gradient matters for compliance evidence: capabilities
labeled `Wave 3+` are designed but not field-proven. A compliance
assessment must reflect actual implementation maturity, not the
designed end state.

---

## Related

- `audit-trail-patterns.md` — the trail that compliance evidence
  draws from
- `hitl-gates.md` — the human oversight mechanism
- `hook-system.md` — the enforcement layer
- `meta-governance.md` — failure-mode recovery protocols
- `pre-spawn-protocol.md` — risk management at the per-task level
- `build-state-machine.md` — processing integrity surface
