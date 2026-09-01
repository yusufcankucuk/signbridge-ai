# SignBridge 🌉

SignBridge, sağlık ortamlarında Türk İşaret Dili (TİD) kullanan hastalar ile işaret dili bilmeyen sağlık çalışanları arasında güvenli, çift yönlü iletişim kurmayı sağlayan yapay zeka destekli bir yardımcı sistemdir[cite: 1]. Bu depo, projenin "Önce Web" (Web-First) MVP sürümünü[cite: 1] barındıran monorepo yapısıdır.

## 🏗 Mimari ve Teknoloji Yığını

*   **Frontend (Web/Mobil Geçişli):** Next.js (App Router), React, Tailwind CSS. Görüntüden iskelet çıkarma işlemi MediaPipe JS ile doğrudan tarayıcıda yapılır[cite: 1].
*   **Backend & API:** Next.js API Routes (Node.js).
*   **Veritabanı:** Supabase (Gerçek zamanlı akış) / Huawei GaussDB.
*   **AI & Bulut Çekirdeği:** Huawei ModelArts (Çıkarım REST API), Huawei OBS (Model ve veri depolama)[cite: 1].
*   **AI Eğitimi:** Python, PyTorch/MindSpore, 1D CNN/GRU[cite: 1].

## 📂 Depo Yapısı

\`\`\`bash
signbridge/
├── ai/                 # AI denemeleri, landmark çıkarımı ve model eğitim scriptleri
├── web/                # Next.js uygulaması (Kamera UI, MediaPipe JS, API Route'ları)
├── cloud/              # Huawei Cloud servis yapılandırmaları ve Veritabanı SQL şemaları
└── docs/               # API dokümantasyonu, test raporları ve E2E senaryoları
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

## 🔄 Geliştirme İş Akışı (GitHub Flow)

1.  **Ana Dallar:** `main` dalı her zaman çalışan ve demoya hazır kodu barındırır. Entegrasyonlar `develop` dalında birleştirilir.
2.  **Feature Branch Kullanımı:** Geliştirmeler için kısa ömürlü dallar açın (örn: `feat/camera-ui`, `fix/threshold-bug`).
3.  **Pull Request (PR):** Kod repoya gönderildiğinde ilgili bileşenin sahibi dışında en az bir kişi kod incelemesi (Code Review) yapmalıdır[cite: 1]. 
4.  **Entegrasyon Kuralı:** Gün sonunda veya PR birleştirilirken projenin uçtan uca (Kamera -> Tanıma -> Onay -> Doktor Kartı) çalıştığından emin olunmalıdır[cite: 1]. Kırık kod `develop` veya `main` dalına alınmaz.