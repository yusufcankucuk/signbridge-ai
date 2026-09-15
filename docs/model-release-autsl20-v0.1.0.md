# SignBridge AUTSL-20 model paketi v0.1.0

Bu sürüm, SignBridge öğrenci MVP'sinin ekip içi kamera testlerinde kullandığı daha önce eğitilmiş
20 sınıflı BiGRU çıkarım paketidir. Modelin yeniden eğitildiği anlamına gelmez; aynı doğrulanmış paketin
Windows, macOS ve Linux ekip bilgisayarlarına güvenilir biçimde dağıtılmasını sağlar.

## Release bilgileri

- Git etiketi: `model-autsl20-v0.1.0`
- Varlık: `signbridge-autsl20-modelarts-v0.1.0.zip`
- SHA-256: `1BDEF13278487E77E788B2A9471A6C25743115BDDC4F6F3BE3615B7C035A5421`
- Model: `autsl20-bigru-v0.1.0`
- Ön işleme: `landmark46-v1`
- Sözlük: `autsl20-v1`
- Test doğruluğu: `%85,22`
- Test macro-F1: `%84,76`
- `0,80` eşik üzerindeki doğruluk: `%93,13`
- `0,80` eşik üzerindeki kapsama: `%82,39`

## Paketin içeriği

Paket SavedModel dosyalarını, `runtime_config.json`, model kartı, metrik özeti ve dosya hash'lerini içerir.
Ham AUTSL PKL/NPZ dosyaları, MEB videoları, kamera kayıtları ve kişisel veri içermez.

## Kurulum

Depo kökünde:

```bash
node scripts/install-model.mjs
node scripts/check-model-assets.mjs
```

Çevrimdışı kullanım:

```bash
node scripts/install-model.mjs --archive path/to/signbridge-autsl20-modelarts-v0.1.0.zip
```

Kurucu arşiv ve iç dosya hash'lerinden biri uyuşmazsa işlemi durdurur; bozuk paket çalışan modelin
üzerine yazılmaz.

## Kullanım sınırları

AUTSL'nin resmi kullanım koşulları akademik ve araştırma kullanımını esas alır. Bu paket ticari veya
klinik bir ürün değildir. SignBridge tek bir izole işaret üzerinde öğrenci MVP'si olarak çalışır;
tıbbi tanı koymaz, profesyonel tercümanın yerini almaz ve her öneri hasta onayı gerektirir.

Mevcut dondurulmuş OOD yanlış kabul oranı `%31,63` olduğundan bu paketle açılan `team_camera` modu
yalnız ekip içi teknik testtir. Final `camera_ai` modu, fiziksel holdout ve OOD yayın kapıları
geçilmeden etkinleştirilmemelidir.
