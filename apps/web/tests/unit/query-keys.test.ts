import { describe, expect, it } from 'vitest'

import { queryKeyRoots, queryKeys } from '@/lib/query/keys'

describe('queryKeys fabrika fonksiyonları', () => {
  it('aynı argümanlarla iki çağrı deterministik (eşit) anahtar üretir', () => {
    expect(queryKeys.profile('u1')).toEqual(queryKeys.profile('u1'))
    expect(queryKeys.dailyLogs('s1')).toEqual(queryKeys.dailyLogs('s1'))
    expect(queryKeys.notifications('u1', { unreadOnly: true, sinceDays: 7 })).toEqual(
      queryKeys.notifications('u1', { unreadOnly: true, sinceDays: 7 })
    )
  })

  it('argümansız çağrılarda null ile doldurur', () => {
    expect(queryKeys.profile()).toEqual(['profile', null])
    expect(queryKeys.workoutPlan()).toEqual(['workout-plan', null])
    expect(queryKeys.dailyLogs()).toEqual(['daily-logs', null])
    expect(queryKeys.notifications()).toEqual(['notifications', null, null])
  })

  it('messages(a,b) yön bağımsızdır: (x,y) ve (y,x) aynı anahtarı verir', () => {
    expect(queryKeys.messages('x', 'y')).toEqual(queryKeys.messages('y', 'x'))
  })

  it('messages argüman verilmezse ["messages", null, null] döner', () => {
    expect(queryKeys.messages()).toEqual(['messages', null, null])
  })

  it('unreadCount anahtarı hem konuşmayı hem bakanı ayırır', () => {
    // Aynı konuşmanın okunmamış sayısı koç ile danışan için FARKLIDIR:
    // anahtar viewerId'yi de taşımazsa iki taraf birbirinin sayacını okur.
    expect(queryKeys.unreadCount('c1', 'coach')).not.toEqual(queryKeys.unreadCount('c1', 'client'))
    expect(queryKeys.unreadCount('c1', 'v1')).toEqual(queryKeys.unreadCount('c1', 'v1'))
    expect(queryKeys.unreadCount()).toEqual(['unread-count', null, null])
  })

  it("unreadCount anahtarı messages anahtarından AYRIDIR (mesaj invalidate'i sayacı süpürmez)", () => {
    expect(queryKeys.unreadCount('c1', 'v1')[0]).not.toBe(queryKeys.messages('c1', 'v1')[0])
  })

  it('farklı kaynaklar için anahtarların ilk elemanı (ön ek) benzersizdir', () => {
    const keys = [
      queryKeys.session(),
      queryKeys.profile(),
      queryKeys.profiles(),
      queryKeys.notifications(),
      queryKeys.formChecks(),
      queryKeys.dailyLogs(),
      queryKeys.workoutLogs(),
      queryKeys.programApprovals(),
      queryKeys.workoutPlan(),
      queryKeys.messages(),
      queryKeys.unreadCount(),
      queryKeys.exercises(),
      queryKeys.foods(),
      queryKeys.lastCheckins(),
      queryKeys.recommendations(),
      queryKeys.coachId(),
    ]
    const prefixes = keys.map((k) => k[0])
    expect(new Set(prefixes).size).toBe(prefixes.length)
  })

  it('queryKeyRoots içindeki her kök, ilgili tam anahtarın ön eki olur', () => {
    expect(queryKeys.session().slice(0, queryKeyRoots.session.length)).toEqual([
      ...queryKeyRoots.session,
    ])
    expect(queryKeys.profile('u1').slice(0, queryKeyRoots.profile.length)).toEqual([
      ...queryKeyRoots.profile,
    ])
    expect(queryKeys.profiles().slice(0, queryKeyRoots.profiles.length)).toEqual([
      ...queryKeyRoots.profiles,
    ])
    expect(
      queryKeys
        .notifications('u1', { unreadOnly: true })
        .slice(0, queryKeyRoots.notifications.length)
    ).toEqual([...queryKeyRoots.notifications])
    expect(queryKeys.formChecks('s1').slice(0, queryKeyRoots.formChecks.length)).toEqual([
      ...queryKeyRoots.formChecks,
    ])
    expect(queryKeys.dailyLogs('s1').slice(0, queryKeyRoots.dailyLogs.length)).toEqual([
      ...queryKeyRoots.dailyLogs,
    ])
    expect(queryKeys.workoutLogs('s1').slice(0, queryKeyRoots.workoutLogs.length)).toEqual([
      ...queryKeyRoots.workoutLogs,
    ])
    expect(
      queryKeys.programApprovals('s1').slice(0, queryKeyRoots.programApprovals.length)
    ).toEqual([...queryKeyRoots.programApprovals])
    expect(queryKeys.workoutPlan('s1').slice(0, queryKeyRoots.workoutPlan.length)).toEqual([
      ...queryKeyRoots.workoutPlan,
    ])
    expect(queryKeys.messages('a', 'b').slice(0, queryKeyRoots.messages.length)).toEqual([
      ...queryKeyRoots.messages,
    ])
    expect(queryKeys.unreadCount('c1', 'v1').slice(0, queryKeyRoots.unreadCount.length)).toEqual([
      ...queryKeyRoots.unreadCount,
    ])
    expect(queryKeys.exercises().slice(0, queryKeyRoots.exercises.length)).toEqual([
      ...queryKeyRoots.exercises,
    ])
    expect(queryKeys.foods().slice(0, queryKeyRoots.foods.length)).toEqual([...queryKeyRoots.foods])
    expect(queryKeys.lastCheckins().slice(0, queryKeyRoots.lastCheckins.length)).toEqual([
      ...queryKeyRoots.lastCheckins,
    ])
    expect(queryKeys.recommendations('s1').slice(0, queryKeyRoots.recommendations.length)).toEqual([
      ...queryKeyRoots.recommendations,
    ])
    expect(queryKeys.coachId().slice(0, queryKeyRoots.coachId.length)).toEqual([
      ...queryKeyRoots.coachId,
    ])
  })
})
