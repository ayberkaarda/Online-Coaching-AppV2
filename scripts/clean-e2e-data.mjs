// E2E test artıklarını YEREL Supabase yığınından temizler.
//
// NEDEN VAR: E2E paketi tek bir veritabanına ve seed'deki iki sabit danışan
// hesabına karşı koşar. Testlerin ürettiği satırlar koşular arası BİRİKİR ve
// ekrandaki toplamları kaydırır. Ölçülen örnek (2026-08-17):
//
//   nutrition_logs: client 2222…2222, log_date 2026-08-17 -> 2 SATIR / 800 kcal
//     ('E2E Öğün 1809', 400) ve ('E2E Öğün 1929', 400)
//   Test "400 / hedef" bekliyordu, dashboard "800 / hedef" gösterdi.
//
// Bu script o birikimi temizler. Testlerin kendi iddialarını DELTA'ya çevirmesinin
// (bkz. tests/e2e/README.md "ekrandaki toplam/sayaç değerlerine MUTLAK iddia
// yazma") YERİNE geçmez, TAMAMLAYICISIDIR: delta iddiaları testi doğru yapar,
// bu script veritabanını küçük ve okunabilir tutar (form_checks satır başına bir
// imzalı URL üretiyor — birikim doğrudan sayfa yükleme süresine yazılıyor).
//
// Kullanım:
//   npm run db:clean-e2e                 # DENEME (dry-run) — hiçbir şey silinmez
//   npm run db:clean-e2e -- --yes        # GERÇEK silme
//   npm run db:clean-e2e -- --yes --skip-storage
//   node scripts/clean-e2e-data.mjs --help
//
// GÜVENLİK (bu bir TOPLU SİLME aracıdır — CLAUDE.md §6):
//   1. VARSAYILAN --dry-run. Bayraksız çalıştırma hiçbir şey silmez; yalnızca
//      ne silineceğini sayar ve listeler. Gerçek silme `--yes` (eş anlamlı:
//      `--confirm`) ister.
//   2. YALNIZCA YEREL. Hedef URL'in host'u 127.0.0.1 / localhost / ::1 değilse
//      script hiçbir istek atmadan, gürültülü biçimde çıkar. `.env.hosted.local`
//      ile yanlışlıkla çalıştırılsa bile barındırılan projeye DOKUNMAZ.
//   3. SEED SATIRLARINA DOKUNULMAZ. Ölçütler tablo tablo belirlenir (aşağıya
//      bakın) ve hiçbiri `supabase/seed.sql`'in yazdığı bir satırı seçmez.
//      Ölçüt belirlenemeyen tablolar KAPSAM DIŞIDIR (OUT_OF_SCOPE) — belirsizlikte
//      silinmez, yalnızca raporlanır.
//   4. KORUMA SAYAÇLARI. Silmeden ÖNCE ve SONRA `profiles`, `exercises`,
//      `food_database`, plan tabloları vb. sayılır; bir tanesi bile değişirse
//      script gürültü çıkarır ve hata koduyla biter. Sayılar KODA GÖMÜLMEZ —
//      aynı koşu içinde ölçülür, böylece katalog yeniden import edilse bile
//      doğrulama geçerli kalır.
//
// Ortam değişkenleri (import-catalog.mjs ile aynı sözleşme — hiçbir `.env`
// dosyası bu script tarafından OKUNMAZ, hedef açıkça verilir):
//   SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY
// `npm run db:clean-e2e` bunları `.env.local`'dan `dotenv-cli` ile geçirir;
// hedef yine de (2) numaralı korumadan geçmek zorundadır.
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// 0) Ölçüt yardımcıları
// ---------------------------------------------------------------------------

/**
 * E2E spec'lerinin ürettiği metinlerin ORTAK öneki. Tüm spec dosyalarında
 * tutarlıdır ve ASCII'dir (Türkçe İ/ı katlaması sorun çıkarmasın diye):
 *   "E2E Öğün …"        tests/e2e/nutrition.spec.ts
 *   "E2E Gym …"         tests/e2e/workout.spec.ts
 *   "E2E Antrenman …"   tests/e2e/plans.spec.ts
 *   "E2E Profil …"      tests/e2e/plans.spec.ts
 *   "E2E Beslenme …"    tests/e2e/plans.spec.ts
 *   "E2E Onay …"        tests/e2e/plans.spec.ts
 *   "E2E mesaj …"       tests/e2e/messaging.spec.ts
 *   "E2E yanit …"       tests/e2e/messaging.spec.ts
 *   "E2E geri bildirim" tests/e2e/form-check.spec.ts
 * `supabase/seed.sql`'in yazdığı HİÇBİR metin bu öneki (veya alt dizeyi) taşımaz.
 */
