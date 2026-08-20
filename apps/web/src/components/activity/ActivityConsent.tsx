'use client'

// Aktivite kaydı — RIZA VE AYDINLATMA ARAYÜZÜ (Faz 4.8 §7c, dilim 3a).
//
// ###########################################################################
// # BU DOSYA FAZ 4.8'İN SON EKSİK PARÇASIDIR                                #
// ###########################################################################
// Dilim 1 (şema/RLS/purge) ve dilim 2 (yazma yolu + heartbeat + rıza uçları)
// zaten kuruldu; dilim 3b (`ClientActivityLog.tsx`, `CoachActivitySummary.tsx`)
// zaten OKUYOR. Ama rızayı VERECEK/GERİ ÇEKECEK bir arayüz yoktu — yani hiçbir
// kullanıcı `activity_consent_state` hiçbir zaman `undecided` dışına çıkamıyordu.
// Bu dosya o boşluğu kapatır.
//
// ###########################################################################
// # KVKK KARARI — AÇIK RIZA, HER AN OPT-OUT, ÜÇ AYRI DURUM                  #
// ###########################################################################
// `active_planprogram.md` §7c: "meşru menfaat yetmez" — bu yüzden onay kutusu
// ÖNCEDEN İŞARETSİZDİR ve hiçbir dal kullanıcı adına otomatik rıza ÜRETMEZ.
// Üç durum (`undecided` / `granted` / `revoked`) burada da AYRI ele alınır —
// `revoked` kullanıcısına "hiç açmadınız" demek yanlış bilgi üretir (dilim 3b'nin
// aynı gerekçeli kararı, bkz. `ClientActivityLog.tsx` başlık yorumu).
//
// ###########################################################################
// # NEREYE KONDU — PROFİL + VERİLERİM, İLK GİRİŞ MODALI DEĞİL               #
// ###########################################################################
// Üç seçenek vardı: ilk giriş sonrası zorunlu bir ekran, kalıcı bir profil
// kontrolü, ya da ikisi birden. Zorunlu bir "ilk giriş" modalı BİLEREK
// KURULMADI:
//   1) Rıza "özgür irade" gerektirir (§7c). Kullanıcıyı ana akışa girmeden önce
//      bir onay/ret ekranına HAPSETMEK — reddedip geçse bile — kendi başına
//      hafif bir baskı üretir; bu ADR'nin ruhuyla çelişir.
//   2) "Reddeden/erteleyen kullanıcıya HER GİRİŞTE tekrar sormak rızanın özgür
//      irade niteliğini aşındırır" (görev talimatı). Bir dashboard/layout
//      interstitial'i bunu neredeyse otomatik üretir: kullanıcı ne zaman
//      "vazgeç" dese bile bir sonraki oturumda yeniden karşısına çıkar.
//   3) Bu dilimin dosya sahipliği zaten bu kararı destekliyor: elimde bir
//      onboarding/dashboard dosyası YOK (`providers.tsx`/`app/page.tsx` bu
//      dilimin dışında) — yani zorunlu bir interstitial kurmak paralel
//      çalışan başka bir dilimin dosyasına dokunmayı gerektirirdi.
//
// Bunun yerine kontrol İKİ kalıcı, kullanıcının KENDİ İSTEĞİYLE gittiği yere
// kondu: `/profile` (genel hesap ayarları — "Güvenlik" bölümünün yanı) ve
// `/verilerim` (KVKK erişim hakkının karşılığı — "bu senin verin" sayfası).
// İkisi de aynı bileşeni (bu dosya) render eder. Sonuç: `undecided` bir
// kullanıcı HER girişte sorulmaz (ana akışa hiç karışmaz), ama ne zaman
// isterse iki doğal yerden biri her zaman oradadır — "bir kez sor, rahatsız
// etme" dengesi böyle kuruldu.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ShieldCheck, ShieldOff, ShieldQuestion } from 'lucide-react'
import type { JSX } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'

import { activityQueryKeys, useActivityConsentState, useSupabaseClient } from '@repo/api-client'

import {
  ACTIVITY_CONSENT_VERSION,
  announceActivityConsentChange,
  grantActivityConsent,
  revokeActivityConsent,
} from '@/lib/activity'
import { SkeletonCard } from '@/components/ui'

