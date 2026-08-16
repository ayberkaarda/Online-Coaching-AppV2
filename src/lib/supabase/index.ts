// Supabase katmanının istemci-güvenli giriş noktası.
// DİKKAT: `server.ts` ve `admin.ts` BİLEREK re-export EDİLMEZ —
// aksi hâlde `server-only` modülleri client bundle'a sızar.

export * from './client'
