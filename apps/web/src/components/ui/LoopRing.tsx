'use client'

// İMZA ÖĞE — HALKA (ADR-0017).
//
// TEK ANLAM KURALI: Halka YALNIZCA döngü/çevrim durumu kodlar. Dekorasyon olarak
// asla kullanılmaz — avatar çerçevesi, buton süsü, arka plan deseni YASAKTIR. Bu
// kural bir stil tercihi değil, ürünün ("Sarmal") adıyla arayüzünün aynı kavramı
// göstermesi kararıdır: kapalı döngü aynı yere dönseydi bu bir çember olurdu; halka
// aslında SARMALIN BİR TURUDUR — başladığı yere değil bir üst seviyeye döner, tıpkı
// antrenman ilerlemesinin kendisi gibi. Ayrıntı ve tam gerekçe için `docs/adr/
// 0017-imza-oge-halka.md` dosyasının sonundaki "Ek — İsim değişikliği (2026-08-20)"
// bölümüne bakın. Tek anlam kuralı ve aşağıdaki üç-konum sınırı bu isim
// değişikliğinden ETKİLENMEDİ; `LoopRing` bileşeni de o ekin gerekçesiyle
// YENİDEN ADLANDIRILMADI — bu ad sahnedeki nesneyi (bir tur = bir halka) tarif
// ediyor, ürünü değil.
//
// Halkanın ÜÇ görünme yeri vardır, fazlası yok — `LOOP_RING_PURPOSES` bu üçlüyü
// tipte VE çalışma zamanında kilitler; dördüncü bir yer eklemek ADR-0017'yi
// güncellemeyi gerektirir:
//   1. 'weekly-cycle'  — danışan panosu haftalık döngü halkası (7 segment).
//   2. 'gym-session'   — gym modu: dinlenme sayacı ve oturum kapanışı (kutlama).
//   3. 'coach-triage'  — koç triyaj kartı, 4 yaylı döngü rozeti.
// Bilinçli kesinti: NutritionTab makro gösterimi halka DEĞİLDİR (makro bir döngü
// değil bir bütçedir) — yatay bar kullanılır.
//
// ###########################################################################
// # KRİTİK KISIT — HAREKET AZALTMA (AC-1.6.7, ADR-0017 "KRİTİK KISIT")       #
// #                                                                          #
// # `src/app/globals.css` içinde GLOBAL bir kural var:                       #
// #     @media (prefers-reduced-motion: reduce) { * { animation-duration:    #
// #       0.01ms !important; transition-duration: 0.01ms !important; } }     #
// #                                                                          #
// # Halkanın dolgusu bir CSS `@keyframes` animasyonuyla çizilseydi, bu kural #
// # onu DONDURUR ve kullanıcı YANLIŞ BİLGİ görürdü (ör. %80 tamamlanmış bir  #
// # hafta %20'de donmuş görünürdü). Bu bir estetik mesele değil, DOĞRULUK    #
// # meselesidir.                                                             #
// #                                                                          #
// # BU YÜZDEN:                                                               #
// #   * Dolgu YALNIZCA state kaynaklı `stroke-dashoffset`tir. Bu dosyada     #
// #     HİÇBİR `animation` / `@keyframes` / `animate-*` sınıfı YOKTUR.       #
// #     Değer, hareket tercihinden BAĞIMSIZ olarak her zaman gerçek veridir. #
// #   * Kutlama dönüşü (halka kapanır, Kapanış yeşiline döner) hareket       #
// #     azaltma altında GEÇİŞSİZ düz renk değişimine iner: `transition`      #
// #     inline olarak `none` yazılır. Bilgi aynı kalır, yalnızca geçiş düşer.#
// #                                                                          #
// # Kanıt: `tests/unit/loop-ring.test.tsx`.                                  #
// ###########################################################################

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { JSX, ReactNode } from 'react'

/** ADR-0017'nin izin verdiği ÜÇ kullanım yeri. Dördüncüsü yoktur. */
export const LOOP_RING_PURPOSES = ['weekly-cycle', 'gym-session', 'coach-triage'] as const

