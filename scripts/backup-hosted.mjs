// Barındırılan (hosted) Supabase projesinin salt-okunur yedeğini alır.
//
// NEDEN VAR (B-030): tek yedek `C:\Users\Ayber\supabase-hosted-backup-20260817\`
// elle alınmıştı, tek kopya, sürüm kontrolünde değil, düzenli bir stratejinin
// parçası değildi (bkz. docs/archive/progress-hosted-senkron-ve-env.md, "Sıfırlama
// öncesi hosted yedeği kırılgan"). Faz 4.6'da KVKK hesap silme akışı (geri
// dönüşsüz `service_role` silme) yazılacak; o akış yazılmadan ÖNCE tekrarlanabilir,
// betiklenmiş bir yedekleme yordamı şart. Bu script SADECE yedek alır — geri
// yükleme yordamı için bkz. docs/ops/hosted-backup.md.
//
// NE YAPAR / NE YAPMAZ:
//   - Hosted veritabanına yalnızca `supabase db dump` (pg_dump/pg_dumpall
//     sarmalayıcısı) ile OKUMA amaçlı bağlanır. Hiçbir INSERT/UPDATE/DELETE,
//     migration (`db push`), `db reset` veya başka bir yazma komutu ÇALIŞTIRMAZ.
//   - Üç ayrı dosya üretir (bkz. §2 DUMP_TARGETS için gerekçe ve gerçek CLI
//     bayrakları — `supabase db dump --help` ile doğrulanmıştır, uydurma bayrak
//     YOKTUR):
//       schema.sql  ->  `supabase db dump`              (şema, --schema-only eşdeğeri; VARSAYILAN mod)
//       data.sql    ->  `supabase db dump --data-only`   (satır verisi; auth/storage DAHİL — internal
//                                                          şema hariç tutma listesinde YOKLAR)
//       roles.sql   ->  `supabase db dump --role-only`   (pg_dumpall --roles-only; CREATE ROLE/GRANT —
//                                                          bu, auth.users TABLOSU değil, Postgres
//                                                          CÜMLE rolleridir; auth.users satırları
//                                                          zaten data.sql İÇİNDEDİR)
//
// Kullanım (AYIRICISIZ — `pnpm run X -- --flag` npm gibi davranmaz, pnpm `--`'yi
// script'e OLDUĞU GİBİ iletir; bkz. docs/PROGRESS.md §4 "pnpm run X -- --flag
// tuzağı"; parseArgs yine de ham `--` gelirse sessizce yok sayar, aşağıya bakın):
//   pnpm run db:backup-hosted                 # DENEME (dry-run) — hiçbir komut ÇALIŞTIRILMAZ,
//                                              # yalnızca çalıştırılacak komutlar YAZDIRILIR
//   pnpm run db:backup-hosted --confirm       # GERÇEK yedek — hosted'a bağlanır, dosya yazar
//   node scripts/backup-hosted.mjs --help
//
// GÜVENLİK (CLAUDE.md §6 ruhuyla — bu bir "hosted'a bağlanan" araçtır):
//   1. VARSAYILAN --dry-run. Bayraksız çalıştırma HİÇBİR alt süreç başlatmaz;
//      yalnızca hangi `supabase db dump` komutlarının hangi sırayla ve hangi
//      hedef dosyalara çalıştırılacağını (sır DEĞERLERİ maskeli) yazdırır.
//      Gerçek yedek `--confirm` (eş anlamlı: `--yes`) ister.
//   2. SALT OKUNUR. `supabase db dump` bir pg_dump/pg_dumpall sarmalayıcısıdır;
//      hedef veritabanına hiçbir yazma göndermez. Script kendisi de başka hiçbir
//      Supabase CLI alt komutunu (push/reset/migration) ÇAĞIRMAZ.
//   3. SIR DEĞERLERİ LOG'A YAZILMAZ. `SUPABASE_DB_PASSWORD` ve
//      `SUPABASE_ACCESS_TOKEN` çalıştırılacak komutun yazdırılan halinde
//      `***` ile maskelenir; alt sürece yalnızca `env`/argv üzerinden geçer.
//   4. Ortam değişkeni yoksa SESSİZCE DEVAM ETMEZ — açık Türkçe hata ve exit 1.
//
// Ortam değişkenleri (repoda BAŞKA bir yerde henüz env-adı olarak kullanılmıyor;
// `SUPABASE_ACCESS_TOKEN` istisna — bu, Supabase CLI'ın KENDİ resmi env adıdır ve
// ADR-0020 uygulamasında zaten elle kullanılmıştı, bkz.
// docs/archive/progress-hosted-senkron-ve-env.md satır 26):
//   SUPABASE_ACCESS_TOKEN   Supabase CLI kimlik doğrulama token'ı (bkz. `supabase login --help`
//                           "Authenticate using an access token" — CLI bu değişkeni otomatik okur).
//   SUPABASE_PROJECT_REF    Hosted proje ref'i (`supabase db dump --project-ref`). Bilerek env'den
//                           okunur, script içine GÖMÜLMEZ — proje ref'i tek satırlık bir sabit olsa
//                           bile "hedef her zaman açıkça verilir" kuralı (bkz. import-catalog.mjs,
//                           clean-e2e-data.mjs) burada da uygulanır.
//   SUPABASE_DB_PASSWORD    Hosted Postgres veritabanı şifresi (`supabase db dump --password`).
//
// Not: `--project-ref` + `--password` yaklaşımı yerel `supabase link` durumuna
// (`.temp/`) bağımlı DEĞİLDİR — bu script'in tek başına, `supabase link`
// çalıştırılmamış bir makinede de çalışabilmesi bilinçli bir tasarım kararıdır.
// `SUPABASE_ACCESS_TOKEN` yine de dahil edilir çünkü CLI'ın `--project-ref` ile
// proje bağlantı bilgisini (bölge/pooler) çözümlerken Management API'ye ihtiyaç
// duyup duymadığı bu turda hosted'a hiçbir istek atılmadan doğrulanamadı (görev
// kısıtı: bu turda hosted'a okuma denemesi bile yapılmayacak) — token'ın
// gereksiz olduğu ortaya çıkarsa zararsızdır, gerekli olduğu ortaya çıkarsa
// script baştan çalışır. İlk gerçek koşuda (`--confirm`) bir kimlik doğrulama
// hatası alınırsa docs/ops/hosted-backup.md "Sorun giderme" bölümüne bakın.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 1) CLI argümanları
// ---------------------------------------------------------------------------

