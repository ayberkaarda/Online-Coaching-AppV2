'use client'

// Koç <-> danışan birebir sohbeti: geçmiş, realtime dinleme, presence ve optimistic gönderim.

import type { RealtimePresenceState, SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { ApiError, apiFetch } from '../api/client'
import { queryKeyRoots, queryKeys } from '../query/keys'
import { wrapSupabaseError } from '../query/supabase-error'
import {
  MESSAGE_ATTACHMENT_BUCKET,
  SIGNED_URL_STALE_TIME_MS,
  attachmentFileNameFromPath,
  createSignedDownloadUrl,
  createSignedUrl,
} from '../storage'
import { useSupabaseClient } from '../context'
import { useNotifier } from '../notify'
import { assertValidImageFile } from '../upload-validation'
import type { Database, Message } from '@repo/types'

import { useSession } from './useSession'

/**
 * Mesaj eki yolunu DB CHECK'ine (`messages_attachment_path_chk`) uyacak şekilde üretir:
 * `<conversation_client_id>/<uploader_uid>-<uuid>.<ext>`. Kısıt ayrıca ilk segmentin
 * satırın `client_id`'sine EŞİT olmasını şart koşar — bu yüzden `conversationClientId`
 * çağıran tarafça `resolveConversationClientId` ile önceden doğrulanmış olmalıdır.
 * Saf fonksiyondur (apps/web/tests/unit/message-attachment.test.ts).
 */
export function buildMessageAttachmentPath(
  conversationClientId: string,
  uploaderId: string,
  extension: string
): string {
  return `${conversationClientId}/${uploaderId}-${crypto.randomUUID()}.${extension}`
}

interface PresencePayload {
  user_id: string
  online_at: string
}

/** Koç kimliği nadiren değişir; 30 dk boyunca taze sayılır. */
const COACH_ID_STALE_TIME_MS = 30 * 60_000

function isMessageRow(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Partial<Message>
  return typeof row.id === 'string' && typeof row.sender_id === 'string'
}

/**
 * `useCoachId` ve `useSendMessage` aynı önbellek girdisini paylaşsın diye ayrıldı.
 *
 * Hook DEĞİLDİR: istemci ADR-0024 Ek-1 deseniyle açık ilk parametre olarak geçer.
 */
async function fetchCoachId(client: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .eq('role', 'coach')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw wrapSupabaseError(error, { table: 'profiles', op: 'select' })
  return data?.id ?? null
}

/**
 * Konuşmanın DANIŞAN tarafı — `messages.client_id` sütununun karşılığı.
 *
 * Tek koçlu modelde bir sohbet (koç, danışan) çiftidir; çiftin koç olmayan
 * tarafı konuşmayı tek başına tanımlar. Realtime aboneliği ve okunmamış sayacı
 * bu anahtara dayanır.
 *
 * Saf fonksiyondur (apps/web/tests/unit/message-conversation.test.ts). Anahtar
 * çözülemiyorsa `undefined` döner — çağıran taraf "abone olma / gönderme"
 * kararını buna göre verir, TAHMİN YÜRÜTÜLMEZ.
 */
export function resolveConversationClientId(
  userA: string | undefined,
  userB: string | undefined,
  coachId: string | null | undefined
): string | undefined {
  if (!userA || !userB || !coachId) return undefined
  // İkisi de koç (ya da aynı kişi) ise konuşmanın danışan tarafı yoktur.
  if (userA === coachId && userB === coachId) return undefined
  if (userA === coachId) return userB
  if (userB === coachId) return userA
  // Hiçbiri koç değil: koç <-> danışan olmayan bir sohbet desteklenmiyor.
  return undefined
}

/**
 * İki kullanıcı arasındaki mesajlar (eskiden yeniye) + realtime INSERT aboneliği.
 * Anahtar yön bağımsızdır: (a,b) ve (b,a) aynı önbelleği kullanır.
 */
export function useMessages(currentUserId?: string, partnerId?: string) {
  const supabase = useSupabaseClient()
  const queryClient = useQueryClient()
  const { data: coachId } = useCoachId()
  const clientId = resolveConversationClientId(currentUserId, partnerId, coachId)

  useEffect(() => {
    if (!currentUserId || !partnerId || !clientId) return

    const key = queryKeys.messages(currentUserId, partnerId)

    const channel = supabase
      .channel(`messages:client:${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          // FİLTRE SUNUCU TARAFINDA (Faz 1b Adım 4).
          //
          // Eskiden burada filtre YOKTU: tüm `messages` INSERT'leri her istemciye
          // gelir, konuşmaya ait olup olmadığı İSTEMCİDE (sender/receiver OR
          // karşılaştırmasıyla) elenirdi. Sebep teknikti — `postgres_changes`
          // filtresi `sender_id=eq.X OR receiver_id=eq.X` gibi bir OR ifadesini
          // DESTEKLEMEZ. `messages.client_id` kolonu (konuşmanın danışan tarafı)
          // tam olarak bu OR'u tek eşitliğe indirger; artık ağdan yalnızca BU
          // konuşmanın olayları geçer.
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const row: unknown = payload.new
          if (!isMessageRow(row)) return

          // İSTEMCİ TARAFI KONUŞMA FİLTRESİ KALDIRILDI: satırın bu konuşmaya ait
          // olduğunu sunucu garanti ediyor (yukarıdaki `filter`).

          queryClient.setQueryData<Message[]>(key, (previous) => {
            const list = previous ?? []
            if (list.some((item) => item.id === row.id)) return list
            // Optimistic kopyayı (varsa) gerçek kayıtla değiştir.
            const withoutOptimistic = list.filter(
              (item) =>
                !(
                  item.id.startsWith('optimistic-') &&
                  item.message === row.message &&
                  item.sender_id === row.sender_id
                )
            )
            return [...withoutOptimistic, row]
          })

          // Yeni mesaj BU kullanıcıya geldiyse okunmamış sayacı bayatla — sohbet
          // ekranı kapalıyken bile (ör. rozet) taze sayı bir sonraki sorguda gelir.
          if (row.receiver_id === currentUserId) {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.unreadCount(clientId, currentUserId),
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          // UPDATE'te (bkz. 20260817190400) yayınlanan tek alan sınıfı `read_at`/`is_read`
          // normalleştirmesidir (`messages_guard_columns` diğer her şeyi dokunulmaz kılar).
          // Bu, karşı tarafın "okundu" durumunu canlı yansıtır (gönderen "görüldü" bilgisini
          // sayfayı yenilemeden görür).
          const row: unknown = payload.new
          if (!isMessageRow(row)) return

          queryClient.setQueryData<Message[]>(key, (previous) =>
            previous?.map((item) => (item.id === row.id ? row : item))
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId, partnerId, clientId, queryClient])

  return useQuery({
    queryKey: queryKeys.messages(currentUserId, partnerId),
    enabled: Boolean(currentUserId && partnerId),
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${partnerId}),` +
            `and(sender_id.eq.${partnerId},receiver_id.eq.${currentUserId})`
        )
        .order('created_at', { ascending: true })
      if (error) throw wrapSupabaseError(error, { table: 'messages', op: 'select' })
      return data
    },
  })
}

