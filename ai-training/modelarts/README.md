# Huawei ModelArts çalıştırma notları

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

`train_start.py`, OBS adreslerini ModelArts geçici diskine kopyalar, ortak `src/train.py` dosyasını çalıştırır ve çıktıları yeniden OBS'ye gönderir. İş başlamadan önce seçilen ModelArts imajında `requirements.txt` bağımlılıklarının kurulabildiği doğrulanmalıdır.

## Dağıtım

1. Eğitim çıktısındaki `saved_model/` klasörünü ModelArts model kaydı içine alın.
2. Çevrim içi tahmin servisi oluşturun ve önce geliştirme ortamında yayınlayın.
3. Uygulama backend'i landmark isteğini servise gönderirken `preprocessingVersion=landmark46-v1` kullanmalıdır.
4. Dönen olasılıkları `runtime_config.json` içindeki eşikle kapılayın.
5. Eşik altındaysa `classId=null` dönün; manuel seçim veya tekrar çekim gösterin.
6. Model/endpoint erişim anahtarını tarayıcıya koymayın; çağrı yalnızca backend üzerinden yapılmalıdır.

Prod yayınından önce KVKK, sağlık verisi saklama süresi, yetkilendirme ve gerçek TİD kullanıcılarıyla saha testi ayrıca değerlendirilmelidir.
