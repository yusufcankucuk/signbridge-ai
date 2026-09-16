# `signbridge-unified34-bigru-v0.3.0` sürüm raporu (2026-09-16)

15 belirti avatarının tamamını kameradan tanımaya çalışan deneysel model. Sözlük `signbridge34-v1`,
özellik düzeni `xy-mask-138+handlocal-84` (girdi 60×222), ön işleme `landmark46-v1`.

> Öğrenci prototipidir. Tıbbi tanı koymaz; her kamera sonucu hasta onayı ister. Aşağıdaki kişi bağımsız
> sayılar az sayıda klipten gelir ve güven aralıkları geniştir.

## 1. Veri

| Kaynak | Kişi | Klip | Nasıl bölündü |
|---|---|---:|---|
| MEB resmî videoları | 1 | 11 + 1 (bulantı) | Hazır tek işaret videoları |
| Ahmet Tombul – sağlık | 1 | 7 | Ekrandaki mor altyazının çıktığı aralık (OCR) |
| Turkcell Akademi / İşitme Engelliler Fed. | 1 | 2 | Beyaz altyazı aralığı (OCR) |
| Emrah Üresin – İşaretlerin Dili | 1 | 11 | Lacivert altyazı aralığı (OCR) + el hareketi bölütleme |
| Serpil Avcı | 1 | 7 | Konuşma tanıma (Whisper small) + kare kare görsel kontrol |
| Ezgi Tutkun | 1 | 7 | Ekrandaki kelime listesi sırası + konuşma + görsel kontrol |
| Filiz Çağlar | 1 | 6 | Konuşma tanıma + görsel kontrol |
| “Sağlık Terimleri Tümü” sözlük videosu | 2 | 10 | Konuşma tanıma (her kelime iki kez) + görsel kontrol |

Toplam 53 harici klip, 9 farklı işaretleyici (MEB dahil). Klip listesi ve zaman damgaları:
`<veri kökü>/harici_ham/klip_listesi.csv`; görsel kontrol sayfası: `<veri kökü>/reports/harici_klip_kontrol.jpg`.
Kullanım izni kullanıcı beyanıdır (`user_reported_permission`).

Avatar başına gerçek kaynak sayısı (MEB dahil): ağrı 6, baş ağrısı 4, kalp krizi 5, kanama 6, baş dönmesi 4,
ateş 3, astım 4, döküntü 4, şeker 3 (+AUTSL), nefes darlığı 2, çarpıntı 2, yanık 2, kusma 3, **karın ağrısı 1,
bulantı 1**.

Bilinen yaklaşıklıklar:

- Kanama: 5 kaynakta yalnız “KAN” işareti (yumruk buruna) var; MEB'deki “kan + akma” bileşiminin ilk parçasıdır.
- Nefes darlığı: yalnız “NEFES” (el göğüste) işareti bulundu; “nefes darlığı” birebir değildir.
- Ateş (Emrah Üresin): yalnız alna el koyma kısmı alındı; “ateş/yanmak” parmak hareketi yanıkla karıştığı için kesildi.
- Ağrı (Emrah Üresin): başta yapılan ilk tekrar baş ağrısıyla karışacağı için çıkarıldı.
- Sınıf ortamı videosundaki (işaretleyici küçük ve yan duruyor) klipler kaliteli olmadığı için kullanılmadı.

### Sentetik örnekler

Karın ağrısı ve bulantıda tek kişi olduğu için 144 bileşimsel örnek üretildi
(`src/data/synthesize_symptoms.py`): baş ağrısındaki “baş” konumu karna taşındı (72), tek karın ağrısı ve
bulantı örneklerinin el yolu başka kişilerin düz el biçimiyle birleştirildi (36 + 36). Sentetikler bir
sınıfın en fazla yarısını oluşturur; gerçek başarı olarak raporlanmaz.

## 2. Model değişiklikleri

- **El biçimi özellikleri** (`--hand-local-features`): her elin el bileğine göre, el boyuyla ölçeklenmiş
  21 noktası (84 değer). İlk BiGRU'nun ek ağırlıkları sıfırla başlar ve ince ayarda eğitilir.
- **Kişi farkı artırımları** (yalnız sağlık örnekleri): %30 ayna (solak), ±8° döndürme, ±%10 ölçek,
  ±0,08 konum, ele özgü ±0,06 kayma, gürültü, kare/landmark düşürme, %80–120 hız.
