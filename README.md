# SignBridge 🌉

SignBridge, sağlık ortamlarında Türk İşaret Dili (TİD) kullanan hastalar ile işaret dili bilmeyen sağlık çalışanları arasında güvenli, çift yönlü iletişim kurmayı sağlayan yapay zeka destekli bir yardımcı sistemdir[cite: 1]. Bu depo, projenin "Önce Web" (Web-First) MVP sürümünü barındıran monorepo yapısıdır.

## 🔄 Geliştirme İş Akışı (GitHub Flow)

1.  **Ana Dallar:** `main` dalı her zaman çalışan ve demoya hazır kodu barındırır. Entegrasyonlar `develop` dalında birleştirilir.
2.  **Feature Branch Kullanımı:** Yeni görevler için `feature/kisa-aciklama` formatında kısa ömürlü dallar açın.
3.  **Pull Request (PR):** Değişiklikler `develop` dalına PR açılarak birleştirilir. En az bir kişi kod incelemesi (Code Review) yapmalıdır. 
4.  **Entegrasyon Kuralı:** PR birleştirilirken projenin uçtan uca (Hasta -> Onay -> Doktor) tek cihazda çalıştığından ve `npm run build` komutunun hatasız tamamlandığından emin olunmalıdır.

## 🏗 Mimari ve Teknoloji Yığını

*   **Frontend (Web/Mobil Geçişli):** Next.js (App Router), React, Tailwind CSS. Görüntüden iskelet çıkarma işlemi MediaPipe JS ile doğrudan tarayıcıda yapılır[cite: 1].
*   **Backend & API:** Next.js API Routes (Node.js).
*   **Veritabanı:** Supabase (Gerçek zamanlı akış) / Huawei GaussDB.
*   **AI & Bulut Çekirdeği:** Huawei ModelArts (Çıkarım REST API), Huawei OBS (Model ve veri depolama)[cite: 1].
*   **AI Eğitimi:** Python, PyTorch/MindSpore, 1D CNN/GRU[cite: 1].

\`\`\`bash
## 📂 Amaca Yönelik Depo Yapısı

* **`ai-training/`**: AI Veri hazırlığı, landmark çıkarımı (Python) ve ModelArts eğitim scriptleri.
* **`signbridge-app/`**: Next.js Uygulaması (Kamera UI, Hasta/Doktor Ekranları, API Route'ları).
* **`infrastructure/`**: AI API Mock JSON sözleşmeleri, veritabanı şemaları ve bulut ayarları.
* **`docs/`**: Proje dokümantasyonu ve mimari kararlar.
\`\`\`

## 🚀 Kurulum ve Çalıştırma

### Web (Next.js) Ortamını Başlatma
\`\`\`bash
cd web
npm install
npm run dev
\`\`\`
Uygulama `http://localhost:3000` adresinde çalışacaktır. Ortam değişkenlerini `.env.local` dosyasına eklemeyi unutmayın.

### AI Ortamını Başlatma
\`\`\`bash
cd ai
python -m venv venv
source venv/bin/activate  # Windows için: venv\Scripts\activate
pip install -r requirements.txt
\`\`\`

