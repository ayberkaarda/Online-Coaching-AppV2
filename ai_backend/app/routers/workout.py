"""Antrenman (workout) router'ı.

``POST /analyze/workout`` yeni sözleşme yoludur. ``POST
/api/generate-ai-workout`` eski (deprecated) yoldur ve aynı service
fonksiyonunu çağırarak birebir aynı davranışı sürdürür.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.rate_limit import limiter
from app.core.security import api_key_guard
from app.schemas.workout import WorkoutAnalyzeRequest, WorkoutAnalyzeResponse
from app.services.workout_generator import generate_workout

router = APIRouter(tags=["workout"], dependencies=[Depends(api_key_guard)])

# A-03: legacy_router, router ile AYNI guard + hız sınırı disiplinine tabidir.
# api_key_guard'sız veya @limiter.limit'siz yeni bir route eklenirse bu bilinçli
# olmalı; aksi halde deprecated uç, korumanın tamamını atlatan bir arka kapı olur.
legacy_router = APIRouter(tags=["workout", "deprecated"], dependencies=[Depends(api_key_guard)])


@router.post("/analyze/workout", response_model=WorkoutAnalyzeResponse)
@limiter.limit("20/minute")
async def analyze_workout(request: Request, payload: WorkoutAnalyzeRequest) -> WorkoutAnalyzeResponse:
    """Verilen split tipi, hedef ve kullanıcı prompt'una göre haftalık antrenman planı üretir."""
    return generate_workout(payload)


@legacy_router.post(
    "/api/generate-ai-workout",
    response_model=WorkoutAnalyzeResponse,
    deprecated=True,
    summary="[Deprecated] bkz. POST /analyze/workout",
)
@limiter.limit("20/minute")
async def generate_ai_workout_legacy(request: Request, payload: WorkoutAnalyzeRequest) -> WorkoutAnalyzeResponse:
    """Eski (deprecated) antrenman üretim endpoint'i. Bkz. ``POST /analyze/workout``."""
    return generate_workout(payload)
