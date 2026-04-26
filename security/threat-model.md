# Threat Model

> **Scope:** This threat model covers the agentic workforce framework
> control plane: agent spawn authorization, manifest validation, hook
> enforcement, audit trail integrity and trust scoring. It does not
> cover model output safety or application-layer business logic.

## Framework Threat Categories

This framework uses a control-risk structure covering seven threat
classes relevant to autonomous agent systems.

## Threat Table

This threat model uses the STRIDE framework (Spoofing, Tampering,
Repudiation, Information Disclosure, Denial of Service, Elevation
of Privilege) to categorize threats. The framework's control
surface maps primarily to Spoofing, Tampering, Repudiation,
Information Disclosure and Elevation of Privilege. Denial of
Service is partially in scope for this framework: hook layer
availability failures can block agent spawns in enforce mode.
Infrastructure-level DoS (network attacks, database flooding)
remains out of scope and belongs to the infrastructure layer.

| STRIDE Category | Threat | Example | Control | Enforced By | Evidence |
|---|---|---|---|---|---|
| Spoofing | Manifest spoofing | Agent spawn references a fabricated or replayed task ID | session_id match + issuedAt TTL check + AJV schema validation | PreToolUse hook (check-agent-spawn) | manifest sidecar + audit log entry |
| Tampering / Elevation of Privilege | Prompt injection | User input instructs agent to ignore its manifest or bypass scope | Hook validates outside the prompt body; manifest is the contract, not the prompt | PreToolUse hook; sidecar manifest read independently | audit log; manifest file mtime |
| Elevation of Privilege | Scope creep | Agent edits files outside its declared manifest domains | File lock enforcement; agent boundary rule in instruction file; post-tool validation | check-lock hook + check-locked-states hook; PostToolUse audit | agent_events table; lock release audit trail |
| Elevation of Privilege | Approval bypass | HIGH-risk task spawns without HITL approval | hitlApproved=true required in manifest for HIGH/CRITICAL risk; hook blocks spawn if false | PreToolUse hook step 12 (HITL gate) | gate_records table; manifest sidecar |
| Tampering / Repudiation | Audit tampering | Agent edits or overwrites its own audit log entries | Audit log is append-only; PostToolUse hook is the only writer; agents have no write access to audit log | check-audit-write hook; append-only constraint in audit_log table | audit_log table (append-only); hook enforcement |
| Tampering | Trust inflation | Agent self-assigns or inflates its own D1-D4 trust scores | No-self-scoring rule enforced in every agent instruction file; Eval/Telemetry Service is the only writer to trust_scores | Operator scoring protocol; trust_scores table write access | trust_scores table; scoring rubric evidence requirement |
| Information Disclosure | Cross-workspace leakage | Agent in Workspace A reads manifests or bulletin entries from Workspace B | workspace_id scoping in all enterprise schema tables; file-based governance uses per-workspace directories | Postgres RLS (enterprise schema); directory structure (file-based) | agent_events.workspace_id; workspaces table |
| Denial of Service | Hook or audit dependency unavailable | Audit bridge outage or manifest directory unreadable causes all agent spawns to block in enforce mode | Shadow/enforce mode separation; operator override with TTL; audit bridge degradation policy (log to stderr, do not block allow decisions) | HOOK_MODE environment variable; deny() audit failure policy | hook stderr logs; override audit trail |

## Control Design Principles

1. **Fail closed by default.** Any hook error blocks the action.
   `exit(2)` = hard block. Unknown state = block, not allow.

2. **Manifest is the contract, not the prompt.** The hook reads the
   sidecar manifest file independently of the agent's prompt body.
   Prompt content cannot override manifest controls.

3. **Description carries only a pointer.** The Agent tool description
   field carries `[MANIFEST:taskId]` only. No policy, secrets or
   business logic in the description.

4. **Human approval is recorded, not assumed.** HITL approval is
   explicit: `hitlApproved=true` in the manifest, with a `gate_record`
   entry. Silence is not approval.

5. **Audit trail is tamper-resistant by design.** Agents cannot write
   to the audit log. The PostToolUse hook writes it. Append-only
   constraint prevents modification.

6. **Trust is behavioral, not assigned.** No agent starts with earned
   trust. Every agent starts PROVISIONAL. Trust accumulates through
   scored sessions with evidence.

## Threat Model Scope Exclusions

This threat model does not cover:

- Model output hallucination or harmful content (model provider layer)
- Application-layer authorization (IAM layer)
- Network-level security (infrastructure layer)
- Regulatory compliance certification (requires legal review)
- Runtimes other than Claude Code (hook behavior is runtime-specific)
