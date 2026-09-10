# Huawei ModelArts çalıştırma notları

## Buluta geçmeden önce

Önce `docs/ai-weekly-validation.md` içindeki yerel doğrulama ve paketleme adımlarını tamamlayın. ModelArts hesabı veya kaynak yetkisi hazır değilse bulutta çalıştırılmış gibi kayıt oluşturmayın; sürümlü paketi ve yerel smoke test sonucunu teslim edin.

Sürüm paketi şu komutla hazırlanır:

```powershell
$dataRoot = 'C:\Users\yunusozdemir\Desktop\huawei staj\ai icin kullanilacak kaynaklar'
python -m src.package_release --data-root $dataRoot --output runs/release
```

Paketin içindeki `data/manifests` dosyaları yalnızca paket içindeki göreli NPZ yollarını kullanır. Böylece yerel bilgisayara özgü `C:\...` yolları ModelArts'a taşınmaz.

## OBS dizini

Önce yerelde üretilen `processed/autsl20/landmark46-v1` dizinini, manifest CSV'lerini ve `configs` dosyalarını bir OBS klasörüne yükleyin. Ham PKL/video yüklemek zorunlu değildir.

```text
obs://<bucket>/signbridge/data/
├── processed/autsl20/landmark46-v1/{train,validation,test}/
├── manifests/
└── configs/
```

Eğitim kodunu ayrı bir OBS klasörüne yükleyin veya Git deposundan bağlayın. ModelArts özel eğitim işinde giriş dosyası `ai-training/modelarts/train_start.py` olmalıdır.

Örnek iş parametreleri:

```text
--data_url=obs://<bucket>/signbridge/data/
--train_url=obs://<bucket>/signbridge/output/run-001/
--epochs=50
--batch-size=32
```

`train_start.py`, OBS adreslerini ModelArts geçici diskine kopyalar, indirilen `manifests/` dizinini açıkça eğitim koduna iletir, ortak `src/train.py` dosyasını çalıştırır ve çıktıları yeniden OBS'ye gönderir. İş başlamadan önce seçilen ModelArts imajında `requirements.txt` bağımlılıklarının kurulabildiği doğrulanmalıdır.

Tam eğitimden önce aynı giriş dosyasını yerelde bir epoch ve sınıf başına en fazla iki örnekle sınayın:

```powershell
python modelarts/train_start.py `
  --data_url runs/release/data `
  --train_url runs/modelarts-smoke `
  --smoke
```

Bu çalıştırma yalnızca veri yollarının, eğitimin, model kaydının ve yeniden yüklemenin çalıştığını doğrular. Üretilen metrik bir başarı ölçümü değildir ve mevcut başarılı modelin üzerine yazılmaz.

## Dağıtım

1. Eğitim çıktısındaki `saved_model/` klasörünü ModelArts model kaydı içine alın.
2. Çevrim içi tahmin servisi oluşturun ve önce geliştirme ortamında yayınlayın.
3. Uygulama backend'i landmark isteğini servise gönderirken `preprocessingVersion=landmark46-v1` kullanmalıdır.
4. Dönen olasılıkları `runtime_config.json` içindeki eşikle kapılayın.
5. Eşik altındaysa `classId=null` dönün; manuel seçim veya tekrar çekim gösterin.
6. Model/endpoint erişim anahtarını tarayıcıya koymayın; çağrı yalnızca backend üzerinden yapılmalıdır.

Prod yayınından önce KVKK, sağlık verisi saklama süresi, yetkilendirme ve gerçek TİD kullanıcılarıyla saha testi ayrıca değerlendirilmelidir.
