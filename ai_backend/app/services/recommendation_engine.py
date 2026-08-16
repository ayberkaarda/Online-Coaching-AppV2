"""Deterministik öneri motoru.

``main.py``'de karşılığı yoktur — bu, sözleşmede tanımlanan yeni
``POST /recommendations`` endpoint'i için tamamen yeni ve rastgelelik
içermeyen (deterministik) bir servistir.

Varsayımlar (istekte ayrıca belirtilmediği için):
- ``recent_weights`` kronolojik sırada (en eski -> en yeni), günlük örnekler
  varsayılır. Haftalık trend, indekse karşı ağırlığın en küçük kareler
  eğiminin 7 ile çarpılmasıyla hesaplanır.
- ``adherence_days``, son 7 günlük pencerede planına uyulan gün sayısını
  temsil eder (spesifikasyondaki "< 4/hafta" eşiği buna göredir).
- Protein yeterliliği değerlendirmesi için vücut ağırlığı referansı olarak
  ``recent_weights``'in en son (en güncel) değeri kullanılır; bu liste
  boşsa protein değerlendirmesi atlanır.
"""

from __future__ import annotations

from app.schemas.recommendations import (
    MacroSample,
    Recommendation,
    RecommendationRequest,
    RecommendationResponse,
)
from app.schemas.workout import Goal

#: goal -> (ideal_min_kg_per_week, ideal_max_kg_per_week). Cut için negatif,
#: bulk için pozitif, maintain için sıfır civarı aralık.
_IDEAL_WEEKLY_CHANGE: dict[Goal, tuple[float, float]] = {
    "cut": (-1.0, -0.3),
    "bulk": (0.15, 0.5),
    "maintain": (-0.2, 0.2),
}

#: Protein yeterliliği için g/kg vücut ağırlığı hedefi (diyet üretim
#: mantığındaki ``target_p = weight_kg * 2.2`` ile tutarlı).
_PROTEIN_TARGET_G_PER_KG = 2.2

_ADHERENCE_WINDOW_DAYS = 7
_LOW_ADHERENCE_THRESHOLD = 4
_HIGH_ADHERENCE_THRESHOLD = 6


def _weekly_weight_trend(weights: list[float]) -> float | None:
    """Kilo ölçümlerinin (kronolojik sırada) haftalık değişim eğimini (kg/hafta) hesaplar.

    En küçük kareler (basit lineer regresyon) ile gün başına eğim bulunur ve
    7 ile çarpılarak haftalık değişime dönüştürülür. En az 2 ölçüm gerekir.
    """
    n = len(weights)
    if n < 2:
        return None

    xs = list(range(n))
    x_mean = sum(xs) / n
    y_mean = sum(weights) / n

    numerator = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, weights, strict=True))
    denominator = sum((x - x_mean) ** 2 for x in xs)

    if denominator == 0:
        return 0.0

    daily_slope = numerator / denominator
    return daily_slope * 7


def _average_protein(macros: list[MacroSample]) -> float | None:
    if not macros:
        return None
    return sum(sample.protein for sample in macros) / len(macros)


