'use client'

// "Verilerim" — danışanın (ve isterse koçun) KENDİ etkinlik kaydı (Faz 4.8 §7c,
// dilim 3b). KVKK m.11 erişim hakkının karşılığı: burada gösterilen kayıt SAAT/
// DAKİKA dahil TAM AYRINTILIDIR — koç panelindeki gün-hassasiyetli özetle
// (`apps/web/src/components/activity/CoachActivitySummary.tsx`) KARIŞTIRILMAMALIDIR,
// ikisi BİLEREK simetrik değildir (bkz. migration §3 KARAR 3a).
//
// Rol GATE'İ YOK: bu sayfa kendi id'sini okur (`useSession().data.user.id`),
// dolayısıyla hem danışan hem koç kendi kaydını görebilir — RLS zaten yalnızca
// `user_id = auth.uid()` satırlarını döndürür (`activity_sessions_select` /
// `activity_events_select`), rol farkı bu okumayı ETKİLEMEZ.

import { useRouter } from 'next/navigation'
import type { JSX } from 'react'
import { useEffect } from 'react'

import { useSession } from '@repo/api-client'

import { ActivityConsent } from '@/components/activity/ActivityConsent'
import { ClientActivityLog } from '@/components/activity/ClientActivityLog'
import { ThemeToggle } from '@/components/ThemeToggle'

export default function VerilerimPage(): JSX.Element {
  const router = useRouter()
  const { data: session, isLoading: isSessionLoading } = useSession()

  useEffect(() => {
    if (isSessionLoading) return
    if (!session) router.replace('/login')
  }, [isSessionLoading, session, router])

  return (
    <main id="main-content" className="container relative mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <div className="absolute left-4 top-4 flex gap-2">
        {/* Metin `sm` altında gizlendiği için buton mobilde YALNIZ-İKON olur;
            erişilebilir adı `aria-label` sabitler (dashboard'daki eşdeğer
            butonlarla aynı kalıp, bkz. `apps/web/src/app/users/page.tsx`). */}
        <button
          onClick={() => router.push('/')}
          aria-label="Ana Sayfaya Dön"
          className="flex items-center gap-2 rounded-control p-2 text-sm font-bold text-accent transition-all hover:bg-accent/10"
        >
          <span aria-hidden="true">←</span>{' '}
          <span className="hidden sm:inline">Ana Sayfaya Dön</span>
        </button>
      </div>

      <ThemeToggle />

      <header className="mb-10 mt-12 md:mt-0">
        <h1 className="text-3xl font-bold tracking-tight text-fg md:text-4xl">Verilerim</h1>
        <p className="mt-2 max-w-2xl text-sm font-medium text-fg-muted">
          Uygulamadaki etkinliğinizin (oturum açma/kapama, sekme görüntüleme, günlük giriş, form
          check yükleme, mesaj ve program üretimi) kaydıdır. Bu, kendi verinize erişim hakkınızdır
          (KVKK m.11) — koçunuz aynı bilgiyi yalnızca GÜN hassasiyetinde, saat/dakika olmadan görür.
        </p>
      </header>

      {/* Rıza kontrolü kaydın HEMEN üstünde: kullanıcı kendi verisini görürken
          (dilim 3b'nin `ClientActivityLog`u) aynı sayfadan açıp kapatabilsin
          diye — görev talimatı §4 "kullanıcı kendi verisini görürken oradan da
          kapatabilmeli". `ClientActivityLog.tsx` BU turda değiştirilmiyor
          (dilim 3b'nin dosyası); üç rıza durumunu KENDİ İÇİNDE zaten anlatıyor,
          bu bileşen yalnızca gerçek AÇMA/KAPATMA eylemini ekliyor. */}
      {session ? (
        <div className="space-y-8">
          <ActivityConsent userId={session.user.id} />
          <ClientActivityLog userId={session.user.id} />
        </div>
      ) : null}
    </main>
  )
}
