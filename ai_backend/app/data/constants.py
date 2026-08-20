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

# ---------------------------------------------------------------------------
# Antrenman: 4 haftalık progresif aşırı yükleme dalgası
# ---------------------------------------------------------------------------
#: Mezosiklus uzunluğu (hafta). Blok periyodizasyon veya otomatik deload YOKTUR;
#: tek bir doğrusal dalga uygulanır.
MESOCYCLE_WEEKS: int = 4

#: Hafta (1..4) -> (temel set sayısına eklenen set, o haftanın RIR etiketi).
#: Hafta 1-2 hacim sabit, yük RIR düşürülerek artar; hafta 3-4'te set sayısı +1.
#: RIR etiketlerinde tire (-) KULLANILMAZ: plan metnindeki ilerleme satırı web
#: tarafındaki yedek ayrıştırıcıya (parseDayPlan) egzersiz gibi görünmemelidir.
#: Kaynak mantık: Schoenfeld ve ark. (2017) hacim-yanıt ilişkisi + RIR bazlı
#: otoregülasyon (Helms ve ark., 2016).
WEEKLY_PROGRESSION: tuple[tuple[int, str], ...] = (
    (0, "3"),
    (0, "2"),
    (1, "1"),
    (1, "0/1"),
)

# ---------------------------------------------------------------------------
# Beslenme: öğün yapısı
# ---------------------------------------------------------------------------
#: Günün adlandırılmış öğünleri. Protein ve karbonhidrat seçimleri sırayla bu
#: öğünlere bağlanır (i'inci seçim -> i'inci öğün).
MEALS: tuple[str, ...] = ("Kahvaltı", "Öğle", "Ara Öğün", "Akşam")

#: Yağ kaynaklarının dağıtıldığı öğünlerin ``MEALS`` içindeki indeksleri
#: (Öğle ve Akşam). Kahvaltı/ara öğün yağını besinlerin kendi yağı karşılar.
FAT_MEAL_INDEXES: tuple[int, ...] = (1, 3)

#: Kahvaltıda kullanılabilecek protein kaynakları. Kahvaltı öğününde tavuk
#: göğsü / dana eti gibi kaynakların çıkmaması için bilinçli bir alt kümedir.
BREAKFAST_PROTEINS: tuple[str, ...] = ("Yumurta", "Lor Peyniri", "Whey Protein")

#: Öğün başına alt gramaj sınırları (porsiyonun anlamsız küçüklükte olmaması için).
MIN_PROTEIN_PORTION_G: int = 50
MIN_CARB_PORTION_G: int = 40
MIN_FAT_PORTION_G: int = 10

#: Besin bazlı alt sınır istisnaları. Whey için 50g (~1.7 ölçek) gereksiz yüksek
#: bir taban; tek ölçek (~30g) gerçekçi porsiyondur ve kalan proteini gerçek
#: yiyeceklere bırakır.
PORTION_MIN_OVERRIDES: dict[str, int] = {"Whey Protein": 30}

#: Alt gramaj sınırlarının tam olarak uygulandığı referans kalori. Hedef bunun
#: altındaysa sınırlar orantılı küçülür — aksi halde çok düşük kalorili
#: hedeflerde (ör. hafif kilolu bir danışanın agresif cut'ı) yalnızca taban
#: porsiyonlar bile hedefi aşar ve plan hedefe yakınsayamaz.
MIN_PORTION_REFERENCE_KCAL: int = 1800

#: Günlük yağ hedefinin, protein kaynaklarının kendi yağına ayrılan payı.
#: Kalan pay karbonhidrat kaynaklarının yağına ve eklenen yağ kaynaklarına
#: bırakılır. Protein seçimi bu bütçeye göre yapılır: bütçe darsa (agresif
#: cut) yağlı kaynaklar (dana eti, somon, yumurta) elenir — diyetisyen
#: refleksinin kural tabanlı karşılığı.
PROTEIN_FAT_BUDGET_SHARE: float = 0.6

#: Makro yakınsaması için sabit nokta iterasyon sayısı. Protein kaynakları yağ,
#: karbonhidrat kaynakları protein taşır; gramajlar birkaç geçişte karşılıklı
#: katkılar düşülerek yeniden hesaplanır. Optimizasyon çözücü DEĞİLDİR.
MACRO_CONVERGENCE_PASSES: int = 4
