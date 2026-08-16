"""Sağlık kontrolü (health check) endpoint'leri."""

from __future__ import annotations

import time

from fastapi import APIRouter, Request

from app.core.config import get_settings
from app.core.rate_limit import exempt

router = APIRouter(tags=["health"])


@router.get("/health")
@exempt
async def health(request: Request) -> dict[str, object]:
    """Liveness kontrolü: servis ayakta mı ve ne kadar süredir çalışıyor."""
    settings = get_settings()
    start_time = getattr(request.app.state, "start_time", time.monotonic())
    uptime_seconds = max(0.0, time.monotonic() - start_time)
    return {
        "status": "ok",
        "version": settings.version,
        "uptime_seconds": round(uptime_seconds, 2),
    }


@router.get("/health/ready")
@exempt
async def health_ready(request: Request) -> dict[str, object]:
    """Readiness kontrolü: servisin trafik almaya hazır olup olmadığını doğrular."""
    settings = get_settings()
    data_dir_ok = settings.data_dir.exists()
    checks = {"data_dir": data_dir_ok}
    ready = all(checks.values())
    return {
        "status": "ready" if ready else "not_ready",
        "checks": checks,
    }
