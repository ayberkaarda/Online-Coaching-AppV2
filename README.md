# 🚀 Online Coaching Management Platform

Bu proje, koçlar ve danışanlar arasındaki etkileşimi dijitalleştirmek, yönetim süreçlerini optimize etmek ve verimli bir koçluk deneyimi sunmak amacıyla geliştirilmiş modern bir web uygulamasıdır.

# 🛠️ Mimari ve Teknolojiler

Platform, yüksek performans, modern web standartları ve ölçeklenebilir altyapı bileşenleri kullanılarak inşa edilmiştir:

![Next.js](https://img.shields.io/badge/next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

## ✨ Öne Çıkan Özellikler

* **Kullanıcı ve Rol Yönetimi:** Admin panelleri üzerinden kullanıcı ve yetki yönetimi; AdminUserManagement.js ile merkezi kontrol.
* **Dinamik Dashboard:** DashboardTabs.js aracılığıyla koçluk süreçlerinin modüler takibi.
* **İletişim ve Bildirimler:** NotificationForm.js ile danışanlarla hızlı etkileşim ve bildirim yönetimi.
* **Süreç Takibi:** Koçlar için danışan profillerini ve ilerlemelerini takip edebilecekleri kapsamlı paneller.
* **Yönetim ve Güvenlik:** Supabase üzerinden sağlanan kullanıcı kimlik doğrulama, yetkilendirme ve rol tabanlı erişim kontrolü (RBAC)
* **Temalandırma:** ThemeProvider ve ThemeToggle bileşenleri ile özelleştirilebilir kullanıcı deneyimi.

---
## 📂 Dizin Yapısı ve Önemli Konumlar

* **`/src/app`**: Uygulamanın yönlendirme (routing) yapısı ve temel sayfalar (login, profile, users, dashboard).

* **`/src/components`**: Uygulamayı oluşturan yeniden kullanılabilir bileşenler (AdminPanel, DashboardTabs, ThemeToggle vb.).

* **`/src/lib`**: Supabase gibi servislerin yapılandırma ve istemci bağlantı dosyaları.
  
* **`/tailwind.config.js`**: Tasarım sisteminin özelleştirildiği yapılandırma dosyası.
---

## 🛠️ Kurulum & Çalıştırma (Local Development)

### 1. Gereksinimler
* Supabase Hesabı
* Node.js & npm


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



