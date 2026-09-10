# SignBridge Docker kullanım kılavuzu

Docker yapısı üç parçadan oluşur:

- `web`: Next.js uygulaması; yalnızca `3000` portundan bilgisayara açılır.
- `ai-inference`: Eğitilmiş modeli yükleyen FastAPI servisi; yalnızca Docker iç ağından erişilir.
- `ai-training`: Veri hazırlama ve model eğitimi için isteğe bağlı tek seferlik iş.

AI imajları `tensorflow-cpu==2.15.1` ile uyumluluk için `linux/amd64` platformunda çalışır. Apple Silicon bilgisayarlarda Docker Desktop bu imajları emülasyonla çalıştırır; ilk build ve model yükleme daha uzun sürebilir.

Supabase bu deponun parçası değildir. Web konteyneri, Huawei/Supabase üzerinde mevcut olan projeye ortam değişkenleriyle bağlanır.

## Ön koşullar

1. Docker Desktop'ı açın ve Linux containers modunun çalıştığından emin olun.
2. `ai-training/outputs` içinde şu iki çıktı bulunmalıdır:
   - `saved_model/` dizini
   - `runtime_config.json`
3. Supabase projesinde SignBridge tablolarını oluşturun.

## İlk çalıştırma

PowerShell'de depo kökünde:

```powershell
Copy-Item .env.docker.example .env
notepad .env
docker compose config
docker compose up --build -d
docker compose ps
```

`.env` içinde en az `SUPABASE_URL` ve `SUPABASE_ANON_KEY` gerçek değerlerle değiştirilmelidir. `.env` Git tarafından yok sayılır; anahtarları repoya göndermeyin.

Servis kontrolleri:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
docker compose logs --tail 100 web ai-inference
```

Tarayıcı adresi: `http://localhost:3000`

CPU ile ilk model yükleme, bilgisayarın hızına göre yaklaşık 1-3 dakika sürebilir. Bu sırada `ai-inference` durumu `health: starting` görünür; hazır olduğunda web servisi otomatik başlar.

## AI tahmin akışı

Tarayıcı/backend, 60 kare × 46 nokta biçimindeki landmark isteğini `POST /api/ai/predict` adresine yollar. Web konteyneri isteği iç ağdaki `ai-inference:8000` servisine aktarır. AI konteynerinin `8000` portu doğrudan bilgisayara açılmaz.

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
- Sağlık kontrolü başarısızsa web, AI hazır olmadan başlamaz.

Base image etiketleri tekrar üretilebilir derleme için SHA-256 digest'lerine sabitlenmiştir. Üretim yayınında bu digest'ler kontrollü biçimde güncellenmeli, imajlar Trivy/Dockle ile taranmalı ve sırlar Huawei Cloud Secret Management Service gibi bir sır kasasından verilmelidir.
