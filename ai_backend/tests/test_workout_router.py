"""``/analyze/workout`` ve eski ``/api/generate-ai-workout`` endpoint testleri."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

VALID_PAYLOAD: dict[str, Any] = {
    "split_type": "ppl",
    "user_prompt": "",
    "age": 25,
    "goal": "bulk",
    "weight": 80.0,
}


def test_analyze_workout_happy_path(client: TestClient) -> None:
    response = client.post("/analyze/workout", json=VALID_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert set(data["workout_plan"].keys()) == {
        "Pazartesi",
        "Salı",
        "Çarşamba",
        "Perşembe",
        "Cuma",
        "Cumartesi",
        "Pazar",
    }
    # ppl split -> varsayılan dinlenme günleri Perşembe ve Pazar.
    assert data["workout_plan"]["Perşembe"] == "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
    assert data["workout_plan"]["Pazar"] == "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
    assert "PUSH GÜNÜ" in data["workout_plan"]["Pazartesi"]


def test_analyze_workout_validation_error(client: TestClient) -> None:
    invalid_payload = {**VALID_PAYLOAD, "split_type": "not_a_real_split"}
    response = client.post("/analyze/workout", json=invalid_payload)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["details"]


def test_analyze_workout_rejects_extra_fields(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "unexpected_field": "nope"}
    response = client.post("/analyze/workout", json=payload)

    assert response.status_code == 422


def test_legacy_generate_ai_workout_matches_new_contract(client: TestClient) -> None:
    response = client.post("/api/generate-ai-workout", json=VALID_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert set(data["workout_plan"].keys()) == {
        "Pazartesi",
        "Salı",
        "Çarşamba",
        "Perşembe",
        "Cuma",
        "Cumartesi",
        "Pazar",
    }
    assert data["workout_plan"]["Perşembe"] == "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"


def test_legacy_workout_endpoint_marked_deprecated(app: FastAPI) -> None:
    openapi_schema = app.openapi()
    op = openapi_schema["paths"]["/api/generate-ai-workout"]["post"]
    assert op.get("deprecated") is True


def test_analyze_workout_rest_day_detected_from_prompt(client: TestClient) -> None:
    payload = {
        **VALID_PAYLOAD,
        "user_prompt": "Pazartesi günü hiçbir şey yapmicam, dinlenme istiyorum",
    }
    response = client.post("/analyze/workout", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["workout_plan"]["Pazartesi"] == "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
    assert "Pazartesi" in data["ai_analysis"]
