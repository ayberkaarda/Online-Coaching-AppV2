"""CSV yükleme / temizleme servis katmanı.

``src/app/clean.js`` (Node.js script'i) içindeki ham Kaggle besin CSV'sini
``name,calories_per_100g`` formatına indirgeyen mantığın Python'a taşınmış
halidir. Ek olarak egzersiz CSV'leri için de benzer bir yükleyici sağlar.
Bağımlılık eklememek için yalnızca ``csv`` stdlib modülü kullanılır (pandas
kullanılmaz).
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from app.schemas.common import ExerciseItem, FoodItem


def _normalize_header(header: str) -> str:
    return header.strip().lower()


def _find_column(headers: list[str], *needles: str) -> int | None:
    """Başlıklardan, herhangi bir ``needles`` alt dizesini içeren ilk sütunun indeksini bulur."""
    for idx, header in enumerate(headers):
        if any(needle in header for needle in needles):
            return idx
    return None


def load_food_csv(path: Path) -> list[FoodItem]:
    """Ham bir besin CSV'sini okur ve kalorisi > 0 olan besinleri döndürür.

    Sütun isimlerini normalize eder; ``name``/``food`` içeren sütunu isim,
    ``calor``/``kcal``/``energy`` içeren sütunu kalori (100g başına) olarak
    kabul eder. ``src/app/clean.js`` ile aynı sütun bulma mantığını kullanır.
    """
    items: list[FoodItem] = []

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.reader(f)
        try:
            raw_headers = next(reader)
        except StopIteration:
            return items

        headers = [_normalize_header(h) for h in raw_headers]
        name_idx = _find_column(headers, "name", "food")
        cal_idx = _find_column(headers, "calor", "kcal", "energy")

        if name_idx is None or cal_idx is None:
            return items

        max_idx = max(name_idx, cal_idx)
        for row in reader:
            if len(row) <= max_idx:
                continue

            name = row[name_idx].strip().strip('"')
            try:
                calories = float(row[cal_idx].strip().strip('"') or 0)
            except ValueError:
                calories = 0.0

            if name and calories > 0:
                items.append(FoodItem(name=name, calories_per_100g=calories))

    return items


def load_exercise_csv(path: Path) -> list[ExerciseItem]:
    """Bir egzersiz CSV'sini okur (``name, body_part, target, equipment, gif_url, image`` sütunları)."""
    items: list[ExerciseItem] = []

    with path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None:
            return items

        normalized_fields = {_normalize_header(name): name for name in reader.fieldnames}

        def _get(row: dict[str, str], key: str) -> str:
            original = normalized_fields.get(key)
            if original is None:
                return ""
            return (row.get(original) or "").strip()

        for row in reader:
            name = _get(row, "name")
            if not name:
                continue
            items.append(
                ExerciseItem(
                    name=name,
                    body_part=_get(row, "body_part") or _get(row, "bodypart"),
                    target=_get(row, "target"),
                    equipment=_get(row, "equipment"),
                    gif_url=_get(row, "gif_url") or _get(row, "gifurl"),
                    image=_get(row, "image"),
                )
            )

    return items


def write_clean_food_csv(rows: list[FoodItem], out_path: Path) -> None:
    """Temizlenmiş besin listesini ``name,calories_per_100g`` formatında yazar."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "calories_per_100g"])
        for item in rows:
            writer.writerow([item.name, item.calories_per_100g])


def write_clean_exercise_csv(rows: list[ExerciseItem], out_path: Path) -> None:
    """Temizlenmiş egzersiz listesini yazar."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["name", "body_part", "target", "equipment", "gif_url", "image"])
        for item in rows:
            writer.writerow([item.name, item.body_part, item.target, item.equipment, item.gif_url, item.image])


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.services.csv_loader",
        description="Ham CSV dosyalarını temizleyip standart formata dönüştürür.",
    )
    parser.add_argument("--input", required=True, type=Path, help="Ham CSV dosya yolu")
    parser.add_argument("--output", required=True, type=Path, help="Temizlenmiş CSV çıktı yolu")
    parser.add_argument("--kind", required=True, choices=["food", "exercise"], help="CSV türü")
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI giriş noktası: ``python -m app.services.csv_loader --input X --output Y --kind food|exercise``."""
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    if args.kind == "food":
        food_rows = load_food_csv(args.input)
        write_clean_food_csv(food_rows, args.output)
        count = len(food_rows)
    else:
        exercise_rows = load_exercise_csv(args.input)
        write_clean_exercise_csv(exercise_rows, args.output)
        count = len(exercise_rows)

    print(f"{count} kayıt '{args.output}' dosyasına yazıldı.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
