# 🚀 Online Coaching Management Platform 2

Bu proje, yapay zeka destekli bir **Online Koçluk ve Fitness Takip Uygulaması**'dır. Next.js, Supabase ve Python (AI Backend) teknolojileri kullanılarak geliştirilmiş olup, kullanıcılara beslenme takibi, antrenman loglama ve gelişmiş veri analitiği sunar.

# 🛠️ Mimari ve Teknolojiler

Platform, yüksek performans, modern web standartları ve ölçeklenebilir altyapı bileşenleri kullanılarak inşa edilmiştir:

![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

## ✨ Öne Çıkan Özellikler

* **AI Tabanlı Analiz:** Python destekli `ai_backend` sayesinde kişiselleştirilmiş fitness analizleri ve önerileri sunar
* **Veri Yönetimi:** Beslenme ve antrenman verilerini CSV veri setleri üzerinden işler ve analiz eder.
* **Kapsamlı Dashboard:** Kullanıcıların ilerlemesini takip edebileceği; günlük loglar, beslenme planları, antrenman programları ve istatistik sekmelerini içeren modüler bir yapı sunar.
* **Gerçek Zamanlı Veritabanı:** Supabase ile güvenli kullanıcı yönetimi ve veri depolama altyapısı sağlar[cite: 8].

---
## 📂 Dizin Yapısı ve Önemli Konumlar

* **`src/app/`**: Uygulamanın yönlendirme (routing) sayfalarını ve temel iş mantığını içerir.

*   **`src/components/tabs/`**: Dashboard üzerinde kullanıcı deneyimini optimize eden sekmeli bileşenleri (NutritionTab, WorkoutTab, StatsTab vb.) barındırır.

* **`ai_backend/`**: Yapay zeka motorunun çalıştığı, veri işleme ve analiz süreçlerini yürüten Python dizini.
  
* **`src/lib/`**: Supabase bağlantı konfigürasyonlarını ve yardımcı (helper) fonksiyonları içerir.
---

## 🛠️ Kurulum & Çalıştırma (Local Development)

### 1. Gereksinimler
* Supabase Hesabı
* Node.js & npm
* Python 3.x


Projeyi klonlayın ve kök dizine gidin:
```bash
git clone <repo-url>

# 2. Bağımlılıkları yükle
npm install
````
### 3. Çevresel Değişkenleri Ayarlayın:
Supabase API anahtarlarınızı ve gerekli konfigürasyonları .env dosyası üzerinden tanımlayın.

```bash
# 4. Sunucuları başlat 
npm run dev
````

👨‍💻 Geliştirici İletişim
Ayberk Arda

Software Developer | Computer Programming, Istanbul Kültür University (İKÜ)



