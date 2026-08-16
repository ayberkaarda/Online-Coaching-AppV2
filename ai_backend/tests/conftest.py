"""Paylaşılan pytest fixture'ları.

Rate limit ve API key ayarları, ``app`` paketi ilk kez import edilmeden
ÖNCE ortam değişkenleri üzerinden yükseltilir/temizlenir — çünkü
``app.core.rate_limit.limiter`` modül import anında (ilk ``get_settings()``
çağrısıyla) inşa edilen bir singleton'dır.
"""

from __future__ import annotations

import os

os.environ["RATE_LIMIT"] = "100000/minute"
os.environ.pop("API_KEY", None)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app


@pytest.fixture
def app() -> FastAPI:
    """Test için taze bir FastAPI uygulaması oluşturur."""
    get_settings.cache_clear()
    return create_app()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    """``app`` fixture'ı üzerinden bir ``TestClient`` döndürür."""
    return TestClient(app)
