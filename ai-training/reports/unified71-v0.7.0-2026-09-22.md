# `signbridge-unified71-bigru-v0.7.0` sürüm raporu (2026-09-22)

Amaç: doktorun dört sorusunun (süre, şiddet, yer, ilaç) kamerayla — işaret diliyle — yanıtlanabilmesi,
**belirti tanımadan hiçbir şey kaybetmeden**. Sözlük 34 → **71 sınıfa** çıkar; ön işleme
(`landmark46-v1`) ve özellik düzeni (`xy-mask-138+handlocal-84`) değişmez.

v0.6.0 sözlüğü büyütüyor ama belirti doğruluğundan 5,7 puan götürüyordu. v0.7.0 bu bedeli
**donmuş kodlayıcı** ile sıfırlar: kodlayıcı v0.5.0'ın eğitilmiş ağırlıklarıdır ve eğitim boyunca
hiç değişmez; yalnız çıkış katmanı 37 yeni sınıfı öğrenir. Prototip skorlaması bu kodlayıcının
temsilini kullandığı için belirti kararları **birebir v0.5.0 ile aynıdır**.

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
| softmax (donmuş kodlayıcı, v0.7.0) | 6/15 (%40) | **12/15 (%80)** |
| softmax (tam ince ayar, v0.6.0) | 6/15 (%40) | 12/15 (%80) |
| prototip (sınıf merkezi) | 3/15 (%20) | 9/15 |

Şans seviyesi %8,3. **Prototip skorlaması yanıt sınıflarında kullanılmaz:** merkez, bir sınıfın
birden çok işaretleyicisinin ortalaması olduğunda kazandırır; yanıt sınıflarında kelime başına tek
video vardır, ortalanacak bir şey yoktur. Belirti bağlamında açık kalır (orada 305 → 341 / 498).

### 3.2 Belirti tanıma: gerileme yok

B grubu (Serpil Avcı + Filiz Çağlar + sözlük 2. kişi), 282 örnek, bağlamlı klipler:

| Model | İlk öneri | İlk 3 |
|---|---:|---:|
| 34 sınıf (v0.5.0) | 211/282 (%74,8) | 256/282 |
| **71 sınıf, donmuş kodlayıcı (v0.7.0)** | **211/282 (%74,8)** | **256/282** |
| 71 sınıf, tam ince ayar (v0.6.0) | 195/282 (%69,1) | 253/282 |
| 71 sınıf, belirti/yanıt yarı yarıya örnekleme | 190/282 (%67,4) | 253/282 |
| 71 sınıf, eğitilmiş 34 sınıflık modelden başlatıp ince ayar | 186/282 (%66,0) | 252/282 |

Denenen üç "ince ayarı düzelt" yaklaşımı da işe yaramadı; kaybın kaynağı örnekleme ya da başlangıç
noktası değil, kodlayıcının 37 sınıf daha taşımak için değişmesiydi. Kodlayıcıyı tamamen dondurmak
sorunu tanım gereği ortadan kaldırır ve **yanıt tarafından hiçbir şey götürmez** (3.1'e bakın:
donmuş ve donmamış modelde sayı sonuçları birebir aynı).

### 3.3 Genel gerileme kapısı

| | v0.5.0 | v0.6.0 |
|---|---:|---:|
| AUTSL-20 testi (görülmemiş 6 kişi) | %92,14 | **%93,40** |
| MEB tarayıcı probu | %90,5 | %90,5 |
| Yanıt sözlüğü, kendi soru bağlamında (eğitim klipleri) | — | süre 36/36, şiddet 33/33, yer 60/63, ilaç 6/6 |

### 3.4 Uçtan uca canlı deneme (sahte kamera, temiz kurulum)

Dört sorunun her biri iki klip. **6/8 doğru, 2'si kalite kapısında reddedildi**, sayfa hatası yok.
Kliplerin hepsi MEB eğitim videolarıdır; bağımsız ölçüm değildir, akışın çalıştığını gösterir.

Reddedilen ikisi (`cok`, `az`) modelin hatası değil, **sahte kamera artefaktıdır**: Chromium sahte
kamerayı döngüye alır, kayıt penceresine işaretin arasına boş tekrarlar girer ve elin göründüğü kare
oranı %50 eşiğinin altına düşer. Aynı kliplerin eğitim hattındaki (tek geçişlik) el görünürlük oranı
0,54–0,89'dur, yani gerçek bir kullanıcının tek seferlik kaydı bu kapıyı geçer.

