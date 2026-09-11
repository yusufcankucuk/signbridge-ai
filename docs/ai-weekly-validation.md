# Yunus — haftalık AI doğrulama ve teslim kılavuzu

11 Eylül 2026. Aşağıdaki otomatik işler yerelde uygulanmıştır; fiziksel katılımcı denemeleri ayrıca yürütülecektir.
13 Eylül son tarihi, kamera/ekip/bulut kanıtının kendiliğinden oluştuğu anlamına gelmez.
[Güncel ölçümler ve sınırlar](../ai-training/reports/ai-validation-2026-09-11.md).

## 1. Ortam ve ilk kontrol

PowerShell'i depo kökünde aç. Sonra:

```powershell
cd ai-training
$py = '.\.venv\Scripts\python.exe'
$dataRoot = 'C:\Users\yunusozdemir\Desktop\huawei staj\ai icin kullanilacak kaynaklar'
& $py -m pip install -r requirements.validation.txt
& $py -m pytest -q
```

Sanal ortam yoksa önce `python -m venv .venv` çalıştır. Python 3.9 ile mevcut yerel kurulum
doğrulandı; TensorFlow 2.15.1 korunur. Yeni Python sürümünü rastgele seçme.
Mevcut `outputs/` üzerine deney yazma. Komutlardaki `runs/my-*` isimlerini her denemede değiştir;
araçlar var olan denemelerin üzerine yazmayı reddeder.

## 2. Kamera denemeleri — senin fiziksel katılımın gereken bölüm

```powershell
New-Item -ItemType Directory -Force runs/my-camera-trials | Out-Null
& $py -m src.validate_video --matrix --output runs/my-camera-matrix-pending.csv
& $py -m src.validate_video --camera 0 --participant-plan development --signer-code p01 --performance-verified prompt --output runs/my-camera-trials/development-p01.csv
& $py -m src.validate_video --camera 0 --participant-plan holdout --signer-code p02 --performance-verified prompt --output runs/my-camera-trials/holdout-p02.csv
```

Model ve karar politikası süreç başında bir kez yüklenir ve sentetik girdiyle ısıtılır; bu başarı ölçümü değildir.
İlk ENTER kamerayı açar; ikinci ENTER kaydı bitirir. Önerilen hareket süresi 2–4 saniye,
güvenlik sınırı 12 saniye/360 karedir. Zaman/kare sınırı devreye girerse CSV'de açıkça görünür.
Kamera önizlemesi yoktur, başkasının arayüzünü değiştirmez; bir arkadaşın kadrajı dışarıdan kontrol edebilir.
Ham kareler bellekte işlenir, diske kaydedilmez. Aynalama yapılmaz, en-boy oranı korunur.
Bir komut bir izole işaret içindir. İleri/geri video veya sürekli konuşma çevirisi değildir.

Beş sınıf: doktor, hasta, hayır, evet, ilaç. Koşullar: normal, low_light, far, slow, fast.
Birinci kişi 25 `development`, ayarlara hiç katılmayan ikinci kişi 25 `holdout` denemesi yapar.
Grupları birleştirip bağımsız test diye sunma. Ek deneme gerekiyorsa tek-deneme komutuyla yeni bir `trial-id`
kullan; eski başarısız kaydı silme.
`--performance-verified prompt`, her çekimden sonra işaretin referansa uygunluğunu ayrı ayrı sorar; belirsiz
yanıt performans hesabına alınmaz.
Sonuçları sabit 50 satırlık tabloda birleştir:

```powershell
& $py -m src.summarize_camera --trial-dir runs/my-camera-trials --output runs/my-camera-results.csv
```

`my-camera-results.summary.json` development ve holdout ölçülerini ayrı verir. `complete=true` olmadan matris
bitmiş sayılmaz; pending satırı başarı sayma. Kabul doğruluğu ve kapsama yalnız `performance_verified=yes`
kayıtlarında pay/payda ve Wilson %95 güven aralığıyla hesaplanır.
İşaretin doğruluğu uzman/referansla doğrulanmadan `--performance-verified yes` yazma.
Farklı kişileri p01/p02 gibi kodla; kişisel isim veya hasta bilgisi kaydetme.
Geliştirme çekimleri `--group development`, daha önce karara katılmamış son denemeler `--group holdout`.

Kayıtlı video:

```powershell
& $py -m src.validate_video --video "$dataRoot\meb\agri.mp4" --expected-class agri --group reference --output runs/my-agri.csv
```

Bu MEB kelimesi eğitim sınıfı değil. Kod çalışması ile kelimenin doğru tanınması farklıdır.
`quality_blocked` görüntü sorunu, `accepted=False` skor eşiği altı, `error` araç/kayıt sorunudur.
Başlangıç/bitiriş hareketin tümünü içermeli; eller ve omuzlar görünmelidir. Yine hata varsa nedeni
kanıt olmadan ışık/kullanıcı diye yazma. CSV'de yalnızca ölçülen durum ve belirsizlik dursun.

