# ADR-0027: Danışan daveti — `inviteUserByEmail`, açık `aal2` kapısı ve iki fazlı denetim

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-20
- **Karar verenler:** Faz 4.9 dilim 1 (danışan daveti) turu
- **İlgili:** ADR-0007 (tek koçlu model) · ADR-0025 (hesap silme ve `service_role` sunucu
  yolu — yüzey denetimi emsali) · ADR-0026 (TOTP MFA ve `aal2` kapısı) ·
  `supabase/migrations/20260817160100_signup_role_hardening.sql` (rol sertleştirmesi) ·
  `apps/web/src/app/api/coach/reset-client-password/route.ts` (denetim/hız sınırı deseni) ·
  borç **B-058** (koç-danışan atama tablosu yok)
- **Uygulama:** `supabase/migrations/20260820160000_coach_invite_action.sql` ·
  `apps/web/src/app/api/coach/invite-client/route.ts`
- **Kanıt:** `supabase/tests/rls.test.sql` senaryo **145** · `apps/web/tests/unit/invite-client.test.ts`

---

## Bağlam

`supabase/config.toml`'da `enable_signup = false` bilinçli bir karardır (ADR-0007, tek-koçluk
model): uygulama kendi kendine kayıt kabul etmez. Bu, `20260817160100_signup_role_hardening.sql`
ile pekiştirilen "yeni kullanıcı koç olarak doğamaz" invaryantının doğal tamamlayıcısıdır — ama
yan etkisi şudur: **bugüne dek yeni bir kullanıcı (danışan) yaratmanın tek yolu seed script'i ya
da Supabase Studio'dan elle satır eklemekti.** Koçun ürünü gerçek kullanıcılarla kullanabilmesi
için bu yolun kapatılması gerekiyordu; Faz 4.9 dilim 1 bu boşluğu sunucu ucu seviyesinde kapatır
(arayüz — davet formu, davet listesi — **bu dilimin kapsamında değildir**, bkz. Bedeller).

Gereksinim iki çelişen kısıtı aynı anda taşıyor: (1) `enable_signup = false` açık kalmalı — self
servis kayıt yeniden açılmamalı; (2) koç yine de yeni bir danışanı sisteme sokabilmeli. Cevap,
GoTrue Admin API'sinin `inviteUserByEmail` uç noktasıdır — `enable_signup` ayarından **bağımsız**
çalışan, yalnızca `service_role` ile çağrılabilen ayrıcalıklı bir kullanıcı oluşturma yoludur.

---

## Karar 1 — Mekanizma: `supabase.auth.admin.inviteUserByEmail`

Sunucu ucu, koçun girdiği e-postayı (ve isteğe bağlı `full_name`'i)
`supabase.auth.admin.inviteUserByEmail(email, { data: { full_name? }, redirectTo })` ile
çağırır. Dönüş tipi `UserResponse`'tur — **`action_link` alanı yoktur**; davet bağlantısı hiçbir
biçimde sunucu yanıtına, sunucu belleğine ya da loga girmez. E-postayı Supabase kendi SMTP
yapılandırmasıyla gönderir; danışan bağlantıya tıklayıp **kendi şifresini kendi belirler** —
koç şifreyi hiç görmez, hiç belirlemez.

### Reddedilen üç alternatif

**(a) `admin.createUser` + geçici şifre.** Reddedildi: koç, danışan için ürettiği geçici şifreyi
**görür** — koç-danışan arasındaki yapısal güç dengesizliği (koç zaten danışanın tüm sağlık/vücut
verisini görüyor, ADR-0026 Bağlam) düşünüldüğünde bu kabul edilemez bir ek yetkidir. Daha kötüsü,
koç bu şifreyle **danışan olarak giriş yapabilir hâle gelir** — hesabın sahibi olmayan biri
hesabın tam kontrolünü eline alır. `inviteUserByEmail`'de böyle bir şifre hiç üretilmez.

**(b) `admin.generateLink({ type: 'invite' })`.** Reddedildi — ve bu red **yeni** bir gerekçe
değil, **aynı** gerekçenin ikinci kez uygulanmasıdır: `reset-client-password/route.ts` satır
9–13'te `generateLink({ type: 'recovery' })` tam olarak bu sebeple reddedilmişti.
`generateLink` bağlantıyı **yanıtta döndürür** (`data.properties.action_link`); e-postayı bu
durumda **biz** göndermek zorunda kalırdık (nodemailer vb.), ki bu ayrı bir SMTP entegrasyonu ve
bağlantının en az bir kez sunucu sürecinden geçmesi demektir. "Koç bağlantıyı asla görmez"
iddiası böyle bir tasarımda **tip sistemine değil kod incelemesi ve loglama disiplinine bağımlı**
hale gelir — daha kırılgan bir garanti. `inviteUserByEmail`'in `UserResponse` dönüş tipinde
`action_link` alanı **yapısal olarak yoktur**; bu, derleyicinin kanıtladığı bir garantidir.

**(c) Self-servis kayıt (`enable_signup = true`).** Reddedildi: `supabase/config.toml`'daki
`enable_signup = false` ADR-0007'nin tek-koçluk model kararıdır ve bilinçlidir. Açmak ürün
modelini kökten değiştirir (herkes kendi kendine kaydolabilir hale gelir) ve
`20260817160100_signup_role_hardening.sql`'in kapattığı AC-02 yüzeyini (rol yükseltme saldırı
yüzeyi) yeniden canlandırma riskini taşır — o migration'ın rol sertleştirmesi hâlâ geçerlidir
(Karar 2), ama "herkes hesap açabilir" kapısını yeniden açmanın kendisi ayrı, istenmeyen bir
ürün kararıdır.

