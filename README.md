# SignBridge

SignBridge, Türk İşaret Dili (TİD) kullanan hasta ile işaret dili bilmeyen sağlık çalışanının tek cihaz üzerinden, hasta onaylı ve güvenli biçimde iletişim kurmasını hedefleyen öğrenci MVP'sidir.

## MVP kapsamı

1. Hasta kameraya tek bir izole işaret yapar (ör. “başım ağrıyor”, “ateşim var”).
2. Varsayılan `signbridge-unified34` modeli 20 genel kelime ve 15 belirti avatarı arasından en olası sonucu ve güven puanını üretir.
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
- **`team_camera`:** Doğrulanmış model paketiyle deneysel kamera testidir. Varsayılan paket 15 belirti avatarını tanıyan `signbridge-unified34-bigru-v0.5.0` modelidir; eski AUTSL-20 paketi de seçilebilir. Sonuç bir öneridir ve hasta onayı zorunludur.
- **`camera_ai`:** Ancak fiziksel kamera doğruluğu, kapsama, statik hareket, gecikme ve OOD yayın kapılarının tamamı geçtikten sonra kullanılacak final modudur. Bu karar henüz verilmemiştir.

### En hızlı deneme (Docker, 4 komut)

Gerekenler: Git, Docker Desktop, kameralı bir bilgisayar ve Chrome veya Edge.

Windows'ta v0.8.0 ekip modelini tek adımda kurmak ve çalıştırmak için depo kökündeki
`signbridge-baslat.bat` dosyasına çift tıklayın. Betik eksikse `.env` dosyasını oluşturur, yerel model
arşivinin ve Docker'ın varlığını kontrol eder, modeli SHA-256 ile doğrular, uygulamayı yeniden derler ve
son durumda `modelVersion`, `cameraAiEnabled` ve `versionMismatch` alanlarını denetler.

```powershell
git clone https://github.com/yusufcankucuk/signbridge-ai.git
cd signbridge-ai
Copy-Item .env.docker.example .env          # macOS/Linux: cp .env.docker.example .env
docker compose --profile setup run --rm model-setup
docker compose up --build -d
```

Birkaç dakika sonra <http://localhost:3000> adresini açın: **Başla → Kamerayı aç**; “Hazır” yazısı
çıkınca ▶ (Anlatımı başlat) düğmesine basın, belirti işaretini yapın ve ■ (Anlatımı bitir) düğmesine basın.
Sistem tahmin ettiği avatarı gösterir ve “Doğru anladım mı?” diye onayınızı ister. Altında sıradaki
iki olası avatar da görünür (“Başka bir şey mi anlattınız?”); doğrusu oradaysa ona dokunup onaylayın.
Kurulumu kontrol etmek için `Invoke-RestMethod http://localhost:3000/api/ai/status` çıktısında
`cameraAiEnabled=true`, `vocabularyVersion=signbridge34-v1` ve `versionMismatch=false` görülmelidir.

İyi sonuç için: yüzünüz, omuzlarınız ve iki eliniz görüntüde olsun; ışık önden gelsin; işareti bir kez,
normal hızda yapın. Elinizi işaretten önce kaldırıp sonra indirebilirsiniz; kaydın başındaki ve sonundaki
boş kısımlar atılır. Model deneyseldir. Eğitimde görmediği kişilerde:

- ilk öneri yaklaşık %61 doğrudur;
- doğru avatar, onay ekranındaki üç avatardan birinde yaklaşık %81 oranında bulunur.

Ayrıntı: [ai-training/reports/unified34-v0.5.0-2026-09-19.md](ai-training/reports/unified34-v0.5.0-2026-09-19.md).

### Model paketleri

Kamera modları için doğrulanmış model gerekir. Kurulum aracı modeli GitHub Release'ten indirir,
SHA-256 ile doğrular ve doğru klasöre açar:

| Model | Komut | Klasör |
|---|---|---|
| `unified34` (varsayılan; 20 kelime + 15 belirti) | `node scripts/install-model.mjs` | `ai-training/outputs/unified34/` |
| `autsl20` (eski; 20 kelime) | `node scripts/install-model.mjs --model autsl20` | `ai-training/outputs/` |

