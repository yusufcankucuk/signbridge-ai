# SignBridge AI doğrulama raporu — 11 Eylül 2026

## Yönetici özeti

Mevcut `autsl20-bigru-v0.1.0` modeli yeniden eğitilmeden karar politikası, OOD davranışı, kalibrasyon,
kamera kayıt şeması ve servis sözleşmesi geliştirildi. Validation hedefini sağlayan aday 0,95 skor eşiğidir;
ancak dondurulmuş OOD son kontrolünde yanlış kabul oranı %31,63 ile %20 hedefini geçemedi.
Bu nedenle aktif 0,80 politikası değiştirilmedi ve sistem sınırsız kamera kullanımı için hazır sayılmadı.

## Ölçümler

| Ölçüm | Sonuç |
|---|---:|
| Validation örneği | 378 |
| Aday politika | yalnız skor, eşik 0,95 |
| Aday kabul doğruluğu | 249/263 (%94,68) |
| Aday kapsama | 263/378 (%69,58) |
| OOD geliştirme yanlış kabul | 29/100 (%29,00) |
| OOD holdout kalite geçen | 98/100 |
| Mevcut 0,80 holdout yanlış kabul | 55/98 (%56,12) |
| Aday 0,95 holdout yanlış kabul | 31/98 (%31,63) |
| 10 kutulu ECE | 0,07722 |
| Çok sınıflı Brier skoru | 0,24914 |
| Sabit NPZ sıcak tahmin p50 / p95 | 53,26 ms / 65,88 ms |
| Yerel HTTP p50 / p95 | 53,18 ms / 192,64 ms |

Skor farkı adayları ölçülmüş, fakat seçilen eşik düzeyinde aynı kabul/ret davranışını üretmiş ve OOD sonucunu
iyileştirmemiştir. Aynı çıktıyı veren kombinasyonlar tek aday sayılmıştır. Temperature scaling uygulanmamıştır.

## Kod ve sözleşme sonucu

- Politika JSON'u model/ön işleme/sözlük sürümleriyle birlikte doğrulanır.
- Bozuk veya uyumsuz açık politika dosyasında servis sessiz geri dönüş yapmaz.
- Cevaba `decisionPolicyVersion`, `rejectionReason` ve `requiresConfirmation` eklenmiştir.
- Ret nedenleri `low_score` ve `ambiguous_prediction` olarak ayrılır.
- Kamera matrisi 25 development + 25 holdout denemesi olarak iki kişiyi ayırır.
- Aynı süreçte 25 deneme yapılabilir; model bir kez yüklenir ve yalnız ilk başta ısıtılır.
- Ham kareler/landmark dizileri varsayılan olarak kaydedilmez; süre, FPS, kalite ve ret nedeni CSV'ye yazılır.
- Ek denemeler eski başarısız kayıtları silmeden benzersiz kimlikle korunabilir.
- Kamera özeti, grupları karıştırmadan oranları pay/payda ve Wilson %95 güven aralığıyla verir.
- Gerçek validation örneği komut satırı, FastAPI ve Next.js proxy yollarında aynı kararı üretmiştir.
- Geçersiz mask FastAPI'de 422, uygulama proxy'sinde 400 ile reddedilmiştir.
- Sürümlü yerel paket 2.445/378/318 örneği içerir; listelenen bütün dosyaların checksum doğrulaması geçmiştir.
- Paket içinden gerçek çıkarım ve 40 train + 40 validation örnekli bir epoch smoke eğitim çalışmıştır;
  test bölümü okunmamış ve kaydedilen modelin yeniden yükleme eşitliği geçmiştir.
- AI Docker imajı yeniden oluşturulmuş, karar politikasıyla başlatılmış ve healthcheck `healthy` olmuştur.

## Durum sınıfları

| Durum | İçerik |
|---|---|
| Doğrulandı | 46 otomatik test, web lint/build, çalışan Docker healthcheck, validation/OOD seçimi, kalibrasyon çıktıları, servis/proxy eşitliği, paket checksum/çıkarım/smoke testi ve sürüm uyumlu karar politikası |
| Hedef karşılanmadı | OOD holdout yanlış kabul oranı %31,63; aday politika aktif edilmedi |
| İnsan çalışması bekliyor | p01 development ve p02 holdout ile toplam 50 gerçek kamera denemesi |
| Dış bağımlılık bekliyor | Huawei Cloud/OBS/ModelArts hesap, yetki, kota, bütçe ve veri yükleme izni |

## Sınırlar

Bu çalışma klinik yeterlilik değerlendirmesi değildir. Küçük OOD listeleri ve iki kişilik plan öğrenci MVP'si
için mühendislik kontrolüdür. Sabit NPZ ve yerel HTTP süreleri canlı kamera gecikmesi değildir. Kamera doğruluğu,
uçtan uca gecikmesi ve beş sınıf hedefleri gerçek katılımcı verisi olmadan tamamlanmış sayılmaz. Holdout sonucu
görüldükten sonra eşik yeniden ayarlanmamıştır.
