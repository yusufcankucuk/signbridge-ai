# `signbridge-unified30-bigru-v0.2.0` sürüm adayı raporu — 15 Eylül 2026

Durum: **deneysel teknik demo adayı.** Kod, eğitim ve otomatik testler tamam. Yunus'un 55 fiziksel
kamera denemesi ve Docker ile temiz kurulum henüz yapılmadı. Mevcut AUTSL-20 modeli varsayılan olmaya
devam ediyor.

## Özet

| Ölçüt | Eski AUTSL-20 | Birleşik v0.2.0 (seçilen tohum 42) |
|---|---:|---:|
| AUTSL test doğruluğu (318 örnek) | %85,22 | **%86,48** (+1,26 yp; kapı ≤ −3 yp → geçti) |
| AUTSL doğrulama doğruluğu | %84,39 | %85,19 |
| Yeni belirti sınıflarına kayan AUTSL test örneği | — | 0 |
| AUTSL `seker` test doğruluğu (11 örnek) | %36,36 | %45,45 |
| AUTSL `seker` örneklerinin belirti bağlamında `seker`→`diabetes` seçilmesi | — | %100 |
| MEB referansları, belirti bağlamı (eğitim verisi, bağımsız değil) | — | %100 (44 görünüm) |

Üç tohumun hepsi gerileme kapısını geçti (test: %86,48 / %86,48 / %86,16). Seçim, test verisine
bakılmadan AUTSL doğrulama doğruluğuyla yapıldı. Sınıf bazında en büyük düşüşler `iyi` (−11,8 yp),
`hasta` ve `tuvalet` (−5,9 yp); en büyük artışlar `icmek` ve `kotu` (+17,6 yp). Ayrıntı:
`outputs/unified30/regression_report.md` ve `class_regression.csv`.

## MEB verisi

- 11 video kırpıldı; en fazla 5 karelik boşluklar dolduruldu. Kaynak SHA-256 ve kalite bilgisi
  `manifests/meb_health11_training.csv` dosyasında.
- İlk kaynakta 5 video `needs_review` idi (el görünürlüğü %41–49). Kırpmadan sonra 11'inin de el
  görünürlüğü %85–92 ve hepsi `approved`. Dört düşük görünürlüklü video iskelet bindirmesiyle incelendi
  (`<veri kökü>/reports/meb_health11_overlays/`).
- Her video için 1 eski Holistic ve 3 tarayıcı (MediaPipe Tasks) görünümü var; toplam 44 görünüm.

## Canlı çıkarıcı farkı ve alınan önlem

Canlı kamera tarayıcıda MediaPipe Tasks, eğitim hattı ise eski Holistic çıkarıcısını kullanıyor. İlk
eğitim yalnız eski çıkarıcıyla yapıldı. Aynı MEB videoları başsız Chromium'a sahte kamera olarak
verilip uygulamanın gerçek akışında denendiğinde bu fark açıkça göründü. Tarayıcı görünümleri
eğitime eklenince sonuçlar iyileşti:

| Deneme | Yalnız eski çıkarıcı | Eski + tarayıcı görünümleri |
|---|---:|---:|
| Önceki tarayıcı kayıt denemesinin tekrarları, belirti bağlamı (95 kayıt) | %56,8 | **%68,4** |
| Uçtan uca kamera akışı (11 sınıf × 2) | 17/22 | **19/22** |

Uçtan uca akışta hatalı sonuçlar şunlardı: `seker` 0/2 (`burn` olarak tanındı), `kanama` 1/2 (bir kez
`fever` olarak). `seker` için 6 ek denemede 1 doğru sonuç alındı. Doğru sonuçta onay ekranında `diabetes`
avatarı ve “Şeker hastasıyım” yazısı, %98,8 skorla görüldü.

Bu denemeler aynı MEB videolarının döngüyle oynatılmasıdır. Kayıt penceresi işaretin rastgele bir
anında başlar. Gerçek kullanıcı ise işarete eller aşağıdayken başlar. Bu yüzden sonuçlar yalnız
çıkarıcı uyumunu ve arayüz akışını gösterir; kişi bağımsız başarı sayılmaz. `seker` ile `burn`
arasındaki karışma, fiziksel denemelerde özellikle izlenmeli.

## Uçtan uca doğrulanan davranışlar

- `/api/ai/status`: `team_camera`, `signbridge-unified30-bigru-v0.2.0`, `signbridge30-v1`,
  `versionMismatch=false`. Eski model sürümüyle `cameraAiEnabled=false` döner (entegrasyon testi).
- İlk şikâyet ekranı `recognitionContext=symptom` gönderir. Onay ekranında avatar ve cümle görünür.
  Düşük güvenli adaylar “Düşük güvenli deneysel öneri” olarak işaretlenir. Kalp krizi, kanama ve yanık
  için acil uyarısı çıkar. **Doğru, doktora ilet** ile doktor devir ekranına geçilir.
- Kalite kapısından geçmeyen kayıt (ör. `low_hand_visibility`) aday üretmez, geri dönüş ekranına gider.
- `/camera-trials`: deneme → sonuç (sınıf, avatar, ilk üç, skor, hareket, gecikme) → hasta onayı → CSV.
  `summarize_symptom_trials` raporu kabul seviyelerini ve p95 gecikmesini yazar. Bulutta ölçülen tahmin
  gecikmesi 126–139 ms.
- Kamera sarsıntısı omuz normalizasyonuyla hareket sayılmaz (test). Ellerdeki titremenin kapıyı geçmesi
  mümkündür; bu durumda sonuç yine hasta onayı ister.

## Otomatik testler

- `ai-training`: 63 test geçti (`test_unified30.py`, `test_release.py`, `test_contract.py` dahil).
- `signbridge-app`: `test:frontend` 26, `test:ai-providers` 13, `test:e2e-session` 6, `test:demo-services` 4
  test geçti. `tsc`, `eslint` ve `next build` temiz.
- `package_release` birleşik modeli sağlama toplamlarıyla paketledi ve doğruladı (3204 dosya).

## Açık işler

1. **55 fiziksel kamera denemesi (Yunus):** `/camera-trials` → CSV →
   `python -m src.summarize_symptom_trials`. Hiç tanınmayan sınıflar raporda başarısız olarak kalır.
2. **Docker ile temiz kurulum:** Bulut ortamında Docker Hub erişimi olmadığı için denenemedi.
   Servis ve web, `compose.yaml`/`.env.unified30.example` ile aynı ortam değişkenleriyle doğrudan
   çalıştırılarak doğrulandı.
3. **MEB kullanım izni:** Doğrulanana kadar model ağırlıkları, NPZ'ler ve videolar yayımlanmamalı.
4. **TİD uzmanı onayı:** `headache`, `stomachache`, `nausea`, `shortness-of-breath` için gerekli.
