# Mimari Karar Kayıtları (ADR)

Bu dizin, "Sarmal" projesinde alınan mimari kararların kalıcı kaydını
tutar. Daha önce bu kararlar `docs/ARCHITECTURE.md` §7 altında "ADR-lite" formatında tek
dosyaya gömülüydü; `active_planprogram.md` §0.6 (R10) gereği Faz 1 başında ayrı dosyalara
ayrıştırıldı (AC-1.7).

## ADR nedir?

Bir Architecture Decision Record (Mimari Karar Kaydı), önemli ve geri alınması pahalı bir
mimari kararı — **neden** alındığını, hangi alternatiflerin değerlendirildiğini ve **neye**
karar verildiğini, kabul edilen bedelleriyle birlikte — kalıcı olarak belgeler. Amaç, altı ay
sonra "bunu neden böyle yapmıştık?" sorusuna kod arkeolojisi yapmadan cevap verebilmektir.

Her karar için ayrı bir ADR yazılmaz — yalnızca geri dönüşü zor, birden fazla dosyayı/katmanı
etkileyen veya gelecekte tekrar sorgulanması muhtemel kararlar için. Küçük, yerel, kolayca geri
alınabilir kararlar (bir değişken adı, bir CSS sınıfı) ADR gerektirmez.

## Numaralandırma ve dosya adı kuralı

- Dosya adı: `NNNN-kebab-slug.md`
- `NNNN`: sıfır dolgulu 4 haneli, artan sıra numarası (`0001`, `0002`, …). Numaralar **asla**
  yeniden kullanılmaz veya boşluk doldurmak için kaydırılmaz — bir ADR reddedilse veya yerini
  başka biri alsa bile numarası sabit kalır.
- `kebab-slug`: başlığın kısa, küçük harf, tire ile ayrılmış özeti (Türkçe karakter kullanma —
  `ı`/`ş`/`ğ` yerine `i`/`s`/`g`; boşluk yerine `-`).
- Örnek: `0004-ai-servisi-proxy-zorunlu.md`.

## Durum değerleri

