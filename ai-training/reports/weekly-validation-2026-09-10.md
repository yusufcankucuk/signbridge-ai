# AI doğrulama teslimi — 10 Eylül 2026

## Durum ve kapsam

IIG-44 / IIG-47–50 için yerel uygulama. Dal: `feature/ai-validation-handoff`.
Başlangıç commit'i `73761d1`; bu rapor çalışma ağacındaki yeni değişiklikleri kapsar.
Model `autsl20-bigru-v0.1.0`, ön işleme `landmark46-v1`, sözlük `autsl20-v1`.
Orijinal `outputs/` modeli, runtime ayarı ve eski test sonuçları korunmuştur.
Bu çalışma yeni bir klinik başarı veya gerçek ModelArts çalıştırması değildir.

| İş | Kanıtlanan | Kalan |
|---|---|---|
| IIG-47 | Ortak video/kamera test aracı, kalite kapısı, 50 denemelik boş matris, gerçek MEB video işleme | Beş sınıfın gerçek 50 kamera denemesi; doğru in-scope video tahmini |
| IIG-48 | 378 validation örneği, dört eşik, 10 ayrı OOD sınıfında 20 örnek, zayıf sınıf analizi, sınır testleri | Canlı OOD/genelleme ayrı çalışma; eşik tek başına güvenlik çözümü değil |
| IIG-49 | Taşınabilir veri/kod/model paketi; bir epoch yerel giriş dosyası testi ve model yeniden yükleme | Huawei hesabı/bölge/kota/bütçe ve bulut ortamı doğrulaması |
| IIG-50 | Gerçek model → HTTP FastAPI → HTTP Next.js proxy sonuç eşitliği; geçersiz girdinin reddi | Büşra/Yusufcan ile tam hasta onayı–doktor yanıtı–yeni tur kabul testi |

## Eşik kararı — yalnızca validation

| Eşik | Kabul | Doğru kabul | Yanlış kabul | Ret | Kabul edilenlerde doğruluk | Kapsama |
|---|---:|---:|---:|---:|---:|---:|
| 0,70 | 342 | 300 | 42 | 36 | %87,72 | %90,48 |
| 0,75 | 325 | 292 | 33 | 53 | %89,85 | %85,98 |
| 0,80 | 318 | 287 | 31 | 60 | %90,25 | %84,13 |
| 0,85 | 311 | 285 | 26 | 67 | %91,64 | %82,28 |

En az %90 kabul doğruluğu ve %20 kapsama şartını sağlayan en geniş kapsamalı aday **0,80**.
Mevcut ayar zaten 0,80 olduğundan değiştirilmedi. Test kümesi bu seçime katılmadı.
Bu sayıların eski test sonuçlarıyla paydaları farklıdır: burada toplam 378 validation örneği vardır.
Eşik üstü kabul, hasta tarafından onaylanmış veya tıbben doğru anlamına gelmez.

## OOD sonuçları — kritik sınırlılık

Skorlara bakmadan belirlenen 10 sınıf: abla, ağabey, ağaç, aile, alışveriş,
anahtar, ayakkabı, ayna, bahçe, bayrak. Her sınıfın validation CSV'sindeki ilk iki örneği alındı.
20/20 kalite kapısını geçti. Aynı erken signer örnekleri kullanıldığı için kişi çeşitliliği sınırlıdır;
bu küçük teşhis deneyi gerçek hayattaki OOD oranını temsil etmez.

0,80 eşiğinde **15/20 yanlış kabul** görüldü. Örneğin abla/ağabey → hayır,
ayakkabı → doktor, ayna → iğne. Düşük kaliteli görüntü engeli ile sözlük dışı hareket ayrımı farklıdır.
Softmax yalnızca 20 sınıf arasında seçim yaptığı için bilinmeyen işarete yüksek skor verebilir.
Eşiğin yükseltilmesi bu sorunu tamamen çözmez. Sistem yalnızca kontrollü öğrenci demosu içindir;
gerçek hastada veya acil karar vermek için kullanılmamalıdır.