export interface SendMessageInput {
  senderId: string
  receiverId: string
  message: string
  /**
   * Konuşmanın danışan tarafı. Verilmezse koç kimliğinden türetilir.
   * (Sunucudaki `messages_apply_conversation_key` trigger'ı değeri ayrıca
   * DOĞRULAR; yanlış bir client_id ile yazma denemesi hata verir.)
   */
  clientId?: string
  /**
   * Opsiyonel foto eki (§4.4: "metin + opsiyonel foto"). `message` metni YİNE
   * ZORUNLUDUR — yalnız-foto mesaj yoktur (bkz. 20260817190200_message_attachments.sql
   * satır 11-12). Yükleme `assertValidImageFile` ile (magic-byte) doğrulanır;
   * geçersiz dosya `UploadValidationError` fırlatır ve `onError` toast'ında görünür.
   */
  file?: File
}

interface SendMessageContext {
  key: readonly unknown[]
  previous: Message[] | undefined
}

export function useSendMessage() {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()

  return useMutation<Message, Error, SendMessageInput, SendMessageContext>({
    mutationFn: async ({ senderId, receiverId, message, clientId, file }): Promise<Message> => {
      // `client_id` NOT NULL'dır. Trigger NULL gelirse türetir, ama açıkça
      // göndermek hem tipleri hem niyeti nettir. Önbellekte koç kimliği yoksa
      // (ör. sohbet ekranı hiç açılmadan gönderim) tek seferlik çekilir.
      const resolved =
        clientId ??
        resolveConversationClientId(
          senderId,
          receiverId,
          await queryClient.ensureQueryData({
            queryKey: queryKeys.coachId(),
            queryFn: () => fetchCoachId(supabase),
            staleTime: COACH_ID_STALE_TIME_MS,
          })
        )

      if (!resolved) {
        throw new Error('Sohbetin danışan tarafı belirlenemedi.')
      }

      // Ek varsa ÖNCE storage'a yüklenir (form-check akışıyla aynı sıralama —
      // bkz. useFormChecks.ts uploadPose): yol DB satırından ÖNCE var olmalı ki
      // gönderim anında `createSignedUrl` hemen çalışsın. Doğrulama SIRASI
      // otoritedir: boyut/MIME allowlist önce, sonra magic-byte (A-07/A-20/A-21,
      // bkz. `@repo/api-client/upload-validation`). Geçersiz dosya burada fırlar,
      // hiçbir insert denenmez.
      let attachmentPath: string | null = null
      if (file) {
        // `mime` burada TESPİT EDİLEN (magic-byte) türdür, `file.type`'ın bildirdiği
        // değer DEĞİL — A-07/A-21 otoritesi (bkz. upload-validation.ts) storage'a
        // yazılan Content-Type'a da taşınır.
        const { mime, extension } = await assertValidImageFile(file)
        const path = buildMessageAttachmentPath(resolved, senderId, extension)
        const { error: uploadError } = await supabase.storage
          .from(MESSAGE_ATTACHMENT_BUCKET)
          .upload(path, file, { contentType: mime })
        if (uploadError) throw new Error(uploadError.message)

        // ###################################################################
        // # B-028 — SUNUCU TARAFI DOĞRULAMA (AC-4.6.4)                       #
        // #                                                                  #
        // # Yukarıdaki `assertValidImageFile` İSTEMCİ tarafı doğrulamadır ve  #
        // # bir GÜVENLİK SINIRI DEĞİLDİR: `fetch` ile doğrudan Storage'a      #
        // # giden bir betik onu atlar. Yükleme tamamlandıktan sonra sunucu    #
        // # nesnenin baytlarını KENDİ okur ve kararı tekrar verir             #
        // # (apps/web/src/app/api/attachments/verify/route.ts).               #
        // #                                                                  #
        // # BU ÇAĞRI "NAZİK BİR RİCA" DEĞİLDİR: veritabanındaki               #
        // # `messages_require_verified_attachment` tetikleyicisi, sunucunun   #
        // # bıraktığı damga olmadan EK İÇEREN SATIRI KABUL ETMEZ. Bu satır    #
        // # silinse bile aşağıdaki INSERT 42501 ile düşerdi — kapı istemcide  #
        // # değil, veritabanındadır.                                          #
        // #                                                                  #
        // # SIRA: doğrulama INSERT'ten ÖNCEDİR. Reddedilen nesneyi sunucu     #
        // # zaten siler; burada yalnızca Türkçe hatayı yukarı taşırız ve      #
        // # hiçbir mesaj satırı yazılmaz.                                     #
        // ###################################################################
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) {
          throw new Error('Oturumunuz sona ermiş. Lütfen tekrar giriş yapın.')
        }

        try {
          await apiFetch<{ ok: true; mime: string }>('/api/attachments/verify', {
            method: 'POST',
            json: { path },
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
        } catch (err) {
          // Sunucunun Türkçe mesajı kullanıcıya AYNEN gösterilir (ör. "Dosyanın
          // içeriği bildirilen türle uyuşmuyor."); ağ hatası jenerik metne düşer.
          throw new Error(
            ApiError.isApiError(err)
              ? err.message
              : 'Fotoğraf doğrulanamadı. Lütfen tekrar deneyin.'
          )
        }

        attachmentPath = path
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: senderId,
          receiver_id: receiverId,
          client_id: resolved,
          message,
          attachment_path: attachmentPath,
        })
        .select()
        .single()
      if (error) throw wrapSupabaseError(error, { table: 'messages', op: 'insert' })
      return data
    },
    onMutate: async ({ senderId, receiverId, message, clientId }) => {
      const key = queryKeys.messages(senderId, receiverId)
      await queryClient.cancelQueries({ queryKey: key })

      const previous = queryClient.getQueryData<Message[]>(key)

      const optimistic: Message = {
        id: `optimistic-${crypto.randomUUID()}`,
        sender_id: senderId,
        receiver_id: receiverId,
        // Optimistic satır YALNIZCA yerel önbellekte yaşar ve gerçek kayıt
        // gelince silinir; `client_id` hiçbir yerde okunmadığı için burada ağ
        // isteği yapılmaz, önbellekteki koç kimliğiyle en iyi tahmin kullanılır.
        client_id:
          clientId ??
          resolveConversationClientId(
            senderId,
            receiverId,
            queryClient.getQueryData<string | null>(queryKeys.coachId())
          ) ??
          senderId,
        message,
        is_read: false,
        read_at: null,
        kind: 'user',
        created_at: new Date().toISOString(),
        attachment_path: null,
      }

      queryClient.setQueryData<Message[]>(key, [...(previous ?? []), optimistic])

      return { key, previous }
    },
    onError: (error, _variables, context) => {
      if (context) {
        queryClient.setQueryData(context.key, context.previous)
      }
      notify.error(`Mesaj gönderilemedi: ${error.message}`)
    },
    onSettled: (_data, _error, { senderId, receiverId }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.messages(senderId, receiverId) })
      void queryClient.invalidateQueries({ queryKey: queryKeyRoots.unreadCount })
    },
  })
}

