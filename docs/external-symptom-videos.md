# Harici TİD videolarıyla 15 belirti avatarının tamamını eğitme

Bu adımlar, harici TİD sözlük videolarını (ör. Aile ve Sosyal Hizmetler Bakanlığı Güncel TİD Sözlüğü,
turkisaretdili.net, isaretdiliogren.com) birleşik modele ekler ve sözlüğü `signbridge34-v1`'e
(15 belirti avatarı) genişletir. `signbridge34-v1`, `signbridge30-v1`'in ilk 30 sınıfını aynen korur;
yeni sınıflar `headache` (30), `stomachache` (31), `nausea` (32) ve `shortness-of-breath` (33)'tür.

> Videoların kullanım izinleri kullanıcı sorumluluğundadır ve belgeleri saklanmalıdır; manifestte
> `consent_id=user_reported_permission` yazılır. Videolar, NPZ'ler ve model ağırlıkları Git'e eklenmez.

## 1. Videoları yerleştirme

```text
<veri kökü>/harici/
  headache/tidsozluk_1.mp4
  headache/isaretdiliogren_1.mp4
  stomachache/turkisaretdili_1.mp4
  diabetes/tidsozluk_1.mp4        → mevcut `seker` sınıfına eklenir
  ...
```

- Klasör adı avatar kimliğidir (`src/data/expressions.ts` içindeki `id`).
- Dosya adı `<kaynak>_<sıra>`; kaynak adı aynı kişi/site için hep aynı olmalıdır. `signer_id`
  olarak `ext_<kaynak>` kullanılır.
- Her video yalnız o belirtinin işaretini içermelidir. Bileşik ifadeler (ör. baş + ağrı) sözlükte tek
  kayıt olarak gösteriliyorsa tek video olarak eklenebilir.
- Model 15 belirtiyi ancak her belirti için en az bir eğitim videosu varsa eğitir.

## 2. Landmark çıkarımı ve manifest

```powershell
# Canlı kameradaki çıkarıcıyla (bir kez; Chrome/Chromium + ffmpeg veya Python/OpenCV)
node scripts/extract-browser-landmarks.mjs "$env:SIGNBRIDGE_DATA_ROOT/harici" "$env:SIGNBRIDGE_DATA_ROOT/processed/external_browser_raw.json"

cd ai-training
python -m src.data.import_external_videos --data-root "$env:SIGNBRIDGE_DATA_ROOT" `
  --browser-landmarks "$env:SIGNBRIDGE_DATA_ROOT/processed/external_browser_raw.json"
