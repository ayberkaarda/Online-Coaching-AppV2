// Playwright E2E ortak yardımcıları: test kullanıcıları, giriş/çıkış akışları.
// Seçicilerde rol/etiket tabanlı locator kullanılır (Tailwind sınıflarına bağımlı DEĞİLDİR).

import type { Page } from '@playwright/test'

export interface TestUser {
  email: string
  password: string
}

// E-postalar supabase/seed.sql'den; env ile geçersiz kılınabilir (bkz. tests/e2e/README.md).
export const TEST_USERS: { client: TestUser; coach: TestUser } = {
  client: {
    email: process.env.E2E_CLIENT_EMAIL ?? 'client1@example.com',
    password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
  },
  coach: {
    email: process.env.E2E_COACH_EMAIL ?? 'coach@example.com',
    password: process.env.E2E_PASSWORD ?? 'Passw0rd!23',
  },
}

/** `/login`'e gider, formu doldurup gönderir ve `/`'e yönlendirmeyi bekler. */
export async function login(page: Page, user: TestUser): Promise<void> {
  await page.goto('/login')
  await page.getByLabel(/e-posta/i).fill(user.email)
  // "ŞİFRE" etiketi noktalı büyük İ (U+0130) içerir. JS'in case-insensitive regex
  // motoru İ'yi düz "i" ile eşleştirmez (ECMAScript Canonicalize, Türkçe'ye özgü
  // İ/i - I/ı eşlemesini bilmez), bu yüzden /şifre/i HİÇBİR ZAMAN eşleşmez.
  // Kaynaktaki metin birebir (aynı harf biçimiyle) kullanılır.
  await page.getByLabel('ŞİFRE').fill(user.password)
  // Not: buton metni tamamı büyük harf Türkçe "GİRİŞ YAP" içerir (noktalı büyük İ).
  // Case-insensitive regex'te büyük/küçük İ/I dönüşümü güvenilir olmadığından
  // kaynaktaki metin birebir (aynı harf biçimiyle) kullanılır.
  await page.getByRole('button', { name: 'GİRİŞ YAP' }).click()
  await page.waitForURL('/')
}

/** "Çıkış Yap" butonuna tıklar ve `/login`'e yönlendirmeyi bekler. */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: /çıkış yap/i }).click()
  await page.waitForURL('/login')
}
