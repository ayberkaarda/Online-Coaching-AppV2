"""Diyet planı üretim mantığı (kural tabanlı — LLM YOKTUR, bkz. ADR-0021).

Akış: prompt filtreleri -> öğün başına besin seçimi -> makro yakınsamalı
gramaj hesabı -> adlandırılmış öğünlere (Kahvaltı / Öğle / Ara Öğün / Akşam)
biçimlendirme.

MAKRO YAKINSAMASI (madde 5):
    Besinler tek bir makro taşımaz. "Karbonhidrat kaynağı" sayılan Yeşil
    Mercimek 100g'da 25g protein taşır (tavuk göğsünün %80'i); Çiğ Badem
    ve Fıstık Ezmesi 100g'da 21-25g protein taşır. Eski sürüm bu proteini
    HİÇ SAYMIYORDU: protein hedefi yalnız protein kaynaklarından
    doldurulduğu için günün gerçek protein ve kalori toplamı hedefin
    belirgin şekilde üstüne taşıyordu. Artık gramajlar, kaynakların
    birbirine yaptığı katkılar düşülerek birkaç geçişte (sabit nokta
    iterasyonu) hesaplanır. Bu bir LP/optimizasyon çözücüsü DEĞİLDİR.
"""

from __future__ import annotations

import random
from typing import Protocol, TypeVar

from app.data.constants import (
    BREAKFAST_PROTEINS,
    COTTAGE_CHEESE_GRAM_CAP_SINGLE,
    COTTAGE_CHEESE_GRAM_CAP_SPLIT,
    DAYS_CAPITALIZED,
    EGG_GRAM_CAP_SINGLE,
    EGG_GRAM_CAP_SPLIT,
    FAT_MEAL_INDEXES,
    HIGH_VOLUME_CARB_GRAM_CAP,
    HIGH_VOLUME_CARBS,
    MACRO_CONVERGENCE_PASSES,
    MEALS,
    MIN_CARB_PORTION_G,
    MIN_FAT_PORTION_G,
    MIN_PORTION_REFERENCE_KCAL,
    MIN_PROTEIN_PORTION_G,
    NUT_FAT_GRAM_CAP,
    NUT_FAT_SOURCES,
    PORTION_MIN_OVERRIDES,
    PROTEIN_FAT_BUDGET_SHARE,
)
from app.data.food_db import FOOD_DB
from app.schemas.nutrition import MacroTargets, NutritionAnalyzeRequest

_T = TypeVar("_T")


class RandomLike(Protocol):
    """``random.Random`` örnekleri ve ``random`` modülüyle aynı arayüzü paylaşan yapılar için protokol."""

    def choice(self, seq: list[_T]) -> _T: ...


_EGG = "Yumurta"
_COTTAGE_CHEESE = "Lor Peyniri"
_OLIVE_OIL = "Zeytinyağı"
_OATS = "Yulaf"
_CHICKEN_BREAST = "Tavuk Göğsü"

_EGG_GRAMS_PER_UNIT = 50

#: Bir öğünün içeriği: ``(besin adı, gram)`` çiftleri.
MealItems = list[tuple[str, int]]
#: Günün tamamı: ``(öğün adı, içerik)`` çiftleri, ``MEALS`` sırasında.
DailyMeals = list[tuple[str, MealItems]]


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


def _pick_distinct(
    pool: list[str],
    count: int,
    chooser: random.Random | RandomLike,
) -> list[str]:
    """Havuzdan ``count`` adet besin seçer; havuz yettiği sürece TEKRAR ETMEZ.

    Eski sürüm ``random.choices`` (iadeli seçim) kullandığı için aynı besin
    günde dört kez çıkabiliyordu. Havuz ``count``tan küçükse havuz sıfırlanır
    (tekrar kaçınılmazdır), ama tekrar mümkün olduğunca geciktirilir.
    """
    base = list(pool)
    picks: list[str] = []
    available = list(base)

    for _ in range(count):
        if not available:
            available = list(base)
        chosen = chooser.choice(available)
        picks.append(chosen)
        available = [item for item in available if item != chosen]

    return picks


def _fat_per_protein(name: str) -> float:
    """Bir protein kaynağının gram protein başına taşıdığı yağ (g/g)."""
    macro = FOOD_DB["proteins"][name]
    return macro["f"] / macro["p"] if macro["p"] > 0 else float("inf")


