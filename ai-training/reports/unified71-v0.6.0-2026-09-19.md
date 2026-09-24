# `signbridge-unified71-bigru-v0.6.0` sürüm raporu (2026-09-19)

Amaç: doktorun dört sorusunun (süre, şiddet, yer, ilaç) kamerayla — işaret diliyle — yanıtlanabilmesi.
Sözlük 34 → **71 sınıfa** çıkar; ön işleme (`landmark46-v1`) ve özellik düzeni
(`xy-mask-138+handlocal-84`) değişmez.

> Öğrenci prototipidir. Tıbbi tanı koymaz; her kamera sonucu hasta onayı ister. Yeni 37 sınıfın her
> biri **tek işaretleyicinin tek videosundan** öğrenilmiştir; kişi bağımsız başarıları düşüktür.

## 1. Sözlük ve veri

| Küme | İşaret | Kaynak |
|---|---:|---|
| Mevcut 34 sınıf | 34 | AUTSL-20 + MEB + harici TİD videoları |
| Sayılar `sayi-1…10`, `sayi-20`, `sayi-30` | 12 | MEB Sayılar tematik sözlüğü |
| Şiddet `az`, `hafif`, `cok`, `agir` | 4 | MEB Sıfatlar |
| Yön `on`, `arka`, `yukari`, `asagi` | 4 | MEB Sıfatlar |
| Vücut bölgeleri `bas` … `ayak` | 17 | MEB Vücudumuz |
| **Toplam** | **71** | |

41 MEB videosu + Spreadthesign'ın 5 sayı klibi işlendi: 138 görünüm, kalite kapısında elenen yok.
`evet`, `hayir`, `iyi`, `kotu` zaten AUTSL-20 içindedir (43 işaretleyici), yeniden eğitilmedi.
Spreadthesign klipleri eğitimden çıkarılıp **kişi bağımsız test** olarak kullanıldı.

## 2. Soru bazlı bağlam

`labels.signbridge71.json` → `answerContexts`: süre 12 aday, şiddet 11, yer 21, ilaç 3.
Kamera yalnız sorunun adayları arasından seçer. Güven değeri de **bağlam içinde** normalleştirilir;
aksi hâlde 71 sınıfa dağılan softmax, 3 adaylı ilaç sorusunda doğru tahmini %3,7 gibi gösteriyordu
(aynı tahmin normalleştirmeyle %100).

## 3. Ölçümler

### 3.1 Sayılar — eğitimde görülmeyen kişi (Spreadthesign, 15 görünüm, 12 aday)

| | İlk öneri | İlk 3 öneri |
|---|---:|---:|
| softmax | 6/15 (%40) | **12/15 (%80)** |
| prototip (sınıf merkezi) | 3/15 (%20) | 9/15 |

Şans seviyesi %8,3. **Prototip skorlaması yanıt sınıflarında kullanılmaz:** merkez, bir sınıfın
birden çok işaretleyicisinin ortalaması olduğunda kazandırır; yanıt sınıflarında kelime başına tek
video vardır, ortalanacak bir şey yoktur. Belirti bağlamında açık kalır (orada 305 → 341 / 498).

### 3.2 Belirti tanımada gerileme (B grubu, 282 örnek, görülmemiş kişiler)

| Model | İlk öneri | İlk 3 |
|---|---:|---:|
| 34 sınıf (v0.5.0 yöntemi) | 211/282 (%74,8) | 256/282 |
| 71 sınıf (v0.6.0) | 195/282 (%69,1) | 253/282 |
| 71 sınıf, belirti/yanıt yarı yarıya örnekleme | 190/282 (%67,4) | 253/282 |

**5,7 puanlık bedel gerçektir ve giderilemedi.** İlk varsayım, sınıf dengeli örneklemede sınıf
sayısının 15'ten 52'ye çıkmasıyla belirti sınıflarının epoch başına gördüğü örneğin yarıya
düşmesiydi. Belirti ve yanıt kümelerini kendi içlerinde eşit, birbirlerine karşı yarı yarıya
örnekleyen sürüm eğitildi ve **daha da kötü** çıktı (190/282); değişiklik geri alındı.
Kayıp örneklemeden değil, aynı kodlayıcının 37 sınıf daha taşımasından geliyor.

