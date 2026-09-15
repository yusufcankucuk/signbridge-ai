# SignBridge final stabilizasyon durumu — 15 Eylül 2026

## Tamamlanan mühendislik işleri

- Model Release manifesti, çevrim içi/çevrimdışı kurucu ve SHA-256 ön kontrolü eklendi.
- `manual_only`, deneysel `team_camera` ve yayınlanmış `camera_ai` çalışma biçimleri ayrıldı.
- Ekip kamera politikası beş sınıf ve `0,95` skor eşiğiyle sürümlendi.
- Kamera ekranına deneysel kullanım ve hasta onayı uyarısı eklendi.
- Doktor ekranındaki “Son yanıt” geçmiş sayfasından ayrıldı ve daima son turu gösterir.
- Hasta özetine onaylanan şikâyet ile bütün doktor soru/hasta yanıt turları eklendi.
- Geçmiş kontrol tarihi hem istemci hem API tarafında reddedilir; özette yıl gösterilir.
- Tedavi planı API ve olay kaydıyla sunucuda saklanır; kayıt başarısızsa hasta ekranına geçilmez.
- Güvenli görüşme snapshot adresi eklendi ve sayfa yenilemesinde istemci durumu sunucuyla uzlaştırılır.
- Kamera/manuel fallback bekleyen soruya göre doğru hasta ekranına yönlenir.
- Görüşme bitirme isteği başarılı olmadan yerel durum temizlenmez; hata tekrar denemeye izin verir.
- Supabase şeması ve bellek deposu `treatment_plan` olayıyla aynı davranışa getirildi.
- Docker web önbelleği yazma izinleri düzeltildi; model yokken manuel mod sağlıklı kalır.

## Doğrulanan kontroller

- Model arşivi gerçek ZIP üzerinden temiz dizine kuruldu ve iç dosya hash'leri doğrulandı.
- Yanlış arşiv hash'i kurulum başlamadan reddedildi.
- AI birim/sözleşme testleri, frontend/landmark testleri, API sağlayıcı testleri, çoklu soru ve
  tedavi planı uçtan uca testleri geçti.
- TypeScript tip kontrolü, lint ve istemci bundle gizli anahtar taraması geçti.

## İnsan/harici işlem bekleyen kapılar

- GitHub `model-autsl20-v0.1.0` Release varlığının yayınlanması.
- İki farklı katılımcıyla 25 geliştirme + 25 holdout ve 10+10 statik kamera denemesi.
- Dondurulmuş OOD kontrolü ve p95 gecikme ölçümü.
- Üç ekip üyesinin temiz klon testi; en az iki farklı işletim sistemi.
- Bu ölçümler geçerse deneysel olmayan final karar politikası ve `camera_ai` yayın kararı.

Bu kapılar tamamlanana kadar resmi demo kararı **KOŞULLU HAZIR — MANUEL DEMO** olarak kalır.
