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
  /** Antrenman planı artık `profiles` altında değil, kendi tablolarında yaşar (Faz 1b). */
  workoutPlan: ['workout-plan'] as const,
  /** Beslenme planı da kendi tablolarında yaşar (Faz 1b Adım 3b). */
  nutritionPlan: ['nutrition-plan'] as const,
  messages: ['messages'] as const,
  /** Okunmamış mesaj sayacı (messages.read_at is null) — Faz 1b Adım 4. */
  unreadCount: ['unread-count'] as const,
  exercises: ['exercises'] as const,
  foods: ['foods'] as const,
  lastCheckins: ['last-checkins'] as const,
  recommendations: ['recommendations'] as const,
  coachId: ['coach-id'] as const,
  /** Mesaj eki (`messages.attachment_path`) için imzalı adres — bkz. `useMessages.ts::useMessageAttachmentUrl`. */
  messageAttachmentUrl: ['message-attachment-url'] as const,
  /** Günlük makro hedefi (`nutrition_plans.target_*`) — bkz. `useNutritionLogs.ts::useNutritionTargets`. */
  nutritionTargets: ['nutrition-targets'] as const,
  /** GERÇEKLEŞEN öğün kaydı (`nutrition_logs`) — bkz. `useNutritionLogs.ts::useNutritionLogs`. */
  nutritionLogs: ['nutrition-logs'] as const,
  /**
   * İlerleme ölçümleri (`progress_entries`) — bkz. `useProgressEntries.ts`.
   * Kök ÖN EK olarak kullanılır: bir ölçüm kaydedildiğinde 7/30/90 aralığının
   * ÜÇÜ birden bayatlar, bu yüzden invalidate tek tek değil ön ekle yapılır.
   */
  progressEntries: ['progress-entries'] as const,
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

  /**
   * Antrenman planı (workout_plans + workout_plan_exercises).
   * Faz 1b öncesinde plan `profiles.workout_plan` kolonundaydı ve anahtarı
   * `[...profile(id), 'workout-plan']` idi; tablolar ayrıldığı için artık
   * bağımsız bir köke sahiptir ve `profile` invalidate'i onu SÜPÜRMEZ.
   */
  workoutPlan: (clientId?: string) => ['workout-plan', clientId ?? null] as const,

  /**
   * Beslenme planı (nutrition_plans + nutrition_plan_meals).
   * Faz 1b Adım 3b öncesinde plan `profiles.nutrition_plan` kolonundaydı ve
   * anahtarı `[...profile(id), 'nutrition-plan']` idi; tablolar ayrıldığı için
   * artık bağımsız bir köke sahiptir ve `profile` invalidate'i onu SÜPÜRMEZ.
   */
  nutritionPlan: (clientId?: string) => ['nutrition-plan', clientId ?? null] as const,

  /** Sohbet anahtarı yön bağımsızdır: (a,b) ve (b,a) aynı anahtarı üretir. */
  messages: (a?: string, b?: string) => {
    const [first, second] = [a ?? null, b ?? null].sort((x, y) =>
      String(x).localeCompare(String(y))
    )
    return ['messages', first ?? null, second ?? null] as const
  },

  /**
   * Bir konuşmadaki okunmamış mesaj sayısı.
   * `messages` anahtarından AYRIDIR: sayaç, sohbet ekranı açık olmadan da
   * (rozet/bildirim) sorgulanır ve mesaj listesi invalidate'i onu süpürmemelidir.
   * `viewerId` anahtara dahildir çünkü aynı konuşmanın okunmamış sayısı koç ile
   * danışan için FARKLIDIR (herkes yalnızca KENDİSİNE geleni sayar).
   */
  unreadCount: (clientId?: string, viewerId?: string) =>
    ['unread-count', clientId ?? null, viewerId ?? null] as const,

  exercises: () => ['exercises'] as const,
  foods: () => ['foods'] as const,
  lastCheckins: () => ['last-checkins'] as const,
  recommendations: (clientId?: string) => ['recommendations', clientId ?? null] as const,
  coachId: () => ['coach-id'] as const,

  /** Mesaj eki (`messages.attachment_path`) için imzalı adres. Yol yoksa `null` bileşeni sorguyu `enabled: false` yapar. */
  messageAttachmentUrl: (path?: string | null) => ['message-attachment-url', path ?? null] as const,

  /**
   * Günlük makro hedefi (`nutrition_plans.target_*`).
   * `nutritionPlan`'dan (öğün ŞABLONU) AYRIDIR — bkz. useNutritionLogs.ts dosya başı notu.
   */
  nutritionTargets: (clientId?: string) => ['nutrition-targets', clientId ?? null] as const,
  /** GERÇEKLEŞEN öğün kaydı (`nutrition_logs`) — danışanın manuel girdiği öğünler. */
  nutritionLogs: (clientId?: string) => ['nutrition-logs', clientId ?? null] as const,
  /** Açı etiketli ilerleme fotoğrafları (`progress_photos`) — bkz. `useProgressPhotos.ts`. */
  progressPhotos: (clientId?: string) => ['progress-photos', clientId ?? null] as const,

  /**
   * İlerleme ölçümleri (`progress_entries`) — AC-4.2'nin TEK endpoint'i.
   *
   * `rangeDays` (7/30/90) anahtarın PARÇASIDIR: her aralık SUNUCU TARAFINDA
   * ayrı bir `entry_date >= ...` sorgusudur, dolayısıyla ayrı bir önbellek
   * girdisidir. Aralık değişince eski seri gösterilmez, yeni seri ayrıca
   * saklanır (ileri-geri geçişte yeniden istek yapılmaz).
   *
   * `progressPhotos`'tan AYRI köktür: fotoğraf listesi imzalı URL TTL'ine
   * bağlıdır ve ölçüm kaydı onu bayatlatmamalıdır.
   */
  progressEntries: (clientId?: string, rangeDays?: number) =>
    ['progress-entries', clientId ?? null, rangeDays ?? null] as const,
} as const