## 3. Validation ve OOD

```powershell
& $py -m src.evaluate_release --data-root $dataRoot --output runs/my-validation --trusted-autsl-pickle
```

Bu bayrak yalnızca daha önce güvenilir resmî AUTSL/OpenHands kaynağından indirilmiş PKL için kullanılır.
Pickle bilinmeyen kaynaktan yüklenmez; kod çalıştırabilir. Betik modeli yeniden eğitmez,
test kümesini eşik seçimine katmaz ve aktif eşiği kendiliğinden değiştirmez.
378 validation örneğinin skoru bir kez hesaplanır. Altı skor eşiği ve dört top-1/top-2 fark eşiği
karşılaştırılır; aynı kabul/ret sonucunu veren kombinasyonlar tek aday sayılır. Sabit tohumla, skorlar görülmeden
10 geliştirme OOD sınıfından sınıf başına en fazla 10 örnek seçilir. Farklı 10 OOD sınıfı son kontrol için ayrılır.
Politika validation + geliştirme OOD ile dondurulur; holdout sonucu ayarı yeniden değiştirmek için kullanılmaz.
ECE, çok sınıflı Brier skoru ve reliability diagram üretilir; temperature scaling yapılmaz.
`decision_policy.candidate.json` öneridir ve aktif ayarı kendiliğinden değiştirmez.
Sözlük dışı yüksek güvenli hata bulunması başarılı bir tespit çalışmasıdır, güvenli ürün kanıtı değildir.

## 4. Servis ve gerçek uygulama proxy'si

Birinci terminal, ai-training içinde:

```powershell
$env:MODEL_PATH = (Resolve-Path 'outputs/saved_model').Path
$env:RUNTIME_CONFIG_PATH = (Resolve-Path 'outputs/runtime_config.json').Path
$env:DECISION_POLICY_PATH = (Resolve-Path 'configs/decision_policy.json').Path
& .\.venv\Scripts\python.exe -m uvicorn src.service:app --host 127.0.0.1 --port 8765
```

İkinci terminal, signbridge-app içinde:

```powershell
$env:AI_SERVICE_URL = 'http://127.0.0.1:8765'
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001
```

Üçüncü terminal, ai-training içinde, aynı `$dataRoot` tanımıyla:

```powershell
& .\.venv\Scripts\python.exe -m src.integration_probe --data-root $dataRoot --proxy-url http://127.0.0.1:3001/api/ai/predict --output runs/my-integration
```

Gerçek validation girdisi üç yolda karşılaştırılır. `request.private.json` türetilmiş veri içerir;
Git'e ekleme, Jira'ya yükleme. `examples/` dosyaları sözleşme/sentetik örneklerdir, canlı başarı kanıtı değildir.
Port kullanımda ise çalışan başkasının servisini durdurma; farklı port seç ve `--url`/`--proxy-url` ile belirt.
Kendi açtığın terminalleri Ctrl+C ile kapat. AI anahtarları yalnızca sunucuda kalmalı.

İstek: sessionId (isteğe bağlı), preprocessingVersion, landmarks 60×46×2, mask 60×46.
Cevap: classId/displayText/confidence/alternatives/isLowConfidence/predictionMode, model/ön işleme/sözlük
sürümleri ile decisionPolicyVersion/rejectionReason/requiresConfirmation.
Boş veya 0/1 dışı mask, yanlış şekil, sonlu olmayan koordinat reddedilir; sürüm uyuşmazlığı 409.
0,80'in altı classId=null; tam 0,80 kabul edilir. Hasta onayı bu AI endpoint'inin işi değildir.

## 5. Paket ve ModelArts yerel smoke test

```powershell
& $py -m src.package_release --data-root $dataRoot --decision-policy configs/decision_policy.json --validation-dir runs/my-validation --evidence-file runs/my-latency.json --output runs/my-release
& $py -m src.package_release --output runs/my-release --verify
& $py runs/my-release/code/modelarts/train_start.py --data_url runs/my-release/data --train_url runs/my-smoke --smoke --epochs 1
```

Paket:

```text
my-release/
  code/                 eğitim/çıkarım kodu, configs, requirements, modelarts
  data/manifests/       onaylı split listeleri
  data/processed/       yalnızca onaylı NPZ
  model/saved_model/    korunmuş ana model
  model/runtime_config.json
  model/labels.autsl20.json
  model/preprocessing.json
  model/decision_policy.json
  model/validation_addendum.md
  validation/            karar, OOD ve kalibrasyon kanıtları
  docs/                  güncel model kartı, poz uyumluluğu ve servis sözleşmesi
  checksums.json        dosya bütünlüğü
  package_manifest.json
```

