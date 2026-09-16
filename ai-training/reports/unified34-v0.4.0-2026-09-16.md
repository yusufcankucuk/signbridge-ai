# `signbridge-unified34-bigru-v0.4.0` sürüm raporu (2026-09-16)

Amaç: kamerada ilk kez işaret yapan birinin, yaptığı belirtinin avatarını görebilmesi. Sözlük
(`signbridge34-v1`), ön işleme (`landmark46-v1`) ve özellik düzeni (`xy-mask-138+handlocal-84`)
v0.3.0 ile aynıdır.

> Öğrenci prototipidir. Tıbbi tanı koymaz; her kamera sonucu hasta onayı ister. Kişi bağımsız sayılar
> az sayıda videodan gelir (her grup 12–17 video); tek bir videonun sonucu yüzdeyi birkaç puan
> oynatabilir.

## 1. Değişiklikler

| # | Değişiklik | Nerede |
|---|---|---|
| 1 | Kayıt kırpma: kısa el kayıpları doldurulur, elin görünmediği baş/son kareler atılır (eğitim verisiyle aynı hazırlık) | İstemci `prepareRecordedFrames`, Python `trim_recording` |
| 2 | Onay ekranında sıradaki iki belirti avatarı ("Başka bir şey mi anlattınız?") | `CaptureFlow.tsx`, `alternativeExpressions` |
| 3 | Kodlayıcı ön eğitimi: AUTSL'nin 226 işaretinin tamamı, 43 işaretleyici, 28 bin örnek (doğrulama %84,4, test %81,0) | `src/data/pack_autsl226.py`, `src/pretrain_autsl226.py`, `--encoder-init` |
| 4 | "Ağrı" işaretinin başa/karna taşınmasıyla baş ağrısı ve karın ağrısı için kişi çeşitliliği (336 sentetik örnek) | `synthesize_symptoms.py` (`relocate`) |
| 5 | Ayna görüntüyle test zamanı ortalaması | `runtime_config.testTimeMirror`, `predict.py` |
| 6 | Sözlük siteleri (Spreadthesign, Güncel TİD Sözlüğü) yayın modelinin eğitimine girmez; bu kişiler yalnız ölçümde kullanılır | `--holdout-source` |

Denenip **kullanılmayanlar**:

- **Bekleme/el kaldırma benzetimiyle eğitim** (`simulate_recordings.py`): Benzetim ölçümünde iyileşme
  verdi, ama gerçek bağlamlı kliplerde kötüleştirdi (B grubu 147 → 118 / 282).
- **3 tohumun ortalaması:** Sözlük kişilerinde tek modelden belirgin farkı yok. Yayın modeli
  önceden belirlenmiş kurala göre seçildi: kapıyı geçen ve AUTSL doğrulaması en yüksek tohum (2026).

## 2. Eğitimde görülmeyen kişiler: gerçek kayda yakın ölçüm

**Nasıl ölçüldü:** Emrah Üresin (A, 12 video) ve Serpil Avcı + Filiz Çağlar + sözlük 2. kişi (B, 17 video),
kaynak ders videolarından işaretin **1,5 sn öncesi ve sonrasıyla** kesildi. Bu kısımlarda eğitmenin kendi
doğal el hareketleri vardır.

- **Çıkarım:** Canlı uygulamadaki çıkarıcıyla (MediaPipe Tasks, 10 kare/sn, iki faz) işlendi.
- **Farklı başlangıç/bitiş:** Her videodan kaydın başlangıcı ve bitişi 0 / 0,5 / 1 sn kaydırılarak
  9 kesit alındı.
