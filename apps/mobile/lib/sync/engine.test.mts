// Outbox motoru birim testi — op→fn eşlemesi + FIFO stop-on-failure. Tur 2 C4.
//
// NEDEN `.mts` (`.ts` DEĞİL): mobil `tsconfig.json` include'ı `**/*.ts`'tir ve
// `.mts`'yi KAPSAMAZ (B-057: tsconfig'e dokunulamaz) — böylece `node:test`/
// `node:assert` içe aktarımları `mobile:type-check`'i @types/node gerektirmeden
// bozmaz. expo-sqlite native olduğu için KUYRUK DEPOSU mock'lanır; test yalnızca
// `engine.ts`'in SAF mantığını (yalnız tip import'ları, runtime'da native yük yok)
// doğrular. Çalıştır: `node --test apps/mobile/lib/sync/engine.test.mts`.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dispatchItem, flushQueue, type OpHandlers } from './engine.ts'

// Supabase istemcisi yalnızca handler'lara AKTARILIR (motor onu kullanmaz) —
// kimlik olarak bir sentinel yeterli.
const fakeSupabase = { __sentinel: 'supabase' } as never

/** Çağrıları kaydeden mock handler seti. */
function makeSpyHandlers() {
  const calls: Array<{ op: string; payload: unknown }> = []
  const handlers: OpHandlers = {
    create_session: async (_s, payload) => {
      calls.push({ op: 'create_session', payload })
    },
    create_set: async (_s, payload) => {
      calls.push({ op: 'create_set', payload })
    },
    complete_session: async (_s, payload) => {
      calls.push({ op: 'complete_session', payload })
    },
  }
  return { calls, handlers }
}

test('dispatchItem her opu dogru handlera yonlendirir ve payloadu JSON.parse eder', async () => {
  const { calls, handlers } = makeSpyHandlers()

  await dispatchItem(fakeSupabase, { op: 'create_set', payload: '{"reps":10}' }, handlers)
  await dispatchItem(fakeSupabase, { op: 'create_session', payload: '{"id":"s1"}' }, handlers)
  await dispatchItem(fakeSupabase, { op: 'complete_session', payload: '{"id":"s1"}' }, handlers)

  assert.deepEqual(calls, [
    { op: 'create_set', payload: { reps: 10 } },
    { op: 'create_session', payload: { id: 's1' } },
    { op: 'complete_session', payload: { id: 's1' } },
  ])
})

test('dispatchItem bilinmeyen opta hata firlatir', async () => {
  const { handlers } = makeSpyHandlers()
  await assert.rejects(
    () => dispatchItem(fakeSupabase, { op: 'nope' as never, payload: '{}' }, handlers),
    /Bilinmeyen sync op/
  )
})

test('flushQueue FIFO işler, hepsini markSynced eder', async () => {
  const { handlers } = makeSpyHandlers()
  const processed: number[] = []
  const synced: number[] = []
  const items = [
    {
      id: 1,
      op: 'create_session' as const,
      payload: '{"id":"s1"}',
      client_mutation_id: null,
      status: 'pending',
      attempt_count: 0,
      created_at: 't',
    },
    {
      id: 2,
      op: 'create_set' as const,
      payload: '{"reps":5}',
      client_mutation_id: 'm2',
      status: 'pending',
      attempt_count: 0,
      created_at: 't',
    },
  ]
  const result = await flushQueue(fakeSupabase, {
    pendingItems: () => items,
    markSynced: (id) => {
      synced.push(id)
    },
    markFailed: (id) => {
      processed.push(id)
    },
    handlers,
  })

  assert.deepEqual(synced, [1, 2]) // id ASC sırasıyla
  assert.equal(result.synced, 2)
  assert.equal(result.remaining, 0)
  assert.equal(result.failed, false)
})

test('flushQueue ilk hatada DURUR (FIFO), kalanı işlemez, markFailed eder', async () => {
  const failingHandlers: OpHandlers = {
    create_session: async () => {
      throw new Error('offline')
    },
    create_set: async () => {
      throw new Error('should-not-run')
    },
    complete_session: async () => {},
  }
  const synced: number[] = []
  const failed: number[] = []
  const items = [
    {
      id: 1,
      op: 'create_session' as const,
      payload: '{}',
      client_mutation_id: null,
      status: 'pending',
      attempt_count: 0,
      created_at: 't',
    },
    {
      id: 2,
      op: 'create_set' as const,
      payload: '{}',
      client_mutation_id: null,
      status: 'pending',
      attempt_count: 0,
      created_at: 't',
    },
  ]
  const result = await flushQueue(fakeSupabase, {
    pendingItems: () => items,
    markSynced: (id) => {
      synced.push(id)
    },
    markFailed: (id) => {
      failed.push(id)
    },
    handlers: failingHandlers,
  })

  assert.deepEqual(synced, []) // hiçbiri geçmedi
  assert.deepEqual(failed, [1]) // yalnız ilk öğe denendi ve fail'lendi
  assert.equal(result.synced, 0)
  assert.equal(result.remaining, 2) // 2 öğe hâlâ pending
  assert.equal(result.failed, true)
})
