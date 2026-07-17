const makeCategory = ({
  id,
  name,
  slug,
  parentId = null,
  parentPath = "",
  sortOrder = 0,
  active = true,
  customerVisible = true,
  archived = false,
}) => {
  const path = parentPath ? `${parentPath}/${slug}` : slug;
  return Object.freeze({
    id,
    name,
    slug,
    parentId,
    path,
    canonicalPath: path,
    depth: parentPath ? parentPath.split("/").length + 1 : 1,
    sortOrder,
    active,
    customerVisible,
    archived,
    seoDescription: `${name} kategorisinde özenle seçilmiş ürünleri karşılaştır, filtrele ve güvenle keşfet.`,
  });
};

/**
 * The public taxonomy uses parent-qualified paths, so a label such as “Giyim”
 * can safely exist below multiple parents without creating ambiguous routes.
 */
export const categories = Object.freeze([
  makeCategory({ id: "electronics", name: "Elektronik", slug: "elektronik", sortOrder: 10 }),
  makeCategory({
    id: "phones",
    name: "Telefon",
    slug: "telefon",
    parentId: "electronics",
    parentPath: "elektronik",
    sortOrder: 10,
  }),
  makeCategory({
    id: "mobile-phones",
    name: "Cep Telefonu",
    slug: "cep-telefonu",
    parentId: "phones",
    parentPath: "elektronik/telefon",
    sortOrder: 10,
  }),
  makeCategory({
    id: "phone-accessories-empty",
    name: "Telefon Aksesuarları",
    slug: "telefon-aksesuarlari",
    parentId: "phones",
    parentPath: "elektronik/telefon",
    sortOrder: 20,
  }),
  makeCategory({
    id: "computers-tablets",
    name: "Bilgisayar & Tablet",
    slug: "bilgisayar-tablet",
    parentId: "electronics",
    parentPath: "elektronik",
    sortOrder: 20,
  }),
  makeCategory({
    id: "laptops",
    name: "Dizüstü Bilgisayar",
    slug: "dizustu-bilgisayar",
    parentId: "computers-tablets",
    parentPath: "elektronik/bilgisayar-tablet",
    sortOrder: 10,
  }),
  makeCategory({
    id: "sound-vision",
    name: "TV, Ses & Görüntü",
    slug: "tv-ses-goruntu",
    parentId: "electronics",
    parentPath: "elektronik",
    sortOrder: 30,
  }),
  makeCategory({
    id: "headphones",
    name: "Kulaklık",
    slug: "kulaklik",
    parentId: "sound-vision",
    parentPath: "elektronik/tv-ses-goruntu",
    sortOrder: 10,
  }),
  makeCategory({
    id: "wearable-tech",
    name: "Giyilebilir Teknoloji",
    slug: "giyilebilir-teknoloji",
    parentId: "electronics",
    parentPath: "elektronik",
    sortOrder: 40,
  }),
  makeCategory({
    id: "smart-watches",
    name: "Akıllı Saat",
    slug: "akilli-saat",
    parentId: "wearable-tech",
    parentPath: "elektronik/giyilebilir-teknoloji",
    sortOrder: 10,
  }),

  makeCategory({ id: "fashion", name: "Moda & Giyim", slug: "moda-giyim", sortOrder: 20 }),
  makeCategory({
    id: "women",
    name: "Kadın",
    slug: "kadin",
    parentId: "fashion",
    parentPath: "moda-giyim",
    sortOrder: 10,
  }),
  makeCategory({
    id: "women-clothing",
    name: "Giyim",
    slug: "giyim",
    parentId: "women",
    parentPath: "moda-giyim/kadin",
    sortOrder: 10,
  }),
  makeCategory({
    id: "women-dresses",
    name: "Elbise",
    slug: "elbise",
    parentId: "women-clothing",
    parentPath: "moda-giyim/kadin/giyim",
    sortOrder: 10,
  }),
  makeCategory({
    id: "men",
    name: "Erkek",
    slug: "erkek",
    parentId: "fashion",
    parentPath: "moda-giyim",
    sortOrder: 20,
  }),
  makeCategory({
    id: "men-clothing",
    name: "Giyim",
    slug: "giyim",
    parentId: "men",
    parentPath: "moda-giyim/erkek",
    sortOrder: 10,
  }),
  makeCategory({
    id: "men-sweatshirts",
    name: "Sweatshirt",
    slug: "sweatshirt",
    parentId: "men-clothing",
    parentPath: "moda-giyim/erkek/giyim",
    sortOrder: 10,
  }),
  makeCategory({
    id: "kids-fashion",
    name: "Çocuk",
    slug: "cocuk",
    parentId: "fashion",
    parentPath: "moda-giyim",
    sortOrder: 30,
  }),
  makeCategory({
    id: "kids-clothing",
    name: "Giyim",
    slug: "giyim",
    parentId: "kids-fashion",
    parentPath: "moda-giyim/cocuk",
    sortOrder: 10,
  }),
  makeCategory({
    id: "kids-coats",
    name: "Mont",
    slug: "mont",
    parentId: "kids-clothing",
    parentPath: "moda-giyim/cocuk/giyim",
    sortOrder: 10,
  }),
  makeCategory({
    id: "fashion-outlet-archived",
    name: "Outlet",
    slug: "outlet",
    parentId: "fashion",
    parentPath: "moda-giyim",
    sortOrder: 90,
    active: false,
    customerVisible: false,
    archived: true,
  }),
  makeCategory({
    id: "outlet-basics-archived",
    name: "Sezon Sonu",
    slug: "sezon-sonu",
    parentId: "fashion-outlet-archived",
    parentPath: "moda-giyim/outlet",
    sortOrder: 10,
  }),

  makeCategory({ id: "home-living", name: "Ev & Yaşam", slug: "ev-yasam", sortOrder: 30 }),
  makeCategory({
    id: "home-appliances",
    name: "Elektrikli Ev Aletleri",
    slug: "elektrikli-ev-aletleri",
    parentId: "home-living",
    parentPath: "ev-yasam",
    sortOrder: 10,
  }),
  makeCategory({
    id: "vacuum-cleaners",
    name: "Süpürge",
    slug: "supurge",
    parentId: "home-appliances",
    parentPath: "ev-yasam/elektrikli-ev-aletleri",
    sortOrder: 10,
  }),
  makeCategory({
    id: "home-textile",
    name: "Ev Tekstili",
    slug: "ev-tekstili",
    parentId: "home-living",
    parentPath: "ev-yasam",
    sortOrder: 20,
  }),
  makeCategory({
    id: "bedding",
    name: "Nevresim Takımı",
    slug: "nevresim-takimi",
    parentId: "home-textile",
    parentPath: "ev-yasam/ev-tekstili",
    sortOrder: 10,
  }),

  makeCategory({
    id: "beauty",
    name: "Kozmetik & Kişisel Bakım",
    slug: "kozmetik-kisisel-bakim",
    sortOrder: 40,
  }),
  makeCategory({
    id: "skin-care",
    name: "Cilt Bakımı",
    slug: "cilt-bakimi",
    parentId: "beauty",
    parentPath: "kozmetik-kisisel-bakim",
    sortOrder: 10,
  }),
  makeCategory({
    id: "face-cleansing",
    name: "Yüz Temizleme",
    slug: "yuz-temizleme",
    parentId: "skin-care",
    parentPath: "kozmetik-kisisel-bakim/cilt-bakimi",
    sortOrder: 10,
  }),

  makeCategory({ id: "sports-outdoor", name: "Spor & Outdoor", slug: "spor-outdoor", sortOrder: 50 }),
  makeCategory({
    id: "sports-clothing",
    name: "Spor Giyim",
    slug: "spor-giyim",
    parentId: "sports-outdoor",
    parentPath: "spor-outdoor",
    sortOrder: 10,
  }),
  makeCategory({
    id: "running-clothing",
    name: "Koşu Giyim",
    slug: "kosu-giyim",
    parentId: "sports-clothing",
    parentPath: "spor-outdoor/spor-giyim",
    sortOrder: 10,
  }),

  makeCategory({
    id: "mother-child-toys",
    name: "Anne, Çocuk & Oyuncak",
    slug: "anne-cocuk-oyuncak",
    sortOrder: 60,
  }),
  makeCategory({
    id: "baby",
    name: "Bebek",
    slug: "bebek",
    parentId: "mother-child-toys",
    parentPath: "anne-cocuk-oyuncak",
    sortOrder: 10,
  }),
  makeCategory({
    id: "baby-safety-empty",
    name: "Bebek Güvenliği",
    slug: "bebek-guvenligi",
    parentId: "baby",
    parentPath: "anne-cocuk-oyuncak/bebek",
    sortOrder: 10,
  }),
  makeCategory({
    id: "toys",
    name: "Oyuncak",
    slug: "oyuncak",
    parentId: "mother-child-toys",
    parentPath: "anne-cocuk-oyuncak",
    sortOrder: 20,
  }),
  makeCategory({
    id: "educational-toys",
    name: "Eğitici Oyuncak",
    slug: "egitici-oyuncak",
    parentId: "toys",
    parentPath: "anne-cocuk-oyuncak/oyuncak",
    sortOrder: 10,
  }),
]);