- Kişi bağımsız ölçümde dışarıda bırakılan kaynaktan türetilen sentetikler eğitimden çıkarılır.
- Servis modelin girdi boyutuna bakarak 138 veya 222 özelliği kendisi seçer (eski modeller değişmez).

## 3. Sonuçlar

### Eski 20 AUTSL sınıfı (seçilen tohum 123)

| | Eski model | Yeni model |
|---|---:|---:|
| AUTSL test doğruluğu | %85,22 | **%87,74** (+2,52 yp, kapı ≤3 yp kayıp: geçti) |
| Yeni belirti sınıflarına kayan AUTSL test örneği | – | 2 / 318 |
| `seker` örneklerinin belirti bağlamında `diabetes` seçilmesi | – | %100 |

### Kişi bağımsız ölçüm (kaynak tamamen dışarıda, tek tohum)

| Dışarıda bırakılan | Görünüm | Önce (138 özellik) | Sonra (222 özellik) |
|---|---:|---:|---:|
| Emrah Üresin | 48 | %33,3 | **%52,1** |
| Serpil Avcı + Filiz Çağlar + sözlük (2. kişi) | 68 | %30,9 | **%48,5** |

15 belirti arasında şans düzeyi %6,7'dir. Sınıf ayrıntısı (sonra):

- Emrah: kanama 8/8, baş dönmesi 8/8, kalp krizi 4/4, nefes 5/8, ateş 0/8 (→ baş dönmesi), çarpıntı 0/8 (→ kalp krizi), ağrı 0/4.
- Serpil+Filiz+sözlük: baş dönmesi 8/8, kanama 4/4, döküntü 7/8, astım 4/8, baş ağrısı 5/16 (→ baş dönmesi), şeker 3/8, ateş 2/8, ağrı 0/4, kusma 0/4.

### Canlı uygulama üzerinden (tarayıcı + sahte kamera)

Klipler Chromium'un sahte kamerasından web uygulamasına verildi; tahmin gerçek akıştan geçti
(MediaPipe Tasks → Next.js → servis → onay ekranı).

- **Görülmemiş kişiler** (Serpil, Filiz, sözlük 2. kişi; bu kişileri hiç görmeyen modelle): **19/34 (%56)**.
  Ateş 4/4, kanama 2/2, ağrı 2/2, şeker 3/4, baş dönmesi 3/4, astım 2/4, baş ağrısı 2/8, döküntü 1/4, kusma 0/2.
- **Son model, 15 avatar entegrasyonu** (eğitimde görülen klipler, bağımsız değildir): 23/30 doğru; 12/15
  avatar ilk klibinde doğru geldi. Baş ağrısı ve kusma başka kliplerle doğru geldi (Serpil baş ağrısı 2/2,
  Ezgi baş ağrısı 2/2, MEB kusma 2/2). **Bulantı videosu kamera kalite kapısında reddedildi**: bu tek videoda
  MediaPipe eli karelerin yalnız ~%33'ünde bulabiliyor (koyu gömlek üzerinde el).
- MEB videolarının canlı akıştan tekrarı (11 işaret × 2): **17/22** (30 sınıflı modelde 11 aday arasında 19/22).
  Yanık 0/2 (→ nefes), kalp krizi, baş dönmesi ve şeker birer kez karıştı.
- MEB tarayıcı tekrar probu (aynı MEB kişisi, bağımsız değildir): %70,5 (30 sınıflı modelde %68,4).

## 4. Zayıf noktalar ve sonraki adım

1. Karın ağrısı ve bulantı tek kişiye dayanır; bulantı videosunda el tespiti zayıftır. Her birinden 3–5 farklı
   kişinin kısa kaydı en büyük iyileşmeyi sağlar.
2. Ateş ↔ baş dönmesi ↔ baş ağrısı (hepsi başta) ve çarpıntı ↔ kalp krizi ↔ nefes (hepsi göğüste) karışır.
3. Kusma ve genel ağrı başka kişilerde zayıftır.
4. 75 fiziksel kamera denemesi (`/camera-trials`, 15 × 5) ve TİD uzmanı kontrolü hâlâ yapılmalıdır.

## 5. Yeniden üretme

`docs/external-symptom-videos.md` içindeki komutlar; kişi bağımsız çıktılar
`outputs/unified34-holdout-emrah` ve `outputs/unified34-holdout-serpil-filiz-sozlukb` klasörlerindedir.
