# Arşiv — kapanmış yol haritası adımları, Faz 1b ve ertelenenler listesi

**Özet.** Eski §6 "Sonraki adımlar" listesinin 1–10 arası maddeleri (Docker/DB doğrulaması,
mahremiyet turu, `ai_backend` doğrulaması, E2E, DISCOVERY + plan v1.1, Faz 1, Faz 1.5, Faz 1.6,
Faz 1.7, Faz 2) tamamlandı; her maddenin kapanış notu içinde durur. §6b, Faz 1b'nin
(planların normalize tablolara taşınması, `conversations`, `progress_entries`, `coach_notes`,
`form_checks.status`) kapsamını tarif eder — **`PROGRESS.md`'de ayrı bir "Faz 1b tamamlandı"
kaydı hiç yazılmamıştır**, tamamlanma durumu bu belgeden okunamaz. §8 ertelenenler listesi de
buradadır; canlı dosyada kısaltılmış hâli durur.

> `docs/PROGRESS.md`'den taşınmış planlama kaydı; metin ve **bölüm başlıkları birebir**
> korunmuştur (eski `§`-referansları çözülebilsin diye).
> Canlı durum, açık borçlar ve **güncel** sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md).
> Kaynak: arşivleme öncesi `docs/PROGRESS.md` satır 1538–1626, 1680–1701, 1728–1733 —
> 2026-08-17'de taşındı.
>
> **Kapandı (2026-08-18'de doğrulandı):** §6a'dan devreden `src/middleware.ts` → Next 16
> `proxy` göçü aslında Faz 1.5 düzeltme turunda yapılmıştı (`578968f`/`3f36048`); borç
> tablosundaki B-003 satırı bunu fark etmeden açık kalmıştı ve 2026-08-18'de silindi.
> Kapanış kanıtı: [`progress-faz-1.5-guvenlik.md`](progress-faz-1.5-guvenlik.md).
> Aşağıdaki §8'de bu göçün "ertelenenler" arasında sayılması arşivin **birebir korunan**
> tarihsel metnidir; güncel değildir.

---

## 6. Sonraki adımlar (sıralı)

1. Docker Desktop'ı başlat → `npx supabase start` → `npx supabase db reset` (storage
   migration hatasına hazırlıklı ol) → `npm run db:types` ile üretilen tipleri elle yazılanla
   diff'le → `npm run type-check` tekrar yeşil.
   **Kabul kriteri:** `db reset` hatasız tamamlanır (veya storage hatası anlaşılıp not
   düşülür), `database.ts` diff'i sıfır veya bilinçli farklarla açıklanır.
2. Mahremiyet turu: `form-checks-media` private + signed URL; PWA `profiles` cache'i kaldır
   veya logout'ta temizle; `uv lock` üret ve Dockerfile fallback'ini kaldır.
   **Kabul kriteri:** form check medyası public URL ile erişilemez (curl testiyle kanıtla,
   bkz. `active_planprogram.md` AC-2.3); `uv.lock` commit'lenir.
3. `ai_backend` doğrulaması: `uv sync`, `uv run ruff check .`, `uv run mypy app`,
   `uv run pytest`.
   **Kabul kriteri:** üçü de hatasız, kapsam ≥ %70.
4. ~~E2E'yi bir kez yerel koştur (seed kullanıcıları: `coach@example.com` /
   `client1@example.com`, şifre `Passw0rd!23`), CI beklentisiyle hizala.~~
   **TAMAMLANDI (2026-08-16, üçüncü oturum):** `npm run test:e2e` yerelde 28/28 geçti (14
   senaryo × chromium + Mobile Chrome). Dört gerçek sorun bulunup düzeltildi (bkz. Bölüm 3);
   CI'daki `e2e` job'u için yerel Supabase kurulumu hâlâ eksik (bkz. Bölüm 5 risk tablosu).
5. **(SIRADAKI İŞ)** `docs/DISCOVERY.md` yaz (mevcut durum envanteri) ve
   **`active_planprogram.md` v1.1 revizyonunu** kullanıcı onayına sun.
   **Kabul kriteri:** envanter + revizyon listesi (bkz. Bölüm 7) kullanıcıya sunulur, onay
   alınmadan Faz 1'e geçilmez.
6. Ardından: revize planın Faz 1'i (veri modeli + RLS) ile başla — mevcut tek-repo yapısında,
   monorepo'suz.
   **Kabul kriteri:** `active_planprogram.md` AC-1.1–AC-1.4 karşılanır.
