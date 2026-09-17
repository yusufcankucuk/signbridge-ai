# `signbridge-unified34-bigru-v0.3.1` ekip içi sürüm raporu (2026-09-16)

v0.3.0 ile aynı sözlük (`signbridge34-v1`) ve özellik düzeni (`xy-mask-138+handlocal-84`). Fark yalnız
eğitim verisi ve en iyi model seçimi kuralıdır.

> Ekip içi deneme modelidir. Sözlük sitelerinin videoları açık lisanslı olmadığından GitHub Release'e
> konmaz; varsayılan kurulum v0.3.0'dır. Tıbbi tanı koymaz, her sonuç hasta onayı ister.

## 1. Eklenen veri

| Kaynak | Klip | Avatarlar | Not |
|---|---:|---|---|
| Spreadthesign (TİD sayfaları) | 15 | ağrı 2, kalp krizi 2, nefes 3, döküntü, astım, çarpıntı, kanama, kusma, karın ağrısı*, bulantı, yanık | En az 7 işaretleyici; 320×240 → 640×480 |
| Güncel TİD Sözlüğü (Aile ve Sosyal Hizmetler Bakanlığı) | 11 | ağrı 6, döküntü 3, bulantı, kusma | Birkaç işaretleyici; 162×108 → 720×480 |

\* Spreadthesign'da "karın ağrısı" yok; "mide ağrısı" kullanıldı. "Ateş" olarak indirilen sözlük videosu
yangın anlamındaki işaret olduğu için (yanıkla karışır) kullanılmadı; aynı içerikli iki indirme
(kaşıntı = alerji) SHA-256 ile ayıklandı. Toplam gerçek kaynak: 13 (MEB dahil), 90 video, 360 görünüm;
252 sentetik örnek (karın ağrısı 144, bulantı 108).

## 2. Eğitim değişikliği

İlk denemede AUTSL doğrulama kaybının gürültüsü nedeniyle ince ayar 8–9 epoch'ta durdu ve sağlık sınıfları
eksik öğrenildi (MEB referans doğruluğu %87–93, MEB tarayıcı probu %46–53). `--min-finetune-epochs`
(varsayılan 15) eklendi: erken durdurma ve en iyi model seçimi bu epoch'tan önce yapılmaz.
Yeniden eğitimde üç tohumun hepsi 23–30 epoch sürdü.

| Tohum | AUTSL doğrulama | AUTSL test | Fark | MEB referans | MEB tarayıcı probu |
|---:|---:|---:|---:|---:|---:|
| 42 | %82,54 | %85,85 | +0,63 yp | %100 | %71,6 |
| 123 | %83,33 | %84,91 | −0,31 yp | %100 | %80,0 |
| **2026** (seçilen) | %83,60 | **%86,48** | **+1,26 yp** | %100 | %75,8 |

`seker` örneklerinin belirti bağlamında `diabetes` seçilmesi: %100.

## 3. Farklı kişilerde ölçüm

Eğitimde hiç görülmeyen kaynaklar (tek tohum, 15 belirti arasında; şans düzeyi %6,7):

| Dışarıda bırakılan | v0.3.0 verisi | + Spreadthesign | + Spreadthesign + TİD Sözlüğü + yeni seçim kuralı |
|---|---:|---:|---:|
| Emrah Üresin (48 görünüm) | %52,1 | **%58,3** | – |
| Serpil Avcı + Filiz Çağlar + sözlük 2. kişi (68 görünüm) | %48,5 | %50,0 | **%55,9** |

Yeni kaynakların eklenmeden önceki durumu (v0.3.0 hiç görmedi):

- Spreadthesign işaretleyicileri: %51,7 (60 görünüm); karın ağrısı 0/4, bulantı 0/4, çarpıntı 0/4, kalp krizi 1/8.
- TİD Sözlüğü işaretleyicileri: %54,5 (44 görünüm); döküntü/alerji 0/12.

Sürekli karışanlar: baş ağrısı → baş dönmesi, genel ağrı → karın ağrısı, kusma → döküntü (Filiz Çağlar),
ateş → baş dönmesi (Emrah Üresin'in yalnız alna dokunan biçimi).

## 4. Canlı akış (tarayıcı + sahte kamera, v0.3.1)

- MEB videoları (11 işaret × 2): **20/22** (v0.3.0: 17/22).
- Eğitimdeki diğer kişilerden seçilen klipler (baş ağrısı, baş dönmesi, ateş, şeker): 8/8.
- Sözlük klipleri: yanıt verilen 15 denemenin 9'u doğru; 9 deneme "eller yeterince görünmedi" ile reddedildi.
  Bu klipler 1,5–3 saniyelik ve çoğu karede eller aşağıda olduğundan döngüsel tekrar kalite kapısına takılıyor;
  gerçek kullanıcıda işaret kayıt süresinin çoğunu kapladığında bu durum beklenmez.

Bu klipler eğitim verisindedir; kişi bağımsız başarı için 3. bölümdeki sayılar esas alınmalıdır.

## 5. Kullanım

```powershell
# ai-training/outputs/unified34-v0.3.1 klasörü ekipten alınır (Release'te yoktur)
Copy-Item .env.unified34-team.example .env
docker compose up --build -d
```

Karar politikası: `configs/decision_policy.unified34-v0.3.1-team-camera.json` (eşik ve sınıflar v0.3.0 ile aynı).
