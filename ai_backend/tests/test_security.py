"""Faz 1.5 güvenlik düzeltmelerinin regresyon testleri.

Kapsam:

* A-03 — ``legacy_router`` uçları (``/api/generate-ai-workout``, ``/api/generate-ai-diet``)
  artık ``router`` ile aynı ``api_key_guard`` + ``20/minute`` hız sınırına tabi.
* A-04 — ``API_KEY`` ayarlanmadan ``ENVIRONMENT=production`` ile başlatma reddedilir
  (fail-closed); development/staging'de mevcut esnek davranış korunur.
* A-09 — hız sınırı anahtarı, yalnızca geçerli ``X-API-Key`` eşliğinde gelen
  ``X-User-Id`` için kullanıcı bazlıdır; aksi halde IP bazlı ortak kovaya düşer.
* A-13 — production'da ``/docs``, ``/redoc``, ``/openapi.json`` kapalıdır (404).

``API_KEY``/``ENVIRONMENT`` gibi ortam değişkenlerine bağlı senaryolar, paylaşılan
``conftest.py`` fixture'larını (dev ortamı varsayımıyla kurulu) KULLANMAZ; her testin
kendi ``monkeypatch`` + ``get_settings.cache_clear()`` + taze ``create_app()`` akışı
vardır ve ``finally`` bloğunda ortamı/cache'i geri döndürür ki diğer testler etkilenmesin.

Hız sınırı testlerinde her senaryo BENZERSİZ bir ``X-User-Id`` (rastgele uuid4) kullanır:
``app.core.rate_limit.limiter`` process ömrü boyunca paylaşılan tek bir singleton'dır (bkz.
``rate_limit.py`` modül docstring'i) ve kovaları ``(endpoint, key_func sonucu)`` ile
tutar; sabit bir anahtar (ör. testclient'ın ortak "ip:testclient" kovası) kullanmak, bu
dosyadaki veya diğer test dosyalarındaki başka testlerle çapraz kirlenmeye yol açar.
"""

from __future__ import annotations

import uuid
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from starlette.requests import Request

from app.core.config import get_settings
from app.core.rate_limit import _rate_limit_key
from app.main import create_app

TEST_API_KEY = "test-only-api-key-do-not-use-in-prod"

VALID_WORKOUT_PAYLOAD: dict[str, Any] = {
    "split_type": "ppl",
    "user_prompt": "",
    "age": 25,
    "goal": "bulk",
    "weight": 80.0,
}

VALID_NUTRITION_PAYLOAD: dict[str, Any] = {
    "age": 25,
    "height_cm": 175.0,
    "weight_kg": 70.0,
    "gender": "male",
    "steps": 6000,
    "goal": "maintain",
    "user_prompt": "",
}


def _make_request(headers: dict[str, str], *, client_host: str = "127.0.0.1") -> Request:
    """Yalnızca ``.headers``/``.client`` okuyan ``_rate_limit_key`` için minimal ASGI Request."""
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345),
    }
    return Request(scope)


# ---------------------------------------------------------------------------
# A-03 — legacy_router artık api_key_guard + hız sınırına tabi
# ---------------------------------------------------------------------------