7. ~~**Faz 1b bittikten sonra, Faz 2'ye geçmeden: Faz 1.5 — Güvenlik Denetimi ve
   Sertleştirme** (`active_planprogram.md` §3a). Önce `docs/security/AUDIT.md` bulgu raporu
   yazılır ve **kullanıcı onayı alınır**, sonra düzeltmelere geçilir; her düzeltme bir
   regresyon testiyle gelir.~~
   **TAMAMLANDI (2026-08-17):** Denetim (39 bulgu) + düzeltme turu Grup 1–6'nın tamamı
   uygulandı; **36/39 bulgu kapandı**. Kalan 3'ü bilinçli olarak açık: **A-05/A-14** (httpOnly
   cookie + nonce CSP geçişi, kullanıcı kararıyla ayrı bir tura ertelendi) ve **AC-12** (hosted
   proje doğrulaması, açık soru). Detay: `docs/security/AUDIT.md` §4b/§4c,
   `docs/PROGRESS.md` §3 "Faz 1.5 — düzeltme turu, Grup 1–3" ve "Grup 4–6".
8. ~~**Faz 1.6 — Görsel Kimlik Oturumu** (`active_planprogram.md` §3b). **Faz 1.5 ile paralel
   yürütülebilir** — dosya bakımından çakışmıyorlar (Faz 1.5: `supabase/**`, `src/lib/**`,
   `src/proxy.ts`, CI güvenlik adımları; Faz 1.6: `src/design/**`, `tailwind.config.ts`,
   `src/app/globals.css`, `src/app/layout.tsx`). İkisi de **Faz 2'den önce** bitmelidir.
   Kapsam yalnızca **Katman A**: `src/design/tokens.ts` (light/dark iki set) +
   `tailwind.config.ts` bağlaması + `next/font` üç yazı tipi + gömülü 8 ham `#8b5cf6`'nın
   token'a çekilmesi + `viewport.themeColor` + `:focus-visible`/`selection` token'a bağlanması
   - CI ratchet script'i. **Ekran restilizasyonu ve emoji → Lucide dönüşümü KAPSAM DIŞI**
     (Katman B, Faz 2 — ADR-0018). Timebox: tek oturum, tek PR.
     **Kabul kriteri:** AC-1.6.1–AC-1.6.9 karşılanır (AC-1.6.7 `LoopRing` ile birlikte Faz 2'ye
     devredilir). Kaynak kararlar: ADR-0015, ADR-0016, ADR-0017, ADR-0018.~~
     **TAMAMLANDI (2026-08-17):** Katman A iki commit'te uygulandı (`599974c`, `167f65e`).
     AC-1.6.1–AC-1.6.6, AC-1.6.8, AC-1.6.9 karşılandı; **AC-1.6.7 tasarımı gereği Faz 2'ye
     devredildi** (`LoopRing` ile birlikte). Doğrulama: birim 363/363, E2E 42/42, ratchet 6/6,
     build başarılı. Detay: `docs/PROGRESS.md` §3 "Faz 1.6 — Görsel Kimlik Oturumu, Katman A".