export const E2E_MARKER = 'E2E '

/** Metin `E2E ` ile BAŞLIYOR mu? (Kullanıcının doğrudan yazdığı alanlar için.) */
export function startsWithMarker(value) {
  return typeof value === 'string' && value.startsWith(E2E_MARKER)
}

/**
 * Metin `E2E ` alt dizesini İÇERİYOR mu?
 *
 * Bazı satırları uygulama TÜRETİR ve E2E metnini araya gömer — ör. form check
 * incelemesi sonrası üretilen sistem mesajı:
 *   `Koçunuz form check'inize geri bildirim yazdı: "E2E geri bildirim 567885892"`
 * Bu satırlar için "içerir" ölçütü zorunludur. Genişlemesi güvenlidir: seed'in
 * yazdığı metinler sabit ve sayılıdır, hiçbiri `E2E ` içermez.
 */
export function containsMarker(value) {
  return typeof value === 'string' && value.includes(E2E_MARKER)
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * UYGULAMANIN ürettiği poz fotoğrafı yolu: `poses/<client_uuid>-<rastgele_uuid>.<uzantı>`
 * (src/hooks/useFormChecks.ts -> uploadPose).
 *
 * `supabase/seed.sql` poz yollarını `poses/<client_uuid>-w<hafta>-front.jpg`
 * biçiminde yazar (ve o dosyalar storage'da BİLEREK yoktur). İki biçim asla
 * örtüşmez, bu yüzden bu regex "seed DEĞİL" demenin KESİN yoludur.
 */
export const APP_POSE_PATH_RE = new RegExp(`^poses/${UUID}-${UUID}\\.[a-z0-9]+$`, 'i')

// ---------------------------------------------------------------------------
// 1) YEREL HEDEF KORUMASI
// ---------------------------------------------------------------------------

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0'])

/**
 * Hedef URL yerel Supabase yığınını mı gösteriyor?
 *
 * Ayrıştırılamayan URL'ler de YEREL DEĞİL sayılır (fail-closed): şüphede olan
 * her hedef reddedilir. `hostname` kullanılır, `host` değil — port bilgisi
 * kararı etkilemez.
 */
export function isLocalTarget(url) {
  if (typeof url !== 'string' || url.trim() === '') return false
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  return LOCAL_HOSTS.has(parsed.hostname.toLowerCase())
}

// ---------------------------------------------------------------------------
// 2) TABLO ÖLÇÜTLERİ
//
// Her kuralda:
//   table      : public şemasındaki tablo
//   label      : Türkçe rapor başlığı
//   columns    : PostgREST select listesi (yalnızca ölçüt + rapor için gerekenler)
//   dependsOn  : bu tablonun FK ile bağlı olduğu EBEVEYN tablolar. Silme sırası
//                buradan TÜRETİLİR (bkz. orderTablesForDelete) — elle sıralanmaz.
//   reason     : ölçütün gerekçesi (rapora basılır)
//   match(row) : SAF yüklem. true -> satır E2E artığıdır.
//   describe   : dry-run listesinde satırı özetler
// ---------------------------------------------------------------------------

export const TABLE_RULES = [
  {
    table: 'workout_logs',
    label: 'Antrenman set logları',
    columns: 'id, client_id, exercise_name, weight_kg, reps, created_at',
    // workout_logs.plan_exercise_id -> workout_plan_exercises (ON DELETE SET NULL)
    dependsOn: ['workout_plan_exercises', 'profiles'],
    reason:
      '`exercise_name` `E2E ` ile başlıyor. Seed yalnızca gerçek katalog adları yazar ' +
      "('Bench Press', 'Squat', …); gym modu ise plan satırından okuduğu 'E2E Gym …' adını yazar.",
    match: (row) => startsWithMarker(row.exercise_name),
    describe: (row) => `${row.exercise_name} — ${row.weight_kg} kg x ${row.reps}`,
  },
  {
    table: 'nutrition_logs',
    label: 'Beslenme öğün logları',
    columns: 'id, client_id, log_date, description, kcal',
    dependsOn: ['profiles'],
    reason:
      '`description` `E2E ` ile başlıyor. Seed bu tabloya HİÇ satır yazmaz; ölçüt yine de ' +
      'işaretle daraltılır ki elle girilmiş geliştirme kayıtları silinmesin. ' +
      'BUGÜNKÜ KIRILMANIN KAYNAK TABLOSU.',
    match: (row) => startsWithMarker(row.description),
    describe: (row) => `${row.log_date} — ${row.description} (${row.kcal} kcal)`,
  },
  {
    table: 'progress_photos',
    label: 'İlerleme fotoğrafı kayıtları',
    columns: 'id, client_id, taken_on, angle, photo_path',
    dependsOn: ['profiles'],
    reason:
      'TABLO SEED-SİZ: `supabase/seed.sql` bu tabloya hiç satır yazmaz (20260817220000_' +
      'progress_tracking.sql ile geldi, seed güncellenmedi). Satırlar metin işareti TAŞIMAZ, ' +
      'bu yüzden tek ayırt edici gerçek budur -> tüm satırlar artıktır.',
    match: () => true,
    describe: (row) => `${row.taken_on} — ${row.angle} (${row.photo_path})`,
  },
  {
    table: 'progress_entries',
    label: 'İlerleme ölçümleri',
    columns: 'id, client_id, entry_date, weight_kg, notes',
    dependsOn: ['profiles'],
    reason:
      'TABLO SEED-SİZ: `supabase/seed.sql` bu tabloya hiç satır yazmaz. tests/e2e/progress.spec.ts ' +
      'yalnızca sayısal ölçü yazar (`notes` BOŞ kalır), yani metin işareti YOKTUR -> tüm satırlar artıktır.',
    match: () => true,
    describe: (row) => `${row.entry_date} — ${row.weight_kg} kg`,
  },
  {
    table: 'messages',
    label: 'Mesajlar (kullanıcı + sistem)',
    columns: 'id, client_id, kind, message, created_at',
    dependsOn: ['profiles'],
    reason:
      '`message` `E2E ` İÇERİYOR. "içerir" (önek değil) ölçütü ZORUNLU: form check incelemesi ' +
      'sonrası üretilen `kind = system` mesajı E2E geri bildirimini tırnak içinde ALINTILAR. ' +
      "Seed'in 8 mesajı sabit Türkçe cümlelerdir, hiçbiri `E2E ` içermez.",
    match: (row) => containsMarker(row.message),
    describe: (row) => `[${row.kind}] ${String(row.message).slice(0, 70)}`,
  },
  {
    table: 'notifications',
    label: 'Bildirimler',
    columns: 'id, client_id, title, message, created_at',
    dependsOn: ['profiles'],
    reason:
      '`title` veya `message` `E2E ` İÇERİYOR (form check incelemesi bildirimi geri bildirimi ' +
      'alıntılar). DİKKAT: program onayı akışının ürettiği "Koçun yeni antrenman programını ' +
      'onayladı." bildirimleri HİÇBİR işaret taşımaz ve seed metinlerine çok benzer — ' +
      'BİLEREK KAPSAM DIŞI bırakılır (rapor "eşleşmeyen" sütununda görünür).',
    match: (row) => containsMarker(row.message) || containsMarker(row.title),
    describe: (row) => `${row.title ?? '(başlıksız)'} — ${String(row.message).slice(0, 60)}`,
  },
  {
    table: 'form_checks',
    label: 'Form check kayıtları',
    columns:
      'id, client_id, current_weight, front_pose_path, back_pose_path, status, coach_feedback',
    dependsOn: ['profiles'],
    reason:
      'İKİ ölçüt (VEYA): (a) `coach_feedback` `E2E ` içerir — koç adımı tamamlanmış koşular; ' +
      '(b) `front_pose_path` UYGULAMANIN ürettiği `poses/<uuid>-<uuid>.<uzantı>` biçimindedir. ' +
      "(b) şart: yarım kalmış koşuların 'pending' kaydı hiçbir metin işareti taşımaz. " +
      'Seed poz yollarını `poses/<uuid>-w<hafta>-front.jpg` yazar; iki biçim ASLA örtüşmez.',
    match: (row) =>
      containsMarker(row.coach_feedback) || APP_POSE_PATH_RE.test(row.front_pose_path ?? ''),
    describe: (row) => `${row.current_weight} kg / ${row.status} — ${row.front_pose_path}`,
  },
  {
    table: 'program_approvals',
    label: 'Program onay talepleri',
    columns: 'id, client_id, status, workout_data, created_at',
    dependsOn: ['profiles'],
    reason:
      '`workout_data` JSON metni `E2E ` içeriyor (tests/e2e/plans.spec.ts "E2E Onay …" yazar). ' +
      "Seed'in iki onayı gerçek egzersiz adlarından oluşur.",
    match: (row) => containsMarker(JSON.stringify(row.workout_data ?? null)),
    describe: (row) => `${row.status} — ${JSON.stringify(row.workout_data).slice(0, 70)}`,
  },
]

/**
 * KAPSAM DIŞI tablolar ve gerekçeleri. Rapora aynen basılır — "sessizce
 * atlanmış" hiçbir tablo kalmasın diye burası boş bırakılmaz.
 */
export const OUT_OF_SCOPE = [
  {
    table: 'daily_logs',
    reason:
      'Ayırt edilemez. Kayıt (client_id, log_date) anahtarıyla UPSERT edilir; E2E seed satırının ' +
      'ÜZERİNE yazar, YENİ satır üretmez. Tüm kolonlar sayısaldır (su/sodyum/makro) — metin işareti ' +
      'yoktur. Silmek seed verisini yok eder, kazanç sıfırdır.',
  },
  {
    table: 'workout_plans + workout_plan_exercises',
    reason:
      '"Tümünü değiştir" semantiği: `save_workout_plan` planın YEDİ GÜNÜNÜ birden yeniden yazar, ' +
      'yani E2E metni seed içeriğinin YERİNE geçer — satır BİRİKMEZ. E2E satırlarını silmek o günü ' +
      'BOŞALTIR, seed içeriğini GERİ GETİRMEZ. (Onay akışı zamanla yeni `version` satırları ' +
      'biriktirir; aktif sürümü silmek danışanı plansız bırakacağı için bu da kapsam dışıdır.) ' +
      'Doğru araç: `npx supabase db reset`.',
  },
  {
    table: 'nutrition_plans + nutrition_plan_meals',
    reason:
      'Yukarıdakiyle aynı: `save_nutrition_plan` günün öğünlerini baştan yazar; ayrıca ' +
      'nutrition.spec yalnızca `target_*` KOLONLARINI günceller (satır eklemez).',
  },
  {
    table: 'notifications (işaretsiz onay bildirimleri)',
    reason:
      'Program onay akışının ürettiği bildirimler E2E metni içermez ve seed metinleriyle neredeyse ' +
      'birebir aynıdır. Belirsizlikte silinmez.',
  },
  {
    table: 'profiles / exercises / food_database',
    reason:
      'Seed + katalog. E2E bu tablolara satır EKLEMEZ. Yalnızca koruma sayacı olarak izlenir.',
  },
  {
    table: 'storage: avatars bucket',
    reason:
      'E2E avatar yüklemez; oradaki bir dosya geliştiricinin elle denemesidir ve silinmesi ' +
      '`profiles.avatar_path` kolonunu sarkıtır.',
  },
  {
    table: 'BİLİNEN SINIR — mutasyona uğramış seed satırlarının DURUMU',
    reason:
      'Bu script satır SAYILARINI korur, satır DURUMLARINI geri almaz. E2E akışları seed satırlarını ' +
      'yerinde değiştirir: program onayı `pending` -> `approved` olur, koç sohbeti okuyunca ' +
      '`messages.read_at` dolar, form check incelenince `status` `reviewed` olur. Script bunları ' +
      "BİLEREK geri sarmaz: (1) geri sarmak seed.sql'in beklenen durumunu koda gömmek demektir — " +
      'ikinci bir senkron noktası, seed değişince sessizce bayatlar (bkz. koruma sayaçlarının ' +
      'kodda SABİT tutulmama gerekçesi); (2) "E2E tüketti" ile "koç gerçekten onayladı" ayırt ' +
      'edilemez, `approved` bir satırı `pending`e çekmek GERÇEK bir denetim izini ' +
      '(reviewed_by/reviewed_at) yok ederdi — 20260817160000 §4 tam da bunu yasaklar. ' +
      'ETKİSİ: `npm run test:rls` bundan ETKİLENMEZ; RLS paketindeki her senaryo ihtiyaç duyduğu ' +
      'satırı kendi işleminde üretir (bkz. supabase/tests/rls.test.sql başlığı, "KENDİ KURULUMUNU ' +
      'YAPMA KURALI"). Gerçek bir seed taban çizgisi gerekiyorsa doğru araç `npx supabase db reset`tir.',
  },
]

/** Silme ÖNCESİ ve SONRASI sayılıp değişmediği doğrulanan tablolar. */
export const GUARD_TABLES = [
  'profiles',
  'exercises',
  'food_database',
  'daily_logs',
  'workout_plans',
  'workout_plan_exercises',
  'nutrition_plans',
  'nutrition_plan_meals',
]

/**
 * Storage temizliği: YETİM dosya süpürme.
 *
 * Seed hiçbir bucket'a dosya YÜKLEMEZ (form check poz yolları bilerek var
 * olmayan dosyaları gösterir — bkz. seed.sql §4). Yani buradaki her nesne
 * uygulama/E2E ürünüdür. Yine de KÖRLEMESİNE silinmez: DB temizliğinden SONRA
 * hayatta kalan satırların işaret ettiği yollar KORUNUR. Böylece "silinen satırın
 * dosyası gider, duran satırın dosyası kalır" garantisi ölçütten değil, veriden gelir.
 */
export const STORAGE_RULES = [
  {
    bucket: 'form-checks-media',
    label: 'Form check poz fotoğrafları',
    // Hayatta kalan satırların referansları: bu tablodan bu kolonlar.
    references: { table: 'form_checks', columns: ['front_pose_path', 'back_pose_path'] },
  },
  {
    bucket: 'progress-photos',
    label: 'İlerleme fotoğrafları',
    references: { table: 'progress_photos', columns: ['photo_path'] },
  },
  {
    bucket: 'message-attachments',
    label: 'Mesaj ekleri',
    references: { table: 'messages', columns: ['attachment_path'] },
  },
]

// ---------------------------------------------------------------------------
// 3) SAF ÇEKİRDEK — dosya sistemine/DB'ye dokunmayan, test edilebilir fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Bir kuralın ölçütünü satır listesine uygular.
 * @returns {{ matched: unknown[], skipped: unknown[] }}
 */
export function selectRows(rule, rows) {
  const matched = []
  const skipped = []
  for (const row of rows ?? []) {
    if (rule.match(row)) matched.push(row)
    else skipped.push(row)
  }
  return { matched, skipped }
}

/**
 * Kuralları FK'ye göre BAĞIMLIDAN BAĞIMSIZA sıralar (çocuk önce, ebeveyn sonra).
 *
 * Kural: R.dependsOn içinde P varsa, R'nin satırları P'nin satırlarından ÖNCE
 * silinmelidir. Algoritma her turda "kalanlardan hiçbirinin bağımlı OLMADIĞI"
 * ilk kuralı seçer; bu, bildirim sırasını koruyan deterministik bir topolojik
 * sıralamadır. `dependsOn` içindeki kapsam dışı tablolar (ör. `profiles`)
 * doğal olarak hiçbir kurala denk gelmez ve sıralamayı etkilemez.
 *
 * @throws {Error} FK grafiğinde döngü varsa.
 */
export function orderTablesForDelete(rules) {
  const remaining = [...rules]
  const ordered = []

  while (remaining.length > 0) {
    const index = remaining.findIndex(
      (candidate) =>
        !remaining.some(
          (other) => other !== candidate && (other.dependsOn ?? []).includes(candidate.table)
        )
    )
    if (index === -1) {
      throw new Error(`FK bağımlılık grafiğinde döngü: ${remaining.map((r) => r.table).join(', ')}`)
    }
    ordered.push(...remaining.splice(index, 1))
  }

  return ordered
}

/**
 * Hayatta kalan satırların işaret ETMEDİĞİ storage nesnelerini döndürür.
 * @param {string[]} objectPaths bucket içindeki tam yollar
 * @param {Iterable<string>} referencedPaths silme sonrası hâlâ referans verilen yollar
 */
export function findOrphanObjects(objectPaths, referencedPaths) {
  const keep = new Set(referencedPaths)
  return (objectPaths ?? []).filter((path) => !keep.has(path))
}

/**
 * Satırlardan yol referanslarını toplar; `excludeIds` içindekiler HAYATTA
 * KALMAYACAK sayılır ve referansları toplanmaz.
 *
 * `excludeIds` --dry-run için ZORUNLUDUR: orada satırlar hâlâ tabloda durur, ama
 * rapor "silseydik ne olurdu"yu göstermelidir. Gerçek koşuda satırlar zaten
 * gitmiştir ve dışlama etkisizdir — yani iki mod AYNI kodu kullanır, dry-run
 * ile gerçek koşu birbirinden SAPMAZ.
 *
 * @param {Array<Record<string, unknown>>} rows
 * @param {string[]} columns yol taşıyan kolonlar
 * @param {Iterable<unknown>} [excludeIds]
 */
export function collectReferencedPaths(rows, columns, excludeIds = []) {
  const excluded = new Set(excludeIds)
  const paths = new Set()
  for (const row of rows ?? []) {
    if (excluded.has(row.id)) continue
    for (const column of columns) {
      const value = row[column]
      if (typeof value === 'string' && value !== '') paths.add(value)
    }
  }
  return paths
}

/**
 * Koruma sayaçlarını karşılaştırır. Boş dizi -> her şey yerinde.
 * @returns {Array<{ table: string, before: number, after: number }>}
 */
export function diffGuardCounts(before, after) {
  const drifted = []
  for (const table of Object.keys(before ?? {})) {
    const b = before[table]
    const a = after?.[table]
    if (b !== a) drifted.push({ table, before: b, after: a })
  }
  return drifted
}

// ---------------------------------------------------------------------------
// 4) CLI argümanları
// ---------------------------------------------------------------------------

const USAGE = `
E2E test artığı temizleyici (YALNIZCA YEREL)

Kullanım:
  node scripts/clean-e2e-data.mjs [seçenekler]

Seçenekler:
  --yes, --confirm   GERÇEKTEN sil. Bu bayrak YOKSA hiçbir şey silinmez.
  --dry-run          Varsayılan davranışı açıkça belirtir (etkisi yoktur).
  --skip-storage     Storage (bucket) temizliğini atla; yalnızca tablolar.
  --quiet            Satır satır listeyi bastırma, yalnızca özet tablo.
  --help, -h         Bu yardımı gösterir

Ortam değişkenleri:
  SUPABASE_URL (veya NEXT_PUBLIC_SUPABASE_URL)   YEREL Supabase URL'i
  SUPABASE_SERVICE_ROLE_KEY                      Service-role anahtarı

Hedef 127.0.0.1 / localhost DEĞİLSE script hiçbir istek atmadan çıkar.
`.trim()

export function parseArgs(argv) {
  const opts = { apply: false, skipStorage: false, quiet: false, help: false }
  for (const arg of argv) {
    switch (arg) {
      case '--yes':
      case '--confirm':
        opts.apply = true
        break
      case '--dry-run':
        // Varsayılan zaten dry-run; bayrak yalnızca niyeti okunur kılar.
        break
      case '--skip-storage':
        opts.skipStorage = true
        break
      case '--quiet':
        opts.quiet = true
        break
      case '--help':
      case '-h':
        opts.help = true
        break
      default:
        return { error: `Bilinmeyen seçenek: ${arg}` }
    }
  }
  return { opts }
}

// ---------------------------------------------------------------------------
// 5) Veritabanı erişimi
// ---------------------------------------------------------------------------

const DELETE_BATCH = 100

async function countRows(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`${table}: sayılamadı — ${error.message}`)
  return count ?? 0
}

async function countGuardTables(client) {
  const counts = {}
  for (const table of GUARD_TABLES) counts[table] = await countRows(client, table)
  return counts
}

/** Bir kuralın tablosunu okur ve ölçütü uygular. */
async function inspectTable(client, rule) {
  const { data, error } = await client.from(rule.table).select(rule.columns)
  if (error) throw new Error(`${rule.table}: okunamadı — ${error.message}`)
  const { matched, skipped } = selectRows(rule, data ?? [])
  return { rule, total: (data ?? []).length, matched, skipped: skipped.length }
}

async function deleteMatched(client, rule, matched) {
  let deleted = 0
  for (let i = 0; i < matched.length; i += DELETE_BATCH) {
    const ids = matched.slice(i, i + DELETE_BATCH).map((row) => row.id)
    const { error } = await client.from(rule.table).delete().in('id', ids)
    if (error) throw new Error(`${rule.table}: silinemedi — ${error.message}`)
    deleted += ids.length
  }
  return deleted
}

// ---------------------------------------------------------------------------
// 6) Storage erişimi
// ---------------------------------------------------------------------------

const STORAGE_PAGE = 100
const STORAGE_MAX_DEPTH = 6

/**
 * Bir bucket'ı özyinelemeli listeler ve DOSYA yollarını döndürür.
 * Supabase Storage `list()` her seferinde tek bir seviye döner; klasörler
 * `id === null` ile işaretlidir.
 */
async function listBucketFiles(client, bucket, prefix = '', depth = 0) {
  if (depth > STORAGE_MAX_DEPTH) return []

  const paths = []
  for (let offset = 0; ; offset += STORAGE_PAGE) {
    const { data, error } = await client.storage
      .from(bucket)
      .list(prefix, { limit: STORAGE_PAGE, offset })
    if (error) throw new Error(`storage/${bucket}: listelenemedi — ${error.message}`)
    const entries = data ?? []
    for (const entry of entries) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id === null) {
        paths.push(...(await listBucketFiles(client, bucket, full, depth + 1)))
      } else {
        paths.push(full)
      }
    }
    if (entries.length < STORAGE_PAGE) break
  }
  return paths
}

