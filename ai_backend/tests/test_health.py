"""``/health`` ve ``/health/ready`` endpoint testleri."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["uptime_seconds"] >= 0


def test_health_ready_returns_status(client: TestClient) -> None:
    response = client.get("/health/ready")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("ready", "not_ready")
    assert "checks" in data


def test_health_has_request_id_header(client: TestClient) -> None:
    response = client.get("/health")

    assert "x-request-id" in {k.lower() for k in response.headers}
