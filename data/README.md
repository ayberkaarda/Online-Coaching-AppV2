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

## Supabase'e import

Temizlenmiş CSV'leri Supabase tablolarına aktarmak için `scripts/import-catalog.mjs`
kullanılır. Manuel Table Editor / `supabase db` import akışına gerek yoktur.

| CSV | Hedef tablo | Sütun eşlemesi |
|---|---|---|
| `clean_exercises_v2.csv` | `public.exercises` | `name, body_part, target, equipment, gif_url, image` |
| `clean_foods.csv` | `public.food_database` | `name, calories_per_100g` |

### Çalıştırma

```bash
# Ortam değişkenlerini ver (bkz. aşağıdaki not) ve çalıştır
npm run db:import-catalog

# Önce ne olacağını gör — hiçbir şey yazılmaz
node scripts/import-catalog.mjs --dry-run

# Yalnızca tek bir tabloyu güncelle
node scripts/import-catalog.mjs --exercises-only
node scripts/import-catalog.mjs --foods-only

# Tüm seçenekler
node scripts/import-catalog.mjs --help
```

### Ortam değişkenleri

| Değişken | Açıklama |
|---|---|
| `SUPABASE_URL` (veya `NEXT_PUBLIC_SUPABASE_URL`) | Supabase proje URL'i (yerelde `http://127.0.0.1:54321`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role anahtarı |

Service-role anahtarı **zorunludur**: RLS politikalarında `exercises` ve
`food_database` tablolarına yazma yetkisi yalnızca koç rolüne açıktır, anon/authenticated
anahtarlarla import başarısız olur.

Script `.env.local` dosyasını **bilerek okumaz**. O dosya barındırılan (production)
projeye işaret ettiği için, değişkenler kazayla canlı veritabanına yazmayı önlemek adına
her çalıştırmada açıkça verilmelidir:

```bash
# Yerel Supabase (anahtar: `npx supabase status` çıktısındaki "service_role key")
SUPABASE_URL="http://127.0.0.1:54321" \
SUPABASE_SERVICE_ROLE_KEY="<yerel service_role key>" \
npm run db:import-catalog
```

Barındırılan projeye import ederken anahtar Supabase Dashboard →
**Project Settings → API → Project API keys → `service_role`** bölümünden alınır.
Bu anahtar RLS'i tamamen bypass eder; repoya, `.env.example`'a veya loglara
**asla yazılmaz**, yalnızca kabuk ortamında/CI secret olarak verilir.

### Davranış

- **Idempotent:** yazma işlemi `name` sütunu üzerinden `upsert` (`onConflict: 'name'`)
  ile yapılır. Script kaç kez çalıştırılırsa çalıştırılsın satır sayısı artmaz; mevcut
  satırlar yalnızca güncellenir. Bu yüzden CSV'ler değiştiğinde tekrar çalıştırmak güvenlidir.
- **Toplu yazma:** 500'lük partiler hâlinde, her partide hata kontrolüyle.
- **Dosya içi tekilleştirme:** aynı `name` CSV'de birden fazla geçerse son kayıt kazanır.
  (Aksi hâlde Postgres `ON CONFLICT DO UPDATE command cannot affect row a second time`
  hatası verir.) `clean_exercises_v2.csv`'de 6, `clean_foods.csv`'de 58 tekrarlı isim vardır.
- **Doğrulama:** boş `name` olan, kalorisi sayıya çevrilemeyen, negatif veya
  `numeric(7,2)` aralığını aşan satırlar atlanır ve özet tabloda raporlanır.
- **Kodlama onarımı:** `clean_exercises_v2.csv` içinde bozuk kodlanmış birkaç isim
  (`sled 45в° calf press` → `sled 45° calf press`) otomatik onarılır. Onarım körlemesine
  değil, yalnızca bozulma imzası taşıyan alanlara uygulanır; temiz Türkçe/Unicode metin
  (`Tavuk Göğsü`, `sautéed`, `Ragù`) olduğu gibi korunur.

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
