# ADR-0026 — TOTP çok faktörlü kimlik doğrulama ve koç hesabı için `aal2` kapısı

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-19
- **Karar verenler:** Faz 4.7 dilim 1 (TOTP MFA çekirdeği) turu
- **İlgili:** ADR-0007 (tek koçlu model) · ADR-0010 (koç profili herkese görünür) ·
  **ADR-0022 (oturum depolaması — bu ADR'nin dayandığı mimari kısıt)** ·
  ADR-0024 (`@repo/api-client` enjeksiyonu) · **ADR-0025 (14 tablo listesinin kaynağı)** ·
  ADR-0016 (lucide ikon seti) · ADR-0018 (kimlik ratchet'i)
- **Uygulama:** `supabase/migrations/20260819120000_mfa_aal2_gate.sql` ·
  `packages/api-client/src/hooks/useMfa.ts` ·
  `apps/web/src/components/security/**` · `apps/web/src/app/profile/page.tsx` ·
  `apps/web/src/app/page.tsx` (yönlendirme kapısının mount noktası)
- **Kanıt:** `supabase/tests/rls.test.sql` senaryo **127–131** (paket 126 → 131) ·
  `apps/web/tests/unit/mfa-enroll.test.tsx`

---

## Bağlam

Koç hesabı bu uygulamadaki **tek en değerli kimliktir**. Tek koçlu modelde (ADR-0007) o
hesabın arkasında istisnasız **her danışanın** vücut ölçümleri, ilerleme fotoğrafları,
sağlık/beslenme günlükleri ve koçla yaptığı tüm yazışmalar duruyor. Bugün o kapıyı açan tek
şey **bir parola**.

Danışan hesapları için tablo farklı: her danışan yalnızca kendi verisini görür. Bir danışan
hesabının ele geçirilmesinin yarıçapı bir kişidir; koç hesabınınki **tüm kullanıcı tabanıdır**.

### Yöntem seçimi: TOTP (verilmiş karar)

**TOTP** (RFC 6238, kimlik doğrulayıcı uygulama). Gerekçe: Supabase'de tüm planlarda ücretsiz
ve açık; SMS ise hem ücretli bir sağlayıcı gerektirir hem de SIM-swap'a açıktır — ikinci
faktör olarak parolanın üstüne net bir güvence katmaz. **SMS kapsam dışıdır.**

### Bu ADR'nin dayandığı, DEĞİŞMEYEN mimari kısıt

ADR-0022 §"Mimarinin sabit kabul edilen kısıtı" şunu kayda geçirmişti: uygulama tarayıcıdan
**doğrudan** `supabase.from(...)` çağırıyor, realtime `.channel(...)` kullanıyor, arada BFF
yok — ve _"güvenlik sınırı token'ın gizliliği değil, veritabanı tarafındaki RLS'tir"_.

Bu ADR o kısıtı **değiştirmez**, üstüne inşa eder. Kapının nereye konacağı sorusunun cevabı
doğrudan oradan çıkıyor (bkz. Karar 1).

---

## Ölçülen gerçekler (varsayım değil)

Aşağıdaki dördü bu tur sırasında yerel yığında **canlı olarak** ölçüldü.

1. **`is_coach()` aal1'de de doğru cevap veriyor.** Politika `profiles` tablosunu da
   kapsadığı için "koç mu?" sorusunun `profiles` okunarak cevaplanması artık **imkânsız**
   (koç kendi satırını göremez). `public.is_coach()` `SECURITY DEFINER` ve sahibi `postgres`;
   `postgres` `rolbypassrls = t` olduğundan fonksiyon RLS'e hiç tabi değil. Canlı ölçüm:
   aal1'deki koç için `select public.is_coach()` → `t`, danışan için → `f`. Arayüzün rol
   sorusu bu yüzden `profiles`e değil bu RPC'ye bağlandı.

2. **Kapı, kurulduğu gibi çalışıyor.** Aynı seed verisi üzerinde:

   | Kimlik / claim             | `profiles` | `daily_logs` |
   | -------------------------- | ---------- | ------------ |
   | Koç, `"aal":"aal1"`        | **0**      | **0**        |
   | Koç, `"aal":"aal2"`        | 3          | 29           |
   | Koç, `aal` claim'i **YOK** | **0**      | —            |
   | Danışan, `"aal":"aal1"`    | 2          | 15           |

   Son iki satır iki ayrı kararın kanıtı: claim yorumlanamıyorsa **fail-closed**, ve
   **danışan hiç etkilenmiyor**.

3. **`public` şemasında 18 tablo var, 14'ü danışan verisi taşıyor.** Kalan 4: `exercises` ve
   `food_database` (katalog, kullanıcı kolonu yok), `account_deletions` ve
   `message_attachment_verifications` (denetim/damga; ikisi de RLS+FORCE ve **sıfır
   politika** ile zaten herkese kapalı).

4. **Yerel GoTrue'da TOTP KAPALI geldi.** `GOTRUE_MFA_TOTP_ENROLL_ENABLED=false`,
   `GOTRUE_MFA_TOTP_VERIFY_ENABLED=false`. Yani `supabase/config.toml` açıkça açmadan ve
   yığın yeniden başlatılmadan kayıt akışı çalışmaz — bkz. "Kalan risk".

---

## Karar

### 1) Kapı **RLS'te** durur, route'ta değil

Zorunluluk 14 tabloya kurulan tek kalıplı bir **RESTRICTIVE** politikadır:

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

**Neden route/middleware yetmez:** ADR-0022'nin sabit kısıtı gereği tarayıcı Supabase'e
doğrudan gidiyor. Next.js tarafındaki her kapı — sayfa, `proxy.ts`, route handler — anon key
ve oturum cookie'siyle atılan düz bir `fetch` tarafından **atlanabilir**. İstemcide "MFA
zorunlu" demek, kapıyı kilitleyip anahtarı kapının üstüne asmaktır. Bu kod tabanında
yetkilendirmenin tek gerçek sınırı RLS'tir ve zorunluluk oraya, satır seviyesine yazılmalıdır.

Politikanın her parçası bir karardır:

| Parça              | Neden                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `as restrictive`   | PERMISSIVE olsaydı mevcut politikalarla **VEYA**'lanır ve kurulduğu anda **hiçbir şeyi kısıtlamazdı**                                                                |
| `for all`          | select/insert/update/delete dördü birden                                                                                                                             |
| `to authenticated` | `postgres`/`service_role` zaten `rolbypassrls`; onları listelemek yanıltıcı güvenlik olurdu. `anon`un bu tablolarda yetkisi yok                                      |
| `not (select ...)` | Alt sorgu ifadeyi satır başına değil **sorgu başına bir kez** çalışan initplan'a çevirir; koç panelinin liste sorguları yavaşlamaz                                   |
| `with check` açık  | `for all`'da Postgres `using`i zaten kopyalar; yine de açık yazılıyor ki `pg_policies.with_check` NULL kalmasın ve sürüklenme testi **yazma tarafını da ölçebilsin** |

### 2) Kapsam: **koç zorunlu, danışan opt-in**

`not is_coach()` dalı danışan için her zaman `true` döner; RESTRICTIVE politika `true`
verdiğinde mevcut PERMISSIVE politikaların sonucunu değiştirmez. **Danışan yolu hiç
etkilenmez** — `aal` claim'i `aal1` olsun, hiç olmasın, fark etmez.

Danışan için MFA **opt-in**'dir: aynı arayüzden kurabilir, kurmazsa uygulamayı bugünkü gibi
kullanmaya devam eder. Zorunlu kılmamanın gerekçesi risk yarıçapıdır (bkz. Bağlam) — ve
zorunlu kılmak, ikinci faktörünü kaybeden her danışan için koça manuel kurtarma yükü
bindirirdi.

### 3) Fail-closed: koç aal1'de **salt okunur bile değil**

"Okusun ama yazamasın" ara kararı bilerek **alınmadı**. Koç panelinin okuduğu şey zaten tüm
danışanların fotoğrafları, ölçümleri ve yazışmalarıdır; çalınan bir parolanın açtığı en büyük
kapı **yazma değil okumadır**.

Aynı disiplin claim'in yokluğunda da geçerlidir: `auth.jwt() ->> 'aal'` NULL dönerse
`NULL = 'aal2'` NULL'dır, politika `false` sayar → **koç reddedilir**. Gerçek GoTrue
token'ları `aal`i her zaman taşır (auth-js `RequiredClaims` tipi onu zorunlu alan olarak
tanımlar); bu dal pratikte yalnızca elle üretilmiş claim setlerinde görülür.

### 4) 14 tablonun listesi **ADR-0025'ten devralınır, yeniden türetilmez**

Liste `delete_account()`in manifestiyle (`20260819100000_account_deletion.sql`) **birebir
aynıdır** ve gerekçesi ADR-0025 §Ölçülen gerçekler 1'de kayıtlıdır:

- doğrudan kullanıcı kolonu taşıyan 12: `profiles`, `notifications`, `messages`,
  `form_checks`, `daily_logs`, `workout_logs`, `nutrition_logs`, `program_approvals`,
  `workout_plans`, `nutrition_plans`, `progress_entries`, `progress_photos`
- plan üzerinden dolaylı 2: `workout_plan_exercises`, `nutrition_plan_meals`

**Neden aynı liste:** "danışan verisi taşıyan tablo" tanımı bu kod tabanında **bir kez**
verilmiştir. İkinci bir liste yazmak, ikisinin bir gün ayrışacağı anlamına gelirdi — ve
ayrışma sessiz olurdu: silme kapsar ama koruma kapsamaz (ya da tersi). Sürüklenme hem
migration'ın doğrulama bloğunda hem `rls.test.sql` senaryo 131'de **sayılarak** kapatıldı:
`public` şemasında 14 kapılı tablo ve 4 bilinen muafiyet dışında bir tablo çıkarsa test
gürültülü patlar.

### 5) Kurtarma: **düz metin secret, HTTP ucu YOK**

Kayıt ekranı TOTP secret'ını QR'ın yanında **düz metin olarak da** gösterir. Koç onu parola
kasasına yazar; aynı secret'la ikinci bir cihazı da tanımlayabilir. **Kurtarma yolunun
tamamı budur.**

MFA'yı sıfırlayan bir sunucu ucu **bilerek yazılmadı**. Böyle bir uç, korumaya çalıştığı şeyi
tam olarak geri verirdi: koç hesabını (ya da onu sıfırlayabilen operatör kimliğini) ele
geçiren biri, **tek hamlede** ikinci faktörü yok edip parolayla içeri girerdi. İkinci faktörün
tüm değeri, parolanın tek başına yetmemesindedir; bir "sıfırla" düğmesi onu yeniden tek
faktöre indirger. Aynı disiplin ADR-0025 §3'te `service_role` yüzeyi için de kuruldu ve o
yüzey **iki fonksiyonla sınırlı** kalmalıdır — bu tur ona **hiçbir şey eklemedi**.

### 6) Zorunlu yönlendirmenin yeri: **dashboard mount'u** (`apps/web/src/app/page.tsx`)

Koç girişten sonra doğrulanmış faktörü yoksa (ya da faktörü var ama oturum hâlâ aal1'deyse)
`/profile#guvenlik`e yönlendirilir. Kapı `<CoachMfaGate />` istemci bileşenidir ve `/`
sayfasına mount edilir.

**Neden orası:**

- `/login` başarılı girişte `router.push('/')` yapıyor — `/` her oturumun **ilk durağıdır**.
- **Proxy/middleware katmanı bu kararı veremez.** Rol `profiles` tablosunda yaşıyor ve
  aal1'deki koça o tablo RLS ile kapalı; proxy'nin rolü öğrenmesi ya her istekte bir
  veritabanı turu ya da `service_role` kullanmak demekti. İkincisi ADR-0025'in özenle dar
  tuttuğu yüzeyi **salt bir arayüz yönlendirmesi için** genişletirdi. Reddedildi.
- Bu proje Next 16 konvansiyonuyla `middleware.ts` değil `src/proxy.ts` kullanıyor
  (ADR-0022 uygulama notu). **Bu turda `proxy.ts`'e dokunulmadı.**

**Ve bu yönlendirme bir güvenlik sınırı değildir.** Atlatılabilir; atlatıldığında da koç
14 tablonun hiçbirini göremez. Tek işlevi, koçun sebebini anlamadığı boş bir panelle
karşılaşmasını engellemektir.

### 7) Arayüzün taşımak zorunda olduğu iki dal

1. **`profiles` de kapının içinde olduğu için** aal1'deki koç kendi profil satırını bile
   okuyamaz. `/profile` sayfasının "profil yoksa skeleton göster" erken dönüşü bu durumda
   koçu **sonsuz skeleton**'da bırakır ve kayıt ekranına hiç ulaştırmazdı — yani zorunluluk,
   kendisini karşılamanın tek yolunu kapatırdı. Sayfa bu yüzden bölündü: profil okunamıyorsa
   **kilitli görünüm** (açıklayıcı uyarı + Güvenlik bölümü) render edilir.
2. **Seviye yükseltme (step-up) dalı zorunludur.** Parolayla her giriş `aal1` verir; `aal2`
   yalnızca `challenge()` + `verify()` ile kazanılır. Yalnızca "kayıt" dalı yazılsaydı, kayıt
   olmuş koç bir daha **hiç** içeri giremezdi.

---

## Reddedilen alternatifler

**(A) Kapıyı yalnızca route/middleware katmanına koymak.** Reddedildi: ADR-0022'nin sabit
kısıtı altında istemci Supabase'e doğrudan gidiyor; bu kapı düz bir `fetch` ile atlanır.
Güvenlik değil, güvenlik hissi üretirdi.

**(B) Koçu aal1'de salt-okunur bırakmak.** Reddedildi: korunan şeyin kendisi okumadır
(danışan fotoğrafları, ölçümleri, yazışmaları). Yazmayı kapatıp okumayı açmak, hırsızın
almak istediği şeyi ona bırakıp not defterini kilitlemektir.

**(C) MFA sıfırlayan bir sunucu ucu / kurtarma kodu ucu.** Reddedildi: koç hesabını ele
geçiren birine "ikinci faktörü kaldır" düğmesi verirdi — ikinci faktörü tek hamlede yok eden
bir devralma yüzeyi. Kurtarma, secret'ın düz metin gösterilmesiyle **kullanıcının kendi
elinde** bırakıldı (Karar 5).

**(D) SMS ikinci faktör.** Reddedildi: ücretli sağlayıcı gerektirir ve SIM-swap'a açıktır;
parolanın üstüne net bir güvence katmaz. Görev sözleşmesinde de kapsam dışı.

**(E) Danışan için de MFA'yı zorunlu kılmak.** Reddedildi: risk yarıçapı bir kişiyle
sınırlıyken bedel yüksek — ikinci faktörünü kaybeden her danışan koça manuel kurtarma yükü
bindirirdi ve kurtarma ucu (C) zaten reddedildi. Danışan için **opt-in** yeterli.

**(F) 14 tablo yerine "koçun okuduğu tablolar" diye ikinci bir liste türetmek.**
Reddedildi: "danışan verisi taşıyan tablo" tanımı ADR-0025'te bir kez verildi. İkinci bir
liste, ikisinin sessizce ayrışacağı gün demektir (Karar 4).

**(G) `aal` claim'i yoksa geçir (backward-compatible olmak).** Reddedildi: fail-open bir
varsayılan, tam da anlaşılmayan durumlarda kapıyı açardı. Bedeli, `rls.test.sql`'deki 36 koç
claim satırına `"aal":"aal2"` eklemek oldu — ve o 36 satırın eklenmeden kırmızı vermesi,
kapının çalıştığının kanıtıdır.

**(H) Yönlendirmeyi `proxy.ts`'e koymak.** Reddedildi: proxy rolü bilemez; öğrenmesi için
`service_role` gerekirdi (Karar 6).

---

## Kalan risk (dürüstçe kayda geçirilir)

1. **Yerel/barındırılan GoTrue'da TOTP açılmadan bu iş çalışmaz — ve koç KİLİTLENİR.**
   Ölçüm 4: yerel yığında `GOTRUE_MFA_TOTP_ENROLL_ENABLED=false`. Migration uygulandıktan
   sonra, TOTP açılıp yığın yeniden başlatılana kadar koç ne veri görebilir ne de kayıt
   olabilir. `supabase/config.toml`'a `[auth.mfa.totp] enroll_enabled/verify_enabled = true`
   eklendi; **ancak env değişkenleri konteyner oluşturulurken sabitlendiği için yığının
   `supabase stop && supabase start` ile yeniden kurulması gerekir.** Bu tur yerel yığında
   canlı veri bulunduğu için yeniden başlatmayı **yapmadı**; operatör adımı olarak açık
   bırakıldı. Barındırılan projede aynı ayar Dashboard'dan açılmalıdır.

2. **E2E paketinin koç akışları bu turdan sonra kırılır.** 8 spec dosyası koç kimliğiyle
   koşuyor (`dashboard`, `form-check`, `messaging`, `nutrition`, `plans`, `progress`,
   `workout`, ve `fixtures.ts`). Koç oturumu aal1'de kalacağı için hepsi boş veri görür.
   Fixture'ın giriş sonrası TOTP kodunu üretip `verify()` çağırması gerekir (secret testte
   üretilebilir; RFC 6238 hesabı deterministiktir). Bu, **bu dilimin kapsamı dışında**
   bırakıldı ve ayrı bir dilim olarak izlenmelidir.

3. **Son faktörünü kaldıran koç kendini kilitler.** Arayüz bunu **söyler ama yasaklamaz** —
   yasaklamak istemci tarafında bir "hayır" olurdu, `fetch` ile atlanırdı. Çıkış yolu yeniden
   kayıt olmaktır; kayıt akışı aal1'de de çalışır (GoTrue RLS'e tabi değildir), yani kilit
   kalıcı değildir.

