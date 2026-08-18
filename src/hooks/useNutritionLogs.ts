'use client'

// Beslenme — GERÇEKLEŞEN öğün kaydı (`nutrition_logs`) + günlük makro HEDEFİ
// (`nutrition_plans.target_*`).
//
// Faz 2d (§4.2). Bu dosya BİLEREK iki farklı kaynağı tek çatı altında toplar:
//
//   1) `nutrition_logs`     — danışanın manuel öğün girişleri (bu dosyanın adı
//                             buradan gelir).
//   2) `nutrition_plans`
//      .target_kcal/protein/carb/fat — koçun belirlediği GÜNLÜK makro hedefi.
//
// (2) NEDEN BURADA, `usePlans.ts`'TE DEĞİL: `usePlans.ts` bu Faz 2 turunda
// paralel çalışan antrenman dilimiyle PAYLAŞILAN bir dosya (iki dilim de
// dokunursa çakışma riski doğar) ve bu görevin dosya sahipliği listesinde
// YOK. `useNutritionPlan`/`useSaveNutritionPlan` (usePlans.ts) yalnızca öğün
// ŞABLONUNU (`nutrition_plan_meals`, "Haftalık Beslenme Planı" tablosu) okur/
// yazar — hedef kolonları HİÇ seçmez, `save_nutrition_plan()` RPC'si de hedef
// parametresi ALMAZ (bkz. 20260817130000_nutrition_plan_tables.sql §5; hedef
// kolonları ondan SONRA, 20260817190100'de eklendi). O RPC'yi hedef için
// "genişletmek" onu yeniden yazmak demektir — görev tam olarak bunu YASAKLIYOR
// ("Mevcut save_nutrition_plan() RPC'si var — kullan, yeniden yazma"). Hedef
// bu yüzden `nutrition_plans` üzerinde AYRI, doğrudan bir okuma/yazma yoluyla
// yönetilir; ikisi de aynı `nutrition_plans` SATIRINI paylaşır ama FARKLI
// KOLONLARA dokunur, dolayısıyla çakışma yoktur.
//
// Sorgu anahtarları `src/lib/query/keys.ts`'teki `queryKeys.nutritionTargets`/
// `queryKeys.nutritionLogs` fabrikalarından gelir; `nutritionPlan` (öğün
// ŞABLONU) ile FARKLI köklerdir, birbirlerini süpürmezler.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { queryKeys } from '@/lib/query/keys'
import { wrapSupabaseError } from '@/lib/query/supabase-error'
import { supabase } from '@/lib/supabase/client'
import type { Tables } from '@/types'

export type NutritionLog = Tables<'nutrition_logs'>

// ---------------------------------------------------------------------------
// 1) Günlük makro HEDEFİ (`nutrition_plans.target_*`) — koç yazar, herkes okur
// ---------------------------------------------------------------------------

/**
 * Günlük makro hedefi. Her alan `null` OLABİLİR — bu "koç henüz hedef
 * vermedi" demektir, `0` DEĞİLDİR (bkz. 20260817190100 migration yorumu:
 * "0 bir hedeftir, yokluk değildir"). Tüketiciler bu ayrımı KORUMAK
 * zorundadır: `?? 0` ile sessizce 0'a düşürmek "hedef 0 kcal" YALANINI
 * üretir.
 */
export interface NutritionTargets {
  kcal: number | null
  protein_g: number | null
  carb_g: number | null
  fat_g: number | null
}

const EMPTY_TARGETS: NutritionTargets = {
  kcal: null,
  protein_g: null,
  carb_g: null,
  fat_g: null,
}

/**
 * Danışanın GÜNCEL aktif planındaki günlük makro hedefini okur.
 * Aktif plan yoksa (henüz hiçbir şey kaydedilmemiş danışan) tüm alanlar
 * `null` döner — "hedef verilmedi" ile "aktif plan yok" AYNI arayüz
 * durumudur, ikisi de dashboard'da aynı şekilde ele alınır.
 */
export function useNutritionTargets(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.nutritionTargets(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<NutritionTargets> => {
      const { data, error } = await supabase
        .from('nutrition_plans')
        .select('target_kcal, target_protein_g, target_carb_g, target_fat_g')
        .eq('client_id', clientId ?? '')
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw wrapSupabaseError(error, { table: 'nutrition_plans', op: 'select' })
      if (!data) return EMPTY_TARGETS

      return {
        kcal: data.target_kcal,
        protein_g: data.target_protein_g,
        carb_g: data.target_carb_g,
        fat_g: data.target_fat_g,
      }
    },
  })
}

