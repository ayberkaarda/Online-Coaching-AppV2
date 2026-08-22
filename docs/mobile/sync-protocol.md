# Mobil Offline Senkron Protokolü — Aktif Antrenman Oturumu

Tur 2 — "İmza Dilimi" teslimat 3, checkpoint C4/C5. Bu doküman `apps/mobile/lib/sync/**`
altındaki offline outbox mimarisini ve onu kanıtlayan uçak-modu turunu anlatır.

## 1. Amaç ve kapsam

Offline destek **yalnızca aktif antrenman oturumu** ekranını (`app/workout-session.tsx`)
kapsar: oturum başlatma, set girişi, oturum bitirme. Kapsanan senaryo "internetli başla,
ortada bağlantı kopar, devam et" — yani sporcu salonda antrenmana internetle başlıyor,
salonun bodrum katında sinyal kayboluyor, oturumu bitirene kadar set girmeye devam
edebiliyor. Kapsanmayan senaryo "hiç internetsiz plan çek" — periyodizasyon
(`app/periodization.tsx`) ve geçmiş ekranları çevrimdışı çalışmaz, `packages/api-client`
hook'ları üzerinden doğrudan online okur. Bu ayrım Fable'ın kapanış turu kararıdır: dar
bir offline yüzey, geniş bir yerel ayna değil.

## 2. Mimari — transactional outbox

SQLite burada `workout_sessions`/`workout_logs`'un yerel bir **kopyası (ayna-tablo)
değildir**; yalnızca "sunucuya gitmesi gereken mutasyonlar"ın FIFO bir günlüğüdür
(generic `sync_queue` tablosu, `apps/mobile/lib/sync/queue.ts`):

```sql
CREATE TABLE IF NOT EXISTS sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,                 -- 'create_session' | 'create_set' | 'complete_session'
  payload TEXT NOT NULL,            -- JSON.stringify edilmiş girdi objesi
  client_mutation_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
```

**Tek yazma yolu:** `workout-session.tsx` ekranı HER ZAMAN kuyruğa yazar — online olsa
bile iki ayrı kod yolu (online/offline dallanması) yoktur. `handleStartSession` →
`enqueue('create_session', ...)`, `logSet` → `enqueue('create_set', ...)`,
`handleCompleteSession` → `enqueue('complete_session', ...)`; her enqueue'dan sonra
`requestFlush()` çağrılır.

Katman sınırı AC-2.4'ü korur: `supabase.from`/`supabase.rpc` yalnız
`packages/api-client` içinde geçer. Sync engine (`engine.ts`) kendi Supabase erişimini
kurmaz — C1'in dışa açık saf fonksiyonlarını (`insertWorkoutSession`,
`insertWorkoutSetIdempotent`, `completeWorkoutSession`, bkz.
`packages/api-client/src/api/workout-session.ts`) `SyncEngine.tsx`'in enjekte ettiği
`op → handler` eşlemesiyle çağırır. `engine.ts` bu fonksiyonları yalnızca tip düzeyinde
bilir; runtime'da native/expo-sqlite yükü taşımadan Node'da (`engine.test.mts`) test
edilebilir olması bu ayrımın doğrudan sonucudur.

DB tutamacı platforma göre ikiye ayrılır (`db.ts` taban + `db.native.ts`): `expo-sqlite`
web derlemesinde bir `wa-sqlite.wasm` asset'ini eager import eder ve `expo export`'un web
hedefi (SSG) bu wasm'ı çözemeyip bundling'i kırar. Gerçek `openDatabaseSync` tutamacı bu
yüzden yalnız native'de (`db.native.ts`, Metro'nun `.native.ts` çözümlemesiyle) yüklenir;
web/SSG tabanı bellek-içi no-op bir shim sağlar (kuyruk web'de zaten anlamsızdır ama
import güvenlidir, prerender çökmez).

## 3. Idempotency

