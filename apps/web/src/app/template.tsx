// İMZA HAREKET #1 — rota geçişi (Motion Doktrini, Fable 2026-08-21).
//
// NEDEN `template.tsx` (`layout.tsx` DEĞİL): App Router'da `layout.tsx` rotalar
// arasında KALICIDIR — aynı bileşen örneği kalır, yeniden mount olmaz. `template.tsx`
// ise HER navigasyonda yeni bir örnek olarak mont edilir (bkz. `node_modules/next/
// dist/docs/01-app/02-guides/view-transitions.md`: "Wrap every participating page
// the same way... Put the wrapper in each page.tsx, not the layout: Layouts persist
// across navigations, so enter and exit never fire there"). `template.tsx` bu
// gereksinimi TEK bir dosyada karşılar — her `page.tsx`'i ayrı ayrı sarmalamaya
// gerek kalmaz.
//
// NEDEN React'ın `<ViewTransition>` BİLEŞENİ DEĞİL: Next 16'nın resmî View
// Transitions desteği (aynı dosya) `react@canary`ye dayanır. Bu projede kurulu
// `react` KARARLI 19.2.4'tür ve `ViewTransition` ihracatını İÇERMEZ (doğrulandı:
// `node -e "console.log(Object.keys(require('./apps/web/node_modules/react')))"`
// sonucu boş — `ViewTransition` yok), `next.config.mjs`'te de canary/experimental
// bayrağı yok. `import { ViewTransition } from 'react'` burada TİP HATASI verir.
//
// NEDEN ham CSS `@view-transition { navigation: auto }` DEĞİL: bu at-rule yalnızca
// TAM DOKÜMAN (MPA/cross-document, sunucudan yeni HTML) navigasyonunda tetiklenir.
// Next.js App Router istemci tarafında navige eder (History API + React ağacı
// güncellemesi, tam sayfa yüklemesi YOK) — bu at-rule burada asla ateşlenmez, sessiz
// biçimde "çalışmayan" bir animasyon eklemiş olurduk.
//
// SEÇİLEN YOL: `globals.css`'teki `.route-fade` + CSS `@starting-style`. Bu düğüm
// her navigasyonda YENİDEN DOM'a eklenir (yukarıdaki gerekçeyle); tarayıcı ilk stil
// hesaplamasında `@starting-style`in tarif ettiği `opacity: 0`dan gerçek değere
// (`opacity: 1`) geçer. Saf CSS'tir — JS state'i, hydration'ı beklemez, no-JS/yavaş
// JS durumunda içerik zaten `opacity: 1` ile render edilir (yalnızca geçiş animasyonu
// çalışmaz, içerik GÖRÜNMEZ olmaz). Süre/eğri `duration-base`/`ease-decelerate`
// Tailwind sınıflarıyla `src/design/motion.ts`ten gelir (`tailwind.config.ts`
// `theme.extend.transitionDuration`/`transitionTimingFunction`). Hareket azaltma
// tercihi tek bir yerde (`globals.css` global `@media` bloğu) `transition-duration`u
// 0.01ms'e indirir — burada ayrıca if yazılmaz.
import type { JSX, ReactNode } from 'react'

export default function Template({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="route-fade transition-opacity duration-base ease-decelerate">{children}</div>
  )
}
