"""Beslenme (nutrition) router'ı.

``POST /analyze/nutrition`` yeni sözleşme yoludur. ``POST
/api/generate-ai-diet`` eski (deprecated) yoldur ve aynı service
fonksiyonlarını çağırarak birebir aynı davranışı sürdürür.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.rate_limit import limiter
from app.core.security import api_key_guard
from app.schemas.nutrition import NutritionAnalyzeRequest, NutritionAnalyzeResponse
from app.services.diet_generator import generate_diet_plan
from app.services.nutrition_calculator import calculate_bmr, calculate_macro_targets, calculate_tdee

router = APIRouter(tags=["nutrition"], dependencies=[Depends(api_key_guard)])

legacy_router = APIRouter(tags=["nutrition", "deprecated"])


def _build_nutrition_response(payload: NutritionAnalyzeRequest) -> NutritionAnalyzeResponse:
    bmr = calculate_bmr(
        weight_kg=payload.weight_kg,
        height_cm=payload.height_cm,
        age=payload.age,
        gender=payload.gender,
    )
    tdee = calculate_tdee(bmr=bmr, steps=payload.steps, goal=payload.goal)
    target_calories = round(tdee)

    macro_targets = calculate_macro_targets(weight_kg=payload.weight_kg, target_calories=target_calories)
    diet_plan, ai_analysis = generate_diet_plan(payload, macro_targets)

    return NutritionAnalyzeResponse(
        status="success",
        target_calories=target_calories,
        ai_analysis=ai_analysis,
        diet_plan=diet_plan,
        macro_targets=macro_targets,
    )


@router.post("/analyze/nutrition", response_model=NutritionAnalyzeResponse)
@limiter.limit("20/minute")
async def analyze_nutrition(request: Request, payload: NutritionAnalyzeRequest) -> NutritionAnalyzeResponse:
    """Verilen antropometrik veriler ve hedefe göre günlük kalori/makro hedefi ve haftalık diyet planı üretir."""
    return _build_nutrition_response(payload)


@legacy_router.post(
    "/api/generate-ai-diet",
    response_model=NutritionAnalyzeResponse,
    deprecated=True,
    summary="[Deprecated] bkz. POST /analyze/nutrition",
)
async def generate_ai_diet_legacy(payload: NutritionAnalyzeRequest) -> NutritionAnalyzeResponse:
    """Eski (deprecated) diyet üretim endpoint'i. Bkz. ``POST /analyze/nutrition``."""
    return _build_nutrition_response(payload)
