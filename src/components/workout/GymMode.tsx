'use client'

// GYM MODU — danışanın günün antrenmanını set set uyguladığı ekran (§4.1).
//
// SAF SUNUM BİLEŞENİ: burada veri erişimi YOKTUR (AC-2.4). Tüm state ve
// mutasyonlar `WorkoutTab.tsx`'te yaşar; bu dosya yalnızca çizer ve olayları
// yukarı bildirir.
//
// KİMLİK (ADR-0018 Katman B): bu ekran yeniden yazıldığı için eski dil burada
// dönüştürülmüş hâlde doğar — 900 ağırlık sınıfı, 24px yarıçap sınıfı, gradyan
// ve ham gri/slate renkleri YOKTUR; yalnızca semantik token'lar (`bg-surface`,
// `text-fg`, `text-fg-muted`, `bg-accent`, `rounded-panel`/`rounded-card`/
// `rounded-control`) kullanılır. Eski sınıf adları burada LİTERAL yazılmaz:
// ratchet ham alt-dize sayar, yorumdaki bir örnek bile sayaca girerdi.
//
// HALKA (ADR-0017): dinlenme sayacı ve oturum kapanışı `LoopRing` ile gösterilir.
// Halkanın dolgusu CSS animasyonundan DEĞİL state'ten gelir (AC-1.6.7).

import { Play, Video, VideoOff } from 'lucide-react'
import { useState } from 'react'
import type { JSX } from 'react'

import { LoopRing } from '@/components/ui/LoopRing'
import { formatTime } from '@/lib/utils'

export interface GymModeExercise {
  /** `workout_logs.plan_exercise_id` FK'si; plan dışı sette `null`. */
  planExerciseId: string | null
  name: string
  sets: number
  reps: number
  /** `workout_plan_exercises.video_url` — koçun bıraktığı teknik videosu. */
  videoUrl: string | null
  /** Egzersiz kataloğundan gelen hareket görseli (varsa). */
  gifSrc: string | null
  animatedGifSrc: string | null
  equipment: string | null
}

export interface GymModeProps {
  dayLabel: string
  exercises: readonly GymModeExercise[]
  currentIndex: number
  currentSet: number
  restSeconds: number
  restTotalSeconds: number
  completedSetCount: number
  plannedSetCount: number
  weight: string
  reps: string
  isSaving: boolean
  onWeightChange: (value: string) => void
  onRepsChange: (value: string) => void
  onCompleteSet: () => void
  onSkipRest: () => void
  onFinish: () => void
}

// ---------------------------------------------------------------------------
// Video embed (§4.1 "video embed")
// ---------------------------------------------------------------------------

/** Gömülü oynatmaya izin verilen sağlayıcılar. Liste dışı hiçbir şey iframe'e girmez. */
const EMBEDDABLE_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'm.youtube.com',
  'youtu.be',
  'player.vimeo.com',
  'vimeo.com',
])

/**
 * `video_url`'ü gömülebilir bir adrese çevirir; çeviremezse `null` döner ve
 * çağıran taraf düz bağlantı gösterir. SAF fonksiyon — testte doğrudan çağrılır.
 *
 * NEDEN ALLOWLIST: `video_url` serbest metindir ve koç tarafından girilir. Ham
 * değeri doğrudan bir `<iframe src>`e koymak `javascript:`/`data:` şemalarını ve
 * rastgele üçüncü taraf içeriği uygulamanın içine alır. Yalnızca bilinen
 * sağlayıcıların KANONİK embed adresi üretilir; geri kalan her şey iframe'e
 * girmez.
 */
export function toEmbedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!EMBEDDABLE_HOSTS.has(url.hostname)) return null

  if (url.hostname === 'youtu.be') {
    const id = url.pathname.replace(/^\//, '')
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null
  }

  if (url.hostname.endsWith('youtube.com')) {
    if (url.pathname.startsWith('/embed/')) return `https://www.youtube.com${url.pathname}`
    const id = url.searchParams.get('v')
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null
  }

  // vimeo.com/<id> veya player.vimeo.com/video/<id>
  const vimeoId = /(?:^\/video\/|^\/)(\d+)/.exec(url.pathname)?.[1]
  return vimeoId ? `https://player.vimeo.com/video/${vimeoId}` : null
}

function ExerciseVideo({ url, name }: { url: string; name: string }): JSX.Element {
  const embed = toEmbedUrl(url)

  if (embed === null) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-control bg-accent/10 px-3 py-2 text-xs font-semibold text-accent"
      >
        <Video aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        Tekniği izle
      </a>
    )
  }

  return (
    <iframe
      src={embed}
      title={`${name} tekniği`}
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
      className="aspect-video w-full rounded-card border border-border"
    />
  )
}

