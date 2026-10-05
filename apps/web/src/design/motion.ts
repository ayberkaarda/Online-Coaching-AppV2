// Hareket kimliğinin TEK KAYNAĞI — "Ritim, gösteri değil" (marka kararı v2 "Kor & Kemik").
//
// `tokens.ts`nin renk için yaptığını bu dosya süre/eğri (easing) için yapar: tüm
// geçiş/animasyon süresi ve zamanlama eğrisi BURADAN türetilir, çağrı yerlerine
// ham `200ms` / `cubic-bezier(...)` serpiştirilmez. `tailwind.config.ts` bu
// değerleri `duration-fast` / `duration-base` / `duration-reward` ve
// `ease-standard` / `ease-decelerate` / `ease-accelerate` yardımcı sınıflarına çevirir.
//
// Hareket yalnızca durum değişimini anlatır. Set tamamlama ve PR tek iki ödül anıdır;
// döngüsel animasyon yoktur (tek istisna skeleton nabzı). Spring/bounce yoktur.
//
//   fast   (120ms) — hover/press: renk+border geçişi.
//   base   (220ms) — sayfa/sheet: rota geçişi, skeleton->içerik geçişi.
//   reward (600ms) — set/PR: ilerleme halkasının dolması, sembol kolunun çizimi.
//
//   standard    — yerinde değişen öğe.
//   decelerate  — EKRANA GİREN öğe (giriş yavaşlayarak biter).
//   accelerate  — EKRANDAN ÇIKAN öğe (çıkış hızlanarak biter).
export const durations = {
  fast: 120,
  base: 220,
  reward: 600,
} as const

export const easings = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 1, 1)',
} as const

export type DurationName = keyof typeof durations
export type EasingName = keyof typeof easings