export interface SetNutritionTargetsInput {
  clientId: string
  targets: NutritionTargets
}

/**
 * Günlük makro hedefini KOÇ yazar (RLS: `nutrition_plans_update`/`_insert`
 * `is_coach()` veya `client_id = auth.uid()` şartıyla izin verir — bkz.
 * 20260817130000 §"nutrition_plans_update"). `save_nutrition_plan()` RPC'si
 * hedef alanlarını BİLMEDİĞİ için (yukarıdaki dosya notu) burada doğrudan
 * tablo yazımı kullanılır:
 *   - danışanın aktif planı VARSA yalnızca hedef kolonları UPDATE edilir
 *     (öğün şablonu satırlarına DOKUNULMAZ — `save_nutrition_plan` zaten
 *     `nutrition_plan_meals`'ı ayrıca yönetiyor);
 *   - YOKSA (koç şablon kaydetmeden önce hedef girerse) hedefle birlikte
 *     BOŞ bir plan başlığı (`version=1, is_active=true`) açılır; şablon
 *     kaydı geldiğinde `save_nutrition_plan` bu satırı bulup KULLANIR
 *     (kendi "aktif plan var mı" kontrolü aynı sorguyla çalışır).
 */
export function useSetNutritionTargets() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ clientId, targets }: SetNutritionTargetsInput): Promise<void> => {
      const { data: existing, error: selectError } = await supabase
        .from('nutrition_plans')
        .select('id')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle()
      if (selectError) {
        throw wrapSupabaseError(selectError, { table: 'nutrition_plans', op: 'select' })
      }

      const payload = {
        target_kcal: targets.kcal,
        target_protein_g: targets.protein_g,
        target_carb_g: targets.carb_g,
        target_fat_g: targets.fat_g,
      }

      if (existing) {
        const { error } = await supabase
          .from('nutrition_plans')
          .update(payload)
          .eq('id', existing.id)
        if (error) throw wrapSupabaseError(error, { table: 'nutrition_plans', op: 'update' })
        return
      }

      const { error } = await supabase
        .from('nutrition_plans')
        .insert({ client_id: clientId, version: 1, is_active: true, ...payload })
      if (error) throw wrapSupabaseError(error, { table: 'nutrition_plans', op: 'insert' })
    },
    onSuccess: (_result, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nutritionTargets(clientId) })
      toast.success('Günlük makro hedefi kaydedildi.')
    },
    onError: (error: Error) => {
      toast.error(`Hedef kaydedilemedi: ${error.message}`)
    },
  })
}

// ---------------------------------------------------------------------------
// 2) GERÇEKLEŞEN öğün kaydı (`nutrition_logs`) — YALNIZCA danışan yazar
// ---------------------------------------------------------------------------
//
// RLS (20260817190100 §4): SELECT `client_id = auth.uid() OR is_coach()`,
// INSERT/UPDATE/DELETE yalnızca `client_id = auth.uid()`. Koç bu tabloya
// YAZAMAZ — bu bilinçlidir (ADR-0014'ün workout_logs/daily_logs sapması
// buraya TAŞINMADI, bkz. supabase/README.md §4h). Bu dosyadaki yazma
// mutasyonları (`useCreateNutritionLog`, `useDeleteNutritionLog`) bu yüzden
// `clientId` parametresi almasına rağmen İSTEMCİ TARAFINDA rol kontrolü
// YAPMAZ — tek doğruluk kaynağı veritabanı RLS'idir (42501 ile reddeder).
// Arayüzün koça yazma eylemini hiç SUNMAMASI `NutritionTab.tsx`'in görevidir.

/**
 * Danışanın TÜM öğün kayıtları, en yeni gün/en yeni kayıt önce.
 * `useDailyLogs`/`useWorkoutLogs` ile aynı desen: sayfalama yok, sunucu
 * tarafı filtre yok — dashboard ve geçmiş listesi istemci tarafında
 * `log_date`'e göre gruplanır (bkz. `sumNutritionLogsForDate`).
 */
export function useNutritionLogs(clientId?: string) {
  return useQuery({
    queryKey: queryKeys.nutritionLogs(clientId),
    enabled: Boolean(clientId),
    queryFn: async (): Promise<NutritionLog[]> => {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select('*')
        .eq('client_id', clientId ?? '')
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw wrapSupabaseError(error, { table: 'nutrition_logs', op: 'select' })
      return data
    },
  })
}

