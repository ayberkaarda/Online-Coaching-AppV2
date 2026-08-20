'use client'

// Etkinlik kaydı — OKUMA (Faz 4.8, §7c; dilim 3b iki görünümü kurdu, dilim 3c
// koç toplamasını SQL'e taşıdı).
//
// Şema + RLS + yazma yolu (`record_activity`) + rıza fonksiyonları dilim 1'de
// kuruldu (`supabase/migrations/20260820090000_activity_log.sql`) ve BU dosya
// tarafından DEĞİŞTİRİLMEZ. Rıza VERME/GERİ ÇEKME uçları ve heartbeat istemcisi
// dilim 2'nin işidir (`POST /api/activity`, `apps/web/src/lib/activity/**`);
// bu dosya yalnızca OKUR.
//
// ###########################################################################
// # İKİ GÖRÜNÜM, TEK VERİ KAYNAĞI — MAHREMİYET SINIRI KODDA NASIL DURUYOR    #
// ###########################################################################
//
// §7c iki farklı hassasiyet seviyesi istiyor:
//   * Danışan kendi kaydını TAM AYRINTIYLA görür (saat/dakika dahil) — KVKK
//     erişim hakkı, `useActivitySessions` / `useActivityEvents` bunun içindir.
//     BU YOL DEĞİŞMEDİ: kendi verisinde tam ayrıntı MEŞRUDUR.
//   * Koç GÜN hassasiyetinde bir özet görür — saat/dakika ne ARAYÜZE ÇIKAR ne
//     de koçun TARAYICISINA İNER.
//
// ###########################################################################
// # TOPLAMA SQL'DE — DİLİM 3c, DİLİM 3b'NİN KISITINI KAPATIR                 #
// ###########################################################################
//
// DİLİM 3b'DE NASILDI: koç yolu ham `activity_sessions` / `activity_events`
// satırlarını çekiyor, gün toplamını TARAYICIDA üretiyordu. Bu, §7c'nin
// kuralını yalnızca ARAYÜZ NEZAKETİ seviyesinde tutuyordu: ham
// `started_at`/`last_seen_at`/`occurred_at` zaten ağ üzerinden inmiş oluyordu,
// yani geliştirici konsolunu (ya da ağ sekmesini) açan koç danışanın TAM
// SAATLERİNİ görebiliyordu. Dilim 3b bunu kısıt olarak açıkça rapor etti
// (o turda `supabase/**` başka bir ajandaydı).
//
// BUGÜN: koç yolunun TEK veri kaynağı `public.coach_activity_summary(uuid,
// integer)` RPC'sidir (`supabase/migrations/20260820140000_coach_activity_
// summary.sql`). Fonksiyon `SECURITY INVOKER`dır — RLS ve `mfa_aal2_gate`
// kapısı koçun KENDİ kimliğiyle uygulanmaya devam eder — ve dönüş kümesi
// `(day date, total_seconds integer, event_counts jsonb)`tir: ham zaman
// damgası TAŞIMAZ. `date` tipinin taşıyabileceği bir saat YOKTUR.
//
// MAHREMİYET SINIRI ARTIK ÜÇ KATMANDA DURUYOR:
//   1) VERİ KATMANI (asıl sınır — bu dilimin kazancı): sorgu ham damga
//      DÖNDÜRMEZ; koçun tarayıcısına saat/dakika HİÇ İNMEZ.
//   2) TİP SEVİYESİ: `CoachActivityDaySummary`nin tek zaman alanı
//      `date: string` (`YYYY-MM-DD`). Tüketici bileşen saat okuMAK istese bile
//      alan YOKTUR — derleme zamanında imkânsız.
//   3) RENDER: `apps/web/tests/unit/activity-views.test.tsx` hem koç yolunun
//      ALDIĞI VERİDE saat/dakika taşıyan alan olmadığını hem de render edilen
//      metinde `\d{1,2}:\d{2}` deseni bulunmadığını kilitler.
//
// NOT — RLS DEĞİŞMEDİ: `activity_*_select` politikaları koçun ham satır
// okumasına hâlâ izin verir (dilim 1 KARAR 3; salt-eklemeli repo kuralı gereği
// o migration'a dokunulmadı). Değişen şey UYGULAMANIN OKUMA YOLUDUR — ve bu
// modülde koç yolundan ham tabloya giden HİÇBİR sorgu KALMADI.

