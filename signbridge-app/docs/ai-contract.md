# SignBridge AI sözleşmesi v2

Bu sözleşme AI, Next.js backend ve arayüzün aynı veri biçimini kullanmasını sağlar. Alan adları mevcut TypeScript koduyla uyumlu olması için `camelCase` yazılmıştır.

## Girdi

Model ham video yerine tarayıcıda veya Python ön işleme hattında çıkarılmış landmark dizisini alır.

Uygulamanın dışarı açık adresi `POST /api/ai/predict` şeklindedir. Next.js bu isteği Docker iç ağındaki `ai-inference:8000/predict` servisine aktarır; AI konteynerinin portu doğrudan kullanıcıya açılmaz.

```json
{
  "sessionId": "uuid",
  "preprocessingVersion": "landmark46-v1",
  "landmarks": "number[60][46][2]",
  "mask": "number[60][46]"
}
```

- `landmarks`: 60 karedeki omuz, dirsek ve el koordinatlarıdır.
- `mask`: noktanın gerçekten algılanıp algılanmadığını belirtir.
- Ham video ve landmark dizisinin tamamı uygulama loglarına yazılmaz.

## Çıktı

Çalışan örnekler `ai-training/examples` klasöründedir. `prediction.schema.json` bütün model/mock/manual cevaplarını doğrulayan şemadır.

Backend `PredictionPayload` tipi şu alanları desteklemelidir:

```ts
interface PredictionPayload {
  classId: string | null;
  displayText: string;
  confidence: number | null;
  alternatives: string[];
  isLowConfidence: boolean;
  predictionMode: 'model' | 'mock' | 'manual';
  modelVersion: string | null;
  preprocessingVersion: string;
  vocabularyVersion: string;
  decisionPolicyVersion: string;
  rejectionReason: 'low_score' | 'ambiguous_prediction' | null;
  requiresConfirmation: boolean;
}
```

Hasta onayı model çıktısına eklenmez. Mevcut `/confirm` işlemiyle ayrı bir olay olarak kaydedilir.

## Güvenli davranış

- Model eşiğin altındaysa `classId=null` ve `isLowConfidence=true` döner.
- Skor eşik altındaysa `rejectionReason=low_score`; skor yeterli fakat karar farkı düşükse
  `rejectionReason=ambiguous_prediction` döner.
- Kabul edilen model önerilerinde `requiresConfirmation=true` olur. Ret veya manuel seçimde `false` olur.
- `decisionPolicyVersion` hangi eşik/fark kuralının kullanıldığını belirtir.
- Manuel seçimde `confidence=null`, `predictionMode=manual` olur.
- AI sonucu tıbbi tanı değildir ve kullanıcı onayı olmadan doktora kesin ifade olarak iletilmez.
- `kalp_krizi`, `kanama`, `yanik`, `tehlike` ve `yardim` kırmızı bayrak olarak işaretlenir; yine de otomatik tanı oluşturmaz.

## Karar politikası dosyası

Servis `DECISION_POLICY_PATH` verilirse JSON politikasını başlangıçta yükler. Model, ön işleme ve sözlük
sürümleri eşleşmezse veya dosya bozuksa servis sessizce varsayılana dönmez; başlangıç başarısız olur.
Dosya belirtilmezse geriye uyumlu `score-threshold-v1` ve `0,80` eşiği kullanılır.

`confidence` ekranda yuvarlanabilir fakat kabul/ret kararı modelin ham skoru üzerinden verilir. Bu değer
kalibre edilmiş klinik olasılık değildir.

Kamera kalite kapısı ham kareleri ve landmark görünürlüğünü değerlendirir. Hazır landmark alan `/predict`
endpoint'i ışık, kadraj veya işaretin dilsel doğruluğunu yeniden doğrulayamaz; yalnız veri yapısını denetler.
