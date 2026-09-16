# Birleşik 30 sınıflı model: MEB belirtileriyle genişletme

`signbridge-unified30-bigru-v0.2.0` (sözlük `signbridge30-v1`), mevcut `autsl20-bigru-v0.1.0`
modelinin 20 sınıfını aynı indekslerde korur ve 10 yeni belirti sınıfını sona ekler. Mevcut `seker`
sınıfı (indeks 14) belirti ekranında `diabetes` avatarına ve “Şeker hastasıyım” ifadesine bağlanır.
Böylece kamera, ilk şikâyet ekranında 11 belirti avatarı önerebilir.

> Bu bir **deneysel teknik demodur**. Her yeni belirti yalnız bir MEB referans videosundan
> öğrenilmiştir; artırılmış örnekler yeni katılımcı değildir. Sonuçlar tıbbi tanı değildir, bütün
> öneriler hasta onayı ister. Kişi bağımsız başarı ancak kamera denemeleriyle ölçülebilir.

## Sözlük ve bağlam

| İndeks | Model sınıfı | MEB videosu | Belirti avatarı | Gösterilen ifade |
|---:|---|---|---|---|
| 14 | `seker` (mevcut) | `seker-hastaligi` (ek örnek) | `diabetes` | Şeker hastasıyım |
| 20 | `dizziness` | `bas-donmesi` | `dizziness` | Başım dönüyor |
| 21 | `fever` | `ates` | `fever` | Ateşim var |
| 22 | `pain` | `agri` | `pain` | Bir yerim ağrıyor |
| 23 | `asthma` | `astim` | `asthma` | Astımım var |
| 24 | `rash` | `dokuntu-alerji-icin` | `rash` | Cildimde döküntü var |
| 25 | `palpitations` | `kalp-carpintisi` | `palpitations` | Kalbim hızlı çarpıyor |
| 26 | `heart-attack` | `kalp-krizi` | `heart-attack` | Göğsümde şiddetli ağrı var |
| 27 | `bleeding` | `kanama` | `bleeding` | Kanamam var |
| 28 | `vomiting` | `kusma` | `vomiting` | Kusuyorum |
| 29 | `burn` | `yanik` | `burn` | Yanığım var |

`POST /predict` isteğindeki `recognitionContext`:

- `general` (varsayılan): yalnız 20 AUTSL sınıfı aday olabilir; `seker` → “Şeker”.
- `symptom`: yalnız 10 belirti + `seker` aday olabilir; `seker` → `expressionId=diabetes`.
  Deneysel politikada eşik altı en iyi aday `forcedCandidate=true`, `isLowConfidence=true`,
  `requiresConfirmation=true` ile gösterilir. Kalite kapısından geçmeyen kayıt için aday üretilmez.

Uygulama ilk şikâyet ekranında `symptom`, doktor sorularına yanıtta `general` gönderir. Onay ekranı
avatarı yalnız `expressionId` ve cümle birlikte eşleşirse gösterir; `heart-attack`, `bleeding`, `burn`
için ayrıca acil uyarısı çıkar. `headache`, `stomachache`, `nausea`, `shortness-of-breath` manuel
seçimde kalır (bileşik veya anlamı TİD uzmanınca doğrulanmamış ifadeler).

`GET /api/ai/status`, servisin `modelVersion`/`vocabularyVersion`/`preprocessingVersion` değerlerini
`AI_EXPECTED_*` ayarlarıyla karşılaştırır; uyuşmazlıkta `cameraAiEnabled=false`,
`versionMismatch=true` döner ve kamera açılmaz.

## 1. MEB verisini hazırlama

Canlı kamera tarayıcıda **MediaPipe Tasks** çıkarıcısını, Python hattı ise eski **Holistic** çözümünü
kullanır. İki çıkarıcının landmark dağılımı aynı olmadığından, aynı MEB videoları tarayıcı çıkarıcısıyla da
işlenir (10 kare/sn iki faz + 25 kare/sn). Bu görünümler yeni katılımcı değildir; canlı kameraya
uyumu artırmak için aynı referansın ikinci bir “çıkarıcı görünümü”dür.

