"""FailureRecord — Pydantic v2 model for the structured failure record.

Mirrors schemas/v1/failure-record.schema.json.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, List, Optional

from pydantic import BaseModel, ConfigDict, Field


_FAILURE_ID_PATTERN = r"^FAIL-\d{4}-\d{2}-\d{2}-\d{3}$"


class AgentId(str, Enum):
    orchestrator = "orchestrator"
    qa_agent = "qa-agent"
    fix_agent = "fix-agent"
    executor = "executor"
    reviewer = "reviewer"


class FailureClass(str, Enum):
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
    truth_ownership = "truth_ownership"
    client_side_truth = "client_side_truth"
    policy_violation = "policy_violation"
    scope_violation = "scope_violation"
    hook_bypass = "hook_bypass"


class Severity(str, Enum):
    P0 = "P0"
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"


class DetectionSource(str, Enum):
    qa_agent = "qa_agent"
    fix_agent = "fix_agent"
    human_reviewer = "human_reviewer"
    automated_test = "automated_test"
    runtime_monitoring = "runtime_monitoring"
    user_report = "user_report"


class FailureStatus(str, Enum):
    open = "open"
    investigating = "investigating"
    fix_in_progress = "fix_in_progress"
    resolved = "resolved"
    wont_fix = "wont_fix"


class FixTag(str, Enum):
    hotfix_only = "hotfix-only"
    hotfix_plus_prevention = "hotfix-plus-prevention"
    systemic_refactor_required = "systemic-refactor-required"


class PreventionArtifactType(str, Enum):
    regression_test = "regression_test"
    schema_validation = "schema_validation"
    guardrail = "guardrail"
    skill_update = "skill_update"
    instruction_update = "instruction_update"
    policy_update = "policy_update"
    memory_update = "memory_update"
    trust_adjustment = "trust_adjustment"
    contract_update = "contract_update"


# Domain is an open string in the schema.
Domain = str


class PreventionArtifact(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    type: PreventionArtifactType
    location: str
    description: Optional[str] = None


class FailureRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    failureId: Annotated[str, Field(pattern=_FAILURE_ID_PATTERN)]
    timestamp: datetime
    domain: Domain
    agentsInvolved: Annotated[List[AgentId], Field(min_length=1)]
    files: Annotated[List[str], Field(min_length=1)]
    symptom: str
    rootCause: str
    failureClass: FailureClass
    severity: Severity
    userImpact: str
    detectionSource: DetectionSource
    recommendedPrevention: Optional[str] = None
    regressionTestAdded: Optional[bool] = None
    preventionArtifacts: Optional[List[PreventionArtifact]] = None
    recurrenceCount: Annotated[int, Field(ge=1)]
    repeatOfFailureIds: Optional[List[str]] = None
    status: FailureStatus
    rootCauseConfirmed: Optional[bool] = None
    fixTag: FixTag
    correlationId: Optional[str] = None


__all__ = [
    "AgentId",
    "DetectionSource",
    "Domain",
    "FailureClass",
    "FailureRecord",
    "FailureStatus",
    "FixTag",
    "PreventionArtifact",
    "PreventionArtifactType",
    "Severity",
]