const USAGE = `
Hosted Supabase yedekleme (B-030, YALNIZCA OKUMA)

Kullanım:
  node scripts/backup-hosted.mjs [seçenekler]

Seçenekler:
  --confirm, --yes   GERÇEKTEN yedek al: hosted'a bağlanır, dosya yazar.
                      Bu bayrak YOKSA hiçbir alt süreç ÇALIŞTIRILMAZ.
  --dry-run          Varsayılan davranışı açıkça belirtir (etkisi yoktur).
  --out-dir <yol>    Çıktı kök dizini. Varsayılan: backups/hosted (repo köküne göre).
  --help, -h         Bu yardımı gösterir.

Ortam değişkenleri (üçü de ZORUNLU, --confirm ile):
  SUPABASE_ACCESS_TOKEN   Supabase CLI kimlik doğrulama token'ı
  SUPABASE_PROJECT_REF    Hosted proje ref'i
  SUPABASE_DB_PASSWORD    Hosted Postgres veritabanı şifresi

Çıktı: backups/hosted/<UTC-tarih-saat>/{schema.sql,data.sql,roles.sql}
(bu dizin .gitignore'a eklenmelidir — script'in kendisi .gitignore'a DOKUNMAZ,
bkz. docs/ops/hosted-backup.md "Yedekler asla commit'lenmez").
`.trim()