def _weight_trend_recommendation(goal: Goal, weekly_change: float | None) -> Recommendation:
    if weekly_change is None:
        return Recommendation(
            category="adherence",
            priority="low",
            title="Daha fazla kilo verisi gerekli",
            detail=(
                "Kilo trendini güvenilir şekilde değerlendirebilmek için en az 2 ölçüm gerekiyor. "
                "Düzenli (haftada en az 2-3 kez) tartılmayı öneririz."
            ),
        )

    ideal_min, ideal_max = _IDEAL_WEEKLY_CHANGE[goal]
    rounded_change = round(weekly_change, 2)

    if goal == "cut":
        if weekly_change > ideal_max:
            return Recommendation(
                category="nutrition",
                priority="medium",
                title="Kilo kaybı hedefin gerisinde",
                detail=(
                    f"Son dönemde haftalık değişim yaklaşık {rounded_change} kg. Cut hedefi için ideal aralık "
                    f"{ideal_min} ile {ideal_max} kg/hafta arasında. Günlük kalori açığını hafifçe artırmayı "
                    "(örn. 100-200 kcal) değerlendir."
                ),
            )

        if weekly_change < ideal_min:
            return Recommendation(
                category="nutrition",
                priority="high",
                title="Kilo kaybı çok hızlı",
                detail=(
                    f"Haftalık kilo kaybın yaklaşık {rounded_change} kg, hedeflenen {ideal_min} ile {ideal_max} kg "
                    "aralığının üzerinde. Bu hızda kas kaybı riski artar; kalori açığını azaltmayı düşün."
                ),
            )
        return Recommendation(
            category="nutrition",
            priority="low",
            title="Kilo kaybı hedefe uygun ilerliyor",
            detail=f"Haftalık değişim yaklaşık {rounded_change} kg ile hedeflenen aralıkta. Mevcut planı sürdür.",
        )

    if goal == "bulk":
        if weekly_change < ideal_min:
            return Recommendation(
                category="nutrition",
                priority="medium",
                title="Kilo alımı hedefin gerisinde",
                detail=(
                    f"Haftalık değişim yaklaşık {rounded_change} kg, hedeflenen {ideal_min} ile {ideal_max} kg "
                    "aralığının altında. Günlük kalori fazlasını hafifçe artırmayı değerlendir."
                ),
            )
        if weekly_change > ideal_max:
            return Recommendation(
                category="nutrition",
                priority="medium",
                title="Kilo alımı hedefin üzerinde",
                detail=(
                    f"Haftalık değişim yaklaşık {rounded_change} kg, hedeflenen {ideal_min} ile {ideal_max} kg "
                    "aralığının üzerinde. Aşırı yağ alımını sınırlamak için kalori fazlasını azaltmayı düşün."
                ),
            )
        return Recommendation(
            category="nutrition",
            priority="low",
            title="Kilo alımı hedefe uygun ilerliyor",
            detail=f"Haftalık değişim yaklaşık {rounded_change} kg ile hedeflenen aralıkta. Mevcut planı sürdür.",
        )

    # maintain
    if weekly_change < ideal_min or weekly_change > ideal_max:
        return Recommendation(
            category="nutrition",
            priority="medium",
            title="Kilo dengesi hedeften sapıyor",
            detail=(
                f"Haftalık değişim yaklaşık {rounded_change} kg. Maintain hedefinde ±{ideal_max} kg aralığında "
                "kalman bekleniyor; kalori alımını mevcut TDEE'ye göre yeniden ayarla."
            ),
        )
    return Recommendation(
        category="nutrition",
        priority="low",
        title="Kilo dengesi korunuyor",
        detail=f"Haftalık değişim yaklaşık {rounded_change} kg ile maintain hedefiyle uyumlu.",
    )


def _bulk_progressive_overload_recommendation() -> Recommendation:
    return Recommendation(
        category="workout",
        priority="medium",
        title="Antrenman hacmini artırmayı değerlendir",
        detail=(
            "Kilo alımı yavaşladığında kalori fazlasının yanı sıra progressive overload (hacim/ağırlık artışı) "
            "da kas gelişimini destekler. Bir sonraki bloklarda set sayısını veya yükü kademeli artır."
        ),
    )


def _fast_cut_recovery_recommendation() -> Recommendation:
    return Recommendation(
        category="recovery",
        priority="medium",
        title="Toparlanmaya öncelik ver",
        detail=(
            "Hızlı kilo kaybı dönemlerinde uyku kalitesi ve dinlenme günleri performans/kas korumasını doğrudan "
            "etkiler. Günde 7-9 saat uyku ve planlanan dinlenme günlerine sadık kalmayı öneririz."
        ),
    )


