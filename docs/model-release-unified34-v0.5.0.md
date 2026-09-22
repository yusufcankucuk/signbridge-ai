# SignBridge unified34 model paketi v0.5.0

Varsayılan kurulumun kullandığı deneysel kamera modeli: 20 AUTSL kelimesi ve 15 belirti avatarı
(baş ağrısı, karın ağrısı, baş dönmesi, bulantı, nefes darlığı, ateş, ağrı, astım, döküntü, çarpıntı,
kalp krizi, kanama, kusma, şeker hastalığı, yanık).

## Release bilgileri

- Git etiketi: `model-unified34-v0.5.0`
- Varlık: `signbridge-unified34-v0.5.0.zip` (yaklaşık 5 MB)
- SHA-256: `8FD894F6D987CFEFD07EC9664494D8A79C9CE98A323196E55AFB37FD2872CA46`
- Model: `signbridge-unified34-bigru-v0.5.0` (kodlayıcı AUTSL-226 ön eğitimli, ayna ortalamalı tahmin,
  belirti bağlamında **sınıf merkezi (prototip) skorlaması**)
- Ağırlıklar v0.4.0 ile birebir aynıdır; değişen yalnız belirti bağlamındaki karar katmanıdır
- Ön işleme: `landmark46-v1`, özellik düzeni `xy-mask-138+handlocal-84`
- Sözlük: `signbridge34-v1`
- AUTSL-20 test doğruluğu: %92,14 (v0.3.0: %87,74)
- Eğitimde görülmemiş kişilerde, işaret öncesi/sonrası doğal hareket içeren kayıtlarda:
  - ilk öneri **%68,5** (v0.4.0: %61,2; eski uygulama + eski yöntem: %42,8);
  - doğru avatar onay ekranındaki üç avatardan birinde **%83,5** (v0.4.0: %80,7).
- Güven eşiği 0,80'in üstündeki kayıtlar: %40'ı kabul edilir ve bunların **%94,5'i doğrudur**
  (v0.4.0'da 0,95 eşiğiyle %24 kabul, %84,9 doğruluk).
- Temiz kurulum denemesi (kurulum aracı + Python 3.9 / TF 2.15.1 + sahte kamera): 15 avatarın her biri
  2 kez, 30/30 doğru (kliplerin çoğu eğitim verisindedir).

v0.3.0 hiç yayınlanmadı; v0.5.0 onun yerine geçer. Ayrıntılı ölçümler:
[../ai-training/reports/unified34-v0.5.0-2026-09-19.md](../ai-training/reports/unified34-v0.5.0-2026-09-19.md).

## Paketin içeriği

SavedModel, `runtime_config.json`, **`prototypes.json`** (15 belirtinin sınıf merkezi vektörleri),
etiket ve karar politikası kopyaları. Videolar, landmark (NPZ) dosyaları ve kişisel veri içermez.

`prototypes.json`, eğitim verisindeki **gerçek** (sentetik olmayan) 256 sağlık örneğinin
`encoder_bigru_64` temsillerinin sınıf ortalamasıdır; ham veri geri üretilemez.

## Kurulum

Depo kökünde:

```bash
node scripts/install-model.mjs          # varsayılan: unified34 → ai-training/outputs/unified34
node scripts/check-model-assets.mjs
```

Docker: `docker compose --profile setup run --rm model-setup`. Çevrimdışı:
`node scripts/install-model.mjs --archive path/to/signbridge-unified34-v0.5.0.zip`.

## Release'i yayınlama (bakımcı)

1. GitHub → **Releases → Draft a new release**.
2. Etiket: `model-unified34-v0.5.0` (hedef: bu değişikliklerin bulunduğu dal).
3. Başlık: `SignBridge unified34 model v0.5.0`; açıklamaya bu dosyanın ilk iki bölümünü yapıştırın.
4. `signbridge-unified34-v0.5.0.zip` dosyasını yükleyin ve yayınlayın. Dosya adı ve SHA-256 değişmemelidir;
   farklı bir dosya yüklenirse kurulum hash kontrolünde durur.

Kontrol: `curl -L -o /tmp/m.zip https://github.com/yusufcankucuk/signbridge-ai/releases/download/model-unified34-v0.5.0/signbridge-unified34-v0.5.0.zip && sha256sum /tmp/m.zip`

## Kullanım sınırları

Akademik/araştırma amaçlı öğrenci prototipidir. Tıbbi tanı koymaz, tercümanın yerini almaz; her kamera
önerisi hasta onayı ister. Eğitim videolarının kullanım izni proje ekibinin beyanına dayanır. Sözlük
sitelerinin (Spreadthesign, Güncel TİD Sözlüğü) videoları bu paketin eğitiminde kullanılmadı.

Karın ağrısı, bulantı, kusma ve çarpıntı az kişinin videosuna dayandığı için zayıftır. Başta ve göğüste
yapılan belirtiler birbiriyle karışabilir; onay ekranındaki diğer iki avatar bu durum için vardır.
