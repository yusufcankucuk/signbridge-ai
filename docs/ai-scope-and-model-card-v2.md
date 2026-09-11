# SignBridge AI kapsamı ve model kartı v2

## Durum

Bu belge Final V4 planının AI bölümlerini güncel çalışan kod ve 11 Eylül 2026 ölçümleriyle eşleştirir.
Final V4 dosyasının kendisi değiştirilmemiştir. Bu sürüm yalnızca öğrenci MVP'sinin AI bileşenini kapsar.

| Başlık | Gerçekleşen durum |
|---|---|
| Model | `autsl20-bigru-v0.1.0`; 20 çıktılı BiGRU |
| Mimari | 128 ve 64 birimli iki çift yönlü GRU katmanı, arada %30 dropout, 64 birimli dense ve 20 sınıflı softmax |
| Eğitim | Normal sparse categorical cross entropy, Adam, `val_loss` takibi, 7 epoch patience |
| Girdi | `60 × 46 × 2` koordinat ile `60 × 46` ikili mask; model özelliği `60 × 138` |
| Ön işleme | Omuz orta noktası ve omuz mesafesiyle normalizasyon; koordinatlarda doğrusal, maskede en yakın komşu ile 60 adıma örnekleme |
| Görsel kapsam | 4 üst gövde noktası + 21 sol el + 21 sağ el; yüz ifadeleri kullanılmaz |
| Dil kapsamı | Tek seferde bir izole işaret; kesintisiz TİD cümlesi değildir |
| MEB kapsamı | Ağrı ve nefes gibi ifadeler manuel seçim/referans kataloğundadır; AUTSL-20 model çıktısı değildir |
| Bulut | ModelArts için taşınabilir yerel paket vardır; gerçek Huawei Cloud çalıştırması yoktur |

Final V4'te geçen BiLSTM, weighted loss veya Macro-F1 üzerinden erken durdurma ifadeleri bu modelde
gerçekleştirilmiş özellik olarak sunulmaz. Bunlar ancak yeni ve ayrı bir eğitim deneyiyle değerlendirilebilir.

## Veri ve model sonucu

- 2.445 eğitim, 378 validation ve 318 test örneği vardır.
- Veri bölümleri kişi bağımsızdır: 31 eğitim, 6 validation ve 6 test işaretçisi.
- Test doğruluğu %85,22; test macro-F1 %84,76'dır.
- Bunlar AUTSL poz verisi sonuçlarıdır; canlı kamera başarısı değildir.

## Karar politikası sonucu

Validation ile sabit OOD geliştirme listesinde 9 benzersiz davranış üreten skor/fark adayı karşılaştırılmıştır.
Validation hedeflerini sağlayan en düşük OOD yanlış kabul adayının kuralı yalnız skor ve eşik `0,95` olmuştur:

- Kabul edilen validation örneklerinde doğruluk: 249/263 = %94,68.
- Validation kapsaması: 263/378 = %69,58.
- OOD geliştirme yanlış kabulü: 29/100 = %29.

Politika dondurulduktan sonra farklı 10 OOD sınıfındaki 100 seçilmiş örneğin 98'i kalite kapısını geçti.
Mevcut `0,80` kuralı 55/98 (%56,12), aday `0,95` ise 31/98 (%31,63) yanlış kabul üretti.
Son kontrol hedefi en fazla %20 olduğu için aday politika **aktif edilmemiştir**. Aynı holdout verisine göre
yeniden eşik ayarı yapılmamıştır.

Kalibrasyon yalnız ölçülmüştür; temperature scaling uygulanmamıştır:

- 10 kutulu Expected Calibration Error (ECE): `0,07722`.
- Çok sınıflı Brier skoru: `0,24914`.

`confidence` kalibre edilmiş klinik olasılık değildir. Model yalnız 20 sınıf arasında softmax üretir ve
bilmediği işarete yüksek skor verebilir.

## Yerel performans ve entegrasyon

Tek bir sabit validation NPZ'siyle yapılan 30 sıcak tahminde p50 `53,26 ms`, p95 `65,88 ms` ölçülmüştür.
Aynı yerel FastAPI servisine 30 HTTP isteğinde p50 `53,18 ms`, p95 `192,64 ms` olmuştur. Modelin ilk yüklenmesi
yaklaşık `5,97 s`, ilk soğuk tahmini `3,62 s` sürmüştür. Bu nedenle servis model yüklemesini her istekte yapmaz ve
başlangıçta warm-up uygular. Bu ölçümler aynı NPZ'nin tekrarına aittir; canlı kamera, landmark çıkarma veya ağ
gecikmesi sonucu değildir.

Gerçek bir AUTSL validation örneği doğrudan Python, FastAPI ve Next.js proxy üzerinden aynı sınıfı ve aynı skoru
üretmiştir. Servis ile kullanıcı arayüzünün ortak sözleşmesi doğrulanmıştır; gerçek hasta-doktor kullanıcı turu
ayrı bir ekip kabul testidir.

## Kullanım ve güvenlik

- Kabul edilen model çıktısı bile kullanıcı onayı gerektiren bir öneridir.
- Düşük skor `low_score`, yeterli skor fakat yetersiz top-1/top-2 farkı `ambiguous_prediction` olarak reddedilir.
- Kalite/yapı hataları karar politikasından önce HTTP hata yanıtıyla durdurulur.
- Hasta onayı, tekrar deneme ve manuel seçim MVP'nin zorunlu güvenlik katmanlarıdır.
- Model tıbbi tanı koymaz, acil servis veya profesyonel tercüman yerine geçmez.
- Beş sınıflı kamera demosu modelin beş sınıfa yeniden eğitildiği anlamına gelmez; 20 çıktı korunur.

## Doğrulama durumu

| Durum | İçerik |
|---|---|
| Doğrulandı | Validation/test veri hattı, model paketi, skor politikası kodu, API girdi kontrolleri, OOD geliştirme ve dondurulmuş OOD kontrolü |
| Hedef karşılanmadı | OOD holdout yanlış kabul oranı %31,63; sınırsız kamera kullanımı için belirlenen %20 sınırının üzerinde |
| İnsan çalışması bekliyor | Bir development ve bir holdout katılımcıyla toplam 50 kontrollü kamera denemesi |
| Dış bağımlılık bekliyor | OBS/ModelArts hesabı, yetki, kota, bütçe ve veri yükleme izni |

Yerel teslim paketinin listelenen bütün dosyaları SHA-256 ile doğrulanmıştır. Paket içindeki ModelArts giriş dosyası bir epoch,
40 eğitim ve 40 validation örneğiyle smoke testten geçmiş; test bölümü okunmamış ve kaydedilen model tekrar
yüklenince aynı tahmini üretmiştir. Bu smoke doğruluğu model başarısı olarak raporlanmaz.

## Sonraki eğitim işi

Canlı kamera sonuçları veya poz uyumluluk farkları yeni eğitimi gerektirirse mevcut modelin üzerine yazılmayacaktır.
Yeni veri/sürüm, yeni ön işleme kimliği ve yeni model kartıyla ayrı deney olarak yürütülecektir.