export interface ActivityConsentProps {
  userId?: string
}

// ---------------------------------------------------------------------------
// Aydınlatma metni — sürüm `ACTIVITY_CONSENT_VERSION`. Metin değişirse o sabit
// artırılır ve DB (`grant_activity_consent`) eski sürümü tekrar onay olarak
// KABUL ETMEZ (bkz. `contract.ts` başlık yorumu) — yani bu metnin herhangi bir
// cümlesi değişirse sürüm numarası da BİRLİKTE artırılmalıdır.
// ---------------------------------------------------------------------------

function ConsentNotice(): JSX.Element {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-fg-muted">
      <div>
        <p className="font-bold text-fg">Ne toplanıyor</p>
        <p>
          Hangi sekmeyi görüntülediğiniz ve orada ne kadar kaldığınız; oturum açma ve kapama
          zamanlarınız; ve şu eylemleri yaptığınız anlar: günlük veri girişi, form check (ilerleme
          fotoğrafı) yükleme, mesaj gönderme, otomatik program üretme.
        </p>
      </div>
      <div>
        <p className="font-bold text-fg">Ne toplanmıyor</p>
        <p>
          IP adresiniz, cihaz/tarayıcı bilginiz, ekranda tıkladığınız yerler ve
          günlüklerinize/mesajlarınıza yazdığınız içeriğin kendisi. Bunlar bu sistemde hiç tutulmaz.
        </p>
      </div>
      <div>
        <p className="font-bold text-fg">Kim görüyor</p>
        <p>
          Koçunuz yalnızca GÜN bazında bir özet görür (o gün ne kadar aktif olduğunuz, hangi
          eylemden kaç tane yaptığınız); saat veya dakika bilgisi koçunuza hiçbir zaman gösterilmez.
          Kendi kaydınızı saat/dakika dahil tam ayrıntısıyla yalnızca siz görebilirsiniz (bu sayfa /
          &quot;Verilerim&quot;).
        </p>
      </div>
      <div>
        <p className="font-bold text-fg">Ne kadar saklanıyor</p>
        <p>Kayıtlar en fazla 180 gün saklanır; bu sürenin sonunda otomatik olarak silinir.</p>
      </div>
      <div>
        <p className="font-bold text-fg">Rızanızı geri çekerseniz</p>
        <p>
          Kayıt anında durur VE o ana kadar biriken tüm kayıtlarınız da ANINDA kalıcı olarak silinir
          — 180 gün beklenmez.
        </p>
      </div>
      <div>
        <p className="font-bold text-fg">Rıza vermezseniz</p>
        <p>
          Uygulamanın hiçbir özelliği kısıtlanmaz veya kilitlenmez; programınıza, mesajlarınıza ve
          koçunuza erişiminiz tamamen aynı kalır. Rıza özgür iradeyle verilir, koşullu sunulmaz.
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mutasyonlar — `transport.ts`in hazır sarmalayıcılarını TÜKETİR (yeniden
// yazmaz). Erişim jetonu `tracker.tsx` ile AYNI yöntemle okunur:
// `supabase.auth.getSession()` — bu istemcide oturum tarayıcı Supabase
// istemcisinin kendisinde tutulur (A-05/B-006, bkz. `useSession.ts`).
// ---------------------------------------------------------------------------

function useGrantConsentMutation(userId: string | undefined) {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) {
        throw new Error('Oturum doğrulanamadı. Lütfen sayfayı yenileyip tekrar deneyin.')
      }
      const result = await grantActivityConsent(ACTIVITY_CONSENT_VERSION, {
        accessToken: data.session.access_token,
      })
      if (!result.ok) throw new Error('Rıza kaydedilemedi. Lütfen tekrar deneyin.')
    },
    onSuccess: () => {
      // Gevşek bağlı olay: heartbeat izleyicisi bunu dinler ve rıza durumunu
      // sayfa yenilenmeden yeniden okur (bkz. `tracker.tsx`).
      announceActivityConsentChange()
      void queryClient.invalidateQueries({ queryKey: activityQueryKeys.consentState(userId) })
      toast.success('Aktivite kaydı açıldı.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

function useRevokeConsentMutation(userId: string | undefined) {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const { data, error } = await supabase.auth.getSession()
      if (error || !data.session) {
        throw new Error('Oturum doğrulanamadı. Lütfen sayfayı yenileyip tekrar deneyin.')
      }
      const result = await revokeActivityConsent({ accessToken: data.session.access_token })
      if (!result.ok) throw new Error('Rıza geri çekilemedi. Lütfen tekrar deneyin.')
    },
    onSuccess: () => {
      announceActivityConsentChange()
      void queryClient.invalidateQueries({ queryKey: activityQueryKeys.consentState(userId) })
      // Sunucu veriyi ZATEN sildi (`revoke_activity_consent`); önbellekteki eski
      // oturum/olay listeleri de düşürülür ki bir sonraki `granted` durumunda
      // bayat satırlar bir an için ekrana yanıp sönmesin.
      queryClient.removeQueries({ queryKey: activityQueryKeys.sessions(userId) })
      queryClient.removeQueries({ queryKey: activityQueryKeys.events(userId) })
      toast.success('Aktivite kaydı kapatıldı ve mevcut verileriniz silindi.')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ---------------------------------------------------------------------------
// Rıza VER paneli — `undecided` ve `revoked` PAYLAŞIR (ikisi de aynı akış:
// metni oku, kutuyu işaretle, onayla). Metin ve düğme etiketi çağırana göre
// değişir ki `revoked` kullanıcısına "hiç karar vermediniz" YANLIŞ bilgisi
// verilmesin (dilim 3b'nin aynı gerekçeli kararı).
// ---------------------------------------------------------------------------

function GrantPanel({
  userId,
  heading,
  description,
  actionLabel,
}: {
  userId: string | undefined
  heading: string
  description: string
  actionLabel: string
}): JSX.Element {
  // KVKK: onay kutusu ÖNCEDEN İŞARETSİZ. Bu satır kasıtlı olarak `false`
  // sabit değerdir — hiçbir koşul bunu `true` yapmamalı.
  const [isChecked, setIsChecked] = useState(false)
  const grant = useGrantConsentMutation(userId)

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldQuestion aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div>
          <p className="text-sm font-bold text-fg">{heading}</p>
          <p className="text-sm text-fg-muted">{description}</p>
        </div>
      </div>

      <ConsentNotice />

      <label className="flex items-start gap-3 rounded-card border border-border bg-canvas p-4 text-sm font-medium text-fg">
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(event) => setIsChecked(event.target.checked)}
          aria-describedby="activity-consent-checkbox-hint"
          className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
        />
        <span id="activity-consent-checkbox-hint">
          Yukarıdaki aydınlatma metnini okudum ve aktivite kaydının toplanmasına açık rıza
          veriyorum.
        </span>
      </label>

      <button
        type="button"
        onClick={() => grant.mutate()}
        disabled={!isChecked || grant.isPending}
        aria-busy={grant.isPending}
        className="inline-flex items-center gap-2 rounded-control bg-accent px-5 py-3 text-sm font-bold text-accent-fg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
        {grant.isPending ? 'Kaydediliyor...' : actionLabel}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Rıza GERİ ÇEK paneli — `granted`. Hesap silmedeki çift onay deseninden
// (bkz. `profile/page.tsx` `DeleteAccountSection`) BİLEREK DAHA HAFİF: orada
// yazarak doğrulama var çünkü silinen şey TÜM HESAPTIR ve geri dönüşü yoktur.
// Burada tek bir "niyet" tıklaması + açık bir "veriler silinecek" uyarısı
// yeterlidir — kapatma anında silinen veri yalnızca 180 günlük aktivite
// kaydıdır (hesap, program, mesaj, ilerleme verisi ETKİLENMEZ) ve kullanıcı
// dilediği an tekrar rıza vererek YENİDEN toplamaya başlayabilir; "yazarak
// doğrulama" o boyuttaki bir kayıp için orantısız bir sürtünme olurdu.
// ---------------------------------------------------------------------------

function RevokePanel({ userId }: { userId: string | undefined }): JSX.Element {
  const [isArmed, setIsArmed] = useState(false)
  const revoke = useRevokeConsentMutation(userId)

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success" />
        <div>
          <p className="text-sm font-bold text-fg">Aktivite kaydınız açık.</p>
          <p className="text-sm text-fg-muted">
            Onayladığınız aydınlatma metni sürüm {ACTIVITY_CONSENT_VERSION}. Dilediğiniz an
            kapatabilirsiniz.
          </p>
        </div>
      </div>

      {!isArmed ? (
        <button
          type="button"
          onClick={() => setIsArmed(true)}
          className="inline-flex items-center gap-2 rounded-control border border-danger/40 px-4 py-2.5 text-sm font-bold text-danger transition-colors hover:bg-danger/10"
        >
          <ShieldOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          Aktivite Kaydını Kapat
        </button>
      ) : (
        <div className="space-y-3 rounded-card border border-danger/30 bg-danger/5 p-4">
          <div role="alert" className="flex items-start gap-2 text-sm font-bold text-danger">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Kapatırsanız kayıt hemen durur ve mevcut tüm aktivite verileriniz ANINDA kalıcı olarak
              silinir. Bu işlem geri alınamaz.
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => revoke.mutate(undefined, { onSettled: () => setIsArmed(false) })}
              disabled={revoke.isPending}
              aria-busy={revoke.isPending}
              className="rounded-control bg-danger px-4 py-2.5 text-sm font-bold text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revoke.isPending ? 'Kapatılıyor...' : 'Evet, Kapat ve Verilerimi Sil'}
            </button>
            <button
              type="button"
              onClick={() => setIsArmed(false)}
              disabled={revoke.isPending}
              className="rounded-control border border-border px-4 py-2.5 text-sm font-bold text-fg-muted transition-colors hover:bg-canvas disabled:opacity-40"
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dışa açık bileşen — üç durumu yönlendirir. `/profile` ve `/verilerim` AYNI
// bileşeni render eder (bkz. dosya başındaki "nereye kondu" kararı).
// ---------------------------------------------------------------------------

export function ActivityConsent({ userId }: ActivityConsentProps): JSX.Element {
  const consentQuery = useActivityConsentState(userId)

  function renderBody(): JSX.Element {
    if (!userId || consentQuery.isLoading) return <SkeletonCard />

    if (consentQuery.isError) {
      return (
        <p role="alert" className="text-sm font-medium text-danger">
          Rıza durumu okunamadı. Lütfen sayfayı yenileyin.
        </p>
      )
    }

    // Üç durum AYRI ele alınır (dilim 3b'nin `ClientActivityLog`ta uyguladığı
    // aynı disiplin) — `default` yalnızca sorgu henüz veri döndürmediği ara
    // hâli karşılar.
    switch (consentQuery.data) {
      case 'granted':
        return <RevokePanel userId={userId} />
      case 'revoked':
        return (
          <GrantPanel
            userId={userId}
            heading="Aktivite kaydınız şu anda kapalı."
            description="Yeniden açmak isterseniz aşağıdaki aydınlatma metnini okuyup onaylayın."
            actionLabel="Rızamı Tekrar Ver ve Aç"
          />
        )
      case 'undecided':
        return (
          <GrantPanel
            userId={userId}
            heading="Aktivite kaydı için henüz bir karar vermediniz."
            description="Açmak isterseniz aşağıdaki aydınlatma metnini okuyup onaylayın; istemezseniz hiçbir şey yapmanıza gerek yok, hiçbir özellik kısıtlanmaz."
            actionLabel="Rızamı Ver ve Aktivite Kaydını Aç"
          />
        )
      default:
        return <SkeletonCard />
    }
  }

  return (
    <section
      aria-labelledby="activity-consent-heading"
      className="rounded-panel border border-border bg-surface p-6"
    >
      <h2
        id="activity-consent-heading"
        className="mb-4 flex items-center gap-2 text-lg font-bold text-fg"
      >
        <ShieldQuestion aria-hidden="true" className="h-5 w-5 shrink-0 text-accent" />
        Aktivite Kaydı
      </h2>

      {renderBody()}
    </section>
  )
}