export interface CreateNutritionLogInput {
  clientId: string
  description: string
  kcal: number | null
  protein_g: number | null
  carb_g: number | null
  fat_g: number | null
  /**
   * `YYYY-MM-DD` — kullanıcının YEREL günü (`todayIsoDate()`, src/lib/date.ts).
   *
   * ZORUNLU (opsiyonel DEĞİL) ve bu BİLİNÇLİDİR: alan opsiyonelken çağıran onu
   * göndermeyi unutabiliyordu ve satır veritabanının `default current_date`
   * değerini (UTC!) alıyordu. Okuma tarafı (`sumNutritionLogsForDate` +
   * `todayIsoDate`) YEREL güne göre filtrelediği için UTC+3'te gece
   * 00:00–03:00 arasında eklenen öğün "dün"e yazılıp dashboard'da HİÇ
   * görünmüyordu. Tipi zorunlu yapmak hatanın SINIFINI kapatır: yeni bir
   * yazma yolu eklendiğinde derleyici tarihi sormaya zorlar.
   */
  log_date: string
}

export function useCreateNutritionLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateNutritionLogInput): Promise<NutritionLog> => {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .insert({
          client_id: input.clientId,
          description: input.description,
          kcal: input.kcal,
          protein_g: input.protein_g,
          carb_g: input.carb_g,
          fat_g: input.fat_g,
          // DAİMA gönderilir — DB varsayılanına (UTC `current_date`) ASLA düşülmez.
          log_date: input.log_date,
        })
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'nutrition_logs', op: 'insert' })
      return data
    },
    onSuccess: (_log, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLogs(clientId) })
      toast.success('Öğün eklendi.')
    },
    onError: (error: Error) => {
      toast.error(`Öğün eklenemedi: ${error.message}`)
    },
  })
}

export interface DeleteNutritionLogInput {
  id: string
  /** Yalnızca cache invalidation anahtarı için — RLS satırı zaten `client_id = auth.uid()`'a kilitler. */
  clientId: string
}

export function useDeleteNutritionLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: DeleteNutritionLogInput): Promise<void> => {
      const { error } = await supabase.from('nutrition_logs').delete().eq('id', id)
      if (error) throw wrapSupabaseError(error, { table: 'nutrition_logs', op: 'delete' })
    },
    onSuccess: (_result, { clientId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.nutritionLogs(clientId) })
      toast.success('Öğün silindi.')
    },
    onError: (error: Error) => {
      toast.error(`Öğün silinemedi: ${error.message}`)
    },
  })
}

// ---------------------------------------------------------------------------
// Saf yardımcılar — hook'tan bağımsız test edilebilir (tests/unit/nutrition-logs.test.ts)
//
// `todayIsoDate` ARTIK BURADA DEĞİL: `src/lib/date.ts`e taşındı. Dört yazma
// yolu (nutrition_logs, daily_logs, progress_entries, progress_photos) ve
// okuma filtreleri onu kullanıyor; "yerel gün" kavramının beslenme diliminde
// yaşaması `useProgressEntries.ts -> useNutritionLogs.ts` gibi ters
// bağımlılıklar üretiyordu (bkz. src/lib/date.ts dosya başı notu).
// ---------------------------------------------------------------------------

export interface NutritionTotals {
  kcal: number
  protein_g: number
  carb_g: number
  fat_g: number
}

/**
 * Verilen günün (`YYYY-MM-DD`) log satırlarını toplar. `NULL` alanlar
 * toplama 0 olarak katılır — veritabanındaki `sum()` davranışıyla aynı
 * (bkz. `nutrition_logs.kcal` kolon yorumu: "sum() NULL'ları atlar").
 */
export function sumNutritionLogsForDate(
  logs: readonly NutritionLog[],
  date: string
): NutritionTotals {
  // `date` çağıran tarafından YEREL gün olarak verilir (`todayIsoDate()`);
  // yazma yolu da aynı değeri gönderdiği için karşılaştırma daima tutar.
  const dayLogs = logs.filter((log) => log.log_date === date)
  return dayLogs.reduce<NutritionTotals>(
    (acc, log) => ({
      kcal: acc.kcal + (log.kcal ?? 0),
      protein_g: acc.protein_g + (log.protein_g ?? 0),
      carb_g: acc.carb_g + (log.carb_g ?? 0),
      fat_g: acc.fat_g + (log.fat_g ?? 0),
    }),
    { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 }
  )
}
