# SignBridge

SignBridge, Türk İşaret Dili (TİD) kullanan hasta ile işaret dili bilmeyen sağlık çalışanının tek cihaz üzerinden, hasta onaylı ve güvenli biçimde iletişim kurmasını hedefleyen öğrenci MVP'sidir.

## MVP kapsamı

1. Hasta kameraya tek bir izole işaret yapar.
2. Güvenli yayın kapısı açıksa AUTSL-20 modeli en olası sınıfı ve güven puanını üretir.
3. Güven düşükse sistem tahmin yürütmez; yeniden deneme veya manuel seçim sunar.
4. Hasta sonucu onaylar ya da düzeltir.
5. Doktor yazılı/sesli yanıt verir ve hasta ekranda okur.

Model tıbbi tanı koymaz, kesintisiz işaret dili cümlesi çözmez ve profesyonel tercümanın yerini almaz.

## Depo yapısı

- `ai-training/`: veri manifestleri, ön işleme, eğitim, değerlendirme ve tahmin kodu
- `signbridge-app/`: Next.js tek cihazlı görüşme uygulaması
- `infrastructure/`: Supabase/GaussDB ve Huawei Cloud taslakları
- `docs/`: API, durum makinesi ve AI sözleşmeleri

## Kolay başlangıç

Komutları deponun ana klasöründe çalıştırın. Uygulamayı ilk kez deniyorsanız **Docker ile başlangıç** önerilir. Yerel demo varsayılan olarak görüşmeleri yalnız sunucu belleğinde tutar; Supabase zorunlu değildir.

Üç çalışma biçimi vardır:

- **`manual_only`:** Model dosyası gerekmez. Kamera kapalıdır; kullanıcı listeden seçime yönlendirilir.
- **`team_camera`:** Doğrulanmış model paketiyle yalnız ekip içi teknik testtir. Beş demo sınıfı ve `0,95` eşik kullanılır; sonuç deneysel bir öneridir ve hasta onayı zorunludur.
- **`camera_ai`:** Ancak fiziksel kamera doğruluğu, kapsama, statik hareket, gecikme ve OOD yayın kapılarının tamamı geçtikten sonra kullanılacak final modudur. Bu karar henüz verilmemiştir.

Kamera modları için aşağıdaki model çıktıları gerekir:

```text
ai-training/outputs/saved_model/
ai-training/outputs/runtime_config.json
```

Modeli GitHub Release üzerinden indirip SHA-256 doğrulamasıyla güvenli biçimde kurun:

```bash
node scripts/install-model.mjs
node scripts/check-model-assets.mjs
```

İnternetsiz kurulumda ekipten alınan aynı ZIP dosyasını kullanabilirsiniz:

```bash
node scripts/install-model.mjs --archive path/to/signbridge-autsl20-modelarts-v0.1.0.zip
```

Windows, macOS ve Linux'ta ön kontrol aynıdır:

```bash
node scripts/check-model-assets.mjs
```

Kurucu önce arşiv hash'ini, sonra iç model dosyalarını doğrular. Bozuk veya yarım indirme çalışan modelin üzerine yazılmaz. Model yoksa manuel demo için `node scripts/check-model-assets.mjs --allow-manual-only` komutu başarılı çıkar ancak kameranın kapalı olduğunu açıkça bildirir. Model ve AUTSL verileri Git'e eklenmez.

### Seçenek 1 — Docker ile başlangıç

Gerekenler: Docker Desktop ve kamerası olan bir bilgisayar.

1. Ayar dosyasını oluşturun:

   ```powershell
   Copy-Item .env.docker.example .env
   notepad .env
   ```

2. İlk yerel denemede `.env` içindeki `SESSION_STORE=memory` ayarını koruyun. Kalıcı Supabase oturumu gerekiyorsa `infrastructure/database/schema.sql` dosyasını kendi projenizde çalıştırın, `SESSION_STORE=supabase`, `SUPABASE_URL` ve yalnızca sunucuda kalacak `SUPABASE_SERVICE_ROLE_KEY` değerlerini girin. Anon anahtarı service-role anahtarı yerine kullanmayın.

3. Ekip kamera testi yapacaksanız modeli tek komutla kurun. Yalnız manuel demo için bu adımı atlayın:

   ```powershell
   docker compose --profile setup run --rm model-setup
   ```

4. Sistemi oluşturup başlatın:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