/**
 * Bir konuşmada KARŞI TARAFTAN gelen okunmamış mesajları okundu işaretler.
 *
 * "Karşı taraftan gelen" kısıtı iki katmanlıdır: sorgu `receiver_id`'yi açıkça
 * oturum sahibine sabitler, RLS (`messages_update_receiver`) ise sunucuda aynı
 * kısıtı ZORLAR — kimse başkasının okundu bilgisini değiştiremez.
 *
 * Faz 1b'de ÇAĞIRAN YOKTUR (bileşenler bu adımda değişmiyor); okundu göstergesi
 * ve rozet Faz 2'nin işidir. Hook şimdiden yazılıp dışa açılır ki sunucu
 * sözleşmesi (read_at + RLS) test edilebilir ve doğrulanmış olsun.
 */
export function useMarkConversationRead(clientId?: string) {
  const supabase = useSupabaseClient()
  const notify = useNotifier()
  const queryClient = useQueryClient()
  const { data: session } = useSession()
  const viewerId = session?.user.id

  return useMutation<number, Error, void>({
    mutationFn: async (): Promise<number> => {
      if (!clientId || !viewerId) return 0

      const { data, error } = await supabase
        .from('messages')
        .update({
          // `read_at` KANONİKTİR (Faz 2b: 20260817190300_message_read_state.sql).
          // `is_read` artık BURADA yazılmıyor — `messages_sync_read_state` trigger'ı
          // onu `read_at`ten koşulsuz türetir; elle yazmak yalnızca "yeni kod bu
          // kolona yazmamalı" kuralını ihlal eden ölü bir tekrar olurdu.
          read_at: new Date().toISOString(),
        })
        .eq('client_id', clientId)
        .eq('receiver_id', viewerId)
        .is('read_at', null)
        .select('id')
      if (error) throw wrapSupabaseError(error, { table: 'messages', op: 'update' })
      return data.length
    },
    onSuccess: (updated) => {
      if (updated === 0) return
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount(clientId, viewerId) })
    },
    onError: (error) => {
      notify.error(`Mesajlar okundu işaretlenemedi: ${error.message}`)
    },
  })
}

