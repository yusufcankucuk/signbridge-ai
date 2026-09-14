# IIG-32 — Mock AI ve Konuşma-Yazı Backend Entegrasyonu

> **Tarihsel kayıt:** Bu belge IIG-32 teslimindeki mock servis aşamasını anlatır. Güncel uygulama gerçek tarayıcı kamerasını ve MediaPipe landmark çıkarımını kullanır; oturumlar varsayılan olarak sunucu belleğinde tutulur. Güncel akış için `../../docs/browser-camera-ai.md` ve kök `README.md` dosyalarına bakın. Aşağıdaki eski kapsam ve örnekler yeni kurulum talimatı olarak kullanılmamalıdır.

## Amaç ve kapsam

Bu çalışma, gerçek Huawei ModelArts ve gerçek bir konuşma-yazı servisi hazır olmadan SignBridge'in backend sözleşmelerini çalıştırmak için yapılmıştır.

Bu değişikliğin kapsamı:

- Mock AI cevabının servis katmanına bağlanması
- Doktor için örnek speech-to-text cevabı sağlanması
- Yazılı doktor yanıtının zorunlu fallback olarak desteklenmesi
- Ham kamera/ses, landmark ve sağlık metninin teknik loglardan çıkarılması
- Mock servis ve güvenli log testlerinin eklenmesi

Frontend ekranları, tarayıcı kamera/mikrofon kodu, MediaPipe ve AI model eğitimi bu çalışmanın kapsamı dışındadır.

## Backend mimarisi

```text
Frontend
   |
   +--> POST /api/consultations/{id}/prediction
   |        |
   |        +--> aiService --> mock AI provider
   |        +--> interaction_events (tahmin verisi)
   |        +--> technical_events (yalnız teknik metrik)
   |
   +--> POST /api/speech/transcribe
   |        |
   |        +--> speechToTextService --> mock STT provider
   |        +--> technical_events (yalnız teknik metrik)
   |
   +--> POST /api/consultations/{id}/doctor-response
            +--> speech veya text kaynaklı doktor yanıtı
```

Servis sağlayıcı seçimi route dosyalarından ayrılmıştır. İleride gerçek ModelArts veya Huawei Speech sağlayıcısı eklenirken API sözleşmesi korunabilir.

## Değiştirilen ve eklenen dosyalar

| Dosya | Sorumluluk |
|---|---|
| `signbridge-app/lib/services/aiService.mjs` | Mock AI sağlayıcısı ve ortak tahmin cevabı |
| `signbridge-app/lib/services/speechToTextService.mjs` | Örnek doktor transcript'i ve text fallback bilgisi |
| `signbridge-app/lib/services/technicalEventLogger.mjs` | Supabase'e yalnız izin verilen teknik alanları yazar |
| `signbridge-app/app/api/consultations/[id]/prediction/route.ts` | Oturum kontrolü, mock AI çağrısı ve tahmin kaydı |
| `signbridge-app/app/api/speech/transcribe/route.ts` | Ham ses almadan mock STT cevabı döndürür |
| `signbridge-app/app/api/consultations/[id]/doctor-response/route.ts` | Boş yanıtı ve geçersiz kaynak tipini reddeder |
| `infrastructure/functiongraph/fallback_rules.js` | İstek gövdesini loglamak yerine güvenli teknik alanları yazar |
| `infrastructure/database/schema.sql` | Güvenli `technical_events` tablosu ve RLS politikası |
| `signbridge-app/tests/demo-services.test.mjs` | Mock servis ve log gizliliği testleri |

## Ortam değişkenleri

Yerel demo için `.env.local` dosyasında sağlayıcılar mock olarak seçilir:

```dotenv
AI_PROVIDER=mock
SPEECH_PROVIDER=mock
```

Güncel yerel demo için Supabase zorunlu değildir. Bu tarihsel entegrasyonun kalıcı Supabase modu kullanılacaksa yalnız sunucu tarafındaki değişkenler gerekir:

```dotenv
SESSION_STORE=supabase
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
```

Service-role anahtarı `NEXT_PUBLIC_` önekiyle tanımlanmamalı, tarayıcıya gönderilmemeli ve repoya ya da loglara eklenmemelidir. Anon anahtarı service-role yerine kullanmayın.

## API sözleşmeleri

### Mock AI tahmini

`POST /api/consultations/{id}/prediction`

Başarılı cevap örneği:

```json
{
  "success": true,
  "prediction": {
    "classId": "AGRI",
    "displayText": "Başım ağrıyor",
    "confidence": 0.92,
    "alternatives": [
      "Başım dönüyor",
      "Kendimi iyi hissetmiyorum"
    ],
    "isLowConfidence": false,
    "modelVersion": "mock-demo-v1"
  },
  "provider": "mock",
  "nextState": "patient_confirmation"
}
```

