# SignBridge Tasarım Sistemi

Bu belge SignBridge arayüzünün görsel dilini ve erişilebilirlik kurallarını tanımlar.
Yeni bir ekran yazmadan önce buradaki token'ları ve bileşenleri kullan; ham renk kodu
ve rastgele punto yazma.

## 1. Tasarım İlkeleri

1. **Erişilebilirlik pazarlık konusu değil.** Kullanıcılarımız işitme engelli hastalar,
   yaşlılar ve stres altındaki sağlık çalışanları. Büyük punto, güçlü kontrast, geniş
   dokunma alanı varsayılandır — "sonra eklenecek" bir katman değil.
2. **Renk asla tek başına anlam taşımaz.** Her durum (onay, hata, rol) ikon + metin ile
   birlikte gösterilir. Renk körlüğü ve düşük ışıklı hastane ortamı için zorunlu.
3. **Her ekranda tek birincil eylem.** Ekranda en fazla bir dolu (primary) buton olur.
4. **Hasta teal, doktor lacivert.** Cihaz el değiştirdiğinde renk de değişir; kullanıcı
   ekrana bakınca sıranın kimde olduğunu bir bakışta anlar.
5. **Tek cihaz, mobil önce.** Tasarım 416px genişlikte cihaz kabuğu (`MobileShell`)
   içinde çalışır; masaüstü sadece bu kabuğu ortalar.

## 2. Renk Token'ları

Tümü `tailwind.config.ts` içinde tanımlı. Kontrast oranları beyaz zemin üzerinedir.

### Marka / Hasta akışı — `brand`
| Token | Hex | Kullanım |
| :-- | :-- | :-- |
| `brand-50` | `#E8F4F5` | yumuşak zemin, seçili kart |
| `brand-100` | `#C6E4E6` | kenarlık, hover zemin |
| `brand-300` | `#61ADB4` | odak halkası (`ring-brand-300`) |
| `brand-500` | `#0E6068` | **ana marka rengi** — birincil buton, logo (7.26:1) |
| `brand-600` | `#0A5057` | hover / metin |
| `brand-700` | `#084046` | active, yumuşak zemin üstü metin |

### Doktor akışı — `doctor`
| Token | Hex | Kullanım |
| :-- | :-- | :-- |
| `doctor-50` | `#EAF1F8` | doktor ekranı yumuşak zemin |
| `doctor-500` | `#12507E` | doktor birincil butonu (8.49:1) |
| `doctor-600` | `#0E4269` | hover / metin |

### Logo vurgusu — `mint`
Logodaki açık yeşil-turkuazdan türetildi. **`mint-300` ve altı metin için kullanılmaz**
(kontrast yetersiz); sadece gradyan, ikon dolgusu ve dekoratif alanlarda.

| Token | Hex | Kullanım |
| :-- | :-- | :-- |
| `mint-300` | `#7BC4B3` | logo açık tonu, gradyan bitişi — sadece dekoratif |
| `mint-600` | `#237066` | mint tonlarında metin için en açık izinli değer (5.86:1) |

Marka gradyanı: `bg-brand-gradient` (`#0E6068 → #2F8C80 → #7BC4B3`) — splash, handoff ve
"görüşme tamamlandı" ekranlarında. Yumuşak hâli: `bg-brand-gradient-soft`.

### Anlamsal renkler
| Token | Hex | Anlam | Yanında zorunlu ikon |
| :-- | :-- | :-- | :-- |
| `success-500` | `#0F7A4A` | onaylandı, doğru tahmin | ✓ tik |
| `warning-500` | `#8A5300` | düşük güven skoru, dikkat | ! üçgen |
| `danger-500` | `#A4262C` | hata, görüşmeyi bitir, sil | × / çöp |

### Yüzey ve metin
| Token | Hex | Kullanım |
| :-- | :-- | :-- |
| `surface-canvas` | `#FAFBFD` | sayfa zemini (kabuğun dışı) |
| `surface` | `#FFFFFF` | kart ve kabuk zemini |
| `surface-subtle` | `#F1F5F9` | pasif alan, ghost hover |
| `line` | `#E2E8F0` | standart kenarlık |
| `line-strong` | `#CBD5E1` | çerçeveli buton, pasif adım noktası |
| `ink` | `#0B1220` | başlıklar (16.9:1) |
| `ink-body` | `#334155` | gövde metni (10.35:1) |
| `ink-muted` | `#475569` | ikincil metin (7.58:1) — **en açık izinli metin rengi** |

> Kural: metin için `ink-muted`'tan daha açık bir gri kullanılmaz. Placeholder da dahil.

## 3. Tipografi

Taban punto **18px** (normalde 16px olur — hedef kitlemiz için büyüttük). En küçük
metin 15px; bunun altına inilmez.

| Token | Boyut | Kullanım |
| :-- | :-- | :-- |
| `text-display` | 40px / 800 | splash ekranı marka adı |
| `text-h1` | 34px / 800 | ekran başlığı |
| `text-h2` | 28px / 700 | bölüm başlığı, AI tahmini metni |
| `text-h3` | 22px / 700 | kart başlığı |
| `text-lead` | 20px | öne çıkan gövde, XL buton |
| `text-base` | 18px | gövde metni (varsayılan) |
| `text-label` | 16px / 600 | form etiketi, badge, md buton |
| `text-caption` | 15px | yardımcı metin, adım göstergesi |

Yazı tipi: `"Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif` — sistem
fontu, ek ağ isteği yok, Türkçe karakterler sorunsuz.

## 4. Ölçü, Yuvarlaklık, Gölge

