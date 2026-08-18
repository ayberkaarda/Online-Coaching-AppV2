// Ortam değişkeni doğrulaması için PAYLAŞILAN, tarafsız yardımcı.
//
// AC-11 (güvenlik denetimi, findings-access-control.md): `src/env.ts` (istemci şeması) ve
// `src/env.server.ts` (sunucu şeması, `import 'server-only'` içerir) birbirini import ETMEMELİ.
// `env.ts` → `env.server.ts` yönünde bir import `server-only`'yi istemci grafiğine sokup build'i
// kırar; ters yönde bir import ise (gerekmese de) iki dosya arasında istenmeyen bir bağımlılık
// kenarı yaratıp "hangisi hangisini import edebilir" kuralını kırılgan hale getirirdi. Tek ortak
// yardımcı (`formatEnvError`) bu yüzden ÜÇÜNCÜ, nötr bir dosyaya taşındı: her iki taraf da bu
// dosyayı import edebilir, bu dosya ise ikisinden de bağımsızdır.

import type { z } from 'zod'

/**
 * Zod hatasını okunabilir Türkçe metne çevirir.
 * GÜVENLİK: yalnızca alan adı ve hata mesajı yazılır, DEĞERLER ASLA yazılmaz.
 */
export function formatEnvError(scope: string, error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join('.') || '(kök)'
    return `  - ${path}: ${issue.message}`
  })
  return (
    `Ortam değişkeni doğrulaması başarısız (${scope}).\n` +
    `${lines.join('\n')}\n` +
    `.env.local dosyanızı .env.example ile karşılaştırın.`
  )
}
