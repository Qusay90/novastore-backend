export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// NovaStore - Shared Constants & Data

export const LOGO_URL = "https://files.manuscdn.com/user_upload_by_module/session_file/310519663365415954/wioGuHfFjHvUPKQw.jpg";

export const HERO_BG_URL = "https://private-us-east-1.manuscdn.com/sessionFile/injGFtb8gqZBAn2tzxt3MY/sandbox/xQH1hZWcTaQ56dYklVuNTL-img-1_1771816775000_na1fn_aGVyby1iYW5uZXI.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvaW5qR0Z0YjhncVpCQW4ydHp4dDNNWS9zYW5kYm94L3hRSDFoWldjVGFRNTZkWWtsVnVOVEwtaW1nLTFfMTc3MTgxNjc3NTAwMF9uYTFmbl9hR1Z5YnkxaVlXNXVaWEkuanBnP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=UhNe6TAAcSYzNjkWsJESwA~1WFMG4MHGAuP4sHe86hgyJjfQ~M8q5fXXcALqhFUiDlYDYjKoZd1mW2E8Z~EcknCl4bIyi6EUx5ni4pR0y2G8ZV3G0UP3r4-Jw4rebuxIvVQrFNT~sXCr1Q8aUWP~m-FGCW2x4w4tNZiqMcWmpWVLS1tV77k8wtma78AQe2Boc0ixJEjBJxuEXw5VgbDZQX2sfE0f1H5dR4kkNNcV6XbxdtNHLr0P0J0aE0DJDR6YZ~PCWH~zdrjjJWQg26EfYccpourDJnSZ~4kh~m4J4qKgF0k862F2TMH0WQcAU-4dHmyOkJorGrc7X6Oc0ntDQg__";

export const CAMPAIGN_BG_URL = "https://private-us-east-1.manuscdn.com/sessionFile/injGFtb8gqZBAn2tzxt3MY/sandbox/xQH1hZWcTaQ56dYklVuNTL-img-4_1771816776000_na1fn_Y2FtcGFpZ24tYmFubmVy.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvaW5qR0Z0YjhncVpCQW4ydHp4dDNNWS9zYW5kYm94L3hRSDFoWldjVGFRNTZkWWtsVnVOVEwtaW1nLTRfMTc3MTgxNjc3NjAwMF9uYTFmbl9ZMkZ0Y0dGcFoyNHRZbUZ1Ym1WeS5qcGc~eC1vc3MtcHJvY2Vzcz1pbWFnZS9yZXNpemUsd18xOTIwLGhfMTkyMC9mb3JtYXQsd2VicC9xdWFsaXR5LHFfODAiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjE3OTg3NjE2MDB9fX1dfQ__&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=UXNcr3m78nFESKRdNI1ZndIvPW~Gjp6TvWyBCvhN6YOt-FvfSpajw63ANa-cKtaqQUQpxJPSh3ikzYwo8Rs7McAKxEBpbsk6xUWVGhMUSLmv4lLJJqyH9n6kYX-6b3bGj6MKgUA1ocSU9v~TGzAoKqkN3xVwsGA79HViKGiGb-AUM4slWXW785kKxn-bMXlz6fd4wBHraKd-M14LgKqfvkWbANsHktVTeYSuPhDNbHK3UT6I2NEHrGWEOnI~FbnhrJKxXLQXnfRD55BPiEHL-hkHCbl7XgBCfd9nbGSqaDj7jG~ZFGuMRvOgJDXrBwLOVrZ2ieUuRnk~vsMDhxKEpA__";

export interface Product {
  id: number;
  name: string;
  price: number;
  oldPrice?: number;
  rating: number;
  reviewCount: number;
  image: string;
  category: string;
  description: string;
  features: string[];
  badge?: string;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  image: string;
  count: number;
}