**Dokunma alanları** (WCAG 2.5.5 hedefi 44px; biz üstüne çıkıyoruz):

| Token | Boyut | Kullanım |
| :-- | :-- | :-- |
| `tap` | 56px | tüm butonların minimumu |
| `tap-lg` | 64px | ekranın birincil eylemi |
| `tap-xl` | 72px | kamera / kayıt gibi kritik eylemler |

**Yuvarlaklık:** `rounded-sm` 10px · `rounded` 14px · `rounded-md` 16px ·
`rounded-lg` 20px (kart ve buton varsayılanı) · `rounded-xl` 24px · `rounded-2xl` 32px (logo plakası)

**Gölge:** `shadow-card` (kart) · `shadow-raised` (kabuk, hover) · `shadow-brand` /
`shadow-doctor` (birincil butonlar)

**Odak:** her yerde 4px halka + 2px boşluk. `globals.css` içinde `:focus-visible`
global olarak tanımlı; bileşenlerde `focus-visible:ring focus-visible:ring-brand-300`.
Odak halkasını asla kaldırma.

## 5. Bileşenler

Hepsi `app/components/` altında; `cn()` yardımcısı `lib/utils.ts` içinde (mevcut `lib/` klasörüyle birlikte kaldı).

### `app/components/ui/Button.tsx`
```tsx
<Button variant="primary" size="lg" icon={<CameraIcon />}>Başla</Button>
<Button variant="doctor" href="/doctor/questions">Devam</Button>
<Button variant="outline" fullWidth={false}>Tekrar dene</Button>
<Button variant="danger" icon={<XIcon />}>Görüşmeyi bitir</Button>
```
- Varyantlar: `primary` (hasta) · `doctor` · `secondary` · `outline` · `ghost` · `danger`
- Boyutlar: `md` 56px · `lg` 64px (varsayılan) · `xl` 72px
- `fullWidth` varsayılan **true** (mobil akış).
- `href` verilirse `next/link` olarak render edilir.
- `loading` durumunda spinner + `aria-busy`.

### `app/components/ui/IconButton.tsx`
Metinsiz buton. `label` **zorunludur** → `aria-label` + `title` olarak basılır.
Görsel kutu küçük görünse de dokunma alanı 56px'in altına inmez.

### `app/components/ui/Card.tsx`
```tsx
<Card title="Başım ağrıyor" description="Güven: %92" icon={<HeadIcon />} />
<Card interactive selected tone="brand">Baş ağrısı</Card>
<Card tone="warning" title="Düşük güven" description="Manuel seçim önerilir" />
```
Seçili durum renkle **birlikte** kalın kenar + tik ikonu gösterir.

### `app/components/ui/RoleBadge.tsx`
`role="hasta" | "doktor"`. İkon + metin birlikte; ekran okuyucuya "Cihaz şu anda: Hasta"
olarak okunur.

### `app/components/ui/StepIndicator.tsx`
Noktalar dekoratif (`aria-hidden`), ilerleme her zaman "2 / 5" olarak yazıyla da verilir.

### `app/components/layout/Logo.tsx`
Logo dekoratif (`alt=""`), marka adı metin olarak. `withWordmark` ile "SignBridge"
yazısı, `plate` ile yumuşak marka zemini.

### `app/components/layout/AppHeader.tsx`
```tsx
<AppHeader role="hasta" step={{ current: 2, total: 5, label: "Onay" }} />
```
Sticky, 64px, logo + rol rozeti; `step` verilirse altında ilerleme şeridi.

### `app/components/layout/MobileShell.tsx`
Kabuk + "İçeriğe geç" atlama bağlantısı + `<main id="icerik">`. Her sayfa bunun içinde.

## 6. Erişilebilirlik Kontrol Listesi

Her yeni ekran için:

- [ ] Tek `<h1>` var ve ekranın amacını söylüyor.
- [ ] Tüm interaktif öğeler klavye ile sırayla gezilebiliyor, odak halkası görünüyor.
- [ ] İkon-only butonların `label`'ı var.
- [ ] Hiçbir bilgi sadece renkle verilmemiş (ikon veya metin eşlik ediyor).
- [ ] Metin renkleri `ink-muted` ve daha koyu.
- [ ] Dokunma alanları ≥ 56px ve aralarında ≥ 8px boşluk var.
- [ ] Durum değişimleri (AI tahmini geldi, doktora geçildi) `aria-live="polite"` ile
      duyuruluyor.
- [ ] Kamera/animasyon içeren ekranlar `prefers-reduced-motion` altında da çalışıyor.
- [ ] 200% tarayıcı yakınlaştırmada içerik kesilmiyor, yatay kaydırma çıkmıyor.
- [ ] Tüm metinler Türkçe ve `<html lang="tr">` ayarlı.

## 7. Akış Renk Haritası

| Ekran | Rol | Ana renk | Adım |
| :-- | :-- | :-- | :-- |
| `/` splash | — | `brand-gradient` | — |
| `/camera` | hasta | `brand` | 1 / 5 |
| `/recognition` | hasta | `brand` | 2 / 5 |
| `/confirm` | hasta | `brand` | 2 / 5 |
| `/manual-select`, `/fallback` | hasta | `brand` + `warning` | 2 / 5 |
| `/patient/duration`, `/intensity`, `/summary` | hasta | `brand` | 3 / 5 |
| `/handoff/doctor` | geçiş | `brand-gradient` | — |
| `/doctor/questions`, `/conversation`, `/result` | doktor | `doctor` | 4 / 5 |
| `/handoff/patient` | geçiş | `brand-gradient` | — |
| `/complete` | — | `success` | 5 / 5 |
