// Görsel kimliğin TEK KAYNAĞI — "Kor & Kemik" paleti (marka kararı v2, ADR-0015'in yerine).
//
// Bu dosya bilinçli olarak platformdan bağımsızdır: yalnızca `#RRGGBB` biçiminde
// düz hex string'ler içerir. Px'li gölge string'i, `rgba()`/`calc()` gibi CSS
// fonksiyonları, Tailwind sınıf adları ve birimler buraya GİREMEZ — mobil
// (`apps/mobile/lib/theme.ts`) aynı değerleri birebir taşır (palet eşitliği testi).
// Web'e özgü dönüşüm (hex → RGB kanalları → CSS değişkeni) `tailwind.config.ts`
// içinde yapılır.
//
// ── Adlandırılmış çekirdek renkler ─────────────────────────────────────────
//   Kemik  #F5F2EC  açık tema zemini (sıcak kâğıt)
//   Gece   #121110  koyu tema zemini (sıcak grafit)
//   Kor    #B63D0B  tek vurgu rengi (koyu temadaki durağı #FF8A4C)
//   Su     #0E6E78  ikinci veri serisi / bilgi (koyu durağı #4CC3CF)
//
// Nötrler sıcak grilerdir; saf gri ve mor yoktur. Kor bir ekranda en fazla bir
// dolu öğede kullanılır (birincil buton, aktif sekme, ilerleme halkası, PR anı).
// Durum rengi asla tek sinyal değildir — her zaman ikon ya da etiketle birlikte.
//
// Kontrast matrisi (WCAG 2.1, her metin token'ı her yüzeyde ≥4.5:1, her kontrol
// sınırı ≥3:1) `tests/unit/design-tokens.test.ts` içinde makineye bağlıdır.

export const tokens = {
  light: {
    /** Kemik — adlandırılmış hex. */
    bg: '#F5F2EC',
    /** Kart zemini. Kartlar gölgesizdir; 1px `border` ile ayrılır. */
    surface: '#FFFFFF',
    /** Input, tablo şeridi, iç içe alan. */
    surfaceSunken: '#ECE7DE',
    /** Modal, popover, sheet. Açık temada yükselme tek kademe gölgeyle verilir. */
    surfaceRaised: '#FFFFFF',
    /** Yalnız dekoratif ayırıcı — 3:1 aranmaz. */
    border: '#D9D2C5',
    /** Input/checkbox sınırı — her açık yüzeyde ≥3:1 (WCAG 1.4.11). */
    borderControl: '#81796B',
    /** Kemik üstünde 16.33:1. */
    textPrimary: '#17150F',
    /** Kemik üstünde 6.42:1, sunken üstünde 5.82:1. */
    textSecondary: '#5C574E',
    /** Kor — dolgu ve metin. Kemik üstünde 5.13:1, sunken üstünde 4.66:1. */
    accent: '#B63D0B',
    /** Kor dolgu üstündeki metin: 5.74:1. */
    accentContrast: '#FFFFFF',
    success: '#2B7449',
    /** Hardal. */
    warning: '#825F00',
    /** Ahududu. */
    danger: '#B4123F',
    /** Su — bilgi ve ikinci veri serisi. */
    info: '#0E6E78',
    /** Kor ile aynı; 2px halka + 2px zemin ofseti. */
    focusRing: '#B63D0B',
  },
  dark: {
    /** Gece — adlandırılmış hex. */
    bg: '#121110',
    /** Koyu temada yükselme açılmayla verilir; gölge yoktur. */
    surface: '#1C1A17',
    surfaceSunken: '#0B0A09',
    surfaceRaised: '#24221F',
    border: '#36322C',
    borderControl: '#7A7266',
    textPrimary: '#F3EFE8',
    textSecondary: '#A69F93',
    /** Kor'un koyu tema durağı — Gece üstünde 8.08:1. */
    accent: '#FF8A4C',
    /** Açık kor üstünde koyu metin şart: 8.08:1. */
    accentContrast: '#121110',
    success: '#5FC98A',
    warning: '#E8B931',
    danger: '#FF6B8B',
    info: '#4CC3CF',
    focusRing: '#FF8A4C',
  },
} as const

export type ThemeName = keyof typeof tokens
export type TokenName = keyof (typeof tokens)['light']
