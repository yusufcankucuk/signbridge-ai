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

Karın ağrısı ve bulantı için internette yalnız bir kişinin videosu bulunduğundan, gerçek landmark
dizilerinden kontrollü sentetik örnekler üretilir (baş ağrısındaki “baş” konumu karna taşınır; tek
bulantı örneğinin el yolu başka kişilerin düz el biçimiyle birleştirilir):

```powershell
python -m src.data.synthesize_symptoms --data-root "$env:SIGNBRIDGE_DATA_ROOT" --per-pair 3
```

Sentetik satırlar `source=SYNTHETIC`, `signer_id=syn_<kaynak>` ile ayrı manifeste yazılır; eğitimde
her sınıfın en fazla yarısını oluşturur ve dışarıda bırakılan kaynaktan türetilenler eğitime girmez.
Gerçek katılımcı veya kamera başarısı olarak raporlanmaz.

## 3. Eğitim ve kişi bağımsız ölçüm

Önce bir kaynağı tamamen dışarıda bırakarak kişi bağımsız başarıyı ölçün, sonra bütün kaynaklarla
son modeli eğitin:

```powershell
# a) Ölçüm: ext_emrah-uresin hiç görülmeden test edilir
python -m src.train_unified --vocabulary signbridge34-v1 --hand-local-features `
  --data-root "$env:SIGNBRIDGE_DATA_ROOT" --base-model outputs/saved_model `
  --extra-manifest manifests/external_health_training.csv `
  --extra-manifest manifests/synthetic_health_training.csv `
  --holdout-source ext_emrah-uresin --seeds 42 --output-dir outputs/unified34-holdout-emrah

# b) Son model: bütün kaynaklar
python -m src.train_unified --vocabulary signbridge34-v1 --hand-local-features `
  --data-root "$env:SIGNBRIDGE_DATA_ROOT" --base-model outputs/saved_model `
  --extra-manifest manifests/external_health_training.csv `
  --extra-manifest manifests/synthetic_health_training.csv `
  --output-dir outputs/unified34
```

`--hand-local-features`, her elin el bileğine göre ve el boyuyla ölçeklenmiş biçimini (84 ek değer)
girdiye ekler; model girdisi 222 olur. İlk BiGRU'nun ek ağırlıkları sıfırla başlar (başlangıçta AUTSL-20
modeliyle aynı davranır) ve ince ayarda eğitilir. Servis, modelin girdi boyutuna bakarak 138 veya 222
özelliği kendisi seçer; eski modeller değişmeden çalışır. Eğitimde ayrıca %30 ayna (solak kullanıcı),
±8° döndürme, konum/ölçek ve ele özgü küçük kaymalar uygulanır.

Dışarıda bırakılan kaynakta yalnız o kaynağın kapsadığı belirtiler ölçülür. Bir belirtinin tek
kaynağı dışarıda bırakılırsa eğitim o sınıf için örnek bulamayacağı için durur; bu durumda başka bir
kaynağı seçin. `regression_report.md` içindeki “Dışarıda bırakılan kaynak” bölümü raporlanacak kişi
bağımsız sonuçtur; eğitim verisindeki %100'e yakın değerler başarı kanıtı değildir.

## 4. Çalıştırma

Bu model artık varsayılandır; hazır paketi kurmak için eğitim gerekmez
([model-release-unified34-v0.3.0.md](model-release-unified34-v0.3.0.md)):

```powershell
Copy-Item .env.docker.example .env      # .env.unified34.example ile aynıdır
docker compose --profile setup run --rm model-setup
docker compose up --build -d
Invoke-RestMethod http://localhost:3000/api/ai/status   # vocabularyVersion = signbridge34-v1
```

Kendi eğittiğiniz modeli kullanmak için `outputs/unified34` klasörünü eğitim çıktısıyla değiştirin ve
`ai-training/configs/model-assets.unified34.json` hash'lerini güncelleyin (ya da `check-model-assets`
yerine doğrudan `docker compose up` kullanın). `/camera-trials` ekranı sözlüğü servisten okur ve
15 belirti × 5 = 75 deneme planlar. Eski sürüme dönmek için `.env.autsl20.example` (+
`node scripts/install-model.mjs --model autsl20`) veya `.env.unified30.example` kullanın.

## 5. Sözlük videoları (Spreadthesign, Güncel TİD Sözlüğü) ve ekip içi model

`signbridge-unified34-bigru-v0.3.1`, v0.3.0 verisine Spreadthesign TİD sayfalarından (15 klip, en az 7
işaretleyici) ve Aile ve Sosyal Hizmetler Bakanlığı Güncel TİD Sözlüğü'nden (11 klip) elle indirilen
tek işaretlik videoları ekler. Kaynak adları `spreadthesign` ve `tidsozluk`tur; küçük videolar eğitimden
önce 640×480 / 720×480 boyutuna büyütülür. Aynı içerikli iki indirme (ör. kaşıntı = alerji) SHA-256 ile
ayıklanır.

Bu sitelerin içerikleri açık lisanslı değildir; kullanım izni ekibin sorumluluğundadır. Bu nedenle
v0.3.1 GitHub Release'e konmaz ve varsayılan kurulum v0.3.0 olarak kalır. Ekip içinde denemek için:

```powershell
# outputs/unified34-v0.3.1 klasörünü ekipten alın
Copy-Item .env.unified34-team.example .env
docker compose up --build -d
```

Hareketsiz görseller (resimler, çizimler) eğitimde kullanılmaz: model işaretin 60 karelik hareketini
öğrenir; tek kare el biçimi ile yer bilgisini verir ama hareketi taşımaz ve hareketsiz örnekler
modeli yanıltabilir.
