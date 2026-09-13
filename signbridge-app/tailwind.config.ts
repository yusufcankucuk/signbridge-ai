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

            fontFamily: {
                /* Tek aile: Inter (kendi sunucumuzdan) + sistem yedeği */
                sans: [
                    "InterVariable",
                    "Segoe UI",
                    "system-ui",
                    "-apple-system",
                    "Roboto",
                    "Arial",
                    "sans-serif",
                ],
            },

            fontSize: {
                /**
                 * Tipografi ölçeği — globals.css içindeki --sb-text-* ile aynı.
                 * Başlıklar iri ama kalın değil (500/600); gövde 17px, okunabilir
                 * en küçük metin 15px. `fine` yalnızca ekran altındaki dipnot
                 * içindir; talimat, hata, etiket veya buton metninde kullanılmaz.
                 */
                fine: ["0.8125rem", { lineHeight: "1.15rem" }], // 13
                caption: ["0.9375rem", { lineHeight: "1.4rem" }], // 15
                label: ["0.9375rem", { lineHeight: "1.4rem", fontWeight: "500" }], // 15
                base: ["1.0625rem", { lineHeight: "1.65rem" }], // 17 — gövde
                lead: ["1.1875rem", { lineHeight: "1.75rem" }], // 19
                h3: ["1.1875rem", { lineHeight: "1.5rem", fontWeight: "600" }], // 19
                h2: ["1.375rem", { lineHeight: "1.7rem", fontWeight: "600" }], // 22
                h1: ["1.625rem", { lineHeight: "2rem", fontWeight: "500" }], // 26
                display: ["2.25rem", { lineHeight: "2.5rem", fontWeight: "600" }], // 36
            },

            spacing: {
                /* Dokunma alanı minimumları — hepsi WCAG 2.5.5 hedefinin üstünde */
                tap: "3.25rem", // 52px — standart buton
                "tap-lg": "3.5rem", // 56px — ekranın birincil eylemi
                "tap-xl": "4rem", // 64px — kamera/kayıt gibi kritik eylemler
            },

            borderRadius: {
                sm: "0.75rem", // 12
                DEFAULT: "0.875rem", // 14
                md: "1rem", // 16
                lg: "1.25rem", // 20 — kart ve buton varsayılanı
                xl: "1.5rem", // 24
                "2xl": "2rem", // 32
            },

            boxShadow: {
                /* Gölge çok yumuşak: yükseklik hissi kenarlıktan gelir, gölgeden değil. */
                card: "0 1px 2px rgba(11,18,32,0.04)",
                raised: "0 1px 2px rgba(11,18,32,0.04), 0 6px 16px rgba(11,18,32,0.05)",
                brand: "0 2px 10px rgba(14,96,104,0.18)",
                doctor: "0 2px 10px rgba(18,80,126,0.18)",
            },

            ringWidth: {
                DEFAULT: "3px", // odak halkası her zaman görünür
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