export const CATEGORIES: Category[] = [
  {
    id: 1,
    name: "Elektronik",
    icon: "Smartphone",
    image: "https://private-us-east-1.manuscdn.com/sessionFile/injGFtb8gqZBAn2tzxt3MY/sandbox/xQH1hZWcTaQ56dYklVuNTL-img-2_1771816775000_na1fn_Y2F0ZWdvcnktZWxlY3Ryb25pY3M.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvaW5qR0Z0YjhncVpCQW4ydHp4dDNNWS9zYW5kYm94L3hRSDFoWldjVGFRNTZkWWtsVnVOVEwtaW1nLTJfMTc3MTgxNjc3NTAwMF9uYTFmbl9ZMkYwWldkdmNua3RaV3hsWTNSeWIyNXBZM00uanBnP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=mrtTDWVWk4hbqWYW-ROjTKNnHcMe7DkQcw7htjUPfIeTAHlSMb0eGr7jYdUw7F44-ErpL9PmxAAGIlZWEu3bWDavDd06pOrX-l377q7QzL3QxmEj7nfQMmAlzw8C0lgHkP1~HrXtEcvgPgsdcmhh2kgHbOZZhJdnhKYYkrkExeJVBqGGlUF0825dCKJh9XYHASTMeJdV0rskw1aARX2cT6DJUn6sNNFVU8OorpGd1EMpAdCxPM3-f6NXvIiCEUNsVjPTnBkgZz2wsGVRcg7sTKygEDjC7acTMLnDU7PUmNewxC3QoqJPqTfNhvJuS~SlgZh31wSCTu1LZgXk-Ih8dg__",
    count: 256,
  },
  {
    id: 2,
    name: "Moda",
    icon: "Shirt",
    image: "https://private-us-east-1.manuscdn.com/sessionFile/injGFtb8gqZBAn2tzxt3MY/sandbox/xQH1hZWcTaQ56dYklVuNTL-img-3_1771816768000_na1fn_Y2F0ZWdvcnktZmFzaGlvbg.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvaW5qR0Z0YjhncVpCQW4ydHp4dDNNWS9zYW5kYm94L3hRSDFoWldjVGFRNTZkWWtsVnVOVEwtaW1nLTNfMTc3MTgxNjc2ODAwMF9uYTFmbl9ZMkYwWldkdmNua3RabUZ6YUdsdmJnLmpwZz94LW9zcy1wcm9jZXNzPWltYWdlL3Jlc2l6ZSx3XzE5MjAsaF8xOTIwL2Zvcm1hdCx3ZWJwL3F1YWxpdHkscV84MCIsIkNvbmRpdGlvbiI6eyJEYXRlTGVzc1RoYW4iOnsiQVdTOkVwb2NoVGltZSI6MTc5ODc2MTYwMH19fV19&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=ZcwxmQbEra~S0INCK-EFqky6UabEyRn1eSdb4ygOsjmwC7Jx052I2ukJuYqXO4EDc~K6jGRTB18LrgZkC3jeu~fqbb96rqb00fKjobrlasQPUQsw~mKFu4mqfzEkOAMXaqYeUL8SauM6Tjnzs7oHmh0UcKQO4vAjCpXVnS1gA-gzEB-vR0TZLuyS8FBIWpO7~Ux-qcmCkhqolDKMIVNgfyeo4tza7ytDShAr~rRj-qMuUHaKl-MWyi-ZfKHrQHbvapL3crOA0GhjXzyroFRwxgBtzZ~FJsod5ffYThE~3fA-MgDRmC~HMQ5y4yCW~Rjwe-ylX9f1JfbYTsVtKf0s8g__",
    count: 412,
  },
  {
    id: 3,
    name: "Ev & Yaşam",
    icon: "Home",
    image: "https://private-us-east-1.manuscdn.com/sessionFile/injGFtb8gqZBAn2tzxt3MY/sandbox/xQH1hZWcTaQ56dYklVuNTL-img-5_1771816758000_na1fn_Y2F0ZWdvcnktaG9tZQ.jpg?x-oss-process=image/resize,w_1920,h_1920/format,webp/quality,q_80&Expires=1798761600&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cHM6Ly9wcml2YXRlLXVzLWVhc3QtMS5tYW51c2Nkbi5jb20vc2Vzc2lvbkZpbGUvaW5qR0Z0YjhncVpCQW4ydHp4dDNNWS9zYW5kYm94L3hRSDFoWldjVGFRNTZkWWtsVnVOVEwtaW1nLTVfMTc3MTgxNjc1ODAwMF9uYTFmbl9ZMkYwWldkdmNua3RhRzl0WlEuanBnP3gtb3NzLXByb2Nlc3M9aW1hZ2UvcmVzaXplLHdfMTkyMCxoXzE5MjAvZm9ybWF0LHdlYnAvcXVhbGl0eSxxXzgwIiwiQ29uZGl0aW9uIjp7IkRhdGVMZXNzVGhhbiI6eyJBV1M6RXBvY2hUaW1lIjoxNzk4NzYxNjAwfX19XX0_&Key-Pair-Id=K2HSFNDJXOU9YS&Signature=EgqZZVK8JKdIz3vTJUUttWn0KyQXZ55s6MADpsp23V-auV9~OOG-bEaEOc6BfEu-Pqhn1xbZfH2vebbht-wz86bg8R8dVjIS4qq5uZBBpV5Qr0ImGvJcefvVOxIs75-MkBlB4z85RSZDQm90pAjXjuzIhLFR6CM2dVUsxGmPz11bWzok8eVjZ21HLcyBduPw41ZE~WWUjOZBhSpgUKOF2-GVkVE7maq29LkosfExA5QeQXAiwjkADn~fu2D4qzWfzxmXSvvQ5nMA~SdOBmPFnfo2PWiJV7NwxC~kh7XdBGeyBbusbZiFsyGu2S0ScFPh~VJHxq2f6KtdxHwro3mhhg__",
    count: 189,
  },
  {
    id: 4,
    name: "Spor & Outdoor",
    icon: "Dumbbell",
    image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&h=600&fit=crop",
    count: 134,
  },
  {
    id: 5,
    name: "Kozmetik",
    icon: "Sparkles",
    image: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&h=600&fit=crop",
    count: 298,
  },
  {
    id: 6,
    name: "Kitap & Hobi",
    icon: "BookOpen",
    image: "https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=600&h=600&fit=crop",
    count: 176,
  },
];

