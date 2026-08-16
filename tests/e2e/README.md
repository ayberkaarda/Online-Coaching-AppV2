# E2E Testleri (Playwright)

Bu klasördeki testler gerçek bir Supabase örneğine ve seed verisine ihtiyaç duyar; birim testlerinin aksine mock kullanmazlar.

## Önkoşullar

1. Yerel Supabase yığınını başlatın:
   ```
   npx supabase start
   ```
2. Migration'ları uygulayıp seed verisini yükleyin:
   ```
   npx supabase db reset
   ```
   Bu komut `supabase/seed.sql` dosyasını çalıştırır ve şu demo hesapları oluşturur (parola hepsi için `Passw0rd!23`):
   - `coach@example.com` (koç / admin)
   - `client1@example.com` (danışan / student)
   - `client2@example.com` (danışan / student)
3. `.env.local` dosyasının doldurulmuş olduğundan emin olun (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` vb.). Uygulama sunucusunun **yerel** Supabase yığınına (`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` ve o yığının anon key'i) bağlı olması gerekir — uzak/staging bir projeye bağlıysa seed kullanıcıları bulunamaz ve girişler başarısız olur.
4. Yerel Supabase'de e-posta/parola girişinin (`auth.email`) etkin olduğunu doğrulayın:
   ```
   curl http://127.0.0.1:54321/auth/v1/settings -H "apikey: <ANON_KEY>"
   ```
   Yanıtta `"external": { "email": true, ... }` görmelisiniz. `false` ise `supabase/config.toml`'daki `[auth.email]` bölümü devre dışı demektir ve **tüm** giriş gerektiren testler `page.waitForURL('/')` adımında timeout ile başarısız olur (bu, test locator'larıyla ilgili değildir — düzeltme `supabase/config.toml`/altyapı tarafında yapılmalı, bu klasörün kapsamı dışındadır).

## Çalıştırma

```
npm run test:e2e
```

`playwright.config.ts`, `npm run build && npm run start` ile uygulamayı otomatik ayağa kaldırır (`webServer`). Sunucu zaten `localhost:3000`'de çalışıyorsa (`reuseExistingServer`) yeniden başlatılmaz.

## Test kullanıcılarını özelleştirme

Varsayılan e-posta/parola değerleri `supabase/seed.sql`'den alınır. Farklı bir ortamda (ör. staging) çalıştırmak için env değişkenleriyle geçersiz kılabilirsiniz:

```
E2E_CLIENT_EMAIL=baska-danisan@example.com
E2E_COACH_EMAIL=baska-koc@example.com
E2E_PASSWORD=BaskaParola123!
```

## CI Uyarısı

Bu testler **canlı bir Supabase örneği** gerektirir. CI ortamında Supabase ayağa kaldırılmadan veya seed verisi yüklenmeden çalıştırılırsa (`supabase db reset` atlanırsa) tüm testler başarısız olur — giriş yapılacak kullanıcılar veritabanında bulunmayacaktır. CI pipeline'ına Supabase servislerini başlatan ve seed uygulayan bir adım eklemeden bu testleri çalıştırmayın.

## Tuzak: Türkçe İ/ı case-insensitive eşleşme

Türkçe metin içeren locator'larda **case-insensitive regex (`/i` bayrağı) kullanmayın** — `Ş`, `Ğ`, `Ü`, `Ö`, `Ç` gibi standart aksanlı harfler için JS'in case-folding'i doğru çalışır, ama **İ (U+0130, noktalı büyük I)** ve **ı (U+0131, noktasız küçük i)** için ÇALIŞMAZ:

- `"ŞİFRE".toLowerCase()` → `"şi̇fre"` üretir: `i`'den sonra görünmez bir **U+0307 COMBINING DOT ABOVE** karakteri eklenir. Yani "İ"nin JS'teki (Türkçe olmayan, yerel ayardan bağımsız) küçük hali düz `i` DEĞİLDİR.
- ECMAScript'in case-insensitive regex `Canonicalize` algoritması da aynı şekilde davranır: `/şifre/i` deseni `ŞİFRE` metnindeki `İ` ile **asla eşleşmez**, çünkü İ'nin canonicalize edilmiş hali kendisidir (`İ`), pattern'deki düz `i`'nin canonicalize edilmiş hali ise ASCII `I`'dir (`İ ≠ I`).
- Bu, `tests/e2e/fixtures.ts`'teki `login()` fonksiyonunda gerçek bir hataya yol açmıştı: `page.getByLabel(/şifre/i)` giriş sayfasındaki `ŞİFRE` etiketiyle hiçbir zaman eşleşmiyordu ve bu tek satır **12 testin tamamını** `beforeEach`/`login()` üzerinden bozuyordu.

**Kural:** İ veya ı içeren herhangi bir metni eşlerken:
- Erişilebilir etiket/rol için **birebir metin** kullanın: `page.getByLabel('ŞİFRE')`, `page.getByRole('button', { name: 'GİRİŞ YAP' })` — bu en dayanıklı yöntemdir.
- Regex kullanmanız gerekiyorsa `i` bayrağını KOYMAYIN ve kaynaktaki harfleri birebir (aynı Unicode kod noktasıyla) kopyalayın, ör. `/çıkış yap/` (`i` bayrağı yok, `ı` kaynaktan birebir kopyalanmış).
- İ/ı içermeyen metinlerde (`Duyurular`, `Beslenme`, `Antrenman`, `Sohbet`, `Form Check`, `Günlük Veriler` — bunların hiçbiri İ/ı içermez, `ü` gibi standart aksanlı harfler güvenlidir) `/i` bayraklı regex kullanmaya devam edebilirsiniz.
- Şüpheye düşerseniz, kaynak bileşeni (`src/app/**`, `src/components/**`) açıp metni kod düzenleyiciden birebir kopyalayın — elle yazmayın.