İki farklı teknik, iki farklı sebep (dosya başı yorumda C1'in kaydettiği ayrım):

- **`workout_sessions`:** `id` PRIMARY KEY (kısmi değil) olduğu için düz
  `.upsert(row, { onConflict: 'id', ignoreDuplicates: true })` çalışır — Postgres arbiter
  çıkarımı düz birincil anahtar indeksini sorunsuz eşler. Oturum id'si **istemcide**
  üretilir (`crypto.randomUUID()`, `handleStartSession`); böylece henüz sunucu onayı
  gelmeden set'ler bu id'yi referans alabilir.
- **`workout_logs`:** düz `insert` + 23505'i no-op sayma deseni.
  `workout_logs_client_mutation_uniq`, `(client_id, client_mutation_id) WHERE
client_mutation_id IS NOT NULL` kısmi bir indekstir; PostgREST'in `.upsert(...,
{onConflict})` seçeneği yalnızca kolon listesi üretir, bir `WHERE` yüklemi
  ekleyemediği için kısmi indeksle arbiter eşleşmez (42P10). Bunun yerine düz `insert`
  kullanılır; ikinci gönderim aynı `(client_id, client_mutation_id)` ile 23505
  (unique_violation) alır ve bu istemci tarafında sessiz no-op sayılır —
  `ignoreDuplicates: true` ile dışa dönük olarak aynı semantik.

**FIFO sıra FK'yi garanti eder:** `create_session` her zaman ilgili `create_set`'lerden
önce enqueue edilir (aynı ekran akışı: önce oturum başlar, sonra set girilir); kuyruk
`id ASC` (AUTOINCREMENT) sırayla işlendiği için flush motoru session→log FK sırasını
ayrıca yönetmek zorunda kalmaz. `flushQueue` **ilk hatada durur** (stop-on-failure): bir
öğe başarısız olursa ona bağlı sonraki öğeler (ör. henüz gitmemiş bir oturuma ait set'ler)
denenmeden bırakılır, sıra bozulmaz.

## 4. Online tespiti ve retry

NetInfo **yoktur** — bilinçli tercih. Flush stratejisi "dene → hata → backoff"tur, ağ
durumu ayrıca sorgulanmaz:

- Exponential backoff: 2s → 4s → 8s → … → 60s tavan (`BACKOFF_BASE_MS=2000`,
  `BACKOFF_MAX_MS=60000`, `SyncEngine.tsx`).
- `AppState` 'active' (foreground'a dönüş) → backoff sıfırlanır, hemen flush denenir
  (online olma ihtimalinin en yüksek olduğu an).
- Rozete dokunma / her enqueue sonrası `requestFlush()` → backoff sıfırlanır, hemen
  dene ("şimdi dene").
- **Crash recovery:** `SyncEngine` mount olduğunda `initQueue()` + ilk flush çalışır;
  önceki oturumdan (uygulama kapanmış/çökmüş olsa da) kalan pending öğeler bu ilk
  flush'ta drenajlanır.

## 5. Rozet

`usePendingSyncCount()` (`syncStore.ts`, `useSyncExternalStore` ile) her enqueue ve her
flush sonrasında tazelenen bekleyen-öğe sayısını yayınlar. `> 0` iken
`workout-session.tsx` "Senkron bekliyor (n) · şimdi dene" rozetini gösterir; rozete
dokunmak `requestFlush()` tetikler.

## 6. Bilinçli kapsam dışı (tasarlandı, uygulanmadı — olgunluk göstergesi)

- **LWW (last-write-wins) + `updated_at`:** çoklu-cihaz çakışma çözümü için. Migration
  (`20260821120000_bb_signature_slice.sql`) her iki tabloya da `updated_at` kolonunu ve
  `set_updated_at()` trigger'ını zaten koydu, ama mekanizmanın kendisi kapsam dışı —
  senaryo tek cihaz + append-only + silme yok olduğu için çakışma sınıfı zaten boş.
- **Silme senkronu:** aktif oturum akışında hiçbir istemci silme yapmıyor; kuyruk
  yalnız `create_*`/`complete_*` op'ları taşıyor.
- **Çoklu-cihaz merge:** tek cihaz varsayımı (bkz. yukarı) merge mantığını gereksiz
  kılıyor.
- **Medya senkronu:** aktif oturumda medya (fotoğraf/video) girişi yok; kapsam yalnız
  sayısal set verisi.
- **Ayna-tablolar:** kuyruk kasıtlı olarak bir mutasyon günlüğü, yerel okunabilir bir
  veri kopyası değil — geçmiş/periyodizasyon ekranları zaten online-only.

## 7. Bilinen sınır

Kuyruk yolu C1'in saf fonksiyonlarını doğrudan çağırdığı için TanStack Query
hook'larının (`useWorkoutSessions.ts`) `onSuccess` query-invalidation/toast mantığı
**tetiklenmez**. Aktif oturum ekranı bunu optimistic yerel state'le (`loggedSets`)
telafi eder — kullanıcı sunucu onayını beklemeden seti listede görür; geçmiş ekranları
ise kendi mount/refetch döngüsüyle tazelenir. Bu bilinçli bir takastır: iki yazma yolu
(kuyruk + hook mutation) tutmak yerine tek yazma yolu + ekrana özel yenileme stratejisi
tercih edildi.

## 8. Uçak-modu kanıtı

Android emülatöründe (Pixel_8 AVD, danışan hesabı `client2`, yerel Supabase) canlı
doğrulandı:

1. **Online set:** oturum online iken bir set girildi → anında flush oldu, rozet hiç
   görünmedi.
2. **Uçak modu ON:** emülatörde uçak modu açıldı, 2 set girildi (22 kg / 5 tekrar /
   RPE 9 ve 24 kg / 4 tekrar / RPE 10) → rozet "Senkron bekliyor (2)" gösterdi.
3. **Uçak modu OFF:** uçak modu kapatıldı → `AppState` foreground tetikleyicisiyle
   flush oldu → rozet söndü.
4. **DB doğrulaması:** `workout_sessions` tablosunda 1 satır, `workout_logs`
   tablosunda tam 3 satır (online girilen 20 kg / 6 tekrar / RPE 8 + offline girilen
   yukarıdaki iki set) — hepsi `session_id` ve `client_mutation_id` dolu. **Tam 3
   satır olması idempotency kanıtıdır:** backoff retry döngüsü boyunca aynı seti
   mükerrer yazmadı.