export type LoopRingPurpose = (typeof LOOP_RING_PURPOSES)[number]

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * "Mount oldu mu" sinyali — imza hareket #2'nin (arc çizimi) tetikleyicisi.
 *
 * NEDEN `useSyncExternalStore` DEĞİL: `ThemeToggle`/`reset-password` sayfasındaki
 * "sunucu/ilk hidrasyonda false, istemci mount'undan sonra true" deseni yalnızca
 * UYGULAMANIN İLK hidrasyon sınırında false->true döner — LoopRing tipik olarak
 * hidrasyon TAMAMLANDIKTAN çok sonra (bir sorgu verisi geldiğinde) mount olur, o
 * noktada `useSyncExternalStore` ilk render'da zaten `true` döner ve çizim animasyonu
 * hiç OYNAMAZDI. Burada gerçekten "BU ÖRNEK mount olduktan bir kare sonra" gerekiyor.
 *
 * NEDEN yine de `react-hooks/set-state-in-effect`i İHLAL ETMİYOR: `setState` effect
 * gövdesinde SENKRON çağrılmıyor, bir `requestAnimationFrame` GERİ ÇAĞIRIMI içinde
 * çağrılıyor — kural bu deseni kabul eder (bkz. `src/app/reset-password/page.tsx`daki
 * Promise-callback örneği: "setState burada bir PROMISE CALLBACK'İ içinde çağrılıyor
 * (senkron değil, effect gövdesinin kendisinde değil) — kural bu deseni kabul eder").
 * `requestAnimationFrame` ayrıca bir yan fayda sağlar: tarayıcının "dolgusuz" ilk
 * durumu GERÇEKTEN BOYAMASINI garanti eder (senkron bir efekt/`useLayoutEffect`
 * kullanılsaydı iki state güncellemesi TEK boyama turunda birleşebilir ve CSS
 * `transition`i hiç TETİKLENMEZDİ).
 */
function useHasDrawnOnce(): boolean {
  const [hasDrawn, setHasDrawn] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setHasDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return hasDrawn
}

/** Hareket azaltma tercihi okunamıyorsa (SSR/jsdom) "azaltma yok" varsayılır. */
function readReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(REDUCED_MOTION_QUERY).matches === true
}

function subscribeReducedMotion(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const list = window.matchMedia(REDUCED_MOTION_QUERY)
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', onStoreChange)
    return () => list.removeEventListener('change', onStoreChange)
  }
  return () => {}
}

/**
 * `prefers-reduced-motion: reduce` tercihini canlı olarak izler.
 *
 * `useSyncExternalStore` kullanılır: değer render sırasında okunur, bir effect
 * içinde state'e yazılmaz — böylece ilk boyamada bile doğru değer görünür ve
 * React 19 `set-state-in-effect` kuralı ihlal edilmez. Sunucu anlık görüntüsü
 * `false`'tur (medya sorgusu sunucuda yoktur).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false)
}

/**
 * Ham değeri 0–1 aralığına indirger. SAF fonksiyon — testte doğrudan çağrılır.
 * `max <= 0`, NaN veya Infinity girdilerinde 0 döner (halka asla "uydurma" bir
 * dolgu göstermez).
 */
export function loopRingProgress(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return Math.min(1, Math.max(0, value / max))
}

/** Halka geometrisi (yarıçap/çevre). SAF fonksiyon — testte doğrudan çağrılır. */
export function loopRingGeometry(
  size: number,
  strokeWidth: number
): { center: number; radius: number; circumference: number } {
  const radius = Math.max(0, (size - strokeWidth) / 2)
  return { center: size / 2, radius, circumference: 2 * Math.PI * radius }
}

/**
 * İlerlemenin `stroke-dashoffset` karşılığı. SAF fonksiyon — AC-1.6.7'nin
 * "dolgu state'ten gelir" iddiası bu fonksiyon üzerinden makineye bağlanır.
 * progress=0 → tam çevre (hiç dolu değil), progress=1 → 0 (halka kapalı).
 */