const product = (value) =>
  Object.freeze({
    active: true,
    customerVisible: true,
    deletedAt: null,
    ...value,
    features: Object.freeze([...value.features]),
  });

export const products = Object.freeze([
  product({
    id: "NS-1001",
    featuredRank: 40,
    slug: "apple-iphone-15-128-gb-siyah",
    name: "Apple iPhone 15 128 GB",
    categoryId: "mobile-phones",
    brand: "Apple",
    price: 51999,
    oldPrice: 55999,
    rating: 4.8,
    reviews: 1247,
    stock: 18,
    fastDelivery: true,
    color: "Siyah",
    storage: "128 GB",
    badge: "Çok Satan",
    imageKey: "phone-iphone",
    description: "Dynamic Island, gelişmiş çift kamera sistemi ve uzun pil ömrüyle güçlü bir günlük deneyim.",
    features: ["6.1 inç Super Retina XDR", "A16 Bionic", "48 MP ana kamera", "USB-C bağlantı"],
  }),
  product({
    id: "NS-1002",
    featuredRank: 50,
    slug: "samsung-galaxy-s24-256-gb-mor",
    name: "Samsung Galaxy S24 256 GB",
    categoryId: "mobile-phones",
    brand: "Samsung",
    price: 38999,
    oldPrice: 42999,
    rating: 4.7,
    reviews: 864,
    stock: 9,
    fastDelivery: true,
    color: "Mor",
    storage: "256 GB",
    badge: "Sepette İndirim",
    imageKey: "phone-samsung",
    description: "Galaxy AI özellikleri, parlak AMOLED ekranı ve kompakt tasarımıyla yeni nesil akıllı telefon.",
    features: ["6.2 inç Dynamic AMOLED", "Galaxy AI", "50 MP kamera", "IP68 dayanıklılık"],
  }),
  product({
    id: "NS-1003",
    featuredRank: 70,
    slug: "xiaomi-redmi-note-13-pro-256-gb",
    name: "Xiaomi Redmi Note 13 Pro 256 GB",
    categoryId: "mobile-phones",
    brand: "Xiaomi",
    price: 16999,
    oldPrice: 18999,
    rating: 4.6,
    reviews: 2031,
    stock: 0,
    fastDelivery: false,
    color: "Gece Siyahı",
    storage: "256 GB",
    badge: "Tükendi",
    imageKey: "phone-xiaomi",
    description: "Yüksek çözünürlüklü kamerası ve hızlı şarj desteğiyle fiyat-performans odaklı güçlü model.",
    features: ["200 MP OIS kamera", "120 Hz AMOLED", "67 W hızlı şarj", "5.000 mAh pil"],
  }),
  product({
    id: "NS-1017",
    featuredRank: 60,
    slug: "google-pixel-9-128-gb-porselen",
    name: "Google Pixel 9 128 GB",
    categoryId: "mobile-phones",
    brand: "Google",
    price: 42999,
    oldPrice: 45999,
    rating: 4.7,
    reviews: 318,
    stock: 5,
    fastDelivery: true,
    color: "Porselen",
    storage: "128 GB",
    badge: "Yeni",
    imageKey: "phone",
    description: "Yapay zekâ destekli kamera sistemi, temiz Android deneyimi ve güçlü güvenlik özellikleriyle premium akıllı telefon.",
    features: ["6.3 inç OLED ekran", "Google Tensor G4", "50 MP çift kamera", "7 yıl güncelleme desteği"],
  }),
  product({
    id: "NS-1004",
    featuredRank: 10,
    slug: "apple-macbook-air-m3-13-inc-256-gb",
    name: "Apple MacBook Air M3 13 inç 256 GB",
    categoryId: "laptops",
    brand: "Apple",
    price: 46999,
    oldPrice: 49999,
    rating: 4.9,
    reviews: 392,
    stock: 6,
    fastDelivery: true,
    color: "Gece Yarısı",
    storage: "256 GB",
    badge: "Yeni",
    imageKey: "laptop",
    description: "Sessiz, hafif ve gün boyu süren pil performansına sahip M3 çipli ince dizüstü bilgisayar.",
    features: ["Apple M3 çip", "8 GB birleşik bellek", "13.6 inç Liquid Retina", "18 saate kadar pil"],
  }),
  product({
    id: "NS-1005",
    featuredRank: 80,
    slug: "lenovo-ideapad-slim-5-512-gb",
    name: "Lenovo IdeaPad Slim 5 512 GB",
    categoryId: "laptops",
    brand: "Lenovo",
    price: 27499,
    oldPrice: 29999,
    rating: 4.5,
    reviews: 218,
    stock: 3,
    fastDelivery: true,
    color: "Bulut Gri",
    storage: "512 GB",
    badge: "Sınırlı Stok",
    imageKey: "laptop",
    description: "Metal gövdesi, canlı OLED ekranı ve hızlı SSD'siyle iş ve günlük kullanım için dengeli performans.",
    features: ["AMD Ryzen 7", "16 GB RAM", "512 GB SSD", "14 inç OLED ekran"],
  }),
  product({
    id: "NS-1006",
    featuredRank: 20,
    slug: "sony-wh-1000xm5-kablosuz-kulaklik",
    name: "Sony WH-1000XM5 Kablosuz Kulaklık",
    categoryId: "headphones",
    brand: "Sony",
    price: 13999,
    oldPrice: 15999,
    rating: 4.8,
    reviews: 733,
    stock: 12,
    fastDelivery: true,
    color: "Siyah",
    storage: null,
    badge: "Editörün Seçimi",
    imageKey: "headphones",
    description: "Sektör lideri gürültü engelleme, net görüşme ve uzun pil süresi sunan premium kulaklık.",
    features: ["Aktif gürültü engelleme", "30 saat pil", "Hızlı şarj", "Çoklu cihaz bağlantısı"],
  }),
  product({
    id: "NS-1007",
    featuredRank: 30,
    slug: "apple-watch-series-9-gps-45-mm",
    name: "Apple Watch Series 9 GPS 45 mm",
    categoryId: "smart-watches",
    brand: "Apple",
    price: 17999,
    oldPrice: 19999,
    rating: 4.8,
    reviews: 548,
    stock: 7,
    fastDelivery: true,
    color: "Gece Yarısı",
    storage: "64 GB",
    badge: "Hızlı Teslimat",
    imageKey: "watch",
    description: "Daha parlak ekran, gelişmiş sağlık ölçümleri ve Double Tap hareketiyle akıllı saat deneyimi.",
    features: ["45 mm alüminyum kasa", "S9 SiP", "50 m suya dayanıklılık", "Kandaki oksijen ölçümü"],
  }),
  product({
    id: "NS-1008",
    slug: "dyson-v15-detect-absolute-supurge",
    name: "Dyson V15 Detect Absolute Süpürge",
    categoryId: "vacuum-cleaners",
    brand: "Dyson",
    price: 26999,
    oldPrice: 29999,
    rating: 4.7,
    reviews: 946,
    stock: 5,
    fastDelivery: true,
    color: "Sarı / Nikel",
    storage: null,
    badge: "Avantajlı Fiyat",
    imageKey: "vacuum",
    description: "Görünmeyen tozu ortaya çıkaran başlığı ve akıllı emiş gücü ayarıyla derinlemesine temizlik.",
    features: ["60 dakikaya kadar kullanım", "HEPA filtreleme", "LCD ekran", "Piezo toz sensörü"],
  }),
  product({
    id: "NS-1009",
    slug: "karaca-home-nova-cift-kisilik-nevresim",
    name: "Karaca Home Nova Çift Kişilik Nevresim",
    categoryId: "bedding",
    brand: "Karaca Home",
    price: 1899,
    oldPrice: 2399,
    rating: 4.6,
    reviews: 327,
    stock: 26,
    fastDelivery: true,
    color: "Bej",
    storage: null,
    badge: "%21 İndirim",
    imageKey: "bedding",
    description: "Yumuşak dokulu pamuk kumaşı ve zamansız deseniyle yatak odasına sakin bir görünüm kazandırır.",
    features: ["%100 pamuk", "200 × 220 cm", "Makinede yıkanabilir", "4 parçalı set"],
  }),
  product({
    id: "NS-1010",
    slug: "ipekyol-saten-midi-elbise-lacivert",
    name: "İpekyol Saten Midi Elbise",
    categoryId: "women-dresses",
    brand: "İpekyol",
    price: 3499,
    oldPrice: 4299,
    rating: 4.7,
    reviews: 184,
    stock: 11,
    fastDelivery: true,
    color: "Lacivert",
    storage: null,
    badge: "Nova Seçimi",
    imageKey: "fashion",
    description: "Akıcı saten dokusu ve dengeli midi boyuyla gündüzden geceye uyum sağlayan zarif elbise.",
    features: ["Midi boy", "Saten dokuma", "Astarlı", "Gizli fermuar"],
  }),
  product({
    id: "NS-1011",
    slug: "mavi-erkek-bisiklet-yaka-sweatshirt",
    name: "Mavi Erkek Bisiklet Yaka Sweatshirt",
    categoryId: "men-sweatshirts",
    brand: "Mavi",
    price: 1299,
    oldPrice: 1599,
    rating: 4.5,
    reviews: 412,
    stock: 22,
    fastDelivery: false,
    color: "Antrasit",
    storage: null,
    badge: "Günün Fırsatı",
    imageKey: "sweatshirt",
    description: "Yumuşak üç iplik kumaşı ve sade kesimiyle günlük kombinlere kolayca uyum sağlayan sweatshirt.",
    features: ["Regular fit", "Pamuk karışımlı", "Ribana manşet", "Bisiklet yaka"],
  }),
  product({
    id: "NS-1012",
    slug: "lc-waikiki-cocuk-kapusonlu-sisme-mont",
    name: "LC Waikiki Çocuk Kapüşonlu Şişme Mont",
    categoryId: "kids-coats",
    brand: "LC Waikiki",
    price: 1199,
    oldPrice: 1499,
    rating: 4.6,
    reviews: 268,
    stock: 14,
    fastDelivery: true,
    color: "Turuncu",
    storage: null,
    badge: "Ücretsiz Kargo",
    imageKey: "kids-coat",
    description: "Hafif dolgusu ve koruyucu kapüşonuyla serin günlerde çocukların rahat hareket etmesini sağlar.",
    features: ["Su itici yüzey", "Hafif dolgu", "Fermuarlı cepler", "Çıkarılabilir kapüşon"],
  }),
  product({
    id: "NS-1013",
    slug: "la-roche-posay-effaclar-temizleme-jeli-400-ml",
    name: "La Roche-Posay Effaclar Temizleme Jeli 400 ml",
    categoryId: "face-cleansing",
    brand: "La Roche-Posay",
    price: 899,
    oldPrice: 1049,
    rating: 4.8,
    reviews: 3164,
    stock: 37,
    fastDelivery: true,
    color: "Şeffaf",
    storage: null,
    badge: "Çok Satan",
    imageKey: "skincare",
    description: "Yağlı ve akneye eğilimli cildi nazikçe arındırmaya yardımcı, sabun içermeyen yüz temizleme jeli.",
    features: ["400 ml", "Sabun içermez", "Termal su içerir", "Hassas ciltlere uygun"],
  }),
  product({
    id: "NS-1014",
    slug: "adidas-own-the-run-kosu-tisortu",
    name: "adidas Own The Run Koşu Tişörtü",
    categoryId: "running-clothing",
    brand: "adidas",
    price: 1499,
    oldPrice: 1799,
    rating: 4.6,
    reviews: 156,
    stock: 8,
    fastDelivery: true,
    color: "Siyah",
    storage: null,
    badge: "Yeni Sezon",
    imageKey: "sports",
    description: "Nemi uzaklaştıran hafif kumaşı ve reflektörlü detaylarıyla günlük koşular için tasarlandı.",
    features: ["AEROREADY kumaş", "Regular fit", "Reflektörlü detay", "Geri dönüştürülmüş polyester"],
  }),
  product({
    id: "NS-1015",
    slug: "lego-classic-yaratici-buyuk-kutu-10698",
    name: "LEGO Classic Yaratıcı Büyük Kutu 10698",
    categoryId: "educational-toys",
    brand: "LEGO",
    price: 2199,
    oldPrice: 2499,
    rating: 4.9,
    reviews: 1102,
    stock: 19,
    fastDelivery: true,
    color: "Çok Renkli",
    storage: null,
    badge: "Ailelerin Favorisi",
    imageKey: "toy",
    description: "Farklı renk ve şekillerde yüzlerce parçayla çocukların hayal gücünü ve üretkenliğini destekler.",
    features: ["790 parça", "4 yaş ve üzeri", "Saklama kutulu", "Fikir kitapçığı dahil"],
  }),
  product({
    id: "NS-1016",
    slug: "novastore-outlet-basic-tisort",
    name: "NovaStore Outlet Basic Tişört",
    categoryId: "outlet-basics-archived",
    brand: "NovaStore",
    price: 399,
    oldPrice: 699,
    rating: 4.2,
    reviews: 48,
    stock: 31,
    fastDelivery: false,
    color: "Beyaz",
    storage: null,
    badge: "Outlet",
    imageKey: "home",
    description: "Arşivlenmiş bir dalın ürünleri olsa bile müşteriye açılmadığını doğrulamak için örnek ürün.",
    features: ["Regular fit", "%100 pamuk", "Bisiklet yaka", "Unisex"],
  }),
]);

