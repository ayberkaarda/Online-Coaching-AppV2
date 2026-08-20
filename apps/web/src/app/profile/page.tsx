'use client'

// Profil sayfası: avatar yükleme, şifre değiştirme, beslenme/antrenman programı görüntüleme.

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Dumbbell, IdCard, Salad, ShieldAlert, Trash2, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ChangeEvent, JSX } from 'react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  DELETE_ACCOUNT_CONFIRMATION,
  useDeleteAccount,
  useNutritionPlan,
  useProfile,
  useSession,
  useUpdateBodyMetrics,
  useUpdatePassword,
  useUploadAvatar,
  useWorkoutPlan,
} from '@repo/api-client'
import type { ProfileWithAvatar } from '@repo/api-client'
import {
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  bodyMetricsSchema,
  calculateAge,
  type BodyMetricsInput,
} from '@/lib/body-metrics'
import { QueryState, SkeletonCard, SkeletonText } from '@/components/ui'
import { SecuritySection } from '@/components/security/SecuritySection'
import { ActivityConsent } from '@/components/activity/ActivityConsent'
import { ALLOWED_IMAGE_MIME, validateImageFile } from '@repo/api-client/upload-validation'
import { passwordChangeSchema, type PasswordChangeInput } from '@repo/types/schemas'
import {
  DAY_NAMES,
  EMPTY_NUTRITION_PLAN,
  EMPTY_WORKOUT_PLAN,
  type NutritionPlan,
  type WorkoutPlan,
} from '@repo/types'

/**
 * Antrenman planı görünümü.
 *
 * Faz 1b Adım 2 sonrası kaynak `workout_plans` + `workout_plan_exercises`
 * tablolarıdır; `useWorkoutPlan()` gün->metin sözlüğü döndürür. DEPRECATED
 * `profiles.workout_plan` kolonu artık OKUNMAZ (bayat veri gösteriyordu).
 */