export function loopRingDashOffset(circumference: number, progress: number): number {
  return circumference * (1 - Math.min(1, Math.max(0, progress)))
}

export interface LoopRingProps {
  /** ADR-0017'nin üç yerinden biri. Dekoratif kullanım TİPTE imkânsızdır. */
  purpose: LoopRingPurpose
  /** Döngünün tamamlanan miktarı (segmentli modda: dolu segment sayısı). */
  value: number
  /** Döngünün tamamı. */
  max: number
  /** Erişilebilir ad. Halka BİLGİ TAŞIR, bu yüzden zorunludur. */
  label: string
  /** Ekran okuyucuya okunacak insan-okur değer (ör. "1:30 kaldı"). */
  valueText?: string
  /** Segment sayısı (7 = haftalık döngü, 4 = triyaj yayı). Yoksa sürekli halka. */
  segments?: number
  /** Döngü kapandığında Kapanış yeşiline döner (ADR-0017 kutlama dönüşü). */
  celebrating?: boolean
  size?: number
  strokeWidth?: number
  className?: string
  /** Halkanın ORTASINDA gösterilecek içerik (ör. dinlenme sayacı rakamları). */
  children?: ReactNode
}

export function LoopRing({
  purpose,
  value,
  max,
  label,
  valueText,
  segments,
  celebrating = false,
  size = 160,
  strokeWidth = 12,
  className,
  children,
}: LoopRingProps): JSX.Element {
  // Hook'lar KOŞULSUZ çağrılır (React kuralı); tek anlam kuralının çalışma
  // zamanı kilidi hemen ardından gelir.
  const reducedMotion = usePrefersReducedMotion()
  const hasDrawn = useHasDrawnOnce()

  // Tek anlam kuralının ÇALIŞMA ZAMANI kilidi: tip sistemini `as never` ile
  // atlayan bir çağrı (ör. purpose="avatar-frame") sessizce dekoratif bir halka
  // üretemez, gürültülü biçimde patlar.
  if (!LOOP_RING_PURPOSES.includes(purpose)) {
    throw new Error(
      `LoopRing: gecersiz purpose "${String(purpose)}". ADR-0017 tek anlam kurali: ` +
        `halka yalnizca dongu durumu kodlar (${LOOP_RING_PURPOSES.join(' | ')}).`
    )
  }

  const { center, radius, circumference } = loopRingGeometry(size, strokeWidth)
  const progress = loopRingProgress(value, max)

  // İMZA HAREKET #2 — mount'ta tek seferlik arc çizimi (Motion Doktrini).
  //
  // `hasDrawn` (yukarıda çağrıldı) sunucu/ilk hidrasyonda `false`, istemci mount'u
  // tamamlanınca `true` olur — yani TEK SEFERLİK, mount sonrası bir kez. İlk boyama
  // dolgusuz (tam çevre) çizilir, `true`ya dönünce gerçek `progress`e geçilir;
  // aşağıdaki `motionClass` zaten var olan CSS `transition`i bu geçişi "çizim" gibi
  // gösterir. Sonraki `value`/`max` güncellemeleri `hasDrawn` true kaldığı için
  // doğrudan `progress`i izler — mount sonrası davranış ESKİSİYLE AYNIDIR, yalnızca
  // İLK boyama farklıdır.
  //
  // AC-1.6.7'yi İHLAL ETMEZ: dolgu hâlâ SADECE state'ten gelir (`hasDrawn ? progress
  // : 0`), hiçbir `@keyframes`/`animation` yok. Ekran okuyucuya giden `aria-valuenow`/
  // `aria-valuetext` HER ZAMAN gerçek `value`dir (aşağıda `progress`ten değil ham
  // prop'lardan okunur) — yalnızca GÖRSEL dolgu bir kare gecikir, ÖLÇÜM asla gecikmez.
  // Hareket azaltma altında zaten `transition-none` uygulanır (aşağıda), yani bu iki
  // state arasındaki geçiş görsel olarak ANINDA olur — sıçrama göze çarpmaz.
  const visualProgress = hasDrawn ? progress : 0

  // Hareket azaltma altında geçiş TAMAMEN düşer: kutlama rengi ANINDA değişir
  // (geçişsiz düz renk değişimi), dolgu DEĞERİ değişmez — bilgi kaybı YOK.
  //
  // Geçiş bir CLASS ile verilir, inline `style` ile değil: değerler SVG sunum
  // ÖZNİTELİĞİ (`stroke-dashoffset`) olarak yazıldığı için stil nesnesinde
  // saklanacak bir şey kalmıyor, ayrıca `motion-reduce:` varyantı JS hidrasyonu
  // beklemeden ilk boyamada da doğru davranışı verir. Süre/eğri `src/design/
  // motion.ts`ten (`duration-slow`/`ease-decelerate`) — bu halkanın turdaki İKİ
  // imza hareketten biri olması bilinçli olarak en ağır süreyi (450ms) taşımasının
  // gerekçesidir; kimlik "ağır"dır (ADR-0015).
  const motionClass = reducedMotion
    ? 'transition-none'
    : 'transition-[stroke-dashoffset,stroke] duration-slow ease-decelerate motion-reduce:transition-none'

  const strokeClass = celebrating ? 'stroke-success' : 'stroke-accent'

  return (
    <div
      data-testid="loop-ring"
      data-purpose={purpose}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      className={`relative inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        {...(valueText === undefined ? {} : { 'aria-valuetext': valueText })}
        // Döngü 12 yönünden başlasın diye statik bir dönüş (transform);
        // ANİMASYON DEĞİLDİR, hareket azaltmadan etkilenmez.
        className="-rotate-90"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-border"
        />
        {segments === undefined ? (
          <circle
            data-testid="loop-ring-progress"
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={`${strokeClass} ${motionClass}`}
            // DOLGU BURADAN GELİR: state -> progress -> dashoffset.
            // Hiçbir `@keyframes`/`animation` yoktur, bu yüzden globals.css'teki
            // `animation-duration: 0.01ms !important` kuralı bu değeri DONDURAMAZ.
            strokeDasharray={circumference}
            strokeDashoffset={loopRingDashOffset(circumference, visualProgress)}
          />
        ) : (
          renderSegments({
            segments,
            progress: visualProgress,
            center,
            radius,
            circumference,
            strokeWidth,
            strokeClass,
            motionClass,
          })
        )}
      </svg>
      {children === undefined ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
      )}
    </div>
  )
}

interface SegmentArgs {
  segments: number
  progress: number
  center: number
  radius: number
  circumference: number
  strokeWidth: number
  strokeClass: string
  motionClass: string
}

/**
 * Segmentli halka (haftalık döngü / triyaj rozeti).
 *
 * Her segment AYRI bir `<circle>`tır; dolgu yine yalnızca `stroke-dasharray` +
 * `stroke-dashoffset` ile — yani state'ten — gelir. `Math.floor` kullanılır:
 * yarım segment YUVARLANARAK doluymuş gibi gösterilmez (halka asla olduğundan
 * fazlasını söylemez).
 */
function renderSegments({
  segments,
  progress,
  center,
  radius,
  circumference,
  strokeWidth,
  strokeClass,
  motionClass,
}: SegmentArgs): JSX.Element[] {
  const count = Math.max(1, Math.floor(segments))
  const step = circumference / count
  const gap = Math.min(step * 0.18, strokeWidth * 1.5)
  const arc = Math.max(0, step - gap)
  const filled = Math.min(count, Math.floor(progress * count + 1e-9))

  const nodes: JSX.Element[] = []
  for (let index = 0; index < count; index += 1) {
    const isFilled = index < filled
    nodes.push(
      <circle
        key={index}
        data-testid="loop-ring-segment"
        data-filled={isFilled ? 'true' : 'false'}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        className={`${isFilled ? strokeClass : 'stroke-border'} ${motionClass}`}
        strokeDasharray={`${arc} ${circumference - arc}`}
        strokeDashoffset={-(index * step)}
      />
    )
  }
  return nodes
}

export default LoopRing
