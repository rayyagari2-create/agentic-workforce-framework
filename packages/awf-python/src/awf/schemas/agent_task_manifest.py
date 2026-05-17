"""AgentTaskManifest — Pydantic v2 model for the agent task contract.

Mirrors schemas/v1/agent-task-manifest.schema.json. Field names preserved
in camelCase to match the JSON schema exactly.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, Field


_ULID_PATTERN = r"^[0-9A-HJKMNP-TV-Z]{26}$"


class TaskType(str, Enum):
    feature = "feature"
    bug = "bug"
    refactor = "refactor"
    security = "security"
    eval = "eval"
    migration = "migration"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class VerificationMethod(str, Enum):
    unit_test = "unit_test"
    integration_test = "integration_test"
    schema_validation = "schema_validation"
    manual_verification = "manual_verification"
    qa_agent_review = "qa_agent_review"
    code_review = "code_review"
    escalated_review = "escalated_review"
    human_approval = "human_approval"


class AssignedAgent(str, Enum):
    orchestrator = "orchestrator"
    qa_agent = "qa-agent"
    fix_agent = "fix-agent"
    executor = "executor"
    reviewer = "reviewer"


class TaskResult(str, Enum):
    pass_ = "pass"
    fail = "fail"
    partial = "partial"


# Domain is an open string in the schema — implementations may constrain it.
Domain = str


class PriorFailureContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    failureId: str
    preventionCheck: str


class AgentTaskManifest(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    taskId: Annotated[str, Field(pattern=_ULID_PATTERN)]
    taskType: TaskType
    taskDescription: Optional[str] = None
    domains: Annotated[List[Domain], Field(min_length=1)]
    riskLevel: RiskLevel
    interfacesTouched: Annotated[List[str], Field(min_length=1)]
    contractsReferenced: Optional[List[str]] = None
    verificationRequired: Annotated[List[VerificationMethod], Field(min_length=1)]
    blockingDependencies: Optional[List[str]] = None
    priorFailureContext: Optional[List[PriorFailureContext]] = None
    evalPlan: Optional[str] = None
    assignedAgent: AssignedAgent
    createdAt: datetime
    completedAt: Optional[datetime] = None
    result: Optional[TaskResult] = None
    correlationId: Optional[str] = None


__all__ = [
    "AgentTaskManifest",
    "AssignedAgent",
    "Domain",
    "PriorFailureContext",
    "RiskLevel",
    "TaskResult",
    "TaskType",
    "VerificationMethod",
]
