# API güvenliği ve veri yaşam döngüsü doğrulama raporu

Tarih: 11 Eylül 2026
Dal: `feature-signbridge-app`

## Kapsam

Bu rapor API girdilerinin strict doğrulanmasını, AI servis hata davranışını, log mahremiyetini, oturum izolasyonunu ve oturum sonu temizliğini kapsar. Frontend ve AI model eğitimi değiştirilmemiştir.

## Uygulanan sınırlar

| Endpoint grubu | En büyük gövde | Alan/şema kuralı |
|---|---:|---|
| AI/oturum prediction | 256 KiB | Yalnız `sessionId`, `preprocessingVersion`, `landmarks`, `mask`; tam `60×46×2` ve `60×46` boyutları |
| Hasta confirm | 2 KiB | Yalnız `confirmed`, `manualSelection`; seçim en fazla 120 karakter |
| Doktor yanıtı | 8 KiB | Yalnız `transcript`, `source`, `edited`; transcript en fazla 2000 karakter |
| Create/next/end | 256 bayt | Boş gövde veya boş JSON nesnesi; başka alan kabul edilmez |

JSON nesnesi olmayan, bozuk JSON içeren veya `application/json` dışında gönderilen gövdeler işlenmeden reddedilir. Boyut sınırı stream okunurken uygulanır; büyük gövde tamamen belleğe alınmaz.

AI provider cevabı da strict sözleşmeyle doğrulanır. Beklenmeyen alan, bozuk JSON, geçersiz boyut/tip veya sürüm uyuşmazlığı uygulama verisi olarak kabul edilmez.

## Jira test sonuç tablosu

Aşağıdaki tablo Jira görev açıklamasına veya test kanıtı yorumuna doğrudan eklenebilir.

| ID | Senaryo | Beklenen | Sonuç | Kanıt |
|---|---|---|---|---|
| SEC-01 | Bozuk JSON | `400` | PASS | E2E HTTP testi |
| SEC-02 | Yanlış Content-Type | `415` | PASS | E2E HTTP testi |
| SEC-03 | Beklenmeyen request alanı | `400` | PASS | Create/prediction/confirm/doctor testleri |
| SEC-04 | Gövde boyut sınırı | `413` | PASS | 256 KiB prediction ve 8 KiB doctor sınırı |
| SEC-05 | Yanlış alan tipi | `400` | PASS | `confirmed` tipi testi |
| SEC-06 | AI servisi kapalı/ulaşılamıyor | `503 AI_UNAVAILABLE` | PASS | Provider HTTP testi |
| SEC-07 | AI timeout | `503 AI_TIMEOUT`, 15 saniye | PASS | Ölçülen süre yaklaşık 15,25 saniye |
| SEC-08 | AI bozuk JSON | `502 AI_INVALID_RESPONSE` | PASS | Provider HTTP testi |
| SEC-09 | AI upstream `401` | `503 AI_AUTHENTICATION_ERROR` | PASS | Upstream hata detayı response'a taşınmadı |
| SEC-10 | Ham video canary log kontrolü | Logda bulunmaz | PASS | Next.js stdout/stderr taraması |
| SEC-11 | Sağlık metni canary log kontrolü | Logda bulunmaz | PASS | Kabul edilen doktor yanıtı sonrası tarama |
| SEC-12 | Gizli anahtar canary kontrolü | Log/client bundle'da bulunmaz | PASS | Runtime log ve 55 bundle dosyası taraması |
| SEC-13 | Oturum izolasyonu | A işlemleri B'yi değiştirmez | PASS | İki oturumlu Supabase REST E2E testi |
| SEC-14 | Oturum sonu temizliği | Biten oturum event sayısı `0` | PASS | End endpoint E2E testi |
| SEC-15 | Biten oturuma yeniden işlem | `409` | PASS | Confirm-after-end testi |

## Tekrarlama

```bash
cd signbridge-app
npm ci
npm run lint:backend
npm run build
npm run test:security
```

Testler gerçek Next.js production HTTP sunucusunu kullanır. Supabase REST davranışı iki oturumlu, bellekte çalışan kontrollü test sunucusuyla tekrarlanır. AI hata testleri gerçek HTTP soketleri üzerinden çalışır.

## Mahremiyet kontrolü

Testler farklı ve kolay tespit edilen canary değerlerini request gövdelerine ve sunucu ortam değişkenlerine yerleştirir. Next.js stdout/stderr çıktısı ile derlenmiş istemci bundle'ları bu değerler için taranır. Test çıktısı ham landmark dizisini, doktor transcript'ini, sağlık metnini veya gizli anahtarı yazmaz.

## Jira durumu

Sonuç tablosu hazırdır. Jira issue anahtarı veya bağlantısı sağlandığında tablo ilgili göreve yorum olarak eklenmelidir.
