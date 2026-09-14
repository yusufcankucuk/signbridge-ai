# Tarayıcı kamera ve AI entegrasyonu

## Çalışan akış

`Başla → Kamerayı aç → Kaydı başlat → Bitir` akışı gerçek servis zincirini kullanır:

1. Next.js sunucusu 30 dakika süreli anonim görüşme kimliği üretir.
2. MediaPipe Holistic modeli tarayıcıda her kareden 33 pose, 21 sol el ve 21 sağ el noktası çıkarır.
3. Kalite kapısı en az 8 kare, iki omuz görünürlüğü ve en az bir el görünürlüğünü denetler.
4. Eğitim hattıyla aynı indeksler seçilir: omuz/dirsekler ile iki el, toplam 46 nokta.
5. Noktalar omuz orta noktası ve mesafesine göre normalize edilir; dizi 60 zaman adımına örneklenir.
6. Sunucuya ham video yerine `landmarks`, `mask`, `sessionId` ve `landmark46-v1` sürümü gönderilir.
7. AI cevabı düşük güvenliyse kullanıcı tekrar denemeye veya manuel seçime yönlendirilir. Kabul edilen sonuç da kesin ifade değildir; hasta onayı zorunludur.

Önizleme yalnız CSS ile aynalanır. MediaPipe'ın analiz ettiği video karesi çevrilmediği için anatomik sol ve sağ el blokları yer değiştirmez.

## Hata davranışları

| Durum | Kullanıcı davranışı |
|---|---|
| Kamera izni yok | İzin kontrolü ve manuel seçim sunulur |
| Kayıt 8 kareden kısa | Model çağrılmaz, tekrar istenir |
| Omuz/el görünürlüğü düşük | Model çağrılmaz, kadraj mesajı gösterilir |
| Skor eşik altında | `classId=null`; tekrar veya manuel seçim |
| İki aday belirsiz | `ambiguous_prediction`; tekrar veya manuel seçim |
| Servis erişilemiyor | Hata görünür kalır; uydurma demo sonucu üretilmez |

## Gizlilik

- `getUserMedia` yalnız kullanıcı eylemi ve tarayıcı izniyle açılır.
- Ses istenmez.
- Ham kare, video ve kamera akışı sunucuya gönderilmez ve tarayıcı depolamasına yazılmaz.
- Görüşme bittiğinde sunucu oturumu ve olayları silinir.
- Kalıcı Supabase modu service-role anahtarını yalnız sunucuda kullanır; `NEXT_PUBLIC_*` anahtarları bu hat için kullanılmaz.

## Doğrulama sınırı

Otomatik testler şekil, normalizasyon, maskeleme, sol/sağ sıra ve deterministik örneklemeyi doğrular. Bunlar gerçek kamera doğruluğu değildir. Bir geliştirme ve bir holdout katılımcısıyla toplam 50 kontrollü deneme hâlâ fiziksel kabul çalışmasıdır.
