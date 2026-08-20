"""2026 Biyomekanik & Hipertrofi Odaklı Kapsamlı Egzersiz Kütüphanesi.

Her anahtar bir kas grubu / gün etiketidir, değeri ise "egzersiz slotları"
listesidir. Her slot ``(kind, options)`` biçiminde bir demettir:

* ``kind``  — slotun hareket doğası: ``"compound"`` (çok eklemli) veya
  ``"isolation"`` (tek eklemli). Set/tekrar şeması bu etikete göre seçilir
  (bkz. ``app.services.workout_generator.determine_base_sets``).
* ``options`` — birbirinin alternatifi olan egzersiz isimleri.

ETİKETLEME KURALI (bilinçli ve muhafazakâr):
    Bir slot ancak ve ancak **içindeki tüm seçenekler çok eklemli** ise
    ``"compound"`` sayılır. Slot karışıksa (ör. "Flat Dumbbell Press /
    Pec Deck Fly / Cable Crossover") ``"isolation"`` etiketlenir; çünkü
    bir presi 3x10-15 ile yapmak meşru bir hipertrofi reçetesiyken, bir
    pec deck fly'ı 4x5-8 ile yapmak değildir. Etiket slot SIRASINDAN
    ÇIKARILMAZ — sıra kırılgandır (ör. Legs slot 3 = RDL, bileşiktir;
    Push slot 1 = fly, izolasyondur).
"""

from __future__ import annotations

from typing import Literal

#: Egzersiz slotunun hareket doğası. Set/tekrar şemasını belirler.
ExerciseKind = Literal["compound", "isolation"]

#: Kas grubu -> [(slot doğası, alternatif egzersizler)] listesi.
ELITE_EXERCISES: dict[str, list[tuple[ExerciseKind, list[str]]]] = {
    "Push": [
        # 3/3 çok eklemli göğüs presi -> bileşik.
        (
            "compound",
            ["Smith Machine Incline Press", "Incline Dumbbell Press (30 Derece)", "Converging Chest Press Machine"],
        ),
        # Flat DB Press çok eklemli ama iki alternatifi tek eklemli fly -> izolasyon şeması.
        ("isolation", ["Flat Dumbbell Press", "Pec Deck Fly (Lengthened Partials)", "Cable Crossover (Low to High)"]),
        # Yan omuz kaldırışları: tek eklemli.
        (
            "isolation",
            ["Cuff Lateral Raise (Kablo)", "Dumbbell Lateral Raise (Hafif Eğilerek)", "Machine Lateral Raise"],
        ),
        # Triceps ekstansiyonları: tek eklemli.
        (
            "isolation",
            ["Cross-body Cable Triceps Extension", "Triceps Rope Pushdown", "Overhead Cable Extension (D-Handle)"],
        ),
    ],
    "Pull": [
        # Dikey çekiş: bileşik.
        ("compound", ["Single-arm Iliac Lat Pulldown", "Neutral Grip Lat Pulldown", "Assisted Pull-ups"]),
        # Yatay çekiş (row): bileşik.
        ("compound", ["Chest Supported T-Bar Row", "Meadows Row", "Barbell Row (Strict Form)"]),
        # İkinci yatay çekiş: bileşik.
        ("compound", ["Seated Cable Row (D-Handle / Lats Focus)", "Machine High Row (Upper Back Focus)"]),
        # Arka omuz: tek eklemli.
        ("isolation", ["Rear Delt Cable Fly", "Reverse Pec Deck (Lengthened Focus)"]),
        # Biceps curl: tek eklemli.
        ("isolation", ["Preacher Curl (Machine or EZ Bar)", "Incline Dumbbell Curl", "Bayesian Cable Curl (Arkalı)"]),
    ],
    "Legs": [
        # Squat kalıbı: bileşik.
        (
            "compound",
            ["Pendulum Squat", "Hack Squat", "Smith Machine Squat (Topuklar Önde)", "Leg Press (Düşük Duruş)"],
        ),
        # Karışık (tek bacak bileşik + leg extension izolasyon) -> izolasyon şeması.
        (
            "isolation",
            ["Bulgarian Split Squat (Deficit)", "Walking Lunges (Geniş Adım)", "Leg Extension (Tepede 1sn Bekleme)"],
        ),
        # Hamstring curl: tek eklemli.
        ("isolation", ["Seated Leg Curl", "Lying Leg Curl (Kalça Sabit)"]),
        # Kalça menteşesi (hinge): 3/3 çok eklemli -> bileşik.
        ("compound", ["Romanian Deadlift (Dumbbell)", "Stiff-leg Barbell Deadlift", "Glute Ham Raise"]),
        # Baldır: tek eklemli.
        ("isolation", ["Standing Calf Raise", "Seated Calf Raise"]),
    ],
    "Upper": [
        ("compound", ["Incline Machine Press", "Flat Dumbbell Press", "Smith Machine Press"]),
        ("compound", ["Lat Pulldown (Iliac Focus)", "Chest Supported Row", "T-Bar Row"]),
        ("isolation", ["Pec Deck Fly", "Cable Lateral Raise", "Cuff Lateral Raise"]),
        ("isolation", ["Overhead Triceps Extension", "Triceps Pushdown (V-Bar)"]),
        ("isolation", ["Preacher Curl", "Hammer Curl (Kablo)"]),
    ],
    "Lower": [
        ("compound", ["Hack Squat", "Leg Press", "Pendulum Squat"]),
        # RDL bileşik, seated leg curl izolasyon -> muhafazakâr şekilde izolasyon.
        ("isolation", ["Romanian Deadlift", "Seated Leg Curl"]),
        ("isolation", ["Leg Extension", "Walking Lunges"]),
        ("isolation", ["Standing Calf Raise", "Seated Calf Raise"]),
    ],
    "Torso": [
        ("compound", ["Incline Smith Press", "Dumbbell Bench Press"]),
        ("compound", ["Chest Supported Row", "Lat Pulldown (Wide Grip)"]),
        ("isolation", ["Pec Deck Fly", "Cable Crossover"]),
        # Straight arm pulldown tek eklemli -> izolasyon.
        ("isolation", ["Single Arm Cable Row", "Straight Arm Pulldown"]),
        ("isolation", ["Cuff Lateral Raise", "Dumbbell Lateral Raise"]),
    ],
    "Limbs": [
        ("compound", ["Hack Squat", "Leg Press"]),
        ("isolation", ["Leg Extension", "Sissy Squat"]),
        # RDL bileşik ama slotun birincil hareketi hamstring curl -> izolasyon.
        ("isolation", ["Seated Leg Curl", "RDL (Dumbbell)"]),
        ("isolation", ["Cable Biceps Curl", "Hammer Curl"]),
        ("isolation", ["Overhead Triceps Extension", "Skull Crushers"]),
        ("isolation", ["Calf Raises", "Tibialis Raise"]),
    ],
}
