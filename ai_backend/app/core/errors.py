"""Özel exception sınıfları ve FastAPI exception handler'ları.

Kullanıcıya asla ham stack trace sızdırılmaz: production ortamında generic bir
mesaj + ``request_id`` döndürülür, development'ta ise hata detayı da eklenir.
Stack trace her zaman ``logger.exception`` ile loglanır.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import structlog
from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.core.config import Settings

logger = structlog.get_logger("app")


class AppError(Exception):
    """Tüm uygulamaya özel hataların temel sınıfı."""

    code: str = "app_error"
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None) -> None:
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        super().__init__(message)


class ValidationAppError(AppError):
    """İş kuralı düzeyinde bir doğrulama hatası (422)."""

    code = "validation_error"
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY


class NotFoundError(AppError):
    """İstenen kaynak bulunamadı (404)."""

    code = "not_found"
    status_code = status.HTTP_404_NOT_FOUND


class UpstreamError(AppError):
    """Bağımlı bir dış servis/kaynak hatası (502)."""

    code = "upstream_error"
    status_code = status.HTTP_502_BAD_GATEWAY


def _error_body(
    *,
    code: str,
    message: str,
    request_id: str | None,
    details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id,
            "details": details,
        }
    }


def _request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def register_exception_handlers(app: FastAPI, settings: Settings) -> None:
    """Tüm exception handler'ları verilen FastAPI uygulamasına kaydeder."""

    @app.exception_handler(AppError)
    async def _handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        logger.warning("app_error", code=exc.code, message=exc.message, status_code=exc.status_code)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(code=exc.code, message=exc.message, request_id=_request_id(request)),
        )

    @app.exception_handler(RequestValidationError)
    async def _handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "loc": ".".join(str(part) for part in error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
            for error in exc.errors()
        ]
        logger.info("validation_error", details=details)
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_body(
                code="validation_error",
                message="İstek gövdesi doğrulanamadı.",
                request_id=_request_id(request),
                details=details,
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def _handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "not_found" if exc.status_code == status.HTTP_404_NOT_FOUND else "http_error"
        message = exc.detail if isinstance(exc.detail, str) else "İstek işlenemedi."
        logger.info("http_exception", status_code=exc.status_code, detail=exc.detail)
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_body(code=code, message=message, request_id=_request_id(request)),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def _handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = _request_id(request)
        logger.exception("unhandled_error", request_id=request_id)

        if settings.is_production:
            message = "Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin."
        else:
            message = f"{exc.__class__.__name__}: {exc}"

        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body(code="internal_error", message=message, request_id=request_id),
        )
