# `signbridge-unified34-bigru-v0.5.0` sürüm raporu (2026-09-19)

Amaç: kamerada ilk kez işaret yapan birinin, yaptığı belirtinin avatarını görebilmesi.
Sözlük (`signbridge34-v1`), ön işleme (`landmark46-v1`) ve özellik düzeni
(`xy-mask-138+handlocal-84`) v0.4.0 ile aynıdır. **Model ağırlıkları da v0.4.0 ile birebir aynıdır;**
değişen tek şey belirti bağlamındaki karar katmanıdır.

> Öğrenci prototipidir. Tıbbi tanı koymaz; her kamera sonucu hasta onayı ister. Kişi bağımsız sayılar
> az sayıda videodan gelir; tek bir videonun sonucu yüzdeyi birkaç puan oynatabilir.

## 1. Sorun: son katman az kişiyi ezberliyor

v0.4.0'ın eğitim doğruluğu %99,8, AUTSL doğrulaması %93. Belirti sınıfları kişi başına 1–3 videoya
dayanır (sözlük kaynakları yayın modelinde dışarıda tutulduğu için yanık, çarpıntı, karın ağrısı ve
bulantı **tek kişiye** dayanır). Son katman (softmax) bu birkaç kişinin biçimini ezberliyor.

Ölçüm, modelin ara temsilinin (`encoder_bigru_64`, 128 boyut) kişiden çok daha bağımsız olduğunu
gösterdi. v0.5.0 bu temsili kullanır.

## 2. Değişiklik: sınıf merkezi (prototip) skorlaması

Eğitim sonunda her belirtinin **gerçek** (sentetik olmayan) eğitim örneklerinin `encoder_bigru_64`
temsilleri birim uzunluğa getirilip ortalanır; sonuç sınıfın "merkezi"dir. Tahminde kayıt (ve ayna
kopyası) aynı katmandan geçirilir, hangi merkeze kosinüs olarak daha yakınsa o belirti seçilir.
Genel 20 AUTSL kelimesinde softmax olduğu gibi kalır.

- Merkezler `prototypes.json` olarak model paketinde gelir (15 sınıf × 128 sayı, 256 gerçek örnek).
  Ham veri geri üretilemez.
- `train_unified` bu dosyayı kendiliğinden yazar; daha önce eğitilmiş paketler için
  `python -m src.build_release_prototypes` vardır.
- Servis dosyayı açılışta yükler (`runtime_config.prototypeScoring: "symptom"`), tahmin yanıtına
  `scoringMode: "class-centroid-v1"` eklenir.

## 3. Sonuçlar

**Bağlamlı klipler** (eğitimde görülmeyen kişiler, işaretin 1,5 sn öncesi/sonrasıyla, 9 kesit,
498 örnek; A = Emrah Üresin, B = Serpil Avcı + Filiz Çağlar + sözlük 2. kişi):

| | softmax (v0.4.0) | prototip (v0.5.0) |
|---|---:|---:|
| A grubu ilk öneri | 118/216 | **130/216** |
| B grubu ilk öneri | 187/282 | **211/282** |
| **Toplam ilk öneri** | 305/498 — %61,2 | **341/498 — %68,5** |
| Toplam ilk 3 öneri | 402/498 — %80,7 | **416/498 — %83,5** |

**Üçüncü grup** (Ezgi Tutkun + Ahmet Tombul dışarıda bırakılarak eğitilen ayrı model, 60 örnek):

| | softmax | prototip |
|---|---:|---:|
| İlk öneri | 40/60 (%66,7) | **46/60 (%76,7)** |
| İlk 3 öneri | 56/60 (%93,3) | 52/60 (%86,7) |

İlk öneri üç grubun **üçünde de** iyileşti (+12, +24, +6). İlk 3 öneri A'da aynı, B'de +14, C'de −4.

**Yayın paketinin kendisi** (sözlük kişileri; v0.5.0 bunları hiç görmedi, 104 örnek):

| | softmax | prototip |
|---|---:|---:|
| İlk öneri | 52/104 (%50,0) | **58/104 (%55,8)** |
| İlk 3 öneri | 81/104 | 80/104 |

## 4. Güven artık anlamlı

Prototip güveni (kosinüslerin T=15 ile olasılığa çevrilmiş hâli) doğru ve yanlış tahminleri
softmax'tan belirgin daha iyi ayırıyor. 498 örnek üzerinde:

| Eşik | prototip: kabul / doğruluk | softmax: kabul / doğruluk |
|---|---|---|
| 0,50 | %84 / %73,9 | %77 / %74,5 |
| 0,70 | %56 / %89,2 | %55 / %79,7 |
| **0,80** | **%40 / %94,5** | %44 / %85,3 |
| 0,90 | %25 / **%100** | %31 / %86,1 |
| 0,95 | %14 / %100 | %24 / %84,9 |

Bu yüzden paket eşiği **0,95 → 0,80** olarak değiştirildi (karar politikası
`signbridge34-team-camera-v2`). Eşiğin altındaki kayıtlar eskisi gibi aday olarak gösterilir
(`experimental: true`), onay ekranındaki üç avatar seçeneği korunur.

## 5. Denenip kullanılmayanlar

Hepsi aynı 498 örnekle ölçüldü:

| Fikir | Sonuç (B grubu ilk öneri) |
|---|---|
| Test zamanı zaman ölçeği çeşitlemesi (0,85 / 1,0 / 1,18 ve 5 kademe) | 187 → 137. Canlı yol zaten 60 kareye normalize ediyor; bozuyor. |
| Omuz merkezli kol uzunluğu artırması (%±14) | 187 → 173. Baş/karın ayrımını taşıyan omuz-el mesafesini bozuyor. |
| Ağırlık ortalaması (son 10 epoch, SWA) | 187 → 169 (prototiple 211 → 203). |
| Etiket yumuşatma 0,1 | prototiple 211 → 192. |
| Mixup (Beta 0,2) | prototiple 211 → 162. |
| Dropout 0,30 → 0,45 | prototiple 211 → 203. |
| Kişi bazlı prototipler (sınıf-kişi çifti, en yakın) | 211 → 181. |
| Sentetik örneklerin merkeze katılması | 211 → 199. |
| `embedding_64` katmanından merkez | 211 → 209 (ilk 3: 256 → 248). |
| softmax + prototip karışımı (T ∈ {8,15,25}, w ∈ {0,3…0,85}) | Hiçbiri saf prototipi geçmedi. |
| Sıra birleştirme (reciprocal rank fusion) | 341 → 328 toplam; ilk 3 de düştü. |

Denenen **hiçbir eğitim ayarı** v0.4.0 tarifini geçemedi; kazancın tamamı karar katmanından geliyor.

Kodlayıcı ön eğitiminin payı ayrıca ölçüldü: AUTSL-226 ön eğitimi kapatıldığında beş sınıflık bir
sayı denemesinde doğruluk %58 → %24'e (şans seviyesi) düşüyor. **Kişi çeşitliliği tek gerçek
kaldıraçtır**; bu yüzden BosphorusSign22k (6 işaretleyici, 428 sağlık işareti) erişimi en yüksek
değerli sıradaki adımdır.

## 6. Zayıf noktalar

1. **Karın ağrısı ve döküntü** üçüncü grupta prototiple de düzelmedi (0/4 ve 1/4).
2. **Tek kişiye dayanan sınıflar** (yanık, çarpıntı, karın ağrısı, bulantı) hâlâ en kırılgan yer.
3. **İlk 3 öneri** C grubunda bir miktar geriledi; merkez skorlaması ilk sırayı düzeltirken sıradaki
   adayları biraz daha keskin sıralıyor.
4. Ölçümler ders videolarındaki eğitmenlerle yapıldı; gerçek hasta kameralarıyla `/camera-trials`
   denemesi ve TİD uzmanı kontrolü hâlâ gerekli.

## 7. Yeniden üretme

```bash
# Prototipli eğitim (yayın modeli)
python -m src.train_unified --vocabulary signbridge34-v1 --data-root "<veri kökü>" \
  --base-model <autsl20 saved_model> --encoder-init <autsl226 saved_model> --hand-local-features \
  --extra-manifest manifests/external_health_training.csv \
  --extra-manifest manifests/synthetic_health_training.csv \
  --test-time-mirror --holdout-source ext_spreadthesign --holdout-source ext_tidsozluk \
  --model-version signbridge-unified34-bigru-v0.5.0 --output-dir outputs/unified34

# Var olan bir pakete merkezleri eklemek
python -m src.build_release_prototypes --model-dir outputs/unified34 --data-root "<veri kökü>" \
  --extra-manifest manifests/external_health_training.csv \
  --extra-manifest manifests/synthetic_health_training.csv \
  --holdout-source ext_spreadthesign --holdout-source ext_tidsozluk
```
