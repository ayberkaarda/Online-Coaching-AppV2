"""Uygulama giriş noktası: ``create_app()`` factory ve uvicorn entrypoint'i."""

from __future__ import annotations

import time

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi.middleware import SlowAPIMiddleware

from app.core.config import get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import RequestContextMiddleware, configure_logging
from app.core.rate_limit import limiter, register_rate_limit_handler
from app.routers import health, nutrition, recommendations, workout


def create_app() -> FastAPI:
    """Yapılandırılmış bir FastAPI uygulaması oluşturur ve döndürür."""
    settings = get_settings()
    configure_logging(settings)

    # A-13: production'da /docs, /redoc, /openapi.json kapalı — tam uç envanteri +
    # şema keşfini kimliksiz olarak dışarı vermez. Development/staging'de açık kalır.
    docs_url = None if settings.is_production else "/docs"
    redoc_url = None if settings.is_production else "/redoc"
    openapi_url = None if settings.is_production else "/openapi.json"

    app = FastAPI(
        title=settings.app_name,
        description="Koçluk platformu için antrenman/beslenme planı üretimi ve öneri motoru servisi.",
        version=settings.version,
        docs_url=docs_url,
        redoc_url=redoc_url,
        openapi_url=openapi_url,
    )

    app.state.start_time = time.monotonic()
    app.state.limiter = limiter

    # Middleware ekleme sırası önemli: Starlette'te en SON eklenen middleware en
    # DIŞTA (outermost) çalışır. CORSMiddleware'i en son ekliyoruz ki rate-limit
    # (429) ve beklenmeyen hata (500) yanıtları da dahil TÜM response'lara CORS
    # header'ları eklensin.
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(GZipMiddleware, minimum_size=500)
    # ASLA allow_origins=["*"] + allow_credentials=True birlikte kullanılmaz.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type", "X-API-Key", "X-Request-ID"],
    )

    register_exception_handlers(app, settings)
    register_rate_limit_handler(app)

    app.include_router(health.router)
    app.include_router(workout.router)
    app.include_router(workout.legacy_router)
    app.include_router(nutrition.router)
    app.include_router(nutrition.legacy_router)
    app.include_router(recommendations.router)

    return app


app = create_app()


if __name__ == "__main__":
    # Yerel/konteyner geliştirme girişi; Dockerfile'daki CMD de aynı şekilde tüm
    # arayüzlere bind eder (container dışına erişim için gerekli).
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=False)  # noqa: S104
