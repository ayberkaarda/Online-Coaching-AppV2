# 0031 — Sarmal kurumsal kimliği: Kor & Kemik

- **Durum:** Kabul edildi
- **Tarih:** 2026-10-05
- **Karar verenler:** Proje sahibi
- **Yerine geçtiği karar:** ADR-0015, “Demir & Tebeşir” görsel kimlik yönü. Eski ADR değiştirilmemiştir.

## Bağlam

Mevcut mor ve soğuk gri görünüm koçluk ürününe uygun olmayan bir SaaS paneli hissi veriyor. Marka adı
**Sarmal** kalırken yeni yön; tekrar, sabır ve uzun vadeli yükselişi anlatmalı, dinlenme ve geriye
çekilmeyi de ilerlemenin doğal parçası olarak göstermelidir. `.orchestra/brand-proposal.md` bu kararın
son hâlini, görsel kuralları ve Astra incelemesinde ele alınan itirazları kaydeder.

## Karar

Kurumsal kimlik **“Kor & Kemik”** olarak belirlenir. Ana fikir “Sarmal döner; eksen yukarı”dır.
Tek merkezli, oka dönüşmeyen yükselen sarmal sembolü ve küçük harfli `sarmal` logotype kullanılır.

- Açık/koyu temel renkler Kemik `#F5F2EC` ve Gece `#121110`; vurgu Kor `#B63D0B` / `#FF8A4C` olur. Nötrler sıcak tutulur; mor ve saf gri kullanılmaz. Kor tek vurgu rengidir.
- Semantik token adları korunur; `surfaceSunken`, `borderControl` ve `info` eklenir. Renk kontrastı ve web-mobil palet eşitliği testlerle güvenceye alınır.
- Tipografi Bricolage Grotesque (display), Instrument Sans (arayüz) ve JetBrains Mono (veri) rollerinden oluşur. Türkçe glifler teslim edilen fontlarda ayrıca doğrulanır.
- Şekil dili 4px aralığa, 10/16/24/999 yarıçaplara ve ölçülü gölgeye dayanır. Glassmorphism ve dekoratif gradyanlar kaldırılır; Lucide iki platformda da kullanılır.
- Hareket durum değişimini anlatır; ödül hareketi set ve kişisel rekorla sınırlıdır. Azaltılmış hareket tercihi desteklenir.
- Ses tonu kısa, sıcak ve doğrudandır; övgü somut veriye bağlanır, gerileme suçlayıcı dille anlatılmaz.

Bu karar ADR-0015’in görsel kimlik yönünün tamamının yerine geçer. Ayrıca ADR-0017’nin radius
kararlarının yerine geçer; diğer imza öğe kararları bu ADR ile değiştirilmez.

## Sonuçlar

### Olumlu

- Marka; yüklenme, toparlanma ve uzun vadeli ilerlemeyi tek bir sembol ve anlatıda birleştirir.
- Kontrast, Türkçe font kapsamı, tema eşitliği ve etkileşim boyutları ölçülebilir uygulama koşullarına bağlanır.
- Web ve mobil aynı adlandırılmış token sözleşmesini izler; Kor kontrollü vurgu olarak kalır.

### Olumsuz / kabul edilen bedeller

- Yeni renkler, fontlar ve şekil dili görünür bir marka geçişi ve uygulama emeği gerektirir.
- Üç font ailesi yük maliyeti getirir; Türkçe glif kabul testleri ve platformlar arası tutarlılık ek bakım ister.
- Dolu Kor öğesini ekran başına birle sınırlamak ve gradyan/cam yüzeyleri kaldırmak bazı mevcut görsel seçenekleri daraltır.

### Astra'nın itirazlarının özeti

Astra'nın kontrast matrisi, kontrol kenarlığı, Türkçe glif testi, küçük logo optiği, mobil eşitliği ve
cam yüzeylerin birlikte kaldırılması itirazları kabul edildi. Font ölçek sınırı yalnızca büyük display/sayaç
metninde 1.5 olarak bırakıldı; 40px masaüstü tablo satırı AA hedef boyutunu karşıladığı için korundu.

Turuncu klişesi itirazı kısmen kabul edildi: renk yerine özel sarmal sembolü ve toparlanmayı da kapsayan
anlatı ayırt edici kılındı. Kontrastı geçen Kor tonu korundu. Ayrıntılı itiraz-karar eşlemesi
`.orchestra/brand-proposal.md` içindedir.
