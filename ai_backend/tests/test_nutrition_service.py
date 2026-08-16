"""``app.services.nutrition_calculator`` ve ``app.services.diet_generator`` birim testleri."""

from __future__ import annotations

import random

import pytest

from app.schemas.nutrition import NutritionAnalyzeRequest
from app.services.diet_generator import (
    _format_daily_foods,
    apply_food_preferences,
    generate_diet_plan,
)
from app.services.nutrition_calculator import (
    activity_multiplier,
    calculate_bmr,
    calculate_macro_targets,
    calculate_tdee,
)


def test_calculate_bmr_male() -> None:
    bmr = calculate_bmr(weight_kg=70.0, height_cm=175.0, age=25, gender="male")
    assert bmr == pytest.approx(1673.75)


def test_calculate_bmr_female() -> None:
    bmr = calculate_bmr(weight_kg=60.0, height_cm=165.0, age=30, gender="female")
    # (10*60) + (6.25*165) - (5*30) - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
    assert bmr == pytest.approx(1320.25)


@pytest.mark.parametrize(
    ("steps", "expected_multiplier"),
    [
        (0, 1.2),
        (4999, 1.2),
        (5000, 1.375),
        (7999, 1.375),
        (8000, 1.55),
        (9999, 1.55),
        (10000, 1.725),
        (11999, 1.725),
        (12000, 1.9),
        (20000, 1.9),
    ],
)
def test_activity_multiplier_thresholds(steps: int, expected_multiplier: float) -> None:
    assert activity_multiplier(steps) == expected_multiplier


def test_calculate_tdee_cut_subtracts_500() -> None:
    tdee = calculate_tdee(bmr=1673.75, steps=6000, goal="cut")
    assert tdee == pytest.approx(1673.75 * 1.375 - 500)


def test_calculate_tdee_bulk_adds_500() -> None:
    tdee = calculate_tdee(bmr=1673.75, steps=6000, goal="bulk")
    assert tdee == pytest.approx(1673.75 * 1.375 + 500)


def test_calculate_tdee_maintain_unchanged() -> None:
    tdee = calculate_tdee(bmr=1673.75, steps=6000, goal="maintain")
    assert tdee == pytest.approx(1673.75 * 1.375)


def test_calculate_macro_targets_matches_hand_calculation() -> None:
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    assert macros.protein_g == pytest.approx(154.0)
    assert macros.fat_g == pytest.approx(63.91666666667, rel=1e-6)
    assert macros.carb_g == pytest.approx(277.4375, rel=1e-6)
    assert macros.calories == 2301


def test_apply_food_preferences_excludes_oats_and_chicken() -> None:
    _, carbs, _, split = apply_food_preferences("yulaf yemem, tavuk yemem istemiyorum")
    assert "Yulaf" not in carbs
    assert split is True


def test_apply_food_preferences_excludes_chicken() -> None:
    proteins, _, _, _ = apply_food_preferences("tavuk yok lütfen")
    assert "Tavuk Göğsü" not in proteins


def test_apply_food_preferences_single_protein_per_day() -> None:
    _, _, _, split_proteins = apply_food_preferences("günde tek çeşit protein istiyorum")
    assert split_proteins is False


def test_apply_food_preferences_default_allows_everything() -> None:
    proteins, carbs, fats, split_proteins = apply_food_preferences("")
    assert "Yulaf" in carbs
    assert "Tavuk Göğsü" in proteins
    assert split_proteins is True
    assert len(fats) > 1


def test_apply_food_preferences_olive_oil_only() -> None:
    _, _, fats, _ = apply_food_preferences("sadece zeytinyağı kullanmak istiyorum")
    assert fats == ["Zeytinyağı"]


def test_apply_food_preferences_nuts_only() -> None:
    _, _, fats, _ = apply_food_preferences("kuruyemiş ağırlıklı yağ istiyorum")
    assert set(fats) == {"Ceviz", "Çiğ Badem", "Fıstık Ezmesi"}


def _make_request(**overrides: object) -> NutritionAnalyzeRequest:
    base = {
        "age": 25,
        "height_cm": 175.0,
        "weight_kg": 70.0,
        "gender": "male",
        "steps": 6000,
        "goal": "maintain",
        "user_prompt": "",
    }
    base.update(overrides)
    return NutritionAnalyzeRequest(**base)


def test_generate_diet_plan_is_deterministic_with_seeded_rng() -> None:
    req = _make_request()
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    plan_a, analysis_a = generate_diet_plan(req, macros, rng=random.Random(42))
    plan_b, analysis_b = generate_diet_plan(req, macros, rng=random.Random(42))

    assert plan_a == plan_b
    assert analysis_a == analysis_b
    assert set(plan_a.keys()) == {
        "Pazartesi",
        "Salı",
        "Çarşamba",
        "Perşembe",
        "Cuma",
        "Cumartesi",
        "Pazar",
    }


def test_generate_diet_plan_respects_oats_exclusion() -> None:
    req = _make_request(user_prompt="yulaf yemem")
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    plan, _ = generate_diet_plan(req, macros, rng=random.Random(42))

    for day_plan in plan.values():
        assert "Yulaf:" not in day_plan


def test_generate_diet_plan_single_protein_message() -> None:
    req = _make_request(user_prompt="tek çeşit protein istiyorum")
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    _, analysis = generate_diet_plan(req, macros, rng=random.Random(42))

    assert "'Tek çeşit protein' isteği uygulandı." in analysis


def test_format_daily_foods_egg_shows_adet_count() -> None:
    formatted = _format_daily_foods({"Yumurta": 150, "Tavuk Göğsü": 200})

    assert formatted == "Yumurta:150 (3 Adet), Tavuk Göğsü:200"