import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useSupabaseClient } from '../context'
import { wrapSupabaseError } from '../query/supabase-error'
import type { Database, Tables } from '@repo/types'

// ---------------------------------------------------------------------------
// Sözlükler — kapalı liste TEK YERDE (migration §2 ile BİREBİR aynı liste).
// ---------------------------------------------------------------------------

/** `activity_events_event_chk`'in istemci karşılığı — migration §2 ile BİREBİR aynı sıra/değerler. */
export const ACTIVITY_EVENT_TYPES = [
  'tab_view',
  'daily_log_submitted',
  'form_check_uploaded',
  'message_sent',
  'ai_generated',
  'login',
  'logout',
] as const satisfies readonly string[]

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number]

export const ACTIVITY_EVENT_LABELS: Record<ActivityEventType, string> = {
  tab_view: 'Sekme görüntüleme',
  daily_log_submitted: 'Günlük veri girişi',
  form_check_uploaded: 'Form check yüklemesi',
  message_sent: 'Mesaj gönderimi',
  ai_generated: 'AI üretimi',
  login: 'Giriş',
  logout: 'Çıkış',
}

/** Runtime daraltma — DB'deki gerçek garanti CHECK kısıtıdır, bu yalnızca TS'e bildirir. */
export function isKnownActivityEventType(value: string): value is ActivityEventType {
  return (ACTIVITY_EVENT_TYPES as readonly string[]).includes(value)
}

/** Bilinmeyen (şema ileride genişlerse) bir tür gelirse ham metni geri döner — sessizce yutulmaz. */
export function activityEventLabel(value: string): string {
  return isKnownActivityEventType(value) ? ACTIVITY_EVENT_LABELS[value] : value
}

export const ACTIVITY_PLATFORM_LABELS: Record<'web' | 'mobile', string> = {
  web: 'Web',
  mobile: 'Mobil',
}

export function activityPlatformLabel(value: string): string {
  return value === 'web' || value === 'mobile' ? ACTIVITY_PLATFORM_LABELS[value] : value
}

// ---------------------------------------------------------------------------
// RIZA DURUMU — `public.activity_consent_state(uuid)` TEK kaynağının aynası.
// ---------------------------------------------------------------------------

/**
 * ÜÇ DURUM — migration §1a ile BİREBİR: `undecided | granted | revoked`.
 *
 * Türetme mantığı BURADA TEKRAR YAZILMAZ: bu hook yalnızca DB fonksiyonunu
 * çağırır (`activity_consent_state(uuid)`, SECURITY INVOKER) ve sonucu tipe
 * daraltır. "Sessizce onaylı sayma" (fail-open) riski aynı gerekçeyle DB
 * tarafında zaten reddedilmişti (migration §1a yorumu); istemci tarafında
 * ikinci bir kopya yazmak o riski BURADA yeniden açardı.
 */
export type ActivityConsentState = 'undecided' | 'granted' | 'revoked'

function isActivityConsentState(value: string): value is ActivityConsentState {
  return value === 'undecided' || value === 'granted' || value === 'revoked'
}

/**
 * Bir kullanıcının etkinlik rıza durumu. Danışan yalnızca KENDİ id'siyle,
 * koç herhangi bir danışanın id'siyle çağırır — ikisi de RLS altında
 * (`profiles` select politikası) DOĞRU cevabı alır; başkasının verisi
 * görünmüyorsa fonksiyon `null` döner ve bu hook bunu HATA sayar (fail-loud —
 * sessizce 'undecided' gibi göstermek yanlış bilgi üretirdi).
 */
