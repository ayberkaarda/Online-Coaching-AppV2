import { describe, expect, it } from 'vitest'

import {
  APP_POSE_PATH_RE,
  E2E_MARKER,
  GUARD_TABLES,
  OUT_OF_SCOPE,
  STORAGE_RULES,
  TABLE_RULES,
  collectReferencedPaths,
  containsMarker,
  diffGuardCounts,
  findOrphanObjects,
  isLocalTarget,
  orderTablesForDelete,
  parseArgs,
  selectRows,
  startsWithMarker,
} from '../../scripts/clean-e2e-data.mjs'

// `scripts/clean-e2e-data.mjs`'in SAF çekirdeğini test eder — ne dosya sistemine
// ne veritabanına dokunulur; tüm "satırlar" bellekte kurulmuş nesnelerdir.
//
// EN KRİTİK TEST: `seed satırları ASLA seçilmez`. Aşağıdaki SEED_ROWS fixture'ı
// `supabase/seed.sql`'den ve o seed'in ürettiği CANLI veritabanı satırlarından
// birebir kopyalanmıştır (tahmin yürütülmedi). Ölçüt bir gün genişletilirse ve
// seed'e değmeye başlarsa bu test kırmızı verir.

const CLIENT1 = '22222222-2222-2222-2222-222222222222'
const CLIENT2 = '33333333-3333-3333-3333-333333333333'

const ruleFor = (table: string) => {
  const rule = TABLE_RULES.find((r) => r.table === table)
  if (!rule) throw new Error(`Kural bulunamadı: ${table}`)
  return rule
}

// ---------------------------------------------------------------------------
// SEED FIXTURE — supabase/seed.sql'in ürettiği satırlar (birebir)
// ---------------------------------------------------------------------------

const SEED_ROWS: Record<string, Record<string, unknown>[]> = {
  workout_logs: [
    { id: 's1', client_id: CLIENT1, exercise_name: 'Bench Press', weight_kg: 70, reps: 8 },
    { id: 's2', client_id: CLIENT1, exercise_name: 'Squat', weight_kg: 100, reps: 6 },
    { id: 's3', client_id: CLIENT2, exercise_name: 'Lateral Raise', weight_kg: 8, reps: 15 },
    { id: 's4', client_id: CLIENT2, exercise_name: 'Barbell Curl', weight_kg: 20, reps: 12 },
  ],
  // Seed bu tabloya HİÇ satır yazmaz — boş fixture bilinçlidir.
  nutrition_logs: [],
  progress_photos: [],
  progress_entries: [],
  messages: [
    {
      id: 's5',
      client_id: CLIENT1,
      kind: 'user',
      message: 'Merhaba koç, bu hafta dizimde hafif bir rahatsızlık var. Squat’ı değiştirelim mi?',
    },
    {
      id: 's6',
      client_id: CLIENT1,
      kind: 'user',
      message: 'Merhaba Ahmet. Bu hafta squat yerine leg press yapalım, ağırlığı %20 düşür.',
    },
    {
      id: 's7',
      client_id: CLIENT2,
      kind: 'user',
      message: 'Süper. Cumartesi form check fotoğraflarını bekliyorum.',
    },
  ],
  notifications: [
    {
      id: 's8',
      client_id: CLIENT1,
      title: 'Haftalık Form Check Hatırlatması',
      message: 'Bu haftanın poz fotoğraflarını ve kilonu yüklemeyi unutma.',
    },
    {
      id: 's9',
      client_id: CLIENT1,
      title: null,
      message: '✅ Koçun yeni antrenman programını onayladı! Artık kullanabilirsin.',
    },
    {
      id: 's10',
      client_id: CLIENT2,
      title: 'Beslenme Planı Yenilendi',
      message: 'Kalori hedefi 2200 kcal olarak güncellendi.',
    },
  ],
  form_checks: [
    {
      id: 's11',
      client_id: CLIENT1,
      current_weight: 92.4,
      front_pose_path: `poses/${CLIENT1}-w1-front.jpg`,
      back_pose_path: `poses/${CLIENT1}-w1-back.jpg`,
      status: 'reviewed',
      coach_feedback:
        'Duruş genel olarak iyi. Bu hafta kardiyoyu 3 güne çıkaralım, ağırlıklara dokunma.',
    },
    {
      id: 's12',
      client_id: CLIENT1,
      current_weight: 88.65,
      front_pose_path: `poses/${CLIENT1}-w6-front.jpg`,
      back_pose_path: null,
      status: 'pending',
      coach_feedback: null,
    },
    {
      id: 's13',
      client_id: CLIENT2,
      current_weight: 64.0,
      front_pose_path: `poses/${CLIENT2}-w6-front.jpg`,
      back_pose_path: null,
      status: 'pending',
      coach_feedback: null,
    },
  ],
  program_approvals: [
    {
      id: 's14',
      client_id: CLIENT1,
      status: 'pending',
      workout_data: {
        Pazartesi: '1. Bench Press - 4x8\n2. Incline Dumbbell Press - 3x10',
        Çarşamba: 'Dinlenme',
        Pazar: 'Dinlenme',
      },
    },
    {
      id: 's15',
      client_id: CLIENT2,
      status: 'pending',
      workout_data: {
        Pazartesi: '1. Squat - 5x5\n2. Hip Thrust - 4x10',
        Cuma: '1. Front Squat - 4x8\n2. Lunge - 3x12',
      },
    },
  ],
}