---

## Karar 2 — Rol garantisi tetikleyiciden gelir, route disiplininden değil

`on_auth_user_created` tetikleyicisi → `public.handle_new_user()`
(`20260817160100_signup_role_hardening.sql`) rolü **koşulsuz** `'client'` olarak sabitler ve
`raw_user_meta_data ->> 'role'` alanını **okumaz bile**. Davet ucu, metadata'ya en fazla
`full_name` koyar; zod şemasında `role` alanı **hiç yoktur** ve şema `.strict()`'tir — bilinmeyen
bir alan (örn. `role`) gövdede gelirse istek **422** ile reddedilir.

Sonuç üç kat garanti, ama yalnızca biri **asıl** garantidir:

1. Zod şeması `role` alanını kabul etmez (`.strict()` → bilinmeyen alan 422).
2. Route, GoTrue'ya gönderdiği `data` nesnesine `role` koymaz (yalnızca `full_name`).
3. Tetikleyici, `raw_user_meta_data ->> 'role'`'ü **okusa bile** yok sayar — rol her koşulda
   `'client'`.

**Asıl garanti (3)'tür.** (1) ve (2) yalnızca route'un bugünkü davranışını tarif eder ve route'un
kendisi değiştirilirse (örn. bir gün başka bir geliştirici zod şemasına yanlışlıkla `role` alanı
eklerse) kırılabilir. (3) ise veritabanı seviyesinde durur ve route'un ne yaptığından tamamen
bağımsızdır — route metadata'ya `{"role":"coach"}` gönderse **bile** doğan profilin rolü
`client`'tır. Bu iddia RLS testiyle kanıtlanır (senaryo 145): metadata'ya `role: coach` konsa
bile doğan profilin rolü `client` olarak ölçülür.

**Ölçüm notu — bu iddiayı migration ön koşulu da doğrular, ve bir tuzağı önler.**
`20260820160000_coach_invite_action.sql`'in ön koşul bloğu, davet ucunu kurmadan önce
`handle_new_user()`'ın gerçekten rolü sabit yazdığını canlı olarak ölçer:
`pg_get_functiondef()` ile fonksiyon gövdesini çekip hem negatif iddiayı (`raw_user_meta_data ->>
'role'` okumuyor) hem pozitif iddiayı (`'client'::public.user_role` yazıyor) kontrol eder. Burada
ölçülen bir tuzak vardı: `pg_get_functiondef()` fonksiyonun **yorum satırlarını da** döndürür ve
`handle_new_user()`'ın kendi gövdesinde tam olarak "`raw_user_meta_data ->> 'role'` BİLEREK
OKUNMAZ" diyen bir açıklama satırı vardır — ham metinde arama yapmak bu yüzden **yanlış pozitif**
verir (ilk denemede verdi). Çözüm, `--` ile başlayan yorumları `regexp_replace(...)` ile
temizledikten **sonra** iki iddiayı da kurmaktır. Bu, ADR'lerin "ölçüldü, varsayılmadı"
disiplinine tam uyan küçük ama gerçek bir bulgu.

