"""``/analyze/nutrition`` ve eski ``/api/generate-ai-diet`` endpoint testleri."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

VALID_PAYLOAD: dict[str, Any] = {
    "age": 25,
    "height_cm": 175.0,
    "weight_kg": 70.0,
    "gender": "male",
    "steps": 6000,
    "goal": "maintain",
    "user_prompt": "",
}


def test_analyze_nutrition_happy_path(client: TestClient) -> None:
    response = client.post("/analyze/nutrition", json=VALID_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    # Hesaplanan değer: bkz. tests/test_nutrition_service.py (elle hesaplanmış).
    assert data["target_calories"] == 2301
    assert set(data["diet_plan"].keys()) == {
        "Pazartesi",
        "Salı",
        "Çarşamba",
        "Perşembe",
        "Cuma",
        "Cumartesi",
        "Pazar",
    }
    macros = data["macro_targets"]
    assert macros["calories"] == 2301
    assert macros["protein_g"] == pytest.approx(154.0)


def test_analyze_nutrition_validation_error(client: TestClient) -> None:
    invalid_payload = {**VALID_PAYLOAD, "gender": "unknown"}
    response = client.post("/analyze/nutrition", json=invalid_payload)

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"


def test_analyze_nutrition_rejects_out_of_range_age(client: TestClient) -> None:
    invalid_payload = {**VALID_PAYLOAD, "age": 5}
    response = client.post("/analyze/nutrition", json=invalid_payload)

    assert response.status_code == 422


def test_legacy_generate_ai_diet_matches_new_contract(client: TestClient) -> None:
    response = client.post("/api/generate-ai-diet", json=VALID_PAYLOAD)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["target_calories"] == 2301
    assert "macro_targets" in data


def test_legacy_nutrition_endpoint_marked_deprecated(app: FastAPI) -> None:
    openapi_schema = app.openapi()
    op = openapi_schema["paths"]["/api/generate-ai-diet"]["post"]
    assert op.get("deprecated") is True


def test_analyze_nutrition_oats_exclusion_prompt(client: TestClient) -> None:
    payload = {**VALID_PAYLOAD, "user_prompt": "yulaf yemem"}
    response = client.post("/analyze/nutrition", json=payload)

    assert response.status_code == 200
    diet_plan = response.json()["diet_plan"]
    for day_plan in diet_plan.values():
        assert "Yulaf:" not in day_plan
