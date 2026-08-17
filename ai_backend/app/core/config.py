"""Uygulama ayarları (pydantic-settings tabanlı)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

import structlog
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = structlog.get_logger("app")

_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class Settings(BaseSettings):
    """Ortam değişkenlerinden (ve ``.env`` dosyasından) okunan uygulama ayarları."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_name: str = "Coaching AI Backend"
    version: str = "1.0.0"
    environment: Literal["development", "staging", "production"] = "development"

    cors_origins: list[str] = ["http://localhost:3000"]

    api_key: str | None = None

    rate_limit: str = "60/minute"

    log_level: str = "INFO"
    log_json: bool = True

    data_dir: Path = _DEFAULT_DATA_DIR

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value: object) -> object:
        """Ortam değişkeninden virgülle ayrılmış string olarak gelen origin listesini parse eder."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @model_validator(mode="after")
    def _enforce_api_key_policy(self) -> Settings:
        """A-04: ``api_key_guard`` production'da fail-open olamaz.

        ``ENVIRONMENT=production`` iken ``API_KEY`` ayarlanmamışsa uygulama
        başlangıcında (bu ``Settings`` nesnesi inşa edilir edilmez) açık bir
        hatayla düşer — sessizce kimliksiz erişime açık kalmaz. Development/
        staging'de mevcut esnek (no-op guard) davranış korunur, ama bunun
        bilinçli bir yapılandırma olduğu başlangıçta loglanır.
        """
        if self.api_key is None:
            if self.is_production:
                msg = (
                    "API_KEY ortam değişkeni production'da zorunludur. "
                    "ENVIRONMENT=production iken API_KEY ayarlanmadan başlatma reddedildi "
                    "(fail-closed guard, bkz. A-04)."
                )
                raise ValueError(msg)
            logger.warning(
                "api_key_not_set",
                environment=self.environment,
                message=(
                    "API_KEY ayarlanmamış: api_key_guard bu ortamda no-op olarak çalışacak "
                    "(tüm uçlar kimliksiz erişilebilir). Yalnızca development/staging için kabul "
                    "edilebilir; production'da bu durum başlangıç hatasına döner."
                ),
            )
        return self


@lru_cache
def get_settings() -> Settings:
    """Uygulama boyunca tekil (cached) ``Settings`` örneğini döndürür."""
    return Settings()
