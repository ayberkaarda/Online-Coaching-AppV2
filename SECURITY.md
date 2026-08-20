# Güvenlik Politikası

Bu belge, "Closed-Loop Coaching Hub" projesinde bir güvenlik açığı bulan araştırmacılar için
sorumlu açıklama (responsible disclosure) sürecini tanımlar. Proje bu belgenin yazıldığı tarihte
**yayında değildir** ve gerçek danışan verisi barındırmaz — tek bir bağımsız koçun kendi
pratiği için tasarlanmış, portfolyo amaçlı geliştirilen küçük ölçekli bir uygulamadır; halka
açık bir bug bounty programı da yoktur. Buna rağmen güvenlik açığı bildirim süreci gerçek bir
uygulamadaymış gibi işletilir: kod tabanı ileride canlıya alınabilir ve bu disiplinin kendisi
de değerlendirmenin bir parçasıdır.

## Desteklenen sürüm

Bu proje sürüm etiketleriyle dağıtılmaz; `main` dalı her zaman tek desteklenen ve üretime alınan
sürümdür. Bir güvenlik açığı bildirirken hangi commit/tarihte gözlemlediğinizi belirtmeniz
teşhisi hızlandırır.

## Bir güvenlik açığını nasıl bildiririm?

**Lütfen halka açık bir GitHub Issue AÇMAYIN.** Güvenlik açıkları herkese açık bir issue'da
paylaşılırsa düzeltme yayına alınana kadar istismar edilebilir hale gelir.

Bunun yerine doğrudan **ayberk20arda@gmail.com** adresine e-posta gönderin. E-postanızda mümkünse
şunlar bulunsun:

- Açığın kısa bir açıklaması ve potansiyel etkisi (ör. yatay/dikey yetki atlatma, veri sızıntısı,
  kimlik doğrulama atlatma).
- Yeniden üretim adımları veya bir kavram kanıtı (proof of concept).
- Etkilenen dosya/uç nokta/tablo biliniyorsa bunlar.
- Tercihen: önerdiğiniz bir düzeltme veya azaltım (zorunlu değildir).

Şifreli iletişim tercih ediyorsanız e-postanızda bunu belirtin, bir sonraki yanıtta uygun bir
kanal üzerinde anlaşırız.

## Beklenen yanıt süresi

- **İlk yanıt:** 3 iş günü içinde bildirimi aldığımı teyit ederim.
- **Teşhis/önceliklendirme:** 7 gün içinde etki ve önem derecesi hakkında geri bildirim veririm.
- **Düzeltme:** Önem derecesine göre değişir — Critical/High bulgular için hedef 14 gün içinde bir
  düzeltme veya azaltım yayına alınmasıdır; Medium/Low bulgular sonraki düzenli bakım turuna
  planlanır. Bu proje tek geliştiricili olduğu için bu süreler **hedef**tir, sözleşmesel bir SLA
  değildir; karmaşık bulgularda (ör. mimari değişiklik gerektiren) daha uzun sürebilir ve bu
  durumda ilerleme hakkında düzenli bilgi veririm.

## Kapsam

**Kapsam içi:**

- Bu depodaki uygulama kodu: Next.js uygulaması (`src/`), FastAPI `ai_backend` servisi, Supabase
  migration/RLS politikaları (`supabase/`), CI/CD yapılandırması (`.github/workflows/`).
- Kimlik doğrulama/yetkilendirme atlatma, yatay/dikey yetki yükseltme (IDOR dahil), RLS
  politika kaçakları, Storage erişim kontrolü kaçakları, girdi doğrulama açıkları, secret/anahtar
  sızıntısı, güvenli olmayan yapılandırma.

**Kapsam dışı:**

- Supabase platformunun kendisi (GoTrue/PostgREST/Storage'ın iç güvenliği) — bunları
  [Supabase'in kendi güvenlik sürecine](https://supabase.com/.well-known/security.txt) bildirin.
- Volumetrik/network seviyesi DDoS saldırıları.
- Sosyal mühendislik, phishing veya fiziksel güvenlik senaryoları.
- Kendi kendine kayıt (self-signup) — bu proje kasıtlı olarak kapalıdır
  (`[auth].enable_signup = false`); "signup açık" varsayımıyla yazılmış raporlar kapsam dışıdır.
- Otomatik tarayıcı çıktısının ham hali (ör. yalnızca bir SAST/DAST aracının "info" seviyeli
  bulgusu, elle doğrulanmış somut bir etki olmadan).

Kapsamın tam güncel görünümü için `docs/security/THREAT-MODEL.md` ve
`docs/security/AUDIT.md`'ye bakabilirsiniz — bu belgeler hangi tehditlerin zaten bilindiğini ve
hangilerinin bilinçli olarak kabul edilmiş risk olduğunu (`AUDIT.md` §6) listeler; bilinen ve
kabul edilmiş bir riski yeniden bildirmeden önce oraya bakmanızı öneririz.

## Güvenlik araştırmacısından beklenenler

- **Gerçek danışan verisine dokunmayın.** Bu platform sağlık/ölçüm verisi ve kişisel görseller
  (form-check fotoğrafları) barındırır. Bir açığı kanıtlamak için gerçek bir kullanıcı hesabına
  veya verisine erişim gerekiyorsa, bunun yerine **kendi test hesabınızı** oluşturun (kayıt kapalı
  olduğu için önce bana e-posta ile bir test hesabı talep edin) veya yalnızca minimum kanıt
  düzeyinde (ör. tek bir satırın var olduğunu göstermek, içeriğini okumadan) durun.
- **Veri değiştirmeyin veya silmeyin.** Bir yazma/silme açığını kanıtlarken geri alınabilir,
  kendi oluşturduğunuz test verisi üzerinde çalışın.
- **Hizmet kesintisine yol açacak testlerden kaçının** (ör. gerçek kullanıcı hesaplarına karşı
  toplu brute-force denemesi, kaba kuvvetle rate limiter'ı sürekli doldurma). Rate limiting/DoS
  bulgularını küçük, kontrollü bir örnekle (ör. 20-30 istek) kanıtlamanız yeterlidir.
- **Makul bir süre tanıyın.** Bir düzeltme yayına alınana veya benimle üzerinde anlaştığımız bir
  süre geçene kadar açığı kamuya açıklamayın (coordinated disclosure).
- Bulduğunuz açık bu depoya değil de bir bağımlılığa (ör. Next.js, Supabase, FastAPI) aitse,
  lütfen doğrudan o projenin kendi güvenlik sürecine bildirin; yine de bana haber verirseniz
  (özellikle bu projeyi etkileyen bir kullanım şekliyse) memnun olurum.

## Teşekkür

Sorumlu bir şekilde bildirilen ve doğrulanan her açık için, araştırmacının izniyle bu bölüme
(veya proje ilerledikçe eklenecek bir `SECURITY-HALL-OF-FAME.md` benzeri belgeye) adı eklenir.
Bu proje bugün için parasal bir bug bounty ödemesi sunmuyor; bu politika ileride değişirse burada
güncellenecektir.

_Şu ana kadar bildirilen ve teşekkür edilen bir açık bulunmuyor._
