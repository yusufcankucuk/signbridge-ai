# SignBridge uygulama ve teslim durumu — 14 Eylül 2026

Bu belge, güvenli demo planının kodla tamamlanan, gerçek tarayıcıda doğrulanan ve insan/dış erişim bekleyen bölümlerini ayırır. Yüzdeler yalnız mevcut veri seti ölçümleridir; klinik yeterlilik iddiası değildir.

## Teslim kararı

**KOŞULLU HAZIR — MANUEL DEMO**

Kritik görüşme akışı ve manuel kullanım çalışmaktadır. Mevcut modelin dondurulmuş OOD yanlış kabul oranı %31,63 ile %20 hedefini aşmıştır. Bu nedenle karar politikası `enabled=false` durumundadır; kamera AI sonucu kullanıcıya gösterilmez ve kullanıcı anlaşılır bir mesajla manuel seçime yönlendirilir.

## Tamamlanan ve doğrulananlar

### Çoklu soru-cevap ve oturum güvenliği

- Doktor soruları `doctor_question`, manuel hasta yanıtları `patient_answer` olayları olarak saklanır.
- Hazır ve özel sorular aynı görüşmede tekrar tekrar sorulabilir.
- Manuel yanıt ve kamera yanıtı ayrı durum geçişleri kullanır.
- Sunucu başarılı olmadan yerel soru/yanıt listesi değiştirilmez.
- Yinelenen veya eşzamanlı geçersiz geçişlerden biri `409` ile reddedilir.
- Bellek ve Supabase depoları aynı durum makinesini kullanır.

### Kamera kalite kapısı ve karar politikası

- Omuz merkezine/mesafesine göre normalize edilmiş el hareketinden `motionScore` hesaplanır.
- Statik el, küçük kamera titreşimi ve yetersiz hareket `insufficient_motion` ile reddedilir.
- Hareket eşiğini geliştirme kayıtlarından seçen ve hedef sağlanmazsa AI'ı kapalı bırakan kalibrasyon aracı vardır.
- Demo izin listesi `doktor`, `hasta`, `evet`, `hayir`, `ilac` sınıflarıyla sınırlıdır.
- `policy_disabled` ve `unsupported_class` retleri sözleşmeye eklenmiştir.
- Kabul edilen model önerilerinde hasta onayı zorunludur.

### Güvenli manuel çalışma ve Docker

- Model dosyaları yokken `ALLOW_MANUAL_ONLY=true` ile web uygulaması çalışabilir.
- Modelli başlangıçta gerekli dosyaları ve SHA-256 değerlerini doğrulayan platform bağımsız ön kontrol aracı vardır.
- Eksik model durumunda anlaşılır dosya listesi ve kurulum komutu gösterilir.
- Docker web önbelleği yazma izinleri düzenlenmiştir.
- Web ve AI konteynerleri `healthy` durumunda doğrulanmıştır.
- Next.js görüntü önbelleği gerçek istekle oluşturulmuş ve loglarda `.next/cache/images` izin hatası bulunmadığı doğrulanmıştır.
- `/api/health`, `/api/ready` ve `/api/ai/status` başarıyla yanıt vermektedir.

### Gerçek tarayıcı doğrulaması

Yerel Docker kurulumu üzerinden gerçek tarayıcıda şu akış tamamlanmıştır:

1. Yeni görüşme başlatıldı.
2. Kamera AI kapalıyken kamera izni istenmeden manuel seçime yönlendirildi.
3. Hasta şikâyeti seçildi ve onaylandı.
4. Aynı oturumda iki hazır soru ve bir özel soru soruldu.
5. Üç manuel hasta yanıtı doktor ekranında korundu.
6. İlaçsız tedavi, açıklama ve kontrol adımları tamamlandı.
7. Hasta özeti görüntülendi ve yazdırma işlemi tetiklendi.
8. Görüşme sonlandırıldı; eski `/camera` adresine doğrudan erişimde yeni oturum gerektirdiği doğrulandı.
9. Tarayıcı konsolunda akışı engelleyen hata görülmedi.

Yazdırma CSS'i A4 taşma/kesilme kontrolleri için güncellenmiştir. İşletim sisteminin yerel yazdırma penceresinde Chrome ve Edge'e özgü son görsel onay, ekip manuel testinde ayrıca işaretlenecektir.

### Otomatik doğrulama özeti

- Python AI testleri: 52 geçti.
- Frontend birim testleri: 17 geçti.
- Demo servis testleri: 4 geçti.
- AI sağlayıcı testleri: 10 geçti.
- Uçtan uca oturum testleri: 4 geçti.
- Toplam: **87 test geçti**.
- Lint, TypeScript kontrolü, üretim build'i ve istemci sırrı taraması geçti.
- `git diff --check` içerik hatası bulmadı; gösterilen LF/CRLF satır sonu mesajları Windows Git uyarısıdır.

## Henüz tamamlandı sayılamayanlar

- Birinci katılımcıyla 25 geliştirme kamera denemesi yapılmadı.
- Ayarlara katılmayan ikinci katılımcıyla 25 holdout kamera denemesi yapılmadı.
- Gerçek kamera kabul doğruluğu, kapsama ve kayıt sonrası p50/p95 gecikme hedefleri ölçülmedi.
- Dondurulmuş OOD sonucu %20 yayın hedefini karşılamadı; mevcut güvenli politika bu nedenle kapalıdır.
- Supabase kullanılıyorsa `infrastructure/database/migrations/20260914_question_answer_states.sql` yetkili ortamda uygulanmalıdır. Yerel bellek modunda buna gerek yoktur.
- Huawei Cloud/OBS/ModelArts erişimi olmadığı için gerçek bulut eğitim veya deployment kanıtı yoktur.

Bu maddeler ölçülmeden “kamera ortamında %90 başarı”, “kamera AI hazır” veya “ModelArts'ta çalıştırıldı” denmemelidir.

## Ekip için son doğrulama sırası

1. Manuel güvenli modda Chrome ve Edge ile `signbridge-app/docs/manual-end-to-end-test.md` belgesindeki akışı uygulayın.
2. Her tarayıcıda yazdırma önizlemesinde taşma, kesilme ve gereksiz düğme olmadığını işaretleyin.
3. Supabase kullanılacaksa migration'ı uygulayıp aynı çoklu soru testlerini Supabase modunda tekrarlayın.
4. İşaretleri doğru uygulayabilen bir kişiyle 25 development kaydı oluşturun ve hareket eşiğini yalnız bu grupta seçin.
5. Politikayı dondurduktan sonra farklı bir kişiyle 25 holdout kaydını ayar değiştirmeden tamamlayın.
6. Kabul doğruluğu, kapsama, OOD yanlış kabul ve p50/p95 değerlerini pay/payda ile raporlayın.
7. Üç AI hedefi birlikte sağlanmadıkça `enabled=false` değerini değiştirmeyin.

## Güvenlik notu

`NEXT_PUBLIC_` ile başlayan değişkenler tarayıcı paketine girer. Supabase service-role anahtarı yalnız `SUPABASE_SERVICE_ROLE_KEY` adıyla sunucu ortamında tutulmalıdır. Anon anahtar service-role anahtarının yerine kullanılmaz. Ham kamera görüntüsü varsayılan olarak diske veya loglara yazılmaz.