| Durum               | Anlamı                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Önerildi`          | Karar taslak halinde, henüz uygulanmadı/onaylanmadı.                                                              |
| `Kabul edildi`      | Karar onaylandı ve (aksi belirtilmedikçe) uygulandı; kod tabanının şu anki gerçeği budur.                         |
| `Reddedildi`        | Değerlendirildi ama benimsenmedi; gerekçesi kayıt altında tutulur, tekrar sorulmasın diye.                        |
| `Ertelendi`         | Karar verilmedi, iş belirli bir tetikleyiciye kadar rafa alındı; ADR geri dönüş koşulunu ve merdivenini tanımlar. |
| `Yerini aldı: NNNN` | Daha sonraki bir ADR bu kararı geçersiz kıldı/değiştirdi; `NNNN` o yeni ADR'nin numarası.                         |

`Reddedildi` ile `Ertelendi` farkı: reddedilen karar "tekrar sorulmasın" der ve gerekçesi
kapanıştır; ertelenen karar "şu koşulda tekrar sor" der ve ADR'sinde tetikleyici + geri dönüş
merdiveni bulunur. Bir işin tasarımında kusur veya bloklayıcı varsa reddedilir; yalnızca
değeri kanıtlanmamışsa ertelenir.

Bir ADR'nin durumu değiştiğinde dosyanın kendisi **düzenlenir** (durum satırı güncellenir),
ama karar metni silinmez — tarihsel bağlam korunur.

## Yeni ADR eklerken izlenecek adımlar

1. Bir sonraki boş numarayı belirle (aşağıdaki indeks tablosundaki en yüksek `No` + 1).
2. `docs/adr/NNNN-kebab-slug.md` dosyasını, bu dizindeki mevcut ADR'lerle aynı formatta
   (Durum / Tarih / Karar verenler / Bağlam / Karar / Sonuçlar) oluştur.
3. Bu README'nin altındaki indeks tablosuna yeni satırı ekle.
4. Eğer yeni karar önceki bir ADR'yi geçersiz kılıyorsa: eski ADR'nin `Durum` alanını
   `Yerini aldı: NNNN` olarak güncelle, yeni ADR'nin `Bağlam` bölümünde hangi eski kararın
   yerine geçtiğini belirt.
5. `npx prettier --write "docs/adr/**/*.md"` çalıştırarak biçimi doğrula.

## İndeks

| No                                                                  | Başlık                                                                       | Durum                                       | Tarih      |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ---------- |
| [0001](0001-typescript-strict-migrasyonu.md)                        | TypeScript strict moduna geçiş                                               | Kabul edildi (devam eden migrasyon)         | 2026-08-16 |
| [0002](0002-tanstack-query-secimi.md)                               | Sunucu state yönetimi için TanStack Query seçimi                             | Kabul edildi                                | 2026-08-16 |
| [0003](0003-rol-enum-degerlerinin-korunmasi.md)                     | Veritabanı rol enum değerlerinin (`admin`/`student`) korunması               | Yerini aldı: 0013                           | 2026-08-16 |
| [0004](0004-ai-servisi-proxy-zorunlu.md)                            | AI servisine erişimin Next.js proxy'si üzerinden zorunlu kılınması           | Kabul edildi                                | 2026-08-16 |
| [0005](0005-bellek-ici-rate-limiter-siniri.md)                      | Bellek içi rate limiter'ın sınırı                                            | Kabul edildi (bilinen kısıtla)              | 2026-08-16 |
| [0006](0006-next-pwa-korunmasi.md)                                  | `next-pwa`'nın korunması                                                     | Kabul edildi                                | 2026-08-16 |
| [0007](0007-tek-kocluk-model.md)                                    | Tek koçlu model benimsendi                                                   | Kabul edildi                                | 2026-08-16 |
| [0008](0008-apierror-firlatma.md)                                   | `Result<T>` yerine tipli `ApiError` fırlatma                                 | Kabul edildi                                | 2026-08-16 |
| [0009](0009-monorepo-ve-mobil-ertelendi.md)                         | Monorepo ve mobil uygulamanın Faz 4.5'e ertelenmesi                          | Yerini aldı: 0023                           | 2026-08-16 |
| [0010](0010-koc-profili-herkese-gorunur.md)                         | Koç profilinin tüm authenticated kullanıcılara görünür kılınması             | Kabul edildi                                | 2026-08-16 |
| [0011](0011-ai-proxy-bearer-token.md)                               | AI proxy'lerinin Bearer token ile korunması                                  | Kabul edildi                                | 2026-08-16 |
| [0012](0012-pwa-webpack-build.md)                                   | PWA'nın korunması ve build'in `next build --webpack` ile alınması            | Kabul edildi                                | 2026-08-16 |
| [0013](0013-rollerin-coach-client-olarak-yeniden-adlandirilmasi.md) | Rollerin (`admin`/`student` → `coach`/`client`) yeniden adlandırılması       | Kabul edildi                                | 2026-08-17 |
| [0014](0014-danisanin-kendi-beslenme-planini-kaydedebilmesi.md)     | Danışanın kendi beslenme planını kaydedebilmesi                              | Kabul edildi                                | 2026-08-17 |
| [0015](0015-gorsel-kimlik-sistemi.md)                               | Görsel kimlik sistemi ("Demir & Tebeşir": palet, tema, token, tipografi)     | Kabul edildi (uygulama Faz 1.6'da)          | 2026-08-17 |
| [0016](0016-emoji-yerine-lucide-ikon-seti.md)                       | Fonksiyonel emoji'nin emekli edilmesi, `lucide-react`'e geçiş                | Kabul edildi (uygulama Faz 2'de)            | 2026-08-17 |
| [0017](0017-imza-oge-halka.md)                                      | İmza öğe: Halka, tek anlam kuralıyla                                         | Kabul edildi (uygulama Faz 2'de)            | 2026-08-17 |
| [0018](0018-kimlik-gecisi-iki-katman-ve-ci-ratchet.md)              | Kimlik geçişinin iki katmana bölünmesi ve CI ratchet'i                       | Kabul edildi                                | 2026-08-17 |
| [0019](0019-laboratuvar-yorumlama-motoru-kapsam-disi.md)            | Laboratuvar yorumlama motorunun kapsam dışı bırakılması                      | Reddedildi                                  | 2026-08-17 |
| [0020](0020-hosted-senkronizasyon-stratejisi.md)                    | Barındırılan Supabase projesinin temiz baseline ile senkronlanması           | Önerildi                                    | 2026-08-17 |
| [0021](0021-yemek-fotografi-makro-tahmininin-ertelenmesi.md)        | Yemek fotoğrafı makro tahmininin (Faz 3) ertelenmesi                         | Ertelendi                                   | 2026-08-17 |
| [0022](0022-oturum-depolamasi-cookie-ve-nonce-csp.md)               | Oturum depolamasının cookie'ye ve CSP'nin nonce tabanlı hale getirilmesi     | Kabul edildi (uygulama ayrı turda)          | 2026-08-18 |
| [0023](0023-monorepo-kesim-plani.md)                                | Monorepo kesim planı (pnpm + Turborepo, `apps/*`/`packages/*`)               | Kabul edildi (uygulama Faz 4.5'te)          | 2026-08-18 |
| [0024](0024-api-client-supabase-enjeksiyonu.md)                     | `packages/api-client`'ın Supabase istemcisini enjeksiyonla alması            | Kabul edildi (uygulama Faz 4.5 commit 5'te) | 2026-08-18 |
| [0025](0025-hesap-silme-ve-service-role-sunucu-yolu.md)             | KVKK hesap silme akışı ve `service_role`'ün ilk sunucu yolu                  | Kabul edildi                                | 2026-08-19 |
| [0026](0026-totp-mfa-ve-aal2-kapisi.md)                             | TOTP MFA ve koç hesabı için `aal2` RLS kapısı                                | Kabul edildi                                | 2026-08-19 |
| [0027](0027-danisan-daveti.md)                                      | Danışan daveti: `inviteUserByEmail`, açık `aal2` kapısı ve iki fazlı denetim | Kabul edildi                                | 2026-08-20 |
| [0028](0028-mobil-koc-acil-erisim.md)                               | Mobil koç acil-erişim (B-052'nin tersine çevrilmesi)                         | Kabul edildi                                | 2026-08-21 |