| Soru | İşaret | Sonuç | Güven |
|---|---|---|---:|
| Yer | karın | Karın | %99,8 |
| Yer | baş | Baş | %99,9 |
| Süre | üç | Üç + "gün" → doktora "3 gün" | yüksek |
| Süre | beş | Beş + "gün" → doktora "5 gün" | yüksek |
| Şiddet | çok | kalite kapısı (sahte kamera) | — |
| Şiddet | az | kalite kapısı (sahte kamera) | — |
| İlaç | evet | Evet | %99,9 |
| İlaç | hayır | Hayır | %99,6 |

## 4. Uygulamada düzeltilen üç hata

1. **Her tahmin reddediliyordu.** Web uygulaması servisin yanıt sözleşmesindeki alanları katı
   doğruluyor; v0.5.0 ile gelen `scoringMode` alanı listede olmadığı için tüm tahminler
   `service_error`'a düşüyordu. Alan sözleşmeye eklendi (`lib/prediction.ts`).
2. **Güven dar bağlamlarda anlamsızdı** (bkz. 2. bölüm).
3. **Düşük güvenli yanıtlar aday gösterilmiyordu.** Zorunlu aday kuralı yalnız belirti bağlamında
   çalışıyordu; yanıt bağlamlarında da çalışır (onay ekranı zaten bu iş için var).

## 5. Hangi model varsayılan olmalı

v0.6.0'daki ödünleşim ortadan kalktı; artık tek doğru seçenek var:

| | Belirti (ilk öneri) | Soru yanıtı |
|---|---:|---|
| `unified34` v0.5.0 | %74,8 | yok (yalnız evet/hayır, genel sözlükten) |
| **`unified71` v0.7.0** | **%74,8** | **dört sorunun dördü** |

Kurulum: `.env.unified71.example`.

## 6. Denenen tüm yöntemler ve ölçüm sonuçları

Aynı ölçütte (bağlamlı klipler, eğitimde görülmeyen kişiler, 498 örnek) denenen her yöntem.
Referans: sınıf merkezi skorlaması, 341/498 ilk öneri, 416/498 ilk üç.

### 6.1 Prototip hesabının varyantları (yeniden eğitim gerektirmez)

| Yöntem | İlk öneri | İlk 3 | Karar |
|---|---:|---:|---|
| Ortalama merkez (kullanılan) | 341 (%68,5) | **416** | — |
| Medyan merkez | **345** (%69,3) | 413 | Gürültü sınırında; alınmadı |
| Kişi-ortalamalı merkez | 334 | 414 | Kötü |
| Merkezleme + L2 (CL2N) | 333 | 410 | Kötü |
| k-en yakın komşu (k=1) | 297 | 392 | Kötü |
| k-en yakın komşu (k=3) | 301 | 391 | Kötü |
| k-en yakın komşu (k=5) | 321 | 391 | Kötü |
| Sınıf bazlı skor kalibrasyonu | 332 | 410 | Kötü (ama A grubunu 130 → 142 çıkarıyor) |
| Sınıf bazlı kalibrasyon, kendi örnekleri hariç | 302 | 406 | Kötü |

Kalibrasyon bulgusu kayda değer: **A grubunda** (kendine özgü işaret biçimleri olan Emrah Üresin)
130 → 142, **B grubunda** 211 → 190. Kişiye uyarlanan skorlama bir yerde kazandırıyor, ama tek bir
genel ayar olarak zarar veriyor.

### 6.2 Kayıt içi çoklu pencere

Aynı kaydın farklı zaman kesitlerinden gömme çıkarıp ortalamak:

| Pencere | İlk öneri | İlk 3 | Kalite kapısı reddi |
|---|---:|---:|---:|
| Tek (kullanılan skorlama) | 341 | 416 | 3 |
| 3 pencere | 346 | 415 | 0 |
| 5 pencere | 344 | **421** | 0 |

