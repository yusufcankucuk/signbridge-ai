# SignBridge kısa uçtan uca test kılavuzu

## Başlamadan önce

- Testi mümkünse eski `.next`, `.env` ve model kalıntısı olmayan yeni bir klonda yapın.
- Ekip kamera testi için `docker compose --profile setup run --rm model-setup`; manuel test için doğrudan `docker compose up --build -d` çalıştırın.
- `docker compose ps` çıktısında `web` ve `ai-inference` sağlıklı olmalıdır.
- `http://localhost:3000/api/ai/status` yanıtında `mode=manual_only` ise bu bir hata değildir: güvenli manuel demo kullanılır. `mode=team_camera` deneysel ekip testidir; final kamera AI onayı değildir.
- Testte gerçek hasta bilgisi yazmayın. Her görüşmeyi bitirerek geçici kayıtların temizlendiğini doğrulayın.

## Her ekip üyesinin baştan sona uygulayacağı akış

1. Ana sayfada **Başla** seçeneğine basın.
2. Manuel moddaysanız **Seçerek anlat** yolundan bir şikayet seçin; AI modu onaylıysa kamerayı da ayrıca deneyin.
3. Hasta öneriyi onaylasın; cihaz doktor ekranına geçsin.
4. Doktor iki hazır soru ve bir özel soru sorsun. Her soruda cihaz hastaya verilsin, yanıt kaydedilsin ve doktor ekranına geri dönülsün.
5. En az bir yanıt manuel verilsin. AI açıksa başka bir yanıt kamerayla verilip ayrıca onaylansın.
6. Doktor ilaçlı bir tedavi yazıp onaylasın. Hasta özeti sonuna kadar incelesin.
7. **Anlamadım, tekrar sor** akışını bir kez tamamlayın.
8. Yazdırma önizlemesini açın; A4 sayfada metin taşması, kesilen kart veya gereksiz düğme olmadığını kontrol edin.
9. Görüşmeyi bitirin. Geri, yenile ve eski sayfa adresine doğrudan gitme denemelerinde eski hasta bilgisi görünmemelidir.
10. Yeni görüşmede ilaçsız tedavi seçeneğini tamamlayın ve tekrar bitirin.
11. AI servisini kapatıp web uygulamasının manuel seçimle görüşmeyi tamamlayabildiğini kontrol edin.
12. AI açıksa kamera izni reddi, kısa kayıt, omuz/el eksikliği ve statik pozun açıklayıcı mesajla manuel seçime yönlendirdiğini kontrol edin.

Her ekip üyesi işletim sistemi, Git commit'i, `/api/ai/status` yanıtı, geçen/kalan adımlar ve hata ekranını kendi raporuna yazmalıdır. Başkasının bilgisayarındaki sonuç kopyalanmamalıdır.

## Kabul kararı

- Kritik 12 adımdan biri çalışmıyorsa: **HAZIR DEĞİL**.
- Kritik akış çalışıyor fakat kamera doğruluğu/kapsaması, hareket kapısı veya OOD hedefi geçmiyorsa: **KOŞULLU HAZIR — MANUEL DEMO**.
- Kritik akış ve tüm kamera hedefleri geçiyorsa: **HAZIR — KAMERA AI ETKİN**.

Kamera hedefleri: holdout kabul doğruluğu en az `%90`, kapsama en az `%50`, OOD yanlış kabul en fazla `%20` ve kayıt sonrası p95 en fazla `2,5 saniye`. Bu MVP tek izole işaret içindir; tıbbi tanı değildir ve hasta onayı zorunludur.

Mevcut dondurulmuş OOD yanlış kabulü `%31,63` olduğu için yeni holdout kapısı geçene kadar resmi demo kararı **KOŞULLU HAZIR — MANUEL DEMO** olarak kalır. `team_camera` sonucu bu kararı kendiliğinden değiştirmez.