def _pick_proteins(
    pool: list[str],
    macro_targets: MacroTargets,
    split_proteins: bool,
    chooser: random.Random | RandomLike,
) -> list[str]:
    """Öğün başına protein kaynaklarını YAĞ BÜTÇESİNE uyarak seçer.

    Protein kaynakları yağ da taşır (Dana Eti 100g'da 15g). Yüksek protein +
    düşük yağ hedefinde yağlı kaynaklarla hedefi tutturmak matematiksel olarak
    imkânsızdır: yalnız protein kaynağının yağı bile bütçeyi aşar. Bu yüzden
    her öğün için, o öğüne düşen yağ payına sığan kaynaklar arasından seçim
    yapılır; hiçbiri sığmazsa en yağsız kaynak alınır. Bütçe genişse (bulk /
    maintain) tüm havuz uygun olur ve çeşitlilik korunur.

    Kahvaltı proteini ayrıca ``BREAKFAST_PROTEINS`` alt kümesiyle kesişir —
    kahvaltıda tavuk göğsü / dana eti çıkmaz.
    """
    target_p = max(0.0, macro_targets.protein_g)
    fat_budget = max(0.0, macro_targets.fat_g) * PROTEIN_FAT_BUDGET_SHARE

    if not pool:
        return []

    if not split_proteins:
        # Tek kaynak günün TAMAMINI taşır: hem yağ bütçesi hem de öğün başına
        # gramaj sınırı (yumurta 200g, lor 200g) gün toplamı üzerinden kontrol
        # edilir — sınırı yüzünden hedefi taşıyamayacak kaynak seçilmez.
        affordable = [
            name
            for name in pool
            if target_p * _fat_per_protein(name) <= fat_budget and _daily_capacity(name, split_proteins) >= target_p
        ]
        candidates = affordable or [name for name in pool if _daily_capacity(name, split_proteins) >= target_p]
        return [chooser.choice(candidates or _leanest(pool))] * len(MEALS)

    per_meal_protein = target_p / len(MEALS)
    picks: list[str] = []
    available = list(pool)
    remaining_budget = fat_budget

    for index in range(len(MEALS)):
        if not available:
            available = list(pool)

        meals_left = len(MEALS) - index
        share = remaining_budget / meals_left

        candidates = [name for name in available if per_meal_protein * _fat_per_protein(name) <= share]
        if index == 0:
            breakfast = [name for name in candidates if name in BREAKFAST_PROTEINS]
            candidates = breakfast or [name for name in available if name in BREAKFAST_PROTEINS] or candidates
        if not candidates:
            candidates = _leanest(available)

        chosen = chooser.choice(candidates)
        picks.append(chosen)
        remaining_budget -= per_meal_protein * _fat_per_protein(chosen)
        available = [name for name in available if name != chosen]

    return picks


def _daily_capacity(name: str, split_proteins: bool) -> float:
    """Bir protein kaynağının gramaj sınırıyla gün boyunca sağlayabileceği azami protein (g)."""
    cap = _gram_cap(name, split_proteins=split_proteins)
    if cap is None:
        return float("inf")
    return len(MEALS) * cap * FOOD_DB["proteins"][name]["p"] / 100


def _leanest(pool: list[str]) -> list[str]:
    """Havuzdaki en yağsız (gram protein başına en az yağ taşıyan) kaynak(lar)."""
    best = min(_fat_per_protein(name) for name in pool)
    return [name for name in pool if _fat_per_protein(name) == best]


def _select_foods(
    *,
    pref_proteins: list[str],
    pref_carbs: list[str],
    pref_fats: list[str],
    split_proteins: bool,
    macro_targets: MacroTargets,
    chooser: random.Random | RandomLike,
) -> tuple[list[str], list[str], list[str]]:
    """Öğün başına protein / karbonhidrat / yağ kaynaklarını seçer.

    Kahvaltı proteini ``BREAKFAST_PROTEINS`` alt kümesinden seçilir
    (kahvaltıda tavuk göğsü / dana eti çıkmaması için). Kullanıcı açıkça
    "tek çeşit protein" istediyse bu istek kahvaltı havuzunu EZER: günün
    tamamı tek kaynaktan kurulur.
    """
    proteins = _pick_proteins(pref_proteins, macro_targets, split_proteins, chooser)

    carbs = _pick_distinct(pref_carbs, len(MEALS), chooser)
    fats = _pick_distinct(pref_fats, len(FAT_MEAL_INDEXES), chooser)

    return proteins, carbs, fats


