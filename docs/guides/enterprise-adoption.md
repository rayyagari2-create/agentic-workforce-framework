# Enterprise Adoption

**Multi-workspace, Division Orchestrator, approval gate chains — what
"enterprise-ready" requires.**

Status: **[v3.0] — not yet shipped.**

The model is designed but not yet field-proven. Do not implement this
layer until the single-workspace governance schema is running reliably.

---

## Why This Page Is Short

The enterprise model is documented in detail across several places:

- `docs/architecture/enterprise-scaling.md` — the architecture
  (multi-workspace, Division Orchestrator, role-agent alignment)
- `database/enterprise/` — the schema extension (workspaces, agent
  instances, work queues, gate records, delegation)
- `docs/operating-model/manager-agent-pattern.md` § Enterprise — the
  operating model at scale

What this **guide** does not yet contain is the **adoption walkthrough**
— a sequenced playbook for moving from single-team to multi-team. That
walkthrough requires field experience the framework does not yet have.

---

## What "Not Yet Shipped" Means

The schemas, the operating model, and the architecture are documented.
You can read them. You can implement them.

What is missing:

- A reference deployment that has run multi-team for 8+ weeks
- Measured governance overhead at multi-team scale (the percentages
  in `docs/architecture/enterprise-scaling.md` are illustrative, not
  measured)
- Lessons learned from cross-team coordination failures
- Empirical thresholds for when to escalate to Division Orchestrator

The framework's published values do not include speculation. When the
multi-team experience exists, this page will fill in.

---

## What You Can Do in the Meantime

If you are facing multi-team scale and cannot wait:

### Read the Enterprise Architecture

Start with `docs/architecture/enterprise-scaling.md`. It defines:

- The role-agent alignment model (agents pool, roles assign)
- The Manager Agent / Division Orchestrator pattern
- Central policy + federated execution split
- Work queue architecture
- Persistent agent identity
- Approval gate chains

### Read the Schema Extension

`database/enterprise/` contains the SQL for:

- `divisions` and `workspaces`
- `workspace_agents` (role-agent assignment)
- `agent_instances` (persistent identity)
- `work_queue_items` (full lifecycle)
- `gate_records` (HITL / DELEGATION / ESCALATION / APPROVAL)
- `delegation_rules` (TTL-bounded, no re-delegation)

### Implement Single-Team First

Implement `docs/guides/single-team-adoption.md` for each team. Get
each team to TIER 2 stability. **Do not** stand up
cross-workspace machinery until at least two teams have been stable
single-workspace for 6+ weeks.

This is the most consequential advice on this page. Multi-team
machinery built on shaky single-team practice produces unworkable
governance overhead.

### Treat Yourself as the Reference Implementation

If you build the enterprise layer ahead of the framework's published
validation, you are the reference implementation. The framework
maintainers welcome contributions in that case:

- Empirical governance overhead measurements
- Cross-team failure patterns
- Refinements to thresholds
- Case studies (`examples/case-studies/`)

See `CONTRIBUTING.md` for how to submit findings.

---

## Why the Framework Is Honest About This

Most published governance frameworks claim enterprise-readiness without
proof. The pattern is consistent: rich documentation, no field data,
silent failures when teams adopt at scale.

This framework's published value is "production-informed reference
architecture" — single-workspace is field-proven; enterprise is
designed extension. Pretending otherwise would damage the value of
the parts that **are** field-proven.

When the enterprise model becomes field-proven, this guide will
expand. Until then, the honest content is short.

---

## Related

- `docs/architecture/enterprise-scaling.md` — the architecture detail.
- `docs/guides/single-team-adoption.md` — the prerequisite.
- `docs/operating-model/manager-agent-pattern.md` — Manager Agent and
  Division Orchestrator pattern.
- `database/enterprise/` — the schema extension.
- `examples/multi-team/` — the placeholder; ships when the enterprise
  layer is field-proven.
