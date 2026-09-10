# SignBridge frontend teslimi

## Kapsam

Hasta–doktor akışı tek cihazlı, örnek verili bir frontend önizlemesidir. Gerçek kamera kaydı, işaret dili tanıma, AI tanısı, API çağrısı, veritabanı ve cihazlar arası eşzamanlama içermez. Mevcut `app/api` ve `lib/supabase.ts` dosyaları bu çalışma kapsamında değiştirilmedi.

## Çalıştırma

`signbridge-app` klasöründe:

```sh
npm install
npm run dev:frontend -- --port 3002
```

Önizleme: http://localhost:3002

```sh
npm run test:frontend
npm run typecheck
npm run build:frontend
npm run start:frontend -- --port 3003
```

`build:frontend` ve `start:frontend`, mevcut API modüllerinin derleme sırasında istemci oluşturabilmesi için yalnızca alt süreçte geçersiz örnek Supabase adresi/anahtarı kullanır. Bu komutlar gerçek API erişimi sağlamaz ve üretim backend kurulumu yerine geçmez. `.env` dosyalarını değiştirmez. Normal `build` komutu mevcut backend yapılandırmasını gerektirir.

Önizleme `.next-preview`, frontend derlemesi `.next-check` kullanır; normal `.next` klasörüyle çakışmaz. Aynı çıktı klasöründe aynı anda birden fazla derleme/geliştirme süreci çalıştırmayın.

## Ekran akışı

### Mobil görünüm

Eski ekran görüntülerindeki sade görsel dil geri alındı: logo/başla ana ekranı, büyük şikayet görseli, iki sütunlu seçenekler ve satırlı tedavi kartı. Genel adım şeridi ve tekrarlayan önizleme/örnek veri açıklamaları hasta ekranlarından kaldırıldı. Kamera ve AI entegrasyonu hâlâ bu teslimin kapsamı dışında.

Aktif ekranlar `CompactUI.tsx` ve `app/compact.css` kullanır. Gövde kaydırılmaz; alttaki eylemler sabittir. Uzun metin, görüşme geçmişi ve çoklu ilaçlar sayfalanır. İlaç formu tanı, ilaç/doz, kullanım, açıklama ve takip adımlarına ayrılmıştır. Soru konuları sekmelerde gösterilir. 320×568 ve 375×667 boyutlarında kamera, hasta onayı, bölge seçimi, soru-cevap ve tedavi kartları kontrol edildi; kart içeriğinin kırpılmaması ayrıca ölçüldü.

Yazdırma belgesi ekranda uzun bir liste halinde gösterilmez; sadece yazdırmada açılır. Ekranda kısa bir “Özetiniz hazır” sayfası bulunur.

1. `/` → yeni görüşme veya mevcut görüşmeye devam.
2. `/camera` → `/recognition` → Bitir → doğrudan `/confirm`. Arada ifade seçim ekranı yoktur. AI bağlanana kadar `src/lib/recognitionPreview.ts` bağlama uygun sabit test sonucu döndürür; gerçek çıkarım yapmaz. Elle seçim `/manual-select` alternatifinde kalır.
3. Sonuç bulunamadığında `/fallback`; alternatif anlatım `/manual-select`; kamera yardım durumu `/camera-help`.
4. Hasta onayı → `/handoff/doctor` → `/doctor/conversation`. Doktor şikayeti onaylar/düzenler.
5. `/doctor/questions` → hazır veya serbest soru → `/handoff/patient` → `/patient/{duration,intensity,location,medication,custom}`.
6. Hasta dokunarak/yazarak veya kamera önizlemesiyle yanıtlar. Yanıt aynı soru kimliğiyle geçmişe eklenir ve doktora döner.
7. `/doctor/result` → boş tedavi taslağı → kontrol önizlemesi → doktor onayı → `/handoff/patient?next=summary` → `/patient/summary`.
8. Açıklama istenirse `/patient/question` → `/handoff/doctor?next=answer` → `/doctor/answer` → `/handoff/patient?next=answer` → `/patient/answer` → güncel tedavi özeti.
9. Hasta anladığını belirttiğinde `/print`; yazdırma/PDF kaydetme işlemi tarayıcının yazdırma penceresine bırakılır. Çıktıdan sonra görüşme kapatılır ve `/complete` açılır.

