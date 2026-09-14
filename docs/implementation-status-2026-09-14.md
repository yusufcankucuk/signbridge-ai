# SignBridge uygulama durumu — 14 Eylül 2026

Bu belge, AI iyileştirme planındaki maddelerin kodla tamamlanan, insan testi bekleyen ve dış erişim bekleyen kısımlarını ayırır. Yüzdeler yalnız mevcut veri seti ölçümlerini ifade eder; klinik yeterlilik iddiası değildir.

## Tamamlanan ve yerel olarak doğrulananlar

- Gerçek tarayıcı kamerası `getUserMedia` ile açılır; ham video varsayılan olarak kaydedilmez veya sunucuya gönderilmez.
- MediaPipe Holistic modeli ve WebAssembly dosyaları uygulama içinde sürümlü, yerel statik varlıklar olarak sunulur.
- Tarayıcıda 33 poz, 21 sol el ve 21 sağ el noktası çıkarılır; eğitim hattıyla aynı 46 nokta seçilir.
- Omuz merkezleme/ölçekleme, 60 zaman adımına yeniden örnekleme ve mask üretimi tarayıcı tarafında uygulanır.
- Kalite kontrolü başarısızsa model çağrılmaz; kısa kayıt, görünmeyen omuz/el ve geçersiz sayılar reddedilir.
- Kabul edilen AI sonucu doğrudan kesin ifade sayılmaz; hasta onayı zorunludur.
- Görüşme durum makinesi, bellek içi yerel depo ve isteğe bağlı sunucu tarafı Supabase deposuyla çalışır.
- Supabase service-role anahtarı tarayıcı paketine verilmez. Yerel demo için Supabase zorunlu değildir.
- Logo, MediaPipe modeli ve PWA manifesti Docker üretim imajına eklenmiştir.
- `/api/health` süreç sağlığını, `/api/ready` ise oturum deposu hazırlığını bildirir.
- Girdi sözleşmesi, kamera akışı, gizlilik sınırı ve Docker/Docker'sız başlangıç belgelenmiştir.

## Plan gereği henüz tamamlandı sayılamayanlar

- Birinci katılımcıyla 25 geliştirme kamera denemesi yapılmadı.
- Ayarlara katılmayan ikinci katılımcıyla 25 holdout kamera denemesi yapılmadı.
- Gerçek kamera denemelerine ait kabul doğruluğu, kapsama ve p95 gecikme hedefleri ölçülmedi.
- Dondurulmuş yeni OOD kontrolü fiziksel kamera akışıyla tamamlanmadı.
- Huawei hesabı, OBS yetkisi ve ModelArts kaynağı olmadığı için gerçek bulut eğitim/deployment kanıtı üretilmedi.

Bu maddeler kod eksikliği değil; kamera izni, doğru işaret uygulayabilen katılımcılar veya dış bulut erişimi gerektiren doğrulama çalışmalarıdır. Sonuçlar ölçülmeden “kamera ortamında %90 başarı” veya “ModelArts'ta çalıştırıldı” ifadesi kullanılmamalıdır.

## Sonraki doğrulama sırası

1. Uygulamayı `http://localhost:3000` üzerinden açıp kamera iznini kullanıcı olarak verin.
2. Beş sınıf için bir geliştirme katılımcısıyla 25 deneme kaydedin.
3. Bulgulara göre yalnız önceden tanımlanmış geliştirme kararlarını uygulayın ve politikayı dondurun.
4. İkinci katılımcıyla 25 holdout denemesini ayar değiştirmeden tamamlayın.
5. Kabul doğruluğu, kapsama, OOD yanlış kabul ve p50/p95 gecikmeyi pay/payda ile raporlayın.
6. Bulut erişimi açılırsa yerel olarak doğrulanmış ModelArts paketini önce kısa smoke test ile çalıştırın.

## Güvenlik notu

`NEXT_PUBLIC_` ile başlayan değişkenler tarayıcı paketine girer. Supabase service-role anahtarı yalnız `SUPABASE_SERVICE_ROLE_KEY` adıyla sunucu ortamında tutulmalıdır. Paylaşılan anon anahtar, service-role anahtarı değildir ve mevcut sunucu veri katmanında onun yerine kullanılmaz.