---

## Karar 3 — `aal2` açıkça doğrulanır: "tesadüfi koruma" analizi

`reset-client-password`'deki MFA koruması **tesadüfidir** ve bu tesadüfilik burada da açık bir
şekilde kayda geçirilmelidir, çünkü bu ADR o tesadüfün **kırıldığı** yeri belgeliyor:

- Uç #5'te (`reset-client-password`) route, hedef danışanın profilini **koçun kendi RLS
  bağlamında** okur (`.from('profiles').eq('id', clientId)`). `mfa_aal2_gate` RESTRICTIVE
  politikası (ADR-0026) `profiles` tablosunu da kapsadığı için, `aal1`'deki bir koç bu sorguda
  **0 satır** görür ve doğal olarak `404 CLIENT_NOT_FOUND`'a takılır. Koruma **var**, ama onu
  sağlayan şey açık bir `aal` kontrolü değil, RLS'in başka bir amaçla (danışan verisini korumak
  için) zaten orada durmasıdır.
- Davet ucunda hedef **henüz yoktur** — davet edilecek e-posta `profiles`'ta bir satıra karşılık
  gelmiyor, okunacak bir profil yok, dolayısıyla o doğal kapı **yoktur**.
- Üstüne üstlük `is_coach()` `SECURITY DEFINER`'dır ve RLS'i **bypass eder** (ADR-0026 Ölçülen
  gerçekler 1) — yani "koç mu?" kontrolü `aal1`'deki bir koç için de `true` döner.

Bu iki gerçek birleşince sonuç açık: **eğer route `aal` claim'ini açıkça doğrulamasaydı, çalınmış
bir parola tek başına davet göndermeye — yani sisteme yepyeni bir kullanıcı yaratmaya —
yeterli olurdu.** Hiçbir RLS politikası, hiçbir "hedef profili okunamıyor" tesadüfü bunu
engellemezdi.

Bu yüzden route, `authClient.auth.getUser(accessToken)` ile **doğrulanmış** access token'ın
kendisinden `aal` claim'ini okur; claim yoksa ya da `aal2` değilse **403, fail-closed**. Yerel
çözümlemenin güvenli olmasının sebebi şudur: token'ın gerçekliği zaten GoTrue tarafından
(`getUser()`) kanıtlanmıştır — çözümlenen dize, `getUser()`'ın doğruladığı **aynı** dizedir,
istemciden ayrıca gönderilen imzasız bir girdi değildir.

---

## Karar 4 — Enumeration: koça açık söylenir, `forgot-password` nötr kalır

Davet edilen e-posta zaten kayıtlıysa route **409 `EMAIL_ALREADY_REGISTERED`** döner — nötr bir
"davet gönderildi" yanıtı **verilmez**. Gerekçe, iki farklı tehdit modelinin sonucudur:

- Bu ucun çağıranı **kimliği doğrulanmış**, **`aal2`'de**, **hız sınırlı** ve `coach_actions`'a
  iz bırakan bir koçtur — anonim bir saldırgan değil.
- Koç zaten `profiles_select` politikası altında **tüm** danışan profillerini (e-postalar dahil)
  görebiliyor (bkz. `reset-client-password` §HEDEF yorumu, B-058 borcu). Yani 409 yanıtı koça
  **yeni** bir bilgi sızdırmıyor — koç o e-postanın sistemde kayıtlı olup olmadığını zaten
  `profiles` listesinden görebiliyor, 409 yalnızca zaten görünen bir gerçeği tekrar ediyor.
- Buna karşılık nötr bir yanıt koçu **yanıltır**: gerçek bir operasyon hatası (yanlış yazılmış
  e-posta, yanlış kişiye davet niyeti) sessizce kaybolur ve koç davetin gittiğini sanıp bekler.

**Kamusal `forgot-password` akışı bu kararla değişmez, nötr kalmaya devam eder** — orada çağıran
**kimliksizdir** ve enumeration (bir e-postanın sistemde kayıtlı olup olmadığını dışarıdan
sorgulayabilmek) gerçek, klasik bir tehdittir. Bu ADR o kararı **değiştirmiyor**; iki uç, iki
farklı tehdit modeli altında bilerek farklı davranıyor.

---

## Karar 5 — İki fazlı denetim ve kısmi CHECK (bu dilimin en zor kararı)