4. **Studio'dan "impersonate" yanıltır.** Supabase Studio'nun kullanıcı taklidi varsayılan
   olarak `aal1` claim'i üretir. Studio'da koç olarak sorgu çalıştıran biri boş sonuç görüp
   "RLS bozuldu" sanabilir. Bozulmamıştır; kapı tasarlandığı gibi çalışmaktadır. Migration
   başlığında da uyarı olarak duruyor.

5. **`aal2` oturum ömrüyle sınırlıdır, işlem başına değil.** Bir kez doğrulanan oturum
   `jwt_expiry` (900 sn) boyunca ve yenilendikçe aal2 kalır. "Her hassas işlemde yeniden
   doğrula" (per-action step-up) bu turun kapsamında değil; gerekirse ayrı bir tur işidir.

6. **GoTrue, MFA `verify` sırasında kullanıcının DİĞER oturumlarını iptal ediyor.** Bu bir
   tahmin değil, ölçüm: E2E fixture turunda ham `fetch` ile, aynı kullanıcı için üç eşzamanlı
   oturum açılarak doğrulandı — `verify` **öncesinde** üçü de `/auth/v1/user` çağrısında `200`
   dönerken, `verify` **sonrasında** ikisi `403 session_not_found` verdi.

   **Pratik sonuç:** koç ikinci bir cihazda seviye yükselttiğinde (ya da ilk kez kaydolduğunda)
   diğer cihazlardaki oturumları düşer ve oralarda yeniden giriş yapması gerekir.

   **`useSignOut`'un `scope: 'local'`e çekilmesiyle ÇÖZÜLMEZ.** İkisi farklı yollardır: o
   değişiklik _bizim_ çıkış çağrımızın diğer cihazları düşürmesini engeller; buradaki iptali
   yapan GoTrue'nun MFA doğrulama davranışıdır ve **bizim kontrolümüzde değildir**. İki maddeyi
   birbirinin çözümü sanmak, düzeltilmiş görünen bir kusur bırakırdı.

   **Etkiyi kim hisseder:** bugün pratik olarak yalnızca **koç** — danışan için MFA opt-in ve
   danışanların çoğu tek cihaz kullanıyor. Danışanlar MFA'ya kaydoldukça bu yüzey büyür.

   **Azaltıcı (BU TURDA YAPILMADI, bilinçli):** kayıt ve seviye yükseltme ekranlarında
   "bu işlem diğer cihazlardaki oturumlarınızı sonlandırır" uyarısı göstermek. Karar kayda
   geçirildi ama uygulama **ayrı bir arayüz dilimine** bırakıldı; bu dilimin kapsamı MFA
   çekirdeğidir ve uyarı metni davranışı değiştirmez, yalnızca açıklar.

   **Ölçüm izi:** bulgu, E2E fixture turunda `apps/web/tests/e2e/coach-mfa.ts` çalışırken
   ortaya çıktı. E2E tasarımı bu yüzden **"koşu başına tek `aal2` oturumu"** modeline geçti —
   her spec kendi `verify`ini yapsaydı, her doğrulama diğer spec'lerin oturumlarını iptal
   ederdi. Yan kazanç ölçüldü: paket süresi **2.9 dk → ~45 sn**.