```powershell
# 1) Canlı çıkarıcı görünümleri (bir kez; Chrome/Chromium + ffmpeg veya Python/OpenCV gerekir)
cd signbridge-app
npm i --no-save playwright@1.56
npx playwright install chromium
cd ..
node scripts/extract-browser-landmarks.mjs "$env:SIGNBRIDGE_DATA_ROOT/meb" "$env:SIGNBRIDGE_DATA_ROOT/processed/meb_health11_browser_raw.json"

# 2) Kırpma, kısa boşluk doldurma, kalite ve manifest (her iki çıkarıcı için)
cd ai-training
python -m src.data.prepare_meb_health --data-root "$env:SIGNBRIDGE_DATA_ROOT" `
  --browser-landmarks "$env:SIGNBRIDGE_DATA_ROOT/processed/meb_health11_browser_raw.json"
```

`--browser-landmarks` verilmezse yalnız eski Holistic görünümü hazırlanır. Tarayıcı dosyasındaki
video SHA-256 değeri yerel videoyla eşleşmezse işlem durur.

- Kaynak adresi, indirme tarihi, SHA-256, kare sayıları ve kalite durumu
  `manifests/meb_health11_training.csv` ve `manifests/meb_health11_summary.json` içine yazılır.
- Aktif el, el landmark yol uzunluğuyla belirlenir; en fazla 5 karelik el/omuz kayıpları
  doğrusal enterpolasyonla doldurulur, daha uzun kayıplar olduğu gibi kalır.
- Ellerin görünmediği baş/son kareler (3 kare pay bırakılarak) kırpılır; yatay çevirme yapılmaz.
- `kalp-carpintisi`, `kalp-krizi`, `kusma`, `seker-hastaligi` için iskelet bindirmeli kontrol görseli
  `<veri kökü>/reports/meb_health11_overlays/` altına yazılır (MEB karesi içerdiği için depoya girmez).
- İlk kaynak kalite durumu `source_quality_status` sütununda korunur.
- NPZ çıktıları `<veri kökü>/processed/meb_health11/landmark46-v1/` altındadır.

## 2. Eğitim

```powershell
python -m src.train_unified `
  --data-root "$env:SIGNBRIDGE_DATA_ROOT" `
  --base-model outputs/saved_model `
  --output-dir outputs/unified30
```

Docker ile (`.env` içinde `SIGNBRIDGE_DATA_ROOT` ayarlı; eğitim çıktı klasörü `TRAINING_OUTPUT_DIR`, varsayılan `./ai-training/outputs`):

```powershell
docker compose --profile training build ai-training
docker compose --profile training run --rm --entrypoint python ai-training `
  -m src.data.prepare_meb_health --data-root /data `
  --browser-landmarks /data/processed/meb_health11_browser_raw.json
docker compose --profile training run --rm --entrypoint python ai-training `
  -m src.train_unified --data-root /data --manifest-dir /app/manifests `
  --base-model /outputs/saved_model --output-dir /outputs/unified30
```

Başlangıç modeli olarak `saved_model` klasörü kullanılır; mevcut `.keras` dosyası TF 2.15 ile
yüklenemediği için varsayılan değildir.

Yöntem:

1. Eski modelin encoder ağırlıkları kopyalanır; ilk 20 çıkış ağırlığı aynı indekslere taşınır,
   10 yeni çıkış rastgele başlar.
2. Encoder dondurulup yalnız çıkış katmanı eğitilir (≤10 epoch, `1e-3`).
3. Son BiGRU, Dense-64 ve çıkış katmanı açılır (≤30 epoch, `1e-4`, erken durdurma 7).
4. AUTSL eğitim verisi eğitimde kalır; hedefler `0,5 × gerçek etiket + 0,5 × eski model çıktısı`
   (bilgi damıtma).
5. MEB örnekleri batch'lerin 1/3'ünü oluşturur; her belirti eşit olasılıkla örneklenir ve çevrim içi
   artırılır: zaman %80–120, başlangıç/bitiş kaydırması, küçük ölçek ve koordinat gürültüsü,
   %0–5 kare ve %0–3 landmark düşürme. Çevirme, büyük döndürme, MixUp yoktur.
6. Tohumlar `42`, `123`, `2026` ayrı ayrı eğitilir. AUTSL test kaybı en fazla 3 yüzde puan olan
   çalıştırmalar arasından AUTSL doğrulama doğruluğu en yüksek olan seçilir.
7. Çıktı klasörü boş olmalıdır; eski model ve metrikler değiştirilmez.

İsteğe bağlı `--probe-manifest`, eğitime girmeyen ek bir belirti kümesini yalnız raporlar.

Çıktılar (`outputs/unified30/`): `saved_model/`, `runtime_config.json`, `labels.signbridge30.json`,
`decision_policy.unified30-team-camera.json`, `metrics.json`, `training_summary.json`,
`class_regression.csv`, `regression_report.md`, `model_card.md`, `seeds/seed-*/`.