`reset-client-password` emsaliyle aynı disiplin: **denetim satırı önce, asıl işlem sonra**
(fail-closed). Denetim satırı yazılamazsa davet **hiç tetiklenmez** — `500
COACH_ACTION_AUDIT_FAILED`. İz bırakmadan yapılan bir müdahale, hiç yapılamayan bir müdahaleden
daha kötüdür (KVKK m.12 hesap verebilirliği) ilkesi burada da aynen geçerlidir.

Ama bu sıra, `coach_actions.target_id`'nin bugünkü şemasıyla (`not null references
public.profiles(id) on delete cascade`, bkz. `20260819130000_coach_action_audit.sql` §1) **doğrudan
çelişir**: davet anında hedef kullanıcı henüz `auth.users`'ta da `profiles`'ta da yoktur —
denetimi işlemden **önce** yazmak isteyen bir kural, henüz var olmayan bir `target_id`'yi
`NOT NULL` bir kolona yazmak zorunda kalıyor.

### Değerlendirilen üç seçenek

- **(i) Denetimi davetten sonra yazmak.** Reddedildi: fail-closed sırasını doğrudan bozar —
  davet gönderilir ama denetim yazılamazsa "müdahale oldu, izi yok" durumu yeniden mümkün olurdu;
  tam da `reset-client-password`'ün kapattığı açık.
- **(ii) `target_id`'yi tümüyle nullable yapmak.** Reddedildi: bu, `password_reset_requested`
  eylemi için de aynı gevşemeyi getirirdi ve oradaki "kimliksiz bir müdahale kaydının anlamı
  yoktur" invaryantını (bkz. `20260819130000_coach_action_audit.sql` §1, `target_id` yorumu)
  sessizce kaybederdik — geriye dönük bir güvence kaybı.
- **(iii) SEÇİLEN: `target_id`'nin `NOT NULL`'ı düşürülür, yerine kısmi bir CHECK gelir:**

  ```sql
  check (target_id is not null or action = 'client_invited')
  ```

  Eski eylem türü (`password_reset_requested`) için invaryant **aynen** korunur; yalnızca
  `client_invited` eylemi için ve **yalnızca** o eylem için gevşer.

### Davet akışı iki fazlıdır

1. **Davetten önce:** `record_coach_action('client_invited', coachId, NULL, requestId)`
   çağrılır ve dönen `id` saklanır. İz, davetin kendisinden **önce** ve fail-closed olarak
   atılmış olur — `inviteUserByEmail` hiç çağrılmadan önce bile "bu koç bir davet girişiminde
   bulundu" kaydı vardır.
2. **Davet başarılı olduktan sonra:** yeni `public.link_coach_action_target(p_action_id,
p_target_id)` fonksiyonu (`SECURITY DEFINER`, EXECUTE yalnızca `service_role`) satırın
   `target_id`'sini **best-effort** doldurur. Bu adım başarısız olursa istek yine **200** döner
   ve yalnızca bir uyarı loglanır — iz zaten vardır, kaybolan tek şey "kime" bağlantısıdır; davet
   e-postası zaten gönderilmiş ve geri alınamaz olduğu için bu noktada 500 dönmek kullanıcıyı
   (koçu) yanıltırdı — davet gerçekte gitmiştir, hata mesajı tersini iddia ederdi.

`link_coach_action_target` yalnızca `target_id`'si **hâlâ NULL olan** ve `action =
'client_invited'` olan satırı günceller — var olan, zaten hedefi doldurulmuş bir denetim satırı
**asla** yeniden yönlendirilemez. Geçmişin tahrif edilmesi bu şekilde yapısal olarak imkânsız
kılınır. EXECUTE yalnızca `service_role`'dedir; `authenticated` (koç dahil) bu fonksiyonu
çağıramaz.

**İmza notu:** `record_coach_action`'ın dördüncü parametresi (`p_target_id`) artık `default
null` alır — imza (`text, uuid, uuid, uuid`) **değişmedi**, varsayılan değerler imzanın parçası
değildir; yalnızca **çağrı tarafını** kolaylaştırır. Üretilen TypeScript tipinde bu, argümanı
`p_target_id?: string` yapar; route "hedef yok" durumunu argümanı `null` göndererek değil, **hiç
göndermeyerek** ifade eder ve `null as unknown as string` gibi bir tip zorlaması yazmaya gerek
kalmaz.

### KVKK etkisi — ölçüldü, varsayılmadı

`target_id` NULL kalan bir satır, davet edilen kişi hakkında **hiçbir kişisel veri taşımaz** —
yalnızca koçun uid'si, bir zaman damgası ve rastgele üretilmiş `request_id` içerir. Dolayısıyla
"unutulma hakkı" açısından böyle bir satır için silinecek bir şey yoktur; kimseyi işaret etmez.
`target_id` dolduruldu ise (normal, beklenen yol) mevcut FK CASCADE davranışı **aynen** çalışır:
danışan `delete_account()` ile silinince satır da gider.

### `delete_account()` / `account_deletion_manifest()` etkilenmez

Manifest tabloyu **sayar** (`coach_actions` alanı `where target_id = p_user_id`), eylem türünü
ayırt etmez — `client_invited` eylemi de `password_reset_requested` gibi aynı sayaca girer.
**Manifest tablo kümesi bugün 17'dir** (ADR-0025/0026 döneminde 15'ti; Faz 4.8'in
`20260820090000_activity_log.sql`'i `activity_sessions` ve `activity_events` anahtarlarını
ekledi) — bu dilim o sayıya **dokunmaz**, yalnızca varsaymaz: migration §5(d3)
(`20260820160000_coach_invite_action.sql`) anahtar kümesini ada ada karşılaştırıp ölçer, böylece
yarın 18. bir tablo eklenirse sessizce eskimek yerine gürültülü kırılır. Yeni kolon da eklenmedi
(RLS senaryo 133'ün 6 kolonluk `coach_actions` sözleşmesi aynen geçerli — bkz.
`20260819130000_coach_action_audit.sql`). `target_id` NULL kalan satırlar hiçbir kullanıcıya ait
sayılmaz ve silme sonrası `row_total <> 0` fail-closed kontrolünü etkilemez — çünkü hiçbir
`p_user_id` değeri için NULL bir `target_id` eşleşmez, bu satırlar sayımın tamamen dışındadır.

---

## Karar 6 — Hız sınırı

`reset-client-password`'deki çift kovalı desenin aynısı, farklı eşiklerle:

- **(koç, hedef e-posta) çifti:** 2 / 24 saat.
- **Koç geneli:** 10 / saat.

Gerekçe: davet, şifre sıfırlamadan **daha nadir** ve **daha kalıcı** bir eylemdir — şifre
sıfırlama yalnızca mevcut bir hesap için bir e-posta tetikler, davet ise **yeni bir kullanıcı
yaratır**. Yanlışlıkla ya da kötü niyetle tekrarlanan bir davet, "yanlışlıkla gönderilen bir
e-posta"dan daha ağır bir sonuçtur (alıcı kafası karışmış, kısmen kayıtlı bir hesapla
karşılaşabilir). Bu yüzden eşikler `reset-client-password`'ün (hedef: 3/saat, koç: 20/saat,
pencere 1 saat) eşiklerinden **daha sıkı** ve pencere **daha uzun** tutuldu.

---

## Hata eşlemeleri

| Kod | Anlam                                                    |
| --- | -------------------------------------------------------- |
| 401 | Kimliksiz — `Authorization: Bearer` eksik/geçersiz       |
| 403 | `aal1` (seviye yükseltme yapılmamış) ya da koç değil     |
| 409 | E-posta zaten kayıtlı (`EMAIL_ALREADY_REGISTERED`)       |
| 422 | Şema ihlali — bilinmeyen alan dahil (`role` alanı dahil) |
| 429 | Hız sınırı aşıldı                                        |
| 500 | Denetim satırı yazılamadı                                |
| 502 | Supabase daveti reddetti                                 |
| 503 | `SUPABASE_SERVICE_ROLE_KEY` yapılandırılmamış            |

Yanıtta bağlantı, token ya da şifre **dönmez** — başarı yanıtı yalnızca `{ ok: true }`'dur; bu,
Karar 1'in `action_link`'in yapısal olarak var olmadığı iddiasının doğal sonucudur: dönecek bir
bağlantı zaten yoktur.

---

## Allowlist notu

Davet bağlantısı `redirectTo = ${NEXT_PUBLIC_APP_URL}/reset-password` ile üretilir — davet edilen
danışan bağlantıya tıkladığında şifresini bu sayfada belirler. Yerel geliştirmede
`http://localhost:3000/reset-password` Supabase panelindeki "Redirect URLs" allowlist'inde
**olmak zorundadır**; aksi hâlde GoTrue yönlendirmeyi reddeder ve davet e-postasındaki bağlantı
işe yaramaz hâle gelir. Bu, `reset-client-password`'ün zaten dayandığı aynı allowlist girdisidir
— ikinci bir girdi eklenmez, aynı `redirectTo` iki akış tarafından paylaşılır.

