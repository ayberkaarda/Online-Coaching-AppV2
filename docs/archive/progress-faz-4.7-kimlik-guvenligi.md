# Arşiv — Faz 4.7: Kimlik Güvenliği (2026-08-19)

**Özet.** Koç hesabı için zorunlu TOTP çok faktörlü kimlik doğrulama + `aal2` RLS
kapısı (ADR-0026), danışan için opt-in aynı mekanizma, koç tetiklemeli şifre
sıfırlama (impersonation yok, bağlantı danışanın kendi e-postasına gider) ve
koç müdahaleleri için KVKK m.12 hesap verebilirlik denetim tablosu
(`coach_actions`). Bu fazın `active_planprogram.md`'de tanımlı bir AC tablosu
yoktu — aşağıda onun yerine **kapsam kararları ve kanıtları** başlığı kullanılıyor.

> Canlı durum, açık borçlar ve sıradaki iş: [`docs/PROGRESS.md`](../PROGRESS.md) §3/§5.
> Mimari karar kaydı: `docs/adr/0026-totp-mfa-ve-aal2-kapisi.md` (bu dosyaya
> dokunulmadı, yalnızca referans veriliyor).

---

## Kapsam kararları ve kanıtları

### Yöntem seçimi: TOTP, SMS reddedildi (Fable danışması)

MFA yöntemi **TOTP** (RFC 6238) seçildi. SMS değerlendirildi ve reddedildi:
Supabase'in Advanced MFA Phone eklentisi ayda $75, harcama tavanına dahil
değil, Pro plan şart; Türkiye'de alfanümerik gönderici kimliği kaydı ~2 hafta
sürüyor ve İYS uyumu belirsiz; ayrıca NIST SP 800-63B-4 SMS'i "kısıtlı
doğrulayıcı" sınıfına koyuyor. TOTP Supabase'de tüm planlarda ücretsiz.

**Kapsam:** koç girişi **zorunlu aal2**, danışan **opt-in**. Koç yalnızca
**sıfırlama tetikler** — bağlantı danışanın kendi e-postasına gider, koç hiçbir
zaman danışan hesabına doğrudan giremiyor (impersonation yok).

### ADR-0026 — kapının RLS'te olması

`docs/adr/0026-totp-mfa-ve-aal2-kapisi.md` yazıldı. Temel gerekçe: ADR-0022
gereği tarayıcı Supabase'e doğrudan gidiyor, bu yüzden route/middleware
katmanındaki her kapı düz bir `fetch` ile atlanabilir — güvenlik sınırı yalnızca
RLS'tir. 14 danışan-verisi tablosuna tek kalıplı bir politika kuruldu:

```sql
create policy mfa_aal2_gate on public.<tablo>
  as restrictive
  for all
  to authenticated
  using      ( not (select public.is_coach())
               or (select auth.jwt() ->> 'aal') = 'aal2' )
  with check ( not (select public.is_coach())
               or (select auth.jwt() ->> 'aal') = 'aal2' );
```

Kararın parçaları: `as restrictive` (PERMISSIVE olsaydı VEYA'lanır, hiçbir şeyi
kısıtlamazdı); `for all` (dört işlem birden); `not is_coach()` alt sorgu
sorgu-başına initplan'a çevrildiği için koç panelinin liste sorguları
yavaşlamıyor; `aal` claim'i eksikse/`aal1`'se **fail-closed** — koç reddedilir.
14 tablonun listesi ADR-0025'in (hesap silme) manifestiyle **birebir aynı** ve
oradan devralınıyor, ikinci bir liste türetilmiyor (sürüklenme riskini kapatmak
için). Kurtarma yolu **HTTP ucu değil**: TOTP secret kayıt ekranında düz metin
gösteriliyor, koç onu kendi kasasına yazıyor; bir "sıfırla" ucu koç hesabını ele
geçiren birine ikinci faktörü tek hamlede yok etme aracı verirdi. ADR-0026'da
sekiz reddedilen alternatif ve altı kalan risk kayıtlı.

### Migration'lar

- `supabase/migrations/20260819120000_mfa_aal2_gate.sql` — `aal2` kapısı, 14
  tablo, idempotent (`create policy if not exists` deseni), DOWN bloklu.
- `supabase/migrations/20260819130000_coach_action_audit.sql` — `coach_actions`
  denetim tablosu, `record_coach_action()` SECURITY DEFINER fonksiyonu,
  `account_deletion_manifest()`/`delete_account()` 14 → 15 tabloya güncellendi.

---

## Öngörülmeyen kararlar ve ölçümler

Bu bölüm kaydın değerli kısmı — hiçbiri kapsam tanımında öngörülmemişti,
uygulama sırasında ortaya çıktı.

