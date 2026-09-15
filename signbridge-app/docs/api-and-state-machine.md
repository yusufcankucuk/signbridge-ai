# SignBridge Tek Cihazlı MVP: API ve Durum Modeli (State Machine) Dokümantasyonu

Bu belge, SignBridge projesinin "Tek Cihazlı MVP" sürümü için API ve Durum Modeli (State Machine) kurallarını içermektedir.

## 1. Mimari Özeti

* **Altyapı:** Arka plan (backend) mimarisi olarak Next.js App Router kullanılmıştır.
* **Veritabanı:** Veritabanı olarak Supabase bağlanmıştır. Görüşme tablolarında RLS açıktır; istemci rollerinin doğrudan erişimi kaldırılmış, geçişler yalnız sunucu tarafındaki service-role üzerinden yapılmıştır.
* **Güvenlik ve Mahremiyet Kuralı:** Görüşme bittiğinde hastaya ait tüm teşhis ve onay verileri (`interaction_events` tablosundaki kayıtlar) veritabanından tamamen silinerek mahremiyet sağlanır.

## 2. Durum Modeli (State Machine) Akışı

Oturumlar sırasında uygulama aşağıdaki kurallara göre belirli durumlar (state) arasında geçiş yapar:

| Durum (Mevcut) | Açıklama | Sonraki İzin Verilen Geçişler (Next State) |
| :--- | :--- | :--- |
| `idle` | Görüşme başlamadan önceki bekleme anı. | `patient_capture` |
| `patient_capture` | Hasta kamerada işaret diliyle derdini anlatıyor. | `patient_confirmation`, `ended` |
| `patient_confirmation` | AI tahmini ekranda gösterilir, hasta onay/ret verir. | `doctor_review`, `patient_capture`, `ended` |
| `doctor_review` | Cihaz doktora geçer, doktor şikayeti okur veya yeni soru sorar. | `patient_question`, `patient_response` *(uyumluluk)*, `doctor_response`, `ended` |
| `patient_question` | Doktor sorusu kaydedildi; cihaz hastaya devredilir. | `patient_answer`, `doctor_review`, `ended` |
| `patient_answer` | Hasta doktorun sorusunu manuel veya kamerayla yanıtlar. | `patient_answer_confirmation`, `doctor_review`, `ended` |
| `patient_answer_confirmation` | Kamerayla verilen hasta yanıtı onaylanır veya yeniden denenir. | `doctor_review`, `patient_answer`, `ended` |
| `patient_response` | Eski `/questions` ve `/answers` istemcileri için korunan uyumluluk durumu. | `doctor_review`, `ended` |
| `doctor_response` | Doktor sesli/yazılı yanıtını sisteme girer. | `patient_review`, `ended` |
| `patient_review` | Cihaz hastaya geri döner, doktorun yanıtı okunur. | `patient_capture`, `ended` |
| `ended` | Görüşme tamamlanıp veriler temizlendi. | *(Geçiş yapılamaz)* |

**Not:** `patient_confirmation` adımında hasta onay vermeden `doctor_review` durumuna geçiş API tarafından **409 hatası** ile engellenir.

## 3. Kapsamlı Test Rehberi

### Yöntem 1: Postman / cURL ile Uçtan Uca API Testi

Tüm API istekleri **POST** metodu ile yapılmalı ve oturum akışına uygun olarak sırayla şu adreslere atılmalıdır:

* **Adım 1:** `/api/consultations`
  * *Body:* (Boş)
  * *Açıklama:* Yeni bir oturum başlatır ve dönen yanıttan oturum `id` değeri alınır.
* **Adım 2:** `/api/consultations/[id]/prediction`
  * *Body (JSON):* `landmarks: number[60][46][2]`, `mask: number[60][46]` ve `preprocessingVersion: "landmark46-v1"`.
  * *Açıklama:* Next.js backend seçili gerçek AI provider'ını çağırır, doğrulanan model sonucunu kaydeder ve oturumu `patient_confirmation` durumuna geçirir. İstemciden hazır mock/tahmin sonucu kabul edilmez.
* **Adım 3:** `/api/consultations/[id]/confirm`
  * *Body (JSON):* `{ "confirmed": true }`
  * *Açıklama:* Hasta tahmini onaylar ve durum doktora (`doctor_review`) geçer.
* **Adım 4:** `/api/consultations/[id]/doctor-response`
  * *Body (JSON):* `{ "transcript": "Günde 2 kez ağrı kesici alın.", "source": "speech", "edited": false }`
  * *Açıklama:* Doktorun hastaya cevabı sisteme girilir.
