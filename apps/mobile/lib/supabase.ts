// Mobil Supabase istemci FABRİKASI (B-052) — ADR-0024'ün mobil kanıtı.
//
// ─────────────────────────────────────────────────────────────────────────────
// NEDEN AYRI BİR FABRİKA (web'inkini kullanmıyoruz)
// ─────────────────────────────────────────────────────────────────────────────
// `@repo/api-client` Supabase istemcisini MODÜL SEVİYESİNDE import etmez; her uygulama
// kendi istemcisini kurup `<SupabaseClientProvider>`'a enjekte eder (context.tsx başlığı).
// Web'in fabrikası (`apps/web/src/lib/supabase/client.ts`) `@supabase/ssr`'ın
// `createBrowserClient`'ını kullanır ve oturumu `document.cookie`'ye yazar — React Native'de
// `document` yoktur, o istemci mobilde import edildiği an çökerdi. Bu yüzden mobil KENDİ
// istemcisini `@supabase/supabase-js`'in `createClient`'ıyla kurar ve oturumu
// `expo-secure-store`'da saklar. Paket tarafında hiçbir dallanma yoktur; iki app AYNI
// Provider'a farklı istemci enjekte eder — bu, "aynı paket iki app'te" kararının kanıtıdır.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

import type { Database } from '@repo/types'

// ─────────────────────────────────────────────────────────────────────────────
// ENV — HOSTED varsayılan (Fable kararı). `EXPO_PUBLIC_*` build sırasında metne gömülür.
// ─────────────────────────────────────────────────────────────────────────────
// Web'in `NEXT_PUBLIC_*`'ıyla aynı kural: Expo dinamik `process.env[ad]` erişimini
// desteklemez, her değişken TAM adıyla okunur. Değerler yerel `.env`'den (git-ignored)
// gelir; `.env.example` hosted yolu belgeler.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

// ─────────────────────────────────────────────────────────────────────────────
// SecureStore OTURUM DEPOSU — 2048 bayt sınırına karşı parçalama
// ─────────────────────────────────────────────────────────────────────────────
// `SecureStore` değer başına ~2048 baytla sınırlıdır (Android Keystore); bu sınırın
// üstünde uyarı basıp değeri yazamaz. Supabase oturum JSON'u (access + refresh token +
// user) bu sınırı RAHATLIKLA aşar — düz bir `setItemAsync(key, session)` gerçek cihazda
// oturumu kalıcı YAPAMAZDI. Bu yüzden değer <2048 baytlık parçalara bölünür; her parça
// ayrı bir anahtarda tutulur, parça sayısı bir `__meta` anahtarında saklanır.
//
// Anahtar karakter kısıtı: SecureStore yalnızca `[A-Za-z0-9._-]` kabul eder. Supabase'in
// varsayılan anahtarı `sb-<ref>-auth-token`'dır; ürettiğimiz `__meta` / `__<n>` son ekleri
// de yalnızca bu karakterleri içerir.
const CHUNK_SIZE = 2000

async function getItem(key: string): Promise<string | null> {
  const meta = await SecureStore.getItemAsync(`${key}__meta`)
  if (meta === null) {
    // Parçalanmadan yazılmış (küçük) bir değer olabilir — geriye dönük oku.
    return SecureStore.getItemAsync(key)
  }
  const count = Number(meta)
  let value = ''
  for (let index = 0; index < count; index++) {
    const part = await SecureStore.getItemAsync(`${key}__${index}`)
    // Parça eksikse depo tutarsızdır: null dönüp Supabase'in yeniden giriş istemesini sağla.
    if (part === null) return null
    value += part
  }
  return value
}

async function setItem(key: string, value: string): Promise<void> {
  // Önce eski parçaları temizle (yeni değer daha az parça sürüyor olabilir).
  await removeItem(key)
  const count = Math.ceil(value.length / CHUNK_SIZE)
  await SecureStore.setItemAsync(`${key}__meta`, String(count))
  for (let index = 0; index < count; index++) {
    await SecureStore.setItemAsync(
      `${key}__${index}`,
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)
    )
  }
}

async function removeItem(key: string): Promise<void> {
  const meta = await SecureStore.getItemAsync(`${key}__meta`)
  const count = meta === null ? 0 : Number(meta)
  await SecureStore.deleteItemAsync(`${key}__meta`)
  for (let index = 0; index < count; index++) {
    await SecureStore.deleteItemAsync(`${key}__${index}`)
  }
  // Parçalanmadan yazılmış olası eski değeri de sil.
  await SecureStore.deleteItemAsync(key)
}

const secureStoreAdapter = { getItem, setItem, removeItem }

// ─────────────────────────────────────────────────────────────────────────────
// WEB DEPOSU — SADECE `expo export`'un web hedefi için (gerçek app native'dir)
// ─────────────────────────────────────────────────────────────────────────────
// `expo-secure-store`'un web/Node uygulaması YOKTUR; web statik export'u (SSG) uygulamayı
// Node'da PRERENDER ederken Supabase istemcisi oturumu depodan okumaya çalışır ve SecureStore
// çağrısı `getValueWithKeyAsync is not a function` ile çöker. Bu yüzden storage PLATFORMA
// DUYARLIDIR: native'de SecureStore, web'de `localStorage` (tarayıcı) / bellek (SSG, `window`
// yok). Mobilin GERÇEK yolu (ios/android) her zaman SecureStore'dur; web yalnız bir derleme
// hedefidir.
const memoryStore = new Map<string, string>()
const webStorage = {
  getItem: (key: string): string | null => {
    if (typeof window !== 'undefined' && window.localStorage)
      return window.localStorage.getItem(key)
    return memoryStore.get(key) ?? null
  },
  setItem: (key: string, value: string): void => {
    if (typeof window !== 'undefined' && window.localStorage)
      window.localStorage.setItem(key, value)
    else memoryStore.set(key, value)
  },
  removeItem: (key: string): void => {
    if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(key)
    else memoryStore.delete(key)
  },
}

const authStorage = Platform.OS === 'web' ? webStorage : secureStoreAdapter

// ─────────────────────────────────────────────────────────────────────────────
// FABRİKA — modül seviyesinde TEKİL (referans kararlılığı)
// ─────────────────────────────────────────────────────────────────────────────
// context.tsx başlığındaki kritik kural: Provider'a her render'da YENİ istemci verilirse
// istemciyi bağımlılık dizisinde taşıyan efektler (realtime abonelikleri) çırpınır.
// Web'in fabrikası da modül seviyesinde tekilleştirilmiştir; mobil aynısını yapar.
let mobileClient: SupabaseClient<Database> | null = null

export function createMobileSupabaseClient(): SupabaseClient<Database> {
  if (mobileClient) return mobileClient

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Supabase yapılandırması eksik: EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
        'ayarlanmalı (bkz. apps/mobile/.env.example).'
    )
  }

  mobileClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Mobilde oturum URL'den GELMEZ (web'de OAuth/magic-link redirect'i için gereken
      // `detectSessionInUrl` burada kapatılır; e-posta/şifre akışı buna ihtiyaç duymaz).
      detectSessionInUrl: false,
    },
  })

  return mobileClient
}
