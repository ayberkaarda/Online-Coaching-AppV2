"""Ortak/paylaşılan pydantic modelleri."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class FoodItem(BaseModel):
    """CSV'den okunan/temizlenen tek bir besin kaydı."""

    model_config = ConfigDict(extra="forbid")

    name: str
    calories_per_100g: float = Field(..., ge=0)


class ExerciseItem(BaseModel):
    """CSV'den okunan/temizlenen tek bir egzersiz kaydı."""

    model_config = ConfigDict(extra="forbid")

    name: str
    body_part: str = ""
    target: str = ""
    equipment: str = ""
    gif_url: str = ""
    image: str = ""


class ErrorDetail(BaseModel):
    """Standart hata gövdesindeki tek bir doğrulama hatası girdisi."""

    model_config = ConfigDict(extra="forbid")

    loc: str
    message: str
    type: str


class ErrorBody(BaseModel):
    """Standart API hata gövdesi: ``{"error": {...}}``."""

    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    request_id: str | None = None
    details: list[ErrorDetail] | None = None


class ErrorResponse(BaseModel):
    """Tüm hata response'larının sarmalayıcısı."""

    model_config = ConfigDict(extra="forbid")

    error: ErrorBody
