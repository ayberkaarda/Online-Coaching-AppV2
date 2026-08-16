"""BMR / TDEE / makro hedefi hesaplama mantığı.

Eski ``ai_backend/main.py`` içindeki ``generate_ai_diet`` fonksiyonunun
Mifflin-St Jeor BMR formülü, adım-bazlı aktivite çarpanı ve makro dağılımı
hesaplarının birebir kopyasıdır.
"""

from __future__ import annotations

from app.data.constants import ACTIVITY_MULTIPLIER_DEFAULT, ACTIVITY_MULTIPLIERS
from app.schemas.nutrition import Gender, MacroTargets
from app.schemas.workout import Goal


def calculate_bmr(*, weight_kg: float, height_cm: float, age: int, gender: Gender) -> float:
    """Mifflin-St Jeor formülüyle bazal metabolizma hızını (BMR) hesaplar."""
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age)
    bmr += 5 if gender == "male" else -161
    return bmr


def activity_multiplier(steps: int) -> float:
    """Günlük adım sayısına göre TDEE aktivite çarpanını döndürür."""
    for threshold, multiplier in ACTIVITY_MULTIPLIERS:
        if steps < threshold:
            return multiplier
    return ACTIVITY_MULTIPLIER_DEFAULT


def calculate_tdee(*, bmr: float, steps: int, goal: Goal) -> float:
    """BMR, adım sayısı ve hedefe göre günlük toplam enerji harcamasını (TDEE) hesaplar."""
    tdee = bmr * activity_multiplier(steps)
    if goal == "cut":
        tdee -= 500
    elif goal == "bulk":
        tdee += 500
    return tdee


def calculate_macro_targets(*, weight_kg: float, target_calories: int) -> MacroTargets:
    """Hedef kaloriye göre protein/karbonhidrat/yağ (gram) hedeflerini hesaplar.

    Protein: 2.2 g/kg vücut ağırlığı.
    Yağ: hedef kalorinin %25'i (9 kcal/g).
    Karbonhidrat: kalan kalori (4 kcal/g).
    """
    target_p = weight_kg * 2.2
    target_f = (target_calories * 0.25) / 9
    target_c = (target_calories - (target_p * 4) - (target_f * 9)) / 4

    return MacroTargets(
        protein_g=target_p,
        carb_g=target_c,
        fat_g=target_f,
        calories=target_calories,
    )
