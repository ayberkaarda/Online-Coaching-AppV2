# Online Coaching Platform — Güvenlik Denetimi ve Sertleştirme Prompt'u

> **NOT (2026-08-17): Bu doküman plana işlendi.** İçeriği mevcut kod tabanıyla
> uzlaştırılıp `active_planprogram.md` §3a **"Faz 1.5 — Güvenlik Denetimi ve
> Sertleştirme"** olarak eklendi (Faz 1 ile Faz 2 arasında yürütülür).
> Aşağıdaki maddelerin hangilerinin **zaten kapalı** (kanıtıyla), hangilerinin
> **geçersiz/uyarlanmış** (tek koçlu model, npm/pnpm, henüz var olmayan uçlar) ve
> hangilerinin **açık** olduğu `active_planprogram.md` §3a.3'teki uzlaştırma
> tablosundadır — uygulamaya geçmeden önce **oradaki tablo esas alınmalıdır**.
> Bu dosya kaynak doküman olarak **değiştirilmeden** korunur.

> **Hedef ajan:** Claude Code
> **Amaç:** Kendi kod tabanımızdaki güvenlik zafiyetlerini bulmak ve **kapatmak**
> (defensive hardening). Bu bir saldırı/exploit geliştirme görevi değildir;
> hedef, üçüncü şahıs sistemleri değil **yalnızca bu repo**dur.
> **Çalışma dili:** Türkçe (kod/commit İngilizce).
> **Referans standartlar:** OWASP ASVS L2, OWASP Top 10, OWASP API Top 10,
> Supabase & Next.js güvenlik en iyi uygulamaları.

---

## 0. Çalışma Kuralları

1. **Kapsam yalnızca bu repo.** Dış sistemlere tarama/istek yapma, gerçek
   kullanıcı verisi kullanma, canlı ortama dokunma. Tüm test yerel/staging'de.
2. **Önce raporla, sonra düzelt.** Kod değiştirmeden önce bulguları
   `docs/security/AUDIT.md`'ye yaz; her bulguyu **severity** (Critical/High/
   Medium/Low), **kanıt** (dosya:satır), **etki**, **düzeltme önerisi** ile
   listele. Bulgu raporunu bana ver ve **onayımı bekle**, sonra düzeltmelere geç.
3. **Her düzeltme bir regresyon testiyle gelir.** Zafiyeti tetikleyen (artık
   başarısız olması gereken) bir test yaz; düzeltme o testi yeşile çevirsin.
   Yani her fix'in yanında "bu açık geri gelirse yakalayan" bir test olsun.
4. **Kırma değil kapatma.** Var olan meşru davranışı bozma; güvenlik düzeltmesi
   bir özelliği kırıyorsa dur ve raporla.
5. **Sızıntı yapma.** Bulgu raporunda gerçek secret/token/PII gösterme; maskele.
6. **Commit disiplini.** `fix(security): ...`, bir açık = bir commit; `git push`
   çalıştırma. Faz sonunda dur ve raporla.

---

## 1. Otomatik Tarama Temeli (baseline)

Aşağıdaki araçları kur/çalıştır ve çıktıları `docs/security/`'e kaydet:

- **Bağımlılık:** `pnpm audit` (JS), `pip-audit`/`uv` ile Python; yüksek+ ciddiyet
  için düzeltme planı.
