"""Antrenman planı üretim mantığı.

Bu modül, eski ``ai_backend/main.py`` içindeki
``generate_ai_workout`` endpoint fonksiyonunun iş mantığının birebir
(davranışsal olarak değişmeden) bölünmüş halidir: dinlenme günü tespiti,
split akışı, hacim (set/tekrar) kararı ve egzersiz seçimi.
"""

from __future__ import annotations

import random
import re
from typing import Protocol, TypeVar

from app.data.constants import DAYS, DEFAULT_REST_DAYS, REST_DAY_KEYWORDS, SPLIT_LOGIC
from app.data.exercise_library import ELITE_EXERCISES
from app.schemas.workout import Goal, SplitType, WorkoutAnalyzeRequest, WorkoutAnalyzeResponse

_T = TypeVar("_T")


class RandomLike(Protocol):
    """``random.Random`` örnekleri ve ``random`` modülüyle aynı arayüzü paylaşan yapılar için protokol."""

    def choice(self, seq: list[_T]) -> _T: ...


def detect_rest_days(user_prompt: str) -> list[str]:
    """Kullanıcı prompt'unda açıkça belirtilmiş dinlenme günlerini tespit eder.

    Prompt içinde hem gün adı (tam kelime olarak — ör. "pazar" "pazartesi"nin
    bir alt dizesi olduğu için düz ``in`` kontrolü yanlış pozitif üretir) hem
    de ``REST_DAY_KEYWORDS`` içindeki kelimelerden en az biri geçiyorsa o gün
    dinlenme günü sayılır (kelimenin gün adına bitişik olması gerekmez).
    """
    prompt_lower = user_prompt.lower()
    rest_days: list[str] = []
    for day in DAYS:
        day_mentioned = re.search(rf"\b{re.escape(day)}\b", prompt_lower) is not None
        if day_mentioned and any(word in prompt_lower for word in REST_DAY_KEYWORDS):
            rest_days.append(day.capitalize())
    return rest_days


def default_rest_days(split_type: SplitType) -> list[str]:
    """Kullanıcı gün belirtmediğinde split tipine göre varsayılan dinlenme günlerini döndürür."""
    return DEFAULT_REST_DAYS.get(split_type, [])


def determine_base_sets(goal: Goal, age: int) -> str:
    """Hedef ve yaşa göre varsayılan set/tekrar aralığını belirler."""
    if goal == "bulk" and age < 30:
        return "4x8-12 (RIR 0-1)"
    if goal == "cut":
        return "3x8-10 (RIR 1-2 / Kas Koruma)"
    return "3x10-12"


def generate_workout(
    req: WorkoutAnalyzeRequest,
    rng: random.Random | RandomLike | None = None,
) -> WorkoutAnalyzeResponse:
    """Verilen istek için tam bir haftalık antrenman planı üretir.

    ``rng`` verilmezse global ``random`` modülü kullanılır (üretimdeki
    varsayılan davranış). Testlerde deterministik sonuç için
    ``random.Random(seed)`` geçilebilir.
    """
    chooser = rng if rng is not None else random

    rest_days = detect_rest_days(req.user_prompt)
    if not rest_days:
        rest_days = default_rest_days(req.split_type)

    base_sets = determine_base_sets(req.goal, req.age)

    flow = SPLIT_LOGIC.get(req.split_type, ["Full Body"])
    flow_idx = 0

    generated_plan: dict[str, str] = {}
    for day in DAYS:
        cap_day = day.capitalize()
        if cap_day in rest_days:
            generated_plan[cap_day] = "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
            continue

        muscle = flow[flow_idx % len(flow)]
        options_list = ELITE_EXERCISES.get(muscle, [])

        plan_lines = [f"--- {muscle.upper()} GÜNÜ ---"]

        if options_list:
            for i, exercise_options in enumerate(options_list):
                chosen_ex = chooser.choice(exercise_options)
                alt_options = [opt for opt in exercise_options if opt != chosen_ex]
                alt_ex = chooser.choice(alt_options) if alt_options else None

                line = f"{i + 1}. {chosen_ex} - {base_sets}"
                if alt_ex:
                    line += f"\n   ↳ (Alternatif: {alt_ex})"

                plan_lines.append(line)
        else:
            plan_lines.append("(Yapay zeka tarafından optimize edilmiş hareketler)")

        generated_plan[cap_day] = "\n".join(plan_lines)
        flow_idx += 1

    return WorkoutAnalyzeResponse(
        status="success",
        message="AI programı başarıyla oluşturdu.",
        ai_analysis=f"Hedef: {req.goal}, Yaş: {req.age}. Dinlenme günleri algılandı: {rest_days}",
        workout_plan=generated_plan,
    )
