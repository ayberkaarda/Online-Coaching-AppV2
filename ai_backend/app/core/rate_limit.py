"""slowapi tabanlı rate limiting yapılandırması.

``limiter``, uygulama genelinde paylaşılan tek bir ``Limiter`` örneğidir.
Router modülleri (``@limiter.limit("20/minute")``, ``@limiter.exempt``)
ve ``create_app()`` (``app.state.limiter``) aynı örneği kullanmalıdır —
slowapi'nin decorator'ları, kaydedildikleri ``Limiter`` örneğine bağlıdır.

``Settings.rate_limit`` (varsayılan ``"60/minute"``) ilk ``get_settings()``
çağrısında (bu modülün import edildiği anda) okunur ve ``default_limits``
olarak uygulanır. Testlerde farklı bir limit istenirse, bu modül import
edilmeden önce ilgili ortam değişkeni (``RATE_LIMIT``) ayarlanmalı ve
``get_settings.cache_clear()`` çağrılmalıdır.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, cast

from fastapi import Request, status
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import get_settings

if TYPE_CHECKING:
    from fastapi import FastAPI

limiter = Limiter(key_func=get_remote_address, default_limits=[get_settings().rate_limit])


def exempt[F: Callable[..., Awaitable[object]]](func: F) -> F:
    """``limiter.exempt``'in tip-güvenli sarmalayıcısı.

    slowapi'nin ``exempt`` metodu tip açıklaması içermiyor; mypy strict modda
    doğrudan ``@limiter.exempt`` kullanımı dekore edilen fonksiyonu "untyped"
    hale getirir. Bu sarmalayıcı, tek bir yerde bu sınırı kapatır: 3. parti
    kütüphanenin tipsiz metodu bilinçli olarak burada çağrılıyor.
    """
    return cast(F, limiter.exempt(func))  # type: ignore[no-untyped-call]


def register_rate_limit_handler(app: FastAPI) -> None:
    """``RateLimitExceeded`` için standart hata gövdesi döndüren handler'ı kaydeder."""

    @app.exception_handler(RateLimitExceeded)
    async def _handle_rate_limit_exceeded(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": {
                    "code": "rate_limit_exceeded",
                    "message": "İstek sınırı aşıldı. Lütfen daha sonra tekrar deneyin.",
                    "request_id": request_id,
                    "details": None,
                }
            },
        )