const categoryById = new Map(categories.map((category) => [category.id, category]));
const categoryByPath = new Map(categories.map((category) => [category.path, category]));

const compareCategoryOrder = (left, right) =>
  left.sortOrder - right.sortOrder || left.name.localeCompare(right.name, "tr");

const isStructurallyPublicCategory = (category) => {
  if (!category || !category.active || !category.customerVisible || category.archived) return false;

  let current = category;
  const visited = new Set();

  while (current.parentId) {
    if (visited.has(current.id)) return false;
    visited.add(current.id);
    current = categoryById.get(current.parentId);
    if (!current || !current.active || !current.customerVisible || current.archived) return false;
  }

  return true;
};

const isPublicProduct = (item) => {
  if (!item || !item.active || !item.customerVisible || item.deletedAt) return false;
  return isStructurallyPublicCategory(categoryById.get(item.categoryId));
};

const publicProducts = () => products.filter(isPublicProduct);

const productBelongsToBranch = (item, category) => {
  const assignedCategory = categoryById.get(item.categoryId);
  return Boolean(
    assignedCategory &&
      (assignedCategory.path === category.path || assignedCategory.path.startsWith(`${category.path}/`)),
  );
};

const countForCategory = (category) => {
  const matchingProducts = publicProducts().filter((item) => productBelongsToBranch(item, category));
  return {
    visibleProductCount: matchingProducts.length,
    sellableProductCount: matchingProducts.filter((item) => item.stock > 0).length,
  };
};

