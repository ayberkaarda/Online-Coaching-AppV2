// Tarayıcıda çalışan TanStack Query kancaları (`queryClient.ts`) için hafif güvenlik olayı
// loglayıcı.
//
// TARAYICI-SUNUCU TUZAĞI (A-10 kalanı, bkz. docs/security/AUDIT.md §4c "Kayıtlı borçlar" ve
// `src/lib/api/response.ts`'teki `logSecurityEvent()` yorumu): o fonksiyon KASITLI OLARAK burada
// kullanılmıyor, çünkü `response.ts` `next/server`'dan `NextResponse` içe aktarıyor —
// bu modül tarayıcı paketine (bu dosyanın çağrıldığı `queryClient.ts` `'use client'` ağacının
// parçasıdır) dahil edilmeye çalışılırsa sunucuya özel API'ler yüzünden build'i kırma riski
// taşır. Bu yüzden burada `@/lib/logger`'ı DOĞRUDAN kullanan, `next/server` bağımlılığı
// TAŞIMAYAN, kasıtlı olarak küçük ve bağımsız bir eşdeğer tutuluyor.
//
// GERÇEK KAZANCIN SINIRI (bilerek kabul edildi — bkz. bu turun ajan raporu için
// "seçilmeyen yollar" gerekçesi): `logger.ts`'in tarayıcı adaptörü yalnızca `console.warn`'a
// yazar. Bu, SUNUCUYA ULAŞAN bir güvenlik kaydı DEĞİLDİR — bir saldırgan kendi konsoluna yazılan
// olayı zaten görür, operatör görmez. Yine de sessizce yutulan bugünkü davranıştan (hiçbir iz
// yok) daha iyidir: (a) geliştirme/hata ayıklamada görünür olur, (b) kullanıcı destek talebinde
// kendi konsolunu paylaşırsa teşhis edilebilir, (c) ileride gerçek bir sunucu ucu
// (`/api/security-event` + auth + rate limit) eklenirse TEK çağrı noktası (`queryClient.ts`
// içindeki `reportRlsDenialIfNeeded`) güncellenir, hook'lara dokunulmaz.
import { logger } from '@/lib/logger'

/**
 * Güvenlik olayını tarayıcı konsoluna (`console.warn`) `event` alanıyla loglar.
 * Çağıran `fields` içine ham satır verisi/token/tam e-posta KOYMAMALIDIR — `logger.ts`'in
 * `maskForConsole()`'u bilinen PII/sağlık anahtarlarını maskeler ama bu bir güvenlik ağıdır,
 * birincil savunma değildir; sorumluluk çağırandadır.
 */
export function logClientSecurityEvent(event: string, fields?: Record<string, unknown>): void {
  logger.warn({ event, ...fields }, `Güvenlik olayı: ${event}`)
}