## Veri ve entegrasyon noktaları

- Aktif ekranlar `app/**/page.tsx` içindeki ince yönlendirme dosyalarından `src/components/signbridge/*Flow.tsx` bileşenlerine bağlanır.
- Yeni frontend veri sözleşmesi: `src/lib/consultationFlow.ts`.
- Tek durum kaynağı: `src/components/providers/FlowProvider.tsx`.
- `capture`, çeviri sonucunun ilk şikayete, doktor sorusunun yanıtına veya hastanın ek sorusuna ait olduğunu belirtir.
- `candidate` henüz doğrulanmamış sonuçtur; `source` örnek çeviri (`demo`) ile elle girişi (`manual`) ayırır.
- `pending` sorunun kimliğini, türünü ve tam metnini içerir. `turns` soru/yanıt geçmişidir. `recordAnswer` bekleyen soru yokken yanıt eklemez; tamamlanan soruyu temizler.
- `reviewed` doktorun şikayeti incelediğini gösterir. `plan.approved` tedavi onayıdır. Yeni hasta yanıtı veya tedavi düzenlemesi bu onayı ve `understood` durumunu kaldırır.
- `Plan.medications` birden çok ilacı destekler. İlaçsız tedavi ve kontrol planlanmadı seçenekleri açıkça tutulur.
- `followups` ek açıklama geçmişini çıktı için saklar; yalnızca son soruyu tutmakla sınırlı değildir.
- `sessionStorage` yenilemede görüşmeyi korur. Görüşme sonunda yeni önizleme anahtarı ve önceki sürümün iki yerel depolama anahtarı temizlenir. Bu yapı gerçek sağlık verilerinin saklanması için tasarlanmamıştır.
- Önceki `ConsultationProvider`, `useFollowup` ve `types/consultation.ts` dosyaları aktif akış tarafından kullanılmaz. Backend ekibi yeni sözleşmeyle adaptör kurmalıdır; eski API sözleşmesiyle uyumluluk varsayılmamalıdır.

AI entegrasyonunda kamera/örnek sonuç üretimini gerçek servisle değiştirin; hasta onayı, soru kimliği, kaynak bilgisi ve doktor onayı ayrımlarını koruyun. Tanı formu boş başlar; hazır değerlendirme önerisi gösterilmez. Mevcut seçimli anlatım yolu tanıma servisi değildir.

## Kabul kontrolleri

- [x] Başlangıçta varsayılan hasta yanıtı veya ilaç yok.
- [x] Sonuç seçilmeden çeviri onayına geçilemiyor.
- [x] Bölge/ilaç yanıtları doğru soruyla birlikte doktorda görünüyor.
- [x] Çoklu soru geçmişi ve yenilemede veri korunuyor.
- [x] Boş ve eksik tedavi hasta ekranına gönderilemiyor.
- [x] Çoklu ilaç ve kontrol tarihi doktor önizlemesinden hasta özetine taşınıyor.
- [x] Hasta ek sorusu ve doktor yanıtı çıktı geçmişine ekleniyor.
- [x] Anlaşılamadı/elle giriş, soruya bağlı örnek çeviri, serbest soru ve ilaçsız tedavi yolları tarayıcıda denendi.
- [x] Görüşme kapatıldıktan sonra eski ekranlarda ve yenilemede hasta bilgileri gösterilmiyor.
- [x] Görüşme durumuyla ilgili 10 otomatik kontrol mevcut.
- [x] Frontend derleme ve TypeScript kontrolü geçiyor.
- [x] 375 px mobil genişlikte temel görünüm kontrol edildi.
- [ ] Fiziksel yazıcıdan çıktı: hedef tarayıcı/yazıcı ortamında son kurulum kontrolü gerekir. Uygulama içi tarayıcı yazdırma iletişim kutusunu göstermeyebilir.

Çıktı, örnek verili görüşme/kullanım özetidir; resmî e-reçete entegrasyonu içermez.
