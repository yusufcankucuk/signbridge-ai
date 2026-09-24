# Doktor sorularına kamerayla (işaret diliyle) yanıt

Hasta ilk şikâyetini kamerayla anlatıyordu; doktorun sorduğu dört soruya ise yalnız hazır
seçeneklerden yanıt verebiliyordu. `signbridge71-v1` sözlüğüyle bu dört soru da işaret diliyle
yanıtlanabiliyor.

## 1. Sözlük

| Küme | İşaret | Kaynak |
|---|---:|---|
| Mevcut 34 sınıf (20 AUTSL + 15 belirti) | 34 | AUTSL + MEB + harici TİD videoları |
| Sayılar `sayi-1…10`, `sayi-20`, `sayi-30` | 12 | MEB Sayılar tematik sözlüğü |
| Şiddet `az`, `hafif`, `cok`, `agir` | 4 | MEB Sıfatlar tematik sözlüğü |
| Yön `on`, `arka`, `yukari`, `asagi` | 4 | MEB Sıfatlar tematik sözlüğü |
| Vücut bölgeleri `bas` … `ayak` | 17 | MEB Vücudumuz tematik sözlüğü |
| **Toplam** | **71** | |

`evet`, `hayir`, `iyi`, `kotu` zaten AUTSL-20 içindedir (43 işaretleyici) ve yeniden eğitilmedi.

## 2. Soru bazlı bağlam

Kamera, doktorun sorduğu soru tipine göre **yalnız o sorunun adaylarından** seçer
(`labels.signbridge71.json` → `answerContexts`):

| Soru | Ekran | Aday sınıf | İçerik |
|---|---|---:|---|
| Süre / Zaman | `/patient/duration` | 12 | sayılar |
| Şiddet derecesi | `/patient/intensity` | 11 | 1–5 + az/hafif/çok/ağır/iyi/kötü |
| Yer / Bölge | `/patient/location` | 21 | 17 vücut bölgesi + 4 yön |
| İlaç kullanımı | `/patient/medication` | 3 | evet / hayır / ilaç |

Daraltma hem doğruluğu artırır hem de güven değerini anlamlı kılar: güven, **bağlamdaki adaylar
arasında** normalleştirilir, 71 sınıfın tamamına değil.

## 3. Akış

```
Doktor soruyu sorar → hasta ekranı → [İşaret diliyle yanıtla]  (birincil düğme)
   → kamera → kayıt → onay ekranı ("Doğru anladım mı?")
        ├─ doğru → doktora iletilir
        ├─ iki alternatif aday → hasta birini seçer
        └─ [Seçerek yanıtla] → hazır seçenek listesi (ikincil yol, hep açık)
```

**Süre iki parçalıdır.** Zaman birimi işaretlerinin (gün/hafta/ay/yıl) referans videosu henüz yok;
kamera sayıyı tanır, birim onay ekranındaki dört düğmeden seçilir ve doktora "3 gün" olarak gider.

**Düşük güvende de aday gösterilir.** Belirti ekranında olduğu gibi yanıt sorularında da eşik altı
tahmin "düşük güvenli öneri" etiketiyle onay ekranına düşer; hasta onaylar, alternatifi seçer veya
listeye geçer.

## 4. Ölçüm

**Eğitimde görülmemiş kişi (Spreadthesign, 5 sayı klibi, 15 görünüm, 12 aday arasından):**

| | İlk öneri | İlk 3 öneri |
|---|---:|---:|
| Sayılar | 6/15 (%40) | **12/15 (%80)** |

Sayılar en zor kategoridir (yalnız el biçimi, konum ve hareket yok). Vücut bölgeleri ve onay/ret
işaretleri için eğitimde görülmemiş kişi videomuz yok; bu kategoriler **ölçülmedi**, varsayılmadı.

**Sınıf merkezi (prototip) skorlaması yanıt sınıflarında kullanılmaz.** Sayılarda ölçüldü:
6/15 → 3/15'e düşürüyor. Sebebi, prototipin birden çok işaretleyicinin ortalaması olduğunda
kazandırması; yanıt sınıflarında kelime başına tek MEB videosu var. Belirti bağlamında açık kalır.

**Uçtan uca canlı deneme (sahte kamera, MEB klipleri — eğitimdeki kişi):** dört sorunun ikişer
klibi, 8/8 doğru, sayfa hatası yok.

**Gerileme kontrolü:** AUTSL-20 testi %92,14 → %93,40; MEB tarayıcı probu %90,5.
**Belirti tanıma:** görülmemiş kişilerde 211/282 — 34 sınıflık modelle birebir aynı. Kodlayıcı
donmuş olarak alındığı (yalnız çıkış katmanı eğitildiği) için sözlük büyümesi belirtileri etkilemez.

## 5. Eksikler

- **Zaman birimleri, sağ/sol, orta, kalça, bilmiyorum, bazen, şiddetli, dayanılmaz** — MEB tematik
  sözlüklerinde yok; referans videosu bulunana kadar ekrandan seçilir.
- **Yeni 37 sınıfın avatarı yok.** Onay ekranı bu sınıflarda metin gösterir.
- **Kelime başına tek işaretleyici.** Belirti sınıflarındaki zayıflığın aynısı; BosphorusSign22k
  (6 işaretleyici) erişimi bu tabloyu topluca değiştirir.