* **Adım 5:** `/api/consultations/[id]/end`
  * *Body:* (Boş)
  * *Açıklama:* Oturum sonlandırılır ve hastanın tüm hassas verileri temizlenir.

Doktor değerlendirmesinden önce soru-cevap turu yapılacaksa `doctor_review` durumunda şu iki istek sırayla tekrarlanabilir:

* **Soru:** `/api/consultations/[id]/questions`
  * *Body (JSON):* `{ "questionId": "<uuid>", "kind": "duration", "text": "Ne kadar süredir var?" }`
  * *Açıklama:* Soruyu kaydeder ve durumu `patient_response` yapar. Desteklenen türler `duration`, `intensity`, `location`, `medication` ve `custom` değerleridir.
* **Yanıt:** `/api/consultations/[id]/answers`
  * *Body (JSON):* `{ "questionId": "<aynı uuid>", "answer": "Birkaç gün", "source": "manual" }`
  * *Açıklama:* Hasta yanıtını kaydeder ve durumu yeniden `doctor_review` yapar. Yanıt alınmadan yeni soru gönderilmesi `409` ile reddedilir.
* **Soru iptali:** `DELETE /api/consultations/[id]/questions`
  * *Body (JSON):* `{ "questionId": "<bekleyen soru uuid>" }`
  * *Açıklama:* Bekleyen soruyu iptal eder ve durumu `doctor_review` yapar. Başka bir sorunun kimliğiyle yanıt veya iptal gönderilemez.

Doktor yanıtından sonra görüşmeye devam edilecekse bitirme yerine:

* **Yeni tur:** `/api/consultations/[id]/next`
  * *Body:* (Boş)
  * *Açıklama:* Yalnız `patient_review` durumundan `patient_capture` durumuna geçerek yeni iletişim turunu başlatır.

Doktorun aynı görüşmede sınırsız sayıda soru sorabilmesi için her turda aşağıdaki yol kullanılır:

1. `POST /api/consultations/[id]/question` — `{ "questionId": "uuid", "kind": "duration", "text": "Ne zamandır devam ediyor?" }`
2. `POST /api/consultations/[id]/next` — cihaz hastaya verilir ve durum `patient_answer` olur.
3. Manuel yanıt için `POST /api/consultations/[id]/patient-answer` — `{ "questionId": "uuid", "answer": "İki gündür", "source": "manual" }`.
4. Kamera yanıtı için mevcut `prediction` ve ardından `confirm` uçları kullanılır. Ara durum `patient_answer_confirmation`, başarılı son durum `doctor_review` olur.
5. Bekleyen soru iptal edilirse `POST /api/consultations/[id]/question/cancel` kullanılır.

Sunucu başarılı yanıt vermeden arayüzde bekleyen soru veya tamamlanmış yanıt eklenmez. Yanlış durum, yinelenen yanıt ve eşzamanlı iki gönderimden kaybeden istek `409` döndürür. Supabase kurulumu için `infrastructure/database/migrations/20260914_question_answer_states.sql` bir kez uygulanmalıdır.

Tekrarlanabilir tam tur testi `npm run test:e2e-session` komutuyla çalıştırılır. Ayrıntılı kanıt ve gerçek local FastAPI doğrulaması `docs/session-flow-e2e.md` belgesindedir.

### Yöntem 2: Backend Durum Makinesi Mantık Testi

Sadece `stateMachine` mantığının doğru çalışıp çalışmadığını izole olarak test etmek için kök dizindeki `test-state.ts` dosyasının içeriğini çalıştırabilirsiniz:

```typescript
import { SessionManager } from '../lib/stateMachine';

const testSession = SessionManager.createSession('test-123');
console.log('1. Başlangıç Durumu:', testSession.state); // Beklenen: idle

// Geçerli bir geçiş testi
const canGoToCapture = SessionManager.canTransition('idle', 'patient_capture');
console.log('2. idle -> patient_capture geçiş izni:', canGoToCapture); // Beklenen: true

// Geçersiz bir geçiş testi (Onay almadan doktora geçmeye çalışma)
const canSkipToDoctor = SessionManager.canTransition('patient_capture', 'doctor_review');
console.log('3. Onay atlayıp doktora geçiş izni:', canSkipToDoctor); // Beklenen: false

// Oturumu temizleme testi
const isEnded = SessionManager.endSession('test-123');
console.log('4. Oturum temizlendi mi?:', isEnded); // Beklenen: true
```
