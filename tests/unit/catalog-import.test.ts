import { describe, expect, it } from 'vitest'

import {
  chunk,
  nullIfEmpty,
  parseCsv,
  repairEncoding,
  SOURCES,
  toRecords,
  transformRecords,
} from '../../scripts/import-catalog.mjs'

// Faz 1.7 katalog import borç temizliği: bu dosya scripts/import-catalog.mjs'in
// dışa aktardığı SAF ayrıştırma/dönüştürme fonksiyonlarını test eder — dosya
// sistemine ve Supabase'e hiç dokunulmaz.

describe('import-catalog — parseCsv', () => {
  it('basit virgülle ayrılmış satırları ayrıştırır', () => {
    const rows = parseCsv('name,value\na,1\nb,2\n')
    expect(rows).toEqual([
      ['name', 'value'],
      ['a', '1'],
      ['b', '2'],
    ])
  })

  it('tırnaklı alan içindeki virgülü korur', () => {
    const rows = parseCsv('name,note\n"Tavuk, Göğsü",ok\n')
    expect(rows).toEqual([
      ['name', 'note'],
      ['Tavuk, Göğsü', 'ok'],
    ])
  })

  it('kaçırılmış çift tırnağı ("") tek tırnağa çevirir', () => {
    const rows = parseCsv('name\n"45"" side bend"\n')
    expect(rows).toEqual([['name'], ['45" side bend']])
  })

  it('\\r\\n ve \\n satır sonlarını aynı şekilde işler', () => {
    const rows = parseCsv('a,b\r\n1,2\n3,4\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('baştaki BOM karakterini atar', () => {
    const rows = parseCsv('﻿name\nx\n')
    expect(rows[0]).toEqual(['name'])
  })

  it('tamamen boş satırları atlar', () => {
    const rows = parseCsv('name\na\n\nb\n')
    expect(rows).toEqual([['name'], ['a'], ['b']])
  })
})

describe('import-catalog — toRecords', () => {
  it('başlık satırını küçük harfe çevirir ve satırları nesneye çevirir', () => {
    const { header, records } = toRecords([
      ['Name', 'Calories_Per_100g'],
      ['Elma', '52'],
    ])
    expect(header).toEqual(['name', 'calories_per_100g'])
    expect(records).toEqual([{ name: 'Elma', calories_per_100g: '52' }])
  })

  it('boş girdi için boş header/records döner', () => {
    expect(toRecords([])).toEqual({ header: [], records: [] })
  })

  it('eksik hücreleri boş string ile doldurur', () => {
    const { records } = toRecords([
      ['name', 'body_part'],
      ['Squat'], // body_part hücresi eksik
    ])
    expect(records).toEqual([{ name: 'Squat', body_part: '' }])
  })
})

describe('import-catalog — repairEncoding (mojibake onarımı)', () => {
  it('CP1251 çözümlemesiyle bozulmuş "в°" dizisini "°" olarak onarır', () => {
    expect(repairEncoding('sled 45в° calf press')).toBe('sled 45° calf press')
  })

  it('temiz Türkçe metni DEĞİŞTİRMEDEN bırakır', () => {
    expect(repairEncoding('Tavuk Göğsü (haşlanmış)')).toBe('Tavuk Göğsü (haşlanmış)')
    expect(repairEncoding('Kırmızı Mercimek (pişmiş)')).toBe('Kırmızı Mercimek (pişmiş)')
  })

  it('temiz Unicode/aksanlı metni (İtalyanca/Fransızca) DEĞİŞTİRMEDEN bırakır', () => {
    expect(repairEncoding('sautéed')).toBe('sautéed')
    expect(repairEncoding('Ragù')).toBe('Ragù')
  })

  it('ASCII metne dokunmaz', () => {
    expect(repairEncoding('Bench Press')).toBe('Bench Press')
  })

  it('boş/null girdi için olduğu gibi döner', () => {
    expect(repairEncoding('')).toBe('')
  })
})

describe('import-catalog — nullIfEmpty', () => {
  it('boş veya yalnızca boşluk içeren stringi null yapar', () => {
    expect(nullIfEmpty('')).toBeNull()
    expect(nullIfEmpty('   ')).toBeNull()
    expect(nullIfEmpty(undefined)).toBeNull()
  })

  it('dolu stringi trimleyip döner', () => {
    expect(nullIfEmpty('  barbell  ')).toBe('barbell')
  })
})

describe('import-catalog — chunk', () => {
  it('diziyi verilen boyutta parçalara böler', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('boş diziyi boş parça listesine çevirir', () => {
    expect(chunk([], 500)).toEqual([])
  })
})

describe('import-catalog — SOURCES.exercises.map', () => {
  it('geçerli bir satırı doğru satıra çevirir', () => {
    const result = SOURCES.exercises.map({
      name: 'Bench Press',
      body_part: 'chest',
      target: 'pectorals',
      equipment: 'barbell',
      gif_url: 'videos/x.gif',
      image: 'images/x.jpg',
    })
    expect(result).toEqual({
      row: {
        name: 'Bench Press',
        body_part: 'chest',
        target: 'pectorals',
        equipment: 'barbell',
        gif_url: 'videos/x.gif',
        image: 'images/x.jpg',
      },
    })
  })

  it('boş name olan satırı reddeder ve sebebini raporlar', () => {
    const result = SOURCES.exercises.map({ name: '  ', body_part: 'chest' })
    expect(result).toEqual({ skip: 'boş name' })
  })

  it('opsiyonel boş alanları null yapar', () => {
    const result = SOURCES.exercises.map({ name: 'Air Squat' })
    expect(result.row).toEqual({
      name: 'Air Squat',
      body_part: null,
      target: null,
      equipment: null,
      gif_url: null,
      image: null,
    })
  })

  it('bozuk kodlanmış name alanını onarır', () => {
    const result = SOURCES.exercises.map({ name: 'sled 45в° calf press' })
    expect(result.row?.name).toBe('sled 45° calf press')
  })
})

describe('import-catalog — SOURCES.foods.map', () => {
  it('geçerli bir satırı doğru satıra çevirir', () => {
    const result = SOURCES.foods.map({ name: 'Elma', calories_per_100g: '52' })
    expect(result).toEqual({ row: { name: 'Elma', calories_per_100g: 52 } })
  })

  it('boş name olan satırı reddeder', () => {
    const result = SOURCES.foods.map({ name: '', calories_per_100g: '10' })
    expect(result).toEqual({ skip: 'boş name' })
  })

  it('sayıya çevrilemeyen kaloriyi reddeder ve sebebini raporlar', () => {
    const result = SOURCES.foods.map({ name: 'Elma', calories_per_100g: 'abc' })
    expect(result).toEqual({ skip: 'sayısal olmayan kalori' })
  })

  it('boş kaloriyi reddeder', () => {
    const result = SOURCES.foods.map({ name: 'Elma', calories_per_100g: '' })
    expect(result).toEqual({ skip: 'sayısal olmayan kalori' })
  })

  it('negatif kaloriyi reddeder', () => {
    const result = SOURCES.foods.map({ name: 'Elma', calories_per_100g: '-5' })
    expect(result).toEqual({ skip: 'negatif kalori' })
  })

  it('numeric(7,2) aralığını aşan kaloriyi reddeder', () => {
    const result = SOURCES.foods.map({ name: 'Elma', calories_per_100g: '100000' })
    expect(result).toEqual({ skip: 'kalori aralık dışı (>99999.99)' })
  })

  it('kaloriyi iki ondalık basamağa yuvarlar', () => {
    const result = SOURCES.foods.map({ name: 'Elma', calories_per_100g: '52.126' })
    expect(result.row?.calories_per_100g).toBe(52.13)
  })

  it('Türkçe karakterli name alanını olduğu gibi korur', () => {
    const result = SOURCES.foods.map({ name: 'Tavuk Göğsü (haşlanmış)', calories_per_100g: '165' })
    expect(result.row?.name).toBe('Tavuk Göğsü (haşlanmış)')
  })
})

describe('import-catalog — transformRecords (dosya içi tekilleştirme)', () => {
  it('aynı isimde birden fazla kayıt varsa SON kayıt kazanır', () => {
    const records = [
      { name: 'Squat', body_part: 'legs', target: '', equipment: '', gif_url: '', image: '' },
      { name: 'Squat', body_part: 'quads', target: '', equipment: '', gif_url: '', image: '' },
    ]
    const { rows, duplicates } = transformRecords(SOURCES.exercises, records)
    expect(duplicates).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Squat', body_part: 'quads' })
  })

  it('reddedilen satırları sebep bazında sayar', () => {
    const records = [
      { name: 'Elma', calories_per_100g: '52' },
      { name: '', calories_per_100g: '10' },
      { name: 'Armut', calories_per_100g: 'abc' },
      { name: 'Kiraz', calories_per_100g: '-1' },
    ]
    const { rows, skipReasons } = transformRecords(SOURCES.foods, records)
    expect(rows).toHaveLength(1)
    expect(skipReasons.get('boş name')).toBe(1)
    expect(skipReasons.get('sayısal olmayan kalori')).toBe(1)
    expect(skipReasons.get('negatif kalori')).toBe(1)
  })

  it('geçerli, tekrarsız kayıtlarda tekilleştirme sıfır kalır', () => {
    const records = [
      { name: 'Elma', calories_per_100g: '52' },
      { name: 'Armut', calories_per_100g: '57' },
    ]
    const { rows, duplicates } = transformRecords(SOURCES.foods, records)
    expect(duplicates).toBe(0)
    expect(rows).toHaveLength(2)
  })
})
