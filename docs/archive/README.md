# Arşiv indeksi

Tamamlanmış fazların/turların anlatısı burada tutulur. Canlı durum, **açık borçlar** ve
sıradaki iş için: [`docs/PROGRESS.md`](../PROGRESS.md) — oturum başında o dosya yeterlidir,
buraya yalnızca gerektiğinde bakılır.

**Kural:** bir faz/tur kapandığında anlatı **doğrudan** buraya yazılır (`progress-<slug>.md`);
canlı dosyaya yalnızca durum özeti, borç tablosu güncellemesi ve tek satırlık faz kaydı işlenir.
Buradan hiçbir şey silinmez. Taşınan bölüm başlıkları, eski `docs/PROGRESS.md §N`
referansları çözülebilsin diye **birebir** korunmuştur; eşleme tablosu canlı dosyanın
başındadır.

| Dosya                                                                                | İçerik                                                                                                                                                                          |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [progress-2026-08-16-v1-yukseltme.md](progress-2026-08-16-v1-yukseltme.md)           | v1.0 yükseltmesi, sağlamlaştırma, E2E ilk koşu, kritik kırıklar, plan v1.1                                                                                                      |
| [progress-faz-1a.md](progress-faz-1a.md)                                             | Rol yeniden adlandırma, ADR ayrıştırması, private storage, Faz 1 çıkış kriterleri                                                                                               |
| [progress-faz-1.5-guvenlik.md](progress-faz-1.5-guvenlik.md)                         | Güvenlik denetimi ve sertleştirme (denetim + Grup 1–6)                                                                                                                          |
| [progress-faz-1.6-gorsel-kimlik.md](progress-faz-1.6-gorsel-kimlik.md)               | Görsel kimlik Katman A: token, tipografi, CI ratchet                                                                                                                            |
| [progress-faz-1.7-borc-temizligi.md](progress-faz-1.7-borc-temizligi.md)             | Borç temizliği, katalog import'u, bayat kayıt taraması                                                                                                                          |
| [progress-faz-2-cekirdek-akis.md](progress-faz-2-cekirdek-akis.md)                   | Koç-danışan çekirdek akışı (2a–2j)                                                                                                                                              |
| [progress-hosted-senkron-ve-env.md](progress-hosted-senkron-ve-env.md)               | ADR-0020 hosted senkronizasyonu; env koruması ve yerel PG 15 → 17                                                                                                               |
| [progress-faz-4-ilerleme-takibi.md](progress-faz-4-ilerleme-takibi.md)               | İlerleme Takibi: şema, grafik tekleştirme, trend, foto; 3 düzeltme turu                                                                                                         |
| [progress-a05-a14-cookie-nonce-csp.md](progress-a05-a14-cookie-nonce-csp.md)         | A-05 cookie oturumu + A-14 nonce tabanlı CSP (ADR-0022 uygulaması)                                                                                                              |
| [progress-faz-4.5-monorepo-mobil-temel.md](progress-faz-4.5-monorepo-mobil-temel.md) | Faz 4.5: pnpm + Turborepo monorepo geçişi, `packages/*` (4 paket), Expo mobil iskeleti                                                                                          |
| [progress-borc-turu-2026-08-19.md](progress-borc-turu-2026-08-19.md)                 | Borç turu: B-050/B-046/B-019/B-045/B-055 kapandı, B-030 kısmi, CI onarımları, B-056–058 açıldı; ek: B-056/B-040 kapanışı                                                        |
| [progress-faz-4.6-guvenlik-tamamlama.md](progress-faz-4.6-guvenlik-tamamlama.md)     | Faz 4.6 TAMAMEN KAPANDI: B-042 KVKK hesap silme, B-043 AI kota, B-028+B-008 magic-byte/Content-Disposition (AC-4.6.1–5 hepsi karşılandı)                                        |
| [progress-faz-4.7-kimlik-guvenligi.md](progress-faz-4.7-kimlik-guvenligi.md)         | Faz 4.7 TAMAMLANDI: TOTP MFA + `aal2` RLS kapısı (ADR-0026), koç tetiklemeli şifre sıfırlama, `coach_actions` denetim tablosu                                                   |
| [progress-faz-4.8-etkinlik-kaydi.md](progress-faz-4.8-etkinlik-kaydi.md)             | Faz 4.8 TAMAMLANDI: aktivite kaydı şeması + rıza kapılı `/api/activity` heartbeat, danışan/koç görünümleri, `coach_activity_summary()` mahremiyet sınırı, B-009 değerlendirmesi |
| [progress-yol-haritasi-arsivi.md](progress-yol-haritasi-arsivi.md)                   | Kapanmış yol haritası adımları, Faz 1b kapsamı, ertelenenler listesi                                                                                                            |
| [progress-kararlar-tablosu.md](progress-kararlar-tablosu.md)                         | **DONDURULMUŞ** eski karar tablosu (kanonik kayıt: `docs/adr/`)                                                                                                                 |
| [progress-oturum-gunlugu.md](progress-oturum-gunlugu.md)                             | Oturum günlüğü tam tablosu — yeni satırlar buraya eklenir                                                                                                                       |

## Geçersiz kılınan dosya kuralı (2026-08-17)

Aşağıdaki başlık, arşivleme öncesi `docs/PROGRESS.md`'nin ilk altı satırıdır ve birebir
korunmuştur. "Yalnızca büyür" kuralı **yürürlükten kalkmıştır**; "silinmez" kısmı aynen
geçerlidir (taşınır, silinmez).

> # İlerleme Günlüğü
>
> Bu dosya, oturumlar arası sürekliliği sağlayan tek doğruluk kaynağıdır. `CLAUDE.md` gereği
> **her oturumun başında** okunmalıdır. Her anlamlı iş biriminden sonra (faz kapısı, düzeltme
> turu, önemli bir keşif) güncellenmelidir. Güncelleme formatı: en üste yeni bir "Oturum" girdisi
> eklenir, eski girdiler **silinmez** — bu dosya proje boyunca yalnızca büyür.
