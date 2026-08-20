"""Öğün yapısı, makro yakınsaması ve dürüstlük testleri (motor kalite turu).

``tests/test_nutrition_service.py`` mevcut birim testlerini korur; bu dosya
öğün bazlı çıktı (madde 4), makro yakınsaması + mercimek regresyonu
(madde 5) ve kural tabanlı dürüstlük metinlerini (madde 1) doğrular.
"""

from __future__ import annotations

import random

import pytest

from app.data.constants import BREAKFAST_PROTEINS, MEALS
from app.data.food_db import FOOD_DB
from app.schemas.nutrition import NutritionAnalyzeRequest
from app.services.diet_generator import (
    _build_daily_meals,
    _format_item,
    apply_food_preferences,
    daily_macro_totals,
    generate_diet_plan,
)
from app.services.nutrition_calculator import calculate_bmr, calculate_macro_targets, calculate_tdee

_ALL_PROTEINS = list(FOOD_DB["proteins"].keys())
_ALL_CARBS = list(FOOD_DB["carbs"].keys())
_ALL_FATS = list(FOOD_DB["fats"].keys())


def _make_request(**overrides: object) -> NutritionAnalyzeRequest:
    base: dict[str, object] = {
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


def _day(
    chooser: random.Random,
    *,
    proteins: list[str] | None = None,
    carbs: list[str] | None = None,
    fats: list[str] | None = None,
    split_proteins: bool = True,
    weight_kg: float = 70.0,
    target_calories: int = 2301,
) -> list[tuple[str, list[tuple[str, int]]]]:
    macros = calculate_macro_targets(weight_kg=weight_kg, target_calories=target_calories)
    return _build_daily_meals(
        pref_proteins=proteins if proteins is not None else _ALL_PROTEINS,
        pref_carbs=carbs if carbs is not None else _ALL_CARBS,
        pref_fats=fats if fats is not None else _ALL_FATS,
        split_proteins=split_proteins,
        macro_targets=macros,
        chooser=chooser,
    )


# ---------------------------------------------------------------------------
# Madde 4 — öğün yapısı
# ---------------------------------------------------------------------------


def test_format_item_egg_shows_adet_count() -> None:
    assert _format_item("Yumurta", 150) == "Yumurta:150 (3 Adet)"
    assert _format_item("Tavuk Göğsü", 200) == "Tavuk Göğsü:200"


def test_generate_diet_plan_has_named_meals() -> None:
    """Çıktı alışveriş listesi değil, adlandırılmış öğünlerden oluşan bir plandır."""
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    plan, _ = generate_diet_plan(_make_request(), macros, rng=random.Random(42))

    for day_text in plan.values():
        lines = day_text.splitlines()
        assert [line.split(":")[0] for line in lines[: len(MEALS)]] == list(MEALS)
        assert lines[-1].startswith("Toplam:")


def test_each_meal_has_a_protein_and_a_carb_source() -> None:
    meals = _day(random.Random(11))

    for _, items in meals:
        names = [name for name, _ in items]
        assert any(name in FOOD_DB["proteins"] for name in names)
        assert any(name in FOOD_DB["carbs"] for name in names)


def test_breakfast_protein_comes_from_breakfast_pool() -> None:
    """Kahvaltıda tavuk göğsü / dana eti gibi kaynaklar çıkmaz."""
    chooser = random.Random(2026)

    for _ in range(50):
        meals = _day(chooser)
        breakfast_proteins = [name for name, _ in meals[0][1] if name in FOOD_DB["proteins"]]

        assert breakfast_proteins
        for name in breakfast_proteins:
            assert name in BREAKFAST_PROTEINS


def test_meals_do_not_repeat_the_same_carb_all_day() -> None:
    """``random.choices`` (iadeli seçim) aynı besini günde dört kez seçebiliyordu."""
    chooser = random.Random(9)

    for _ in range(50):
        meals = _day(chooser)
        carbs = [name for _, items in meals for name, _ in items if name in FOOD_DB["carbs"]]

        assert len(set(carbs)) == len(carbs)


def test_single_protein_request_still_repeats_one_source() -> None:
    """ "Tek çeşit protein" açık bir kullanıcı isteğidir; tekrar sınırı onu ezmez."""
    meals = _day(random.Random(5), split_proteins=False)
    proteins = [name for _, items in meals for name, _ in items if name in FOOD_DB["proteins"]]

    assert len(set(proteins)) == 1


# ---------------------------------------------------------------------------
# Madde 5 — makro yakınsaması ve mercimek regresyonu
# ---------------------------------------------------------------------------


def test_carb_source_protein_is_counted() -> None:
    """REGRESYON: Yeşil Mercimek 100g'da 25g protein taşır ama hiç sayılmıyordu."""
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)
    meals = _day(
        random.Random(1),
        proteins=["Tavuk Göğsü"],
        carbs=["Yeşil Mercimek"],
        fats=["Zeytinyağı"],
        split_proteins=False,
    )

    lentil_grams = sum(grams for _, items in meals for name, grams in items if name == "Yeşil Mercimek")
    assert lentil_grams > 0, "test kurgusu: gün mercimek içermeli"

    chicken_grams = sum(grams for _, items in meals for name, grams in items if name == "Tavuk Göğsü")
    chicken_protein = chicken_grams * FOOD_DB["proteins"]["Tavuk Göğsü"]["p"] / 100

    # Kanıt: protein hedefinin BÜYÜK bir kısmı mercimekten geliyor, dolayısıyla
    # tavuk gramajı düşürülmüş. Eski sürümde tavuk tek başına hedefin tamamını
    # (154g) karşılıyor, mercimeğin ~115g proteini ise ÜSTÜNE ekleniyordu.
    assert chicken_protein < macros.protein_g * 0.75

    _, protein_g, _, _ = daily_macro_totals(meals)
    assert protein_g < macros.protein_g * 1.25


