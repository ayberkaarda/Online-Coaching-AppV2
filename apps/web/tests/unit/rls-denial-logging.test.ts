import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A-10 kalanı (bkz. docs/security/AUDIT.md §4c "Kayıtlı borçlar"): RLS reddi (`42501`) hiçbir
// yerde loglanmıyordu. Bu dosya `@repo/api-client/query/queryClient`'teki merkezi
// `QueryCache`/`MutationCache` `onError` kancasının:
//   1) `42501` kodlu bir `SupabaseQueryError`'da GERÇEKTEN `event: 'rls_denied'` logladığını,
//   2) `42501` OLMAYAN hatalarda (23505 unique violation, düz ağ hatası, hatta mesaj metninde
//      tesadüfen "42501" geçen bir hata) logLAMADIĞINI (yanlış pozitif kontrolü),
//   3) kayıtta ham satır verisi / e-posta / sağlık verisi BULUNMADIĞINI,
//   4) mevcut hata akışının (`.message`, dolayısıyla `toast.error` metni) DEĞİŞMEDİĞİNİ
// doğrular.
//
// `vi.mock` hoisting nedeniyle importlardan ÖNCE tanımlanmalı (bkz. security-events.test.ts /
// logger-redact.test.ts'teki aynı desen).
// Faz 4.5 commit 5 (ADR-0024 Ek-2): `security-event.ts` pakete taşındı ve artık
// `@repo/logger`'ı import ediyor; mock hedefi de oraya taşındı.
vi.mock('@repo/logger', async (importOriginal) => {
  const sharedLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn((): typeof sharedLogger => sharedLogger),
  }
  // Paketin geri kalanı (createConsoleLogger/maskForConsole/REDACT_PATHS) korunur; yalnızca
  // hazır `logger` örneği değiştirilir — aksi hâlde `apps/web/src/lib/logger.ts` yüklenemez.
  return { ...(await importOriginal<typeof import('@repo/logger')>()), logger: sharedLogger }
})

import type { Session } from '@supabase/supabase-js'

import { queryKeys } from '@repo/api-client/query/keys'
import { makeQueryClient } from '@repo/api-client/query/queryClient'
import { SupabaseQueryError, wrapSupabaseError } from '@repo/api-client/query/supabase-error'
import { logger } from '@repo/logger'

const warnMock = vi.mocked(logger.warn)

/** Bir warn çağrısının argümanlarını (varsa) düz metne çevirir — sızıntı taraması için. */
function warnCallsAsText(): string {
  return JSON.stringify(warnMock.mock.calls)
}

function rlsDeniedCalls(): Record<string, unknown>[] {
  return warnMock.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .filter((fields) => fields.event === 'rls_denied')
}

function fakeSession(userId: string): Session {
  return { user: { id: userId } } as unknown as Session
}