const decorateCategory = (category) => {
  if (!category) return null;
  const counts = countForCategory(category);
  const visibleChildCount = categories.filter(
    (candidate) =>
      candidate.parentId === category.id &&
      isStructurallyPublicCategory(candidate) &&
      countForCategory(candidate).visibleProductCount > 0,
  ).length;

  return Object.freeze({
    ...category,
    ...counts,
    descendantVisibleProductCount: counts.visibleProductCount,
    visibleChildCount,
  });
};

const isPubliclyPopulatedCategory = (category) =>
  isStructurallyPublicCategory(category) && countForCategory(category).visibleProductCount > 0;

/** Returns only populated, active, customer-visible root categories. */
export function getVisibleRoots() {
  return categories
    .filter((category) => category.parentId === null && isPubliclyPopulatedCategory(category))
    .sort(compareCategoryOrder)
    .map(decorateCategory);
}

/** Returns only populated public children; empty and archived branches are pruned. */
export function getVisibleChildren(parentId) {
  if (!categoryById.has(String(parentId))) return [];

  return categories
    .filter(
      (category) => category.parentId === String(parentId) && isPubliclyPopulatedCategory(category),
    )
    .sort(compareCategoryOrder)
    .map(decorateCategory);
}

/** Internal/admin lookup. Public routing should use resolveCategoryPath instead. */
export function getCategoryById(id) {
  return categoryById.get(String(id)) ?? null;
}

