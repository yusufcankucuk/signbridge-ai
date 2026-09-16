# SignBridge unified34 model paketi v0.3.0

Varsayılan kurulumun kullandığı deneysel kamera modeli: 20 AUTSL kelimesi ve 15 belirti avatarı
(baş ağrısı, karın ağrısı, baş dönmesi, bulantı, nefes darlığı, ateş, ağrı, astım, döküntü, çarpıntı,
kalp krizi, kanama, kusma, şeker hastalığı, yanık).

## Release bilgileri

- Git etiketi: `model-unified34-v0.3.0`
- Varlık: `signbridge-unified34-v0.3.0.zip` (yaklaşık 5 MB)
- SHA-256: `06564F73A49DA52912BFAC15D610496894EDEEA4A9B2B82F3B11988E7FC3C9CF`
- Model: `signbridge-unified34-bigru-v0.3.0`
- Ön işleme: `landmark46-v1`, özellik düzeni `xy-mask-138+handlocal-84`
- Sözlük: `signbridge34-v1`
- AUTSL-20 test doğruluğu: %87,74 (eski model %85,22)
- Eğitimde görülmemiş kişilerde belirti doğruluğu: %48,5–52,1 (canlı akışta 19/34)

- Temiz kurulum denemesi (yeni klon, Python 3.9 + TF 2.15.1, Node 22, kurulum aracı + sahte kamera):
  30 canlı denemede 23 doğru, 15 avatarın 13'ü en az bir kez doğru; bulantı klibi el görünürlüğü
  kapısında reddedildi.

Ayrıntılı ölçümler: [../ai-training/reports/unified34-v0.3.0-2026-09-16.md](../ai-training/reports/unified34-v0.3.0-2026-09-16.md).

## Paketin içeriği

SavedModel, `runtime_config.json`, etiket ve karar politikası kopyaları, model kartı, gerileme raporu,
metrikler ve `MODEL_USAGE.md`. Videolar, landmark (NPZ) dosyaları ve kişisel veri içermez.

## Kurulum

Depo kökünde:

```bash
node scripts/install-model.mjs          # varsayılan: unified34 → ai-training/outputs/unified34
node scripts/check-model-assets.mjs
```

Docker: `docker compose --profile setup run --rm model-setup`. Çevrimdışı:
`node scripts/install-model.mjs --archive path/to/signbridge-unified34-v0.3.0.zip`.

## Release'i yayınlama (bakımcı)

1. GitHub → **Releases → Draft a new release**.
2. Etiket: `model-unified34-v0.3.0` (hedef: bu değişikliklerin bulunduğu dal).
3. Başlık: `SignBridge unified34 model v0.3.0`; açıklamaya bu dosyanın ilk iki bölümünü yapıştırın.
4. `signbridge-unified34-v0.3.0.zip` dosyasını yükleyin ve yayınlayın. Dosya adı ve SHA-256 değişmemelidir;
   farklı bir dosya yüklenirse kurulum hash kontrolünde durur.

Kontrol: `curl -L -o /tmp/m.zip https://github.com/yusufcankucuk/signbridge-ai/releases/download/model-unified34-v0.3.0/signbridge-unified34-v0.3.0.zip && sha256sum /tmp/m.zip`

## Kullanım sınırları

Akademik/araştırma amaçlı öğrenci prototipidir. Tıbbi tanı koymaz, tercümanın yerini almaz; her kamera
önerisi hasta onayı ister. Eğitim videolarının kullanım izni proje ekibinin beyanına dayanır. Bulantı ve
karın ağrısı tek kişinin videosuna dayandığı için zayıftır; başta ve göğüste yapılan belirtiler birbiriyle
karışabilir.