/** Silme SONRASI hayatta kalan satırların işaret ettiği yollar. */
async function readReferencedPaths(client, { table, columns }, excludeIds) {
  const { data, error } = await client.from(table).select(['id', ...columns].join(', '))
  if (error) throw new Error(`${table}: referans yolları okunamadı — ${error.message}`)
  return collectReferencedPaths(data ?? [], columns, excludeIds)
}

async function removeObjects(client, bucket, paths) {
  let removed = 0
  for (let i = 0; i < paths.length; i += DELETE_BATCH) {
    const batch = paths.slice(i, i + DELETE_BATCH)
    // storage.objects üzerinde DOĞRUDAN DELETE `storage.protect_delete()`
    // trigger'ı ile 42501 verir; Storage API zorunludur.
    const { error } = await client.storage.from(bucket).remove(batch)
    if (error) throw new Error(`storage/${bucket}: silinemedi — ${error.message}`)
    removed += batch.length
  }
  return removed
}

// ---------------------------------------------------------------------------
// 7) Raporlama
// ---------------------------------------------------------------------------

function printTable(columns, rows) {
  if (rows.length === 0) return
  const widths = columns.map(([title, get]) =>
    Math.max(title.length, ...rows.map((r) => get(r).length))
  )
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ')
  console.log('')
  console.log(line(columns.map(([title]) => title)))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const row of rows) console.log(line(columns.map(([, get]) => get(row))))
}