export function useActivityConsentState(userId?: string): UseQueryResult<ActivityConsentState> {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: activityQueryKeys.consentState(userId),
    enabled: Boolean(userId),
    // Rıza durumu az sıklıkla değişir ama dilim 2'nin grant/revoke akışı
    // hemen ardından bu ekranı görmek isteyebilir — kısa bir staleTime.
    staleTime: 30_000,
    queryFn: async (): Promise<ActivityConsentState> => {
      const { data, error } = await supabase.rpc('activity_consent_state', {
        p_user_id: userId ?? '',
      })
      if (error) throw wrapSupabaseError(error, { table: 'activity_consent_state', op: 'rpc' })
      if (data === null || data === undefined || !isActivityConsentState(data)) {
        throw new Error(
          'activity_consent_state: profil görünmüyor veya beklenmeyen bir durum döndü.'
        )
      }
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// HAM OKUMA — YALNIZCA DANIŞANIN KENDİ TAM AYRINTILI KAYDI İÇİN.
//
// Dilim 3c'den itibaren bu iki hook'un TEK tüketicisi `ClientActivityLog`tur:
// koç özeti artık ham satır ÇEKMEZ (bkz. dosya başı). Koç bileşeninden bunlara
// yapılacak bir çağrı, kapatılan sızıntıyı geri açar.
// ---------------------------------------------------------------------------

export type ActivitySession = Tables<'activity_sessions'>
export type ActivityEvent = Tables<'activity_events'>

// Savunmacı üst sınırlar: `record_activity()` yorumuna göre normal hacim bunun
// ÇOK altında kalır (180 günlük saklama + günde birkaç düzine olay). Sınırsız
// bir sorgu, saklama garantisi bir gün bozulursa (ör. purge durursa) tek bir
// istekte binlerce satırı tarayıcıya döker; bu tavan onu SINIRLAR.
const ACTIVITY_SESSIONS_LIMIT = 500
const ACTIVITY_EVENTS_LIMIT = 3000

export interface ActivityQueryOptions {
  /** `false` verilirse sorgu hiç ÇALIŞMAZ (ör. rıza `granted` değilken gereksiz ağ isteğini önlemek için). */
  enabled?: boolean
}

/**
 * Bir kullanıcının OTURUM geçmişi, en yeniden eskiye. `started_at`/`last_seen_at`
 * TAM zaman damgasıyla döner — bu hook KOÇ TARAFINDAN ÇAĞRILMAZ (koç yolu
 * yalnızca `useCoachActivitySummary` -> `coach_activity_summary` RPC'sidir).
 */
export function useActivitySessions(
  userId?: string,
  options?: ActivityQueryOptions
): UseQueryResult<ActivitySession[]> {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: activityQueryKeys.sessions(userId),
    enabled: Boolean(userId) && (options?.enabled ?? true),
    queryFn: async (): Promise<ActivitySession[]> => {
      const { data, error } = await supabase
        .from('activity_sessions')
        .select('*')
        .eq('user_id', userId ?? '')
        .order('started_at', { ascending: false })
        .limit(ACTIVITY_SESSIONS_LIMIT)
      if (error) throw wrapSupabaseError(error, { table: 'activity_sessions', op: 'select' })
      return data
    },
  })
}

/**
 * Bir kullanıcının OLAY geçmişi, en yeniden eskiye. `occurred_at` TAM zaman
 * damgasıyla döner — bkz. yukarıdaki uyarı (yalnızca danışanın KENDİ görünümü
 * bunu çağırır ve render eder).
 */
export function useActivityEvents(
  userId?: string,
  options?: ActivityQueryOptions
): UseQueryResult<ActivityEvent[]> {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: activityQueryKeys.events(userId),
    enabled: Boolean(userId) && (options?.enabled ?? true),
    queryFn: async (): Promise<ActivityEvent[]> => {
      const { data, error } = await supabase
        .from('activity_events')
        .select('*')
        .eq('user_id', userId ?? '')
        .order('occurred_at', { ascending: false })
        .limit(ACTIVITY_EVENTS_LIMIT)
      if (error) throw wrapSupabaseError(error, { table: 'activity_events', op: 'select' })
      return data
    },
  })
}

// ---------------------------------------------------------------------------
// SÜRE — oturum uzunluğu.
//
// `sessionDurationSec` artık YALNIZCA danışan görünümünündür: koç toplamı aynı
// hesabı SQL'de yapar (`last_seen_at - started_at`, saniyeye yuvarlanmış —
// migration'daki `extract(epoch ...)` ifadesi bu fonksiyonun BİREBİR
// karşılığıdır). `formatDurationLabel` ise İKİ görünümde de kullanılır: o bir
// SÜRE etiketi üretir ("47 dk"), zaman DAMGASI değil.
// ---------------------------------------------------------------------------

/** Bir oturumun süresi (saniye). Bozuk/negatif aralık (savunmacı) `0` döner. */
export function sessionDurationSec(
  session: Pick<ActivitySession, 'started_at' | 'last_seen_at'>
): number {
  const start = new Date(session.started_at).getTime()
  const end = new Date(session.last_seen_at).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  return Math.round((end - start) / 1000)
}