function WorkoutPlanView({ plan }: { plan: WorkoutPlan }): JSX.Element {
  const hasContent = DAY_NAMES.some((day) => plan[day].trim().length > 0)

  if (!hasContent) {
    return (
      <p className="text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        Koçunuz henüz bir antrenman programı atamadı.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {DAY_NAMES.map((day) => (
        <li key={day} className="text-sm">
          <span className="font-bold text-gray-800 dark:text-zinc-200">{day}: </span>
          {/* Bir günün metni birden çok hareket satırı içerebilir ('\n' ile birleşik). */}
          <span className="whitespace-pre-line font-medium text-gray-700 dark:text-gray-300">
            {plan[day].trim() ? plan[day] : '—'}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Beslenme planı görünümü.
 *
 * Faz 1b Adım 3b sonrası kaynak `nutrition_plans` + `nutrition_plan_meals`
 * tablolarıdır; `useNutritionPlan()` gün->{items,total} sözlüğü döndürür.
 * DEPRECATED `profiles.nutrition_plan` kolonu artık OKUNMAZ (bayat veri
 * gösteriyordu). Kolon JSON string olduğu için burada bir "ayrıştırılamayan ham
 * metin" hâli vardı; tablolar yapılandırılmış veri döndürdüğü için o dal düştü.
 */
function NutritionPlanView({ plan }: { plan: NutritionPlan }): JSX.Element {
  const hasContent = DAY_NAMES.some((day) => plan[day].items.trim().length > 0)

  if (!hasContent) {
    return (
      <p className="text-sm font-medium leading-relaxed text-gray-700 dark:text-gray-300">
        Koçunuz henüz bir beslenme programı atamadı.
      </p>
    )
  }

  return (
    <ul className="space-y-3">
      {DAY_NAMES.map((day) => {
        const entry = plan[day]
        return (
          <li key={day} className="text-sm">
            <span className="font-bold text-gray-800 dark:text-zinc-200">{day}: </span>
            <span className="whitespace-pre-line font-medium text-gray-700 dark:text-gray-300">
              {entry.items.trim() ? `${entry.items} (${entry.total} kcal)` : '—'}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * KÜNYE — doğum tarihi + boy (`profiles.birth_date` / `profiles.height_cm`).
 *
 * ###########################################################################
 * # BU FORMU HERKES KENDİ PROFİLİNDE GÖRÜR — KOÇ DAHİL                      #
 * ###########################################################################
 * Bölüm rol'e göre gizlenmez: koç da kendi verisinin sahibidir ve kendi
 * künyesini doldurabilir. Ayrım "danışan mı koç mu" değil, "kendi satırın mı"
 * ayrımıdır ve VERİTABANINDA yaşar: `profiles_guard_body_metrics`
 * tetikleyicisi son kullanıcı yazmalarında `auth.uid()`i satır kimliğiyle
 * karşılaştırır. Koç, `profiles_update_coach` ile başkasının satırında UPDATE
 * yetkisine sahip olmasına RAĞMEN bu iki kolonu BAŞKASI için yazamaz (42501).
 *
 * NEDEN "koç dolduramaz": bunlar danışanın KENDİ beyanıdır. Koç doldurursa
 * "danışanın beyanı" ile "koçun tahmini" veritabanında ayırt edilemez hâle
 * gelir ve `profiles` üzerinde denetim izi olmadığı için B-010'un sorusu
 * ("bu satırı kim yazdı?") yanıtsız kalır.
 *
 * ###########################################################################
 * # NEDEN "YAŞ" DEĞİL "DOĞUM TARİHİ" SORULUYOR, VE KİLO NEDEN BURADA YOK    #
 * ###########################################################################
 * Yaş her yıl bayatlayan türetilmiş veridir; kaydedilen şey doğum tarihidir ve
 * yaş yanında ANLIK olarak hesaplanıp gösterilir (`calculateAge`). Kilo ise bu
 * formda BİLEREK yoktur: tek doğruluk kaynağı `progress_entries` zaman
 * serisidir (B-036 dersi — iki kilo kaynağı kaçınılmaz olarak ayrışır).
 *
 * İki alan da OPSİYONELDİR: boş bırakılabilir ve sonradan temizlenebilir.
 * Uygulamanın hiçbir akışı doldurulmuş olmalarını şart koşmaz; tek etkileri
 * otomatik program/beslenme üreticilerinin formunu ÖN DOLDURMAKTIR.
 */
function BodyMetricsSection({ profile }: { profile: ProfileWithAvatar }): JSX.Element {
  const updateBodyMetrics = useUpdateBodyMetrics()

  // `defaultValues` HTML alanlarının konuştuğu dili kullanır (boş alan = `''`),
  // zod ÇIKTISI ise `null`'dur — dönüşümü `bodyMetricsSchema` içindeki
  // `emptyToNull` ön-işlemcisi yapar. Tip iddiası bu KASITLI giriş/çıkış
  // uyuşmazlığını tek satırda işaretler (RHF form değerleri = şema çıktısı).
  const defaultValues = {
    birth_date: profile.birth_date ?? '',
    height_cm: profile.height_cm ?? '',
  } as unknown as BodyMetricsInput

  const {
    register: registerMetric,
    handleSubmit: handleSubmitMetrics,
    reset: resetMetrics,
    formState: { errors: metricErrors },
  } = useForm<BodyMetricsInput>({
    resolver: zodResolver(bodyMetricsSchema),
    defaultValues,
  })

  const age = calculateAge(profile.birth_date)

  const onSubmit = handleSubmitMetrics((values) => {
    updateBodyMetrics.mutate(
      {
        userId: profile.id,
        birth_date: values.birth_date,
        height_cm: values.height_cm,
      },
      {
        // Kaydedilen değerler yeni "temiz" hâl olur; aksi hâlde form kirli
        // kalır ve kullanıcı kaydettiğinden emin olamaz.
        onSuccess: () => resetMetrics(values),
      }
    )
  })

  return (
    <section
      aria-labelledby="body-metrics-heading"
      className="mt-8 rounded-panel border border-border bg-surface-raised p-6"
    >
      <h2
        id="body-metrics-heading"
        className="mb-2 flex items-center gap-2 text-lg font-bold text-fg"
      >
        <IdCard aria-hidden="true" className="h-5 w-5 shrink-0" />
        Künye
      </h2>

      <p className="mb-5 text-sm font-medium leading-relaxed text-fg-muted">
        Doğum tarihiniz ve boyunuz, otomatik antrenman ve beslenme programı üreticilerinin girdisi
        olarak kullanılır (kalori ihtiyacı hesabı boy ve yaşa dayanır). İkisi de zorunlu değildir;
        boş bırakabilir veya sonradan temizleyebilirsiniz. Bu alanları yalnızca siz
        doldurabilirsiniz — koçunuz sizin adınıza dolduramaz. Kilonuz burada tutulmaz, ilerleme
        kayıtlarınızdan okunur.
      </p>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="birth-date" className="mb-1 block text-sm font-bold text-fg">
              Doğum tarihi
            </label>
            <input
              id="birth-date"
              type="date"
              autoComplete="bday"
              aria-invalid={metricErrors.birth_date ? 'true' : 'false'}
              aria-describedby={
                metricErrors.birth_date
                  ? 'birth-date-error'
                  : age !== null
                    ? 'birth-date-age'
                    : undefined
              }
              className="w-full rounded-control border border-border bg-canvas p-3 text-sm font-medium text-fg outline-none focus:border-accent"
              {...registerMetric('birth_date')}
            />
            {metricErrors.birth_date ? (
              <p id="birth-date-error" role="alert" className="mt-1 text-xs font-bold text-danger">
                {metricErrors.birth_date.message}
              </p>
            ) : age !== null ? (
              // Yaş SAKLANMAZ, gösterilir: kaydedilmiş doğum tarihinden anlık
              // hesaplanır, dolayısıyla hiçbir zaman bayatlamaz.
              <p id="birth-date-age" className="mt-1 text-xs font-medium text-fg-muted">
                Kayıtlı doğum tarihinize göre yaşınız: {age}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="height-cm" className="mb-1 block text-sm font-bold text-fg">
              Boy (cm)
            </label>
            <input
              id="height-cm"
              type="number"
              inputMode="decimal"
              step="0.1"
              min={HEIGHT_CM_MIN}
              max={HEIGHT_CM_MAX}
              placeholder="Örn. 178.5"
              autoComplete="off"
              aria-invalid={metricErrors.height_cm ? 'true' : 'false'}
              aria-describedby={metricErrors.height_cm ? 'height-cm-error' : undefined}
              className="w-full rounded-control border border-border bg-canvas p-3 text-sm font-medium text-fg outline-none focus:border-accent"
              {...registerMetric('height_cm')}
            />
            {metricErrors.height_cm ? (
              <p id="height-cm-error" role="alert" className="mt-1 text-xs font-bold text-danger">
                {metricErrors.height_cm.message}
              </p>
            ) : null}
          </div>
        </div>

        {/* Sunucu hatası TOAST'a ek olarak SAYFADA da gösterilir: toast kaybolur,
            kullanıcı formu terk etmeden neyin yanlış gittiğini görebilmelidir. */}
        {updateBodyMetrics.isError && updateBodyMetrics.error ? (
          <p role="alert" className="text-xs font-bold text-danger">
            Künye kaydedilemedi: {updateBodyMetrics.error.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={updateBodyMetrics.isPending}
          aria-busy={updateBodyMetrics.isPending}
          className="rounded-control bg-accent px-6 py-3 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {updateBodyMetrics.isPending ? 'Kaydediliyor...' : 'Künyeyi Kaydet'}
        </button>
      </form>
    </section>
  )
}

/**
 * KVKK / GDPR "unutulma hakkı" — hesap silme bölümü (AC-4.6.1).
 *
 * ###########################################################################
 * # ÇİFT ONAY, VE İKİSİ DE GERÇEK BİR ENGEL                                 #
 * #                                                                         #
 * # 1. ADIM — NİYET: "Hesabımı Sil" düğmesi hiçbir şey silmez, yalnızca     #
 * #    uyarı panelini açar. Yanlış tıklamanın bedeli sıfırdır.              #
 * # 2. ADIM — YAZARAK DOĞRULAMA: kullanıcı `HESABIMI SİL` cümlesini BİREBİR #
 * #    yazmadan son düğme etkinleşmez. Bu, "onaylıyor musunuz? [Evet]" tipi #
 * #    bir diyalogdan bilerek daha zordur: geri dönüşü OLMAYAN bir işlemde  #
 * #    kas hafızasıyla tıklanabilen bir onay, onay değildir.                #
 * #                                                                         #
 * # ARAYÜZ DOĞRULAMASI BİR GÜVENLİK SINIRI DEĞİLDİR: cümle sunucuda da      #
 * # (`api/account/deletion-core.ts`) doğrulanır. Buradaki kontrol yalnızca  #
 * # KAZAYI önler, kötü niyeti değil.                                        #
 * #                                                                         #
 * # TÜRKÇE İ/ı TUZAĞI: cümle noktalı büyük İ (U+0130) içerir ve üzerinde    #
 * # HİÇBİR büyük/küçük harf katlaması yapılmaz (gerekçe:                     #
 * # `@repo/api-client`'taki `DELETE_ACCOUNT_CONFIRMATION` doc-comment'i).   #
 * #    Yalnızca `trim()` + birebir eşitlik.                                  #
 * ###########################################################################
 */
function DeleteAccountSection(): JSX.Element {
  const router = useRouter()
  const deleteAccount = useDeleteAccount()

  const [isArmed, setIsArmed] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const isPhraseCorrect = confirmation.trim() === DELETE_ACCOUNT_CONFIRMATION
  const canSubmit = isPhraseCorrect && !deleteAccount.isPending

  function handleDelete(): void {
    if (!canSubmit) return
    deleteAccount.mutate(
      { confirmation: confirmation.trim() },
      {
        onSuccess: () => {
          // Oturum artık yok; `useDeleteAccount` önbelleği temizledi. Yönlendirme
          // BİLEREK burada yapılır — hook navigasyon bilmez (mobil de aynı hook'u
          // tüketecek).
          router.replace('/login')
        },
      }
    )
  }

  return (
    <section
      aria-labelledby="delete-account-heading"
      className="mt-8 rounded-2xl border-2 border-red-200 bg-red-50/60 p-6 dark:border-red-900/60 dark:bg-red-950/20"
    >
      <h2
        id="delete-account-heading"
        className="mb-3 flex items-center gap-2 text-lg font-bold text-red-700 dark:text-red-400"
      >
        <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" />
        Hesabımı Sil
      </h2>

      <p className="text-sm font-medium leading-relaxed text-red-900/90 dark:text-red-200/90">
        Hesabınızı sildiğinizde <strong>geri dönüşü yoktur</strong>. Şunların tamamı kalıcı olarak
        silinir: profiliniz, antrenman ve beslenme programlarınız, antrenman ve öğün kayıtlarınız,
        günlük takipleriniz, ilerleme ölçümleriniz, form check ve ilerleme fotoğraflarınız,
        koçunuzla olan tüm yazışmalarınız ve bildirimleriniz. Silme işleminden sonra bu verilerin
        hiçbiri kurtarılamaz.
      </p>

      {!isArmed ? (
        <button
          type="button"
          onClick={() => setIsArmed(true)}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border-2 border-red-600 px-5 py-3 text-sm font-bold text-red-700 transition-colors hover:bg-red-600 hover:text-white dark:border-red-500 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
        >
          <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          Hesabımı Sil
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <label
            htmlFor="delete-confirmation"
            className="block text-sm font-bold text-red-900 dark:text-red-200"
          >
            Onaylamak için aşağıdaki kutuya{' '}
            <code className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-800 dark:bg-red-900/60 dark:text-red-100">
              {DELETE_ACCOUNT_CONFIRMATION}
            </code>{' '}
            yazın
          </label>
          <input
            id="delete-confirmation"
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            // Tarayıcı otomatik büyük harfe çevirme/düzeltme, Türkçe İ/ı katlamasıyla
            // birleşince kullanıcının doğru yazdığı cümleyi bozabilir — kapatılır.
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="delete-confirmation-hint"
            className="w-full max-w-sm rounded-xl border-2 border-red-300 bg-white p-3 text-sm font-medium focus:border-red-600 focus:outline-none dark:border-red-900 dark:bg-zinc-950"
          />
          <p
            id="delete-confirmation-hint"
            className="text-xs font-medium text-red-800/80 dark:text-red-300/80"
          >
            {isPhraseCorrect
              ? 'Onay metni doğru. Aşağıdaki düğmeye bastığınızda hesabınız kalıcı olarak silinecek.'
              : 'Silme düğmesi, onay metnini birebir yazana kadar etkinleşmez.'}
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canSubmit}
              aria-busy={deleteAccount.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              {deleteAccount.isPending ? 'Siliniyor...' : 'Hesabımı kalıcı olarak sil'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsArmed(false)
                setConfirmation('')
              }}
              disabled={deleteAccount.isPending}
              className="rounded-xl border px-5 py-3 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function ProfilePage(): JSX.Element {
  const router = useRouter()

  const { data: session, isLoading: isSessionLoading } = useSession()
  const userId = session?.user.id
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    error: profileError,
  } = useProfile(userId)
  const workoutPlanQuery = useWorkoutPlan(userId)
  const nutritionPlanQuery = useNutritionPlan(userId)

  const uploadAvatar = useUploadAvatar()
  const updatePassword = useUpdatePassword()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordChangeInput>({ resolver: zodResolver(passwordChangeSchema) })

  useEffect(() => {
    if (!isSessionLoading && !session) {
      router.replace('/login')
    }
  }, [isSessionLoading, session, router])

  // A-20/A-07: dosya seçildiği anda (submit beklenmeden) boyut/tip/magic-byte doğrulanır.
  function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    const input = event.target
    if (!file || !userId) return

    void validateImageFile(file).then((result) => {
      if (!result.ok) {
        toast.error(result.message)
        input.value = ''
        return
      }
      uploadAvatar.mutate({ userId, file })
      input.value = ''
    })
  }

  const onSubmitPassword = handleSubmit((values) => {
    updatePassword.mutate(values.password, {
      onSuccess: () => reset(),
    })
  })

  // isSessionLoading: oturum sorgusu daha dönmedi.
  // !session: oturum yok — yukarıdaki useEffect '/login'e yönlendirecek, o tamamlanana
  // kadar nötr bir iskelet gösterilir (yönlendirme render SONRASI çalışır).
  if (isSessionLoading || !session) {
    return (
      <div className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
        <SkeletonCard />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <SkeletonText lines={4} />
          <SkeletonText lines={4} />
        </div>
      </div>
    )
  }

  if (isProfileLoading) {
    return (
      <div className="container mx-auto max-w-4xl space-y-8 px-4 py-12">
        <SkeletonCard />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <SkeletonText lines={4} />
          <SkeletonText lines={4} />
        </div>
      </div>
    )
  }

  // ###########################################################################
  // # PROFİL YOK — RLS REDDİ DAHİL: BU DAL KOÇU KİLİTLEMEK İÇİN VAR             #
  // #                                                                         #
  // # `mfa_aal2_gate` politikası `profiles` tablosunu DA kapsıyor: aal1'deki  #
  // # bir koç kendi profil satırını bile OKUYAMAZ, `useProfile()` boş/hatalı  #
  // # döner. Eski davranış (tek birleşik erken dönüş) koçu SONSUZ İSKELETTE   #
  // # bırakıyordu — kayıt ekranına hiç ulaşamıyordu. Burada bunun yerine      #
  // # SecuritySection'ı içeren kilitli bir görünüm gösterilir; avatar/şifre/  #
  // # plan/hesap-silme blokları RENDER EDİLMEZ (zaten RLS onları da           #
  // # okutmayacaktır).                                                       #
  // ###########################################################################
  if (!profile) {
    return (
      <main id="main-content" className="container mx-auto max-w-4xl px-4 py-12">
        <button
          onClick={() => router.push('/')}
          className="mb-6 flex items-center gap-2 font-bold text-accent transition-opacity hover:opacity-80"
        >
          ← Ana Sayfaya Dön
        </button>

        <h1 className="mb-6 text-3xl font-bold text-gray-800 dark:text-zinc-200">Profilim</h1>

        <div
          role="alert"
          className="mb-8 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-950/30"
        >
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 h-6 w-6 shrink-0 text-amber-700 dark:text-amber-400"
          />
          <div className="space-y-1">
            <p className="font-bold text-amber-900 dark:text-amber-200">
              Hesabınız iki adımlı doğrulama tamamlanana kadar kilitli
            </p>
            <p className="text-sm font-medium leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              Koç hesapları için iki adımlı doğrulama zorunludur. Profil bilgilerinize ve danışan
              verilerinize erişebilmek için önce aşağıdan doğrulamayı tamamlayın.
            </p>
            {isProfileError && profileError && (
              <p className="text-xs font-medium text-amber-800/70 dark:text-amber-300/70">
                Teknik detay: {profileError.message}
              </p>
            )}
          </div>
        </div>

        <div id="guvenlik" className="scroll-mt-8">
          <SecuritySection />
        </div>
      </main>
    )
  }

  return (
    <main id="main-content" className="container mx-auto max-w-4xl px-4 py-12">
      <button
        onClick={() => router.push('/')}
        className="mb-6 flex items-center gap-2 font-bold text-accent transition-opacity hover:opacity-80"
      >
        ← Ana Sayfaya Dön
      </button>

      <div className="mb-8 flex flex-col items-center gap-8 rounded-3xl border border-gray-100 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-[#16161d] md:flex-row md:items-start">
        {/* Avatar Bölümü */}
        <div className="group relative cursor-pointer">
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-accent/20 bg-gray-100 transition-all group-hover:border-accent dark:bg-zinc-900">
            {/* Avatar private bucket'tadır: adres imzalıdır ve süreye bağlıdır.
                İmza üretilemezse (dosya yok/erişim yok) kırık görsel yerine
                nötr bir kullanıcı ikonu gösterilir. */}
            {profile.avatarSignedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarSignedUrl}
                alt={`${profile.full_name} profil fotoğrafı`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <User aria-hidden="true" className="h-12 w-12 text-gray-400" />
            )}
          </div>
          <input
            type="file"
            accept={ALLOWED_IMAGE_MIME.join(',')}
            aria-label="Profil fotoğrafı yükle"
            aria-busy={uploadAvatar.isPending}
            onChange={handleAvatarUpload}
            disabled={uploadAvatar.isPending}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
          {uploadAvatar.isPending && (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-xs font-bold text-white"
            >
              Yükleniyor...
            </div>
          )}
        </div>

        {/* Kullanıcı Bilgileri & Şifre */}
        <div className="w-full flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-black text-gray-800 dark:text-zinc-200">
              {profile.full_name}
            </h1>
            <p className="font-medium text-gray-500">{session?.user.email}</p>
          </div>
          <form
            onSubmit={onSubmitPassword}
            className="flex max-w-md flex-col gap-3 border-t pt-4 dark:border-zinc-800 sm:flex-row"
            noValidate
          >
            <div className="flex-1">
              <label htmlFor="new-password" className="sr-only">
                Yeni Şifre
              </label>
              <input
                id="new-password"
                type="password"
                placeholder="Yeni Şifre Belirle"
                autoComplete="new-password"
                aria-invalid={errors.password ? 'true' : 'false'}
                aria-describedby={errors.password ? 'new-password-error' : undefined}
                className="w-full rounded-xl border bg-gray-50 p-3 text-sm focus:border-accent focus:outline-none dark:border-zinc-800 dark:bg-zinc-950"
                {...register('password')}
              />
              {errors.password && (
                <p
                  id="new-password-error"
                  role="alert"
                  className="mt-1 text-xs font-bold text-red-500"
                >
                  {errors.password.message}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={updatePassword.isPending}
              className="h-fit rounded-xl bg-zinc-800 px-6 py-3 text-sm font-bold text-white transition-all hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-gray-200"
            >
              Güncelle
            </button>
          </form>
        </div>
      </div>

      {/* Program Görüntüleme Alanı */}
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
          <h3 className="mb-4 flex items-center gap-2 border-b pb-3 text-lg font-black text-accent dark:border-zinc-800">
            <Salad aria-hidden="true" className="h-5 w-5 shrink-0" />
            Beslenme Programım
          </h3>
          <QueryState
            isLoading={nutritionPlanQuery.isLoading}
            isError={nutritionPlanQuery.isError}
            error={nutritionPlanQuery.error}
            skeleton={<SkeletonText lines={7} />}
            onRetry={() => void nutritionPlanQuery.refetch()}
          >
            <NutritionPlanView plan={nutritionPlanQuery.data ?? EMPTY_NUTRITION_PLAN} />
          </QueryState>
        </div>

        <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-[#16161d]">
          <h3 className="mb-4 flex items-center gap-2 border-b pb-3 text-lg font-black text-emerald-500 dark:border-zinc-800">
            <Dumbbell aria-hidden="true" className="h-5 w-5 shrink-0" />
            Antrenman Programım
          </h3>
          <QueryState
            isLoading={workoutPlanQuery.isLoading}
            isError={workoutPlanQuery.isError}
            error={workoutPlanQuery.error}
            skeleton={<SkeletonText lines={7} />}
            onRetry={() => void workoutPlanQuery.refetch()}
          >
            <WorkoutPlanView plan={workoutPlanQuery.data ?? EMPTY_WORKOUT_PLAN} />
          </QueryState>
        </div>
      </div>

      {/* Künye — Güvenlik'ten ÖNCE: "hesabımla ilgili ne oluyor" kontrollerinden
          (Güvenlik / Aktivite rızası / Hesap silme) farklı olarak bu bölüm PROFİL
          VERİSİDİR ve sayfanın üst yarısındaki profil kartının doğal devamıdır. */}
      <div id="kunye" className="scroll-mt-8">
        <BodyMetricsSection profile={profile} />
      </div>

      {/* ###################################################################
          # GÜVENLİK BÖLÜMÜ SAYFANIN KALICI PARÇASIDIR — İKİ DALDA DA VAR    #
          #                                                                  #
          # Yukarıdaki "kilitli görünüm" dalı YALNIZCA aal1'deki koçu kayıt  #
          # olmaya ZORLAMAK içindir. Bölüm SADECE orada render edilseydi:    #
          #   * DANIŞAN MFA ekranına HİÇ ulaşamazdı — profili okunabildiği   #
          #     için her zaman bu tam görünüme düşer ve kilitli dala hiç      #
          #     girmez. ADR-0026 §Karar 2'nin "danışan opt-in" kararı kâğıt  #
          #     üzerinde kalırdı: opt-in yapılacak arayüz erişilemez olurdu. #
          #   * aal2'ye ÇIKMIŞ KOÇ da faktörlerini yönetemezdi (listeleme /  #
          #     kaldırma) — çünkü doğrulandıktan sonra o da tam görünümdedir.#
          #                                                                  #
          # `SecuritySection` üç hâli kendi içinde ayırır (faktör yok ->      #
          # kayıt, faktör var + aal1 -> seviye yükseltme, aal2 -> liste +    #
          # kaldırma), bu yüzden her iki dalda da doğru davranır.            #
          ################################################################### */}
      <div id="guvenlik" className="scroll-mt-8">
        <SecuritySection />
      </div>

      {/* Aktivite kaydı rızası (Faz 4.8 §7c, dilim 3a) — Güvenlik'in HEMEN yanında:
          ikisi de "hesabımla ilgili ne oluyor" sorusuna cevap veren kalıcı kontroller.
          `userId` burada garanti vardır (bu dal yalnızca `profile` yüklendiğinde render
          edilir, ki `profile` yüklenmesi zaten geçerli bir oturum ister). */}
      <div id="aktivite-kaydi" className="mt-8 scroll-mt-8">
        <ActivityConsent userId={userId} />
      </div>

      {/* KVKK hesap silme — sayfanın EN ALTINDA ve görsel olarak ayrılmış ("tehlikeli
          bölge" deseni): yanlışlıkla karşılaşılması zor, arayan için bulunması kolay. */}
      <DeleteAccountSection />
    </main>
  )
}