```bash
node scripts/install-model.mjs
node scripts/check-model-assets.mjs
```

İnternetsiz kurulumda ekipten alınan aynı ZIP dosyasını kullanabilirsiniz:

```bash
node scripts/install-model.mjs --archive path/to/signbridge-unified34-v0.5.0.zip
```

Eski modeli kullanmak için `.env.autsl20.example` dosyasını `.env` olarak kopyalayın ve
`node scripts/install-model.mjs --model autsl20` çalıştırın.

Windows, macOS ve Linux'ta ön kontrol aynıdır:

```bash
node scripts/check-model-assets.mjs
```

Kurucu önce arşiv hash'ini, sonra iç model dosyalarını doğrular. Bozuk veya yarım indirme çalışan modelin üzerine yazılmaz. Model yoksa manuel demo için `node scripts/check-model-assets.mjs --allow-manual-only` komutu başarılı çıkar ancak kameranın kapalı olduğunu açıkça bildirir. Model ağırlıkları, videolar ve AUTSL verileri Git'e eklenmez; model yalnız Release dosyası olarak dağıtılır.

### Seçenek 1 — Docker ile başlangıç

Gerekenler: Docker Desktop ve kamerası olan bir bilgisayar.

1. Ayar dosyasını oluşturun:

   ```powershell
   Copy-Item .env.docker.example .env
   notepad .env
   ```

2. İlk yerel denemede `.env` içindeki `SESSION_STORE=memory` ayarını koruyun. Kalıcı Supabase oturumu gerekiyorsa `infrastructure/database/schema.sql` dosyasını kendi projenizde çalıştırın, `SESSION_STORE=supabase`, `SUPABASE_URL` ve yalnızca sunucuda kalacak `SUPABASE_SERVICE_ROLE_KEY` değerlerini girin. Anon anahtarı service-role anahtarı yerine kullanmayın.

3. Kamera testi yapacaksanız modeli tek komutla kurun (varsayılan `unified34`). Yalnız manuel demo için bu adımı atlayın:

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
$env:MODEL_PATH = (Resolve-Path .\outputs\unified34\saved_model).Path
$env:RUNTIME_CONFIG_PATH = (Resolve-Path .\outputs\unified34\runtime_config.json).Path
$env:LABELS_PATH = (Resolve-Path .\configs\labels.signbridge34.json).Path
$env:DECISION_POLICY_PATH = (Resolve-Path .\configs\decision_policy.unified34-team-camera.json).Path
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

## Kamera AI'ı deneme (`team_camera` modu)

Model kurulu ve `/api/ai/status` `"mode": "team_camera"` döndürüyorsa tarayıcıdan gerçek kamera
tahminini deneyebilirsiniz. Bu, ekip içi **deneysel** bir teknik testtir; yayınlanmış güvenli
`camera_ai` modu değildir ve tıbbi tanı yerine geçmez.

