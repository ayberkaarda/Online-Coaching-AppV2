"""API key doğrulama bağımlılığı (opsiyonel)."""

from __future__ import annotations

import secrets
from typing import Annotated

from fastapi import Depends, Header, status

from app.core.config import Settings, get_settings
from app.core.errors import AppError


async def api_key_guard(
    settings: Annotated[Settings, Depends(get_settings)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
) -> None:
    """``settings.api_key`` ayarlanmışsa ``X-API-Key`` header'ını sabit-zamanlı karşılaştırır.

    ``settings.api_key`` ``None`` ise (ayarlanmamışsa) bu dependency no-op'tur.
    """
    if settings.api_key is None:
        return

    if x_api_key is None or not secrets.compare_digest(x_api_key, settings.api_key):
        raise AppError(
            "Geçersiz veya eksik API anahtarı.",
            code="unauthorized",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