Doğruluk kazancı gürültü sınırında; **asıl kazanç kalite kapısı reddinin 3 → 0 olması**. Bu yüzden
gömme ortalaması alınmadı (servis sözleşmesini değiştirmeyi gerektirirdi), ama **kesit denemesi**
istemciye eklendi: kayıt bütünüyle kapıyı geçemezse baş/son kısmı biraz kırpılmış kesitleri denenir
(`bestRecordingWindow`). Ölçüm: A grubunda 3 red → 0, B grubunda değişiklik yok.

### 6.3 Daha önce elenen yöntemler (v0.5.0 / v0.6.0 raporları)

| Yöntem | Sonuç |
|---|---|
| Test zamanı zaman ölçeği çeşitlemesi | B 187 → 137 |
| Omuz merkezli kol uzunluğu artırması | B 187 → 173 |
| Ağırlık ortalaması (SWA) | B 211 → 203 |
| Etiket yumuşatma 0,1 | B 211 → 192 |
| Mixup (Beta 0,2) | B 211 → 162 |
| Dropout 0,30 → 0,45 | B 211 → 203 |
| Sentetik örneklerin merkeze katılması | B 211 → 199 |
| `embedding_64` katmanından merkez | B 211 → 209 |
| softmax + prototip karışımı | Saf prototipi geçmedi |
| Sıra birleştirme (RRF) | 341 → 328 |
| Belirti/yanıt yarı yarıya örnekleme | B 195 → 190 |
| Eğitilmiş modelden başlatıp tam ince ayar | B 195 → 186 |

### 6.4 Sonuç

Bu temsil ve bu veriyle **karar katmanı optimize edilmiş durumda**. Denenen 20'den fazla yöntemden
yalnız ikisi kazandırdı: sınıf merkezi skorlaması (v0.5.0, +7,2 puan) ve donmuş kodlayıcı (v0.7.0,
sözlük büyümesinin bedelini sıfırladı). Geri kalanı ±1 puan içinde oynuyor; 498 örnek ve 29 kaynak
klip ile bu fark ölçülebilir değil.

**Buradan sonraki tek gerçek kaldıraç veridir.** Kodlayıcı ön eğitimi kapatıldığında doğruluk şans
seviyesine düşüyor (%58 → %24); yani modelin bildiği her şey kişi çeşitliliğinden geliyor. Belirti
sınıflarında kişi başına 1–3 video var. BosphorusSign22k (6 işaretleyici, 428 sağlık işareti) erişimi
bu tabloyu topluca değiştirir; yöntem araması değiştirmez.

## 7. Eksikler

- **Zaman birimleri (gün/hafta/ay/yıl), sağ/sol, orta, kalça, bilmiyorum, bazen, şiddetli,
  dayanılmaz** MEB tematik sözlüklerinde yok. Süre yanıtı bu yüzden iki parçalıdır: sayı işaretle,
  birim ekrandan.
- **Yeni 37 sınıfın avatarı yok**; onay ekranı bu sınıflarda metin gösterir.
- **Kelime başına tek işaretleyici.** Ölçülen tek bağımsız sayı (%40 ilk öneri) bunun sonucudur.
  BosphorusSign22k (6 işaretleyici, 744 işaret) erişimi bu tabloyu topluca değiştirir.

## 8. Yeniden üretme

```bash
node scripts/extract-browser-landmarks.mjs "<veri kökü>/yanit_ham" yanit_raw.json
python -m src.data.import_answer_videos --data-root "<veri kökü>" --browser-landmarks yanit_raw.json
# Donmuş kodlayıcı: --student-init eğitilmiş 34 sınıflık modeli verir, --finetune-epochs 0
# yalnız çıkış katmanını eğitir.
python -m src.train_unified --vocabulary signbridge71-v1 --data-root "<veri kökü>" \
  --base-model <autsl20 saved_model> --hand-local-features --test-time-mirror \
  --student-init outputs/unified34/saved_model --head-epochs 40 --finetune-epochs 0 \
  --extra-manifest manifests/external_health_training.csv \
  --extra-manifest manifests/synthetic_health_training.csv \
  --extra-manifest manifests/answer_vocabulary_training.csv \
  --holdout-source ext_spreadthesign --holdout-source ext_tidsozluk --holdout-source ans_sts \
  --model-version signbridge-unified71-bigru-v0.7.0 --output-dir outputs/unified71
```