def _protein_recommendation(
    goal: Goal, avg_protein: float | None, reference_weight_kg: float | None
) -> Recommendation | None:
    if avg_protein is None or reference_weight_kg is None:
        return None

    target_protein = reference_weight_kg * _PROTEIN_TARGET_G_PER_KG
    if target_protein <= 0:
        return None

    ratio = avg_protein / target_protein

    if ratio < 0.8:
        return Recommendation(
            category="nutrition",
            priority="high",
            title="Protein alımı yetersiz",
            detail=(
                f"Ortalama günlük protein alımın ~{round(avg_protein)}g, hedef ~{round(target_protein)}g "
                f"({_PROTEIN_TARGET_G_PER_KG} g/kg). Kas kütlesini korumak/geliştirmek için protein alımını artır."
            ),
        )
    if ratio > 1.3:
        return Recommendation(
            category="nutrition",
            priority="low",
            title="Protein alımı hedefin oldukça üzerinde",
            detail=(
                f"Ortalama günlük protein alımın ~{round(avg_protein)}g, hedef ~{round(target_protein)}g. "
                "Fazla protein zararsız olsa da bu kaloriyi karbonhidrat/yağa yönlendirmek performansı destekleyebilir."
            ),
        )
    return Recommendation(
        category="nutrition",
        priority="low",
        title="Protein alımı hedefe uygun",
        detail=f"Ortalama günlük protein alımın ~{round(avg_protein)}g, hedef ~{round(target_protein)}g ile uyumlu.",
    )


def _adherence_recommendation(adherence_days: int) -> Recommendation:
    if adherence_days < _LOW_ADHERENCE_THRESHOLD:
        return Recommendation(
            category="adherence",
            priority="high",
            title="Programa uyum düşük",
            detail=(
                f"Son {_ADHERENCE_WINDOW_DAYS} günde yaklaşık {adherence_days} gün plana uyulmuş görünüyor. "
                "Haftada en az 4-5 gün tutarlı takip, sonuçları belirgin şekilde hızlandırır."
            ),
        )
    if adherence_days >= _HIGH_ADHERENCE_THRESHOLD:
        return Recommendation(
            category="adherence",
            priority="low",
            title="Uyum mükemmel",
            detail=(
                f"Son {_ADHERENCE_WINDOW_DAYS} günde ~{adherence_days} gün plana uyulmuş. Bu tutarlılık düzeyini "
                "koru; sonuçlar bu sayede kalıcı olur."
            ),
        )
    return Recommendation(
        category="adherence",
        priority="medium",
        title="Uyum orta seviyede",
        detail=(
            f"Son {_ADHERENCE_WINDOW_DAYS} günde ~{adherence_days} gün plana uyulmuş. Küçük engelleri "
            "(örn. hazırlık eksikliği, sosyal ortamlar) belirleyip haftalık uyumu artırmayı hedefle."
        ),
    )


def build_recommendations(req: RecommendationRequest) -> RecommendationResponse:
    """İstekteki geçmiş verilere göre deterministik, kural-tabanlı öneriler üretir."""
    recommendations: list[Recommendation] = []

    weekly_change = _weekly_weight_trend(req.recent_weights)
    recommendations.append(_weight_trend_recommendation(req.goal, weekly_change))

    if weekly_change is not None:
        if req.goal == "bulk" and weekly_change < _IDEAL_WEEKLY_CHANGE["bulk"][0]:
            recommendations.append(_bulk_progressive_overload_recommendation())
        if req.goal == "cut" and weekly_change < _IDEAL_WEEKLY_CHANGE["cut"][0]:
            recommendations.append(_fast_cut_recovery_recommendation())

    reference_weight = req.recent_weights[-1] if req.recent_weights else None
    avg_protein = _average_protein(req.recent_macros)
    protein_rec = _protein_recommendation(req.goal, avg_protein, reference_weight)
    if protein_rec is not None:
        recommendations.append(protein_rec)

    recommendations.append(_adherence_recommendation(req.adherence_days))

    high_priority_count = sum(1 for r in recommendations if r.priority == "high")
    if high_priority_count > 0:
        summary = (
            f"{high_priority_count} kritik öneri dahil olmak üzere toplam {len(recommendations)} öneri oluşturuldu."
        )
    else:
        summary = f"Toplam {len(recommendations)} öneri oluşturuldu; kritik bir sorun tespit edilmedi."

    return RecommendationResponse(status="success", summary=summary, recommendations=recommendations)