- **SAST:** `semgrep` (owasp + typescript + python + react ruleset'leri).
- **Secret tarama:** `gitleaks` — hem çalışan ağaç hem git geçmişi.
- **Next.js:** `eslint-plugin-security` + `eslint-plugin-no-unsanitized`.
- **IaC/Supabase:** migration ve policy dosyalarını statik gözden geçir.

Bunlar başlangıç noktası; asıl değerlendirme aşağıdaki manuel/mimari
denetimden gelir.

---

## 2. Kimlik Doğrulama ve Oturum

Denetle ve gerektiğinde düzelt:

- Supabase Auth JWT doğrulaması sunucu tarafında yapılıyor mu? İstemciden gelen
  `user_id` **asla** güven kaynağı olmamalı — kimlik daima sunucuda JWT'den
  (`auth.uid()` / doğrulanmış claim) alınmalı.
- Route handler'larda ve FastAPI proxy'sinde her istekte auth kontrolü var mı?
  Korumasız (public) endpoint envanteri çıkar; olması gerekenler dışındakileri
  kapat.
- Token'lar: erişim token'ı istemci tarafında güvenli saklanıyor mu (localStorage
  yerine httpOnly cookie tercih edilmeli web'de; mobilde SecureStore)?
- Şifre/oturum politikaları, e-posta doğrulama, parola sıfırlama akışında token
  tek kullanımlık ve süreli mi?
- Logout gerçekten oturumu ve push token'ı geçersiz kılıyor mu?

---

## 3. Yetkilendirme — En Kritik Katman (IDOR / Broken Access Control)

Bu proje coach/client rolleri içerdiği için **en yüksek risk burada.** Denetle:

- **RLS her tabloda aktif mi?** `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` +
  `FORCE ROW LEVEL SECURITY` her hassas tabloda var mı? RLS'siz tablo = kritik
  bulgu.
- **IDOR:** Bir client, path/query/body'deki id'yi değiştirerek başka bir
  client'ın verisine (log, foto, mesaj, form check) erişebiliyor mu? Her
  kaynak erişimi sahiplik/ilişki kontrolünden geçmeli — hem RLS'te hem
  uygulama katmanında (defense in depth).
- **Yatay yetki:** client → client veri erişimi engelli mi?
- **Dikey yetki:** client, koça özel yazma işlemlerini (plan atama,
  coach_feedback, coach_notes, sistem mesajı) yapabiliyor mu? Yapabiliyorsa
  kapat.
- **Koç sınırı:** Bir koç yalnızca `profiles.coach_id = auth.uid()` olan
  öğrencilerin verisine erişebiliyor mu, yoksa tüm öğrencilere mi? İkincisi
  kritik bulgu.
- **RLS test matrisi (regresyon testi olarak yaz):**
  - client kendi verisi → PASS
  - client başka client verisi → DENY
  - client koç-yazma işlemi → DENY
  - coach kendi öğrencisi → PASS (okuma), izinli alanlar (yazma)
  - coach başka koçun öğrencisi → DENY
  - anonim istek hassas tablo → DENY

- **`service_role` sızıntısı:** service_role key yalnızca sunucu tarafında
  (Edge Function / ai_backend) mı? İstemci bundle'ında veya web'e giden env'de
  ASLA olmamalı. `NEXT_PUBLIC_` önekiyle hassas key sızmış mı kontrol et.

---

## 4. Girdi Doğrulama, Injection, Dosya Yükleme

- **SQL injection:** Ham SQL/string birleştirme var mı? Tümü parametreli
  sorgu / Supabase query builder / prepared statement olmalı. RPC fonksiyonları
  `SECURITY DEFINER` ise `search_path` sabitlenmiş ve girdi doğrulanmış mı?
- **Şema doğrulama:** Her public girdi zod (TS) / Pydantic (Py) ile doğrulanıyor
  mu? Doğrulanmayan endpoint = bulgu.
- **XSS:** `dangerouslySetInnerHTML`, `eval`, `new Function`, kontrolsüz HTML
  render var mı? Kullanıcı içeriği (mesaj, notlar) render'da escape ediliyor mu?
- **Dosya yükleme (meal/progress/form-check medyası):**
  - MIME whitelist + gerçek içerik doğrulama (magic byte), yalnızca uzantıya
    güvenme.
  - Boyut limitleri sunucuda zorlanıyor mu?
  - Dosya adı kullanıcıdan alınıp path'e konuyorsa path traversal riski var mı?
    (`../` — path'i sunucuda `<user_id>/<uuid>.<ext>` olarak yeniden üret.)
  - Bucket'lar private mi, medya yalnızca kısa TTL'li signed URL ile mi
    servis ediliyor? Public URL ile hassas medyaya erişilebiliyorsa kritik bulgu.
  - Yüklenen dosya, indirilirken tarayıcıda çalıştırılamaz mı
    (`Content-Disposition: attachment`, doğru `Content-Type`)?

---

## 5. AI Backend'e Özgü Riskler

- **Proxy zorunluluğu:** İstemci `ai_backend`'e doğrudan erişemiyor,
  yalnızca kimlik doğrulamalı Next.js route handler üzerinden mi geçiyor?
- **Prompt injection / kötüye kullanım:** meal-photo gibi endpoint'lerde
  kullanıcı girdisi model prompt'una gidiyorsa, sistem talimatlarını override
  edecek girdi engelleniyor mu? Model çıktısı katı şemaya (Pydantic) parse
  ediliyor, güvenilmez metin doğrudan uygulama akışına sokulmuyor mu?
- **Kaynak tüketimi / maliyet DoS:** Kullanıcı başına rate limit (§ günlük
  analiz limiti) var mı, atomik mi (race condition ile aşılamıyor mu)?
- **SSRF:** Kullanıcı bir URL veriyorsa (video linki, foto URL) sunucu bu URL'ye
  istek atıyor mu? Atıyorsa iç ağ/metadata endpoint'lerine (169.254.169.254 vb.)
  erişim engelli mi?

---

## 6. Taşıma, Header, CORS, Rate Limit

- **CORS:** ai_backend ve route handler'larda origin whitelist dar mı?
  `*` + credentials kombinasyonu var mı (yasak)?
- **Güvenlik header'ları (Next.js `next.config` / middleware):** CSP (script
  kaynaklarını kısıtla), HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `X-Frame-Options`/frame-ancestors.
- **Rate limiting:** Auth endpoint'leri (login, reset, signup) brute-force'a
  karşı korunuyor mu (IP + hesap bazlı)? ai_backend'de slowapi benzeri limit?
- **Kütlesel atama (mass assignment):** İstemciden gelen gövde doğrudan DB
  update'e mi gidiyor? Yalnızca izinli alanlar (allowlist) güncellenmeli;
  `role`, `coach_id` gibi alanlar istemciden set edilememeli.

---

## 7. Secret ve Konfigürasyon Yönetimi

- Git geçmişinde secret var mı (`gitleaks` geçmiş taraması)? Varsa: bulguyu
  raporla, ilgili secret'ın **rotasyonunu** öner (kaldırmak yetmez, sızmış
  secret iptal edilmeli).
- `.env.example` tam mı, gerçek `.env` gitignore'da mı?
- Env değişkenleri runtime'da (zod/Pydantic ile) doğrulanıyor mu; eksikse app
  fail-fast mı?
- `NEXT_PUBLIC_` ile yanlışlıkla hassas değer expose edilmiş mi?

---

## 8. Loglama, Hata Yönetimi, Gizlilik

- Hata yanıtları istemciye stack trace / iç detay sızdırıyor mu? Generic mesaj
  - sunucuda detaylı log olmalı.
- Loglara PII / sağlık verisi / token yazılıyor mu? Sağlık verisi hassas
  kategori — loglarda maskele/hariç tut.
- Rate limit, auth başarısızlığı, yetki reddi olayları güvenlik günlüğüne
  yazılıyor mu (tespit için)?

---

## 9. Çıktılar (Definition of Done)

1. `docs/security/AUDIT.md` — tüm bulgular severity+kanıt+düzeltme ile,
   düzeltme durumu (open/fixed) işaretli.
2. Her Critical/High bulgu için: düzeltme commit'i + regresyon testi.
3. `docs/security/rls-tests` — §3 test matrisi otomatik çalışır ve CI'a bağlı.
4. CI'a eklenenler: semgrep, gitleaks, `pnpm audit`/`pip-audit` (high+ fail).
5. `docs/security/THREAT-MODEL.md` — kısa STRIDE tabanlı tehdit modeli
   (aktörler: anonim, client, koç, saldırgan-client; güven sınırları:
   istemci↔Supabase, istemci↔proxy↔ai_backend).
6. `SECURITY.md` — sorumlu açıklama (responsible disclosure) politikası taslağı.
7. Faz sonunda **dur ve raporla**: kalan riskler, kabul edilen riskler
   (accepted, gerekçeli), ve önerilen sonraki adımlar.

---

## Öncelik Sırası (zaman kısıtlıysa)

1. **Broken Access Control / IDOR + RLS** (§3) — bu tür uygulamada en yüksek
   etkili sınıf.
2. **Secret sızıntısı ve service_role** (§3, §7).
3. **Dosya yükleme + private bucket / signed URL** (§4).
4. **Auth & session** (§2).
5. Geri kalan sertleştirme.
