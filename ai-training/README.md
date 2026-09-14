# SignBridge AI veri ve model hattı

Bu klasör AUTSL poz verisini güvenli bir eğitim biçimine dönüştürür, 20 sınıflı BiGRU başlangıç modelini eğitir ve uygulamanın kullanacağı JSON tahminini üretir.

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

`needs_review` örnekleri silinmez; model eğitimine alınmadan insan incelemesine ayrılır. MEB-16 videoları tek örnekli olduğundan model eğitiminde kullanılmaz; resmî referans ve manuel seçim sözlüğüdür.

## 4. Modeli eğitme

```powershell
python -m src.train --epochs 50 --batch-size 32
```

Eğitimde küçük koordinat gürültüsü, ölçek değişimi ve geçici landmark düşürme uygulanır. TİD'de sağ/sol yön anlam taşıyabileceğinden yatay çevirme kullanılmaz. Erken durdurma doğrulama kaybı iyileşmediğinde eğitimi keser.

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

`configs/decision_policy.json` aktif, geriye uyumlu 0,80 skor kuralıdır. Validation/OOD çalışmasının ürettiği
0,95 aday politika ayrı tutulur; OOD holdout hedefini geçemediği için otomatik etkinleştirilmez.

```powershell
python -m src.evaluate_release --data-root "$env:SIGNBRIDGE_DATA_ROOT" --output runs/my-policy --ood-per-class 10 --trusted-autsl-pickle
python -m src.benchmark_latency --input '<validation-ornek.npz>' --output runs/my-latency.json
```

Serviste özel politika kullanmak için `DECISION_POLICY_PATH` verilir. Dosya bozuk veya model sürümüyle
uyumsuzsa servis başlatılmaz; sessiz geri dönüş yapılmaz.

## 8. Huawei ModelArts

ModelArts eğitim adımları ve OBS klasör yapısı [modelarts/README.md](modelarts/README.md) dosyasındadır. Yerelde çalışan aynı `src/train.py` kodu bulutta da kullanılır; böylece iki ayrı eğitim mantığı oluşmaz.