/** "1 sa 12 dk" / "8 dk" / "45 sn" — insan-okunur süre etiketi (saat/dakika METNİ, DAMGA değil). */
export function formatDurationLabel(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours} sa ${minutes} dk`
  if (minutes > 0) return `${minutes} dk`
  return `${seconds} sn`
}

// ---------------------------------------------------------------------------
// KOÇ GÖRÜNÜMÜ — GÜN hassasiyetinde özet (§7c'nin mahremiyet sınırı).
//
// Toplama SQL'DEDİR (`coach_activity_summary`); bu bölümde kalan tek iş,
// RPC'nin döndürdüğü gün satırlarını arayüzün beklediği biçime ÇEVİRMEKTİR.
// Gün yuvarlaması SUNUCUDA `Europe/Istanbul` ile yapılır (migration KARAR 3);
// bu yüzden burada artık YEREL TARİH HESABI YOKTUR — dilim 3b'nin `localDateOf`
// yardımcısı SİLİNDİ. İki ayrı gün tanımı (biri tarayıcının saat diliminde,
// biri sunucununkinde) yaşasaydı, aynı etkinlik iki katmanda FARKLI güne
// düşebilirdi.
// ---------------------------------------------------------------------------

/**
 * Koç özetinin varsayılan penceresi (gün). SQL tarafındaki `p_days`
 * varsayılanıyla (30) BİREBİR aynıdır ve yine de AÇIKÇA gönderilir: sorgu
 * anahtarı pencereyi taşımak zorundadır (aksi hâlde 30 ve 90 günlük iki istek
 * aynı önbellek girdisini paylaşırdı).
 */
export const COACH_ACTIVITY_SUMMARY_DAYS = 30

/**
 * RPC'nin döndürdüğü HAM SATIR — üretilen veritabanı tipinden TÜRETİLİR, elle
 * yazılmaz. Şema bir gün ham bir zaman damgası döndürmeye başlarsa (ki
 * migration'ın doğrulama bloğu ve `rls.test.sql` senaryo 144 bunu engeller),
 * bu tip DE değişir ve aşağıdaki çevirici derlenmez.
 */
export type CoachActivitySummaryRow =
  Database['public']['Functions']['coach_activity_summary']['Returns'][number]

/**
 * Koçun gördüğü TEK gün satırı. SAAT/DAKİKA BİLEREK BU TİPTE YOKTUR — §7c'nin
 * mahremiyet sınırı burada YAPISAL olarak kurulur (bkz. dosya başı notu).
 */
export interface CoachActivityDaySummary {
  /** Gün, YEREL takvim günü (`YYYY-MM-DD`). */
  date: string
  /** O günün TÜM oturumlarının toplam süresi (saniye). */
  totalDurationSec: number
  /** Tür kırılımıyla olay sayıları (yalnızca o gün en az bir kez görülen türler anahtar olarak bulunur). */
  eventCounts: Partial<Record<ActivityEventType, number>>
  /** Kapalı listedeki hiçbir türe uymayan olay sayısı — DB CHECK'i bunu bugün engelliyor, alan SAVUNMACI. */
  unknownEventCount: number
}

export interface CoachActivitySummary {
  /** Yeniden eskiye sıralı günler — YALNIZCA en az bir olay/oturum içeren günler (BOŞ gün YOK; §6'daki "gap serisi" sözleşmesi burada GEÇERLİ DEĞİL, sürekli bir eksen gerekmiyor). */
  days: CoachActivityDaySummary[]
  /** Özetteki EN YENİ gün — "son aktif: 17 Ağustos" etiketinin kaynağı. Hiç veri yoksa `null`. */
  lastActiveDate: string | null
}

/**
 * `event_counts` jsonb'sini tipli sayaçlara çevirir.
 *
 * `jsonb` BİLEREK açık uçludur (migration KARAR 2: yeni bir olay türü
 * fonksiyon imzasını değiştirmesin diye). Açık uçluluğun bedeli burada
 * ödenir: bilinmeyen anahtar SESSİZCE YUTULMAZ, `unknownEventCount`a düşer —
 * yani "şema genişledi, arayüz görmedi" durumu görünür kalır.
 */
function readEventCounts(value: CoachActivitySummaryRow['event_counts']): {
  eventCounts: Partial<Record<ActivityEventType, number>>
  unknownEventCount: number
} {
  const eventCounts: Partial<Record<ActivityEventType, number>> = {}
  let unknownEventCount = 0

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { eventCounts, unknownEventCount }
  }

  for (const [key, raw] of Object.entries(value)) {
    const count = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(count) || count <= 0) continue
    if (isKnownActivityEventType(key)) {
      eventCounts[key] = (eventCounts[key] ?? 0) + count
    } else {
      unknownEventCount += count
    }
  }

  return { eventCounts, unknownEventCount }
}

/**
 * SAF fonksiyon — RPC satırlarını arayüzün gün özetine çevirir. GİRDİSİNDE DE
 * ÇIKTISINDA DA ham zaman damgası YOKTUR (girdi zaten `day: string`); bu
 * dosyada saat/dakika gören TEK yol danışanın kendi görünümüdür.
 * `apps/web/tests/unit/activity-views.test.tsx` bunu doğrudan test eder.
 */
export function mapCoachActivitySummary(
  rows: readonly CoachActivitySummaryRow[]
): CoachActivitySummary {
  const days: CoachActivityDaySummary[] = rows.map((row) => {
    const { eventCounts, unknownEventCount } = readEventCounts(row.event_counts)
    return {
      date: row.day,
      totalDurationSec: Math.max(0, Math.round(row.total_seconds ?? 0)),
      eventCounts,
      unknownEventCount,
    }
  })

  // SQL zaten `order by ... desc` veriyor; sıralama burada YİNE DE savunmacı
  // olarak uygulanır (bir gün sıralama kaldırılırsa arayüz sessizce karışmasın).
  days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return { days, lastActiveDate: days[0]?.date ?? null }
}

export interface CoachActivitySummaryOptions extends ActivityQueryOptions {
  /** Kaç YEREL günlük pencere sorgulansın (varsayılan 30). SQL tarafı `p_days < 1`i 22023 ile reddeder. */
  days?: number
}

/**
 * KOÇUN TEK ENDPOINT'İ — gün hassasiyetinde özet, TEK RPC çağrısı.
 *
 * `clientId` seçili danışanın id'sidir. Koç aal1'deyse (`mfa_aal2_gate`) RPC
 * HATA VERMEZ, sessizce 0 satır döner (fonksiyon `SECURITY INVOKER`dır;
 * `activity_consent_state()` de aal1'de NULL döndüğü için kapı iki kez
 * kapanır) — bu yüzden bileşen tarafı `useMfaStatus()`i AYRICA kontrol edip
 * aal1 durumunu "veri yok" ile KARIŞTIRMAMALIDIR (bkz. `CoachActivitySummary.tsx`).
 * Rıza `granted` değilken de sonuç boş kümedir; bu bir HATA DEĞİLDİR (migration
 * KARAR 4) ve bileşen o durumu rıza rozetinden ayrıca gösterir.
 */
export function useCoachActivitySummary(
  clientId?: string,
  options?: CoachActivitySummaryOptions
): UseQueryResult<CoachActivitySummary> {
  const supabase = useSupabaseClient()
  const days = options?.days ?? COACH_ACTIVITY_SUMMARY_DAYS
  return useQuery({
    queryKey: activityQueryKeys.coachSummary(clientId, days),
    enabled: Boolean(clientId) && (options?.enabled ?? true),
    queryFn: async (): Promise<CoachActivitySummaryRow[]> => {
      const { data, error } = await supabase.rpc('coach_activity_summary', {
        p_client_id: clientId ?? '',
        p_days: days,
      })
      if (error) throw wrapSupabaseError(error, { table: 'coach_activity_summary', op: 'rpc' })
      return data ?? []
    },
    select: mapCoachActivitySummary,
  })
}

// ---------------------------------------------------------------------------
// Query key'leri — BİLEREK `../query/keys.ts` İÇİNDE DEĞİL.
//
// `useMfa.ts`teki AYNI gerekçe: bu dilim `packages/api-client/src/query/keys.ts`
// dosyasının sahibi değil (dilim 2 paralel olarak aynı dosyaya dokunuyor
// olabilir). Anahtarlar yine TEK yerde tanımlanır, adresi farklıdır.
// ---------------------------------------------------------------------------
export const activityQueryKeys = {
  consentState: (userId?: string) => ['activity', 'consent-state', userId ?? null] as const,
  sessions: (userId?: string) => ['activity', 'sessions', userId ?? null] as const,
  events: (userId?: string) => ['activity', 'events', userId ?? null] as const,
  coachSummary: (clientId?: string, days: number = COACH_ACTIVITY_SUMMARY_DAYS) =>
    ['activity', 'coach-summary', clientId ?? null, days] as const,
} as const