---

## Bedeller / bilinen sınırlar

- **B-058 açık kalır ve bu turda büyür:** koç-danışan atama tablosu yok, yani bu uç da dahil
  olmak üzere bugün **her koç herkesi davet edebilir** (ve zaten herkesi görebilir). Atama
  tablosu geldiğinde bu route da `reset-client-password`'ün B-058 notunda işaretlediği tek
  sıkılaştırma noktasına eklenmelidir.
- **Yerel GoTrue'nun `email_sent = 2/saat` global sınırı davetleri de sayar.** Bu, uygulamanın
  kendi (koç, hedef) / (koç geneli) hız sınırlarından **ayrı** ve onlardan **bağımsız**
  çalışan bir platform kısıtıdır; yerelde art arda birkaç davet testi bu sınıra hızla çarpabilir.
  Bu yüzden e-posta gönderiminin gerçekten tetiklendiğini doğrulayan testler **e-posta kutusuna
  değil, veritabanı sonuçlarına** (yeni `auth.users`/`profiles` satırı, `coach_actions` satırı)
  bakarak doğrulanmalıdır.
- **`link_coach_action_target` best-effort olduğu için nadiren `target_id` NULL kalabilir.** Bu
  bilerek kabul edilen bir sınırdır (Karar 5) — davet gönderilmiş ama denetim satırının "kime"
  bağlantısı eksik kalmıştır. KVKK açısından zararsızdır (bkz. Karar 5, KVKK etkisi) ama
  operasyonel görünürlük açısından bir eksikliktir.
