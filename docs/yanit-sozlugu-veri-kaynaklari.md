# Kamera yanıt sözlüğü — veri kaynakları ve indirme listesi

- **Tarih:** 18 Eylül 2026
- **Kapsam:** Doktor sorularına kamerayla yanıt için gereken 58 işaret (Büşra'nın listesi)
- **Sonuç:** 54 yeni kelimenin **48'i** için hazır video kaynağı bulundu. Kalan 6'sı için ekran üzerinden
  seçim (dokunma) önerilir.

## 1. Kaynakların karşılaştırması

| Kaynak | İçerik | İşaretleyici | Biçim | Bizim listeden karşıladığı | Erişim |
|---|---|---:|---|---:|---|
| **MEB İÇDEP tematik sözlükler** | Sayılar, Vücudumuz (62), Sıfatlar (78), Günlük Konuşmalar | 1 | doğrudan mp4 | **41** | Açık, betikle toplu indirilir |
| **MEB Alfabetik Sözlük (uygulama)** | 5.060 kelime video | 1–2 | 1,18 GB kurulum | Zaman birimleri dahil kalanların çoğu | Ücretsiz indirme |
| **Spreadthesign (TR)** | Genel sözlük; çoğu kelimede İzmir + TDK olmak üzere 2 varyant | 2+ | Site üzerinden video | **13** (aşağıdaki liste) | Elle indirme |
| **AUTSL** (elimizde) | 226 işaret, 38 bin örnek | **43** | İskelet noktaları | `saat`, `dün`, `hafif` (+ evet/hayır/iyi/kötü zaten modelde) | Hazır |
| **BosphorusSign22k** | 744 işaret (428 sağlık), 22.5 bin video | 6 | RGB + derinlik + OpenPose iskeleti | Sözlük listesi yayınlanmamış; sağlık ağırlıklı | E-posta + kullanım sözleşmesi |
| **TİD Sözlüğü** (aile.gov.tr) | Bakanlık sözlüğü | 1–2 | Site üzerinden video | Çoğu kelime | Elle indirme (site otomatik erişime kapalı) |
| Sign Language Digits | 0–9 rakam, 2.180 fotoğraf, 218 kişi | 218 | **El kırpılmış fotoğraf** | **Kullanılamaz:** omuz yok, hareket yok, ASL biçimi | Açık |
| E-TSL | MEB yayınlarından sürekli TİD | — | Video + cümle çevirisi | **Kullanılamaz:** tek kelime etiketi yok | İstek üzerine |
| tid_realtime (GitHub) | 30 kelime | ? | Kod + model | Veri paylaşılmamış | — |
| ERUSLR | TİD veri seti | — | — | İndirme bağlantısı yok | — |

## 2. MEB'den toplu indirilecekler (41 video)

`kodlar/meb-yanit-videolari-indir.ps1` betiği bunları
`ai icin kullanilacak kaynaklar/yanit_ham/<kelime>/meb_1.mp4` olarak indirir.

| Küme | Kelimeler | Sayfa |
|---|---|---|
| Sayılar | bir, iki, üç, dört, beş, altı, yedi, sekiz, dokuz, on (+yirmi, otuz) | [Sayılar](https://orgm.meb.gov.tr/icdep/sayilar-tematik-sozlukleri-92) |
| Vücut | baş, göz, kulak, burun, diş, boğaz, boyun, omuz, kol, el, göğüs, karın, sırt, bel, bacak, diz, ayak | [Vücudumuz](https://orgm.meb.gov.tr/icdep/vucudumuz-tematik-sozlukleri-95) |
| Şiddet / yön | az, çok, hafif, ağır (şiddetli yerine), iyi, kötü, ön, arka, üst (yukarı), alt (aşağı) | [Sıfatlar](https://orgm.meb.gov.tr/icdep/sifatlar-tematik-sozlukleri-89) |
| Onay | evet, hayır | [Günlük Konuşmalar](https://orgm.meb.gov.tr/icdep/gunluk-konusmalar-tematik-sozlukleri-82) |

Tematik sözlüklerde **bulunmayanlar:** zaman birimleri, sağ, sol, orta, kalça, bilmiyorum, bazen.

## 3. Spreadthesign'dan elle indirilecekler (13 kelime)

Sayfayı açıp videoyu kaydedin; her kelimede genelde iki varyant var (İzmir ve TDK) — **ikisini de alın**,
iki ayrı işaretleyici demektir.

| classId | Kelime | Bağlantı |
|---|---|---|
| `saat` | saat | https://www.spreadthesign.com/tr.tr/word/811/saat/0/ |
| `gun` | gün | https://www.spreadthesign.com/tr.tr/word/25747/gun/0/ |
| `hafta` | hafta | https://www.spreadthesign.com/tr.tr/word/426/hafta/0/ |
| `ay` | ay | https://www.spreadthesign.com/tr.tr/word/491/ay/0/ |
| `yil` | yıl | https://www.spreadthesign.com/tr.tr/word/536/yil/0/ |
| `bugun` | bugün | https://www.spreadthesign.com/tr.tr/word/428/bugun/0/ |
| `dun` | dün | https://www.spreadthesign.com/tr.tr/word/429/dun/0/ |
| `sag` | sağ | https://www.spreadthesign.com/tr.tr/word/1511/sag/0/ |
| `sol` | sol | https://www.spreadthesign.com/tr.tr/word/1512/sol/0/ |
| `orta` | orta | https://www.spreadthesign.com/tr.tr/word/9456/orta/0/ |
| `kalca` | kalça | https://www.spreadthesign.com/tr.tr/word/25734/kalca/0/ |
| `bazen` | bazen | https://www.spreadthesign.com/tr.tr/word/1522/bazen/0/ |
| `bilmiyorum` | bilmemek | https://www.spreadthesign.com/tr.tr/word/14635/bilmemek/0/ |
| `yayiliyor` | yayılmak | https://www.spreadthesign.com/tr.tr/word/21638/yayilmak/0/ |
| `yaygin` | yaygın | https://www.spreadthesign.com/tr.tr/word/104/yaygin/0/ |

## 4. Kaynak bulunamayanlar (6)

`iki-taraf`, `cevresinde`, `uzun-zaman`, `siddetli`, `dayanilmaz`, `sayi-11…sayi-30`.

Öneri:

- **`siddetli` / `dayanilmaz`:** Şiddet sorusu sayılarla (1–5) yanıtlansın; bu iki sınıf hiç eğitilmesin.
  MEB'deki `ağır` işareti "şiddetli" karşılığı olarak kullanılabilir.
- **`iki-taraf`, `cevresinde`, `uzun-zaman`:** Ekranda dokunarak seçilsin (kamera sözlüğüne girmesin).
- **11–30 arası sayılar:** Faz 2'ye kalsın; tuş takımı yeterli.

## 5. MEB Alfabetik Sözlük uygulaması (isteğe bağlı, tek seferlik)

5.060 kelimenin videosu tek pakette:
[indirme](https://bulut.meb.gov.tr/app/tr-TR/App/Download/MEBBulut/cf9a3d60-28ad-425b-a567-496f6fbf2f09)
(1,18 GB, ücretsiz, [açıklama sayfası](https://orgm.meb.gov.tr/icdep/tid/alfabetik-sozluk-icerik-6)).
Kurulduktan sonra videolar bilgisayarda dosya olarak durur; klasör yolu verilirse zaman birimleri ve
kalan kelimeler oradan alınır. Böylece Spreadthesign'a hiç gerek kalmayabilir.

## 6. BosphorusSign22k (en yüksek değerli, izin gerektirir)

- 744 işaret, **428'i sağlık**, 6 işaretleyici, 22.542 video, kişi bağımsız bölünme hazır.
- **OpenPose iskelet noktaları** veriliyor: bizim model zaten omuz, dirsek ve iki elin noktalarını
  kullanıyor, yani video işlemeye gerek kalmadan küçük bir dönüştürücüyle eğitime girer.
- Yalnız yeni kelimeler için değil, mevcut 15 belirti için de en büyük iyileşme kaynağı: bugünkü
  zayıflığımızın sebebi kelime başına 1–3 kişi olması.
- Erişim: `ogulcan.ozdemir@boun.edu.tr`, `alp.kindiroglu@boun.edu.tr` adreslerine kullanım sözleşmesi
  (EULA) talebi. Aynı e-postada 744 kelimelik liste de istenmeli.

## 7. Sıradaki adımlar

1. `meb-yanit-videolari-indir.ps1` çalıştırılır (41 video, birkaç dakika).
2. Sayı pilotu: bir, iki, üç eğitilip **eğitimde görülmemiş kişide** ölçülür. Karar buna göre verilir.
3. Spreadthesign'dan 13 kelime (her biri 2 varyant) elle indirilir.
4. BosphorusSign22k e-postası gönderilir.

## 8. Teknik notlar (eğitim tarafı)

- **Sayılar hareketsiz:** Uygulamadaki hareket eşiği (0,12) sabit el biçimli işaretleri "yeterli hareket
  yok" diye reddedebilir. Soru tipine göre eşik ayarlanmalı.
- **Sağ/sol için aynalama kapatılmalı:** Eğitimdeki %30 ayna ve tahmindeki ayna ortalaması bu sınıfları
  bozar.
- **Tek kayıt = tek işaret:** "3 gün" iki turda alınmalı (önce sayı, sonra birim).
- **Soru bazlı bağlam:** Süre → sayılar + birimler, şiddet → 1–5, yer → bölge + yön. Aday listesi
  daraldığı için doğruluk 88 sınıflık serbest tahminden belirgin yüksek olur.
