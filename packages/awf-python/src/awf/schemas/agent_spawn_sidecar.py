"""AgentSpawnSidecar — Pydantic v2 model for hook-readable spawn authorization.

Mirrors schemas/v1/agent-spawn-sidecar.schema.json. Field names use the same
mixed snake_case + camelCase shape as the JSON schema (e.g. ``session_id``
alongside ``taskId``) — this matches the wire format the hook reads.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


_ULID_PATTERN = r"^[0-9A-HJKMNP-TV-Z]{26}$"


class AgentRole(str, Enum):
    orchestrator = "orchestrator"
    agent_srv = "agent-srv"
    agent_fe = "agent-fe"
    qa_agent = "qa-agent"
    fix_agent = "fix-agent"
    security_check = "security-check"
    code_review = "code-review"
    chief_of_staff = "chief-of-staff"
    deep_research = "deep-research"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class AgentSpawnSidecar(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    taskId: Annotated[str, Field(pattern=_ULID_PATTERN)]
    session_id: str
    runtime_subagent_type: Literal["general-purpose"] = "general-purpose"
    agent_role: AgentRole
    riskLevel: RiskLevel
    riskClass: str
    domains: Annotated[List[str], Field(min_length=1)]
    hitlApproved: bool
    issuedAt: datetime
    promptHash: str
    tool_use_id: Optional[str] = None


__all__ = [
    "AgentRole",
    "AgentSpawnSidecar",
    "RiskLevel",
]
