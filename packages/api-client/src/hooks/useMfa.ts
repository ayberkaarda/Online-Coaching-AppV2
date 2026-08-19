'use client'

// TOTP çok faktörlü kimlik doğrulama (MFA) — Faz 4.7 dilim 1.
//
// Karar kaydı: `docs/adr/0026-totp-mfa-ve-aal2-kapisi.md`
// Veritabanı  : `supabase/migrations/20260819120000_mfa_aal2_gate.sql`
//
// ─────────────────────────────────────────────────────────────────────────────
// BU HOOK BİR GÜVENLİK SINIRI DEĞİLDİR
// ─────────────────────────────────────────────────────────────────────────────
// Buradaki hiçbir dal ("koç mu?", "doğrulanmış faktörü var mı?", "yönlendir")
// yetkilendirme YAPMAZ. ADR-0022'nin sabit kısıtı gereği tarayıcı Supabase'e
// DOĞRUDAN gidiyor; istemcideki her kapı `fetch` ile atlatılabilir. Gerçek sınır
// veritabanındaki RESTRICTIVE RLS politikasıdır (`mfa_aal2_gate`, 14 tablo):
//
//   not is_coach() or (select auth.jwt() ->> 'aal') = 'aal2'
//
// Bu dosyanın işi yalnızca KULLANICIYI DOĞRU EKRANA GÖTÜRMEKTİR: aksi hâlde koç,
// nedenini anlamadığı "0 satır / permission denied" ekranlarıyla karşılaşırdı.
//
// ─────────────────────────────────────────────────────────────────────────────
// KURTARMA KODU / HTTP UCU YOK — BİLİNÇLİ
// ─────────────────────────────────────────────────────────────────────────────
// Bu paket MFA'yı sıfırlayan bir sunucu ucu SUNMAZ. Böyle bir uç, koç hesabı ele
// geçirildiğinde tüm danışanların ikinci faktörünü tek hamlede yok eden bir
// devralma yüzeyi olurdu (ADR-0026 §Reddedilen alternatifler C). Kurtarma yolu,
// kayıt ekranının TOTP secret'ını QR'ın yanında DÜZ METİN olarak da göstermesidir:
// koç onu parola kasasına yazar ve ikinci bir cihaza da tanımlayabilir.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query'
import type { Factor } from '@supabase/supabase-js'

import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'

/**
 * MFA query anahtarları.
 *
 * BİLEREK `../query/keys` İÇİNDE DEĞİL: bu dilim `packages/api-client/src/query/keys.ts`
 * dosyasının sahibi değil (paralel bir tur aynı dosyaya dokunuyor olabilir). Anahtarlar
 * yine de TEK yerde tanımlanır ve elle dizi yazılmaz — sözleşme aynı, adresi farklı.
 * `query/keys.ts` bu turdan sonra serbest kalırsa buradan oraya taşınabilir.
 */
export const mfaQueryKeys = {
  /** Faktör listesi + AAL durumu (tek sorgu, tek önbellek girdisi). */
  status: () => ['mfa', 'status'] as const,
  /** `public.is_coach()` RPC'sinin sonucu. */
  isCoach: () => ['mfa', 'is-coach'] as const,
} as const

/** Kayıt ekranında kimlik doğrulayıcı uygulamada görünecek hesap etiketi. */
export const MFA_TOTP_ISSUER = 'Coaching Hub'

/** Kimlik doğrulayıcı uygulamaların ürettiği kodun uzunluğu (RFC 6238 varsayılanı). */
export const MFA_TOTP_CODE_LENGTH = 6

/** Yapıştırılan koddaki boşluk/tire/görünmez karakterleri atar; rakam dışını eler. */
export function normalizeTotpCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MFA_TOTP_CODE_LENGTH)
}

/**
 * TOTP kodu için tek doğrulama kuralı: TAM 6 rakam.
 *
 * Boşluk/tire ile yapıştırılan kodlar (`123 456`) çağırmadan önce
 * `normalizeTotpCode` ile temizlenir.
 */
export function isValidTotpCode(code: string): boolean {
  return code.length === MFA_TOTP_CODE_LENGTH && /^\d+$/.test(code)
}