const normalizePublicPath = (input) => {
  if (typeof input !== "string") return null;

  let value = input.trim();
  if (!value || value.length > 512) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) || /[\\\u0000-\u001f\u007f]/.test(value)) return null;

  value = value.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, "");
  if (!value) return null;

  const rawSegments = value.split("/");
  if (rawSegments.some((segment) => segment.length === 0)) return null;
  if (rawSegments[0].toLocaleLowerCase("tr-TR") === "kategori") rawSegments.shift();
  if (!rawSegments.length) return null;

  const normalizedSegments = [];
  for (const rawSegment of rawSegments) {
    let segment;
    try {
      segment = decodeURIComponent(rawSegment).normalize("NFC").toLocaleLowerCase("tr-TR");
    } catch {
      return null;
    }

    if (
      !segment ||
      segment === "." ||
      segment === ".." ||
      segment.length > 80 ||
      segment.includes("/") ||
      segment.includes("\\") ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment)
    ) {
      return null;
    }

    normalizedSegments.push(segment);
  }

  return normalizedSegments.join("/");
};

/**
 * Resolves a public category path without evaluating URLs or permitting path
 * traversal. Empty, hidden, inactive and archived paths deliberately resolve
 * to null so their public pages behave as a 404.
 */
export function resolveCategoryPath(path) {
  const normalizedPath = normalizePublicPath(path);
  if (!normalizedPath) return null;

  const category = categoryByPath.get(normalizedPath);
  return isPubliclyPopulatedCategory(category) ? decorateCategory(category) : null;
}

