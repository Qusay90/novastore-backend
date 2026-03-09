/**
 * NovaStore Stripe Products & Prices
 * Ürünleri ve fiyatlandırma bilgilerini merkezi olarak yönet
 */

export interface StripeProduct {
  id: string;
  name: string;
  description: string;
  priceInCents: number;
  currency: string;
  image?: string;
  metadata?: Record<string, string>;
}

export const STRIPE_PRODUCTS: StripeProduct[] = [
  {
    id: "1",
    name: "Apple AirPods Pro 2",
    description: "Apple AirPods Pro 2, aktif gürültü engelleme teknolojisi ile üstün ses kalitesi sunar.",
    priceInCents: 749900, // 7499 TL
    currency: "try",
    metadata: {
      productId: "1",
      category: "Elektronik",
    },
  },
  {
    id: "2",
    name: "Samsung Galaxy Watch 6",
    description: "Samsung Galaxy Watch 6, gelişmiş sağlık izleme özellikleri ve şık tasarımıyla öne çıkar.",
    priceInCents: 529900, // 5299 TL
    currency: "try",
    metadata: {
      productId: "2",
      category: "Elektronik",
    },
  },
  {
    id: "3",
    name: "Nike Air Max 270",
    description: "Nike Air Max 270, Max Air birimi ile günlük konforu yeniden tanımlar.",
    priceInCents: 329900, // 3299 TL
    currency: "try",
    metadata: {
      productId: "3",
      category: "Moda",
    },
  },
  {
    id: "4",
    name: "Sony WH-1000XM5",
    description: "Sony WH-1000XM5, sınıfının en iyi gürültü engelleme performansını sunar.",
    priceInCents: 899900, // 8999 TL
    currency: "try",
    metadata: {
      productId: "4",
      category: "Elektronik",
    },
  },
  {
    id: "5",
    name: "Dyson V15 Detect",
    description: "Dyson V15 Detect, lazer toz algılama teknolojisi ile görünmeyen tozları bile tespit eder.",
    priceInCents: 1899900, // 18999 TL
    currency: "try",
    metadata: {
      productId: "5",
      category: "Ev & Yaşam",
    },
  },
  {
    id: "6",
    name: "Philips Hue Starter Kit",
    description: "Philips Hue Starter Kit ile evinizin aydınlatmasını akıllı hale getirin.",
    priceInCents: 249900, // 2499 TL
    currency: "try",
    metadata: {
      productId: "6",
      category: "Ev & Yaşam",
    },
  },
  {
    id: "7",
    name: "Ray-Ban Aviator Classic",
    description: "Ray-Ban Aviator Classic, zamansız tasarımı ile her tarza uyum sağlar.",
    priceInCents: 289900, // 2899 TL
    currency: "try",
    metadata: {
      productId: "7",
      category: "Moda",
    },
  },
  {
    id: "8",
    name: "Kindle Paperwhite",
    description: "Kindle Paperwhite, 6.8 inç yüksek çözünürlüklü ekranı ile gerçek kitap okuma deneyimi sunar.",
    priceInCents: 349900, // 3499 TL
    currency: "try",
    metadata: {
      productId: "8",
      category: "Kitap & Hobi",
    },
  },
];

export function getProductById(id: string): StripeProduct | undefined {
  return STRIPE_PRODUCTS.find((p) => p.id === id);
}
