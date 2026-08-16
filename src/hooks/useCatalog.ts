'use client'

// Salt-okunur referans katalogları (egzersizler, besinler).
// Nadiren değiştikleri için 30 dakika taze kabul edilir.

import { useQuery } from '@tanstack/react-query'

import { queryKeys } from '@/lib/query/keys'
import { supabase } from '@/lib/supabase/client'
import type { Exercise, FoodItem } from '@/types'

const CATALOG_STALE_TIME = 30 * 60_000

export function useExercises() {
  return useQuery({
    queryKey: queryKeys.exercises(),
    staleTime: CATALOG_STALE_TIME,
    queryFn: async (): Promise<Exercise[]> => {
      const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function useFoods() {
  return useQuery({
    queryKey: queryKeys.foods(),
    staleTime: CATALOG_STALE_TIME,
    queryFn: async (): Promise<FoodItem[]> => {
      const { data, error } = await supabase
        .from('food_database')
        .select('*')
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data
    },
  })
}
