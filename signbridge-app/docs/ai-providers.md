# SignBridge gerçek AI provider entegrasyonu

## Kapsam

Next.js backend aynı landmark ve tahmin sözleşmesi üzerinden iki gerçek sağlayıcıyı destekler:

- `local`: Docker içindeki veya geliştirici bilgisayarındaki FastAPI inference servisi
- `modelarts`: Huawei ModelArts üzerinde yayınlanan gerçek zamanlı inference endpoint'i

Mock provider bu akışın parçası değildir.

## Seçim ve fallback

```dotenv
AI_PROVIDER=local
AI_FALLBACK_PROVIDER=none
```

ModelArts birincil, yerel FastAPI yedek olacaksa:

```dotenv
AI_PROVIDER=modelarts
AI_FALLBACK_PROVIDER=local
MODELARTS_ENABLED=true
AI_LOCAL_URL=http://localhost:8000
MODELARTS_ENDPOINT=https://your-modelarts-inference-endpoint
MODELARTS_AUTH_TOKEN=your-temporary-iam-token
```

Normal geliştirme ve Docker çalışması `AI_PROVIDER=local`, `AI_FALLBACK_PROVIDER=none` ve
`MODELARTS_ENABLED=false` değerlerini kullanır. Böylece eski bir ortam dosyasında yanlışlıkla
`AI_PROVIDER=modelarts` kalsa bile Huawei çağrısı yapılmaz; backend kontrollü
`503 AI_CONFIGURATION_ERROR` döndürür. Huawei'yi yeniden açmak için hem
`AI_PROVIDER=modelarts` hem de `MODELARTS_ENABLED=true` açıkça ayarlanmalıdır.

`AI_FALLBACK_PROVIDER=local` yalnız ModelArts timeout, ağ hatası veya `5xx` cevabı verdiğinde devreye girer. Geçersiz JSON, sözleşme hatası ve sürüm uyuşmazlığı fallback ile gizlenmez.

## Ortak sözleşme

Her iki provider da şu girdiyi alır:

```ts
interface LandmarkPredictionRequest {
  sessionId?: string;
  preprocessingVersion: string;
  landmarks: number[][][]; // [60][46][2]
  mask: number[][];        // [60][46]
}
```

Her iki provider da `PredictionPayload` döndürür. Gerçek provider cevabında `predictionMode` değeri `model` olmalıdır.

Beklenen sürümler:

```dotenv
AI_EXPECTED_MODEL_VERSION=autsl20-bigru-v0.1.0
AI_EXPECTED_PREPROCESSING_VERSION=landmark46-v1
AI_EXPECTED_VOCABULARY_VERSION=autsl20-v1
```

Model, preprocessing veya etiket sözlüğü sürümlerinden biri uyuşmazsa backend `409 AI_VERSION_MISMATCH` döndürür.

## Hata davranışı

| Durum | HTTP | Kod |
|---|---:|---|
| 15 saniye timeout | 503 | `AI_TIMEOUT` |
| Ağ hatası veya servis kesintisi | 503 | `AI_UNAVAILABLE` |
| Geçersiz JSON/sözleşme | 502 | `AI_INVALID_RESPONSE` |
| Model/etiket/preprocessing sürüm uyuşmazlığı | 409 | `AI_VERSION_MISMATCH` |
| Eksik veya hatalı provider ayarı | 503 | `AI_CONFIGURATION_ERROR` |

Ham landmark dizisi, sağlık metni, endpoint cevabı ve kimlik bilgileri hata mesajlarına veya loglara yazılmaz.

## ModelArts kimlik doğrulaması

Backend `MODELARTS_AUTH_TOKEN` değerini `X-Auth-Token` başlığıyla ModelArts endpoint'ine gönderir. Token yalnız Next.js server route içinde okunur. Değişken adı `NEXT_PUBLIC_` ile başlamamalıdır.

Gerçek `.env`, `.env.local`, private key ve sertifika dosyaları Git tarafından yok sayılır. Örnek dosyalarda yalnız sahte placeholder değerleri bulunur.

## Doğrulama

```bash
cd signbridge-app
npm run lint
npm run build
npm run test:ai-providers
npm run check:client-secrets
```

Gerçek local veya ModelArts endpoint smoke testi:

```bash
AI_SMOKE_ENDPOINT=http://localhost:8000/predict npm run smoke:ai-service
```

ModelArts için aynı komuta `AI_SMOKE_ENDPOINT` ve `MODELARTS_AUTH_TOKEN` yalnız shell ortamından verilmelidir. Script sağlık metnini veya landmark girdisini çıktıya yazmaz.

Alternatif olarak gerçek değerleri Git tarafından yok sayılan `signbridge-app/.env.local` dosyasına ekleyip çalıştırın:

```bash
npm run smoke:modelarts
```

Bu dosyada `AI_PROVIDER=modelarts` ve `MODELARTS_ENABLED=true` birlikte bulunmalıdır.

Entegrasyon testi gerçek HTTP soketleri üzerinden local ve ModelArts adaptörlerini, ortak cevabı, auth header'ını, 15 saniye timeout'u, sürüm uyuşmazlığını, kontrollü `503` cevabını ve local fallback'i doğrular.

## 10 Eylül 2026 doğrulama durumu

- Next.js lint: başarılı
- Next.js production build ve TypeScript kontrolü: başarılı
- Provider HTTP entegrasyon testleri: 8/8 başarılı
- İstemci bundle secret taraması: 9 dosya, sızıntı yok
- Cache kullanılmadan Docker web imajı build'i: başarılı
- Cache kullanılmadan Docker FastAPI inference imajı build'i: başarılı
- Apple Silicon uyumluluğu: `linux/amd64` emülasyonu ile doğrulandı

Yerel FastAPI container'ı geçici ve sözleşmeye uygun bir Keras smoke modeliyle çalıştırılmış; `/health` ve `/predict` çağrıları başarıyla doğrulanmıştır. Üretimde kullanılacak `ai-training/outputs/saved_model` ve `ai-training/outputs/runtime_config.json` artefaktları ise Git deposunda yer almaz ve dağıtım ortamında sağlanmalıdır. Gerçek ModelArts çağrısı kullanıcı talebiyle durdurulmuştur; entegrasyon kodu hazırdır ancak gerçek endpoint ve token ile smoke testi daha sonra yapılacaktır. Provider davranış testleri gerçek HTTP üzerinden çalışan kontrollü test servislerini kullanır.
