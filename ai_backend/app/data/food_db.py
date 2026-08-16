"""Makro besin veritabanı (protein / karbonhidrat / yağ, 100g başına).

Eski ``ai_backend/main.py`` içindeki ``db`` sözlüğünün birebir kopyasıdır.
Anahtarlar: ``p`` (protein g), ``c`` (karbonhidrat g), ``f`` (yağ g) — 100g
besin başına.
"""

from __future__ import annotations

FoodMacro = dict[str, float]

FOOD_DB: dict[str, dict[str, FoodMacro]] = {
    "proteins": {
        "Tavuk Göğsü": {"p": 31, "c": 0, "f": 3.6},
        "Hindi Göğsü": {"p": 29, "c": 0, "f": 1.5},
        "Yumurta": {"p": 13, "c": 1.1, "f": 11},
        "Lor Peyniri": {"p": 16, "c": 3, "f": 1},
        "Somon": {"p": 20, "c": 0, "f": 13},
        "Dana Eti": {"p": 26, "c": 0, "f": 15},
        "Yağsız Kıyma": {"p": 21, "c": 0, "f": 5},
        "Whey Protein": {"p": 80, "c": 5, "f": 2},
    },
    "carbs": {
        "Yulaf": {"p": 13, "c": 68, "f": 6.5},
        "Basmati Pirinç": {"p": 8, "c": 78, "f": 1},
        "Baldo Pirinç": {"p": 7, "c": 79, "f": 1},
        "Yasemin Pirinç": {"p": 7, "c": 80, "f": 0.5},
        "Kepekli Makarna": {"p": 13, "c": 65, "f": 2},
        "Tatlı Patates": {"p": 1.6, "c": 20, "f": 0.1},
        "Karabuğday": {"p": 13, "c": 71, "f": 3.4},
        "Kinoa": {"p": 14, "c": 64, "f": 6},
        "Yeşil Mercimek": {"p": 25, "c": 60, "f": 1},
    },
    "fats": {
        "Zeytinyağı": {"p": 0, "c": 0, "f": 100},
        "Çiğ Badem": {"p": 21, "c": 22, "f": 49},
        "Ceviz": {"p": 15, "c": 14, "f": 65},
        "Fıstık Ezmesi": {"p": 25, "c": 20, "f": 50},
        "Avokado": {"p": 2, "c": 9, "f": 15},
    },
}
