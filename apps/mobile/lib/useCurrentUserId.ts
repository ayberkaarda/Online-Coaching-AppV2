// Oturumdaki danışanın kendi kimliği — veri hook'ları (`useProfile(userId)`,
// `useWorkoutPlan(clientId)`, `useProgressTrend(clientId)`) için tek kaynak.
//
// Kimlik `useSession()` önbelleğinden okunur (paylaşılan paket hook'u); ayrı bir sorgu
// açılmaz. Sekmeler yalnızca oturum kapısından geçtikten sonra render edildiği için
// (`app/_layout.tsx`), sekmelerde bu değer normalde tanımlıdır — yine de `string | undefined`
// döner ve tüketen hook'lar `enabled: Boolean(id)` ile boş kimliği güvenle karşılar.

import { useSession } from '@repo/api-client'

export function useCurrentUserId(): string | undefined {
  return useSession().data?.user.id
}