export function parseArgs(argv) {
  const opts = { apply: false, outDir: null, help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      // Ham `--` sessizce yok sayılır: `pnpm run X -- --flag` npm alışkanlığıyla
      // yazılırsa bile script çalışsın (pnpm `--`'yi OLDUĞU GİBİ iletir, ayırıcı
      // DEĞİLDİR — bkz. docs/PROGRESS.md §4). Doğru biçim ayırıcısız:
      // `pnpm run db:backup-hosted --confirm`.
      case '--':
        break
      case '--confirm':
      case '--yes':
        opts.apply = true
        break
      case '--dry-run':
        // Varsayılan zaten dry-run; bayrak yalnızca niyeti okunur kılar.
        break
      case '--out-dir': {
        const value = argv[i + 1]
        if (!value) return { error: '--out-dir bir yol bekliyor' }
        opts.outDir = value
        i += 1
        break
      }
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
// 2) Zaman damgası ve çıktı yolları
// ---------------------------------------------------------------------------

/** UTC zaman damgası, `YYYY-MM-DDTHH-mm-ssZ` biçiminde (görev sözleşmesi). */
export function utcStamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-')
}

/**
 * Bu turda `supabase db dump --help` ile DOĞRULANMIŞ gerçek bayraklar dışında
 * HİÇBİR bayrak uydurulmadı:
 *   schema -> bayraksız (VARSAYILAN mod = schema-only; CLI'ın kendi --dry-run
 *             çıktısı `pg_dump --schema-only ...` üretiyor, ayrı bir
 *             `--schema-only` bayrağı YOK)
 *   data   -> --data-only
 *   roles  -> --role-only (pg_dumpall --roles-only sarmalayıcısı)
 */
export const DUMP_TARGETS = [
  {
    file: 'schema.sql',
    flags: [],
    note: 'şema (varsayılan mod = --schema-only eşdeğeri; internal şemalar hariç, bkz. CLI çıktısı)',
  },
  {
    file: 'data.sql',
    flags: ['--data-only'],
    note: 'veri (auth/storage DAHİL tüm public+internal-olmayan şemalar; auth.users satırları burada)',
  },
  {
    file: 'roles.sql',
    flags: ['--role-only'],
    note: 'Postgres cluster rolleri (pg_dumpall --roles-only; auth.users TABLOSU değil, CREATE ROLE/GRANT)',
  },
]

// ---------------------------------------------------------------------------
// 3) Supabase CLI çağrısı
// ---------------------------------------------------------------------------

/** B-035: Supabase CLI global PATH'te yok — yerel `node_modules/.bin` ikilisi doğrudan çözülür. */
export function resolveSupabaseBin(repoRoot = REPO_ROOT) {
  const name = process.platform === 'win32' ? 'supabase.CMD' : 'supabase'
  return path.join(repoRoot, 'node_modules', '.bin', name)
}

/** Bir DUMP_TARGETS girdisi için tam argv listesini üretir (sır değerleri DAHİL). */
export function buildDumpArgs(target, { projectRef, dbPassword, outFile }) {
  return [
    'db',
    'dump',
    '--project-ref',
    projectRef,
    '--password',
    dbPassword,
    ...target.flags,
    '--file',
    outFile,
  ]
}

/** Yazdırma amaçlı: sır değerlerini `***` ile maskeler. */
export function maskArgs(args) {
  const masked = [...args]
  const secretFlags = new Set(['--password'])
  for (let i = 0; i < masked.length; i++) {
    if (secretFlags.has(masked[i]) && i + 1 < masked.length) masked[i + 1] = '***'
  }
  return masked
}

// ---------------------------------------------------------------------------
// 4) Giriş noktası
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

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  const projectRef = process.env.SUPABASE_PROJECT_REF
  const dbPassword = process.env.SUPABASE_DB_PASSWORD

  const missing = []
  if (!accessToken) missing.push('SUPABASE_ACCESS_TOKEN')
  if (!projectRef) missing.push('SUPABASE_PROJECT_REF')
  if (!dbPassword) missing.push('SUPABASE_DB_PASSWORD')

  if (missing.length > 0) {
    console.error('')
    console.error('  ###################################################################')
    console.error('  ##  DURDURULDU: EKSİK ORTAM DEĞİŞKENİ                            ##')
    console.error('  ###################################################################')
    console.error('')
    console.error(`  Eksik: ${missing.join(', ')}`)
    console.error('')
    console.error('  Bu script hosted Supabase projesine salt-okunur bağlanır ve bunun için')
    console.error('  üç ortam değişkeni ZORUNLUDUR. Ayrıntı: docs/ops/hosted-backup.md')
    console.error("    SUPABASE_ACCESS_TOKEN   Supabase CLI kimlik doğrulama token'ı")
    console.error("    SUPABASE_PROJECT_REF    Hosted proje ref'i")
    console.error('    SUPABASE_DB_PASSWORD    Hosted Postgres veritabanı şifresi')
    console.error('')
    process.exitCode = 1
    return
  }

  const outRoot = path.resolve(REPO_ROOT, opts.outDir ?? 'backups/hosted')
  const stamp = utcStamp()
  const outDir = path.join(outRoot, stamp)

  console.log(
    opts.apply
      ? 'Hosted yedekleme — GERÇEK ÇALIŞTIRMA (--confirm)'
      : 'Hosted yedekleme — DENEME (dry-run, hiçbir alt süreç çalıştırılmaz)'
  )
  console.log(`   Proje ref : ${projectRef}`)
  console.log(`   Çıktı dizini: ${path.relative(REPO_ROOT, outDir)}`)
  console.log('   Bu script SALT OKUNUR: hosted veritabanına hiçbir yazma göndermez.')
  console.log('')

  const supabaseBin = resolveSupabaseBin()
  const commands = DUMP_TARGETS.map((target) => {
    const outFile = path.join(outDir, target.file)
    const args = buildDumpArgs(target, { projectRef, dbPassword, outFile })
    return { target, outFile, args }
  })

  for (const { target, outFile, args } of commands) {
    const relFile = path.relative(REPO_ROOT, outFile)
    console.log(`   [${target.file}] ${target.note}`)
    console.log(`      ${supabaseBin} ${maskArgs(args).join(' ')}`)
    console.log(`      -> ${relFile}`)
  }

  if (!opts.apply) {
    console.log('')
    console.log('--dry-run (varsayılan): HİÇBİR KOMUT ÇALIŞTIRILMADI, hiçbir dosya yazılmadı.')
    console.log('Gerçekten yedek almak için: pnpm run db:backup-hosted --confirm')
    return
  }

  if (!fs.existsSync(supabaseBin)) {
    console.error(`\nHata: Supabase CLI bulunamadı: ${supabaseBin}`)
    console.error(
      '`pnpm install` çalıştırıldığından emin olun (bkz. B-035, docs/ops/hosted-backup.md).'
    )
    process.exitCode = 1
    return
  }

  fs.mkdirSync(outDir, { recursive: true })

  const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken }

  for (const { target, outFile, args } of commands) {
    console.log(`\n-> ${target.file} dökülüyor...`)
    const result = spawnSync(supabaseBin, args, {
      cwd: REPO_ROOT,
      env: childEnv,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    if (result.error) {
      console.error(`\nHata: ${target.file} dökülemedi — ${result.error.message}`)
      process.exitCode = 1
      return
    }
    if (result.status !== 0) {
      console.error(`\nHata: ${target.file} için supabase db dump exit ${result.status} döndü.`)
      process.exitCode = result.status ?? 1
      return
    }
    const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0
    console.log(`   OK — ${path.relative(REPO_ROOT, outFile)} (${size} bayt)`)
  }

  console.log(`\nYedek tamamlandı: ${path.relative(REPO_ROOT, outDir)}`)
  console.log('Geri yükleme/doğrulama yordamı için: docs/ops/hosted-backup.md')
}

// Yalnızca doğrudan `node scripts/backup-hosted.mjs` ile çalıştırıldığında CLI'ı
// tetikler; birim testleri saf fonksiyonları import ederken bu blok çalışmaz
// (bkz. scripts/clean-e2e-data.mjs — aynı desen).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main()
  } catch (error) {
    console.error(`\nHata: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
