// Hareket kimliğinin TEK KAYNAĞI — "Motion Doktrini" (Fable, 2026-08-21).
//
// `tokens.ts`nin renk için yaptığını bu dosya süre/eğri (easing) için yapar: tüm
// geçiş/animasyon süresi ve zamanlama eğrisi BURADAN türetilir, çağrı yerlerine
// ham `200ms` / `cubic-bezier(...)` serpiştirilmez. `tailwind.config.ts` bu
// değerleri `duration-fast` / `duration-base` / `duration-slow` ve
// `ease-standard` / `ease-decelerate` Tailwind yardımcı sınıflarına çevirir
// (bkz. `theme.extend.transitionDuration` / `transitionTimingFunction`).
//
// Kimlik ADR-0015 "Demir & Tebeşir": sakin, ağır, disiplinli. Bu yüzden yalnızca
// ÜÇ süre ve İKİ eğri vardır — spring/bounce/elastic yok, "accelerate" eğrisi
// yok (hiçbir imza hareket bu turda çıkışta hızlanan bir öğe içermiyor).
//
//   fast (120ms)  — mikro etkileşim: hover/focus renk+border geçişi.
//   base (200ms)  — orta ölçek: rota geçişi, skeleton->içerik geçişi.
//   slow (450ms)  — imza hareket: LoopRing mount'ta tek seferlik arc çizimi
//                   (bilinçli olarak en ağır süre — "ağır" kimliğin kendisi).
//
//   standard    — yerinde değişen bir öğe (ör. zaten ekrandaki bir butonun
//                 rengi). Materyal hareketindeki "standard" eğriye karşılık gelir.
//   decelerate  — EKRANA GİREN bir öğe (rota içeriği, skeleton'un yerini alan
//                 gerçek içerik, LoopRing'in ilk çizimi). Giriş yavaşlayarak
//                 biter — "demir zıplamaz", ama durağan da değildir.
export const durations = {
  fast: 120,
  base: 200,
  slow: 450,
} as const

export const easings = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
} as const

export type DurationName = keyof typeof durations
export type EasingName = keyof typeof easings
