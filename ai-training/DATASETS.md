# Veri kaynakları ve kullanım kararı

## AUTSL/OpenHands poz verisi

- Kaynak açıklaması: [Ankara Üniversitesi CVML veri setleri](https://cvml.ankara.edu.tr/datasets/)
- Atıf: O. M. Sincan ve H. Y. Keles, “AUTSL: A Large Scale Multi-modal Turkish Sign Language Dataset and Baseline Methods”
- Bu projedeki rolü: 20 izole TİD sınıfının gerçek model eğitim, doğrulama ve testi
- Kullanım: akademik/ticari olmayan öğrenci MVP'si
- Depolama: ham PKL ve dönüştürülmüş NPZ dosyaları Git'e eklenmez

AUTSL'nin resmî train/validation/test ayrımı korunur. Bölümlerdeki işaretçiler farklıdır; aynı kişinin görüntüleri hem eğitimde hem testte bulunmaz. Bu nedenle ölçüm, kişiyi ezberlemekten çok yeni kişiye genellemeyi sınar.

## MEB Sağlık Tematik Sözlüğü

- Kaynak: [MEB Sağlık Tematik Sözlükleri](https://orgm.meb.gov.tr/icdep/saglik-tematik-sozlukleri-107)
- Bu projedeki rolü: sağlık terimi kataloğu, resmî görsel referans ve 12 terimlik manuel seçim menüsü
- Eğitim durumu: AUTSL-20 modelinde `reference_only`; deneysel `signbridge30-v1` birleşik modelinde
  11 video (`manifests/meb_health11_training.csv`) tek referans ve artırımla eğitime girer
- Lisans: sayfada makine öğrenmesi eğitimi veya model ağırlığı dağıtımı için açık izin görülmedi;
  birleşik model ağırlıkları izin doğrulanana kadar yayımlanmaz
- Depolama: videolar Git'e eklenmez; yalnızca kaynak/etiket manifesti tutulur

Her terim için yalnızca bir resmî örnek bulunması, modelin farklı kişiler ve ortamlar üzerinde öğrenmesi için yeterli değildir. Bu nedenle MEB videolarının çoğaltılmış kopyaları bağımsız gerçek veri sayılmaz ve AUTSL test ölçümüne karıştırılmaz. İleride farklı gönüllülerden açık rıza ile çoklu çekim toplanırsa ayrı bir sürüm ve kişi bazlı ayrım ile eğitime alınabilir.

## İzlenebilirlik

- `configs/labels.autsl20.json`: model sınıfları ve AUTSL sınıf numaraları
- `configs/labels.meb16.json`: MEB kaynak dosyaları, manuel seçim ve risk bayrakları
- `manifests/*.csv`: örnek düzeyinde kaynak, işaretçi, bölüm ve kalite bilgisi
- `manifests/*summary.json`: dönüşüm sayıları ve kalite sonuçları

Veri setlerinin güncel lisans/erişim koşulları her yarışma tesliminden önce kaynak sayfalarından yeniden doğrulanmalıdır.
