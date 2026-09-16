# SignBridge AI veri ve model hattı

Bu klasör AUTSL poz verisini güvenli bir eğitim biçimine dönüştürür, 20 sınıflı BiGRU başlangıç modelini eğitir ve bu modeli MEB sağlık referanslarıyla deneysel 30 sınıflı birleşik modele genişletebilir.

Kaynak ve kullanım kararları [DATASETS.md](DATASETS.md) dosyasında kayıtlıdır.

## Haftalık kamera, eşik ve teslim çalışması

Yeni araçların adım adım kullanımı: [AI haftalık doğrulama kılavuzu](../docs/ai-weekly-validation.md).
Güncel ölçümler ve tamamlanmamış işler: [11 Eylül AI doğrulama raporu](reports/ai-validation-2026-09-11.md).
Önceki teslimin kaydı: [10 Eylül teslim raporu](reports/weekly-validation-2026-09-10.md).
Güncel kapsam/model kartı: [AI kapsamı ve model kartı v2](../docs/ai-scope-and-model-card-v2.md).
AUTSL ile kamera çıkarıcısı karşılaştırması: [poz uyumluluk raporu](../docs/autsl-camera-pose-compatibility.md).
`runs/` kişiye/veriye bağlı yerel kanıtlardır, Git'e eklenmez. Kamera denemeleri ve bulut çalışması
ayrıca doğrulanmadan tamamlandı sayılmaz.

## 1. Veri dizini

Ham veriler büyük ve lisanslı olduğu için Git'e eklenmez. Dizin şu yapıda olmalıdır:

```text
<SIGNBRIDGE_DATA_ROOT>/
├── AUTSL/
│   ├── train_poses/*.pkl
│   ├── val_poses/*.pkl
│   ├── test_poses/*.pkl
│   ├── train_labels.csv
│   ├── validation_labels.csv
│   └── test_labels.csv
└── meb/*.mp4
```

AUTSL PKL dosyaları yalnızca resmî/güvenilen indirmeden kullanılmalıdır. Pickle dosyası kod çalıştırabildiği için bilinmeyen kaynaktan gelen PKL açılmamalıdır.

## 2. Kurulum

Yalnız çıkarım/kamera testi yapacak ekip üyesi, depo kökünde eğitilmiş sürümlü paketi kurar:

```powershell
node scripts/install-model.mjs                    # varsayılan: unified34 (20 kelime + 15 belirti)
node scripts/check-model-assets.mjs
node scripts/install-model.mjs --model autsl20    # isteğe bağlı: eski 20 kelimelik model
```

Bu işlem modeli yeniden eğitmez. GitHub Release arşivinin ve içindeki SavedModel dosyalarının SHA-256
değerlerini doğrular. Ham AUTSL/MEB verileri pakete veya Git deposuna eklenmez. İnternet olmayan bilgisayarda
aynı arşiv `node scripts/install-model.mjs --archive <zip-yolu>` ile kurulabilir.

Veri hazırlama veya eğitim geliştirmesi yapacak kişi aşağıdaki Python ortamını ayrıca kurar.

Windows PowerShell:

```powershell
cd ai-training
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SIGNBRIDGE_DATA_ROOT = "C:\path\to\signbridge-data"
```

macOS/Linux:

```bash
cd ai-training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export SIGNBRIDGE_DATA_ROOT=/path/to/signbridge-data
```

## 3. Veri hattını çalıştırma

Komutlar `ai-training` klasöründeyken çalıştırılır:

```powershell
python -m src.data.build_manifests
python -m src.data.convert_autsl
python -m src.data.convert_meb
python -m src.data.validate_npz "$env:SIGNBRIDGE_DATA_ROOT\processed"
```

- **Manifest:** Her örneğin kaynağını, etiketini, veri bölümünü ve kalite durumunu tutan CSV envanteridir.
- **Landmark:** Omuz, dirsek ve ellerin görüntüdeki sayısal noktalarıdır.
- **Mask:** Bir noktanın ilgili karede gerçekten görülüp görülmediğini belirtir.
- **Normalizasyon:** Kişinin görüntüdeki yeri ve boyutundan kaynaklanan farkı azaltır.

`needs_review` örnekleri silinmez. AUTSL-20 sürümünde MEB videoları yalnız referanstır. Deneysel
`train_unified` çalışmasında seçilen 11 MEB kaydı açıkça `meb_health11_training.csv` manifestiyle
kullanılır; düşük görünürlük durumu kaybedilmez ve bu örnekler bağımsız test olarak raporlanmaz.

## 4. Modeli eğitme

```powershell
python -m src.train --epochs 50 --batch-size 32
```

Eğitimde küçük koordinat gürültüsü, ölçek değişimi ve geçici landmark düşürme uygulanır. TİD'de sağ/sol yön anlam taşıyabileceğinden yatay çevirme kullanılmaz. Erken durdurma doğrulama kaybı iyileşmediğinde eğitimi keser.

Mevcut modeli 30 çıkışa genişleten deneysel eğitim:

```powershell
python -m src.data.prepare_meb_health --data-root "$env:SIGNBRIDGE_DATA_ROOT" `
  --browser-landmarks "$env:SIGNBRIDGE_DATA_ROOT/processed/meb_health11_browser_raw.json"
python -m src.train_unified `
  --data-root "$env:SIGNBRIDGE_DATA_ROOT" `
  --base-model outputs/saved_model `
  --output-dir outputs/unified30
```