Hasta oturumu `patient_capture` durumunda değilse endpoint `409` döndürür. Hasta onayı olmadan doktor adımına geçilmez.

### Mock speech-to-text

`POST /api/speech/transcribe`

Bu endpoint ham ses dosyası kabul etmez. Geliştirme aşamasında örnek transcript döndürür:

```json
{
  "transcript": "Geçmiş olsun. Ağrınızın ne zaman başladığını ve şiddetini öğrenmek istiyorum.",
  "provider": "mock",
  "source": "speech",
  "edited": false,
  "textFallbackRequired": true,
  "browserSpeechPreferred": true
}
```

`browserSpeechPreferred`, frontend'in tarayıcı destekliyorsa Web Speech API'yi önce denemesi gerektiğini belirtir. `textFallbackRequired`, ses özelliği desteklenmediğinde veya izin reddedildiğinde doktor metin alanının kullanılabilir ve zorunlu kalacağını belirtir.

### Doktor yanıtı

`POST /api/consultations/{id}/doctor-response`

```json
{
  "transcript": "Geçmiş olsun. Şikâyetiniz ne zaman başladı?",
  "source": "text",
  "edited": true
}
```

Kurallar:

- `transcript` boş olamaz.
- `source` yalnızca `speech` veya `text` olabilir.
- Speech başarısızsa frontend aynı endpoint'e `source: "text"` ile devam eder.
- Dönüştürülen metin doktora kontrol ettirilmeden hastaya otomatik gönderilmemelidir.

## Supabase teknik logları

Mock AI ve STT çağrıları `technical_events` tablosuna yalnız aşağıdaki alanları yazar:

| Alan | Açıklama |
|---|---|
| `event_id` | Veritabanının oluşturduğu anonim UUID |
| `type` | İzin verilen teknik olay türü |
| `latency_ms` | İşlemin milisaniye süresi |
| `error_code` | `PERSISTENCE_ERROR`, `PROVIDER_ERROR` veya `NULL` |
| `created_at` | Sunucu zamanı |

İzin verilen olay türleri:

- `mock_ai_prediction_succeeded`
- `mock_ai_prediction_failed`
- `mock_stt_succeeded`
- `mock_stt_failed`

Tabloda özellikle şu alanlar bulunmaz:

- Session veya kullanıcı kimliği
- AI tahmin metni
- Doktor/hasta sağlık metni
- İstek gövdesi
- Kamera karesi veya video
- Ham ses
- Landmark dizisi
- Supabase veya Huawei anahtarı

RLS aktiftir. Anonim ve authenticated roller yalnız doğrulama kurallarından geçen kayıtları ekleyebilir; teknik logları okuyamaz, değiştiremez veya silemez.

Tablo tanımı `infrastructure/database/schema.sql` içindedir ve Supabase SQL Editor üzerinden uygulanmalıdır.

## Test ve doğrulama

```bash
cd signbridge-app
npm run test:demo-services
```

Test kapsamı:

1. Mock AI'nin ortak tahmin sözleşmesini döndürmesi
2. Mock STT'nin örnek transcript ve zorunlu text fallback bilgisini döndürmesi
3. Servislerin ham veri veya sağlık metni loglamaması
4. Supabase teknik log kaydında yalnız güvenli alanların bulunması

Son doğrulama sonucu: **4 testin 4'ü başarılı**.

Production build aşağıdaki komutla doğrulanmıştır:

```bash
npm run build
```

Güncel uygulama `SESSION_STORE=memory` ile Supabase olmadan build ve yerel demo çalıştırabilir.

## Frontend ekibine devir notu

Backend kısmı tamamlanmıştır. Genel tek cihazlı demo kabulü için frontend tarafında aşağıdakiler bağlanmalıdır:

1. Tarayıcıda `SpeechRecognition` veya `webkitSpeechRecognition` desteğini kontrol et.
2. Destek varsa doktor izniyle tarayıcı konuşma API'sini dene.
3. Destek yoksa, izin reddedilirse veya tanıma hata verirse doktor metin alanını açık tut.
4. Boş doktor yanıtıyla ilerlemeyi engelle.
5. Transcript'i doktora düzenletip onaylattıktan sonra `doctor-response` endpoint'ine gönder.
6. Hasta → tahmin → onay → doktor → hasta akışını tek cihazda uçtan uca test et.

Oda, link, WebRTC, iki cihaz senkronizasyonu, frontend tasarımı ve gerçek AI eğitimi bu teslimin parçası değildir.