/**
 * Bir konuşmada oturum sahibine gelmiş, henüz okunmamış mesaj sayısı.
 * `head: true` ile yalnızca sayım döner (satır gövdesi taşınmaz).
 *
 * `useMarkConversationRead` gibi bu hook'un da Faz 1b'de çağıranı yoktur.
 */
export function useUnreadCount(clientId?: string) {
  const supabase = useSupabaseClient()
  const { data: session } = useSession()
  const viewerId = session?.user.id

  return useQuery({
    queryKey: queryKeys.unreadCount(clientId, viewerId),
    enabled: Boolean(clientId && viewerId),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId ?? '')
        .eq('receiver_id', viewerId ?? '')
        .is('read_at', null)
      if (error) throw wrapSupabaseError(error, { table: 'messages', op: 'select' })
      return count ?? 0
    },
  })
}

/** Global presence kanalı: karşı tarafın çevrimiçi olup olmadığını bildirir. */
export function usePresence(currentUserId?: string) {
  const supabase = useSupabaseClient()
  const [onlineIds, setOnlineIds] = useState<string[]>([])

  useEffect(() => {
    // Guard dalında artık setState çağrılmıyor (set-state-in-effect lint hatasını önler);
    // "çevrimiçi mi" sorusu aşağıda currentUserId'ye göre türetiliyor, bu yüzden
    // currentUserId yokken abone olmadan çıkmak yeterli — bayat onlineIds sızmaz.
    if (!currentUserId) return

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: currentUserId } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state: RealtimePresenceState<PresencePayload> =
          channel.presenceState<PresencePayload>()
        const ids = new Set<string>()
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (typeof entry.user_id === 'string') ids.add(entry.user_id)
          }
        }
        setOnlineIds([...ids])
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, currentUserId])

  // currentUserId yokken kimse çevrimiçi sayılmaz: kanal hiç kurulmadığından onlineIds
  // bayat/eski kullanıcı verisi taşıyor olsa bile bu dal onu görünmez kılar.
  const isOnline = useCallback(
    (userId: string) => (currentUserId ? onlineIds.includes(userId) : false),
    [currentUserId, onlineIds]
  )

  return { isOnline }
}

