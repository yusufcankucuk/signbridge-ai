# AUTSL-20 başlangıç modeli sonuçları

## Deney kimliği

- Model: `autsl20-bigru-v0.1.0`
- Rastgelelik tohumu: `42`
- Ön işleme: `landmark46-v1`
- Sözlük: `autsl20-v1`
- Mimari: iki katmanlı BiGRU
- Veri artırma: koordinat gürültüsü, küçük ölçek değişimi, landmark/kare düşürme; yatay çevirme yok

## Veri

| Bölüm | Manifest | Eğitime/değerlendirmeye alınan | İncelemeye ayrılan |
|---|---:|---:|---:|
| Eğitim | 2.448 | 2.445 | 3 |
| Doğrulama | 380 | 378 | 2 |
| Test | 318 | 318 | 0 |

Train, validation ve test bölümlerinde aynı `signer_id` bulunmaz. Böylece modelin aynı kişiyi ezberlemesi yerine görmediği kişilere genellemesi ölçülür.

## Sonuç

| Ölçüm | Değer |
|---|---:|
| Test doğruluğu | %85,22 |
| Test macro-F1 | %84,76 |
| Seçilen güven eşiği | 0,80 |
| Eşik üstü test doğruluğu | %93,13 |
| Eşik üstü test kapsamı | %82,39 |

Güven kapısı, test örneklerinin yaklaşık %17,61'inde kesin sonuç vermeyip yeniden çekim veya manuel seçim istemeyi tercih eder. Sağlık bağlamında bu, daha yüksek kapsam uğruna düşük güvenli tahmini kesinmiş gibi göstermemek için bilinçli bir güvenlik kararıdır.

## İyileştirme öncelikleri

En düşük F1 değerleri `seker` (%34,78), `igne` (%50,00), `icmek` (%64,86) ve `ilac` (%68,18) sınıflarında görüldü. Sonraki iterasyonda karışıklık matrisi incelenmeli; bu sınıflar için çekim açısı, el görünürlüğü ve benzer hareketler özel olarak test edilmelidir.

MEB-16 grubunda 7 video otomatik kalite eşiğini geçti, 9 video `low_hand_visibility` nedeniyle incelemeye ayrıldı. Bunlar tek örnekli resmî referanslardır ve bu modelin eğitim/test ölçümlerine dahil edilmemiştir.

## Yeniden üretme

```powershell
python -m src.train --epochs 50 --batch-size 32 --seed 42
```

Tam metrikler, sınıf raporu, grafikler ve model dosyaları yerel `ai-training/outputs/` klasöründe üretilir. Büyük model dosyaları Git'e eklenmez; dağıtımda OBS/ModelArts model kaydı kullanılmalıdır.
