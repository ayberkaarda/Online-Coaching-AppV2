# ADR-0029 — Kapsam Dondurma: Sarmal v1

- **Durum:** Kabul edildi
- **Tarih:** 2026-08-21
- **Karar verenler:** Fable (dış görüş turu) — kapanış turu
- **İlgili:** ADR-0015/0017 (görsel kimlik, imza öğe halka) · ADR-0024/0025/0026
  (paylaşılan `api-client` hook'u, KVKK hesap silme, TOTP MFA/`aal2`) · ADR-0028
  (mobil koç acil-erişim, B-065) · ADR-0030 (motion doktrini) · `bodybuilding_app.md`
  (reddedilen tam pivot / Tur 2'nin kaynağı)

**Bu, Sarmal v1'in son kapsam kararıdır.**

---

## Bağlam

Sarmal (kapalı-döngü koçluk hub'ı) bir **portfolyo projesidir** — prod'a çıkmayacak,
para akışı veya Apple Developer hesabı olmayacak (bkz. `docs/PROGRESS.md` §5,
2026-08-20 Fable danışması). v1 özellik seti tamamlandı ve yeşil metriklerle
kapatılıyor: RLS-first güvenlik katmanı, koç-danışan çekirdek akışı, TOTP MFA,
mobil danışan uygulaması, mobil koç acil-erişim paneli ve motion cilası — hepsi
uygulandı ve doğrulandı.

Portfolyoda gösterilmek istenen şey yalnızca "özellik biriktirebilen mühendis"
değil, **bitirebilen + kapsamı disiplinle kapatabilen mühendis**. Bir kod tabanı
sınırsız büyütülebilir; asıl kanıt, "buraya kadar, bundan sonrası bilinçli olarak
yapılmıyor" diyebilmektir. Bu ADR o çizgiyi çeker.

---

## Karar

### 1) v1 DONDURULUYOR

Aşağıdakiler v1'in **son hâlidir**; yeni özellik eklenmez, yalnızca hata düzeltmesi
yapılır.

**v1'de VAR olanlar (özet):**

- **RLS-first güvenlik:** `mfa_aal2_gate` (ADR-0026), `account_active_gate`,
  `coach_actions` denetim tablosu (KVKK m.12), `delete_account()` fail-closed KVKK
  hesap silme (ADR-0025).
- **Koç-danışan akışı:** plan/beslenme atama, form-check, mesajlaşma, ilerleme
  takibi, danışan daveti (ADR-0027).
- **Kimlik güvenliği:** TOTP MFA + `aal2` step-up (ADR-0026), koç tetiklemeli şifre
  sıfırlama.
- **Mobil danışan uygulaması:** Panel/Antrenman/Beslenme/Sohbet/İlerleme beş sekme,
  SecureStore tabanlı auth, paylaşılan `@repo/api-client` hook'ları (ADR-0024) —
  B-052/B-066/B-067.
- **Mobil koç acil-erişim paneli:** `aal2` step-up (challenge/verify, enroll yok),
  salt-okur danışan listesi/aktivite, mesajlaşma, form-check inceleme — B-065
  (ADR-0028).
- **Motion doktrini cilası:** imza-hareket tavanı 2, ortak `motion.ts` token'ları,
  yapısal reduced-motion — ADR-0030.
- **FastAPI AI analiz uçları** (Next.js proxy zorunluluğu ile — ADR-0004).

**Bilinçli kapsam-DIŞI (dondurulan "yapılmayanlar"):**

`docs/PROGRESS.md` §3'teki mevcut bilinçli takaslar/izleme maddeleri/ertelenenler
listesi bu dondurmayla birlikte v1'in kalıcı sınırı olur:

- **B-062** — alan adı + Resend geçişi yapılmayacak; Gmail SMTP köprüsü kalıcı kabul
  edildi (tetik "ilk gerçek danışan"dı, tanım gereği gelmeyecek).
- **B-063** — danışan MFA kurtarma script'i yazılmayacak (aynı gerekçe;
  ADR-0026 §Karar 5 elle bakım müdahalesini zaten belgeliyor).
- **B-001/B-002/B-010/B-015/B-017/B-020/B-021/B-029/B-035/B-039/B-041** — teknik
  olarak doğru tespitler ama ürün/mimari kararı gereği kapatılmayacak (tam liste ve
  gerekçe: `docs/discovery/borc-triyaji-2026-08-19.md` §2, PROGRESS.md §3 "Bilinçli
  takaslar").
- **B-053/B-034/B-044/B-058** — izleme maddeleri; kapatılacak bir iş değil, süreli
  istisna veya belgelenmiş tetikleyiciye bağlı gözden geçirme (PROGRESS.md §3
  "İzleme maddeleri").
- **Dependabot npm majör güncellemeleri** (TypeScript 6→7, ESLint 9→10, Tailwind
  3→4), Redis/Upstash rate limiter, `next-pwa` geçişi, `exercises.csv` için Git LFS,
  planların `jsonb`'a taşınması, **B-027** (`video_url` embed yazma yolu) —
  donmuş bir repoda anlamsız veya ürün önceliği olmadığı için "Ertelenenler"de
  kalıcı olarak durur (PROGRESS.md §3).
- **Telefon numarası toplanmıyor** (KVKK m.4 veri minimizasyonu — hiçbir akış
  kullanmıyor) ve **auth ban ile pasif hesap** reddedildi (KVKK silme hakkını
  engeller); künye/aktif-pasif dilimlerinde alınan bu iki ürün kararı v1'in kalıcı
  sınırıdır.
- **Blok periyodizasyon, foto-makro tahmini (Faz 3, ADR-0021 ertelendi), Faz 5-9**
  — hiçbiri bu v1'e girmedi ve girmeyecek.
- **Mobil Beslenme minimum-çekirdek** (B-066) — AI diyet üretimi, koç makro-hedef
  CRUD, yiyecek katalog araması mobilde **yok**; bunlar web'in koç-yüzü işi olarak
  kalır.
- **Mobil Sohbet ek-yüklemesiz** (B-067) — `expo-image-picker` yeni bağımlılık/izin
  gerektirdiği için mobilden mesaj eki yükleme bilinçli olarak dışarıda bırakıldı;
  web'den gelen ekler yalnızca görüntülenir.
- **Mobil koç paneli salt-okur, enroll yok** (B-065/ADR-0028) — ağır yazma işlemleri
  (plan/beslenme/hedef CRUD) web'de kalır; mobilde MFA kaydı sunulmaz, yalnızca
  challenge/verify.
- **Motion imza-hareket tavanı 2** (ADR-0030) — route cross-fade/buton press ve
  LoopRing çizim animasyonu dışında yeni bir "imza hareket" bu ADR'nin revizyonu
  olmadan eklenemez; yasak listesindeki efektler (gradient/shimmer, scroll-reveal,
  parallax, spring/bounce, count-up, hover scale/lift, shared-element, Lottie,
  halka üzerinde pulse) v1'de kapalı kalır.

### 2) Bir sonraki iş AYRI bir turdur

`bodybuilding_app.md` spec'i (mobil self-servis vücut geliştirme uygulaması) 8-fazlı
**TAM PİVOT** olarak **bilinçle REDDEDİLDİ** — bu turda da, gelecekte de aynı
biçimde uygulanmayacak. Onun yerine, bu freeze'in **üstüne** açılacak bir sonraki iş
**"Tur 2 — İmza Dilimi"** olarak tanımlanır:

- `packages/domain` altında hesap kütüphanesi (periyodizasyon/granüler günlük
  mantığı) + dar offline-sync — `bodybuilding_app.md`'nin sekiz fazının tamamı
  değil, ondan süzülmüş dar bir dilim.
- **Koçluk katmanı korunur** — hibrit self-servis + koç modeli, tek-koçlu model
  (ADR-0007) değişmez.
- **Marka "Sarmal" kalır** — yeniden adlandırma yok.
- Kendi kapsam-dışı listesiyle, kendi ADR'siyle, bu freeze'in üstüne ayrı bir tur
  olarak planlanacak; bu ADR'nin kapsamına girmez.

---

## Sonuçlar

- **v1 git'te temiz bir uçla işaretlenir** — `v1.0` etiketi main thread tarafından
  atılır (sub-agent'lar git komutu çalıştırmaz, bkz. CLAUDE.md §2/§5).
- Freeze sonrası iki iş tanımlanmış durumda: **(a) Motion cilası — TAMAMLANDI**
  (ADR-0030, `dcccb23`), **(b) Tur 2 — İmza Dilimi — sonraki**, ayrı bir turda,
  ayrı bir ADR ile.
- `docs/PROGRESS.md` §3'teki "Bilinçli takaslar", "İzleme maddeleri" ve
  "Ertelenenler" listeleri artık yalnızca borç triyajının çıktısı değil, aynı
  zamanda bu ADR'nin dondurduğu kalıcı v1 sınırının kaydıdır; bu listelerden bir
  maddeyi v1'de kapatmak bu ADR'nin revizyonunu gerektirir.
- Yeni bir özellik isteği geldiğinde varsayılan cevap "Tur 2'ye" ya da "hayır"dır;
  "v1'e şimdi eklenir" cevabı bu ADR'nin açıkça revize edilmesini gerektirir —
  tıpkı ADR-0030'un imza-hareket tavanında kurduğu disiplin gibi.

---

## Reddedilen alternatifler

**(A) `bodybuilding_app.md`'nin sekiz fazını bu turda başlatmak.** Reddedildi:
tam pivot, v1'in "bitmiş" durumunu bulanıklaştırır ve portfolyonun asıl kanıtladığı
şeyi (kapsamı disiplinle kapatabilme) tam tersine çevirir — bitmemiş bir v1'in
üstüne bitmemiş bir v2 yığmak olurdu.

**(B) Kapsamı hiç dondurmadan "sürekli iyileştirme" moduna geçmek.** Reddedildi:
sınırsız iyileştirme, ADR-0018'in identity-ratchet'inin uyardığı sürüklenmeyle aynı
örüntüyü kapsam ekseninde üretir — "bir tane daha eklesek zararı olmaz" hiçbir zaman
durmaz. Sabit bir dondurma noktası, tartışmayı "bu freeze'in neresine giriyor"
sorusuna indirger.