/** Danışanın sohbet edeceği koçun (role = 'coach') id'si. */
export function useCoachId() {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.coachId(),
    staleTime: COACH_ID_STALE_TIME_MS,
    queryFn: () => fetchCoachId(supabase),
  })
}

/**
 * Bir mesaj ekinin (`attachment_path`) imzalı görüntüleme adresi.
 *
 * `message-attachments` PRIVATE'tır (I-4); `getPublicUrl` KULLANILMAZ.
 * `@repo/api-client/storage::createSignedUrl` ile aynı TTL/staleTime sözleşmesini
 * paylaşır — adres, süresi dolmadan (TTL/2) önbellekte bayatlar.
 */
export function useMessageAttachmentUrl(path: string | null | undefined) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.messageAttachmentUrl(path),
    enabled: Boolean(path),
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: () => createSignedUrl(supabase, MESSAGE_ATTACHMENT_BUCKET, path),
  })
}

/**
 * B-008 — Bir mesaj ekinin İNDİRME adresi (`Content-Disposition: attachment`).
 *
 * ###########################################################################
 * # İKİ AYRI ADRES, İKİ AYRI İŞ — BİLEREK                                    #
 * #   `useMessageAttachmentUrl`         -> `<img src>` (satır içi gösterim)   #
 * #   `useMessageAttachmentDownloadUrl` -> `<a href>`  (indirme)              #
 * #                                                                          #
 * # B-008 "yüklenen dosya imzalı adreste inline servis ediliyor" diyordu ve   #
 * # bu, kullanıcının dosyaya GİTTİĞİ (navigasyon) yol için bir kusurdur:      #
 * # tarayıcı gövdeyi kendi penceresinde açar. `<img>` için ise inline tam da  #
 * # istenen davranıştır. Aynı adrese `download` eklemek sohbetteki fotoğraf   #
 * # gösterimini tarayıcı davranışına bağımlı hâle getirirdi; bu yüzden yollar #
 * # AYRIŞTIRILDI. Adresi TIKLANABİLİR yapan tek yer `MessagesTab`'daki        #
 * # "İndir" bağlantısıdır ve o bağlantı BU hook'u kullanır.                   #
 * ###########################################################################
 *
 * `enabled` VARSAYILAN OLARAK KAPALIDIR: her ekli mesaj için ikinci bir imza
 * üretmek (liste boyunca N ek istek) yalnızca kullanıcı indirmek istediğinde
 * gereken bir maliyettir.
 */
export function useMessageAttachmentDownloadUrl(path: string | null | undefined, enabled = false) {
  const supabase = useSupabaseClient()
  return useQuery({
    queryKey: queryKeys.messageAttachmentDownloadUrl(path),
    enabled: Boolean(path) && enabled,
    staleTime: SIGNED_URL_STALE_TIME_MS,
    queryFn: () =>
      createSignedDownloadUrl(
        supabase,
        MESSAGE_ATTACHMENT_BUCKET,
        path,
        attachmentFileNameFromPath(path)
      ),
  })
}
