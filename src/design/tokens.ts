// Görsel kimliğin TEK KAYNAĞI — "Demir & Tebeşir" paleti (ADR-0015).
//
// Bu dosya bilinçli olarak platformdan bağımsızdır: yalnızca `#RRGGBB` biçiminde
// düz hex string'ler içerir. Px'li gölge string'i, `rgba()`/`calc()` gibi CSS
// fonksiyonları, Tailwind sınıf adları ve birimler buraya GİREMEZ — Faz 4.5'te
// Expo (React Native) bu dosyayı aynen import edecek (ADR-0009, ADR-0018).
// Web'e özgü dönüşüm (hex → RGB kanalları → CSS değişkeni) `tailwind.config.ts`
// içinde yapılır.
//
// ── Adlandırılmış altı hex (ADR-0015 kararı, değiştirilemez) ────────────────
//   Tebeşir          #F4F4F1  açık tema zemini
//   Demir            #14161B  koyu tema zemini
//   Menevis          #5B48D9  birincil (koyu temadaki durağı #A79BFF)
//   Kapanış          #0F7A4C  başarı
//   Kehribar         #A65600  uyarı (2026-08-17 kontrast ölçümüyle revize edildi)
//   Plaka Kırmızısı  #C22F2F  hata
//
// Geri kalan her token bu altı hex'ten TÜRETİLİR; sisteme yeni serbest renk
// eklenmez. Türetme kuralları tek tek aşağıda gerekçelendirilmiştir. Tüm
// kontrast oranları WCAG 2.1 bağıl parlaklık formülüyle hesaplanmış ve
// `tests/unit/design-tokens.test.ts` içinde makineye bağlanmıştır.

export const tokens = {
  light: {
    /** Tebeşir — adlandırılmış hex. Kanonik referans tema açık temadır. */
    bg: '#F4F4F1',
    /** Türetilmiş: Tebeşir → beyaz ekseninde %50. Kart zemini; zeminden 1.05:1 ile ayrışır. */
    surface: '#FAFAF8',
    /** Türetilmiş: aynı eksenin uç noktası. Modal/popover — açık temada "yükselme" = aydınlanma. */
    surfaceRaised: '#FFFFFF',
    /** Türetilmiş: Tebeşir + %20 Demir. Zemine 1.52:1 — ayırıcı çizgi, metin değil. */
    border: '#C7C8C6',
    /** Demir — adlandırılmış hex. Zemin üstünde 16.42:1 (AAA). */
    textPrimary: '#14161B',
    /** Türetilmiş: Demir + %35 Tebeşir. Zeminde 5.39:1 — eski `text-gray-400` borcunu kapatır. */
    textSecondary: '#626466',
    /** Menevis — adlandırılmış hex. Zeminde 5.65:1 (eski marka moru ≈ 4.2:1 idi). */
    accent: '#5B48D9',
    /** Türetilmiş: Tebeşir'in kendisi. Menevis üstünde 5.65:1 — buton metni için yeni renk gerekmez. */
    accentContrast: '#F4F4F1',
    /** Kapanış — adlandırılmış hex. Zeminde 4.88:1. */
    success: '#0F7A4C',
    /**
     * Kehribar — adlandırılmış hex (2026-08-17 kontrast ölçümüyle revize edildi:
     * #B45D00 → #A65600). Zeminde 4.82:1, kart zemininde 5.08:1, beyaz üstünde 5.31:1.
     * Uyarı rengi bu kod tabanında ezici çoğunlukla küçük punto METİN olarak kullanılıyor,
     * bu yüzden 3:1 UI eşiği değil 4.5:1 metin eşiği geçerlidir.
     */
    warning: '#A65600',
    /** Plaka Kırmızısı — adlandırılmış hex. Zeminde 5.09:1. */
    danger: '#C22F2F',
    /** Türetilmiş: accent ile aynı. Zeminde 5.65:1, UI bileşeni eşiği 3:1'in çok üstünde. */
    focusRing: '#5B48D9',
  },
  dark: {
    /** Demir — adlandırılmış hex. Eski #0f0f12 saf siyaha fazla yakındı, kademeler eziliyordu. */
    bg: '#14161B',
    /** Türetilmiş: Demir + %7 Tebeşir. Zeminden 1.19:1 — koyu temada "yükselme" = açılma. */
    surface: '#24262A',
    /** Türetilmiş: Demir + %13 Tebeşir. Yüzeyden 1.20:1 ile ikinci kademe. */
    surfaceRaised: '#313337',
    /** Türetilmiş: Demir + %20 Tebeşir — açık temadaki kenarlıkla aynı oran. Zeminde 1.80:1. */
    border: '#414246',
    /** Tebeşir — adlandırılmış hex. Demir üstünde 16.42:1 (AAA). */
    textPrimary: '#F4F4F1',
    /** Türetilmiş: Tebeşir + %35 Demir. Zeminde 7.43:1, en açık yüzeyde bile 5.20:1. */
    textSecondary: '#A6A6A6',
    /** Menevis'in koyu tema durağı — adlandırılmış hex. Demir üstünde 7.56:1. */
    accent: '#A79BFF',
    /** Türetilmiş: Demir'in kendisi. Açık Menevis üstünde 7.56:1 — koyu metin şart. */
    accentContrast: '#14161B',
    /**
     * Türetilmiş: Kapanış'a ADR-0015'in Menevis→#A79BFF işleminin aynısı uygulandı —
     * ton korunur (154°), doygunluk ×1.5 (%78→%100), parlaklık eşiği tutturana kadar
     * yükseltilir (%27→%36). Demir üstünde 6.95:1, en açık yüzeyde 4.86:1.
     */
    success: '#00B869',
    /** Türetilmiş: Kehribar, aynı kural (ton 31°, %33→%48 parlaklık). Zeminde 6.93:1. */
    warning: '#F78000',
    /** Türetilmiş: Plaka Kırmızısı, aynı kural (ton 0°, doygunluk %61→%91). Zeminde 6.88:1. */
    danger: '#F97878',
    /** Türetilmiş: accent ile aynı. Zeminde 7.56:1 — odak halkası koyu temada da okunur. */
    focusRing: '#A79BFF',
  },
} as const

export type ThemeName = keyof typeof tokens
export type TokenName = keyof (typeof tokens)['light']