Yerel, sağlama toplamlı paket (dağıtım için değildir):

```powershell
python -m src.package_release --data-root "$env:SIGNBRIDGE_DATA_ROOT" --model-dir outputs/unified30 `
  --output outputs/signbridge-unified30-package `
  --decision-policy configs/decision_policy.unified30-team-camera.json `
  --evidence-file outputs/unified30/regression_report.md `
  --evidence-file outputs/unified30/training_summary.json `
  --evidence-file outputs/unified30/class_regression.csv
python -m src.package_release --output outputs/signbridge-unified30-package --verify
```

## 3. Çalıştırma ve geri dönüş

```powershell
Copy-Item .env.unified30.example .env   # SIGNBRIDGE_DATA_ROOT satırını kendinize göre düzeltin
docker compose up --build -d
Invoke-RestMethod http://localhost:3000/api/ai/status
```

Beklenen: `mode=team_camera`, `modelVersion=signbridge-unified30-bigru-v0.2.0`,
`vocabularyVersion=signbridge30-v1`, `versionMismatch=false`.

**Eski modele dönüş:** `.env` içinde şu satırları eski değerlerine alın ve `docker compose up -d`:

```dotenv
SIGNBRIDGE_MODEL=autsl20
MODEL_DIR=./ai-training/outputs
LABELS_FILE=labels.autsl20.json
DECISION_POLICY_FILE=decision_policy.team-camera.json
AI_EXPECTED_MODEL_VERSION=autsl20-bigru-v0.1.0
AI_EXPECTED_VOCABULARY_VERSION=autsl20-v1
```

Hazır ayar dosyası: `.env.autsl20.example`. Varsayılan ayarlar (`.env.docker.example`) artık 15 belirti
avatarlı `unified34` paketini kullanır ([model-release-unified34-v0.3.0.md](model-release-unified34-v0.3.0.md)).

## 4. 55 kamera denemesi

1. MEB referans videolarını deneme ekranına kopyalayın (depoya girmez):
   `node scripts/copy-meb-references.mjs "<veri kökü>/meb"`
2. `.env` içinde `CAMERA_TRIALS_ENABLED=true` (örnek dosyada açık) ve servis birleşik modelde.
3. <http://localhost:3000/camera-trials> → katılımcı kodu → **Kamerayı aç** → her denemede referansı
   izleyip **Denemeyi başlat**. Ekran sonucu, avatarı, ilk üç tahmini, skoru, hareket skorunu ve gecikmeyi
   gösterir; **Evet/Hayır** ile hasta onayı kaydedilir. Kalite kapısından geçmeyen girişim aday
   üretmez ve aynı deneme tekrarlanır.
4. **CSV indir** → `python -m src.summarize_symptom_trials <csv> --output reports/symptom-camera-trials.md`

Kayıtlar eğitim veya eşik ayarı için kullanılmaz. Rapor kabul seviyelerini yazar:

- **Teknik entegrasyon:** her tahminde doğru avatar; `seker` her zaman `diabetes` avatarıyla.
- **Deneysel demo:** 11 belirtinin her birinde en az bir doğru ve onaylı kamera tahmini.
- **Başarısız sınıflar** gizlenmez, raporda listelenir.

## 5. Kabul kriterleri ve sınırlar

- İlk 20 sınıfın indeksleri değişmez (test: `test_contract.py`).
- AUTSL test doğruluğundaki kayıp ≤ 3 yüzde puan; `seker` ve yeni sınıflara kayan örnekler ayrıca
  raporlanır (`regression_report.md`).
- Negatif testler: statik duruş, görünmeyen el/omuz, kısa kayıt, boş maske, yanlış boyut, geçersiz sayı,
  bağlam dışı sınıf, onaysız aktarım, yanlış avatar (`tests/test_release.py`, `tests/test_unified30.py`,
  `signbridge-app/tests/*.test.*`).
- 46 landmark yüz, baş, göz ve gövde hareketlerini içermez; TİD'de anlamı değiştirebilen bu bilgiler
  modelde yoktur.
- MEB sağlık sözlüğünde makine öğrenmesi ve model ağırlığı dağıtımı için açık bir lisans görülmemiştir.
  MEB videoları, bunlardan üretilen NPZ'ler ve birleşik model ağırlıkları izin doğrulanana kadar
  GitHub'a veya herkese açık bir yere yüklenmez.
