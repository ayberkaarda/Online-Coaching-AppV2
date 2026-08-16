"""``app.services.csv_loader`` için ``tmp_path`` tabanlı round-trip testleri."""

from __future__ import annotations

from pathlib import Path

from app.services.csv_loader import (
    load_exercise_csv,
    load_food_csv,
    write_clean_exercise_csv,
    write_clean_food_csv,
)
from app.services.csv_loader import (
    main as csv_loader_main,
)

RAW_FOOD_CSV = """Food Name,Calories (kcal),Category
"Elma",52,Fruit
"Tavuk Göğsü",165,Meat
"Sıfır Kalori İçecek",0,Drink
,120,Unknown
"""

RAW_EXERCISE_CSV = """Name,BodyPart,Target,Equipment,GifUrl,Image
Bench Press,Chest,Pectorals,Barbell,http://example.com/bench.gif,http://example.com/bench.png
Squat,Legs,Quadriceps,Barbell,http://example.com/squat.gif,http://example.com/squat.png
"""


def test_load_food_csv_filters_zero_calorie_and_empty_name(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_food.csv"
    raw_path.write_text(RAW_FOOD_CSV, encoding="utf-8")

    items = load_food_csv(raw_path)

    names = {item.name for item in items}
    assert names == {"Elma", "Tavuk Göğsü"}
    assert all(item.calories_per_100g > 0 for item in items)


def test_food_csv_round_trip(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_food.csv"
    raw_path.write_text(RAW_FOOD_CSV, encoding="utf-8")
    clean_path = tmp_path / "clean_food.csv"

    items = load_food_csv(raw_path)
    write_clean_food_csv(items, clean_path)

    assert clean_path.exists()
    written = clean_path.read_text(encoding="utf-8")
    assert "name,calories_per_100g" in written
    assert "Elma" in written
    assert "Tavuk Göğsü" in written


def test_load_exercise_csv_reads_all_columns(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_exercise.csv"
    raw_path.write_text(RAW_EXERCISE_CSV, encoding="utf-8")

    items = load_exercise_csv(raw_path)

    assert len(items) == 2
    bench = next(item for item in items if item.name == "Bench Press")
    assert bench.body_part == "Chest"
    assert bench.target == "Pectorals"
    assert bench.equipment == "Barbell"
    assert bench.gif_url == "http://example.com/bench.gif"


def test_exercise_csv_round_trip(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_exercise.csv"
    raw_path.write_text(RAW_EXERCISE_CSV, encoding="utf-8")
    clean_path = tmp_path / "clean_exercise.csv"

    items = load_exercise_csv(raw_path)
    write_clean_exercise_csv(items, clean_path)
    reloaded = load_exercise_csv(clean_path)

    assert {item.name for item in reloaded} == {"Bench Press", "Squat"}


def test_cli_food_round_trip(tmp_path: Path) -> None:
    raw_path = tmp_path / "raw_food.csv"
    raw_path.write_text(RAW_FOOD_CSV, encoding="utf-8")
    out_path = tmp_path / "out_food.csv"

    exit_code = csv_loader_main(["--input", str(raw_path), "--output", str(out_path), "--kind", "food"])

    assert exit_code == 0
    assert out_path.exists()
