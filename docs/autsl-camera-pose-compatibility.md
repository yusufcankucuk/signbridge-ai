# AUTSL–kamera poz uyumluluk raporu

## Sonuç

Mevcut AUTSL PKL verisi, Python kamera çıkarıcısı ve 13 Eylül 2026'da eklenen tarayıcı MediaPipe Tasks hattı
aynı temel 75 noktalı düzeni, 46 noktalı seçimi ve x/y koordinat yaklaşımını kullanır. Ancak çıkarıcı sürümleri ve
ayarları birebir aynı değildir. Bu nedenle hat **yapısal ve sözleşmesel olarak uyumlu**, fakat eğitim poz
üreticisiyle **dağılım bakımından eşdeğerliği kanıtlanmamış** olarak işaretlenmiştir.

## Kaynaklar

- OpenHands resmî çıkarıcı: <https://github.com/AI4Bharat/OpenHands/blob/main/scripts/mediapipe_extract.py>
- MediaPipe Holistic resmî açıklaması: <https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/holistic.md>
- OpenHands poz veri açıklaması: <https://github.com/AI4Bharat/OpenHands/blob/main/docs/instructions/self_supervised.rst>

## Karşılaştırma

| Özellik | OpenHands/AUTSL | SignBridge kamera hattı | Karar |
|---|---|---|---|
| Nokta sırası | 33 pose + 21 sol el + 21 sağ el | 33 pose + 21 sol el + 21 sağ el | Uyumlu |
| Kullanılan alt küme | İndirilen PKL'de 75 nokta | 11,12,13,14 pose + 42 el noktası | Dönüşüm açık ve sabit |
| Yerel PKL biçimi | Ölçülen örnek: `(F,75,2)` + `(F,75)` confidence | Ham çıkarım `(F,75,2)` + `(F,75)` | Yapısal uyumlu |
| Koordinatlar | MediaPipe normalize görüntü x/y; görüntü dışı değer olabilir | MediaPipe normalize görüntü x/y | Uyumlu |
| Z koordinatı | OpenHands çıkarıcı kodu z üretir; yerel AUTSL arşivi x/y içerir | z kullanılmaz | Yerel veriyle uyumlu |
| Pose görünürlüğü | MediaPipe `visibility` | MediaPipe `visibility` | Uyumlu |
| El görünürlüğü | El varsa 1, yoksa 0 | El varsa 1, yoksa 0 | Uyumlu; nokta başına gerçek el güveni değildir |
| Eksik nokta | Sıfır koordinat + sıfır confidence | Sıfır koordinat + sıfır confidence | Uyumlu |
| Renk düzeni | OpenCV BGR → RGB → Holistic | OpenCV BGR → RGB → Holistic | Uyumlu |
| Model karmaşıklığı | OpenHands kaynak kodunda `model_complexity=2` | SignBridge'de `model_complexity=1` | Eşdeğer değil; domain farkı riski |
| Aynalama | OpenHands çıkarıcıda yatay çevirme yok | Model girdisinde yatay çevirme yok | Uyumlu |
| Anatomik el | Holistic `left_hand_landmarks`/`right_hand_landmarks` | Aynı alanlar aynı sırada | Uyumlu; önizleme aynalanırsa ayrıca test gerekir |
| Normalizasyon | OpenHands ham pozu sağlar | Omuz orta noktası/mesafesi | SignBridge model sözleşmesinin parçası |
| Zaman örnekleme | Ham kare dizisi | Koordinat doğrusal, mask en yakın komşu ile 60 adım | SignBridge model sözleşmesinin parçası |
| Tarayıcı hattı | Uygulanmaz | MediaPipe Tasks Holistic; aynı 75→46 seçimi, kalite kapısı, normalizasyon ve 60 adım | Otomatik sözleşme testleri geçti; gerçek kamera matrisi bekliyor |

MediaPipe x ve y değerlerini görüntü genişliği/yüksekliğine göre normalize eder. Pose noktaları görüntü sınırının
dışına çıktığında değerler 0–1 aralığını aşabilir; bu tek başına hata sayılmaz. Yüzün 468 noktası model girdisine
alınmadığı için mimik ve ağız bilgisi kullanılmaz.

## Otomatik sözleşme testleri

- Konum ve orantılı ölçek değişimi sonrası normalize koordinatlar aynı kalır.
- Sol ve sağ el blokları yer değiştirmez.
- Eksik noktalar sıfır koordinat ve sıfır maskeyle taşınır.
- Kısa kayıt, görünmeyen omuzlar ve sonlu olmayan değerler reddedilir.
- 60 adıma örnekleme aynı girdide deterministiktir.

## Mühendislik kararı

`landmark46-v1` veya mevcut model sessizce değiştirilmemiştir. Tarayıcı önizlemesi CSS ile aynalanır; analiz
karesine yatay çevirme uygulanmadığından anatomik sol/sağ blok sırası korunur. Ham video tarayıcı dışına çıkmaz;
yalnız türetilmiş landmark isteği gönderilir. `model_complexity=2` geçişi düşük riskli bir
ayar değişikliği gibi görünse de eğitim verisinin üretim ayarını etkilediği için yeni kamera karşılaştırması ve
gerekirse yeni ön işleme/model sürümü gerektirir. İki katılımcılı kamera ölçümü tamamlanmadan Python hattı ile
tarayıcı çıkarıcısı eğitim çıkarıcısıyla eşdeğer kabul edilmeyecektir.