// ---------------------------------------------------------------------------
// E2E FIXTURE — canlı veritabanından kopyalanmış GERÇEK artık satırlar
// ---------------------------------------------------------------------------

const E2E_ROWS: Record<string, Record<string, unknown>[]> = {
  workout_logs: [
    { id: 'e1', client_id: CLIENT1, exercise_name: 'E2E Gym 858176019', weight_kg: 40, reps: 5 },
    { id: 'e2', client_id: CLIENT1, exercise_name: 'E2E Gym 858176019', weight_kg: 42.5, reps: 5 },
  ],
  nutrition_logs: [
    {
      id: 'e3',
      client_id: CLIENT1,
      log_date: '2026-08-17',
      description: 'E2E Öğün 1809',
      kcal: 400,
    },
    {
      id: 'e4',
      client_id: CLIENT1,
      log_date: '2026-08-17',
      description: 'E2E Öğün 1929',
      kcal: 400,
    },
  ],
  progress_photos: [
    { id: 'e5', client_id: CLIENT1, taken_on: '2026-08-17', angle: 'front', photo_path: 'x/y.png' },
  ],
  progress_entries: [
    { id: 'e6', client_id: CLIENT1, entry_date: '2026-08-18', weight_kg: 76.5, notes: null },
  ],
  messages: [
    { id: 'e7', client_id: CLIENT1, kind: 'user', message: 'E2E mesaj 81151682' },
    { id: 'e8', client_id: CLIENT1, kind: 'user', message: 'E2E yanit 243654353' },
    {
      id: 'e9',
      client_id: CLIENT1,
      kind: 'system',
      // Uygulamanın TÜRETTİĞİ satır: E2E metni ARAYA gömülür, önek değildir.
      message: 'Koçunuz form check\'inize geri bildirim yazdı: "E2E geri bildirim 567885892"',
    },
  ],
  notifications: [
    {
      id: 'e10',
      client_id: CLIENT1,
      title: 'Form Check İncelendi',
      message: 'Koçunuz form check\'inize geri bildirim yazdı: "E2E geri bildirim 567885892"',
    },
  ],
  form_checks: [
    {
      id: 'e11',
      client_id: CLIENT1,
      current_weight: 148.6,
      front_pose_path: `poses/${CLIENT1}-9fbb588e-065d-411e-9970-2ec382411d65.png`,
      back_pose_path: null,
      status: 'reviewed',
      coach_feedback: 'E2E geri bildirim 567885892',
    },
    {
      // YARIM KALMIŞ koşu: metin işareti YOK, yalnızca uygulama yolu var.
      id: 'e12',
      client_id: CLIENT1,
      current_weight: 316.6,
      front_pose_path: `poses/${CLIENT1}-98167dcb-92ed-471e-beb4-bef07597bf3c.png`,
      back_pose_path: null,
      status: 'pending',
      coach_feedback: null,
    },
  ],
  program_approvals: [
    {
      id: 'e13',
      client_id: CLIENT2,
      status: 'approved',
      workout_data: { Cuma: 'E2E Onay 749451055', Pazar: 'Dinlenme' },
    },
  ],
}

