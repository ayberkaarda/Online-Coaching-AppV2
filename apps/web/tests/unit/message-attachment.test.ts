// Mesaj eki: yol sözleşmesi + magic-byte doğrulaması.
//
// KRİTİK NEDEN: `messages_attachment_path_chk` (bkz.
// supabase/migrations/20260817190200_message_attachments.sql) yolun İLK SEGMENTİNİN
// satırın `client_id`'sine EŞİT olmasını ve ikinci segmentin
// `<uploader-uuid>-<serbest kalan>` desenine uymasını veritabanında ZORUNLU kılar.
// İstemci bu sözleşmeyi yanlış kurarsa INSERT 23514 ile REDDEDİLİR — bu yüzden yol
// üretimi burada, DB'ye hiç gitmeden, saf bir fonksiyon olarak doğrulanır.
//
// İkinci konu: `useSendMessage` yüklemeden ÖNCE `assertValidImageFile` çağırır
// (bkz. packages/api-client/src/hooks/useMessages.ts). Kaynak otorite bildirilen `file.type` değil
// magic-byte'tır (A-07/A-21, `@repo/api-client/upload-validation`); burada gerçek
// imzalarla (JPEG/PNG) ve sahte bir imzayla bu sözleşme doğrudan test edilir.

import { describe, expect, it } from 'vitest'

import { buildMessageAttachmentPath } from '@repo/api-client/hooks/useMessages'
import { UploadValidationError, assertValidImageFile } from '@repo/api-client/upload-validation'

const CLIENT_ID = '22222222-2222-2222-2222-222222222222'
const OTHER_CLIENT_ID = '33333333-3333-3333-3333-333333333333'
const COACH_ID = '11111111-1111-1111-1111-111111111111'

// DB kısıtıyla BİREBİR aynı desen (bkz. messages_attachment_path_chk):
// `<uuid>/<uuid>-<slash içermeyen serbest kuyruk>`.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const DB_CHECK_PATTERN = new RegExp(`^${UUID}/${UUID}-[^/]+$`)

function makeFile(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytes as unknown as ArrayBuffer], name, { type })
}

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(16).fill(0)])
const PNG_BYTES = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...new Array(16).fill(0),
])
// Metin içeriği ama .jpg uzantısı ve image/jpeg Content-Type'ı iddia ediyor —
// klasik "sahte MIME" saldırısı (A-07). Magic-byte JPEG imzasıyla eşleşmez.
const FAKE_JPEG_BYTES = new TextEncoder().encode('<script>alert(1)</script>')

describe('buildMessageAttachmentPath', () => {
  it('DB CHECK deseniyle (messages_attachment_path_chk) birebir eşleşir', () => {
    const path = buildMessageAttachmentPath(CLIENT_ID, COACH_ID, 'jpg')
    expect(path).toMatch(DB_CHECK_PATTERN)
  })

  it('ilk segment KONUŞMA ANAHTARIDIR (client_id) — yükleyen değil', () => {
    const path = buildMessageAttachmentPath(CLIENT_ID, COACH_ID, 'png')
    const [firstSegment] = path.split('/')
    expect(firstSegment).toBe(CLIENT_ID)
  })

  it('ikinci segment YÜKLEYEN uid ile başlar, ardından `-<uuid>.<ext>` gelir', () => {
    const path = buildMessageAttachmentPath(CLIENT_ID, COACH_ID, 'webp')
    const secondSegment = path.split('/')[1] ?? ''
    expect(secondSegment.startsWith(`${COACH_ID}-`)).toBe(true)
    expect(secondSegment.endsWith('.webp')).toBe(true)
  })

  it('konuşma anahtarını yanlış girmek FARKLI bir konuşmanın yolunu üretir (CHECK bunu 23514 ile reddeder)', () => {
    const pathForA = buildMessageAttachmentPath(CLIENT_ID, COACH_ID, 'jpg')
    const pathForB = buildMessageAttachmentPath(OTHER_CLIENT_ID, COACH_ID, 'jpg')
    expect(pathForA.split('/')[0]).not.toBe(pathForB.split('/')[0])
  })

  it('her çağrı BENZERSİZ bir yol üretir (uuid çakışması yok)', () => {
    const a = buildMessageAttachmentPath(CLIENT_ID, COACH_ID, 'jpg')
    const b = buildMessageAttachmentPath(CLIENT_ID, COACH_ID, 'jpg')
    expect(a).not.toBe(b)
  })

  it('MIME_EXTENSION eşlemesindeki tüm uzantılar için desen geçerli kalır', () => {
    for (const extension of ['jpg', 'png', 'webp', 'avif']) {
      expect(buildMessageAttachmentPath(CLIENT_ID, COACH_ID, extension)).toMatch(DB_CHECK_PATTERN)
    }
  })
})

describe('mesaj eki yüklemesi öncesi doğrulama (assertValidImageFile)', () => {
  it('gerçek JPEG imzası kabul edilir', async () => {
    const file = makeFile(JPEG_BYTES, 'foto.jpg', 'image/jpeg')
    await expect(assertValidImageFile(file)).resolves.toEqual({
      mime: 'image/jpeg',
      extension: 'jpg',
    })
  })

  it('gerçek PNG imzası kabul edilir', async () => {
    const file = makeFile(PNG_BYTES, 'foto.png', 'image/png')
    await expect(assertValidImageFile(file)).resolves.toEqual({
      mime: 'image/png',
      extension: 'png',
    })
  })

  it('sahte MIME (metin içerik, image/jpeg iddiası) REDDEDİLİR — magic-byte tutmuyor', async () => {
    const file = makeFile(FAKE_JPEG_BYTES, 'foto.jpg', 'image/jpeg')
    await expect(assertValidImageFile(file)).rejects.toBeInstanceOf(UploadValidationError)
    await expect(assertValidImageFile(file)).rejects.toMatchObject({ code: 'CONTENT_MISMATCH' })
  })

  it('desteklenmeyen bildirilen tür (ör. application/pdf) REDDEDİLİR', async () => {
    const file = makeFile(PNG_BYTES, 'dosya.pdf', 'application/pdf')
    await expect(assertValidImageFile(file)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' })
  })

  it('boş dosya REDDEDİLİR', async () => {
    const file = makeFile(new Uint8Array(0), 'bos.jpg', 'image/jpeg')
    await expect(assertValidImageFile(file)).rejects.toMatchObject({ code: 'EMPTY' })
  })
})
