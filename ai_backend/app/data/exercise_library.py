"""2026 Biyomekanik & Hipertrofi Odaklı Kapsamlı Egzersiz Kütüphanesi.

Bu sözlük, eski ``ai_backend/main.py`` içindeki ``elite_exercises`` sözlüğünün
birebir kopyasıdır. Her anahtar bir kas grubu / gün etiketidir, değeri ise
"egzersiz slotları" listesidir; her slot birbirinin alternatifi olan
egzersiz isimlerinden oluşan bir listedir.
"""

from __future__ import annotations

ELITE_EXERCISES: dict[str, list[list[str]]] = {
    "Push": [
        ["Smith Machine Incline Press", "Incline Dumbbell Press (30 Derece)", "Converging Chest Press Machine"],
        ["Flat Dumbbell Press", "Pec Deck Fly (Lengthened Partials)", "Cable Crossover (Low to High)"],
        ["Cuff Lateral Raise (Kablo)", "Dumbbell Lateral Raise (Hafif Eğilerek)", "Machine Lateral Raise"],
        ["Cross-body Cable Triceps Extension", "Triceps Rope Pushdown", "Overhead Cable Extension (D-Handle)"],
    ],
    "Pull": [
        ["Single-arm Iliac Lat Pulldown", "Neutral Grip Lat Pulldown", "Assisted Pull-ups"],
        ["Chest Supported T-Bar Row", "Meadows Row", "Barbell Row (Strict Form)"],
        ["Seated Cable Row (D-Handle / Lats Focus)", "Machine High Row (Upper Back Focus)"],
        ["Rear Delt Cable Fly", "Reverse Pec Deck (Lengthened Focus)"],
        ["Preacher Curl (Machine or EZ Bar)", "Incline Dumbbell Curl", "Bayesian Cable Curl (Arkalı)"],
    ],
    "Legs": [
        ["Pendulum Squat", "Hack Squat", "Smith Machine Squat (Topuklar Önde)", "Leg Press (Düşük Duruş)"],
        ["Bulgarian Split Squat (Deficit)", "Walking Lunges (Geniş Adım)", "Leg Extension (Tepede 1sn Bekleme)"],
        ["Seated Leg Curl", "Lying Leg Curl (Kalça Sabit)"],
        ["Romanian Deadlift (Dumbbell)", "Stiff-leg Barbell Deadlift", "Glute Ham Raise"],
        ["Standing Calf Raise", "Seated Calf Raise"],
    ],
    "Upper": [
        ["Incline Machine Press", "Flat Dumbbell Press", "Smith Machine Press"],
        ["Lat Pulldown (Iliac Focus)", "Chest Supported Row", "T-Bar Row"],
        ["Pec Deck Fly", "Cable Lateral Raise", "Cuff Lateral Raise"],
        ["Overhead Triceps Extension", "Triceps Pushdown (V-Bar)"],
        ["Preacher Curl", "Hammer Curl (Kablo)"],
    ],
    "Lower": [
        ["Hack Squat", "Leg Press", "Pendulum Squat"],
        ["Romanian Deadlift", "Seated Leg Curl"],
        ["Leg Extension", "Walking Lunges"],
        ["Standing Calf Raise", "Seated Calf Raise"],
    ],
    "Torso": [
        ["Incline Smith Press", "Dumbbell Bench Press"],
        ["Chest Supported Row", "Lat Pulldown (Wide Grip)"],
        ["Pec Deck Fly", "Cable Crossover"],
        ["Single Arm Cable Row", "Straight Arm Pulldown"],
        ["Cuff Lateral Raise", "Dumbbell Lateral Raise"],
    ],
    "Limbs": [
        ["Hack Squat", "Leg Press"],
        ["Leg Extension", "Sissy Squat"],
        ["Seated Leg Curl", "RDL (Dumbbell)"],
        ["Cable Biceps Curl", "Hammer Curl"],
        ["Overhead Triceps Extension", "Skull Crushers"],
        ["Calf Raises", "Tibialis Raise"],
    ],
}
