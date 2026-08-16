# Claude Code Agent Guidelines

Oturum başında docs/PROGRESS.md'yi oku.

## 1. Model Hierarchy & Roles

- **Opus 5 (Main Thread):** Planlama, karar verme, kod inceleme, hata teşhisi ve mimari kararlar. Frontier'a yakın zeka + düşük maliyet sayesinde ana orkestrasyon modeli budur.
- **Opus 4.8 (Heavy Sub-Agent):** Yalnızca en kritik/riskli parçalar için ikinci bir "ağır" sub-agent katmanı. Opus 5 ile paralel çalışabilir; genellikle Opus 5 zaten bir kritik parçada meşgulken eşdeğer kritiklikte ikinci bir parça çıktığında devreye girer.
- **Sonnet:** Toplu görev yürütme, standart kod üretimi ve scripting (Token Ekonomisi için optimize). Varsayılan ve en sık kullanılan sub-agent modeli.

## 2. Main Thread vs. Sub-Agents

- **Main Thread (The Brain — Opus 5):** Planlama, karar verme, kod inceleme ve hata teşhisinden sorumludur.
  - **Rule:** Main thread dosyaları doğrudan DEĞİŞTİREMEZ.
  - **Rule:** Tüm `git commit` işlemleri yalnızca main thread tarafından yürütülür.
- **Sub-Agents (The Muscle):** Tüm doğrudan dosya değişiklikleri ve çok adımlı yürütme görevleri Agent tool üzerinden sub-agent'lara devredilmelidir.
- **Parallel Execution:** 2 veya daha fazla bağımsız görev varsa, main thread boşta kalmasın diye tek mesajda paralel Agent çağrılarıyla aynı anda devret.

## 3. Sub-Agent Model Selection (Token Economy)

Sub-agent'lar ana modeli otomatik devralmaz. Her Agent çağrısında `model` parametresi zorunludur:

- **`model: "opus-4.8"`** — _Şunlar için:_ Sadece gerçekten en üst düzey kritiklikte, yanlış kararın maliyetinin çok yüksek olduğu ikinci bir zor parça — Opus 5 (main thread) zaten bir kritik parçada çalışırken paralel ihtiyaç duyulan ek "ağır" iş. Nadiren kullanılır.
- **`model: "sonnet"`** — _Geri kalan her şey için:_ Boilerplate ve CRUD kodu, mekanik güncellemeler (rename, config), test iskeleti, dokümantasyon ve terminal script yürütme.
- **Varsayılan Sonnet'tir.** Opus 4.8, yalnızca main thread (Opus 5) zaten meşgulken ikinci bir kritik parçanın paralel yürütülmesi gerektiğinde seçilir; şüphede kalırsan Sonnet ile başla.

## 4. Work Splitting on Coding Jobs (Üç Katman)

- **Default:** 2 veya daha fazla ayrılabilir parçası olan her coding işinde main thread (Opus 5) işi böler ve gereken sub-agent'ları **tek mesajda** paralel Agent çağrıları olarak gönderir.
- **Split rule:**
  - Main thread (Opus 5) kendisi en kritik/merkezi kararı verir veya doğrudan bir sub-agent olarak en zor parçayı üstlenir.
  - Aynı anda ikinci bir eşit derecede kritik/riskli parça varsa, bu `model: "opus-4.8"` sub-agent'a verilir (Opus 5 ile paralel).
  - Geniş/mekanik/hacimli parça(lar) `model: "sonnet"` sub-agent'lara verilir.
- **File ownership:** Her agent'a açık ve çakışmayan bir dosya listesi verilir. Aynı turda iki agent'a asla aynı dosya atanmaz.
- **Contract first:** Parçalar birbirine dokunuyorsa, main thread arayüzü (fonksiyon imzaları, tipler, endpoint'ler) dispatch'ten **önce** prompt'ta tanımlar; hiçbir agent tahmin yürütmek zorunda kalmaz.
- **Sequencing:** Bir parça gerçekten diğerinin çıktısına bağlıysa sahte paralellik yapma — önce bloklayan parçayı çalıştır (Opus 5 veya Opus 4.8), sonra Sonnet'i bağımlı parçalara yay.
- **Integration:** Main thread tüm çıktıları inceler, çakışmaları çözer ve commit eder.

## 5. Error Handling & Iteration

- Main thread tüm sub-agent çıktılarını inceler.
- Hata bulunursa veya düzeltme gerekiyorsa YENİ bir sub-agent AÇMA. Bağlamı korumak için **AYNI** aktif agent'a düzeltme talimatlarıyla `SendMessage` gönder.
- Sonnet aynı görevde iki kez başarısız olursa, o parçayı hata bağlamıyla birlikte taze bir `model: "opus-4.8"` agent'a eskale et. Opus 4.8 da başarısız olursa, main thread (Opus 5) parçayı kendi üstlenir.
- **Rule:** Sub-agent'lar asla Git komutu çalıştıramaz. Versiyon kontrolü kesinlikle main thread görevidir.

## 6. Destructive Command Safety

- `db:seed`, `db:reset`, `db:drop`, `delete_all`, `destroy_all`, `TRUNCATE` veya eşdeğeri herhangi bir toplu silme/reset işlemi içeren komut — main thread VEYA herhangi bir sub-agent tarafından — o çağrıya özel açık kullanıcı onayı olmadan çalıştırılamaz.
- Bu, repoda zaten var olan dosya/scriptler için de geçerlidir (örn. `db/seeds.rb`) — bir script'in var olması onu çalıştırma onayı değildir. Etkileri bilinmiyorsa çalıştırmadan önce script içeriğini oku.
- Sub-agent'lar bu tür komutları `git` destructive işlemleriyle aynı onay seviyesinde ele almalı (bkz. Rule 2/5) ve doğrudan çalıştırmak yerine main thread'e sormalıdır.