// ---------------------------------------------------------------------------

export default function GymMode({
  dayLabel,
  exercises,
  currentIndex,
  currentSet,
  restSeconds,
  restTotalSeconds,
  completedSetCount,
  plannedSetCount,
  weight,
  reps,
  isSaving,
  onWeightChange,
  onRepsChange,
  onCompleteSet,
  onSkipRest,
  onFinish,
}: GymModeProps): JSX.Element {
  const [isGifPlaying, setIsGifPlaying] = useState(false)

  const currentExercise = exercises[currentIndex]
  const isResting = restSeconds > 0
  const isFinished = currentExercise === undefined

  // Duran kare (katalog `image`) ile hareketli kare (katalog `gif_url`) arasında
  // hover ile geçilir; biri yoksa diğeri her iki durumda da kullanılır.
  const stillSrc = currentExercise?.gifSrc ?? currentExercise?.animatedGifSrc ?? null
  const motionSrc = currentExercise?.animatedGifSrc ?? currentExercise?.gifSrc ?? null
  const shownSrc = isGifPlaying ? motionSrc : stillSrc

  return (
    <div className="relative mt-4 flex w-full animate-fadeIn flex-col items-center rounded-panel border border-border bg-surface p-6 shadow-sm md:p-10">
      <button
        type="button"
        onClick={onFinish}
        disabled={isSaving}
        aria-busy={isSaving}
        className="absolute right-4 top-4 rounded-control bg-danger/10 px-4 py-2 text-xs font-semibold text-danger hover:bg-danger/20 disabled:opacity-50"
      >
        Bitir
      </button>

      <h3 className="mb-1 font-display text-22 font-bold tracking-tight text-fg">CANLI GYM MODU</h3>
      <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        {dayLabel} Antrenmanı
      </p>

      {isFinished ? (
        // KUTLAMA (ADR-0017): halka KAPANIR ve Kapanış yeşiline döner. Emoji
        // kullanılmaz (ADR-0016). Hareket azaltma altında renk değişimi
        // geçişsizdir, dolgu değeri değişmez — bilgi kaybı YOK (AC-1.6.7).
        <div className="flex flex-col items-center gap-5 py-6 text-center">
          <LoopRing
            purpose="gym-session"
            value={completedSetCount}
            max={Math.max(completedSetCount, plannedSetCount, 1)}
            celebrating
            size={168}
            strokeWidth={14}
            label="Antrenman döngüsü"
            valueText={`${completedSetCount} set tamamlandı, döngü kapandı`}
          >
            <span className="font-display text-28 font-bold text-success">{completedSetCount}</span>
            <span className="text-xs font-semibold uppercase tracking-wide text-fg-muted">set</span>
          </LoopRing>
          <div>
            <h2 className="font-display text-22 font-bold text-success">DÖNGÜ KAPANDI</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Bugünün tüm hareketlerini tamamladın. Kaydı koçuna gönder.
            </p>
          </div>
          <button
            type="button"
            onClick={onFinish}
            disabled={isSaving}
            aria-busy={isSaving}
            className="w-full max-w-xs rounded-control bg-success px-6 py-4 text-base font-bold text-white shadow-sm active:scale-95 disabled:opacity-50"
          >
            Antrenmanı Kaydet ve Bitir
          </button>
        </div>
      ) : (
        <div className="w-full max-w-md rounded-panel border border-border bg-canvas p-6 text-center">
          {isResting ? (
            // DİNLENME SAYACI — ADR-0017'nin en görünür halka sahnesi.
            // Dolgu `stroke-dashoffset`ten gelir; CSS animasyonu YOKTUR, bu
            // yüzden global `prefers-reduced-motion` kuralı onu donduramaz.
            <div className="flex flex-col items-center gap-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
                Dinlenme süresi
              </p>
              <LoopRing
                purpose="gym-session"
                value={Math.max(0, restTotalSeconds - restSeconds)}
                max={Math.max(1, restTotalSeconds)}
                size={200}
                strokeWidth={14}
                label="Dinlenme döngüsü"
                valueText={`${formatTime(restSeconds)} kaldı`}
              >
                <div
                  role="timer"
                  aria-live="polite"
                  aria-label={`Dinlenme süresi ${formatTime(restSeconds)}`}
                  className="font-mono font-bold tabular-nums text-fg"
                  // ADR-0015/0017: gym modu rakam ölçeği `clamp(64px, 18vw, 96px)`.
                  // Tailwind ölçeğinde karşılığı yok, bilinçli olarak inline.
                  style={{ fontSize: 'clamp(64px, 18vw, 96px)', lineHeight: 1 }}
                >
                  {formatTime(restSeconds)}
                </div>
              </LoopRing>
              <button
                type="button"
                onClick={onSkipRest}
                className="rounded-control px-3 py-1.5 text-xs font-semibold text-fg-muted underline"
              >
                Süreyi Atla
              </button>
            </div>
          ) : (
            <>
              <p className="mb-4 inline-block rounded-control bg-accent/10 px-3 py-1 text-sm font-semibold text-accent">
                Hareket {currentIndex + 1} / {exercises.length}
              </p>

              <div
                className="group relative mb-4 flex h-48 w-full cursor-pointer items-center justify-center overflow-hidden rounded-card border border-border bg-surface-raised"
                onMouseEnter={() => setIsGifPlaying(true)}
                onMouseLeave={() => setIsGifPlaying(false)}
              >
                {shownSrc === null ? (
                  <div className="flex flex-col items-center gap-2 text-fg-muted">
                    <VideoOff aria-hidden="true" className="h-8 w-8" />
                    <span className="text-[10px] font-semibold">Görsel Bulunamadı</span>
                  </div>
                ) : (
                  <>
                    <img
                      src={shownSrc}
                      alt={`${currentExercise.name} hareketinin gösterimi`}
                      loading="lazy"
                      className={`h-full w-full object-cover transition-all duration-300 ${
                        isGifPlaying ? 'scale-105 opacity-100' : 'scale-100 opacity-60 grayscale'
                      }`}
                    />
                    {!isGifPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex items-center gap-1.5 rounded-control bg-fg/70 px-4 py-2 text-xs font-semibold text-canvas backdrop-blur-sm">
                          <Play aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                          Oynatmak için Üzerine Gel
                        </div>
                      </div>
                    )}
                    {currentExercise.equipment ? (
                      <span className="absolute bottom-2 right-2 z-10 rounded-control bg-fg/80 px-2 py-1 text-[10px] text-canvas">
                        {currentExercise.equipment}
                      </span>
                    ) : null}
                  </>
                )}
              </div>

              {currentExercise.videoUrl ? (
                <div className="mb-4">
                  <ExerciseVideo url={currentExercise.videoUrl} name={currentExercise.name} />
                </div>
              ) : null}

              <h2 className="mb-2 font-display text-22 font-bold text-fg">
                {currentExercise.name}
              </h2>
              <p className="mb-6 text-base font-semibold text-fg-muted">
                Set {currentSet} / {currentExercise.sets}{' '}
                <span className="text-accent">({currentExercise.reps} Tekrar)</span>
              </p>

              <p className="sr-only" aria-live="polite">
                {currentExercise.name}, set {currentSet} / {currentExercise.sets}, hedef{' '}
                {currentExercise.reps} tekrar.
              </p>

              <div className="mb-6 flex gap-4">
                <div className="flex-1">
                  <label
                    htmlFor="live-weight"
                    className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-fg-muted"
                  >
                    KİLO (KG)
                  </label>
                  <input
                    id="live-weight"
                    type="number"
                    value={weight}
                    onChange={(e) => onWeightChange(e.target.value)}
                    className="w-full rounded-control border-2 border-border bg-surface p-4 text-center font-mono text-lg font-bold tabular-nums text-fg outline-none focus:border-accent"
                  />
                </div>
                <div className="flex-1">
                  <label
                    htmlFor="live-reps"
                    className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-fg-muted"
                  >
                    TEKRAR
                  </label>
                  <input
                    id="live-reps"
                    type="number"
                    value={reps}
                    onChange={(e) => onRepsChange(e.target.value)}
                    placeholder={currentExercise.reps.toString()}
                    className="w-full rounded-control border-2 border-border bg-surface p-4 text-center font-mono text-lg font-bold tabular-nums text-fg outline-none focus:border-accent"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={onCompleteSet}
                className="w-full rounded-control bg-accent py-4 text-base font-bold text-accent-fg shadow-sm active:scale-95"
              >
                {currentSet === currentExercise.sets ? 'Son Seti Tamamla' : 'Seti Tamamla'}
              </button>
            </>
          )}

          <p className="mt-5 text-xs text-fg-muted">
            {completedSetCount} / {plannedSetCount} set tamamlandı
          </p>
        </div>
      )}
    </div>
  )
}