Smoke bir epoch, sınıf başına en fazla iki train/validation örneği çalıştırır; test kümesini okumaz.
Modeli kaydeder ve yeniden yüklemenin aynı tahmini verdiğini doğrular. Çok düşük smoke doğruluğu
ürünün yeni sonucu değildir. `--smoke` olmadan tam eğitim maliyeti/süresi oluşabilir.
Manifestteki yol veri köküne göre çözülür; eski bilgisayar mutlak yollarına bağımlı değildir.

Paket servisini açmak için MODEL_PATH/RUNTIME_CONFIG_PATH ve LABELS_PATH değişkenlerini
paketin model dizinindeki dosyalara ayarla; ayrıca DECISION_POLICY_PATH'i `model/decision_policy.json`
olarak ver. Kod dizininde `python -m uvicorn src.service:app` çalıştır. Paket içindeki tek bir NPZ ile
komut satırı doğrulaması şu şekilde yapılır:

```powershell
& $py -m src.model.predict --model runs/my-release/model/saved_model --runtime-config runs/my-release/model/runtime_config.json --decision-policy runs/my-release/model/decision_policy.json --input '<paket-icindeki-test-ornek.npz>'
```

Sabit bir NPZ ile model yükleme, soğuk tahmin ve 30 ısınmış tahmin ölçümü:

```powershell
& $py -m src.benchmark_latency --input '<validation-ornek.npz>' --iterations 30 --output runs/my-latency.json
```

Bu sabit NPZ tekrarı canlı kamera gecikmesi değildir. Gerçek kamera CSV'si hazır olduğunda
`--camera-csv runs/my-camera-results.csv` eklenerek landmark, ön işleme, model ve kayıt-sonrası süreleri
ayrı p50/p95/maksimum değerlerle raporlanır.

## 6. Huawei erişimi açılınca

Önce sorumluya hesap/proje/bölge, OBS okuma-yazma, ModelArts eğitim yetkisi, uygun kota,
onaylı harcama sınırı, SWR/özel imaj ve endpoint iznini sor. Şifre/AK/SK isteme veya Jira'ya yazma.
Veri kullanım izni teyidi ve bütçe onayı olmadan yükleme/ücretli kaynak başlatma.

1. `code/` ve `data/` içeriklerini sürümlü, özel OBS dizinlerine koy.
2. TensorFlow 2.15.1/Python uyumlu ortam seç; MoXing'in mevcut olduğunu doğrula.
   Özel Docker imajı MoXing'i otomatik içermez. MoXing yoksa yerel indirilen/mount edilen data yolu kullanılabilir;
   gerçek OBS kopyası ayrıca sınanmalıdır.
3. Eğitim giriş dosyası `modelarts/train_start.py`. data_url indirilecek data/ dizini,
   train_url yeni ve boş çıktı prefix'i; epochs=1, --smoke ile başla.
4. Veri dizininin altında manifests ve processed birlikte olmalı. Job ID, ortam ve çıktı/log adreslerini kaydet.
5. Başarıdan sonra istenirse tam eğitim; endpoint için servisin port, start komutu, health ve prediction
   ayarlarını gerçek bölgenin özel imaj kurallarına göre tanımla. Yerel `/health` ve `/predict`
   tek başına platform uyumluluğu kanıtı değildir.
6. Aynı entegrasyon isteğini yetkili sunucu üzerinden dene. Secret'ı frontend'e taşıma.
7. Deneme sonunda ücretli işleri/servisleri durdur; depolama ücretini de kontrol et.

Resmî kaynaklar: [ModelArts başlangıç uygulamaları](https://support.huaweicloud.com/intl/en-us/qs-modelarts/modelarts_06_0043.html),
[özel imaj ile model sunumu (eski sürüm)](https://support.huaweicloud.com/intl/en-us/bestpractice-modelarts/modelarts_10_0072.html).
Ekran/bölge farkları olabileceğinden bu belge bir doğrulanmış bulut deployment tarifi değildir.

## 7. Son ortak kabul — henüz yapılmadı

Büşra: kamerada tek işaret → öneri/düşük güven mesajı → onay veya düzeltme.
Yusufcan: onaylanmamış öneri kesin mesaj olmamalı; doktor yanıtı → yeni tur → oturum bitirme.
Gerçek uygulamada bu turu birlikte çalıştırıp tarih, sürüm ve sonucu kaydedin.
Tek bir proxy isteğinin geçmesi bu kullanıcı turunun geçtiği anlamına gelmez.
PR/develop/main birleştirmesi ve GitHub push bu uygulamada yapılmadı.
