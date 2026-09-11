import type { Config } from "tailwindcss";

/**
 * SignBridge Tasarım Sistemi — Tailwind token'ları
 *
 * Erişilebilirlik öncelikli kararlar:
 *  - Taban font boyutu 18px (fs-base), en küçük metin 15px.
 *  - Tüm dokunma alanları en az 56px (min-h-tap).
 *  - Metin renkleri beyaz zeminde en az 4.5:1 kontrast sağlar.
 *  - Renk asla tek başına anlam taşımaz; ikon + etiket ile desteklenir.
 */
const config: Config = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/**/*.{js,ts,jsx,tsx,mdx}",
    ],

    theme: {
        extend: {
            colors: {
                /* Marka / hasta akışı — teal */
                brand: {
                    50: "#E8F4F5",
                    100: "#C6E4E6",
                    200: "#96CCD1",
                    300: "#61ADB4",
                    400: "#2E8A92",
                    500: "#0E6068", // ana marka rengi (beyaz üzerinde 6.6:1)
                    600: "#0A5057",
                    700: "#084046",
                    800: "#063034",
                    900: "#042023",
                    /**
                     * Kelime markasındaki "Bridge" tonu (logodan alındı).
                     * Beyaz üzerinde 3.44:1 — sadece BÜYÜK ve KALIN metin için
                     * (≥24px veya ≥19px bold). Gövde metninde kullanılmaz.
                     */
                    accent: "#119A98",
                },

                /* Logodaki açık yeşil-turkuaz — dekoratif vurgu (gradyan, ikon dolgusu).
                   mint-300 ve altı METİN İÇİN KULLANILMAZ (beyaz üzerinde kontrast yetersiz). */
                mint: {
                    50: "#EAF6F3",
                    100: "#CDEBE4",
                    200: "#A6DACE",
                    300: "#7BC4B3", // logo açık tonu
                    400: "#4FA99B",
                    500: "#2F8C80",
                    600: "#237066", // metin için en açık izinli mint tonu (4.6:1)
                },

                /* Doktor akışı — lacivert (teal'den renk körlüğünde de ayrışır) */
                doctor: {
                    50: "#EAF1F8",
                    100: "#CBDCEE",
                    200: "#9CBBDA",
                    300: "#6795C2",
                    400: "#356FA4",
                    500: "#12507E", // beyaz üzerinde 7.1:1
                    600: "#0E4269",
                    700: "#0B3453",
                    800: "#08273E",
                    900: "#051A2A",
                },

                /* Anlamsal renkler — hepsi beyaz üzerinde >= 4.5:1 */
                success: {
                    50: "#E7F4EE",
                    100: "#C3E5D4",
                    500: "#0F7A4A",
                    600: "#0B633C",
                    700: "#084C2E",
                },
                warning: {
                    50: "#FBF2E3",
                    100: "#F5E0BC",
                    500: "#8A5300",
                    600: "#6F4200",
                    700: "#553300",
                },
                danger: {
                    50: "#FBECEC",
                    100: "#F4CDCE",
                    500: "#A4262C",
                    600: "#851E23",
                    700: "#66171B",
                },

                /* Yüzeyler ve metin */
                surface: {
                    canvas: "#FAFBFD",
                    DEFAULT: "#FFFFFF",
                    subtle: "#F1F5F9",
                    sunken: "#E8EDF3",
                },
                line: {
                    DEFAULT: "#E2E8F0",
                    strong: "#CBD5E1",
                },
                ink: {
                    DEFAULT: "#0B1220", // başlıklar (16.9:1)
                    body: "#334155", // gövde metni (10.4:1)
                    muted: "#475569", // ikincil metin (7.5:1) — en açık izinli metin rengi
                    inverse: "#FFFFFF",
                },
            },

            backgroundImage: {
                /* Logodan türeyen marka gradyanı — splash, handoff, tamamlandı ekranları */
                "brand-gradient":
                    "linear-gradient(135deg, #0E6068 0%, #2F8C80 55%, #7BC4B3 100%)",
                "brand-gradient-soft":
                    "linear-gradient(135deg, #EAF6F3 0%, #E8F4F5 100%)",
            },

            fontSize: {
                /**
                 * Erişilebilirlik: gövde ve yönlendirme metni 15px'in altına inmez.
                 * `fine` bunun tek istisnası — ekran altındaki tamamlayıcı
                 * dipnotlar için (mahremiyet notu gibi). Talimat, hata mesajı,
                 * etiket veya buton metninde ASLA kullanılmaz.
                 */
                fine: ["0.84375rem", { lineHeight: "1.2rem" }], // 13.5
                caption: ["0.9375rem", { lineHeight: "1.4rem" }], // 15
                label: ["1rem", { lineHeight: "1.5rem", fontWeight: "600" }], // 16
                base: ["1.125rem", { lineHeight: "1.75rem" }], // 18 — gövde
                lead: ["1.25rem", { lineHeight: "1.9rem" }], // 20
                h3: ["1.375rem", { lineHeight: "1.85rem", fontWeight: "700" }], // 22
                h2: ["1.75rem", { lineHeight: "2.2rem", fontWeight: "700" }], // 28
                h1: ["2.125rem", { lineHeight: "2.5rem", fontWeight: "800" }], // 34
                display: ["2.5rem", { lineHeight: "2.85rem", fontWeight: "800" }], // 40
            },

            spacing: {
                /* Dokunma alanı minimumları */
                tap: "3.5rem", // 56px — WCAG 2.5.5 üzeri
                "tap-lg": "4rem", // 64px — birincil eylemler
                "tap-xl": "4.5rem", // 72px — kamera/kayıt gibi kritik eylemler
            },

            borderRadius: {
                sm: "0.625rem", // 10
                DEFAULT: "0.875rem", // 14
                md: "1rem", // 16
                lg: "1.25rem", // 20
                xl: "1.5rem", // 24
                "2xl": "2rem", // 32 — logo / büyük kartlar
            },

            boxShadow: {
                card: "0 1px 2px rgba(11,18,32,0.04), 0 4px 16px rgba(11,18,32,0.06)",
                raised: "0 6px 20px rgba(11,18,32,0.10)",
                brand: "0 4px 14px rgba(14,96,104,0.22)",
                doctor: "0 4px 14px rgba(18,80,126,0.22)",
            },

            ringWidth: {
                DEFAULT: "4px", // odak halkası her zaman kalın
            },

            maxWidth: {
                shell: "26rem", // 416px — mobil kabuk genişliği
            },

            minHeight: {
                shell: "38.75rem", // 620px
            },

            transitionDuration: {
                DEFAULT: "180ms",
            },
        },
    },

    plugins: [],
};

export default config;