**1) `profiles` de kapının içinde.** 14 tablo listesi `profiles`'ı da kapsıyor,
yani `aal1`'deki koç kendi profil satırını bile okuyamıyor. "Koç mu?" sorusu bu
yüzden `useProfile` yerine `public.is_coach()` RPC'sine bağlandı — fonksiyon
`SECURITY DEFINER` ve sahibi `postgres` (`rolbypassrls = t`), RLS'e hiç tabi
değil. Canlı ölçüm: `aal1`'deki koç için `select public.is_coach()` → `t`,
danışan için → `f`.

**2) Seviye yükseltme (step-up) dalı zorunlu.** Parolayla her giriş `aal1`
veriyor; `aal2` yalnızca `challenge()` + `verify()` ile kazanılıyor. Yalnızca
"kayıt" akışı yazılsaydı, MFA'ya kaydolmuş bir koç bir daha **hiç** giremezdi —
kayıt akışının kendisi `aal1`'de de çalışır (GoTrue bu akışı RLS'e tabi
tutmuyor), yani seviye yükseltme yolu ayrıca yazılmak zorundaydı.

**3) Yerel GoTrue'da TOTP kapalı geliyordu.** Ölçüldü:
`GOTRUE_MFA_TOTP_ENROLL_ENABLED=false`. `supabase/config.toml`'a
`[auth.mfa.totp] enroll_enabled/verify_enabled = true` eklendi ve yığın
yeniden başlatıldı. Öncesinde OneDrive **DIŞINA** tam `pg_dumpall` yedeği
alındı (`C:\Users\Ayber\backups\local\`, 1.5 MB); restart sonrası satır
sayıları yedekle birebir aynı ölçüldü — `exercises` 10, `food_database` 10,
`profiles` 3, `daily_logs` 29.

**4) GoTrue MFA `verify` sırasında diğer oturumları iptal ediyor.** Tahmin
değil, ham `fetch` ile ölçüldü: aynı kullanıcı için üç eşzamanlı oturum açıldı,
`verify` **öncesinde** üçü de `/auth/v1/user`'da 200 döndü, `verify`
**sonrasında** ikisi `403 session_not_found` verdi, biri (verify'ı yapan
oturumun kendisi) 200 kaldı. Bu **bizim kontrolümüzde değil** — `useSignOut`'un
`scope: 'local'`'e çekilmesiyle (madde 5) çözülmez, ikisi farklı yollardır.
ADR-0026 §Kalan risk 6'ya yazıldı. Pratik etki bugün çoğunlukla koçu vuruyor
(danışan MFA opt-in ve çoğu tek cihaz kullanıyor).

**5) `useSignOut()` global kapsamdaydı.** Bir cihazdan çıkış tüm oturumları
öldürüyordu — GoTrue'nun varsayılan `signOut()` davranışı `scope: 'global'`.
`packages/api-client/src/hooks/useSession.ts` içinde `scope: 'local'`'e
çekildi; regresyon kilidi testi eklendi (bir cihazın çıkışının diğer
oturumları etkilemediğini doğrulayan senaryo).

**6) `<SecuritySection />` yalnızca kilitli dalda render ediliyordu.**
`apps/web/src/components/security/SecuritySection.tsx` önce yalnızca ADR-0026
§Karar 7'nin "profil okunamıyor" kilitli görünümünde mount ediliyordu — yani
danışan opt-in ekranına **hiç ulaşamıyordu**, ADR'nin öngördüğü karar (Karar 2:
danışan opt-in) kâğıt üzerinde kalmıştı. `apps/web/src/app/profile/page.tsx`'in
tam görünümüne de eklendi.

**7) E2E'de "her koşuda taze TOTP kaydı" çıkmaz.** GoTrue doğrulanmış bir
faktörü `unenroll` etmek için oturumun zaten `aal2` olmasını istiyor, `aal2`
olmak için de o faktörün secret'ı gerekiyor — döngüsel bir bağımlılık. Çözüm:
gitignore'lu bir secret dosyası + env kaçış kapağı; secret `verify()`'dan
**önce** diske yazılıyor ki yarım kalan bir koşu sonraki koşuyu kilitlemesin.

**8) E2E koşu başına tek `aal2` oturumu modeline geçildi** (madde 4'ün doğrudan
sonucu) — her spec kendi `verify()`'ini yapsaydı, her doğrulama diğer spec'lerin
oturumlarını iptal ederdi. Yan kazanç ölçüldü: paket süresi **2.9 dk → ~45 sn**.
8 spec dosyası (`dashboard`, `form-check`, `messaging`, `nutrition`, `plans`,
`progress`, `workout`, `fixtures.ts`) koç kimliğiyle koşuyor; `aal2` fixture'ı
E2E'de de kapının çalıştığını doğruladı (bkz. Doğrulama tablosu).

---

## Şifre sıfırlama

`apps/web/src/app/forgot-password/page.tsx` (nötr mesaj — "hesap varsa
bağlantı gönderildi" biçiminde, hesap var/yok bilgisini sızdırmıyor),
`apps/web/src/app/reset-password/page.tsx`, `apps/web/src/app/login/page.tsx`'e
bağlantı eklendi.

**Koç ucu `resetPasswordForEmail` kullanıyor, `generateLink` DEĞİL.** İki yol
değerlendirildi:

- `supabase.auth.admin.generateLink({ type: 'recovery', email })` —
  `service_role` gerektirir ve bağlantıyı **yanıtta döndürür**
  (`data.properties.action_link`); e-postayı biz göndermek zorunda kalırdık —
  görev tanımı bunu açıkça yasaklıyor.
- `supabase.auth.resetPasswordForEmail(email, { redirectTo })` — GoTrueClient'ın
  public (anon key yeterli) ucu. **Gerekçe tip sistemiyle kanıtlandı:**
  `@supabase/auth-js`'in `GoTrueClient.d.ts`'i dönüş tipini
  `Promise<{ data: {}; error: null } | { data: null; error: AuthError }>`
  olarak beyan ediyor — `data` **yapısal olarak** boş bir nesne, bağlantı hiçbir
  alanda yer almıyor. Bu "bağlantı hiçbir zaman sunucudan geçmiyor" iddiasını
  yalnızca disipline değil derleyiciye dayandırıyor.

Seçilen yol (b). `apps/web/src/app/api/coach/reset-client-password/route.ts`
dört kapı uyguluyor:

1. **Kimlik** — `Authorization: Bearer <token>` (cookie değil; `account/delete`
   ile aynı gerekçe — CSRF yüzeyi açmasın).
2. **Rol** — istemciden gelen hiçbir alana güvenilmiyor; `public.is_coach(uid)`
   RPC'si doğrulanmış `coachId` ile sunucuda çağrılıyor.
3. **Hedef** — danışanın e-postası koçun kendi RLS bağlamındaki `profiles`
   sorgusuyla okunuyor, `role = 'client'` doğrulanıyor. (B-058 notu: bugün
   koç-danışan atama tablosu olmadığı için her koç her danışan profilini
   görebiliyor — bu satır o gerçeği değiştirmiyor, kabul ediyor; atama tablosu
   geldiğinde tek sıkılaştırma noktası bu sorgudur.)
4. **Çift kovalı hız sınırı** — (koç, hedef) çifti **3/saat**, koç geneli
   **20/saat**, pencere 1 saat.
5. **Denetim** — aşağıda.

---

## Denetim tablosu `coach_actions`

`account_deletions` doktrini birebir kopyalandı: **RLS + FORCE, sıfır politika**
(`authenticated`'a S/I/U/D grant var ama politika yok → her işlem RED),
`service_role`'e **doğrudan tablo yetkisi bile yok**, tek yazar
`record_coach_action()` (SECURITY DEFINER, EXECUTE yalnızca `service_role`).
Kişisel veri minimizasyonu: e-posta/IP/user-agent **yazılmıyor** — yalnızca
`actor_id`/`target_id` (uid, `profiles`'a FK) + `action` + `occurred_at` +
`request_id`.

**FK kararı ayrıştırıldı:**

- `actor_id` (koç) → `ON DELETE SET NULL` — koç hesabı elle silinse bile
  "birisi bu danışana müdahale etti" izi kalır, yalnızca "kim" bilgisi gider.
- `target_id` (danışan) → `ON DELETE CASCADE` — danışan `delete_account()` ile
  silinince KVKK "unutulma hakkı" gereği bu satır da gitmeli; `target_id` bu
  yüzden `NOT NULL` (kimliksiz bir müdahale kaydının anlamı yok).

**Denetim yazımı başarısız olursa sıfırlama İPTAL edilir** (fail-closed, 500) —
sıra bilinçli: yazma, e-posta tetiklemeden **önce** geliyor. Gerekçe: iz
bırakmadan yapılan bir müdahale, hiç yapılamayan bir müdahaleden **daha
kötüdür** (KVKK m.12 hesap verebilirliği). Ters sıra "müdahale oldu ama izi
yok" senaryosunu mümkün kılardı.

`delete_account()` manifesti **14 → 15 tabloya** çıkarıldı (`coach_actions`
eklendi); `account_deletion_manifest()` `coach_actions`'ı `target_id` üzerinden
sayıyor (koçun aktör olduğu satırlar `SET NULL` ile korunuyor, silme kapsamına
girmiyor).

**Okuma politikası kararı — sıfır politika (kayda geçirildi).** Değerlendirilen
alternatif: koç kendi eylemlerini ya da danışan kendisiyle ilgili müdahaleleri
görebilsin. İkisi de KVKK şeffaflığı açısından savunulabilir ama **bu dilimin
kapsamı dışında** yeni bir ürün yüzeyi (okuma RPC'si + sayfalama + hız sınırı +
enumerasyon riski) açacağı için reddedildi — bugün hiçbir arayüz tüketicisi
yok. KVKK m.12 hesap verebilirliği önce veri sorumlusuna karşıdır ve bu ihtiyaç
doğrudan veritabanı erişimiyle (psql/Studio) zaten karşılanıyor.

---

## E-posta

Supabase'in yerleşik e-posta servisi saatte 2 e-posta ile üretime uygun değil.
Kullanıcı **Gmail App Password + custom SMTP** bağladı (Fable kararı: yalnızca
yayın öncesi köprü). **Resend + kendi alan adına geçiş, ilk gerçek danışan
gelmeden ZORUNLU** — gerekçe: `@gmail.com`'dan gelen sıfırlama e-postası
kimlik avı kalıbına benziyor, SPF/DKIM kendi alan adıyla hizalanamıyor, Google
kişisel hesapta otomatik gönderimi kapatabilir, ve KVKK m.9 için Google ile
veri işleyen sözleşmesi kurulamıyor.

---

## Doğrulama tablosu

| Kapı                                                               | Sonuç                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm run test` / `test:coverage`                                  | 64 dosya / **793 test** · lines+stmts **%64.97** · branch 81.37 · funcs 67.19 (eşik 60/60/55, düşürülmedi)                                                                                                               |
| `pnpm run test:rls`                                                | **136 senaryo** (131 → +5: 132-136)                                                                                                                                                                                      |
| `node scripts/identity-ratchet.mjs`                                | exit 0 — "Tüm sayaçlar tavanla eşit" (font-black 25/25, rounded-3xl 15/15, gradient 12/12)                                                                                                                               |
| `pnpm run lint` / `type-check` / `type-check:e2e` / `format:check` | temiz                                                                                                                                                                                                                    |
| `pnpm run build`                                                   | Compiled successfully                                                                                                                                                                                                    |
| `pnpm audit --prod --audit-level=high`                             | exit 0                                                                                                                                                                                                                   |
| `pnpm run test:e2e`                                                | **54 passed, 4 skipped** (1.3 dk), exit 0 — atlanan 4 test önceden de atlanıyordu (ortam koşuluna bağlı spec'ler), yeni bir atlama yok. Koç spec'leri `aal2` fixture'ıyla geçti — `aal2` RLS kapısı E2E'de de doğrulandı |

---

## Kapsam dışı bırakılan ve borç açılan

Aşağıdaki üç madde bu turda bilerek kapsam dışı bırakıldı ve `docs/PROGRESS.md`
§3'e yeni borç olarak eklendi (bkz. o tabloda B-061/B-062/B-063):

- MFA kayıt/seviye yükseltme ekranlarında "bu işlem diğer cihazlardaki
  oturumlarınızı sonlandırır" uyarısı yok (ADR-0026 §Kalan risk 6'nın
  azaltıcısı — uygulanması davranışı değiştirmez, yalnızca açıklar).
- Gmail SMTP köprüsü ilk gerçek danışandan önce Resend + kendi alan adına
  taşınmalı.
- Danışan MFA'ya kaydolup cihazını kaybederse kurtarma yalnızca `service_role`
  bakım script'iyle mümkün; script henüz yazılmadı (ADR-0026 §Karar 5 bunu
  öngörüyor).

Ayrıca ADR-0026 §Kalan risk 2'nin öngördüğü E2E MFA uyarlaması bu turda
**yapıldı** (bkz. "Öngörülmeyen kararlar" madde 7-8) — ADR'de "ayrı bir dilim
olarak izlenmeli" diye not düşülmüştü, gerçekte aynı turda tamamlandı.

---

## Faz 4.7 sonucu

**TAMAMLANDI (2026-08-19).** TOTP MFA çekirdeği + `aal2` RLS kapısı (ADR-0026),
koç tetiklemeli şifre sıfırlama, `coach_actions` denetim tablosu ve ilgili E2E
uyarlaması teslim edildi. RLS 126 → **136 senaryo**, vitest 763 → **793 test**
(62 → 64 dosya). Sırada **Faz 4.8 — Etkinlik Kaydı**
(`active_planprogram.md` §7c); ayrıca bekleyen kullanıcı aksiyonları var
(alan adı + Resend geçişi, B-033 anahtar rotasyonu, B-030 gerçek yedek, repo'nun
OneDrive'dan çıkarılması, dependabot majörleri #13-#22). Ayrıntı:
`docs/PROGRESS.md` §5.