- **Arayüz bu turda yok.** Davet formu, danışan listesi, davet durumu göstergesi — hiçbiri bu
  dilimin kapsamında değil. Bu ADR yalnızca sunucu ucunu (route + migration) belgeler; dilim 2
  arayüzü ekleyecektir.

---

## Kanıt

- `supabase/tests/rls.test.sql` senaryo **145**, dört alt iddia:
  - **145a** — yeni eylem türü (`client_invited`) NULL hedefle kabul edilir ve eski invaryant
    (`password_reset_requested` + NULL hedef → red) aynen sürer; tek yönlü bağlama (Karar 5)
    doğrulanır.
  - **145b** — `authenticated` (koç dahil) ne `record_coach_action`'ı ne `link_coach_action_target`'ı
    çağırabilir.
  - **145c** — davetle doğan kullanıcının rolü, metadata'ya `role: coach` konsa bile `client`'tır
    (Karar 2'nin asıl garantisi).
  - **145d** — `profiles` tablosunda rolü `coach` olan satır sayısı `1`'dir (davetle koç
    sayısının artmadığının doğrudan kanıtı).
- `apps/web/tests/unit/invite-client.test.ts`: route seviyesinde kimlik, `aal2` kapısı,
  enumeration, hız sınırı ve iki fazlı denetim davranışlarının birim testleri.

Her iki dosya da bu route/migration ile **aynı turda**, ayrı bir ajan tarafından yazılmaktadır;
bu ADR yalnızca referans verir, içeriklerini tanımlamaz.

---

## Sonuç

Danışan daveti, `enable_signup = false`'u açmadan ve koçun danışan şifresini görmesine izin
vermeden, sunucu tarafında `inviteUserByEmail` ile eklenmiştir. Rol garantisi tetikleyici
seviyesinde durur ve route'un davranışından bağımsızdır; `aal2` kapısı bu uçta — `reset-client-
password`'den farklı olarak — **tesadüfi değil açık**tır, çünkü hedefin henüz var olmaması
RLS'in doğal olarak devreye girecek bir okuma yolu bırakmaz. Denetim izi, `target_id`'nin henüz
bilinemediği bir eylem türü için şemaya kısmi bir CHECK ile yeni bir desen ekler: iz önce, hedef
bağlantısı best-effort sonra — geçmiş satırların hedefi bir daha asla değiştirilemez şekilde.
