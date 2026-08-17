// `useMessages.ts` içindeki SAF konuşma-anahtarı mantığının birim testleri.
//
// Faz 1b Adım 4'te realtime aboneliği sunucu tarafında filtrelenmeye başladı
// (`postgres_changes` + `filter: client_id=eq.<id>`). Filtreye verilecek değeri
// üreten karar — "bu sohbetin danışan tarafı kim?" — hook'un içinde gömülü
// kalsaydı test edilemezdi; bu yüzden saf bir fonksiyona
// (`resolveConversationClientId`) çıkarıldı ve burada doğrudan test ediliyor.
//
// YANLIŞ BİR DEĞER SESSİZ DEĞİL, GÖRÜNÜR HATADIR: fonksiyon tahmin yürütmez,
// çözemediği durumda `undefined` döner -> hook abone olmaz / gönderim hata verir.
// Sunucu tarafında da `messages_apply_conversation_key` trigger'ı aynı kuralı
// zorlar (bkz. supabase/migrations/20260817140000_messages_conversation_key.sql).

import { describe, expect, it } from 'vitest'

import { resolveConversationClientId } from '@/hooks/useMessages'

const COACH = '11111111-1111-1111-1111-111111111111'
const CLIENT_A = '22222222-2222-2222-2222-222222222222'
const CLIENT_B = '33333333-3333-3333-3333-333333333333'

describe('resolveConversationClientId', () => {
  it('danışan bakış açısı: (danışan, koç) -> danışan', () => {
    expect(resolveConversationClientId(CLIENT_A, COACH, COACH)).toBe(CLIENT_A)
  })

  it('koç bakış açısı: (koç, danışan) -> danışan', () => {
    expect(resolveConversationClientId(COACH, CLIENT_A, COACH)).toBe(CLIENT_A)
  })

  it('yön bağımsızdır: (a,b) ve (b,a) aynı anahtarı verir', () => {
    expect(resolveConversationClientId(CLIENT_B, COACH, COACH)).toBe(
      resolveConversationClientId(COACH, CLIENT_B, COACH)
    )
  })

  it('koç kimliği bilinmiyorsa (null/undefined) undefined döner — tahmin yürütmez', () => {
    expect(resolveConversationClientId(CLIENT_A, COACH, null)).toBeUndefined()
    expect(resolveConversationClientId(CLIENT_A, COACH, undefined)).toBeUndefined()
  })

  it('taraflardan biri eksikse undefined döner', () => {
    expect(resolveConversationClientId(undefined, COACH, COACH)).toBeUndefined()
    expect(resolveConversationClientId(CLIENT_A, undefined, COACH)).toBeUndefined()
    expect(resolveConversationClientId(undefined, undefined, COACH)).toBeUndefined()
  })

  it('iki taraf da koç ise (koçun kendisiyle sohbeti) undefined döner', () => {
    expect(resolveConversationClientId(COACH, COACH, COACH)).toBeUndefined()
  })

  it('hiçbir taraf koç değilse (danışan <-> danışan) undefined döner', () => {
    // Ürün böyle bir sohbeti desteklemiyor; sunucudaki trigger da 22023 ile reddeder.
    expect(resolveConversationClientId(CLIENT_A, CLIENT_B, COACH)).toBeUndefined()
  })

  it('boş string kimlikler geçerli sayılmaz', () => {
    expect(resolveConversationClientId('', COACH, COACH)).toBeUndefined()
    expect(resolveConversationClientId(CLIENT_A, COACH, '')).toBeUndefined()
  })
})