/**
 * `enroll()` dönüşündeki `totp.qr_code`u `<img src=...>` içine konabilecek bir adrese çevirir.
 *
 * GoTrue sürümleri arasında BU ALAN İKİ FARKLI BİÇİMDE geliyor: kimi sürüm hazır bir
 * `data:image/svg+xml;utf-8,...` adresi, kimi sürüm ham `<svg ...>` metni döndürüyor
 * (auth-js tipi bunu "You can convert it to a URL by prepending `data:image/svg+xml;utf-8,`"
 * notuyla açıkça söylüyor). Ham metni doğrudan `src`e vermek KIRIK GÖRSEL üretir; hazır
 * adrese ikinci kez ön ek eklemek de öyle. Bu yüzden biçim burada TESPİT edilir.
 *
 * `encodeURIComponent` ZORUNLU: ham SVG `#` karakteri içerebilir (renk kodları) ve
 * kodlanmadan verilirse tarayıcı oradan sonrasını fragment sayıp görseli boş render eder.
 * CSP tarafı hazırdır — `img-src` zaten `data:` içeriyor
 * (bkz. `apps/web/src/lib/security/csp.ts`).
 */
export function toQrDataUrl(qrCode: string): string {
  const trimmed = qrCode.trim()
  if (trimmed.startsWith('data:')) return trimmed
  return `data:image/svg+xml;utf-8,${encodeURIComponent(trimmed)}`
}

/** `enroll()` sonrası kullanıcıya gösterilen, doğrulanmayı bekleyen kayıt. */
export interface TotpEnrollment {
  /** Faktör kimliği — doğrulama (`useVerifyTotp`) bunu ister. */
  factorId: string
  /** `<img src=...>` için hazırlanmış QR adresi. */
  qrDataUrl: string
  /**
   * TOTP secret'ı, DÜZ METİN. Kurtarma yolunun tamamı budur (ADR-0026 §Karar 4):
   * koç bunu parola kasasına yazar, ikinci cihazı da bununla tanımlar.
   */
  secret: string
  /** `otpauth://` adresi — QR'ın kodladığı değerin ta kendisi. */
  uri: string
}

/** Faktör listesi + oturumun güvence seviyesi, tek sorguda. */
export interface MfaStatus {
  /** Hesaba tanımlı TÜM faktörler (doğrulanmış + doğrulanmamış). */
  factors: Factor[]
  /** Doğrulanmış ilk TOTP faktörü; yoksa `null`. */
  verifiedTotpFactor: Factor | null
  /** Doğrulanmış en az bir faktör var mı? */
  hasVerifiedFactor: boolean
  /** Oturumun ŞU ANKİ güvence seviyesi (`aal1` = yalnızca parola). */
  currentLevel: string | null
  /** Oturumun ULAŞABİLECEĞİ en yüksek seviye. */
  nextLevel: string | null
  /** Oturum aal2'de mi? RLS kapısının açık olduğu tek hâl. */
  isAal2: boolean
  /**
   * Faktör var ama oturum hâlâ aal1 — kullanıcı kod girip SEVİYE YÜKSELTMELİ.
   *
   * BU DAL UNUTULURSA KAYIT OLMUŞ KOÇ BİR DAHA İÇERİ GİREMEZ: parolayla giriş her
   * seferinde aal1 verir, aal2 yalnızca `challenge()+verify()` ile kazanılır.
   */
  needsStepUp: boolean
}

const EMPTY_MFA_STATUS: MfaStatus = {
  factors: [],
  verifiedTotpFactor: null,
  hasVerifiedFactor: false,
  currentLevel: null,
  nextLevel: null,
  isAal2: false,
  needsStepUp: false,
}

/**
 * Sorgu henüz yüklenmemiş/hata vermişken tüketicinin düşeceği nötr durum.
 *
 * MODÜL SEVİYESİNDE TEK bir sabittir (aynı gerekçe `notify.tsx`'teki `NOOP_NOTIFIER`):
 * her çağrıda yeni nesne dönseydi, durumu bağımlılık dizisinde taşıyan `useEffect`'ler
 * (yönlendirme kapısı) her render'da yeniden çalışırdı.
 */
export function emptyMfaStatus(): MfaStatus {
  return EMPTY_MFA_STATUS
}

/**
 * Faktörler + AAL. `staleTime: 0` BİLİNÇLİ — `verify()` sonrası seviye değişir ve
 * bayat bir "aal1" cevabı kullanıcıyı sonsuz doğrulama döngüsünde bırakırdı.
 */
