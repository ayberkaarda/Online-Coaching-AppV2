"""Diyet planı üretim mantığı (besin seçimi, gramaj hesabı, prompt filtreleri).

Eski ``ai_backend/main.py`` içindeki ``generate_ai_diet`` fonksiyonunun besin
seçimi / gramaj yuvarlama / prompt filtresi kısımlarının birebir
(davranışsal olarak değişmeden) bölünmüş halidir.
"""

from __future__ import annotations

import random
from typing import Protocol, TypeVar

from app.data.constants import (
    DAYS_CAPITALIZED,
    HIGH_VOLUME_CARB_GRAM_CAP,
    HIGH_VOLUME_CARBS,
    NUT_FAT_GRAM_CAP,
    NUT_FAT_SOURCES,
)
from app.data.food_db import FOOD_DB
from app.schemas.nutrition import MacroTargets, NutritionAnalyzeRequest

_T = TypeVar("_T")


class RandomLike(Protocol):
    """``random.Random`` örnekleri ve ``random`` modülüyle aynı arayüzü paylaşan yapılar için protokol."""

    def choice(self, seq: list[_T]) -> _T: ...

    def choices(self, population: list[_T], *, k: int = 1) -> list[_T]: ...


_EGG = "Yumurta"
_COTTAGE_CHEESE = "Lor Peyniri"
_OLIVE_OIL = "Zeytinyağı"
_OATS = "Yulaf"
_CHICKEN_BREAST = "Tavuk Göğsü"


def apply_food_preferences(user_prompt: str) -> tuple[list[str], list[str], list[str], bool]:
    """Kullanıcı prompt'undan besin tercihi/kısıtlama filtrelerini çıkarır.

    Döner: ``(pref_proteins, pref_carbs, pref_fats, split_proteins)``.
    """
    prompt = user_prompt.lower()

    pref_fats = list(FOOD_DB["fats"].keys())
    pref_carbs = list(FOOD_DB["carbs"].keys())
    pref_proteins = list(FOOD_DB["proteins"].keys())

    if "sadece zeytinyağı" in prompt or "hepsini zeytinyağı" in prompt:
        pref_fats = [_OLIVE_OIL]
    elif "kuruyemiş" in prompt:
        pref_fats = ["Ceviz", "Çiğ Badem", "Fıstık Ezmesi"]

    if any(word in prompt for word in ["yulaf yemem", "yulaf yok"]):
        pref_carbs = [c for c in pref_carbs if c != _OATS]
    if any(word in prompt for word in ["tavuk yemem", "tavuk yok"]):
        pref_proteins = [p for p in pref_proteins if p != _CHICKEN_BREAST]

    split_proteins = True
    if any(word in prompt for word in ["bölme", "tek çeşit", "günde tek", "tek protein", "aynı protein"]):
        split_proteins = False

    return pref_proteins, pref_carbs, pref_fats, split_proteins


def _build_daily_foods(
    *,
    pref_proteins: list[str],
    pref_carbs: list[str],
    pref_fats: list[str],
    split_proteins: bool,
    macro_targets: MacroTargets,
    chooser: random.Random | RandomLike,
) -> dict[str, float]:
    target_p, target_c, target_f = macro_targets.protein_g, macro_targets.carb_g, macro_targets.fat_g

    if split_proteins:
        p_list = chooser.choices(pref_proteins, k=4)
    else:
        single_p = chooser.choice(pref_proteins)
        p_list = [single_p] * 4

    c_list = chooser.choices(pref_carbs, k=4)
    f_list = chooser.choices(pref_fats, k=2)

    daily_foods: dict[str, float] = {}

    for p in p_list:
        meal_p = target_p / 4
        grams = max(50, round((meal_p / FOOD_DB["proteins"][p]["p"]) * 100 / 10) * 10)

        if split_proteins:
            if p == _EGG and grams > 150:
                grams = 150
            if p == _COTTAGE_CHEESE and grams > 100:
                grams = 100
        else:
            if p == _EGG and grams > 200:
                grams = 200
            if p == _COTTAGE_CHEESE and grams > 200:
                grams = 200

        daily_foods[p] = daily_foods.get(p, 0) + grams

    for c in c_list:
        meal_c = target_c / 4
        grams = max(40, round((meal_c / FOOD_DB["carbs"][c]["c"]) * 100 / 10) * 10)
        if c in HIGH_VOLUME_CARBS and grams > HIGH_VOLUME_CARB_GRAM_CAP:
            grams = HIGH_VOLUME_CARB_GRAM_CAP
        daily_foods[c] = daily_foods.get(c, 0) + grams

    trace_f = sum(
        (grams / 100) * FOOD_DB["proteins"][p]["f"] for p, grams in daily_foods.items() if p in FOOD_DB["proteins"]
    ) + sum((grams / 100) * FOOD_DB["carbs"][c]["f"] for c, grams in daily_foods.items() if c in FOOD_DB["carbs"])

    rem_f = max(10, target_f - trace_f)

    for f in f_list:
        meal_f = rem_f / 2
        grams = max(10, round((meal_f / FOOD_DB["fats"][f]["f"]) * 100 / 5) * 5)
        if f in NUT_FAT_SOURCES and grams > NUT_FAT_GRAM_CAP:
            grams = NUT_FAT_GRAM_CAP
        daily_foods[f] = daily_foods.get(f, 0) + grams

    total_f_added = sum(
        (grams / 100) * FOOD_DB["fats"][f]["f"] for f, grams in daily_foods.items() if f in FOOD_DB["fats"]
    )
    if rem_f - total_f_added > 10:
        extra_oil = round((rem_f - total_f_added) / FOOD_DB["fats"][_OLIVE_OIL]["f"] * 100 / 5) * 5
        daily_foods[_OLIVE_OIL] = daily_foods.get(_OLIVE_OIL, 0) + extra_oil

    return daily_foods


def _format_daily_foods(daily_foods: dict[str, float]) -> str:
    final_strings: list[str] = []
    for name, grams in daily_foods.items():
        if name == _EGG:
            adet = int(grams / 50)
            final_strings.append(f"Yumurta:{grams} ({adet} Adet)")
        else:
            final_strings.append(f"{name}:{grams}")
    return ", ".join(final_strings)


def generate_diet_plan(
    req: NutritionAnalyzeRequest,
    macro_targets: MacroTargets,
    rng: random.Random | RandomLike | None = None,
) -> tuple[dict[str, str], str]:
    """Bir haftalık diyet planı ve analiz mesajı üretir.

    ``rng`` verilmezse global ``random`` modülü kullanılır. Döner:
    ``(diet_plan, ai_analysis_message)``.
    """
    chooser: random.Random | RandomLike = rng if rng is not None else random

    pref_proteins, pref_carbs, pref_fats, split_proteins = apply_food_preferences(req.user_prompt)

    diet_plan: dict[str, str] = {}
    for day in DAYS_CAPITALIZED:
        daily_foods = _build_daily_foods(
            pref_proteins=pref_proteins,
            pref_carbs=pref_carbs,
            pref_fats=pref_fats,
            split_proteins=split_proteins,
            macro_targets=macro_targets,
            chooser=chooser,
        )
        diet_plan[day] = _format_daily_foods(daily_foods)

    analysis_msg = f"TDEE: {macro_targets.calories} kcal."
    if not split_proteins:
        analysis_msg += " 'Tek çeşit protein' isteği uygulandı."

    return diet_plan, analysis_msg
