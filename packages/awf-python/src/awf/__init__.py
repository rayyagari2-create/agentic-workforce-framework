"""Agentic Workforce Framework — Python SDK.

An operating model for autonomous agent teams.
Identity, task contracts, failure memory, trust scoring, and audit.

v0.2.0 ships the Pydantic v2 schema models for the v1 contracts:
AgentTaskManifest, FailureRecord, QAVerdict, AgentTrustScore, AgentSpawnSidecar.

Docs: https://github.com/rayyagari2-create/agentic-workforce-framework
"""

from awf.schemas.models import (
    AgentId,
    AgentRole,
    AgentSpawnSidecar,
    AgentTaskManifest,
    AgentTrustScore,
    AssignedAgent,
    ConfidenceBand,
    DefectClass,
    DetectionSource,
    Escalation,
    FailureClass,
    FailureRecord,
    FailureStatus,
    Finding,
    FindingSeverity,
    FixTag,
    Novelty,
    PreventionArtifact,
    PreventionArtifactType,
    PriorFailureContext,
    QADecision,
    QAVerdict,
    RiskLevel,
    SessionScore,
    Severity,
    SidecarRiskLevel,
    TaskResult,
    TaskType,
    TrustAgentId,
    TrustDimensions,
    TrustScoreDelta,
    TrustScoreDeltaAgent,
    TrustScoreDirection,
    TrustTier,
    VerificationMethod,
)

__version__ = "0.2.0"

__all__ = [
    "__version__",
    "AgentId",
    "AgentRole",
    "AgentSpawnSidecar",
    "AgentTaskManifest",
    "AgentTrustScore",
    "AssignedAgent",
    "ConfidenceBand",
    "DefectClass",
    "DetectionSource",
    "Escalation",
    "FailureClass",
    "FailureRecord",
    "FailureStatus",
    "Finding",
    "FindingSeverity",
    "FixTag",
    "Novelty",
    "PreventionArtifact",
    "PreventionArtifactType",
    "PriorFailureContext",
    "QADecision",
    "QAVerdict",
    "RiskLevel",
    "SessionScore",
    "Severity",
    "SidecarRiskLevel",
    "TaskResult",
    "TaskType",
    "TrustAgentId",
    "TrustDimensions",
    "TrustScoreDelta",
    "TrustScoreDeltaAgent",
    "TrustScoreDirection",
    "TrustTier",
    "VerificationMethod",
]