export function useMfaStatus(): UseQueryResult<MfaStatus, Error> {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: mfaQueryKeys.status(),
    staleTime: 0,
    retry: false,
    queryFn: async (): Promise<MfaStatus> => {
      const { data: factorData, error: factorError } = await supabase.auth.mfa.listFactors()
      if (factorError) throw new Error(factorError.message)

      const { data: aalData, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aalError) throw new Error(aalError.message)

      const factors = factorData?.all ?? []
      const verifiedTotpFactor =
        factors.find((factor) => factor.factor_type === 'totp' && factor.status === 'verified') ??
        null

      const currentLevel = aalData?.currentLevel ?? null
      const nextLevel = aalData?.nextLevel ?? null

      return {
        factors,
        verifiedTotpFactor,
        hasVerifiedFactor: factors.some((factor) => factor.status === 'verified'),
        currentLevel,
        nextLevel,
        isAal2: currentLevel === 'aal2',
        // GoTrue'nun resmi sinyali: `nextLevel` `currentLevel`den yüksekse kullanıcı
        // MFA'dan geçmelidir. Seviye adlarını elle karşılaştırmak yerine bu sözleşme
        // kullanılır (auth-js `getAuthenticatorAssuranceLevel` doc-comment'i).
        needsStepUp: Boolean(currentLevel && nextLevel && currentLevel !== nextLevel),
      }
    },
  })
}

/**
 * "Bu oturumun sahibi koç mu?" — `profiles` TABLOSUNA BAKMADAN.
 *
 * ###########################################################################
 * # NEDEN `profiles` OKUNMUYOR — BU SATIRI SİLMEDEN ÖNCE OKU                #
 * #                                                                         #
 * # `mfa_aal2_gate` politikası `profiles`i DE kapsıyor. Yani aal1'deki bir  #
 * # koç KENDİ profil satırını bile OKUYAMAZ. `useProfile()` ile rol         #
 * # sorulsaydı cevap "0 satır" olurdu ve uygulama koçu DANIŞAN sanardı —    #
 * # zorunlu yönlendirme hiç tetiklenmez, koç sonsuza kadar boş ekranda      #
 * # kalırdı.                                                                #
 * #                                                                         #
 * # `public.is_coach()` `SECURITY DEFINER` ve sahibi `postgres` (bkz.       #
 * # 20260817090000_rename_roles.sql). `postgres` `rolbypassrls = t`         #
 * # olduğundan fonksiyon RLS'e HİÇ TABİ DEĞİLDİR ve aal1'de de doğru cevap  #
 * # verir. Yetki yüzeyi genişlemez: fonksiyon zaten `authenticated`a açıktı #
 * # ve parametresiz çağrıldığında YALNIZCA çağıranın kendi rolünü döndürür  #
 * # (varsayılan argüman `auth.uid()`).                                      #
 * ###########################################################################
 */
export function useIsCoach(): UseQueryResult<boolean, Error> {
  const supabase = useSupabaseClient()

  return useQuery({
    queryKey: mfaQueryKeys.isCoach(),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('is_coach', {})
      if (error) throw new Error(error.message)
      return data === true
    },
  })
}

/**
 * Yeni bir TOTP faktörü kaydeder (henüz DOĞRULANMAMIŞ hâlde).
 *
 * Kayıt tek başına HİÇBİR ŞEY AÇMAZ: faktör `unverified` durumdadır, oturum aal1'de
 * kalır ve RLS kapısı kapalıdır. Kapıyı açan `useVerifyTotp`tir.
 *
 * YARIM KAYIT TEMİZLİĞİ: kullanıcı kodu girmeden vazgeçerse geride `unverified` bir
 * faktör kalır ve GoTrue'nun faktör sayısı sınırlıdır (yerel yapılandırmada 10). Bu
 * yüzden kayıt, VARSA önceki doğrulanmamış TOTP faktörlerini önce siler. Temizlik
 * başarısız olursa akış DURMAZ — bu bir kolaylıktır, güvenlik sınırı değil.
 */
