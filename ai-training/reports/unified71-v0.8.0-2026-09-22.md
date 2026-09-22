# unified71 v0.8.0 — ikinci işaretleyiciyle yanıt sözlüğü

Tarih: 2026-09-22 · Model: `signbridge-unified71-bigru-v0.8.0` · Sözlük: `signbridge71-v1` (71 sınıf)

## 1. Ne değişti

| | v0.7.0 | v0.8.0 |
|---|---|---|
| Yanıt sözlüğü işaretleyicileri | `ans_meb`, `ans_sts` | + `ans_medyatik`, `ans_turkce` |
| İki işaretleyicisi olan yanıt sınıfı | 5 (sayı-1…5) | 18 (sayı-1…5 + 13 vücut/evet/hayır) |
| MEB referans örneği | 379 | 418 |
| AUTSL test doğruluğu | %93.40 | %93.71 |
| Belirti (symptom) bağlam doğruluğu | 1.00 | 1.00 |

Kullanıcının verdiği ders videolarından **13 klip / 39 görünüm** çıkarıldı
(`bacak, baş, bel, boğaz, diş, diz, el, evet, göz, hayır, kol, kulak, sırt`).
Encoder yine donmuş durumda (`--finetune-epochs 0`), bu yüzden belirti prototipleri
bit düzeyinde aynı — 15 belirti avatarında hiçbir gerileme yok.

## 2. Görülmemiş kişi ölçümü (leave-one-signer-out)

Aynı 13 sınıf, aynı 39 görünüm, iki yönlü çapraz test:

| Eğitimdeki işaretleyici | Test edilen (görülmemiş) kişi | İlk öneri | İlk 3 | Eşik üstü kabul | Kabul edilenin doğruluğu |
|---|---|---|---|---|---|
| `ans_meb` (v0.7.0) | `ans_medyatik` + `ans_turkce` | 15/39 (%38) | 25/39 (%64) | 10/39 | 8/10 (%80) |
| `ans_medyatik` (LOSO) | `ans_meb` | 9/39 (%23) | 24/39 (%62) | 15/39 | 6/15 (%40) |

Sonuç: **tek işaretleyiciyle eğitilmiş bir yanıt sınıfı, görülmemiş kişide ilk öneride
%23–38, ilk üçte %62–64 kalıyor.** Yön değiştirince sonuç değişmiyor — bu bir veri
sorunu, model sorunu değil.

Üçüncü bir işaretleyici elimizde olmadığı için v0.8.0'ın (iki işaretleyicili) görülmemiş
kişideki kazancı **ölçülemedi**. Tabloya bakıp "v0.8.0 daha iyi" demek dürüst olmaz;
söylenebilecek şey, aynı sınıflarda işaretleyici sayısını 1'den 2'ye çıkardığımızdır.

### Sinyalin kendisi: işaretleyici çeşitliliği

Her üç yapılandırmada da **`evet`, `hayır`, `kol` 3/3** doğru. Bu üç sınıfın arkasında
AUTSL'den gelen **43 farklı işaretleyici** var. Diğer 10 vücut bölgesi sınıfının arkasında
1–2 kişi var ve hepsi 0/3.

Aynı model, aynı eğitim, aynı çekim koşulu — tek fark kaç kişinin işaret yaptığı.
Sunumda gösterilecek asıl bulgu bu.

## 3. v0.8.0 eğitim verisinin doğrulanması

Yeni klipler modele gerçekten girdi mi (eğitim içi kontrol):

```
v0.8.0 <- ders klipleri (39 görünüm)
  ilk1 33/39 (%85)  ilk3 39/39 (%100)
  eşik üstü kabul 15/39, doğru 15/15
```

Beklendiği gibi: veri alındı, ezberlenmedi (%85, %100 değil), ve eşiğin üstünde
kabul edilenlerin tamamı doğru.

## 4. Uygulama tarafındaki iki düzeltme

1. `predict.py`, gösterilen ana tahmini `classId` alanında ve onu tekrar etmeyen sonraki **3 adayı**
   `alternatives` alanında döndürüyor (`ordered[1:4]`). Tahmin tamamen reddedilirse `classId` boş
   kaldığından tanılama amacıyla ilk üç skor korunuyor. Böylece web sözleşmesindeki üç alternatif
   sınırı hiçbir durumda aşılmıyor.
2. Onay ekranı yanıt modunda **3 alternatif** gösteriyor (önceden 2).

Gerekçe: görülmemiş kişide ilk öneri %38, ilk üç %64. Kullanıcıya üç alternatif
göstermek, doğru yanıtın ekranda olma olasılığını ilk önerinin neredeyse iki katına
çıkarıyor. Belirti (avatar) akışı 2 alternatifte kaldı — orada doğruluk zaten yüksek.

## 5. Eşik davranışı — önceki ölçümün düzeltmesi

Önceki turda "eşik üstü 29/39 kabul, yalnızca 10 doğru" diye rapor etmiştim.
**Bu ölçüm hatalıydı**: 39 görünümün hepsi `duration` bağlamında koşulmuştu, yani
vücut bölgesi işaretleri sayı sınıflarıyla yarıştırılmıştı.

Sınıfına uygun bağlamla (`location` / `medication`) tekrar ölçüldüğünde gerçek davranış:
**10/39 kabul, 8'i doğru (%80)**. Yani sistem emin olmadığında kabul etmiyor,
kullanıcıyı listeye yönlendiriyor. Tıbbi demo için doğru davranış bu.

## 6. Yapılamayanlar

- `sayilar.mp4` (5.5 dk) ve `zaman kavramlari.mp4` (4 dk) **etiketlenmedi**. İkisi de
  kesintisiz ders anlatımı; işaretler izole değil, ekranda alt yazı yok. Otomatik
  bölütleme 43 belirsiz aday üretti. Sayılar zaten en zayıf kategori; yanlış etiket
  onları daha da bozardı, bu yüzden tahmin yürütmedim.
- Konuşma tanıma (Whisper) ile ses üzerinden etiketleme denendi; model dosyalarının
  indirildiği sunucular (huggingface.co, openaipublic) hem bulutta hem kullanıcının
  makinesinde ağ politikası tarafından engelli.
- `zaman kavramlari.mp4` içindeki SAAT, HAFTA, BUGÜN, YARIN, DAKİKA, ZAMAN yeni sınıf
  olurdu; sözlük genişletmesi bu sürüme girmedi.

## 7. Paket

```
signbridge-unified71-v0.8.0.zip
sha256 b76bb4153dfe7e5dac3c67c7abd2bf14b1a253a939e8535345aa5a50d2536e2d
```

`ai-training/configs/model-assets.unified71.json`, `scripts/model-release.json`,
`.env.unified71.example` ve cihazdaki `.env` v0.8.0'a çevrildi.
Testler: 88 pytest + 39 frontend + typecheck — hepsi geçiyor.
