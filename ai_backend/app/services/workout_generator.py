"""Antrenman planı üretim mantığı (kural tabanlı — LLM YOKTUR, bkz. ADR-0021).

Akış: dinlenme günü tespiti -> split akışı -> slot doğasına (bileşik/izolasyon)
göre hacim kararı -> egzersiz seçimi -> 4 haftalık progresif aşırı yükleme
dalgası.

Hacim referansları:
* Bileşik hareketlerde 5-8 tekrar / izolasyonda 10-15 tekrar aralığı:
  Schoenfeld, Grgic & Krieger (2018) — tekrar aralığından bağımsız olarak
  benzer hipertrofi, ancak mekanik yük dağılımı hareket tipine göre ayrılır.
* Haftalık set ilerlemesi: Schoenfeld ve ark. (2017), hacim-yanıt ilişkisi.
* RIR (Reps In Reserve) tabanlı otoregülasyon: Helms ve ark. (2016).
"""

from __future__ import annotations

import random
import re
from typing import Protocol, TypeVar

from app.data.constants import (
    DAYS,
    DEFAULT_REST_DAYS,
    MESOCYCLE_WEEKS,
    REST_DAY_KEYWORDS,
    SPLIT_LOGIC,
    WEEKLY_PROGRESSION,
)
from app.data.exercise_library import ELITE_EXERCISES, ExerciseKind
from app.schemas.workout import Goal, SplitType, WorkoutAnalyzeRequest, WorkoutAnalyzeResponse

_T = TypeVar("_T")


class RandomLike(Protocol):
    """``random.Random`` örnekleri ve ``random`` modülüyle aynı arayüzü paylaşan yapılar için protokol."""

    def choice(self, seq: list[_T]) -> _T: ...


#: (goal, kind) -> (temel set sayısı, tekrar aralığı). ``goal`` eşleşmezse
#: ``_DEFAULT_SCHEME`` kullanılır. Bileşik hareketler daha ağır/düşük tekrar,
#: izolasyon hareketleri daha hafif/yüksek tekrar alır — bu ayrım slot
#: ETİKETİNDEN gelir (bkz. ``app.data.exercise_library``), slot sırasından değil.
_YOUNG_BULK_MAX_AGE = 30

_SCHEMES: dict[tuple[str, ExerciseKind], tuple[int, str]] = {
    ("bulk_young", "compound"): (4, "5-8"),
    ("bulk_young", "isolation"): (3, "10-15"),
    ("bulk", "compound"): (4, "6-8"),
    ("bulk", "isolation"): (3, "10-12"),
    ("cut", "compound"): (3, "6-8"),
    ("cut", "isolation"): (3, "12-15"),
    ("maintain", "compound"): (3, "6-8"),
    ("maintain", "isolation"): (3, "10-12"),
}


def _scheme_key(goal: Goal, age: int) -> str:
    if goal == "bulk":
        return "bulk_young" if age < _YOUNG_BULK_MAX_AGE else "bulk"
    return goal


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


def determine_base_sets(
    goal: Goal,
    age: int,
    kind: ExerciseKind = "compound",
    week: int = 1,
) -> str:
    """Hedef, yaş, slot doğası ve mezosiklus haftasına göre set/tekrar şemasını döndürür.

    ``kind`` slotun hareket doğasıdır: bileşik (çok eklemli) hareketler daha
    düşük tekrar / daha yüksek yük, izolasyon hareketleri daha yüksek tekrar
    alır. ``week`` 1..``MESOCYCLE_WEEKS`` aralığındaki hafta numarasıdır;
    ilerledikçe set sayısı artar ve RIR (yedekte kalan tekrar) düşer.
    """
    sets, reps = _SCHEMES[(_scheme_key(goal, age), kind)]

    week_index = min(max(week, 1), MESOCYCLE_WEEKS) - 1
    extra_sets, rir = WEEKLY_PROGRESSION[week_index]

    suffix = f"RIR {rir} / Kas Koruma" if goal == "cut" else f"RIR {rir}"
    return f"{sets + extra_sets}x{reps} ({suffix})"


def _progression_line(goal: Goal, age: int) -> str:
    """Günün planına eklenen, 4 haftalık set/RIR dalgasını özetleyen tek satır.

    DİKKAT: bu satırda tire (``-``) KULLANILMAZ. Web tarafındaki yedek
    ayrıştırıcı (``parseDayPlan``) tire içeren satırları egzersiz sanır.
    """
    compound_sets = _SCHEMES[(_scheme_key(goal, age), "compound")][0]
    isolation_sets = _SCHEMES[(_scheme_key(goal, age), "isolation")][0]

    comp = "→".join(str(compound_sets + extra) for extra, _ in WEEKLY_PROGRESSION)
    iso = "→".join(str(isolation_sets + extra) for extra, _ in WEEKLY_PROGRESSION)
    rir = "→".join(rir for _, rir in WEEKLY_PROGRESSION)

    return (
        f"{MESOCYCLE_WEEKS} haftalık ilerleme: bileşik set {comp}, izolasyon set {iso}; "
        f"RIR {rir}. (Yukarıdaki satırlar hafta 1 hacmidir.)"
    )


def _rationale(goal: Goal, age: int) -> str:
    """Plan başına tek satır gerekçe (neden bu hacim ve neden bu dalga)."""
    return (
        f"Gerekçe: bileşik hareketler {_SCHEMES[(_scheme_key(goal, age), 'compound')][1]}, "
        f"izolasyon hareketleri {_SCHEMES[(_scheme_key(goal, age), 'isolation')][1]} tekrar aralığında "
        f"çalışılır; {MESOCYCLE_WEEKS} hafta boyunca RIR kademeli düşer ve son iki haftada set sayısı "
        "+1 artar (progresif aşırı yükleme)."
    )


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

    flow = SPLIT_LOGIC.get(req.split_type, ["Full Body"])
    flow_idx = 0

    generated_plan: dict[str, str] = {}
    for day in DAYS:
        cap_day = day.capitalize()
        if cap_day in rest_days:
            generated_plan[cap_day] = "Dinlenme (Aktif Dinlenme / Hafif Kardiyo)"
            continue

        muscle = flow[flow_idx % len(flow)]
        slots = ELITE_EXERCISES.get(muscle, [])

        plan_lines = [f"--- {muscle.upper()} GÜNÜ ---"]

        if slots:
            for i, (kind, exercise_options) in enumerate(slots):
                chosen_ex = chooser.choice(exercise_options)
                alt_options = [opt for opt in exercise_options if opt != chosen_ex]
                alt_ex = chooser.choice(alt_options) if alt_options else None

                sets = determine_base_sets(req.goal, req.age, kind, week=1)
                line = f"{i + 1}. {chosen_ex} - {sets}"
                if alt_ex:
                    line += f"\n   ↳ (Alternatif: {alt_ex})"

                plan_lines.append(line)

            plan_lines.append(_progression_line(req.goal, req.age))
        else:
            plan_lines.append("(Bu gün için şablonda tanımlı hareket yok — koç tarafından doldurulur.)")

        generated_plan[cap_day] = "\n".join(plan_lines)
        flow_idx += 1

    return WorkoutAnalyzeResponse(
        status="success",
        message="Kural tabanlı antrenman şablonu oluşturuldu.",
        ai_analysis=(
            f"Hedef: {req.goal}, Yaş: {req.age}. Dinlenme günleri algılandı: {rest_days}. "
            f"{_rationale(req.goal, req.age)}"
        ),
        workout_plan=generated_plan,
    )