Zayıf sınıfların validation karışmaları: içmek → ilaç 6, şeker → ilaç 3,
şeker → tuvalet 2, ilaç → hasta 2, içmek → hasta 2. Ham videolar görülmeden
nedeni kesinleştirilemez. Hareket benzerliği, kesim, el görünürlüğü hipotezdir; kanıtlanmış neden değildir.

## Gerçek kayıtlı video ölçümü

Yerel `meb/agri.mp4`: 87 kare, omuz görünürlüğü 1,0; el görünürlüğü yaklaşık 0,552.
Kalite approved; model **kaza**, güven **0,866918** üretti ve kabul etti.
Ağrı model sınıfı değildir. Bu sonuç video hattının çalıştığını ama doğru tanımayı kanıtlamadığını gösterir.
Dosya etiketi kaynak dosya adına dayalıdır; TİD uzmanı doğrulaması yapılmadı.

- Landmark çıkarma: yaklaşık 8333,90 ms.
- Kalite/ön işleme: yaklaşık 1,27 ms.
- İlk model tahmini: yaklaşık 2508,48 ms.
- Video okuma başlangıcından sonuç: yaklaşık 10844,19 ms.

Bunlar tek soğuk çalıştırma değerleri; p50/p95 veya canlı kamera gecikmesi değildir.
Model yükleme bu zamanlara dahil değil; landmark çıkarıcı başlatılması dahil.
Ham görüntü veya landmark dizisi bu aracın CSV çıktısına yazılmaz.
Kamera çekimi başlatılmadı; 50 satır `pending` durumundadır.

## Entegrasyon ve paket kanıtı

Validation `signer1_sample4`: doğrudan model, yerel FastAPI HTTP `/predict` ve
Next.js HTTP `/api/ai/predict` aynı cevabı verdi: yorgun, 0,985483.
Skor toleransı 1e-5; diğer cevap alanları birebir karşılaştırıldı.
256 mask değeri FastAPI'de 422, Next proxy'de 400 ile reddedildi.
Mask artık uint8 dönüşümünden önce doğrulanır; boş mask de engellenir.
Eşiğin hemen altı, tam eşik ve hemen üstü sentetik modelle otomatik test edilir;
bu testler gerçek canlı model başarısı diye sunulmaz.

Paket onaylı 2445 train + 378 validation + 318 test = 3141 NPZ örneğini içerir.
Manifest yolları veri köküne göredir; etiket/split/NPZ biçimi ve kişi ayrımı kontrol edilir.
Kod, etiketler, ön işleme ayarı, model ve dosya SHA-256 listesi birlikte taşınır.
PKL/MP4, kimlik bilgileri, .env ve sanal ortam paketlenmez. NPZ yine lisanslı türetilmiş veridir;
paket herkese açık paylaşılmamalı ve izin teyidi olmadan OBS'ye yüklenmemelidir.

Son paket doğrulamasında SHA-256 listesine alınan 3181 dosyanın tamamı yeniden okunup eşleştirildi.
Yerel smoke test: 40 train ve 40 validation örneği, 1 epoch, TensorFlow 2.15.1;
SavedModel yeniden yükleme eşitliği geçti. Test kümesi okunmadı, yeni başarı iddiası üretilmedi.
Bu test, MoXing/OBS/IAM/SWR/ModelArts ortamının çalıştığını kanıtlamaz.

## Kanıt dosyaları

Hepsi yerel `ai-training/runs/` altında; Git dışında tutulur:

- `2026-09-10-validation/`: eşik CSV, OOD CSV, sınıf raporu, provenance, karar.
- `2026-09-10-camera-matrix.csv`: yapılacak 50 kontrollü deneme.
- `2026-09-10-meb-agri.csv`: gerçek video sonucu.
- `2026-09-10-integration/`: gerçek özel istek ve üç yolun cevapları.
- `2026-09-10-smoke-v3/`: son paketin içindeki giriş dosyasıyla ayrı kısa eğitim ve yeniden yükleme kanıtı.
- `2026-09-10-release-v3/`: sürümlü, taşınabilir teslim paketi; 3181 dosyanın checksum doğrulaması geçti.

Yeniden çalıştırma ve kalan insan adımları: [haftalık uygulama kılavuzu](../../docs/ai-weekly-validation.md).
