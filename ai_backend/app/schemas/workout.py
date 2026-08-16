"""Antrenman (workout) endpoint'leri için istek/yanıt şemaları."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SplitType = Literal["ppl_torso_limbs", "ppl", "upper_lower", "torso_limbs"]
Goal = Literal["cut", "bulk", "maintain"]


class WorkoutAnalyzeRequest(BaseModel):
    """``POST /analyze/workout`` istek gövdesi.

    Eski ``POST /api/generate-ai-workout`` endpoint'i de (geriye dönük
    uyumluluk için) aynı şemayı kullanır.
    """

    model_config = ConfigDict(extra="forbid")

    split_type: SplitType
    user_prompt: str = Field("", max_length=2000)
    age: int = Field(..., ge=10, le=100)
    goal: Goal
    weight: float = Field(..., gt=20, lt=400)


class WorkoutAnalyzeResponse(BaseModel):
    """``POST /analyze/workout`` yanıt gövdesi."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["success"]
    message: str
    ai_analysis: str
    workout_plan: dict[str, str]


# Geriye dönük uyumluluk için eski isimler de dışa açılıyor.
WorkoutRequest = WorkoutAnalyzeRequest
