"""Öneri motoru (recommendations) router'ı."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.rate_limit import limiter
from app.core.security import api_key_guard
from app.schemas.recommendations import RecommendationRequest, RecommendationResponse
from app.services.recommendation_engine import build_recommendations

router = APIRouter(tags=["recommendations"], dependencies=[Depends(api_key_guard)])


@router.post("/recommendations", response_model=RecommendationResponse)
@limiter.limit("20/minute")
async def create_recommendations(request: Request, payload: RecommendationRequest) -> RecommendationResponse:
    """Geçmiş kilo/makro/uyum verilerine göre deterministik, kural-tabanlı öneriler üretir."""
    return build_recommendations(payload)
