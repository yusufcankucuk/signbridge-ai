# Gerçek AI oturum akışı E2E raporu

Tarih: 11 Eylül 2026

## Kapsam

Bu çalışma yalnız Next.js backend, state machine, Supabase erişimi ve mevcut local AI provider entegrasyonunu kapsar. Frontend ve model eğitimi değiştirilmemiştir.

Tamamlanan akış:

```text
create
  → patient_capture
  → gerçek AI prediction
  → patient_confirmation
  → hasta confirm
  → doctor_review
  → doctor response
  → patient_review
  → next veya end
```

`POST /api/consultations/[id]/prediction` artık istemciden hazırlanmış model/mock sonucu almaz. Landmark sözleşmesini doğrular, `AI_PROVIDER=local` ile FastAPI `/predict` servisini çağırır ve yalnız doğrulanmış provider sonucunu `interaction_events` tablosuna yazar.

## Endpoint ve geçişler

| İstek | Gerekli mevcut durum | Sonraki durum | Hatalı durumda |
|---|---|---|---:|
| `POST /api/consultations` | — | `patient_capture` | `500` |
| `POST /api/consultations/:id/prediction` | `patient_capture` | `patient_confirmation` | `409` |
| `POST /api/consultations/:id/confirm` | `patient_confirmation` | `doctor_review` veya `patient_capture` | `409` |
| `POST /api/consultations/:id/doctor-response` | `doctor_review` | `patient_review` | `409` |
| `POST /api/consultations/:id/next` | `patient_review` | `patient_capture` | `409` |
| `POST /api/consultations/:id/end` | state machine'in izin verdiği aktif durum | `ended` | `409` |

Hasta onayı gelmeden doktor yanıt endpoint'i `409` döndürür. Doktor yanıtı kaydedildikten sonra yeni tur yalnız `patient_review → patient_capture` geçişiyle açılır. Oturum bitirildiğinde `interaction_events` kayıtları silinir.

## Tekrarlanabilir test

```bash
cd signbridge-app
npm run build
npm run test:e2e-session
```

Test gerçek Next.js production sunucusunu ve Supabase REST sözleşmesini kullanan kontrollü, bellekte çalışan bir test sunucusunu başlatır. Varsayılan koşuda deterministik bir HTTP AI servisi kullanılır. Çalışan gerçek local FastAPI servisine yönlendirmek için:

```bash
E2E_AI_LOCAL_URL=http://127.0.0.1:8000 npm run test:e2e-session
```

## İstek/cevap kanıtı

11 Eylül 2026 tarihinde test, gerçek `signbridge/ai-inference:0.1.0` FastAPI container'ına bağlanarak çalıştırılmıştır. Container sağlık cevabı `status=ok`, `service=signbridge-ai` ve `modelVersion=autsl20-bigru-v0.1.0` değerlerini döndürmüştür.

Tam turda elde edilen hassas içerikten arındırılmış kanıt:

| Adım | HTTP | Cevap durumu/metadata |
|---|---:|---|
| create | 201 | `patient_capture` |
| prediction | 200 | `patient_confirmation`, provider=`local` |
| aynı prediction'ı tekrarlama | 409 | kontrollü ret |
| confirm öncesi doctor response | 409 | kontrollü ret |
| confirm | 200 | `doctor_review` |
| doctor response | 200 | `patient_review` |
| next | 200 | `patient_capture` |
| aynı next'i tekrarlama | 409 | kontrollü ret |
| end | 200 | `ended`, kalan event=`0` |

Otomatik test sonucu: `1/1` başarılı. Webpack production build ve TypeScript kontrolü başarılıdır.

## Mahremiyet

Test çıktısı ve uygulama logları landmark dizilerini, tahmin metnini, doktor yanıtını, Supabase anahtarını veya kişisel sağlık verisini yazmaz. Kanıt yalnız endpoint adımı, HTTP durumu, state ve provider metadata'sını içerir.

## Ayrı ekip bulgusu

Genel `npm run lint`, bu tasktan önce frontend dalına eklenmiş React effect kurallarındaki 6 hata nedeniyle başarısızdır. Backend kapsamı `npm run lint:backend` ile ayrıca doğrulanır; bu rapor frontend dosyalarını değiştirmez.
