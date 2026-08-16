"""Uygulama ayarları (pydantic-settings tabanlı)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

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


@lru_cache
def get_settings() -> Settings:
    """Uygulama boyunca tekil (cached) ``Settings`` örneğini döndürür."""
    return Settings()
