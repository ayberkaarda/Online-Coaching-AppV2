"""BMR / TDEE / makro hedefi hesaplama mantığı (kural tabanlı — LLM yoktur).

Eski ``ai_backend/main.py`` içindeki ``generate_ai_diet`` fonksiyonunun
Mifflin-St Jeor BMR formülü, adım-bazlı aktivite çarpanı ve makro dağılımı
hesaplarının birebir kopyasıdır.

Literatür:
* Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO (1990).
  "A new predictive equation for resting energy expenditure in healthy
  individuals." *Am J Clin Nutr* 51(2):241-247. — BMR denklemi.
* Frankenfield D, Roth-Yousey L, Compher C (2005). *J Am Diet Assoc*
  105(5):775-789. — Mifflin-St Jeor'un Harris-Benedict'e göre sağlıklı
  yetişkinlerde daha doğru olduğunu gösteren sistematik derleme.
* Morton RW ve ark. (2018). *Br J Sports Med* 52(6):376-384. — Direnç
  antrenmanında protein alımı; kazanımların ~1.6 g/kg/gün civarında
  platolaşması, güven aralığının üst sınırı ~2.2 g/kg/gün.
* Helms ER, Aragon AA, Fitschen PJ (2014). *J Int Soc Sports Nutr* 11:20.
  — Doğal vücut geliştirme hazırlığında protein 2.3-3.1 g/kg yağsız kütle,
  yağ enerjinin %15-30'u.
* Institute of Medicine (2005), *DRI: Energy, Carbohydrate, Fiber, Fat...*
  — Atwater katsayıları (protein 4, karbonhidrat 4, yağ 9 kcal/g).
* Tudor-Locke C, Bassett DR (2004). *Sports Med* 34(1):1-8. — Adım
  sayısına dayalı aktivite sınıflandırması (``ACTIVITY_MULTIPLIERS``
  eşiklerinin dayandığı "5000 altı sedanter / 10000+ aktif" bandı).
"""

from __future__ import annotations

from app.data.constants import ACTIVITY_MULTIPLIER_DEFAULT, ACTIVITY_MULTIPLIERS
from app.schemas.nutrition import Gender, MacroTargets
from app.schemas.workout import Goal


def calculate_bmr(*, weight_kg: float, height_cm: float, age: int, gender: Gender) -> float:
    """Mifflin-St Jeor (1990) formülüyle bazal metabolizma hızını (BMR) hesaplar.

    ``BMR = 10 x kg + 6.25 x cm - 5 x yaş + s`` (erkek ``s = +5``,
    kadın ``s = -161``). Sağlıklı yetişkinlerde ölçülen dinlenme enerji
    harcamasının ~%10 hata payıyla en iyi tahmincisidir
    (Frankenfield ve ark., 2005).
    """
    bmr = (10 * weight_kg) + (6.25 * height_cm) - (5 * age)
    bmr += 5 if gender == "male" else -161
    return bmr


def activity_multiplier(steps: int) -> float:
    """Günlük adım sayısına göre TDEE aktivite çarpanını döndürür.

    Eşikler Tudor-Locke & Bassett (2004) adım-aktivite sınıflandırmasıyla
    hizalıdır: <5000 sedanter (1.2), 5000-7999 az aktif (1.375),
    8000-9999 biraz aktif (1.55), 10000-11999 aktif (1.725), 12000+ çok
    aktif (1.9).
    """
    for threshold, multiplier in ACTIVITY_MULTIPLIERS:
        if steps < threshold:
            return multiplier
    return ACTIVITY_MULTIPLIER_DEFAULT


def calculate_tdee(*, bmr: float, steps: int, goal: Goal) -> float:
    """BMR, adım sayısı ve hedefe göre günlük toplam enerji harcamasını (TDEE) hesaplar.

    Hedef düzeltmesi ±500 kcal/gün: ~0.45 kg (1 lb) yağ dokusunun yaklaşık
    3500 kcal'lik enerji karşılığından türeyen, haftada ~0.5 kg değişim
    hedefleyen klasik yaklaşımdır (Wishnofsky, 1958). Uzun vadede metabolik
    adaptasyon nedeniyle bir üst sınır tahmini olarak okunmalıdır (Hall,
    2008).
    """
    tdee = bmr * activity_multiplier(steps)
    if goal == "cut":
        tdee -= 500
    elif goal == "bulk":
        tdee += 500
    return tdee


def calculate_macro_targets(*, weight_kg: float, target_calories: int) -> MacroTargets:
    """Hedef kaloriye göre protein/karbonhidrat/yağ (gram) hedeflerini hesaplar.

    * **Protein: 2.2 g/kg vücut ağırlığı.** Direnç antrenmanı yapan
      yetişkinlerde önerilen 1.6-2.2 g/kg/gün aralığının üst ucudur;
      1.6 g/kg üzerinde ek kazanım gösterilememiş, 2.2 g/kg ise güven
      aralığının üst sınırı olarak raporlanmıştır (Morton ve ark., 2018).
      Kalori açığında yağsız kütle korunumu için aralığın üst ucu tercih
      edilir (Helms ve ark., 2014).
    * **Yağ: hedef kalorinin %25'i** (9 kcal/g). Hormonal fonksiyon için
      önerilen %15-30 bandının ortasıdır (Helms ve ark., 2014).
    * **Karbonhidrat: kalan kalori** (4 kcal/g) — antrenman performansını
      besleyen artık kalem.

    Katsayılar Atwater sistemidir (IOM, 2005): protein 4, karbonhidrat 4,
    yağ 9 kcal/g.

    NOT: protein hedefi TOPLAM vücut ağırlığından türetilir. Yüksek yağ
    oranlı danışanlarda bu, yağsız kütleye göre yüksek bir hedef üretir;
    ``app.services.diet_generator`` bu durumda yağ bütçesini korumak için
    yağsız protein kaynaklarını tercih eder.
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