def _gram_cap(name: str, *, split_proteins: bool) -> int | None:
    """Besin için tek öğünlük üst gramaj sınırı (yoksa ``None``)."""
    if name == _EGG:
        return EGG_GRAM_CAP_SPLIT if split_proteins else EGG_GRAM_CAP_SINGLE
    if name == _COTTAGE_CHEESE:
        return COTTAGE_CHEESE_GRAM_CAP_SPLIT if split_proteins else COTTAGE_CHEESE_GRAM_CAP_SINGLE
    if name in HIGH_VOLUME_CARBS:
        return HIGH_VOLUME_CARB_GRAM_CAP
    if name in NUT_FAT_SOURCES:
        return NUT_FAT_GRAM_CAP
    return None


def _portion_floor(name: str, base_min: int, step: int, scale: float) -> int:
    """Besin için geçerli alt gramaj sınırını (gerekirse hedefe göre küçültülmüş) döndürür."""
    floor_grams = PORTION_MIN_OVERRIDES.get(name, base_min)
    if scale >= 1.0:
        return floor_grams
    return max(step, int(round(floor_grams * scale / step) * step))


def _fill_portions(
    names: list[str],
    category: str,
    macro_key: str,
    total_need: float,
    *,
    min_grams: int,
    step: int,
    split_proteins: bool,
    scale: float,
) -> list[int]:
    """Bir kaynak grubunun öğün gramajlarını hesaplar.

    Kalan ihtiyaç öğün öğün yeniden bölüştürülür: bir öğün üst sınıra
    (ör. 150g yumurta) takıldığında eksik kalan miktar sonraki öğünlere
    devredilir. Böylece cap'ler yüzünden hedefin altında kalma azalır.
    """
    grams_list = [0] * len(names)
    remaining = total_need

    # Üst sınırı OLAN kaynaklar önce hesaplanır. Sıra önemlidir: sınıra takılan
    # bir öğünün eksiği ancak SONRAKİ öğünlere devredilebilir; sınırsız kaynak
    # başta gelirse (ör. pirinç ilk, yulaf son) eksik kapatılamaz ve gün hedefin
    # altında kalır.
    order = sorted(
        range(len(names)),
        key=lambda index: _gram_cap(names[index], split_proteins=split_proteins) is None,
    )

    for position, index in enumerate(order):
        name = names[index]
        slots_left = len(order) - position
        per_100g = FOOD_DB[category][name][macro_key]
        floor_grams = _portion_floor(name, min_grams, step, scale)

        if per_100g <= 0:
            grams = floor_grams
        else:
            raw = (remaining / slots_left) / per_100g * 100
            grams = max(floor_grams, round(raw / step) * step)

        cap = _gram_cap(name, split_proteins=split_proteins)
        if cap is not None and grams > cap:
            grams = cap

        grams_list[index] = int(grams)
        remaining -= grams * per_100g / 100

    return grams_list


def _macro_sum(names: list[str], grams: list[int], category: str, macro_key: str) -> float:
    """Verilen kaynak/gram listesinin belirtilen makro toplamını (gram) döndürür."""
    return sum(gram * FOOD_DB[category][name][macro_key] / 100 for name, gram in zip(names, grams, strict=True))