/** Returns a root-to-leaf breadcrumb for a populated public category. */
export function getBreadcrumb(categoryId) {
  let current = categoryById.get(String(categoryId));
  if (!isPubliclyPopulatedCategory(current)) return [];

  const breadcrumb = [];
  const visited = new Set();

  while (current) {
    if (visited.has(current.id) || !isPubliclyPopulatedCategory(current)) return [];
    visited.add(current.id);
    breadcrumb.unshift(decorateCategory(current));
    current = current.parentId ? categoryById.get(current.parentId) : null;
  }

  return breadcrumb;
}

/** Returns populated public descendants in deterministic tree order. */
export function getDescendantIds(categoryId) {
  const root = categoryById.get(String(categoryId));
  if (!isPubliclyPopulatedCategory(root)) return [];

  const result = [];
  const visit = (parentId) => {
    const children = categories
      .filter(
        (category) => category.parentId === parentId && isPubliclyPopulatedCategory(category),
      )
      .sort(compareCategoryOrder);

    for (const child of children) {
      result.push(child.id);
      visit(child.id);
    }
  };

  visit(root.id);
  return result;
}

/** Returns visible products assigned to a category or any public descendant. */
export function getProductsForCategory(categoryId) {
  const category = categoryById.get(String(categoryId));
  if (!isPubliclyPopulatedCategory(category)) return [];

  return stockFirst(publicProducts().filter((item) => productBelongsToBranch(item, category)));
}

