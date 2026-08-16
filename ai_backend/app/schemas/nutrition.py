"""Beslenme (nutrition) endpoint'leri için istek/yanıt şemaları."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.workout import Goal

Gender = Literal["male", "female"]


class NutritionAnalyzeRequest(BaseModel):
    """``POST /analyze/nutrition`` istek gövdesi.

    Eski ``POST /api/generate-ai-diet`` endpoint'i de (geriye dönük
    uyumluluk için) aynı şemayı kullanır.
    """

    model_config = ConfigDict(extra="forbid")

    age: int = Field(..., ge=10, le=100)
    height_cm: float = Field(..., gt=80, lt=260)
    weight_kg: float = Field(..., gt=20, lt=400)
    gender: Gender
    steps: int = Field(..., ge=0, le=100000)
    goal: Goal
    user_prompt: str = Field("", max_length=2000)


class MacroTargets(BaseModel):
    """Hesaplanan günlük makro ve kalori hedefleri."""

    model_config = ConfigDict(extra="forbid")

    protein_g: float
    carb_g: float
    fat_g: float
    calories: int


class NutritionAnalyzeResponse(BaseModel):
    """``POST /analyze/nutrition`` yanıt gövdesi."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["success"]
    target_calories: int
    ai_analysis: str
    diet_plan: dict[str, str]
    macro_targets: MacroTargets


# Geriye dönük uyumluluk için eski isimler de dışa açılıyor.
DietRequest = NutritionAnalyzeRequest
