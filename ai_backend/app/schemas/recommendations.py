"""Öneri motoru (recommendations) endpoint'i için istek/yanıt şemaları."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.workout import Goal


class MacroSample(BaseModel):
    """Tek bir günün toplam makro alımı (gram cinsinden)."""

    model_config = ConfigDict(extra="forbid")

    protein: float = 0
    carb: float = 0
    fat: float = 0


class RecommendationRequest(BaseModel):
    """``POST /recommendations`` istek gövdesi."""

    model_config = ConfigDict(extra="forbid")

    student_id: str | None = None
    goal: Goal
    recent_weights: list[float] = Field(default_factory=list, max_length=365)
    recent_macros: list[MacroSample] = Field(default_factory=list, max_length=365)
    adherence_days: int = Field(0, ge=0, le=365)


class Recommendation(BaseModel):
    """Tek bir öneri kartı."""

    model_config = ConfigDict(extra="forbid")

    category: Literal["nutrition", "workout", "recovery", "adherence"]
    priority: Literal["low", "medium", "high"]
    title: str
    detail: str


class RecommendationResponse(BaseModel):
    """``POST /recommendations`` yanıt gövdesi."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["success"]
    summary: str
    recommendations: list[Recommendation]