/** Returns every customer-visible product; stock affects ordering, not visibility. */
export function getVisibleProducts() {
  return stockFirst(publicProducts());
}

/** Stable, non-mutating availability sort: sellable products first, sold-out last. */
export function stockFirst(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftSoldOut = Number(left.item?.stock) <= 0;
      const rightSoldOut = Number(right.item?.stock) <= 0;
      return Number(leftSoldOut) - Number(rightSoldOut) || left.index - right.index;
    })
    .map(({ item }) => item);
}

/**
 * Sorts a PLP result without ever allowing a sold-out item to move ahead of
 * sellable inventory. Equal values keep the source order for deterministic UI.
 */
export function sortProducts(items, sort = "featured") {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const comparators = {
    featured: (left, right) => Number(left.featuredRank ?? 9999) - Number(right.featuredRank ?? 9999),
    "price-low": (left, right) => Number(left.price) - Number(right.price),
    "price-high": (left, right) => Number(right.price) - Number(left.price),
    rating: (left, right) => Number(right.rating) - Number(left.rating),
    new: (left, right) => String(right.id).localeCompare(String(left.id), "tr"),
  };
  const compare = comparators[sort] || comparators.featured;

  return safeItems
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const stockOrder = Number(Number(left.item.stock) <= 0) - Number(Number(right.item.stock) <= 0);
      return stockOrder || compare(left.item, right.item) || left.index - right.index;
    })
    .map(({ item }) => item);
}

