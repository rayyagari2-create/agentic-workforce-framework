"""Re-export of all AWF schema models and enums.

Allows ``from awf.schemas import AgentTaskManifest, FailureRecord`` and similar.
"""

from __future__ import annotations

from awf.schemas.agent_spawn_sidecar import (
    AgentRole,
    AgentSpawnSidecar,
)
from awf.schemas.agent_spawn_sidecar import RiskLevel as SidecarRiskLevel
from awf.schemas.agent_task_manifest import (
    AgentTaskManifest,
    AssignedAgent,
    PriorFailureContext,
    RiskLevel,
    TaskResult,
    TaskType,
    VerificationMethod,
)
from awf.schemas.agent_trust_score import (
    AgentTrustScore,
    ConfidenceBand,
    SessionScore,
    TrustDimensions,
    TrustTier,
)
from awf.schemas.agent_trust_score import AgentId as TrustAgentId
from awf.schemas.failure_record import (
    AgentId,
    DetectionSource,
    FailureClass,
    FailureRecord,
    FailureStatus,
    FixTag,
    PreventionArtifact,
    PreventionArtifactType,
    Severity,
)
from awf.schemas.qa_verdict import (
    DefectClass,
    Escalation,
    Finding,
    FindingSeverity,
    Novelty,
    QADecision,
    QAVerdict,
    TrustScoreDelta,
    TrustScoreDeltaAgent,
    TrustScoreDirection,
)

__all__ = [
    # AgentTaskManifest
    "AgentTaskManifest",
    "AssignedAgent",
    "PriorFailureContext",
    "RiskLevel",
    "TaskResult",
    "TaskType",
    "VerificationMethod",
    # FailureRecord
    "AgentId",
    "DetectionSource",
    "FailureClass",
    "FailureRecord",
    "FailureStatus",
    "FixTag",
    "PreventionArtifact",
    "PreventionArtifactType",
    "Severity",
    # QAVerdict
    "DefectClass",
    "Escalation",
    "Finding",
    "FindingSeverity",
    "Novelty",
    "QADecision",
    "QAVerdict",
    "TrustScoreDelta",
    "TrustScoreDeltaAgent",
    "TrustScoreDirection",
    # AgentTrustScore
    "AgentTrustScore",
    "ConfidenceBand",
    "SessionScore",
    "TrustAgentId",
    "TrustDimensions",
    "TrustTier",
    # AgentSpawnSidecar
    "AgentRole",
    "AgentSpawnSidecar",
    "SidecarRiskLevel",
]
