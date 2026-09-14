# SignBridge Docker kullanım kılavuzu

Docker yapısı üç parçadan oluşur:

- `web`: Next.js uygulaması; yalnızca `3000` portundan bilgisayara açılır.
- `ai-inference`: Eğitilmiş modeli yükleyen FastAPI servisi; yalnızca Docker iç ağından erişilir.
- `ai-training`: Veri hazırlama ve model eğitimi için isteğe bağlı tek seferlik iş.

AI imajları `tensorflow-cpu==2.15.1` ile uyumluluk için `linux/amd64` platformunda çalışır. Apple Silicon bilgisayarlarda Docker Desktop bu imajları emülasyonla çalıştırır; ilk build ve model yükleme daha uzun sürebilir.

Yerel demo varsayılan olarak `SESSION_STORE=memory` ile çalışır; Supabase zorunlu değildir. Kalıcı oturum gerekiyorsa web konteyneri ayrı bir Supabase projesine yalnız sunucu ortam değişkenleriyle bağlanır.

## Ön koşullar

1. Docker Desktop'ı açın ve Linux containers modunun çalıştığından emin olun.
2. Tam AI modu kullanılacaksa `ai-training/outputs` içinde `saved_model/` ve `runtime_config.json` bulunmalıdır. Manuel güvenli demo model olmadan açılır.
3. Yalnız kalıcı Supabase modu kullanacaksanız `infrastructure/database/schema.sql` dosyasını kendi Supabase projenizde çalıştırın.

## İlk çalıştırma

PowerShell'de depo kökünde:

```powershell
Copy-Item .env.docker.example .env
notepad .env
docker compose config
docker compose up --build -d
docker compose ps
```

Tam AI modundan önce platformdan bağımsız dosya ve SHA-256 kontrolünü çalıştırın:

```text
node scripts/check-model-assets.mjs
```

Model arşivi Windows'ta `Expand-Archive .\signbridge-model.zip .\ai-training\outputs`, macOS/Linux'ta `unzip signbridge-model.zip -d ai-training/outputs` ile açılabilir. Arşiv yapısı nedeniyle fazladan bir üst klasör oluşmadığını ön kontrol çıktısından doğrulayın. Eksik modelle manuel demo yapılacaksa `node scripts/check-model-assets.mjs --allow-manual-only` kullanın.

İlk denemede `.env` içindeki `SESSION_STORE=memory` ayarını koruyun. Kalıcı mod için `SESSION_STORE=supabase`, `SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` değerlerini girin. Service-role anahtarını `NEXT_PUBLIC_` önekiyle tanımlamayın; anon anahtarı onun yerine kullanmayın. `.env` Git tarafından yok sayılır, anahtarları repoya veya loglara göndermeyin.

Servis kontrolleri:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/ready
docker compose logs --tail 100 web ai-inference
```

Tarayıcı adresi: `http://localhost:3000`

CPU ile ilk model yükleme, bilgisayarın hızına göre yaklaşık 1-3 dakika sürebilir. Model yoksa ve `ALLOW_MANUAL_ONLY=true` ise AI servisi `manual_only` olarak sağlıklı başlar; kamera açılmaz ve görüşme manuel seçimle tamamlanır. Model ve yayın kapılarından geçmiş `enabled=true` politika birlikte bulunduğunda `camera_ai` modu açılır.

## AI tahmin akışı

Web önce AI sağlık durumunu okur. `cameraAiEnabled=false` ise kamerayı açmadan kullanıcıyı manuel seçime yönlendirir. Etkin modda tarayıcı, MediaPipe Holistic ile kameradan landmark çıkarır ve `60 kare × 46 nokta` biçimindeki türetilmiş veriyi görüşme tahmin adresine yollar. Statik veya yetersiz hareket `insufficient_motion` ile model çağrılmadan reddedilir. Ham video kaydedilmez veya sunucuya gönderilmez.

İstek alanları [ai-contract.md](ai-contract.md) dosyasında açıklanır. Geçersiz boyut, maske veya ön işleme sürümü hem web proxy'sinde hem AI servisinde reddedilir.

## Docker içinde veri hazırlama

`SIGNBRIDGE_DATA_ROOT` değerini `.env` içinde AUTSL ve MEB klasörlerini içeren dizine ayarlayın. Windows yolu `C:/Users/...` şeklinde ileri eğik çizgiyle yazılmalıdır.

```powershell
docker compose --profile training build ai-training
docker compose --profile training run --rm --entrypoint python ai-training -m src.data.build_manifests --data-root /data
docker compose --profile training run --rm --entrypoint python ai-training -m src.data.convert_autsl --data-root /data
docker compose --profile training run --rm --entrypoint python ai-training -m src.data.convert_meb --data-root /data
docker compose --profile training run --rm --entrypoint python ai-training -m src.data.validate_npz /data/processed
```

Bu işlemler `/data/processed` altına NPZ dosyaları, depo içindeki `ai-training/manifests` klasörüne takip CSV/JSON dosyaları yazar. Ham veri Git'e veya Docker imajına kopyalanmaz.

## Docker içinde model eğitme

```powershell
docker compose --profile training run --rm ai-training `
  --data-root /data `
  --output-dir /outputs `
  --epochs 50 `
  --batch-size 32
```

Yeni model `ai-training/outputs` içine yazılır. Eğitim bittikten sonra çalışan çıkarım konteynerini yeniden oluşturun:

```powershell
docker compose up -d --force-recreate ai-inference
```

## Kapatma ve temizlik

```powershell
docker compose down
```

Bu komut yalnızca konteyner ve ağları kaldırır; model, manifest veya veri dosyalarını silmez. İmajları da kaldırmak isterseniz ayrıca `docker compose down --rmi local` kullanabilirsiniz.

## Güvenlik kararları

- Servisler root olmayan kullanıcılarla çalışır.
- Linux yetenekleri kaldırılır ve yeni ayrıcalık kazanımı engellenir.
- Çalışan kök dosya sistemleri salt okunurdur; yalnızca geçici alanlar ile eğitimde çıktı üreten `/data`, `/outputs` ve `/app/manifests` bind alanları yazılabilir.
- AI portu dışarı açılmaz ve backend ağı `internal` olarak tanımlıdır.
- CPU, bellek ve işlem sayısı sınırlandırılmıştır.
- Model ve ham veri Docker imajına gömülmez.
- Sağlık kontrolü tam AI veya güvenli `manual_only` modu hazır olmadan web'i başlatmaz.
- Web görüntü önbelleği tmpfs alanı konteyner kullanıcısına ait `uid=1000,gid=1000` yazma izniyle bağlanır.

Base image etiketleri tekrar üretilebilir derleme için SHA-256 digest'lerine sabitlenmiştir. Üretim yayınında bu digest'ler kontrollü biçimde güncellenmeli, imajlar Trivy/Dockle ile taranmalı ve sırlar Huawei Cloud Secret Management Service gibi bir sır kasasından verilmelidir.