const countFacetValues = (items, selector) => {
  const counts = new Map();
  for (const item of items) {
    const value = selector(item);
    if (value === null || value === undefined || value === "") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([value, count]) => Object.freeze({ value, count }))
    .sort((left, right) => right.count - left.count || String(left.value).localeCompare(String(right.value), "tr"));
};

/** Builds deterministic PLP facets from the supplied product result set. */
export function buildFacets(items) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const prices = safeItems
    .map((item) => Number(item.price))
    .filter((price) => Number.isFinite(price) && price >= 0);

  return Object.freeze({
    brands: Object.freeze(countFacetValues(safeItems, (item) => item.brand)),
    colors: Object.freeze(countFacetValues(safeItems, (item) => item.color)),
    storage: Object.freeze(countFacetValues(safeItems, (item) => item.storage)),
    fastDelivery: Object.freeze([
      Object.freeze({ value: true, count: safeItems.filter((item) => item.fastDelivery).length }),
      Object.freeze({ value: false, count: safeItems.filter((item) => !item.fastDelivery).length }),
    ]),
    availability: Object.freeze([
      Object.freeze({ value: "in-stock", count: safeItems.filter((item) => item.stock > 0).length }),
      Object.freeze({ value: "sold-out", count: safeItems.filter((item) => item.stock <= 0).length }),
    ]),
    rating: Object.freeze([
      Object.freeze({ value: 4.8, count: safeItems.filter((item) => item.rating >= 4.8).length }),
      Object.freeze({ value: 4.5, count: safeItems.filter((item) => item.rating >= 4.5).length }),
      Object.freeze({ value: 4, count: safeItems.filter((item) => item.rating >= 4).length }),
    ]),
    price: Object.freeze({
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    }),
    total: safeItems.length,
  });
}