export function useEnrollTotp(): UseMutationResult<TotpEnrollment, Error, void> {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<TotpEnrollment> => {
      const { data: existing, error: listError } = await supabase.auth.mfa.listFactors()
      if (listError) throw new Error(listError.message)

      const stale = (existing?.all ?? []).filter(
        (factor) => factor.factor_type === 'totp' && factor.status !== 'verified'
      )
      for (const factor of stale) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        issuer: MFA_TOTP_ISSUER,
        // Aynı hesaba ikinci bir faktör eklenirse GoTrue benzersiz bir ad ister;
        // saniye çözünürlüklü zaman damgası çakışmayı pratikte imkânsız kılar.
        friendlyName: `TOTP ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      })
      if (error) throw new Error(error.message)

      return {
        factorId: data.id,
        qrDataUrl: toQrDataUrl(data.totp.qr_code),
        secret: data.totp.secret,
        uri: data.totp.uri,
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mfaQueryKeys.status() })
    },
    onError: (error: Error) => {
      notify.error(`İki adımlı doğrulama kaydı başlatılamadı: ${error.message}`)
    },
  })
}

export interface VerifyTotpInput {
  factorId: string
  /** Kullanıcının kimlik doğrulayıcı uygulamadan okuduğu 6 haneli kod. */
  code: string
}

/**
 * `challenge()` + `verify()` — hem KAYIT ONAYI hem SONRAKİ GİRİŞLERDE SEVİYE YÜKSELTME.
 *
 * İki akış tek mutasyondur çünkü GoTrue tarafında aynı iki çağrıdır; ayrı hook'lar
 * yazmak, biri güncellenip diğeri unutulduğunda sessizce ayrışan iki kopya üretirdi.
 *
 * BAŞARIDAN SONRA OTURUM YENİDİR: `verify()` aal2 taşıyan yeni bir access token
 * döndürür ve istemci onu kendi deposuna (web'de cookie) yazıp `onAuthStateChange`
 * tetikler. Koçun aal1'de REDDEDİLMİŞ tüm sorguları o ana kadar önbellekte "boş/hatalı"
 * duruyordu — bu yüzden `invalidateQueries()` TÜM önbelleği tazeler, yalnızca MFA
 * anahtarlarını değil. Bu yapılmazsa koç doğrulamadan sonra da boş bir panel görür.
 */
export function useVerifyTotp(): UseMutationResult<void, Error, VerifyTotpInput> {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ factorId, code }: VerifyTotpInput): Promise<void> => {
      const normalized = normalizeTotpCode(code)
      if (!isValidTotpCode(normalized)) {
        throw new Error(`Doğrulama kodu ${MFA_TOTP_CODE_LENGTH} haneli olmalı.`)
      }

      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId,
      })
      if (challengeError) throw new Error(challengeError.message)

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: normalized,
      })
      if (verifyError) throw new Error(verifyError.message)
    },
    onSuccess: async () => {
      // Sıra önemli: önce MFA durumu (yönlendirme kararını o veriyor), sonra geri kalan her şey.
      await queryClient.invalidateQueries({ queryKey: mfaQueryKeys.status() })
      await queryClient.invalidateQueries()
      notify.success('İki adımlı doğrulama tamamlandı.')
    },
    onError: (error: Error) => {
      notify.error(`Kod doğrulanamadı: ${error.message}`)
    },
  })
}

export interface UnenrollFactorInput {
  factorId: string
}

/**
 * Bir faktörü kaldırır.
 *
 * ARAYÜZ, KOÇUN SON FAKTÖRÜNÜ KALDIRMASINI ENGELLEMEZ VE ENGELLEMEMELİDİR: engelleseydi
 * bu bir güvenlik kazancı değil, yalnızca istemci tarafında bir "hayır" olurdu (`fetch`
 * ile atlanır). Gerçek sonuç RLS'ten gelir — faktörünü kaldıran koç bir sonraki
 * oturumunda aal2'ye çıkamaz ve 14 tablonun hiçbirini göremez; çıkış yolu yeniden kayıt
 * olmaktır. Arayüz bunu SÖYLER, yasaklamaz (ADR-0026 §Kalan risk).
 */
export function useUnenrollFactor(): UseMutationResult<void, Error, UnenrollFactorInput> {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ factorId }: UnenrollFactorInput): Promise<void> => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId })
      if (error) throw new Error(error.message)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mfaQueryKeys.status() })
      notify.success('İki adımlı doğrulama kaldırıldı.')
    },
    onError: (error: Error) => {
      notify.error(`Kaldırılamadı: ${error.message}`)
    },
  })
}