def _solve_portions(
    *,
    proteins: list[str],
    carbs: list[str],
    fats: list[str],
    macro_targets: MacroTargets,
    split_proteins: bool,
) -> tuple[list[int], list[int], list[int]]:
    """Karşılıklı makro katkılarını hesaba katarak gramajları yakınsatır.

    Her geçişte bir makro grubu, DİĞER iki grubun o makroya yaptığı katkı
    hedeften düşülerek yeniden hesaplanır (Gauss-Seidel tarzı sabit nokta
    iterasyonu). Katkılar hedefe göre küçük olduğu için birkaç geçişte
    kararlı hale gelir.
    """
    target_p = max(0.0, macro_targets.protein_g)
    target_c = max(0.0, macro_targets.carb_g)
    target_f = max(0.0, macro_targets.fat_g)

    scale = min(1.0, macro_targets.calories / MIN_PORTION_REFERENCE_KCAL) if macro_targets.calories > 0 else 1.0

    protein_grams = [0] * len(proteins)
    carb_grams = [0] * len(carbs)
    fat_grams = [0] * len(fats)

    for _ in range(MACRO_CONVERGENCE_PASSES):
        other_p = _macro_sum(carbs, carb_grams, "carbs", "p") + _macro_sum(fats, fat_grams, "fats", "p")
        protein_grams = _fill_portions(
            proteins,
            "proteins",
            "p",
            max(0.0, target_p - other_p),
            min_grams=MIN_PROTEIN_PORTION_G,
            scale=scale,
            step=10,
            split_proteins=split_proteins,
        )

        other_c = _macro_sum(proteins, protein_grams, "proteins", "c") + _macro_sum(fats, fat_grams, "fats", "c")
        carb_grams = _fill_portions(
            carbs,
            "carbs",
            "c",
            max(0.0, target_c - other_c),
            min_grams=MIN_CARB_PORTION_G,
            scale=scale,
            step=10,
            split_proteins=split_proteins,
        )

        other_f = _macro_sum(proteins, protein_grams, "proteins", "f") + _macro_sum(carbs, carb_grams, "carbs", "f")
        fat_need = target_f - other_f
        if fat_need <= 0:
            # Yağ bütçesi zaten protein/karbonhidrat kaynaklarının kendi yağıyla
            # dolmuş: AYRICA yağ eklemek hedefi bilerek aşmak olurdu.
            fat_grams = [0] * len(fats)
        else:
            fat_grams = _fill_portions(
                fats,
                "fats",
                "f",
                fat_need,
                min_grams=MIN_FAT_PORTION_G,
                scale=scale,
                step=5,
                split_proteins=split_proteins,
            )

    return protein_grams, carb_grams, fat_grams


def _olive_oil_topup(
    *,
    proteins: list[str],
    protein_grams: list[int],
    carbs: list[str],
    carb_grams: list[int],
    fats: list[str],
    fat_grams: list[int],
    target_fat_g: float,
) -> int:
    """Cap'ler yüzünden yağ hedefinin altında kalındıysa eklenecek zeytinyağı gramajı.

    Kuruyemiş kaynakları öğün başına 30g ile sınırlıdır; yüksek kalorili
    hedeflerde bu sınır yağ hedefinin altında kalmaya yol açar. Açık kalan
    fark zeytinyağıyla kapatılır (eski davranış korunur).
    """

    total_fat = (
        _macro_sum(proteins, protein_grams, "proteins", "f")
        + _macro_sum(carbs, carb_grams, "carbs", "f")
        + _macro_sum(fats, fat_grams, "fats", "f")
    )
    shortfall = target_fat_g - total_fat
    if shortfall <= MIN_FAT_PORTION_G:
        return 0
    return int(round(shortfall / FOOD_DB["fats"][_OLIVE_OIL]["f"] * 100 / 5) * 5)


def _merge_items(items: MealItems) -> MealItems:
    """Aynı öğünde iki kez geçen besini tek satırda toplar (sıra korunur)."""
    merged: dict[str, int] = {}
    for name, grams in items:
        merged[name] = merged.get(name, 0) + grams
    return list(merged.items())


def _build_daily_meals(
    *,
    pref_proteins: list[str],
    pref_carbs: list[str],
    pref_fats: list[str],
    split_proteins: bool,
    macro_targets: MacroTargets,
    chooser: random.Random | RandomLike,
) -> DailyMeals:
    """Bir günün adlandırılmış öğünlerini (besin + gramaj) üretir."""
    proteins, carbs, fats = _select_foods(
        pref_proteins=pref_proteins,
        pref_carbs=pref_carbs,
        pref_fats=pref_fats,
        split_proteins=split_proteins,
        macro_targets=macro_targets,
        chooser=chooser,
    )

    protein_grams, carb_grams, fat_grams = _solve_portions(
        proteins=proteins,
        carbs=carbs,
        fats=fats,
        macro_targets=macro_targets,
        split_proteins=split_proteins,
    )

    meals: DailyMeals = [(meal_name, []) for meal_name in MEALS]

    for index in range(len(MEALS)):
        items = meals[index][1]
        items.append((proteins[index], protein_grams[index]))
        items.append((carbs[index], carb_grams[index]))

    for fat_index, meal_index in enumerate(FAT_MEAL_INDEXES):
        if fat_grams[fat_index] > 0:
            meals[meal_index][1].append((fats[fat_index], fat_grams[fat_index]))

    extra_oil = _olive_oil_topup(
        proteins=proteins,
        protein_grams=protein_grams,
        carbs=carbs,
        carb_grams=carb_grams,
        fats=fats,
        fat_grams=fat_grams,
        target_fat_g=max(0.0, macro_targets.fat_g),
    )
    if extra_oil > 0:
        meals[FAT_MEAL_INDEXES[-1]][1].append((_OLIVE_OIL, extra_oil))

    return [(name, _merge_items(items)) for name, items in meals]