@pytest.fixture
def keyed_client(monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    """``API_KEY`` AYARLI, taze bir uygulama örneği — guard'lı senaryolar için."""
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    app = create_app()
    try:
        yield TestClient(app)
    finally:
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_legacy_generate_ai_workout_requires_api_key(keyed_client: TestClient) -> None:
    """Anahtarsız istek 401 döner (regresyon: eskiden 200 dönüyordu, bkz. audit §3.3)."""
    response = keyed_client.post("/api/generate-ai-workout", json=VALID_WORKOUT_PAYLOAD)
    assert response.status_code == 401


def test_legacy_generate_ai_diet_requires_api_key(keyed_client: TestClient) -> None:
    """Anahtarsız istek 401 döner (regresyon: eskiden 200 dönüyordu, bkz. audit §3.3)."""
    response = keyed_client.post("/api/generate-ai-diet", json=VALID_NUTRITION_PAYLOAD)
    assert response.status_code == 401


def test_legacy_generate_ai_workout_rejects_wrong_api_key(keyed_client: TestClient) -> None:
    response = keyed_client.post(
        "/api/generate-ai-workout",
        json=VALID_WORKOUT_PAYLOAD,
        headers={"X-API-Key": "wrong-key"},
    )
    assert response.status_code == 401


def test_legacy_generate_ai_diet_rejects_wrong_api_key(keyed_client: TestClient) -> None:
    response = keyed_client.post(
        "/api/generate-ai-diet",
        json=VALID_NUTRITION_PAYLOAD,
        headers={"X-API-Key": "wrong-key"},
    )
    assert response.status_code == 401


def test_legacy_generate_ai_workout_accepts_correct_api_key(keyed_client: TestClient) -> None:
    response = keyed_client.post(
        "/api/generate-ai-workout",
        json=VALID_WORKOUT_PAYLOAD,
        headers={"X-API-Key": TEST_API_KEY, "X-User-Id": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_legacy_generate_ai_diet_accepts_correct_api_key(keyed_client: TestClient) -> None:
    response = keyed_client.post(
        "/api/generate-ai-diet",
        json=VALID_NUTRITION_PAYLOAD,
        headers={"X-API-Key": TEST_API_KEY, "X-User-Id": str(uuid.uuid4())},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_legacy_generate_ai_workout_is_rate_limited(keyed_client: TestClient) -> None:
    """Legacy uç artık 20/minute'e tabi (regresyon: eskiden yalnızca varsayılan 60/minute'tü)."""
    headers = {"X-API-Key": TEST_API_KEY, "X-User-Id": str(uuid.uuid4())}
    statuses = [
        keyed_client.post("/api/generate-ai-workout", json=VALID_WORKOUT_PAYLOAD, headers=headers).status_code
        for _ in range(25)
    ]
    assert statuses[:20] == [200] * 20
    assert 429 in statuses[20:]


def test_legacy_generate_ai_diet_is_rate_limited(keyed_client: TestClient) -> None:
    """Legacy uç artık 20/minute'e tabi (regresyon: eskiden yalnızca varsayılan 60/minute'tü)."""
    headers = {"X-API-Key": TEST_API_KEY, "X-User-Id": str(uuid.uuid4())}
    statuses = [
        keyed_client.post("/api/generate-ai-diet", json=VALID_NUTRITION_PAYLOAD, headers=headers).status_code
        for _ in range(25)
    ]
    assert statuses[:20] == [200] * 20
    assert 429 in statuses[20:]


# ---------------------------------------------------------------------------
# A-04 — production'da API_KEY yoksa başlangıç hatası (fail-closed)
# ---------------------------------------------------------------------------


def test_production_without_api_key_fails_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("API_KEY", raising=False)
    get_settings.cache_clear()
    try:
        with pytest.raises(ValidationError, match="API_KEY"):
            get_settings()
    finally:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        get_settings.cache_clear()


def test_production_with_api_key_starts_successfully(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.is_production is True
        assert settings.api_key == TEST_API_KEY
    finally:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_development_without_api_key_still_starts(monkeypatch: pytest.MonkeyPatch) -> None:
    """Development/staging'de eski esnek davranış (no-op guard) korunur."""
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    monkeypatch.delenv("API_KEY", raising=False)
    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.is_production is False
        assert settings.api_key is None
    finally:
        get_settings.cache_clear()


# ---------------------------------------------------------------------------
# A-09 — hız sınırı anahtarı kullanıcı bazlı (yalnızca geçerli API anahtarıyla)
# ---------------------------------------------------------------------------


def test_rate_limit_key_uses_user_id_with_valid_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        user_id = str(uuid.uuid4())
        request = _make_request({"X-API-Key": TEST_API_KEY, "X-User-Id": user_id})
        assert _rate_limit_key(request) == f"user:{user_id}"
    finally:
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_rate_limit_key_different_users_get_different_buckets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        user_a, user_b = str(uuid.uuid4()), str(uuid.uuid4())
        key_a = _rate_limit_key(_make_request({"X-API-Key": TEST_API_KEY, "X-User-Id": user_a}))
        key_b = _rate_limit_key(_make_request({"X-API-Key": TEST_API_KEY, "X-User-Id": user_b}))
        assert key_a != key_b
        assert key_a == f"user:{user_a}"
        assert key_b == f"user:{user_b}"
    finally:
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_rate_limit_key_ignores_user_id_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    """``X-User-Id`` API anahtarı olmadan gönderilirse dikkate alınmaz (IP'ye düşer)."""
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        user_id = str(uuid.uuid4())
        request = _make_request({"X-User-Id": user_id})  # X-API-Key YOK
        key = _rate_limit_key(request)
        assert key == "ip:127.0.0.1"
        assert user_id not in key
    finally:
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_rate_limit_key_ignores_user_id_with_wrong_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        user_id = str(uuid.uuid4())
        request = _make_request({"X-API-Key": "wrong-key", "X-User-Id": user_id})
        key = _rate_limit_key(request)
        assert key == "ip:127.0.0.1"
    finally:
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_rate_limit_key_invalid_uuid_falls_back_to_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    """Geçersiz uuid IP'ye düşer."""
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        request = _make_request({"X-API-Key": TEST_API_KEY, "X-User-Id": "not-a-valid-uuid"})
        key = _rate_limit_key(request)
        assert key == "ip:127.0.0.1"
    finally:
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_rate_limit_key_falls_back_to_ip_when_no_api_key_configured() -> None:
    """``settings.api_key`` ``None`` iken (dev/test) ``X-User-Id`` hiçbir zaman güvenilmez."""
    user_id = str(uuid.uuid4())
    request = _make_request({"X-API-Key": "anything", "X-User-Id": user_id})
    key = _rate_limit_key(request)
    assert key == "ip:127.0.0.1"


# ---------------------------------------------------------------------------
# A-13 — production'da /docs, /redoc, /openapi.json kapalı
# ---------------------------------------------------------------------------


def test_production_disables_openapi_endpoints(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("API_KEY", TEST_API_KEY)
    get_settings.cache_clear()
    try:
        app: FastAPI = create_app()
        client = TestClient(app, raise_server_exceptions=False)
        assert client.get("/docs").status_code == 404
        assert client.get("/redoc").status_code == 404
        assert client.get("/openapi.json").status_code == 404
    finally:
        monkeypatch.delenv("ENVIRONMENT", raising=False)
        monkeypatch.delenv("API_KEY", raising=False)
        get_settings.cache_clear()


def test_development_keeps_openapi_endpoints_open(client: TestClient) -> None:
    """Regresyon koruması: development'ta dokümantasyon uçları hâlâ erişilebilir olmalı."""
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200