1. [http://localhost:3000](http://localhost:3000) adresini açın ve hasta akışını başlatın.
2. Şikâyeti kamerayla anlatmayı deneyin; tarayıcı kamera izni isteyecektir (yalnız `localhost`
   veya HTTPS üzerinde çalışır, ham görüntü sunucuya gönderilmez).
3. Ekranda **"Deneysel kamera tahmini — tıbbi tanı değildir"** uyarısını göreceksiniz. Model,
   eğitildiği 20 sınıfın tamamından birini önerebilir: `doktor`, `eczane`, `evet`, `göstermek`,
   `hasta`, `hastane`, `hayır`, `içmek`, `iğne`, `ilaç`, `iyi`, `kaza`, `kötü`, `nerede`, `şeker`,
   `tehlike`, `tuvalet`, `yara bandı`, `yardım`, `yorgun`. Statik veya çok küçük hareket model
   çağrısı yapılmadan reddedilir.
4. Tahmini onaylayın ya da reddedin; her sonuç bir **öneridir**, hasta onaylamadan doktora iletilmez.
   "Tekrar dene" ve "Seçerek anlat" (manuel listeden seçim) seçenekleri her zaman açıktır ve kamera
   güven vermediğinde bu yola geçmekten çekinmeyin.
5. Doktor bir soru sorduğunda hasta yanıtı yine kamera veya manuel seçimle verebilir; hangi ekranın
   açılacağı bekleyen soruya göre otomatik belirlenir.
6. Farklı ışık, mesafe ve hız koşullarında (normal, düşük ışık, uzak, yavaş, hızlı) denemek gerçek
   modelin ne zaman güvenli önerdiğini, ne zaman reddettiğini görmenizi sağlar.

Sınıflar eşit güvenilirlikte değildir. Test setindeki F1 skorlarına göre 12 sınıf (`doktor`,
`eczane`, `göstermek`, `hasta`, `hastane`, `hayır`, `kaza`, `nerede`, `tuvalet`, `yara bandı`,
`yardım`, `yorgun`) `0,93` ve üzerinde; `evet`, `iyi` ve `tehlike` `0,84`–`0,87` aralığında;
`kötü` (`0,71`), `ilaç` (`0,68`), `içmek` (`0,65`), `iğne` (`0,50`) ve `şeker` (`0,35`) ise belirgin
biçimde zayıftır. Zayıf sınıflarda `0,95` eşiğinin sık sık reddetmesi beklenen davranıştır, kurulum
hatası değildir. Ayrıntılı sayılar `ai-training/outputs/classification_report.csv` dosyasındadır.

Bu, resmî kabul ölçümü değildir; yalnız modeli günlük kullanımda tanımak içindir. Katılımcı başına
25 geliştirme/holdout + 10 statik denemenin **kayıt altına alınan** resmî sürümü ve CSV biçimi için
[`ai-training/README.md`](ai-training/README.md) içindeki "Haftalık kamera, eşik ve teslim çalışması"
bölümüne bakın — `python -m src.validate_video` ile planlanan deneme matrisini üretip
`python -m src.summarize_camera` ile sonuçları birleştirebilirsiniz.

### Birleşik 30 sınıflı MEB belirti deneyi

`signbridge-unified30-bigru-v0.2.0`, mevcut 20 AUTSL sınıfını koruyup 10 yeni belirti çıktısı ekler.
Mevcut `seker` sınıfı 14 numaralı indeksini korur; ilk şikâyet ekranında `diabetes` avatarına ve
“Şeker hastasıyım” ifadesine bağlanır. Böylece belirti bağlamında 11 avatar adayı vardır.

Bu paket sınıf başına yalnız bir MEB referans videosuyla eğitildiği için deneysel bir öğrenci
prototipidir. Bağımsız kullanıcı başarımı kanıtlanmış değildir, tıbbi tanı koymaz ve bütün sonuçlar
hasta onayı ister. Dört bileşik veya anlam eşleşmesi doğrulanmamış ifade (`headache`, `stomachache`,
`nausea`, `shortness-of-breath`) manuel seçimde kalır.

Birleşik modeli Docker ile hazırlayıp eğitmek için (çıktı klasörü boş olmalıdır). Tarayıcı
çıkarıcısı görünümleri önce `node scripts/extract-browser-landmarks.mjs` ile üretilir
(ayrıntı: [docs/unified30-symptom-model.md](docs/unified30-symptom-model.md)):

```powershell
$env:SIGNBRIDGE_DATA_ROOT = "C:/path/to/signbridge-data"
docker compose --profile training run --rm --entrypoint python ai-training `
  -m src.data.prepare_meb_health --data-root /data `
  --browser-landmarks /data/processed/meb_health11_browser_raw.json
docker compose --profile training run --rm --entrypoint python ai-training `
  -m src.train_unified --data-root /data --manifest-dir /app/manifests `
  --base-model /outputs/saved_model --output-dir /outputs/unified30
```

Eğitim tamamlandıktan sonra birleşik paketi çalıştırmak için örnek ayarları kopyalayın:

```powershell
Copy-Item .env.unified30.example .env
docker compose up --build -d
Invoke-RestMethod http://localhost:3000/api/ai/status
```

Beklenen sürümler `signbridge-unified30-bigru-v0.2.0` ve `signbridge30-v1` değerleridir. Web, servis
sürümü beklenenle uyuşmazsa kamerayı açmaz (`versionMismatch=true`). 55 kamera denemesi için
<http://localhost:3000/camera-trials> kullanılır. Ayrıntılar, gerileme raporu ve eski modele dönüş:
[docs/unified30-symptom-model.md](docs/unified30-symptom-model.md).

### Birleşik 34 sınıflı model (15 belirti avatarı)

`signbridge-unified34-bigru-v0.5.0` (`signbridge34-v1`), 20 AUTSL kelimesine 15 belirti avatarını ekler.

- **Eğitim verisi:** MEB videoları, internetteki 8 TİD eğitmeninin ders/sözlük videolarından kesilmiş
  klipler ve az kaynaklı belirtiler için bileşimsel sentetik örnekler (ör. “ağrı” işaretinin başa/karna
  taşınması).
- **Kodlayıcı:** AUTSL'nin 226 işaretinin tamamıyla (43 kişi) önceden eğitildi.
- **Tahmin:** Ayna görüntüyle ortalama alınır. Belirti bağlamında karar, son katman yerine
  **sınıf merkezi (prototip) skorlamasıyla** verilir: her belirtinin eğitim örneklerinin ara temsil
  ortalaması `prototypes.json` içinde gelir, kayıt hangi merkeze daha yakınsa o avatar önerilir.
  Eğitimde görülmeyen kişilerde ilk öneri %61,2 → %68,5, ilk üç öneri %80,7 → %83,5.
- **İstemci:** Kaydı eğitim verisiyle aynı biçimde kırpar.

Bu bir öğrenci prototipidir, her sonuç hasta onayı ister. Çalıştırmak için
`Copy-Item .env.unified34.example .env`. Ayrıntı, ölçümler ve eğitim komutları:
[docs/external-symptom-videos.md](docs/external-symptom-videos.md) ve
[ai-training/reports/unified34-v0.5.0-2026-09-19.md](ai-training/reports/unified34-v0.5.0-2026-09-19.md).

### Doktor sorularına kamerayla yanıt (71 sınıflık model)

`signbridge-unified71-bigru-v0.8.0` (`signbridge71-v1`), 34 sınıfa doktorun dört sorusunu işaret
diliyle yanıtlamak için 37 işaret ekler: 12 sayı, 4 şiddet, 4 yön ve 17 vücut bölgesi.

- Kamera, soru tipine göre **yalnız o sorunun adayları** arasından seçer (süre → sayılar,
  şiddet → 1–5 + sıfatlar, yer → bölge + yön, ilaç → evet/hayır).
- Dört yanıt ekranında **birincil eylem kameradır**; hazır seçenek listesi ikincil yol olarak kalır.
- Süre iki parçalıdır: sayı işaretle gelir, birim (gün/hafta/ay/yıl) onay ekranından seçilir.
- Eğitimde görülmemiş kişide sayı doğruluğu: ilk öneri %40, ilk üç öneride %80.
- **Belirti tanımadan kayıp yok:** kodlayıcı v0.5.0'dan dondurularak alınır, yalnız çıkış katmanı
  yeni sınıfları öğrenir; görülmemiş kişilerde belirti ilk önerisi 211/282 ile birebir aynıdır.
- v0.8.0, 13 yanıt sınıfına ikinci işaretleyiciden örnek ekler. Üçüncü, bağımsız bir işaretleyici
  bulunmadığı için bu sürümün yeni kişideki kazancı henüz doğrulanmış sayılmaz.

Kurulum: Windows'ta `signbridge-baslat.bat`; diğer sistemlerde
`cp .env.unified71.example .env` ve `node scripts/install-model.mjs --model unified71`.
Ayrıntı: [docs/kamera-yanit-akisi.md](docs/kamera-yanit-akisi.md).

Ekip içinde, Spreadthesign ve Güncel TİD Sözlüğü kliplerini de eğitime katan `v0.5.1` modeli vardır.
Release'te yoktur; `.env.unified34-team.example` ile kullanılır.
MEB videoları, landmark dosyaları ve model ağırlıkları kullanım/dağıtım izni doğrulanmadan GitHub'a
yüklenmemelidir.

## Dal düzeni

- `main`: gösterime hazır sürüm
- `develop`: entegrasyon dalı
- `feature/...`: tek görevlik geliştirme dalı

Her değişiklik `develop` dalına pull request ile alınmalı; birleşmeden önce ilgili testler ve `npm run build` çalıştırılmalıdır.
