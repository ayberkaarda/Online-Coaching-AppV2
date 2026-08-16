// Merkezi query key fabrikaları. Tüm hook'lar ve invalidate çağrıları bunları kullanır;
// elle dizi yazılmaz ki anahtar uyuşmazlığı (stale cache) yaşanmasın.

export interface NotificationQueryOptions {
  unreadOnly?: boolean
  sinceDays?: number
}

/** Ön ek (prefix) invalidate'i için kök anahtarlar: `invalidateQueries({ queryKey: queryKeyRoots.profile })`. */
export const queryKeyRoots = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  profiles: ['profiles'] as const,
  notifications: ['notifications'] as const,
  formChecks: ['form-checks'] as const,
  dailyLogs: ['daily-logs'] as const,
  workoutLogs: ['workout-logs'] as const,
  programApprovals: ['program-approvals'] as const,
  messages: ['messages'] as const,
  exercises: ['exercises'] as const,
  foods: ['foods'] as const,
  lastCheckins: ['last-checkins'] as const,
  recommendations: ['recommendations'] as const,
  coachId: ['coach-id'] as const,
} as const

export const queryKeys = {
  session: () => ['session'] as const,

  profile: (id?: string) => ['profile', id ?? null] as const,
  profiles: () => ['profiles'] as const,

  notifications: (userId?: string, opts?: NotificationQueryOptions) =>
    ['notifications', userId ?? null, opts ?? null] as const,

  formChecks: (clientId?: string) => ['form-checks', clientId ?? null] as const,
  dailyLogs: (clientId?: string) => ['daily-logs', clientId ?? null] as const,
  workoutLogs: (clientId?: string) => ['workout-logs', clientId ?? null] as const,
  programApprovals: (clientId?: string) => ['program-approvals', clientId ?? null] as const,

  /** Sohbet anahtarı yön bağımsızdır: (a,b) ve (b,a) aynı anahtarı üretir. */
  messages: (a?: string, b?: string) => {
    const [first, second] = [a ?? null, b ?? null].sort((x, y) =>
      String(x).localeCompare(String(y))
    )
    return ['messages', first ?? null, second ?? null] as const
  },

  exercises: () => ['exercises'] as const,
  foods: () => ['foods'] as const,
  lastCheckins: () => ['last-checkins'] as const,
  recommendations: (clientId?: string) => ['recommendations', clientId ?? null] as const,
  coachId: () => ['coach-id'] as const,
} as const