export const PRODUCTS: Product[] = [
  {
    id: 1,
    name: "Apple AirPods Pro 2",
    price: 7499,
    oldPrice: 8999,
    rating: 4.8,
    reviewCount: 342,
    image: "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=500&h=500&fit=crop",
    category: "Elektronik",
    badge: "Çok Satan",
    description: "Apple AirPods Pro 2, aktif gürültü engelleme teknolojisi ile üstün ses kalitesi sunar. MagSafe şarj kutusu ve geliştirilmiş pil ömrü ile günlük kullanım için idealdir.",
    features: [
      "Aktif Gürültü Engelleme (ANC)",
      "Uyarlanabilir Şeffaflık Modu",
      "Kişiselleştirilmiş Uzamsal Ses",
      "MagSafe Şarj Kutusu",
      "IPX4 Su ve Ter Dayanıklılığı",
      "6 Saate Kadar Pil Ömrü",
    ],
  },
  {
    id: 2,
    name: "Samsung Galaxy Watch 6",
    price: 5299,
    oldPrice: 6499,
    rating: 4.6,
    reviewCount: 218,
    image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=500&fit=crop",
    category: "Elektronik",
    badge: "İndirimli",
    description: "Samsung Galaxy Watch 6, gelişmiş sağlık izleme özellikleri ve şık tasarımıyla öne çıkar.",
    features: [
      "BioActive Sensör",
      "Safir Kristal Cam",
      "Super AMOLED Ekran",
      "5ATM + IP68 Su Dayanıklılığı",
      "GPS ve NFC Desteği",
      "40 Saate Kadar Pil Ömrü",
    ],
  },
  {
    id: 3,
    name: "Nike Air Max 270",
    price: 3299,
    oldPrice: 3999,
    rating: 4.7,
    reviewCount: 567,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=500&fit=crop",
    category: "Moda",
    badge: "Trend",
    description: "Nike Air Max 270, Max Air birimi ile günlük konforu yeniden tanımlar.",
    features: [
      "Max Air Yastıklama Teknolojisi",
      "Hafif Mesh Üst Kısım",
      "Kauçuk Taban",
      "Nefes Alabilir Yapı",
      "Ergonomik Tasarım",
      "Çeşitli Renk Seçenekleri",
    ],
  },
  {
    id: 4,
    name: "Sony WH-1000XM5",
    price: 8999,
    oldPrice: 10499,
    rating: 4.9,
    reviewCount: 891,
    image: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=500&h=500&fit=crop",
    category: "Elektronik",
    badge: "Premium",
    description: "Sony WH-1000XM5, sınıfının en iyi gürültü engelleme performansını sunar.",
    features: [
      "Sınıfının En İyi ANC",
      "30mm Sürücü Birimi",
      "LDAC Codec Desteği",
      "30 Saat Pil Ömrü",
      "Çoklu Nokta Bağlantısı",
      "Katlanabilir Tasarım",
    ],
  },
  {
    id: 5,
    name: "Dyson V15 Detect",
    price: 18999,
    oldPrice: 21999,
    rating: 4.8,
    reviewCount: 156,
    image: "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=500&h=500&fit=crop",
    category: "Ev & Yaşam",
    description: "Dyson V15 Detect, lazer toz algılama teknolojisi ile görünmeyen tozları bile tespit eder.",
    features: [
      "Lazer Toz Algılama",
      "Piezo Sensör Teknolojisi",
      "240 AW Emme Gücü",
      "60 Dakika Çalışma Süresi",
      "LCD Ekran",
      "HEPA Filtrasyon",
    ],
  },
  {
    id: 6,
    name: "Philips Hue Starter Kit",
    price: 2499,
    rating: 4.5,
    reviewCount: 423,
    image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=500&h=500&fit=crop",
    category: "Ev & Yaşam",
    badge: "Yeni",
    description: "Philips Hue Starter Kit ile evinizin aydınlatmasını akıllı hale getirin.",
    features: [
      "16 Milyon Renk Seçeneği",
      "Sesli Asistan Uyumlu",
      "Bluetooth + Zigbee",
      "Zamanlayıcı ve Rutin",
      "Enerji Tasarruflu LED",
      "Kolay Kurulum",
    ],
  },
  {
    id: 7,
    name: "Ray-Ban Aviator Classic",
    price: 2899,
    rating: 4.7,
    reviewCount: 312,
    image: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&h=500&fit=crop",
    category: "Moda",
    description: "Ray-Ban Aviator Classic, zamansız tasarımı ile her tarza uyum sağlar.",
    features: [
      "Polarize Cam Lens",
      "100% UV Koruması",
      "Metal Çerçeve",
      "Ayarlanabilir Burunluk",
      "İtalyan Üretim",
      "Orijinal Kılıf Dahil",
    ],
  },
  {
    id: 8,
    name: "Kindle Paperwhite",
    price: 3499,
    oldPrice: 3999,
    rating: 4.6,
    reviewCount: 245,
    image: "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=500&h=500&fit=crop",
    category: "Kitap & Hobi",
    badge: "Popüler",
    description: "Kindle Paperwhite, 6.8 inç yüksek çözünürlüklü ekranı ile gerçek kitap okuma deneyimi sunar.",
    features: [
      "6.8 inç 300 PPI Ekran",
      "Ayarlanabilir Sıcak Işık",
      "IPX8 Su Geçirmez",
      "16 GB Depolama",
      "10 Hafta Pil Ömrü",
      "USB-C Şarj",
    ],
  },
];