```

Çıktılar: `manifests/external_health_training.csv`, `manifests/external_health_training_summary.json`
(`sourcesPerAvatar` ve `avatarsWithoutVideo` alanlarını kontrol edin) ve
`<veri kökü>/processed/external_health/landmark46-v1/`.

`extract-browser-landmarks.mjs`, her videonun sonucunu `<çıktı>.json.cache/` klasörüne yazar; yarıda
kalan çalıştırma yeniden başlatıldığında işlenmiş videolar atlanır.

### Az kaynaklı belirtiler için bileşimsel örnekler

Bazı belirtiler için internette çok az kişinin videosu vardır. Gerçek landmark dizilerinden kontrollü
sentetik örnekler üretilir:

- **location:** Baş ağrısındaki “baş” konumu karna taşınır (karın ağrısı).
- **handshape:** Tek karın ağrısı/bulantı örneğinin el yolu, başka kişilerin düz el biçimiyle birleştirilir.
- **relocate:** TİD'de “ağrı” işareti acıyan yerde yapılır. Ağrı işaretini yapan tüm kişilerin hareketi
  başa (baş ağrısı) ve karna (karın ağrısı) taşınır. Bu, baş ağrısında yeni kişilerdeki doğruluğu en çok
  artıran adımdır.

```powershell
python -m src.data.synthesize_symptoms --data-root "$env:SIGNBRIDGE_DATA_ROOT" --per-pair 3
```

Sentetik satırlar `source=SYNTHETIC`, `signer_id=syn_<kaynak>` ile ayrı manifeste yazılır. Eğitimde
her sınıf içinde gerçek ve sentetik örnekler eşit payla örneklenir; dışarıda bırakılan kaynaktan
türetilenler eğitime girmez. Gerçek katılımcı veya kamera başarısı olarak raporlanmaz.

## 3. Kodlayıcı ön eğitimi (AUTSL-226)

Yeni kişilere genelleme büyük ölçüde kodlayıcının kişiden bağımsız hareket ve el biçimi öğrenmesine
bağlıdır. AUTSL'nin OpenHands poz paketinde (`AUTSL.zip`, `train/val/test_poses/*.pkl`) 226 işaretin
tamamı ve 43 işaretleyici vardır. Aynı BiGRU mimarisi bu verinin tamamıyla önceden eğitilir:

```powershell
# 1) Poz dosyalarını landmark46-v1 parçalarına dönüştür (bir kez, ~3 dk)
python -m src.data.pack_autsl226 --zip "<yol>/AUTSL.zip" --data-root "$env:SIGNBRIDGE_DATA_ROOT"
# 2) Ön eğitim (CPU'da ~40 dk; AUTSL-226 doğrulama %84,4, test %81,0)
python -m src.pretrain_autsl226 --data-root "$env:SIGNBRIDGE_DATA_ROOT" --output-dir outputs/autsl226
```

AUTSL test kişileri ön eğitimde kullanılmaz. Bu yüzden birleşik modelin AUTSL-20 test kapısı geçerli
kalır. Kodlayıcı tek başına uygulamada kullanılmaz.

## 4. Eğitim ve kişi bağımsız ölçüm

Önce bir kaynağı tamamen dışarıda bırakarak kişi bağımsız başarıyı ölçün, sonra son modeli eğitin:

```powershell
$common = @("--vocabulary", "signbridge34-v1", "--hand-local-features", "--test-time-mirror",
  "--data-root", "$env:SIGNBRIDGE_DATA_ROOT", "--base-model", "outputs/saved_model",
  "--encoder-init", "outputs/autsl226/saved_model",
  "--extra-manifest", "manifests/external_health_training.csv",
  "--extra-manifest", "manifests/synthetic_health_training.csv")

# a) Ölçüm: Serpil Avcı, Filiz Çağlar ve sözlük 2. kişi hiç görülmeden test edilir
python -m src.train_unified @common --seeds 42 --output-dir outputs/unified34-holdout-b `
  --holdout-source ext_serpil-avci --holdout-source ext_filiz-caglar --holdout-source ext_sozluk-b

# b) Yayın modeli (v0.4.0): sözlük siteleri eğitime girmez, yalnız ölçülür
python -m src.train_unified @common --model-version signbridge-unified34-bigru-v0.4.0 `
  --holdout-source ext_spreadthesign --holdout-source ext_tidsozluk --output-dir outputs/unified34
```

- **`--hand-local-features`:** Her elin el bileğine göre ve el boyuyla ölçeklenmiş biçimini
  (84 ek değer) girdiye ekler; model girdisi 222 olur.
- **`--encoder-init`:** Kodlayıcıyı AUTSL-226 ön eğitiminden alır. İlk 20 sınıfın çıktı satırları da
  226 sınıflı başlıktan kopyalanır. `--base-model` (AUTSL-20) yalnız damıtma ve gerileme kapısı için kullanılır.
- **`--test-time-mirror`:** `runtime_config.json` içine `testTimeMirror: true` yazar. Servis her tahminde
  ayna görüntüyü de çalıştırır ve olasılıkların ortalamasını alır (solak kullanıcılar ve el farkı için).
- **Veri çoğaltma:** Eğitimde ayrıca %30 ayna (solak kullanıcı), ±8° döndürme, konum/ölçek ve ele özgü
  küçük kaymalar uygulanır.

Servis, modelin girdi boyutuna bakarak 138 veya 222 özelliği kendisi seçer; eski modeller değişmeden
çalışır.

Dışarıda bırakılan kaynakta yalnız o kaynağın kapsadığı belirtiler ölçülür. Bir belirtinin tek
kaynağı dışarıda bırakılırsa eğitim o sınıf için örnek bulamayacağı için durur. `regression_report.md`
içindeki “Dışarıda bırakılan kaynak” bölümü raporlanacak kişi bağımsız sonuçtur; eğitim verisindeki
%100'e yakın değerler başarı kanıtı değildir.

### Gerçek kayda yakın ölçüm

Kesilmiş klipler yalnız işareti içerir. Uygulamada ise kayıt, el kadraja gelmeden başlar ve işaret
bittikten sonra biter. Bu yüzden kişi bağımsız ölçüm ayrıca iki yolla yapılır:

- **Bağlamlı klipler:** Aynı ders videolarından önce/sonra 1,5 sn doğal hareketle kesilir
  (`<veri kökü>/harici_ham/baglamli/`), canlı çıkarıcıyla (10 kare/sn) işlenir ve canlı yoldan
  (kırpma → kalite kapısı → servis) geçirilir:

  ```powershell
  python -m src.evaluate_context_clips --model-dir outputs/unified34-holdout-b `
    --raw-json "$env:SIGNBRIDGE_DATA_ROOT/processed/baglamli_browser_raw.json" `
    --plan "$env:SIGNBRIDGE_DATA_ROOT/harici_ham/baglamli/plan.csv" `
    --signer serpil-avci --signer filiz-caglar --signer sozluk-b
  ```
- **Benzetim:** `src/data/simulate_recordings.py`, bekleme ve el kaldırma/indirme kareleri ekler.
  Benzetimle eğitim denendi ama bağlamlı kliplerde iyileşme vermediği için yayın modelinde kullanılmadı.

Sonuçlar: [unified34-v0.4.0 raporu](../ai-training/reports/unified34-v0.4.0-2026-09-16.md).

## 5. Canlı kayıt: kırpma ve olası diğer avatarlar

- **Kırpma:** İstemci (`prepareRecordedFrames`) kaydı eğitim verisiyle aynı biçime getirir: kısa el
  kayıplarını doldurur, ellerin görünmediği baş/son kareleri ~0,1 sn pay bırakarak atar. Eskiden hasta
  elini geç kaldırınca kayıt “eller yeterince görünmedi” diye reddediliyor ya da işaret 60 kareye
  sıkışıp yanlış tanınıyordu. Python karşılığı `trim_recording`'dir; iki taraf aynı testle doğrulanır.
- **Olası diğer avatarlar:** Onay ekranı, modelin ilk önerisinin altında sıradaki iki belirti avatarını
  “Başka bir şey mi anlattınız?” başlığıyla gösterir. Hasta birini seçerse o avatar ekrana gelir ve hasta
  yine “Doğru, doktora ilet” ile onaylar (elle seçim olarak kaydedilir).

## 6. Çalıştırma

Bu model varsayılandır; hazır paketi kurmak için eğitim gerekmez
([model-release-unified34-v0.4.0.md](model-release-unified34-v0.4.0.md)):

```powershell
Copy-Item .env.docker.example .env      # .env.unified34.example ile aynıdır
docker compose --profile setup run --rm model-setup
docker compose up --build -d
Invoke-RestMethod http://localhost:3000/api/ai/status   # modelVersion = signbridge-unified34-bigru-v0.4.0
```

Kendi eğittiğiniz modeli kullanmak için `outputs/unified34` klasörünü eğitim çıktısıyla değiştirin ve
`ai-training/configs/model-assets.unified34.json` hash'lerini güncelleyin (ya da `check-model-assets`
yerine doğrudan `docker compose up` kullanın). `/camera-trials` ekranı sözlüğü servisten okur ve
15 belirti × 5 = 75 deneme planlar. Eski sürüme dönmek için `.env.autsl20.example` (+
`node scripts/install-model.mjs --model autsl20`) veya `.env.unified30.example` kullanın.

## 7. Sözlük videoları (Spreadthesign, Güncel TİD Sözlüğü) ve ekip içi model

Ekip içi `signbridge-unified34-bigru-v0.4.1`, v0.4.0 ile aynı yöntemle eğitilir. Tek farkı,
Spreadthesign TİD sayfalarından (15 klip, en az 7 işaretleyici) ve Aile ve Sosyal Hizmetler Bakanlığı
Güncel TİD Sözlüğü'nden (11 klip) elle indirilen tek işaretlik videoların da eğitime girmesidir.

- **Kaynak adları:** `spreadthesign` ve `tidsozluk`.
- **Hazırlık:** Küçük videolar eğitimden önce 640×480 / 720×480 boyutuna büyütülür. Aynı içerikli iki
  indirme (ör. kaşıntı = alerji) SHA-256 ile ayıklanır.

Bu sitelerin içerikleri açık lisanslı değildir; kullanım izni ekibin sorumluluğundadır. Bu nedenle
v0.4.1 GitHub Release'e konmaz. Ekip içinde denemek için:

```powershell
# outputs/unified34-v0.4.1 klasörünü ekipten alın
Copy-Item .env.unified34-team.example .env
docker compose up --build -d
```

Hareketsiz görseller (resimler, çizimler) eğitimde kullanılmaz: model işaretin 60 karelik hareketini
öğrenir; tek kare el biçimi ile yer bilgisini verir ama hareketi taşımaz ve hareketsiz örnekler
modeli yanıltabilir.
