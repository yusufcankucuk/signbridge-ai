# SignBridge

SignBridge, Türk İşaret Dili (TİD) kullanan hasta ile işaret dili bilmeyen sağlık çalışanının tek cihaz üzerinden, hasta onaylı ve güvenli biçimde iletişim kurmasını hedefleyen öğrenci MVP'sidir.

## MVP kapsamı

1. Hasta kameraya tek bir izole işaret yapar.
2. AUTSL-20 modeli en olası sınıfı ve güven puanını üretir.
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

Komutları deponun ana klasöründe çalıştırın. Uygulamayı ilk kez deniyorsanız **Docker ile başlangıç** önerilir; web ve AI servisini tek komutla hazırlar.

Her iki yöntemde de aşağıdaki model çıktılarının mevcut olması gerekir:

```text
ai-training/outputs/saved_model/
ai-training/outputs/runtime_config.json
```

PowerShell ile kontrol edebilirsiniz:

```powershell
Test-Path .\ai-training\outputs\saved_model
Test-Path .\ai-training\outputs\runtime_config.json
```

İki komut da `True` döndürmelidir. Dosyalar yoksa önce [AI veri ve model kılavuzunu](ai-training/README.md) izleyerek modeli eğitin.

### Seçenek 1 — Docker ile başlangıç

Gerekenler: Docker Desktop ve çalışan bir Supabase projesi.

1. Ayar dosyasını oluşturun:

   ```powershell
   Copy-Item .env.docker.example .env
   notepad .env
   ```

2. `.env` içindeki `SUPABASE_URL` ve `SUPABASE_ANON_KEY` değerlerini Supabase projenizdeki gerçek değerlerle değiştirin.

3. Sistemi oluşturup başlatın:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

4. `web` ve `ai-inference` durumları `healthy` olduğunda [http://localhost:3000](http://localhost:3000) adresini açın. İlk AI model yüklemesi bilgisayara göre 1-3 dakika sürebilir.

5. İşiniz bittiğinde sistemi kapatın:

   ```powershell
   docker compose down
   ```

Bu komut model veya veri dosyalarını silmez. Docker içinde model eğitimi ve ayrıntılı açıklamalar için [Docker kılavuzuna](docs/docker.md) bakın.

### Seçenek 2 — Docker olmadan başlangıç

Gerekenler: Python 3.9, Node.js 22, npm ve çalışan bir Supabase projesi. AI ve web servisleri iki ayrı PowerShell penceresinde açık tutulur.

#### 1. PowerShell — AI servisi

```powershell
cd ai-training
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.inference.txt
$env:MODEL_PATH = (Resolve-Path .\outputs\saved_model).Path
$env:RUNTIME_CONFIG_PATH = (Resolve-Path .\outputs\runtime_config.json).Path
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

`.env.local` içinde şu üç değeri düzenleyin:

```dotenv
SUPABASE_URL=https://GERCEK_PROJE_ADI.supabase.co
SUPABASE_ANON_KEY=GERCEK_SUPABASE_ANON_KEY
AI_SERVICE_URL=http://127.0.0.1:8000
```

Ardından web uygulamasını başlatın:

```powershell
npm ci
npm run dev
```

[http://localhost:3000](http://localhost:3000) adresini açın. Servisleri kapatmak için iki PowerShell penceresinde de `Ctrl+C` tuşlarına basın.

### Çalıştığını kontrol etme

Web sağlık kontrolü:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Başarılı sonuçta `status` alanı `ok` olur. Sorun yaşarsanız Docker için `docker compose logs --tail 100 web ai-inference`, Docker olmadan çalıştırmada ise iki PowerShell penceresindeki hata mesajlarını kontrol edin.

AI hattının ayrıntıları [ai-training/README.md](ai-training/README.md), uygulama akışı [docs/api-and-state-machine.md](docs/api-and-state-machine.md), entegrasyon veri biçimi ise [docs/ai-contract.md](docs/ai-contract.md) dosyasındadır.

## Dal düzeni

- `main`: gösterime hazır sürüm
- `develop`: entegrasyon dalı
- `feature/...`: tek görevlik geliştirme dalı

Her değişiklik `develop` dalına pull request ile alınmalı; birleşmeden önce ilgili testler ve `npm run build` çalıştırılmalıdır.