9. ~~**Faz 1.7 — Borç Temizliği** (kullanıcı onaylı kapsam): bayat
   kayıtların temizlenmesi · `playwright.config.ts` yorumu `src/env.server.ts`'e ·
   `npm run db:types` diff'i · katalog import'u (`exercises` ve `food_database`
   tablolarında yalnızca 10'ar demo satır var, `data/exercises.csv` 8.7 MB hiç yüklenmedi) ·
   `42501` RLS reddi için `logSecurityEvent()` çağrı noktaları · AC-05 bildirim şablonunun
   `SECURITY DEFINER` RPC'ye taşınması · yetim storage dosyaları ve koç avatarının danışana
   görünmemesi · sequence yetkileri (`authenticated=w`).~~
   **TAMAMLANDI (2026-08-17):** beş paralel dilimle uygulandı — yetim storage dosyaları
   silme (sıra garantili), `42501` merkezî yakalama (yalnızca istemci konsolu, borç olarak
   kaydedildi), AC-05 RPC'ye taşındı, koç avatarı danışana açıldı, sequence yetkileri
   kapatıldı; ayrıca katalog gerçekten import edildi (`exercises` 1328, `food_database` 591)
   ve bunun ortaya çıkardığı iki gerçek kusur (sessiz `max_rows=1000` kesilmesi, E2E'yi
   kararsızlaştıran sayfalamasız `select('*')`) asgari düzeltmeyle kapatıldı. Detay: `docs/
PROGRESS.md` §3 "Faz 1.7 — Borç Temizliği".
10. ~~Faz 2 (koç-danışan çekirdek akışı) — güvenlik temeli sağlamlaştırıldıktan **ve** kimlik
    sistemi kurulduktan **ve** borç temizliği tamamlandıktan sonra. Faz 2'nin ilk mekanik işi
    emoji → Lucide dönüşümüdür ve E2E locator güncellemeleriyle aynı PR'da yapılır
    (ADR-0016); `LoopRing` ilk göründüğü ekranla (gym modu dinlenme sayacı) birlikte yazılır
    (ADR-0017); Katman B restilizasyonu (ADR-0018) ve katalog için sunucu taraflı arama +
    sayfalama da bu fazın işi.~~
    **TAMAMLANDI (2026-08-17):** yedi dilim (2a–2j) ile uygulandı; AC-2.1–AC-2.4 ve
    Faz 1.6'dan devredilen AC-1.6.7 (`LoopRing`) karşılandı. Katalog için sunucu taraflı
    arama + sayfalama bu turda **yapılmadı** — ilgili borç (`useCatalog.ts` `select('*')`
    sayfalamasız) §5'te açık kalmaya devam ediyor. Doğrulama: birim 502/502, RLS 104/104,
    E2E 50/50 (iki koşu + CI yapılandırması), ratchet 6/6. Detay: `docs/PROGRESS.md` §3
    "Faz 2 — Koç-Danışan Çekirdek Akışı".
11. **(SIRADAKI İŞ)** Faz 3 — Yemek Fotoğrafı Makro Tahmini (`active_planprogram.md` §5).
    `ai_backend/**` yarısı Faz 2'nin kalanıyla çakışmadan yürüyebilir; bir UI kuyruğu var
    (`ai_suggested` → `confirmed` onay ekranı, makro dashboard entegrasyonu). `nutrition_logs`
    tablosu Faz 3 için ileriye uyumlu kuruldu: `status` kolonu eklendiğinde
    `default 'confirmed'` ile backfill gerektirmeyecek.
    **Faz sırası notu:** kalan fazlar büyük ölçüde faz düzeyinde paralelleşmiyor — Faz 2 ve
    Faz 4 aynı dosyalara dokunuyor (`StatsTab.tsx`, `CoachUserManagement.tsx`), Faz 3'ün de
    bir UI kuyruğu var. Gerçek paralellik ekseni faz-vs-faz değil, backend-vs-web: Faz 3'ün
    `ai_backend/**` yarısı Faz 2 ile çakışmadan yürüyebilir.

**Not:** Mevcut RLS politikalarını cilalamaya vakit harcanmamalı; Faz 1 şemayı yeniden
yazacak ve 35 politikanın çoğu değişecek. `db reset`'in amacı "production kalitesi" değil,
"SQL gerçek Postgres'te çalışıyor mu".

---

## 6b. Sıradaki iş — Faz 1b

Faz 1a (rol yeniden adlandırma, ADR ayrıştırması, storage mahremiyeti, AI tel protokolü kararı)
tamamlandı. `active_planprogram.md` §3'ün geri kalanı — asıl şema yeniden yazımı ve veri
migrasyonu — Faz 1b olarak devam edecek:

- **Normalize plan tabloları:** `profiles.workout_plan`/`nutrition_plan` (JSON string, `text`
  kolon) → `workout_plans` + `workout_plan_exercises`, `nutrition_plans` +
  `nutrition_plan_meals` (bkz. plan §3.1, §3.5). Versiyonlama (`version`, `is_active`) ve veri
  migrasyonu (mevcut JSON string'lerin satırlara ayrıştırılması, ayrıştırılamayan içeriğin ham
  `notes` alanında korunması) dahil.
- **`conversations` tablosu:** şu an yok; `messages` düz `sender_id`/`receiver_id` ile çalışıyor.
  Her (koç, danışan) çifti için tek konuşma üretilecek, `messages.conversation_id` eklenecek,
  `is_read` → `read_at` dönüşümü kararlaştırılacak (bkz. plan §3.5).
- **`progress_entries` / `progress_photos`:** kilo/ölçü girişi ve açı etiketli ilerleme
  fotoğrafları için ayrı tablolar; şu an kilo yalnızca `form_checks.current_weight` içinde.
- **`coach_notes`:** koç → danışan serbest not tablosu; şu an yok.
- **`form_checks.status`/`coach_feedback`/`reviewed_at`:** şu an yok; dönüşüm kuralı plan
  §3.5'te tanımlı (`coach_feedback` doluysa `reviewed`, boşsa `pending`).
- Her yapısal migration'ın yanında veri migrasyonu yazılacak; eski kolonlar aynı migration'da
  DROP edilmeyecek (bir faz boyunca `DEPRECATED` yorumuyla salt-okunur yan yana yaşayacak, bkz.
  plan §3.5 kuralları).

---

## 8. Ertelenenler (v2 / sonraki fazlar)

pnpm+Turborepo, Expo mobil, nonce tabanlı CSP, Redis/Upstash rate limiter, `next-pwa` →
`@ducanh2912/next-pwa` veya Turbopack'e geçiş, `middleware` → `proxy` göçü, `exercises.csv`
için Git LFS, `useAdminId()`'nin koç oturumlarında gereksiz çalışması, planların `jsonb`
sütuna taşınması.
