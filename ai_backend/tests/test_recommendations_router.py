"""``/recommendations`` endpoint testleri — dört farklı deterministik senaryo."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_recommendations_validation_error(client: TestClient) -> None:
    response = client.post("/recommendations", json={"goal": "invalid-goal"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_recommendations_cut_on_track_scenario(client: TestClient) -> None:
    """Senaryo 1: Cut hedefinde ideal aralıkta (haftada ~-0.7kg) kilo kaybı -> düşük öncelikli, olumlu öneri."""
    weights = [80.0 - 0.1 * i for i in range(8)]  # ~-0.7 kg/hafta
    payload = {
        "goal": "cut",
        "recent_weights": weights,
        "recent_macros": [],
        "adherence_days": 6,
    }
    response = client.post("/recommendations", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    nutrition_recs = [r for r in data["recommendations"] if r["category"] == "nutrition"]
    assert any(r["priority"] == "low" for r in nutrition_recs)


def test_recommendations_bulk_too_slow_scenario(client: TestClient) -> None:
    """Senaryo 2: Bulk hedefinde çok yavaş kilo alımı -> nutrition + workout önerisi tetiklenir."""
    weights = [70.0 + 0.01 * i for i in range(8)]  # ~0.07 kg/hafta (< 0.15 ideal min)
    payload = {
        "goal": "bulk",
        "recent_weights": weights,
        "recent_macros": [],
        "adherence_days": 6,
    }
    response = client.post("/recommendations", json=payload)

    assert response.status_code == 200
    data = response.json()
    categories = {r["category"] for r in data["recommendations"]}
    assert "nutrition" in categories
    assert "workout" in categories


def test_recommendations_low_adherence_scenario(client: TestClient) -> None:
    """Senaryo 3: Düşük uyum (adherence_days < 4) -> yüksek öncelikli adherence önerisi."""
    payload = {
        "goal": "maintain",
        "recent_weights": [75.0, 75.0, 75.1, 74.9],
        "recent_macros": [],
        "adherence_days": 2,
    }
    response = client.post("/recommendations", json=payload)

    assert response.status_code == 200
    data = response.json()
    adherence_recs = [r for r in data["recommendations"] if r["category"] == "adherence"]
    assert any(r["priority"] == "high" for r in adherence_recs)


def test_recommendations_insufficient_weight_data_scenario(client: TestClient) -> None:
    """Senaryo 4: Kilo verisi yok/yetersiz -> düşük öncelikli 'daha fazla veri gerekli' önerisi."""
    payload = {
        "goal": "maintain",
        "recent_weights": [],
        "recent_macros": [],
        "adherence_days": 7,
    }
    response = client.post("/recommendations", json=payload)

    assert response.status_code == 200
    data = response.json()
    titles = [r["title"] for r in data["recommendations"]]
    assert any("veri" in title.lower() for title in titles)


def test_recommendations_low_protein_scenario(client: TestClient) -> None:
    """Senaryo 5 (bonus): Yetersiz protein alımı -> yüksek öncelikli nutrition önerisi."""
    payload = {
        "goal": "cut",
        "recent_weights": [80.0, 79.5],
        "recent_macros": [{"protein": 60, "carb": 150, "fat": 50}] * 5,
        "adherence_days": 6,
    }
    response = client.post("/recommendations", json=payload)

    assert response.status_code == 200
    data = response.json()
    high_priority_titles = [r["title"] for r in data["recommendations"] if r["priority"] == "high"]
    assert any("protein" in title.lower() for title in high_priority_titles)
