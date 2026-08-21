// Hermes/RN runtime'ında global `crypto` yok -> `crypto.randomUUID()` çağıran paylaşılan
// kod (packages/api-client/src/hooks/useMessages.ts, useSendMessage.onMutate) fırlıyor ve
// optimistic mesaj eklenemiyor (danışan + koç mesaj gönderimi kırılıyor). Web'de native
// `crypto` zaten var; bu shim yalnızca mobilde eksik olanı dolduruyor.
//
// expo-crypto Expo Go'da native modülü hazır getirir (yeni build gerekmez). Bu dosya
// apps/mobile/app/_layout.tsx'in EN ÜSTÜNDE, diğer tüm importlardan önce yan-etki olarak
// import edilmeli ki `global.crypto` her şeyden önce hazır olsun.
import { getRandomValues, randomUUID } from 'expo-crypto'

type MinimalCrypto = {
  randomUUID?: () => string
  getRandomValues?: typeof getRandomValues
}

// `typeof globalThis`, DOM lib'inden gelen tam `Crypto` tipini içeriyor (örn. `subtle`,
// template-literal döndüren `randomUUID`); expo-crypto'nun daha basit imzalarıyla
// intersection çakışmasını önlemek için `unknown` üzerinden gevşek bir tipe geçiliyor.
const g = globalThis as unknown as { crypto?: MinimalCrypto }

if (typeof g.crypto === 'undefined') {
  g.crypto = {} as MinimalCrypto
}

if (typeof g.crypto.randomUUID !== 'function') {
  g.crypto.randomUUID = randomUUID
}

if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = getRandomValues
}