5. `web` ve `ai-inference` durumları `healthy` olduğunda [http://localhost:3000](http://localhost:3000) adresini açın. Durumu kontrol edin:

   ```powershell
   Invoke-RestMethod http://localhost:3000/api/ai/status
   ```

   Model yoksa `manual_only`, doğrulanmış model ve ekip politikası varsa `team_camera` görülür. `team_camera` güvenli yayın onayı değil, deneysel teknik testtir.

6. İşiniz bittiğinde sistemi kapatın:

   ```powershell
   docker compose down
   ```

Bu komut model veya veri dosyalarını silmez. Docker içinde model eğitimi ve ayrıntılı açıklamalar için [Docker kılavuzuna](signbridge-app/docs/docker.md) bakın.

### Seçenek 2 — Docker olmadan başlangıç

Gerekenler: Python 3.9, Node.js 22 ve npm. AI ve web servisleri iki ayrı PowerShell penceresinde açık tutulur.

#### 1. PowerShell — AI servisi

Manuel güvenli demo için model gerekmez:

```powershell
cd ai-training
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.inference.txt
$env:ALLOW_MANUAL_ONLY = "true"
$env:DECISION_POLICY_PATH = (Resolve-Path .\configs\decision_policy.json).Path
.\.venv\Scripts\python.exe -m uvicorn src.service:app --host 127.0.0.1 --port 8000
```

Kamera teknik testi için önce depo kökünde modeli kurun, ardından AI servisinde ekip politikasını seçin:

```powershell
node scripts/install-model.mjs
```

Sonra AI penceresinde şu model yollarını tanımlayın:

```powershell
cd ai-training
$env:MODEL_PATH = (Resolve-Path .\outputs\saved_model).Path
$env:RUNTIME_CONFIG_PATH = (Resolve-Path .\outputs\runtime_config.json).Path
$env:DECISION_POLICY_PATH = (Resolve-Path .\configs\decision_policy.team-camera.json).Path
.\.venv\Scripts\python.exe -m uvicorn src.service:app --host 127.0.0.1 --port 8000
```

`Uvicorn running on http://127.0.0.1:8000` mesajını gördüğünüzde bu pencereyi açık bırakın.

#### 2. PowerShell — Web uygulaması

Yeni bir PowerShell penceresi açıp depo kökünden şu komutları çalıştırın:

```powershell
cd signbridge-app
Copy-Item .env.example .env.local
notepad .env.local
```

Yerel bellek modu için `.env.local` içinde şu değerleri kullanın:

```dotenv
SESSION_STORE=memory
AI_SERVICE_URL=http://127.0.0.1:8000
```

Ardından web uygulamasını başlatın:

```powershell
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresini açın. Servisleri kapatmak için iki PowerShell penceresinde de `Ctrl+C` tuşlarına basın.

Kamera analizi yalnız yayın politikası açıksa tarayıcıda çalışır: ham görüntü SignBridge sunucusuna gönderilmez veya diske yazılmaz. Tarayıcı yalnız türetilmiş `60×46×2` landmark verisini AI servisine yollar. Önizleme kullanıcı kolaylığı için aynalanır; modele verilen anatomik sol/sağ el sırası değiştirilmez. Kamera erişimi üretimde HTTPS, yerelde ise `localhost` gerektirir.

### Çalıştığını kontrol etme

Web sağlık kontrolü:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/ready
Invoke-RestMethod http://localhost:3000/api/ai/status
```

İlk kontrolde `status=ok`; hazır olma kontrolünde oturum deposu erişilebiliyorsa `status=ready` olur. Sorun yaşarsanız Docker için `docker compose logs --tail 100 web ai-inference`, Docker olmadan çalıştırmada ise iki PowerShell penceresindeki hata mesajlarını kontrol edin.

AI hattının ayrıntıları [ai-training/README.md](ai-training/README.md), uygulama akışı [docs/api-and-state-machine.md](docs/api-and-state-machine.md), entegrasyon veri biçimi ise [docs/ai-contract.md](docs/ai-contract.md) dosyasındadır.

## Dal düzeni

- `main`: gösterime hazır sürüm
- `develop`: entegrasyon dalı
- `feature/...`: tek görevlik geliştirme dalı

Her değişiklik `develop` dalına pull request ile alınmalı; birleşmeden önce ilgili testler ve `npm run build` çalıştırılmalıdır.
