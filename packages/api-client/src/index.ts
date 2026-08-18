// `@repo/api-client`'ın ana giriş noktası.
//
// Bugüne kadar `apps/web` bu yüzeyi `@/hooks` barrel'ı üzerinden tüketiyordu; buraya
// enjeksiyon sağlayıcısı (`SupabaseClientProvider`/`useSupabaseClient`) da eklendi.
// Alt modüller (storage, query key'leri, AI istemcisi, doğrulama) `exports` haritasındaki
// alt yollardan ayrıca erişilebilir — bkz. package.json.

export * from './context'
export * from './hooks'
export * from './unwrap'