İlk 3 öneride kayıp ihmal edilebilir (256 → 253). Onay ekranı üç aday gösterdiği için akıştaki
etkisi ilk öneri farkından küçüktür.

### 3.3 Genel gerileme kapısı

| | v0.5.0 | v0.6.0 |
|---|---:|---:|
| AUTSL-20 testi (görülmemiş 6 kişi) | %92,14 | **%92,77** |
| MEB tarayıcı probu | %90,5 | **%91,6** |

### 3.4 Uçtan uca canlı deneme (sahte kamera, temiz kurulum)

Dört sorunun her biri iki klip: **8/8 doğru**, sayfa hatası yok.
Kliplerin hepsi MEB eğitim videolarıdır; bağımsız ölçüm değildir, akışın çalıştığını gösterir.

| Soru | İşaret | Sonuç | Güven |
|---|---|---|---:|
| Yer | karın | Karın | %99,9 |
| Yer | baş | Baş | %100 |
| Süre | üç | Üç + "gün" → "3 gün" | %86,7 |
| Süre | beş | Beş | yüksek |
| Şiddet | çok | Çok | %97,4 |
| Şiddet | az | Az | %100 |
| İlaç | evet | Evet | %100 |
| İlaç | hayır | Hayır | %99,6 |

## 4. Uygulamada düzeltilen üç hata

1. **Her tahmin reddediliyordu.** Web uygulaması servisin yanıt sözleşmesindeki alanları katı
   doğruluyor; v0.5.0 ile gelen `scoringMode` alanı listede olmadığı için tüm tahminler
   `service_error`'a düşüyordu. Alan sözleşmeye eklendi (`lib/prediction.ts`).
2. **Güven dar bağlamlarda anlamsızdı** (bkz. 2. bölüm).
3. **Düşük güvenli yanıtlar aday gösterilmiyordu.** Zorunlu aday kuralı yalnız belirti bağlamında
   çalışıyordu; yanıt bağlamlarında da çalışır (onay ekranı zaten bu iş için var).

## 5. Hangi model varsayılan olmalı

Tek modelle iki işin ikisinde birden en iyi olunamıyor:

| | Belirti (ilk öneri) | Soru yanıtı |
|---|---:|---|
| `unified34` v0.5.0 | **%74,8** | yok (yalnız evet/hayır, genel sözlükten) |
| `unified71` v0.6.0 | %69,1 | **dört sorunun dördü** |

Karar projenin önceliğine bağlıdır ve kuruluma tek satırla yazılır:
`.env.unified34.example` (belirti öncelikli) veya `.env.unified71.example` (tam akış).
İkisi de aynı servisle çalışır; `SIGNBRIDGE_MODEL` ve `MODEL_DIR` değişir.

## 6. Eksikler

- **Zaman birimleri (gün/hafta/ay/yıl), sağ/sol, orta, kalça, bilmiyorum, bazen, şiddetli,
  dayanılmaz** MEB tematik sözlüklerinde yok. Süre yanıtı bu yüzden iki parçalıdır: sayı işaretle,
  birim ekrandan.
- **Yeni 37 sınıfın avatarı yok**; onay ekranı bu sınıflarda metin gösterir.
- **Kelime başına tek işaretleyici.** Ölçülen tek bağımsız sayı (%40 ilk öneri) bunun sonucudur.
  BosphorusSign22k (6 işaretleyici, 744 işaret) erişimi bu tabloyu topluca değiştirir.

## 7. Yeniden üretme

```bash
node scripts/extract-browser-landmarks.mjs "<veri kökü>/yanit_ham" yanit_raw.json
python -m src.data.import_answer_videos --data-root "<veri kökü>" --browser-landmarks yanit_raw.json
python -m src.train_unified --vocabulary signbridge71-v1 --data-root "<veri kökü>" \
  --base-model <autsl20 saved_model> --encoder-init <autsl226 saved_model> --hand-local-features \
  --extra-manifest manifests/external_health_training.csv \
  --extra-manifest manifests/synthetic_health_training.csv \
  --extra-manifest manifests/answer_vocabulary_training.csv \
  --test-time-mirror --output-dir outputs/unified71
```