describe('RLS reddi (42501) merkezi güvenlik olayı loglaması (A-10 kalanı)', () => {
  beforeEach(() => {
    warnMock.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // SupabaseQueryError / wrapSupabaseError — `.code` KORUNUR, `.message` DEĞİŞMEZ
  // -------------------------------------------------------------------------

  describe('SupabaseQueryError', () => {
    it('.message orijinal Supabase hatasıyla BİREBİR aynıdır (mevcut toast metni bozulmaz)', () => {
      const original = { message: 'Kayıt bulunamadı veya erişim reddedildi.', code: '42501' }
      const wrapped = wrapSupabaseError(original, { table: 'daily_logs', op: 'select' })

      expect(wrapped.message).toBe(original.message)
      expect(wrapped).toBeInstanceOf(Error)
    })

    it('.code, .table, .op alanlarını taşır', () => {
      const wrapped = wrapSupabaseError(
        { message: 'insufficient_privilege', code: '42501' },
        { table: 'form_checks', op: 'insert' }
      )
      expect(wrapped.code).toBe('42501')
      expect(wrapped.table).toBe('form_checks')
      expect(wrapped.op).toBe('insert')
    })
  })

  // -------------------------------------------------------------------------
  // 1) 42501 -> GERÇEKTEN loglanır (QueryCache — okuma yolu)
  // -------------------------------------------------------------------------

  it('bir sorgu (query) 42501 ile reddedildiğinde `event: "rls_denied"` warn olarak loglanır', async () => {
    const client = makeQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['test-rls-query'],
        retry: false,
        queryFn: () => {
          throw wrapSupabaseError(
            { message: 'new row violates row-level security policy', code: '42501' },
            { table: 'daily_logs', op: 'select' }
          )
        },
      })
    ).rejects.toThrow()

    const calls = rlsDeniedCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.table).toBe('daily_logs')
    expect(calls[0]?.op).toBe('select')
  })

  // -------------------------------------------------------------------------
  // 2) 42501 -> GERÇEKTEN loglanır (MutationCache — yazma yolu) + userId (varsa)
  // -------------------------------------------------------------------------

  it('bir mutasyon 42501 ile reddedildiğinde loglanır ve önbellekte oturum varsa userId taşınır', async () => {
    const client = makeQueryClient()
    client.setQueryData(queryKeys.session(), fakeSession('user-123'))

    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => {
        throw wrapSupabaseError(
          { message: 'insufficient_privilege', code: '42501' },
          { table: 'form_checks', op: 'insert' }
        )
      },
    })

    await expect(mutation.execute(undefined)).rejects.toThrow()

    const calls = rlsDeniedCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.table).toBe('form_checks')
    expect(calls[0]?.op).toBe('insert')
    expect(calls[0]?.userId).toBe('user-123')
  })

  it('önbellekte oturum YOKSA userId alanı olmadan (patlamadan) loglanır', async () => {
    const client = makeQueryClient()

    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => {
        throw wrapSupabaseError({ message: 'insufficient_privilege', code: '42501' }, {})
      },
    })

    await expect(mutation.execute(undefined)).rejects.toThrow()

    const calls = rlsDeniedCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0]?.userId).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // 3) Yanlış pozitif kontrolü: 42501 DIŞINDAKİ hatalar loglanmaz
  // -------------------------------------------------------------------------

  it('23505 (unique violation) gibi 42501 OLMAYAN bir PostgREST kodu loglanmaz', async () => {
    const client = makeQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['test-unique-violation'],
        retry: false,
        queryFn: () => {
          throw wrapSupabaseError(
            {
              message: 'duplicate key value violates unique constraint "daily_logs_pkey"',
              code: '23505',
            },
            { table: 'daily_logs', op: 'upsert' }
          )
        },
      })
    ).rejects.toThrow()

    expect(rlsDeniedCalls()).toHaveLength(0)
  })

  it('düz bir ağ hatası (Supabase kaynaklı olmayan, .code taşımayan) loglanmaz', async () => {
    const client = makeQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['test-network-error'],
        retry: false,
        queryFn: () => {
          throw new Error('Failed to fetch')
        },
      })
    ).rejects.toThrow()

    expect(rlsDeniedCalls()).toHaveLength(0)
  })

  it('mesaj METNİNDE tesadüfen "42501" geçen ama SupabaseQueryError OLMAYAN bir hata loglanmaz (string eşleşmesi değil, tip kontrolü yapılır)', async () => {
    const client = makeQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['test-string-lookalike'],
        retry: false,
        queryFn: () => {
          throw new Error('hata kodu 42501 metinde geçiyor ama bu SupabaseQueryError değil')
        },
      })
    ).rejects.toThrow()

    expect(rlsDeniedCalls()).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // 4) Kayıtta ham hassas veri BULUNMAZ
  // -------------------------------------------------------------------------

  it('rls_denied kaydında ham satır verisi / e-posta / sağlık verisi YOKTUR', async () => {
    const client = makeQueryClient()
    client.setQueryData(queryKeys.session(), fakeSession('user-abc'))

    const sensitiveMessage =
      'satır: {"email":"danisan@example.com","current_weight":82.5,"notes":"diz sakatligi"}'

    const mutation = client.getMutationCache().build(client, {
      mutationFn: () => {
        throw wrapSupabaseError(
          { message: sensitiveMessage, code: '42501' },
          { table: 'profiles', op: 'update' }
        )
      },
    })

    await expect(mutation.execute(undefined)).rejects.toThrow()

    const calls = rlsDeniedCalls()
    expect(calls).toHaveLength(1)
    // Yalnızca event/table/op/userId alanları geçirilir — ham hata mesajı HİÇ loglanmaz.
    expect(Object.keys(calls[0] ?? {}).sort()).toEqual(['event', 'op', 'table', 'userId'].sort())

    const text = warnCallsAsText()
    expect(text).not.toContain('danisan@example.com')
    expect(text).not.toContain('82.5')
    expect(text).not.toContain('diz sakatligi')
  })

  // -------------------------------------------------------------------------
  // 5) Mevcut hata akışı (kullanıcıya dönen mesaj) DEĞİŞMEDİ
  // -------------------------------------------------------------------------

  it('42501 loglandıktan SONRA bile hata, hook/bileşenin bugün gördüğü .message ile fırlatılmaya devam eder', async () => {
    const client = makeQueryClient()
    const userMessage = 'Kayıt bulunamadı veya bu işlem için yetkiniz yok.'

    let caught: unknown
    try {
      await client.fetchQuery({
        queryKey: ['test-message-unchanged'],
        retry: false,
        queryFn: () => {
          throw wrapSupabaseError({ message: userMessage, code: '42501' }, { table: 'messages' })
        },
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(SupabaseQueryError)
    expect((caught as Error).message).toBe(userMessage)
  })
})