---

## Sonuçlar

**Kazanımlar**

- Koç hesabının parolası tek başına **hiçbir danışan verisini açmıyor**. Kapı istemcide değil
  satır seviyesinde; route bypass edilse bile geçilemiyor.
- Danışan yolu **ölçülerek** korundu: `rls.test.sql` senaryo 130, 14 tablonun hepsinde
  "claim'siz" ve "açık `aal1`" sonuçlarının birebir aynı olduğunu doğruluyor ve "her şey
  kilitlendi, 0 = 0 eşitliği geçti" biçiminde boş geçmeye karşı koruması var.
- Sürüklenme kapatıldı: 15. bir danışan tablosu eklenip listeye yazılmazsa migration
  doğrulaması ve senaryo 131 gürültülü patlıyor — sessizce korumasız kalmıyor.
- `service_role` yüzeyi **hiç genişlemedi** (ADR-0025 §3'ün sınırı korundu); yeni HTTP ucu
  yok.
- RLS paketi 126 → **131 senaryo**.

**Bedeller**

- `rls.test.sql`'deki 36 koç claim satırı `"aal":"aal2"` taşımak zorunda; koç kimliğiyle
  yazılacak her yeni senaryo da öyle. (Bu, fail-closed kararının doğrudan bedelidir.)
- E2E paketinin koç akışları ayrı bir dilimde MFA'ya uyarlanmalı (Kalan risk 2).
- Yerel ve barındırılan ortamlarda TOTP'un açık olması **operasyonel bir ön koşul** hâline
  geldi (Kalan risk 1).
- `/profile` sayfası artık iki farklı görünüm taşıyor (tam / kilitli); karmaşıklık arttı.
- Koç için kurtarma tamamen kullanıcının secret'ı saklamasına bağlı — secret kaybedilirse
  çözüm yalnızca doğrudan veritabanı erişimiyle faktör satırının silinmesidir.
