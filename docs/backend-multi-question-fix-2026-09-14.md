# Backend çoklu soru akışı düzeltme raporu — 14 Eylül 2026

## Sorun

Manuel uçtan uca testte ilk doktor sorusu tamamlandıktan sonra ikinci hazır soru ve özel soru gönderilemiyordu. İstemci her soru için final doktor yanıtı endpoint'ini çağırıp yeni şikâyet turu başlatıyordu. Backend bu nedenle ilk yanıt sonrasında `patient_capture` durumunda kalıyor, sonraki doktor sorusunu `409 Geçersiz durum geçişi` ile reddediyordu.

## Uygulanan backend çözümü

- Soru-cevap için açık durum döngüsü eklendi: `doctor_review → patient_response → doctor_review`.
- `doctor_question` ve `patient_answer` olay tipleri ortak TypeScript ve PostgreSQL sözleşmesine eklendi.
- `POST /api/consultations/[id]/questions` ve `POST /api/consultations/[id]/answers` endpoint'leri eklendi.
- İki endpoint'te gövde boyutu, izin verilen alanlar, UUID, enum ve metin uzunluğu doğrulaması uygulandı.
- Yanıt beklenirken ikinci soru kontrollü `409` üretir. Store yarışında state değişmişse yine `409` döner.
- Yanıt ve soru iptali, oturumdaki en son bekleyen `questionId` ile eşleştirilir; başka soru kimliği `409` üretir.
- “Soruyu iptal et” işlemi backend'i tekrar `doctor_review` durumuna getirir ve çıkmaz state oluşmasını engeller.
- Her soru ve yanıt yalnız URL'deki oturuma, atomik `advance_consultation` çağrısı üzerinden yazılır.
- Oturum bitişindeki mevcut silme davranışı korunur; olaylar ve oturum satırı temizlenir.
- İstemcide hazır/özel yazılı yanıt yolları yeni API sözleşmesine bağlandı. Backend kaydı başarısızsa cihaz devri yapılmaz.

## Supabase güncellemesi

Yeni kurulumlar güncel `infrastructure/database/schema.sql` dosyasını kullanır. Mevcut Supabase ortamında bir kez `infrastructure/database/multi-question-migration.sql` çalıştırılmalıdır. Migration, eski kurulumdaki kolon enum ise enum değerlerini; kolon metin ise CHECK constraint'lerini günceller. Tablo verisini silmez.

## Otomatik test kanıtı

`npm run test:e2e-session` gerçek Next.js production HTTP sunucusu ve kontrollü Supabase REST test sunucusuyla çalıştırıldı.

| Senaryo | Beklenen | Sonuç |
|---|---|---|
| Manuel şikâyet onayı | `doctor_review` | PASS |
| İlk hazır soru + yanıt | `patient_response → doctor_review` | PASS |
| Yanıt öncesi ikinci soru | `409` | PASS |
| Yanlış soru kimliğiyle yanıt/iptal | `409` | PASS |
| Doğru soru kimliğiyle iptal | `doctor_review` | PASS |
| İkinci hazır soru + yanıt | `patient_response → doctor_review` | PASS |
| Özel soru + yanıt | `patient_response → doctor_review` | PASS |
| Final doktor değerlendirmesi | `patient_review` | PASS |
| Oturum bitişi | Oturum ve olay sayısı `0` | PASS |
| İkinci oturum izolasyonu | Durumu ve olayları değişmez | PASS |
| Sağlık metni/gizli anahtar log taraması | Loglarda bulunmaz | PASS |

Test özeti: **3 test, 3 geçti, 0 kaldı**. Üretim build'i de başarıyla tamamlandı ve yeni `/questions` ile `/answers` rotaları build çıktısında doğrulandı.

Son doğrulama komutları:

| Komut | Sonuç |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `npm run test:frontend` | 15/15 PASS |
| `npm run test:security` | Demo servis 4/4, provider 10/10, E2E 3/3 PASS; 61 istemci bundle dosyasında secret bulunmadı |

## Kapsam sınırı

Bu düzeltme, Jira testinde hata veren hazır ve özel yazılı soru-cevap turlarını kapsar. Eğitilmiş model dosyası olmadığı ve fiziksel işaret testi yapılamadığı için doktor sorusuna kamera/AI ile cevap verme yolu bu raporda gerçek modelle doğrulanmış sayılmaz. Model ve fiziksel işaret doğrulaması AI ekibinin çıktısı geldikten sonra ayrıca yapılmalıdır.