// ---------------------------------------------------------------------------
// 1) EN KRİTİK: seed satırları ASLA seçilmez
// ---------------------------------------------------------------------------

describe('seed koruması', () => {
  it('hiçbir kural hiçbir seed satırını seçmez', () => {
    for (const rule of TABLE_RULES) {
      const seedRows = SEED_ROWS[rule.table] ?? []
      const { matched } = selectRows(rule, seedRows)
      expect(
        matched.map((row) => row.id),
        `${rule.table} kuralı seed satırı seçti`
      ).toEqual([])
    }
  })

  it('SEED_ROWS fixture her kapsam içi tablo için tanımlıdır (unutulan tablo kalmasın)', () => {
    for (const rule of TABLE_RULES) {
      expect(SEED_ROWS, `${rule.table} için seed fixture yok`).toHaveProperty(rule.table)
    }
  })

  it('seed poz yolu uygulama biçimiyle KARIŞMAZ', () => {
    expect(APP_POSE_PATH_RE.test(`poses/${CLIENT1}-w1-front.jpg`)).toBe(false)
    expect(APP_POSE_PATH_RE.test(`poses/${CLIENT1}-w6-back.jpg`)).toBe(false)
    expect(APP_POSE_PATH_RE.test(`poses/${CLIENT1}-9fbb588e-065d-411e-9970-2ec382411d65.png`)).toBe(
      true
    )
  })

  it('seed metinleri E2E işaretini taşımaz', () => {
    for (const rows of Object.values(SEED_ROWS)) {
      for (const row of rows) {
        for (const value of Object.values(row)) {
          if (typeof value === 'string') expect(value.includes(E2E_MARKER)).toBe(false)
        }
      }
    }
  })

  it('koruma sayaçları seed/katalog tablolarını kapsar ve hiçbiri silme kapsamında değildir', () => {
    const deletable = new Set(TABLE_RULES.map((r) => r.table))
    for (const table of GUARD_TABLES) expect(deletable.has(table)).toBe(false)
    expect(GUARD_TABLES).toContain('profiles')
    expect(GUARD_TABLES).toContain('exercises')
    expect(GUARD_TABLES).toContain('food_database')
  })
})

// ---------------------------------------------------------------------------
// 2) Ölçüt doğru kayıtları seçiyor
// ---------------------------------------------------------------------------

