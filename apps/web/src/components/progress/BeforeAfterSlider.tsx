'use client'

// Önce/sonra karşılaştırma kaydırıcısı (Faz 4d, active_planprogram.md §6).
//
// ###########################################################################
// # KRİTİK KISIT — HAREKET AZALTMA (aynı sınıf hata, LoopRing/AC-1.6.7)      #
// #                                                                          #
// # `src/app/globals.css` içinde GLOBAL bir kural var:                       #
// #     @media (prefers-reduced-motion: reduce) { * { animation-duration:    #
// #       0.01ms !important; transition-duration: 0.01ms !important; } }     #
// #                                                                          #
// # Kaydırıcının konumu bir CSS geçişi/animasyonuyla sürülseydi (ör.         #
// # `transition-[clip-path]` + gecikmeli bir "hedefe kayma" efekti), bu      #
// # kural konumu YANLIŞ bir ara karede DONDURABİLİR ve kullanıcı YANLIŞ bir  #
// # öncesi/sonrası karşılaştırması görürdü — bu bir estetik mesele değil,    #
// # DOĞRULUK meselesidir (tıpkı LoopRing'in halka dolgusu gibi).             #
// #                                                                          #
// # BU YÜZDEN: konum SAF REACT STATE'İDİR (`useState`). "Sonrası" katmanının #
// # `clip-path` DEĞERİ doğrudan bu state'ten hesaplanır; bu dosyada HİÇBİR   #
// # `animation` / `transition` / `animate-*` sınıfı YOKTUR. Kaydırıcı        #
// # `<input type="range">` olduğu için klavye (ok tuşları, Home/End) zaten   #
// # yerleşik olarak çalışır — ayrı bir `role="slider"` + keydown işleyicisi  #
// # GEREKMEZ.                                                                #
// #                                                                          #
// # Kanıt: tests/unit/progress-photos.test.tsx.                              #
// ###########################################################################

import { useState } from 'react'
import type { JSX } from 'react'

export interface BeforeAfterSliderProps {
  beforeUrl: string
  beforeAlt: string
  afterUrl: string
  afterAlt: string
}

export function BeforeAfterSlider({
  beforeUrl,
  beforeAlt,
  afterUrl,
  afterAlt,
}: BeforeAfterSliderProps): JSX.Element {
  // 0 = yalnızca "öncesi" görünür, 100 = yalnızca "sonrası" görünür.
  const [position, setPosition] = useState(50)

  return (
    <div className="space-y-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-card border border-border">
        <img
          src={beforeUrl}
          alt={beforeAlt}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* DOLGU BURADAN GELİR: state -> clip-path. Animasyon/geçiş sınıfı YOK,
            bu yüzden globals.css'teki reduced-motion kuralı bu değeri DONDURAMAZ. */}
        <div
          data-testid="progress-photo-after-clip"
          className="absolute inset-0 h-full w-full overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={afterUrl}
            alt={afterAlt}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent"
          style={{ left: `${position}%` }}
        />
      </div>

      <label htmlFor="progress-photo-compare-slider" className="sr-only">
        Öncesi ve sonrası fotoğrafları karşılaştırma kaydırıcısı
      </label>
      <input
        id="progress-photo-compare-slider"
        data-testid="progress-photo-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label="Öncesi ve sonrası fotoğrafları karşılaştırma kaydırıcısı"
        className="w-full accent-accent"
      />
    </div>
  )
}

export default BeforeAfterSlider
