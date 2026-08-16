// Supabase katmanının istemci-güvenli giriş noktası.
// DİKKAT: `server.ts` BİLEREK re-export EDİLMEZ —
// aksi hâlde `server-only` modüller client bundle'a sızar.
// `admin.ts` (service-role istemcisi) ölü kod olarak kaldırıldı; Faz 2'de
// koç → danışan hesap oluşturma akışıyla birlikte geri gelecek.

export * from './client'
