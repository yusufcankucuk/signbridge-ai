# SignBridge Tek Cihazlı MVP: API ve Durum Modeli (State Machine) Dokümantasyonu

Bu belge, SignBridge projesinin "Tek Cihazlı MVP" sürümü için API ve Durum Modeli (State Machine) kurallarını içermektedir.

## 1. Mimari Özeti

* **Altyapı:** Arka plan (backend) mimarisi olarak Next.js App Router kullanılmıştır.
* **Veritabanı:** Veritabanı olarak Supabase bağlanmıştır (MVP aşamasında hızlı prototipleme yapılabilmesi için Row Level Security - RLS özellikleri kapalı tutulmuştur).
* **Güvenlik ve Mahremiyet Kuralı:** Görüşme bittiğinde hastaya ait tüm teşhis ve onay verileri (`interaction_events` tablosundaki kayıtlar) veritabanından tamamen silinerek mahremiyet sağlanır.

## 2. Durum Modeli (State Machine) Akışı

Oturumlar sırasında uygulama aşağıdaki kurallara göre belirli durumlar (state) arasında geçiş yapar:

| Durum (Mevcut) | Açıklama | Sonraki İzin Verilen Geçişler (Next State) |
| :--- | :--- | :--- |
| `idle` | Görüşme başlamadan önceki bekleme anı. | `patient_capture` |
| `patient_capture` | Hasta kamerada işaret diliyle derdini anlatıyor. | `patient_confirmation`, `ended` |
| `patient_confirmation` | AI tahmini ekranda gösterilir, hasta onay/ret verir. | `doctor_review`, `patient_capture`, `ended` |
| `doctor_review` | Cihaz doktora geçer, doktor hastanın şikayetini okur. | `doctor_response`, `ended` |
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
  * *Body (JSON):* `{ "classId": "bas_agrisi", "displayText": "Başım ağrıyor", "confidence": 0.92 }`
  * *Açıklama:* Hastanın kamera kaydı sonucunda üretilen mock (örnek) tahmin API'ye iletilir.
* **Adım 3:** `/api/consultations/[id]/confirm`
  * *Body (JSON):* `{ "confirmed": true }`
  * *Açıklama:* Hasta tahmini onaylar ve durum doktora (`doctor_review`) geçer.
* **Adım 4:** `/api/consultations/[id]/doctor-response`
  * *Body (JSON):* `{ "transcript": "Günde 2 kez ağrı kesici alın.", "source": "speech", "edited": false }`
  * *Açıklama:* Doktorun hastaya cevabı sisteme girilir.
* **Adım 5:** `/api/consultations/[id]/end`
  * *Body:* (Boş)
  * *Açıklama:* Oturum sonlandırılır ve hastanın tüm hassas verileri temizlenir.

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
