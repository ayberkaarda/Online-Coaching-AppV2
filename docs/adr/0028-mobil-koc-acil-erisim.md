# ADR-0028 — Mobil koç acil-erişim (B-052'nin tersine çevrilmesi)

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-21
- **Karar verenler:** Faz 4.9 kapanış turu (mobil koç acil-erişim kapsamı)
- **İlgili:** ADR-0024 (`@repo/api-client` Supabase enjeksiyonu — paylaşılan hook'ların
  mobilde de çalışmasının temeli) · ADR-0026 (TOTP MFA ve `aal2` RLS kapısı — bu ADR'nin
  step-up'ının dayandığı kapı) · B-052 (bu ADR'nin tersine çevirdiği "mobil = yalnız
  danışan" ürün kararı) · B-065 (bu ADR'yi uygulayacak mobil dilim) · B-061 (oturum
  sonlandırma uyarısı — bu ADR mobilde de kapsar) · B-067 (mesaj eki yükleme — mobilden
  bilinçli kapsam dışı bırakılan yüzey)

---

## Bağlam

B-052'de mobil uygulama bilinçli olarak **yalnız-danışan** tutulmuştu: "koç yüzeyi `aal2`
arkasında, koç paneli web'de kalıyor" (bkz. `docs/PROGRESS.md` §5 madde 6). Bu bir ürün
kararıydı ve hiçbir ADR'de kayda geçmemişti — yalnızca PROGRESS.md'nin bitiş listesinde
duruyordu. Gerekçesi makuldü: koç yüzeyini mobile taşımak, `aal2` kapısını (ADR-0026) her
iki platformda da doğru kurmayı gerektiriyordu ve B-052'nin asıl hedefi (danışanın gerçek
bir mobil deneyime kavuşması) bu ek yükü taşımadan da karşılanabilirdi.

Gerçek ihtiyaç bugün farklı: koç, danışanına acil bir durumda (örn. bir mesaja hızlı
yanıt, bir form-check'i onaylama, bir danışanın son aktivitesini kontrol etme) müdahale
etmek için bilgisayar bulmak zorunda kalmamalı. Mobil-yalnız-danışan kararı bu senaryoyu
tamamen kapatıyor — koç mobilden **hiçbir şey** göremiyor. Bu, B-052'nin ürün kararını
doğrudan tersine çeviriyor; ve tersine çevrilen karar hiçbir ADR'de değil yalnızca
PROGRESS.md'de yaşadığı için, bu tersine çevirme tam bir ADR gerektiriyor — geri
dönülmesi gereken "asıl" bir karar kaydı yok, yalnızca bir anlatı satırı var.

---

## Karar

Mobil uygulamaya koç için bir **ACİL-ERİŞİM** yüzeyi eklenir. Bu yüzey **`aal2` step-up
ile kapılıdır** — ADR-0026'nın kurduğu koç `aal2` RLS kapısına dayanır, yeni bir kapı
icat edilmez. Kapsam bilinçli olarak **dar** tutulur:

1. **`aal2` step-up: challenge/verify — enroll YOK.** Mobil ekran mevcut bir TOTP
   faktörünü `challenge()` + `verify()` ile doğrulatır. Kayıt (QR kodu okutma) mobilde
   **sunulmaz**: QR'ı aynı telefonda hem üretip hem okutmak anlamsızdır (ADR-0026 Karar 5
   secret'ı web'de gösterir), ve acil erişime ihtiyaç duyan koç zaten web'de kayıtlı
   olan koçtur — mobilde ilk kez MFA'ya kaydolan bir koç senaryosu bu ADR'nin kapsamında
   değildir. Bu step-up ekranı, aynı bileşen paylaşıldığı için, mobilde bugüne dek
   sunulmayan **opt-in danışan MFA** adımını da doğal olarak açar.
2. **Salt-okur danışan listesi + aktivite özeti.**
3. **Koç-danışan mesajlaşma** — mevcut paylaşılan `@repo/api-client` hook'u üzerinden
   (ADR-0024 deseni, B-067'nin danışan tarafında kurduğu aynı temel).
4. **Form-check inceleme.**

### Bilinçli kapsam dışı (freeze'de savunulacak sınırlar)

- **Mobilde MFA enroll yok** — yalnızca challenge/verify (Karar 1).
- **Ağır yazma işlemleri yok** — plan/beslenme/hedef CRUD web'de kalır; bu yüzey
  "acil-erişim"dir, koç panelinin mobile taşınması değildir.
- **Mobilden mesaj eki yükleme yok** (bkz. B-067 — danışan tarafında da aynı sınır
  bilinçli olarak çizilmişti; koç tarafı bu kararı miras alır).
- **"Diğer oturumlar sonlanacak" uyarısı mobilde de gösterilir** — ADR-0026 §Kalan risk
  6'nın GoTrue MFA `verify` davranışı (diğer oturumları iptal etmesi) platformdan
  bağımsızdır; B-061'in ele aldığı uyarı mobil step-up ekranında da yer alır ve B-061'i
  mobilde de kapatır.

Bu sınırların tam listesi ve "artık bu kadar, genişletilmeyecek" kaydı ayrı bir
scope-freeze ADR'sinde (ADR-0029) tutulacaktır; bu ADR yalnızca kararın kendisini ve
gerekçesini belgeler.

---

## Sonuçlar

**Backend/migration sıfır.** `aal2` RLS kapısı ADR-0026'da platform-bağımsız kurulmuştu
— `is_coach()` ve `mfa_aal2_gate` politikası hangi istemcinin (web ya da mobil) sorgu
attığını bilmez, yalnızca JWT'deki `aal` claim'ini okur. ADR-0024/0025/0026'nın kurduğu
yüzeyler (paylaşılan hook, `service_role` sınırı, `aal2` politikası) aynen geçerlidir;
bu ADR onlara yeni bir tablo, kolon ya da fonksiyon eklemez.

**B-052'nin client-only kararı bu ADR ile supersede edilir.** "Mobil = yalnız danışan"
artık geçerli bir sınır değildir; koç için dar ve kapılı bir alt küme mobile taşınır.
B-052'nin geri kalan kapsamı (danışan auth temeli, salt-okur ekranlar, progress yazma
yolu) bu kararla değişmez.

**Uygulama B-065'e bırakılır.** Bu ADR yalnızca kararı ve sınırlarını kayda geçirir;
mobil ekranlar, step-up bileşeni ve koç yüzeyi kodu B-065 dilimi tarafından yazılacaktır.

---

## Reddedilen alternatif

**Mobil koç yüzeyini hiç açmamak (B-052 kararını aynen sürdürmek).** Reddedildi: gerçek
ihtiyaç ("koç bilgisayar bulmadan acil müdahale edebilmeli") karşılanamıyor ve bu ihtiyaç
portföy bağlamında da gerçekçi — bir koçun sahada, bilgisayarsız bir danışan mesajına
yanıt vermesi gereken an tam olarak B-052'nin kapattığı senaryo. `aal2` kapısı zaten
platform-bağımsız kurulduğu için (ADR-0026), mobilde açmanın backend maliyeti sıfırdır;
maliyeti sıfır olan bir kapıyı kapalı tutmanın gerekçesi zayıflar.