def daily_macro_totals(meals: DailyMeals) -> tuple[int, int, int, int]:
    """Günün gerçekleşen ``(kcal, protein_g, carb_g, fat_g)`` toplamını döndürür.

    Kalori Atwater katsayılarıyla hesaplanır: protein 4, karbonhidrat 4,
    yağ 9 kcal/g.
    """
    protein_g = 0.0
    carb_g = 0.0
    fat_g = 0.0

    for _, items in meals:
        for name, grams in items:
            for category in ("proteins", "carbs", "fats"):
                macro = FOOD_DB[category].get(name)
                if macro is None:
                    continue
                protein_g += grams * macro["p"] / 100
                carb_g += grams * macro["c"] / 100
                fat_g += grams * macro["f"] / 100
                break

    kcal = protein_g * 4 + carb_g * 4 + fat_g * 9
    return round(kcal), round(protein_g), round(carb_g), round(fat_g)


def _format_item(name: str, grams: int) -> str:
    if name == _EGG:
        return f"{name}:{grams} ({int(grams / _EGG_GRAMS_PER_UNIT)} Adet)"
    return f"{name}:{grams}"


def _format_daily_meals(meals: DailyMeals, macro_targets: MacroTargets) -> str:
    """Günü öğün satırlarına ve bir "Toplam" satırına çevirir.

    Biçim (satır başına bir öğün) bilinçlidir: eski tek satırlık
    ``"Tavuk Göğsü:280, Yulaf:80, ..."`` çıktısı alışveriş listesi gibi
    okunuyordu. ``besin:gram`` jetonları korunur — web tarafındaki kalori
    toplayıcı bu jetonları ayrıştırır.
    """
    lines: list[str] = []
    for meal, items in meals:
        if not items:
            continue
        lines.append(f"{meal}: {', '.join(_format_item(name, grams) for name, grams in items)}")

    kcal, protein, carb, fat = daily_macro_totals(meals)
    lines.append(
        f"Toplam: {kcal} kcal | P:{protein}g K:{carb}g Y:{fat}g "
        f"(Hedef: {macro_targets.calories} kcal | P:{round(macro_targets.protein_g)}g "
        f"K:{round(max(0.0, macro_targets.carb_g))}g Y:{round(macro_targets.fat_g)}g)"
    )

    return "\n".join(lines)


def generate_diet_plan(
    req: NutritionAnalyzeRequest,
    macro_targets: MacroTargets,
    rng: random.Random | RandomLike | None = None,
) -> tuple[dict[str, str], str]:
    """Bir haftalık diyet planı ve analiz mesajı üretir.

    ``rng`` verilmezse global ``random`` modülü kullanılır. Döner:
    ``(diet_plan, analysis_message)``.
    """
    chooser: random.Random | RandomLike = rng if rng is not None else random

    pref_proteins, pref_carbs, pref_fats, split_proteins = apply_food_preferences(req.user_prompt)

    diet_plan: dict[str, str] = {}
    daily_kcal: list[int] = []

    for day in DAYS_CAPITALIZED:
        meals = _build_daily_meals(
            pref_proteins=pref_proteins,
            pref_carbs=pref_carbs,
            pref_fats=pref_fats,
            split_proteins=split_proteins,
            macro_targets=macro_targets,
            chooser=chooser,
        )
        diet_plan[day] = _format_daily_meals(meals, macro_targets)
        daily_kcal.append(daily_macro_totals(meals)[0])

    average_kcal = round(sum(daily_kcal) / len(daily_kcal))
    analysis_msg = (
        f"TDEE: {macro_targets.calories} kcal. "
        f"Hedef makrolar P:{round(macro_targets.protein_g)}g "
        f"K:{round(max(0.0, macro_targets.carb_g))}g Y:{round(macro_targets.fat_g)}g. "
        f"Kural tabanlı öğün şablonu ({' / '.join(MEALS)}); haftalık ortalama gerçekleşen: {average_kcal} kcal."
    )
    if not split_proteins:
        analysis_msg += " 'Tek çeşit protein' isteği uygulandı."

    return diet_plan, analysis_msg