`prepare_meb_health` 11 MEB videosunu kırpar, kısa (≤5 kare) landmark kayıplarını doldurur ve
kaynak SHA-256/kalite bilgisini manifeste yazar. `train_unified` varsayılan olarak `42`, `123`, `2026`
tohumlarını eğitir, AUTSL gerileme kapısını (≤3 yüzde puan) geçenler arasından AUTSL doğrulama
doğruluğu en yüksek olanı seçer ve `regression_report.md` üretir. Kamera denemeleri
`python -m src.summarize_symptom_trials <csv>` ile raporlanır. Ayrıntılar:
[../docs/unified30-symptom-model.md](../docs/unified30-symptom-model.md).

15 belirti avatarlı `signbridge34-v1` modeli için harici videolar, sentetik örnekler ve
`--hand-local-features` seçeneği: [../docs/external-symptom-videos.md](../docs/external-symptom-videos.md).
Bu modelde yalnız sağlık örneklerine %30 olasılıkla ayna uygulanır (solak kullanıcılar); AUTSL örnekleri
çevrilmez.

Bu eğitim ilk 20 çıkış ağırlığını aynı indekslerde tutar, 10 yeni belirti sınıfı ekler ve eski
AUTSL davranışını bilgi damıtma ile korumaya çalışır. `seker-hastaligi` ayrı bir çıkış değildir;
mevcut 14 numaralı `seker` sınıfını destekler ve belirti bağlamında `diabetes` avatarına bağlanır.
Çıktı klasörü boş olmalıdır; mevcut modelin üzerine yazılmaz.

Çıktılar `outputs/` altında oluşur:

- `autsl20-bigru-v0.1.0.keras`: en iyi Keras modeli
- `saved_model/`: Huawei ModelArts sunumuna uygun TensorFlow modeli
- `runtime_config.json`: model ve güven eşiği sürümleri
- `metrics.json`: doğruluk, macro-F1 ve güven kapısı ölçümleri
- `classification_report.csv`: sınıf bazlı sonuçlar
- `confusion_matrix.png`: karışan sınıflar
- `model_card.md`: kullanım amacı, veri ve sınırlar

## 5. Tek örnek üzerinde tahmin

```powershell
python -m src.model.predict `
  --model outputs/autsl20-bigru-v0.1.0.keras `
  --input "$env:SIGNBRIDGE_DATA_ROOT\processed\autsl20\landmark46-v1\test\signer34_sample5.npz" `
  --runtime-config outputs/runtime_config.json `
  --decision-policy configs/decision_policy.json
```

Gerçek dosya adı manifestten seçilmelidir. Çıktı [../docs/ai-contract.md](../docs/ai-contract.md) sözleşmesine uyar.

## 6. Testler

Yerel Python sürümünden bağımsız, sabitlenmiş Python 3.9 ortamında tüm AI testlerini çalıştırmak için depo kökünde:

```powershell
docker compose --profile test run --rm --build ai-tests
```

Bu servis kaynak kodunu salt okunur bağlar, model çıktısı veya veri seti gerektirmeyen birim ve sözleşme testlerini çalıştırır ve test bitince konteyneri siler. Docker imajı sonraki çalıştırmalarda önbellekten yeniden kullanılır.

Uyumlu bir yerel Python ortamı zaten varsa alternatif olarak:

```powershell
pytest
```

Testler ön işleme boyutlarını ve değişmezlerini, sonlu değerleri, sabit sınıf indekslerini, karar politikası
sürüm uyumunu, kamera gruplarını ve örnek JSON sözleşmesini denetler.

## 7. Karar politikası ve gecikme

`configs/decision_policy.json` güvenli `manual_only` politikasıdır. `configs/decision_policy.team-camera.json`
ise doğrulanmış modeli yalnız ekip içi teknik denemede, 20 sınıfın tamamı ve `0,95` eşikle açar. Bu politika
`experimental=true` taşır ve servis durumunda `team_camera` olarak görünür. Dondurulmuş OOD yanlış kabul oranı
`%31,63` ile `%20` sınırını geçtiği için bu mod yayınlanmış güvenli kamera AI olarak sunulmaz.

```powershell
python -m src.evaluate_release --data-root "$env:SIGNBRIDGE_DATA_ROOT" --output runs/my-policy --ood-per-class 10 --trusted-autsl-pickle
python -m src.benchmark_latency --input '<validation-ornek.npz>' --output runs/my-latency.json
```

Hareket eşiği için geliştirme kişisinin geçerli kayıtlarına ek olarak statik negatif kayıtları
`--motion-label static` ile kaydedin. Sonra dosyaları tek CSV'de birleştirip eşiği bir kez dondurun:

```powershell
python -m src.calibrate_motion --input runs/motion-development.csv --output runs/motion-policy.json
```

Yalnız çıktıda `targetMet=true`, `staticRejectRate=1.0` ve `validPassRate>=0.90` ise bulunan
`minimumMotionScore` web ortamına aktarılıp `CAMERA_MOTION_POLICY_ENABLED=true` yapılabilir.

Serviste özel politika kullanmak için `DECISION_POLICY_PATH` verilir. Dosya bozuk veya model sürümüyle
uyumsuzsa servis başlatılmaz; sessiz geri dönüş yapılmaz.

## 8. Huawei ModelArts

ModelArts eğitim adımları ve OBS klasör yapısı [modelarts/README.md](modelarts/README.md) dosyasındadır. Yerelde çalışan aynı `src/train.py` kodu bulutta da kullanılır; böylece iki ayrı eğitim mantığı oluşmaz.
