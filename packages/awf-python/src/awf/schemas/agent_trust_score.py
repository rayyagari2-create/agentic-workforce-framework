"""AgentTrustScore — Pydantic v2 model for the per-agent-domain trust profile.

Mirrors schemas/v1/trust-score.schema.json. The schema title is "TrustScore"
but we expose it as ``AgentTrustScore`` per the SDK API.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AgentId(str, Enum):
    orchestrator = "orchestrator"
    qa_agent = "qa-agent"
    fix_agent = "fix-agent"
    executor = "executor"
    reviewer = "reviewer"


class TrustTier(str, Enum):
    HIGH = "HIGH"
    STANDARD = "STANDARD"
    RESTRICTED = "RESTRICTED"
    PROBATION = "PROBATION"
    PROVISIONAL = "PROVISIONAL"


class ConfidenceBand(str, Enum):
    PROVISIONAL = "PROVISIONAL"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


# Domain is an open string in the schema.
Domain = str


class SessionScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    d1: int = Field(ge=0, le=25)
    d1Evidence: str
    d2: int = Field(ge=0, le=25)
    d2Evidence: str
    d3: int = Field(ge=0, le=25)
    d3Evidence: str
    d4: int = Field(ge=0, le=25)
    d4Evidence: str
    total: int = Field(ge=0, le=100)


class TrustDimensions(BaseModel):
    model_config = ConfigDict(extra="forbid")

    correctness: float = Field(ge=0.0, le=1.0)
    repeatDefectRate: float = Field(ge=0.0, le=1.0)
    falseCompletionRate: float = Field(ge=0.0, le=1.0)
    catchEffectiveness: float = Field(ge=0.0, le=1.0)
    policyCompliance: float = Field(ge=0.0, le=1.0)
    contractStability: float = Field(ge=0.0, le=1.0)
    recoveryEffectiveness: float = Field(ge=0.0, le=1.0)
    regressionRecurrence: float = Field(ge=0.0, le=1.0)


class AgentTrustScore(BaseModel):
    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    agentId: AgentId
    domain: Domain
    trustTier: TrustTier
    sessionScore: SessionScore
    dimensions: TrustDimensions
    totalRuns: int = Field(ge=0)
    nSessions: int = Field(ge=0)
    confidenceBand: ConfidenceBand
    recencyWeight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    lastUpdated: datetime
    notes: Optional[str] = None


__all__ = [
    "AgentId",
    "AgentTrustScore",
    "ConfidenceBand",
    "Domain",
    "SessionScore",
    "TrustDimensions",
    "TrustTier",
]
