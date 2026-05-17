"""QAVerdict — Pydantic v2 model for QA verification output.

Mirrors schemas/v1/qa-verdict.schema.json.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, Field


_ULID_PATTERN = r"^[0-9A-HJKMNP-TV-Z]{26}$"


class QADecision(str, Enum):
    pass_ = "pass"
    pass_with_notes = "pass_with_notes"
    fail = "fail"
    block_release = "block_release"


class DefectClass(str, Enum):
    schema_violation = "schema_violation"
    state_desync = "state_desync"
    render_error = "render_error"
    api_contract_break = "api_contract_break"
    date_time_handling = "date_time_handling"
    null_reference = "null_reference"
    race_condition = "race_condition"
    prompt_regression = "prompt_regression"
    data_loss = "data_loss"
    security_vulnerability = "security_vulnerability"
    performance_degradation = "performance_degradation"
    ux_regression = "ux_regression"
    policy_violation = "policy_violation"
    truth_ownership = "truth_ownership"


class Novelty(str, Enum):
    new = "new"
    repeat = "repeat"
    unknown = "unknown"


class Escalation(str, Enum):
    none = "none"
    fix_agent = "fix-agent"
    reviewer = "reviewer"
    escalated_review = "escalated_review"
    human_approval = "human_approval"


class FindingSeverity(str, Enum):
    critical = "critical"
    major = "major"
    minor = "minor"
    info = "info"


class TrustScoreDeltaAgent(str, Enum):
    orchestrator = "orchestrator"
    qa_agent = "qa-agent"
    fix_agent = "fix-agent"
    executor = "executor"
    reviewer = "reviewer"


class TrustScoreDirection(str, Enum):
    increment = "increment"
    decrement = "decrement"


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    category: str
    description: str
    severity: FindingSeverity
    file: Optional[str] = None
    lineRange: Optional[str] = None


class TrustScoreDelta(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    agentId: Optional[TrustScoreDeltaAgent] = None
    dimension: Optional[str] = None
    direction: Optional[TrustScoreDirection] = None
    reason: Optional[str] = None


class QAVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    verdictId: Annotated[str, Field(pattern=_ULID_PATTERN)]
    taskId: Annotated[str, Field(pattern=_ULID_PATTERN)]
    qaDecision: QADecision
    defectClass: Optional[DefectClass] = None
    novelty: Optional[Novelty] = None
    repeatReferenceIds: Optional[List[str]] = None
    findings: Annotated[List[Finding], Field(min_length=1)]
    recommendedPreventionArtifact: Optional[str] = None
    missingEval: Optional[str] = None
    recommendedEscalation: Optional[Escalation] = None
    trustScoreDelta: Optional[TrustScoreDelta] = None
    timestamp: datetime
    correlationId: Optional[str] = None


__all__ = [
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
]
