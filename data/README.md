# data/

Bu dizin, uygulamanın Supabase tablolarına import edilen ham/işlenmiş CSV veri
setlerini barındırır. Uygulama kodu bu dosyaları runtime'da OKUMAZ; yalnızca
tek seferlik import/temizleme scriptleri (bkz. `scripts/clean-foods.mjs`) ve
manuel Supabase Table Editor / `supabase db` import akışları için kullanılır.

## Dosyalar

| Dosya | İçerik | Hedef Supabase Tablosu | Not |
|---|---|---|---|
| `exercises.csv` | Ham egzersiz veri seti (kaynak/orijinal indirme) | — (ara ürün) | **8.7 MB**, Git LFS adayı. Doğrudan repoya büyük binary/CSV olarak commitlemek yerine ileride Git LFS'e taşınması önerilir. |
| `clean_exercises.csv` | `exercises.csv`'den türetilmiş, ilk temizleme geçişi | — (ara ürün) | `clean_exercises_v2.csv` ile değiştirildi, referans/arşiv amaçlı tutuluyor. |
| `clean_exercises_v2.csv` | Egzersiz veri setinin son, temizlenmiş hali | `exercises` | Supabase `exercises` tablosuna import edilir. |
| `daily_food_nutrition_dataset.csv` | Kaggle'dan indirilen ham besin/kalori veri seti | — (ara ürün) | `scripts/clean-foods.mjs` girdisi. |
| `clean_foods.csv` | `daily_food_nutrition_dataset.csv`'nin `name,calories_per_100g` formatına indirgenmiş hali | `food_database` | `scripts/clean-foods.mjs` çıktısı, Supabase `food_database` tablosuna import edilir. |

## Yeniden üretme

```bash
npm run clean:foods
# veya özel girdi/çıktı ile:
node scripts/clean-foods.mjs daily_food_nutrition_dataset.csv clean_foods.csv
```

## Git LFS notu

`exercises.csv` (8.7 MB) repodaki en büyük ikili/metin varlıktır. Repo
büyüklüğünü ve clone sürelerini makul tutmak için bu dosyanın Git LFS'e
taşınması değerlendirilmelidir:

```bash
git lfs install
git lfs track "data/exercises.csv"
```