describe('ölçütler', () => {
  it('her kural kendi tablosundaki TÜM E2E artığını seçer', () => {
    for (const rule of TABLE_RULES) {
      const e2eRows = E2E_ROWS[rule.table] ?? []
      const { matched } = selectRows(rule, e2eRows)
      expect(
        matched.map((row) => row.id),
        `${rule.table} kuralı bazı E2E satırlarını kaçırdı`
      ).toEqual(e2eRows.map((row) => row.id))
    }
  })

  it('karışık listede yalnızca E2E satırları seçilir', () => {
    for (const rule of TABLE_RULES) {
      const seedRows = SEED_ROWS[rule.table] ?? []
      const e2eRows = E2E_ROWS[rule.table] ?? []
      // Seed ve E2E satırlarını içiçe geçirerek sıraya bağlılığı da eleriz.
      const mixed = [...seedRows, ...e2eRows].sort((a, b) =>
        String(a.id).localeCompare(String(b.id))
      )
      const { matched, skipped } = selectRows(rule, mixed)
      expect(new Set(matched.map((r) => r.id))).toEqual(new Set(e2eRows.map((r) => r.id)))
      expect(new Set(skipped.map((r) => r.id))).toEqual(new Set(seedRows.map((r) => r.id)))
    }
  })

  it('sistem mesajı gömülü E2E metnini yakalar (önek ölçütü YETMEZ)', () => {
    const embedded = 'Koçunuz form check\'inize geri bildirim yazdı: "E2E geri bildirim 1"'
    expect(startsWithMarker(embedded)).toBe(false)
    expect(containsMarker(embedded)).toBe(true)
    expect(ruleFor('messages').match({ kind: 'system', message: embedded })).toBe(true)
  })

  it('işaretsiz onay bildirimi BİLEREK seçilmez (belirsizlikte silme)', () => {
    const unmarked = {
      title: null,
      message: 'Koçun yeni antrenman programını onayladı. Artık kullanabilirsin.',
    }
    expect(ruleFor('notifications').match(unmarked)).toBe(false)
  })

  it('null/undefined alanlar yüklemleri patlatmaz', () => {
    for (const rule of TABLE_RULES) {
      expect(() => rule.match({})).not.toThrow()
    }
    expect(startsWithMarker(null)).toBe(false)
    expect(containsMarker(undefined)).toBe(false)
    expect(startsWithMarker(123)).toBe(false)
  })

  it('kapsam dışı tablolar hiçbir silme kuralında yer almaz', () => {
    const deletable = new Set(TABLE_RULES.map((r) => r.table))
    expect(deletable.has('daily_logs')).toBe(false)
    expect(deletable.has('workout_plans')).toBe(false)
    expect(deletable.has('workout_plan_exercises')).toBe(false)
    expect(deletable.has('nutrition_plans')).toBe(false)
    expect(deletable.has('nutrition_plan_meals')).toBe(false)
    expect(deletable.has('profiles')).toBe(false)
    // Ve her biri gerekçesiyle raporlanır.
    expect(OUT_OF_SCOPE.length).toBeGreaterThan(0)
    for (const entry of OUT_OF_SCOPE) expect(entry.reason.length).toBeGreaterThan(20)
  })
})

// ---------------------------------------------------------------------------
// 3) FK sırası
// ---------------------------------------------------------------------------

describe('FK silme sırası', () => {
  it('çocuk tablo her zaman ebeveyninden ÖNCE gelir', () => {
    const rules = [
      { table: 'parent', dependsOn: [] },
      { table: 'child', dependsOn: ['parent'] },
      { table: 'grandchild', dependsOn: ['child'] },
    ]
    const order = orderTablesForDelete(rules).map((r) => r.table)
    expect(order.indexOf('grandchild')).toBeLessThan(order.indexOf('child'))
    expect(order.indexOf('child')).toBeLessThan(order.indexOf('parent'))
  })

  it('bildirim sırası ters olsa bile doğru sıralar', () => {
    const rules = [
      { table: 'grandchild', dependsOn: ['child'] },
      { table: 'child', dependsOn: ['parent'] },
      { table: 'parent', dependsOn: [] },
    ]
    expect(orderTablesForDelete(rules).map((r) => r.table)).toEqual([
      'grandchild',
      'child',
      'parent',
    ])
  })

  it('kapsam dışı ebeveyn (profiles) sıralamayı etkilemez ve tüm kurallar korunur', () => {
    const order = orderTablesForDelete(TABLE_RULES)
    expect(order).toHaveLength(TABLE_RULES.length)
    expect(new Set(order.map((r) => r.table))).toEqual(new Set(TABLE_RULES.map((r) => r.table)))
  })

  it('döngüsel FK grafiğinde hata fırlatır (sessizce yanlış sıralamaz)', () => {
    const cyclic = [
      { table: 'a', dependsOn: ['b'] },
      { table: 'b', dependsOn: ['a'] },
    ]
    expect(() => orderTablesForDelete(cyclic)).toThrow(/döngü/)
  })

  it('gerçek kural setinde workout_logs, plan tablosuna bağımlılığını ilan eder', () => {
    // workout_logs.plan_exercise_id -> workout_plan_exercises (ON DELETE SET NULL)
    expect(ruleFor('workout_logs').dependsOn).toContain('workout_plan_exercises')
  })
})

