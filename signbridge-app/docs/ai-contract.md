# SignBridge AI sözleşmesi v2

Bu sözleşme AI, Next.js backend ve arayüzün aynı veri biçimini kullanmasını sağlar. Alan adları mevcut TypeScript koduyla uyumlu olması için `camelCase` yazılmıştır.

## Girdi

Model ham video yerine tarayıcıda veya Python ön işleme hattında çıkarılmış landmark dizisini alır.

Uygulamanın dışarı açık adresi `POST /api/ai/predict` şeklindedir. Next.js bu isteği Docker iç ağındaki `ai-inference:8000/predict` servisine aktarır; AI konteynerinin portu doğrudan kullanıcıya açılmaz.

```json
{
  "sessionId": "uuid",
  "preprocessingVersion": "landmark46-v1",
  "recognitionContext": "general | symptom",
  "landmarks": "number[60][46][2]",
  "mask": "number[60][46]"
}
```

- `landmarks`: 60 karedeki omuz, dirsek ve el koordinatlarıdır.
- `mask`: noktanın gerçekten algılanıp algılanmadığını belirtir.
- `recognitionContext`: `general` mevcut AUTSL sınıflarını, `symptom` ise belirti avatarlarına bağlı
  sınıfları değerlendirir. Gönderilmezse geriye uyumlu olarak `general` kullanılır.
- Ham video ve landmark dizisinin tamamı uygulama loglarına yazılmaz.

## Çıktı

Çalışan örnekler `ai-training/examples` klasöründedir. `prediction.schema.json` bütün model/mock/manual cevaplarını doğrulayan şemadır.

Backend `PredictionPayload` tipi şu alanları desteklemelidir:

```ts
interface PredictionPayload {
  classId: string | null;
  expressionId?: string | null;
  displayText: string;
  confidence: number | null;
  alternatives: string[];
  isLowConfidence: boolean;
  forcedCandidate?: boolean;
  experimental?: boolean;
  recognitionContext?: 'general' | 'symptom';
  predictionMode: 'model' | 'mock' | 'manual';
  modelVersion: string | null;
  preprocessingVersion: string;
  vocabularyVersion: string;
  decisionPolicyVersion: string;
  rejectionReason: 'low_score' | 'ambiguous_prediction' | 'unsupported_class' | 'policy_disabled' | null;
  requiresConfirmation: boolean;
}
```

Hasta onayı model çıktısına eklenmez. Mevcut `/confirm` işlemiyle ayrı bir olay olarak kaydedilir.

## Güvenli davranış

- Model eşiğin altındaysa `classId=null` ve `isLowConfidence=true` döner.
- Birleşik modelin deneysel `symptom` bağlamında eşik altı aday ayrıca gösterilebilir. Bu durumda
  `classId` korunur, `isLowConfidence=true`, `forcedCandidate=true` ve `requiresConfirmation=true`
  olur; aday kullanıcı onayı olmadan görüşmeye aktarılmaz.
- Skor eşik altındaysa `rejectionReason=low_score`; skor yeterli fakat karar farkı düşükse
  `rejectionReason=ambiguous_prediction` döner.
- Kazanan sınıf demo izin listesinde değilse `unsupported_class`, politika kapalıysa `policy_disabled` döner.
- Kabul edilen model önerilerinde `requiresConfirmation=true` olur. Ret veya manuel seçimde `false` olur.
- `decisionPolicyVersion` hangi eşik/fark kuralının kullanıldığını belirtir.
- Manuel seçimde `confidence=null`, `predictionMode=manual` olur.
- AI sonucu tıbbi tanı değildir ve kullanıcı onayı olmadan doktora kesin ifade olarak iletilmez.
- `kalp_krizi`, `kanama`, `yanik`, `tehlike` ve `yardim` kırmızı bayrak olarak işaretlenir; yine de otomatik tanı oluşturmaz.
- `signbridge30-v1` sözlüğünde mevcut `seker` sınıfı korunur. `symptom` bağlamında cevap
  `classId=seker`, `expressionId=diabetes` ve `displayText=Şeker hastasıyım` olur.

## Karar politikası dosyası

Servis `DECISION_POLICY_PATH` verilirse JSON politikasını başlangıçta yükler. Model, ön işleme ve sözlük
sürümleri eşleşmezse veya dosya bozuksa servis sessizce varsayılana dönmez; başlangıç başarısız olur.
Politikadaki `enabled`, `allowedClassIds`, `confidenceThreshold`, `marginThreshold` ve
`decisionPolicyVersion` birlikte doğrulanır. Güvenli demo izin listesi `doktor`, `hasta`, `evet`, `hayir`
ve `ilac` sınıflarıdır. Dondurulmuş OOD yanlış kabul oranı `%31,63` olduğu için takip edilen politika
`enabled=false` ve servis `manual_only` durumundadır. Dosya belirtilmezse yalnız geriye uyumluluk için
`score-threshold-v1` ve `0,80` eşiği kullanılır; bu varsayılan bir yayın onayı değildir.

`confidence` ekranda yuvarlanabilir fakat kabul/ret kararı modelin ham skoru üzerinden verilir. Bu değer
kalibre edilmiş klinik olasılık değildir.

Kamera kalite kapısı ham kareleri, landmark görünürlüğünü ve normalize el hareketi yolunu değerlendirir.
`motionScore`, her elde ortak görülen noktaların ardışık kareler arasındaki yol uzunluklarının medyanıdır;
iki elden büyük olan değer kullanılır. Eşik altı `insufficient_motion` ile manuel seçime yönlendirilir.
Hazır landmark alan `/predict`
endpoint'i ışık, kadraj veya işaretin dilsel doğruluğunu yeniden doğrulayamaz; yalnız veri yapısını denetler.

## Sürüm uyumu (`GET /api/ai/status`)

AI servisinin `/health` cevabı `modelVersion`, `vocabularyVersion` ve `preprocessingVersion` alanlarını
taşır. Web bunları `AI_EXPECTED_MODEL_VERSION`, `AI_EXPECTED_VOCABULARY_VERSION` ve
`AI_EXPECTED_PREPROCESSING_VERSION` ile karşılaştırır. Uyuşmazlıkta durum cevabı
`cameraAiEnabled=false`, `mode=manual_only`, `versionMismatch=true` ve `versionMismatchFields` döner;
kamera ekranı açılmaz. Tahmin cevabındaki sürümler de ayrıca doğrulanır (`VERSION_MISMATCH`, 409).
Birleşik model için beklenen değerler `signbridge-unified30-bigru-v0.2.0` ve `signbridge30-v1`'dir.