def test_nut_fat_source_protein_is_counted() -> None:
    """Fıstık Ezmesi 100g'da 25g protein taşır — yağ kaynağındaki protein de sayılır."""
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)
    meals = _day(
        random.Random(3),
        proteins=["Tavuk Göğsü"],
        carbs=["Basmati Pirinç"],
        fats=["Fıstık Ezmesi"],
        split_proteins=False,
    )

    _, protein_g, _, _ = daily_macro_totals(meals)
    assert protein_g == pytest.approx(macros.protein_g, rel=0.12)


def test_daily_totals_line_reports_target_and_actual() -> None:
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    plan, _ = generate_diet_plan(_make_request(), macros, rng=random.Random(42))
    total_line = plan["Pazartesi"].splitlines()[-1]

    assert total_line.startswith("Toplam:")
    assert "kcal" in total_line
    assert "Hedef: 2301 kcal" in total_line


@pytest.mark.parametrize("seed", [1, 7, 42, 2026, 31337])
def test_generated_day_converges_within_ten_percent(seed: int) -> None:
    """Property testi: rastgele girdilerde günün toplamı hedefin ±%10'unda kalır.

    Girdiler fizyolojik olarak anlamlı banda sınırlanır (22-45 kcal/kg).
    Bandın dışında hedefin KENDİSİ tutarsızdır: ör. 50 kg bir danışanın
    715 kcal'lik hedefinde 2.2 g/kg protein tek başına kalorinin ~%62'sidir
    ve dört öğünlük hiçbir gerçek besin kombinasyonu bunu tutturamaz.
    """
    chooser = random.Random(seed)
    prompts = ["", "yulaf yemem", "tavuk yok", "sadece zeytinyağı", "kuruyemiş istiyorum", "tek çeşit protein"]
    checked = 0

    for _ in range(200):
        weight = chooser.uniform(50, 110)
        height = chooser.uniform(155, 200)
        age = chooser.randint(18, 65)
        gender = "male" if chooser.random() < 0.5 else "female"
        steps = chooser.randint(0, 18000)
        goal = chooser.choice(["cut", "bulk", "maintain"])
        prompt = chooser.choice(prompts)

        bmr = calculate_bmr(weight_kg=weight, height_cm=height, age=age, gender=gender)
        target_calories = round(calculate_tdee(bmr=bmr, steps=steps, goal=goal))
        if not 22 <= target_calories / weight <= 45:
            continue

        macros = calculate_macro_targets(weight_kg=weight, target_calories=target_calories)
        proteins, carbs, fats, split = apply_food_preferences(prompt)
        meals = _build_daily_meals(
            pref_proteins=proteins,
            pref_carbs=carbs,
            pref_fats=fats,
            split_proteins=split,
            macro_targets=macros,
            chooser=chooser,
        )
        kcal = daily_macro_totals(meals)[0]
        checked += 1

        deviation = abs(kcal - target_calories) / target_calories
        assert deviation <= 0.10, (
            f"sapma %{deviation * 100:.1f}: hedef {target_calories} kcal, üretilen {kcal} kcal "
            f"(kilo {weight:.1f}, hedef {goal}, prompt {prompt!r})"
        )

    assert checked > 50, "test kurgusu: yeterli sayıda gerçekçi senaryo üretilmedi"


# ---------------------------------------------------------------------------
# Madde 1 — dürüstlük metinleri
# ---------------------------------------------------------------------------


def test_generate_diet_plan_analysis_is_honest_about_being_rule_based() -> None:
    macros = calculate_macro_targets(weight_kg=70.0, target_calories=2301)

    plan, analysis = generate_diet_plan(_make_request(), macros, rng=random.Random(42))
    haystack = " ".join([analysis, *plan.values()]).lower()

    assert "yapay zeka" not in haystack
    assert "kural tabanlı" in analysis.lower()