function printCriteria(reports) {
  console.log('\nTablo ölçütleri (her satır BU koşuda uygulanan kuraldır):')
  for (const report of reports) {
    console.log(`\n   ${report.rule.table} — ${report.rule.label}`)
    console.log(`      ${report.rule.reason}`)
  }
}

function printOutOfScope() {
  console.log('\nKAPSAM DIŞI (bilerek dokunulmayan) tablolar:')
  for (const item of OUT_OF_SCOPE) {
    console.log(`\n   ${item.table}`)
    console.log(`      ${item.reason}`)
  }
}

// ---------------------------------------------------------------------------
// 8) Giriş noktası
// ---------------------------------------------------------------------------

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.error) {
    console.error(`Hata: ${parsed.error}\n`)
    console.error(USAGE)
    process.exitCode = 1
    return
  }

  const { opts } = parsed
  if (opts.help) {
    console.log(USAGE)
    return
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // --- KORUMA 2: YALNIZCA YEREL (hiçbir istek atılmadan ÖNCE) ---------------
  if (!isLocalTarget(url)) {
    console.error('')
    console.error('  ###################################################################')
    console.error('  ##  DURDURULDU: HEDEF YEREL DEĞİL                                ##')
    console.error('  ###################################################################')
    console.error('')
    console.error(`  Hedef       : ${url ?? '(tanımsız)'}`)
    console.error('  İzin verilen: 127.0.0.1, localhost, ::1')
    console.error('')
    console.error('  Bu script TOPLU SİLME yapar. Barındırılan/uzak bir projede')
    console.error('  çalıştırılması GERÇEK VERİ KAYBI demektir; bu yüzden hiçbir istek')
    console.error('  atılmadan çıkılıyor.')
    console.error('')
    console.error('  Yerel yığına yönlendirmek için:')
    console.error('    npm run db:clean-e2e            (.env.local üzerinden)')
    console.error('    $env:SUPABASE_URL="http://127.0.0.1:54321"; ...')
    console.error('')
    process.exitCode = 1
    return
  }

  if (!serviceKey) {
    console.error('Hata: SUPABASE_SERVICE_ROLE_KEY tanımlı değil.')
    console.error(
      'Service-role gerekli: RLS politikaları danışan verisinin toplu silinmesine izin vermez.'
    )
    console.error('Ayrıntı için: node scripts/clean-e2e-data.mjs --help')
    process.exitCode = 1
    return
  }

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(
    opts.apply
      ? 'E2E artık temizliği — GERÇEK SİLME (--yes)'
      : 'E2E artık temizliği — DENEME (dry-run)'
  )
  console.log(`   Hedef  : ${url}`)
  console.log(`   Storage: ${opts.skipStorage ? 'atlandı (--skip-storage)' : 'dahil'}`)

  // --- KORUMA 4: silme ÖNCESİ sayaçlar -------------------------------------
  const guardBefore = await countGuardTables(client)

  // --- Ölçütleri uygula (FK sırasına göre: bağımlıdan bağımsıza) -----------
  const ordered = orderTablesForDelete(TABLE_RULES)
  const reports = []
  for (const rule of ordered) reports.push(await inspectTable(client, rule))

  if (!opts.quiet) {
    for (const report of reports) {
      if (report.matched.length === 0) continue
      console.log(`\n   ${report.rule.table} — silinecek ${report.matched.length} satır:`)
      for (const row of report.matched) console.log(`      ${report.rule.describe(row)}`)
    }
  }

  // --- Sil (yalnızca --yes ile) --------------------------------------------
  for (const report of reports) {
    report.deleted =
      opts.apply && report.matched.length > 0
        ? await deleteMatched(client, report.rule, report.matched)
        : 0
  }

  printTable(
    [
      ['Tablo', (r) => r.rule.table],
      ['Açıklama', (r) => r.rule.label],
      ['Toplam', (r) => String(r.total)],
      ['Eşleşen', (r) => String(r.matched.length)],
      ['Eşleşmeyen', (r) => String(r.skipped)],
      ['Silinen', (r) => (opts.apply ? String(r.deleted) : '-')],
    ],
    reports
  )

  // --- Storage (DB temizliğinden SONRA: referans kümesi güncel olsun) ------
  // Hangi satırların GİTMİŞ sayılacağı: --dry-run'da satırlar hâlâ tablodadır,
  // bu yüzden referans kümesi hesaplanırken onları elle dışlıyoruz. Aksi hâlde
  // dry-run "0 yetim dosya" der, gerçek koşu ise dosyaları siler — iki mod
  // birbirinden sapardı.
  const deletedIdsByTable = new Map(
    reports.map((report) => [report.rule.table, report.matched.map((row) => row.id)])
  )

  const storageReports = []
  if (!opts.skipStorage) {
    for (const storageRule of STORAGE_RULES) {
      const objects = await listBucketFiles(client, storageRule.bucket)
      const referenced = await readReferencedPaths(
        client,
        storageRule.references,
        deletedIdsByTable.get(storageRule.references.table) ?? []
      )
      const orphans = findOrphanObjects(objects, referenced)
      const removed =
        opts.apply && orphans.length > 0
          ? await removeObjects(client, storageRule.bucket, orphans)
          : 0
      storageReports.push({ rule: storageRule, total: objects.length, orphans, removed })
    }

    if (!opts.quiet) {
      for (const report of storageReports) {
        if (report.orphans.length === 0) continue
        console.log(
          `\n   storage/${report.rule.bucket} — silinecek ${report.orphans.length} dosya:`
        )
        for (const path of report.orphans) console.log(`      ${path}`)
      }
    }

    printTable(
      [
        ['Bucket', (r) => r.rule.bucket],
        ['Açıklama', (r) => r.rule.label],
        ['Dosya', (r) => String(r.total)],
        ['Yetim', (r) => String(r.orphans.length)],
        ['Silinen', (r) => (opts.apply ? String(r.removed) : '-')],
      ],
      storageReports
    )
  }

  // --- KORUMA 4: silme SONRASI sayaçlar ------------------------------------
  const guardAfter = await countGuardTables(client)
  const drifted = diffGuardCounts(guardBefore, guardAfter)

  console.log('\nKoruma sayaçları (seed + katalog — DEĞİŞMEMELİ):')
  for (const table of GUARD_TABLES) {
    const mark = guardBefore[table] === guardAfter[table] ? 'OK' : 'DEĞİŞTİ'
    console.log(`   [${mark}] ${table}: ${guardBefore[table]} -> ${guardAfter[table]}`)
  }

  printCriteria(reports)
  printOutOfScope()

  const totalMatched = reports.reduce((sum, r) => sum + r.matched.length, 0)
  const totalOrphans = storageReports.reduce((sum, r) => sum + r.orphans.length, 0)

  if (drifted.length > 0) {
    console.error('\n  !!!  KORUNMASI GEREKEN TABLOLARIN SAYISI DEĞİŞTİ  !!!')
    for (const d of drifted) console.error(`   ${d.table}: ${d.before} -> ${d.after}`)
    console.error('  Bu bir HATADIR: script seed/katalog verisine dokunmuş olabilir.')
    console.error('  `npx supabase db reset` ile yerel veritabanını yeniden kurun.')
    process.exitCode = 1
    return
  }

  if (opts.apply) {
    console.log(`\nTemizlik tamamlandı: ${totalMatched} satır, ${totalOrphans} dosya silindi.`)
  } else {
    console.log(
      `\n--dry-run (varsayılan): HİÇBİR ŞEY SİLİNMEDİ. ` +
        `${totalMatched} satır ve ${totalOrphans} dosya silinmeye aday.`
    )
    console.log('Gerçekten silmek için: npm run db:clean-e2e -- --yes')
  }
}

// Yalnızca doğrudan `node scripts/clean-e2e-data.mjs` ile çalıştırıldığında
// CLI'ı tetikler; tests/unit/clean-e2e-data.test.ts saf fonksiyonları import
// ederken bu blok çalışmaz (bkz. import-catalog.mjs — aynı desen).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main()
  } catch (error) {
    console.error(`\nHata: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