// ---------------------------------------------------------------------------
// 4) Dry-run varsayılanı
// ---------------------------------------------------------------------------

describe('CLI argümanları / dry-run varsayılanı', () => {
  it('bayraksız çağrı SİLMEZ (apply = false)', () => {
    expect(parseArgs([]).opts?.apply).toBe(false)
  })

  it('--dry-run varsayılanı değiştirmez', () => {
    expect(parseArgs(['--dry-run']).opts?.apply).toBe(false)
  })

  it('yalnızca --yes / --confirm silmeyi açar', () => {
    expect(parseArgs(['--yes']).opts?.apply).toBe(true)
    expect(parseArgs(['--confirm']).opts?.apply).toBe(true)
  })

  it('--skip-storage ve --quiet ayrıştırılır', () => {
    const { opts } = parseArgs(['--yes', '--skip-storage', '--quiet'])
    expect(opts).toMatchObject({ apply: true, skipStorage: true, quiet: true })
  })

  it('bilinmeyen seçenek hata döndürür (sessizce yok sayılmaz)', () => {
    expect(parseArgs(['--force']).error).toMatch(/Bilinmeyen seçenek/)
    // Yazım hatası ("--y") KAZAYLA silmeyi açmamalı.
    expect(parseArgs(['--y']).opts).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// 5) Yerel-olmayan hedef reddi
// ---------------------------------------------------------------------------

describe('yerel hedef koruması', () => {
  it('yerel hedefleri kabul eder', () => {
    expect(isLocalTarget('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalTarget('http://localhost:54321')).toBe(true)
    expect(isLocalTarget('http://LOCALHOST:54321')).toBe(true)
    expect(isLocalTarget('http://[::1]:54321')).toBe(true)
    expect(isLocalTarget('https://127.0.0.1:54321')).toBe(true)
  })

  it('barındırılan/uzak hedefleri REDDEDER', () => {
    expect(isLocalTarget('https://abcdefghijklm.supabase.co')).toBe(false)
    expect(isLocalTarget('https://db.abcdefghijklm.supabase.co')).toBe(false)
    expect(isLocalTarget('https://example.com')).toBe(false)
  })

  it('yerel gibi GÖRÜNEN ama olmayan host adlarını reddeder', () => {
    // Klasik kandırma denemeleri: alt dize eşleşmesi YETERSİZ olurdu.
    expect(isLocalTarget('https://localhost.evil.com')).toBe(false)
    expect(isLocalTarget('https://127.0.0.1.evil.com')).toBe(false)
    expect(isLocalTarget('https://notlocalhost')).toBe(false)
    expect(isLocalTarget('https://evil.com/?x=http://127.0.0.1')).toBe(false)
    expect(isLocalTarget('https://evil.com#127.0.0.1')).toBe(false)
    expect(isLocalTarget('https://user:pass@127.0.0.1@evil.com')).toBe(false)
  })

  it('tanımsız/bozuk/desteklenmeyen değerleri reddeder (fail-closed)', () => {
    expect(isLocalTarget(undefined)).toBe(false)
    expect(isLocalTarget('')).toBe(false)
    expect(isLocalTarget('   ')).toBe(false)
    expect(isLocalTarget('127.0.0.1:54321')).toBe(false) // şema yok -> ayrıştırılamaz
    expect(isLocalTarget('postgres://postgres@127.0.0.1:54322/postgres')).toBe(false)
    expect(isLocalTarget('file:///etc/passwd')).toBe(false)
    expect(isLocalTarget(42)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 6) Storage yetim süpürme
// ---------------------------------------------------------------------------

describe('storage yetim süpürme', () => {
  it('hayatta kalan satırın işaret ettiği dosyaya DOKUNMAZ', () => {
    const objects = [
      `poses/${CLIENT1}-w1-front.jpg`,
      `poses/${CLIENT1}-9fbb588e-065d-411e-9970-2ec382411d65.png`,
    ]
    const referenced = new Set([`poses/${CLIENT1}-w1-front.jpg`])
    expect(findOrphanObjects(objects, referenced)).toEqual([
      `poses/${CLIENT1}-9fbb588e-065d-411e-9970-2ec382411d65.png`,
    ])
  })

  it('referans yoksa hepsi yetimdir; nesne yoksa sonuç boştur', () => {
    expect(findOrphanObjects(['a.png', 'b.png'], [])).toEqual(['a.png', 'b.png'])
    expect(findOrphanObjects([], ['a.png'])).toEqual([])
  })

  it('silinecek satırların referansları KORUNMAZ (dry-run ile gerçek koşu sapmaz)', () => {
    const rows = [
      { id: 'keep', front_pose_path: 'poses/seed.jpg', back_pose_path: null },
      { id: 'drop', front_pose_path: 'poses/e2e.png', back_pose_path: 'poses/e2e-back.png' },
    ]
    const columns = ['front_pose_path', 'back_pose_path']

    // Dışlama olmadan (naif dry-run) E2E dosyası "hâlâ referanslı" görünür...
    expect(collectReferencedPaths(rows, columns)).toEqual(
      new Set(['poses/seed.jpg', 'poses/e2e.png', 'poses/e2e-back.png'])
    )
    // ...silinecek satır dışlanınca yalnızca seed dosyası korunur.
    const surviving = collectReferencedPaths(rows, columns, ['drop'])
    expect(surviving).toEqual(new Set(['poses/seed.jpg']))
    expect(findOrphanObjects(['poses/seed.jpg', 'poses/e2e.png'], surviving)).toEqual([
      'poses/e2e.png',
    ])
  })

  it('null / boş yol değerleri referans kümesine girmez', () => {
    expect(
      collectReferencedPaths(
        [
          { id: 'a', attachment_path: null },
          { id: 'b', attachment_path: '' },
        ],
        ['attachment_path']
      )
    ).toEqual(new Set())
  })

  it('avatars bucket KAPSAM DIŞIDIR', () => {
    expect(STORAGE_RULES.map((r) => r.bucket)).not.toContain('avatars')
    expect(STORAGE_RULES.map((r) => r.bucket)).toEqual([
      'form-checks-media',
      'progress-photos',
      'message-attachments',
    ])
  })
})

// ---------------------------------------------------------------------------
// 7) Koruma sayacı farkı
// ---------------------------------------------------------------------------

describe('koruma sayaçları', () => {
  it('sayılar aynıysa fark yoktur', () => {
    expect(
      diffGuardCounts({ profiles: 3, exercises: 1328 }, { profiles: 3, exercises: 1328 })
    ).toEqual([])
  })

  it('bir sayaç düşerse bunu bildirir', () => {
    expect(
      diffGuardCounts({ profiles: 3, exercises: 1328 }, { profiles: 3, exercises: 1327 })
    ).toEqual([{ table: 'exercises', before: 1328, after: 1327 }])
  })

  it('eksik sayaç da sapma sayılır (sessizce geçilmez)', () => {
    expect(diffGuardCounts({ profiles: 3 }, {})).toEqual([
      { table: 'profiles', before: 3, after: undefined },
    ])
  })
})
