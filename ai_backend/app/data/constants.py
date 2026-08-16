"""Paylaşılan sabitler: haftanın günleri, split mantığı, aktivite çarpanları."""

from __future__ import annotations

#: Kullanıcı prompt'unda dinlenme günü tespiti için kullanılan (küçük harf) gün adları.
DAYS: list[str] = ["pazartesi", "salı", "çarşamba", "perşembe", "cuma", "cumartesi", "pazar"]

#: Diyet planı çıktısında kullanılan (baş harfi büyük) gün adları.
DAYS_CAPITALIZED: list[str] = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]

#: Dinlenme günü tespitinde aranan anahtar kelimeler.
REST_DAY_KEYWORDS: list[str] = ["yok", "off", "dinlenme", "yapmicam"]

#: split_type -> o split'e ait antrenman gün akışı (kas grubu sırası).
SPLIT_LOGIC: dict[str, list[str]] = {
    "ppl_torso_limbs": ["Push", "Pull", "Legs", "Torso", "Limbs"],
    "ppl": ["Push", "Pull", "Legs"],
    "upper_lower": ["Upper", "Lower"],
    "torso_limbs": ["Torso", "Limbs"],
}

#: split_type -> kullanıcı prompt'unda gün belirtilmediğinde uygulanan varsayılan dinlenme günleri.
DEFAULT_REST_DAYS: dict[str, list[str]] = {
    "ppl_torso_limbs": ["Çarşamba", "Pazar"],
    "ppl": ["Perşembe", "Pazar"],
    "upper_lower": ["Çarşamba", "Cumartesi", "Pazar"],
    "torso_limbs": ["Çarşamba", "Cumartesi", "Pazar"],
}

#: Adım sayısı eşiği (üst sınır, dahil değil) -> TDEE aktivite çarpanı.
#: Sıra önemlidir: ilk eşleşen (steps < threshold) eşik kullanılır; hiçbiri
#: eşleşmezse son (en yüksek) çarpan kullanılır.
ACTIVITY_MULTIPLIERS: list[tuple[int, float]] = [
    (5000, 1.2),
    (8000, 1.375),
    (10000, 1.55),
    (12000, 1.725),
]
ACTIVITY_MULTIPLIER_DEFAULT: float = 1.9

#: Diyet planında protein kaynağı başına üst gramaj sınırları (protein bölüştürülürken).
EGG_GRAM_CAP_SPLIT: int = 150
COTTAGE_CHEESE_GRAM_CAP_SPLIT: int = 100
#: "tek çeşit protein" istendiğinde uygulanan daha gevşek sınırlar.
EGG_GRAM_CAP_SINGLE: int = 200
COTTAGE_CHEESE_GRAM_CAP_SINGLE: int = 200

#: Yüksek glisemik/hacimli karbonhidrat kaynakları için tek öğün üst sınırı.
HIGH_VOLUME_CARBS: tuple[str, ...] = ("Yulaf", "Kinoa", "Karabuğday")
HIGH_VOLUME_CARB_GRAM_CAP: int = 80

#: Kuruyemiş bazlı yağ kaynakları için tek öğün üst sınırı.
NUT_FAT_SOURCES: tuple[str, ...] = ("Çiğ Badem", "Ceviz", "Fıstık Ezmesi")
NUT_FAT_GRAM_CAP: int = 30