- **Toplam:** A 216, B 282 örnek.
- **Modeller:** Bu kişileri hiç görmeyen tek tohumlu modellerle ölçüldü:
  - eski yöntem: x3A / x4B (x3A'nın eğitiminde TİD Sözlüğü klipleri yoktu);
  - yeni yöntem: n2A / n2B (v0.4.0 ile aynı ayarlar).

| Canlı yol | Eski yöntem (A+B) | Yeni yöntem (A+B) |
|---|---:|---:|
| Eski istemci (kırpma yok) | 213/498 (%42,8), 65 kayıt reddi | 233/498 (%46,8) |
| Kırpma | 268/498 (%53,8), 3 red | 286/498 (%57,4) |
| **Kırpma + ayna ortalaması (v0.4.0 uygulaması)** | 269/498 (%54,0) | **305/498 (%61,2)** |
| Doğru avatar ilk 3 öneride (onay ekranında görünür) | 386/498 (%77,5) | **402/498 (%80,7)** |

Toplamda, eski uygulamadan yeni uygulamaya **%42,8 → %61,2** (ilk öneri) ve **%80,7** (ekrandaki üç
avatardan biri) geçildi. Gruplara ayrıldığında:

| | A: eski → yeni | B: eski → yeni |
|---|---:|---:|
| Kırpma + ayna, ilk öneri | 115 → 118 / 216 | 154 → 187 / 282 |
| İlk 3 öneri | 167 → 160 / 216 | 219 → 242 / 282 |

- **A (Emrah Üresin):** Belirgin iyileşme yok. Bu kişide ateş (yalnız alna dokunma), çarpıntı ve ağrı
  hâlâ tanınmıyor.
- **B:** Baş ağrısı, ateş ve döküntüde iyileşme var. Kaynaktaki tüm kesitlerle (bağlamsız, tüm
  görünümler) B doğruluğu %55,9 → %58,8; baş ağrısı 12/16.

**Sözlük siteleri kişileri** (26 video, v0.3.0 ve v0.4.0'ın hiç görmediği kişiler; tarayıcı görünümleri):

| | v0.3.0 | v0.4.0 |
|---|---:|---:|
| Kesik klip, ilk öneri | 29/52 | 27/52 |
| Kesik klip, ilk 3 | 37/52 | **41/52** |
| Bekleme + el kaldırma benzetimi ve kırpma, ilk öneri | 51/156 | **56/156** |
| Aynı, ilk 3 | 89/156 | **101/156** |

Sözlük klipleri çok kısadır (1,5–3 sn). İlk öneride iki model arasındaki fark tek videonun sonucundan
küçüktür.

## 3. Eski 20 AUTSL kelimesi ve MEB

| | v0.3.0 | v0.4.0 |
|---|---:|---:|
| AUTSL-20 test (eğitimde görülmeyen 6 kişi) | %87,74 | **%92,14** |
| Belirti sınıflarına kayan AUTSL test örneği | 2/318 | 4/318 |
| MEB tarayıcı probu (aynı MEB kişisi; bağımsız değil) | %70,5 | **%90,5** |
| `seker` örneklerinin belirti bağlamında `diabetes` seçilmesi | %100 | %100 |

## 4. Canlı uygulama (tarayıcı + sahte kamera, temiz kurulum)

**Kurulum:** Temiz kopyada `install-model.mjs --archive signbridge-unified34-v0.4.0.zip` +
`check-model-assets` çalıştırıldı. Servis Python 3.9 + TF 2.15.1 ile, web `next build --webpack` ile açıldı.

**Sonuçlar:**

- **15 avatar (her biri 2 deneme): 30/30 doğru, 0 red.** v0.3.0'da aynı kliplerle 24/30'du.
  - Kliplerin çoğu eğitim verisindedir. Bağımsız olan tek klip Spreadthesign bulantı klibidir; o da 2/2 doğru.
  - Ayrı bir denemede Ezgi Tutkun'un karın ağrısı klibi önce "Bir yerim ağrıyor" olarak geldi; karın
    ağrısı ilk alternatifte göründü ve seçilince doktor ekranına "Karnım ağrıyor" iletildi.
- **Tam görüşme akışında sayfa hatası olmadı.** Adımlar:
  1. Kamera: baş ağrısı tanındı.
  2. Doktor iki soru sordu, hasta iki yanıt verdi.
  3. Tedavi yazıldı, hasta özeti okundu, görüşme bitirildi.

## 5. Zayıf noktalar

1. **Az kişiye dayanan belirtiler:** Karın ağrısı, bulantı, kusma ve çarpıntı hâlâ 1–3 kişinin
   videosuna dayanıyor. Her birinden 3–5 farklı kişinin 2–3 sn'lik kaydı en büyük iyileşmeyi sağlar.
2. **Kişiye özgü biçimler:** Emrah Üresin'in yalnız alna dokunan ateş işareti ve "ağrı"nın farklı
   biçimleri karışıyor.
3. **Ölçümün sınırı:** Ölçümler ders videolarındaki eğitmenlerle yapıldı. Gerçek hasta kameralarıyla
   `/camera-trials` (15 × 5) denemesi ve TİD uzmanı kontrolü hâlâ gerekli.

## 6. Yeniden üretme

Komutlar `docs/external-symptom-videos.md` 3–4. bölümlerindedir. Bağlamlı klipler
`<veri kökü>/harici_ham/baglamli/` altındadır (`plan.csv`: kaynak video, başlangıç/bitiş, bağlam süresi).
