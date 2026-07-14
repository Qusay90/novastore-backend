// All identities below are explicit synthetic fixtures; they do not represent real people.
export const customerRecords = [
  { id: "CUS-86420", name: "Örnek Müşteri 01", email: "musteri01@example.invalid", orders: 7, lifetimeValue: 86240, segment: "VIP", lastActivity: "2 gün önce", city: "İstanbul", consent: "E-posta ve SMS", support: "Teslimat tercihi güncellendi" },
  { id: "CUS-86419", name: "Örnek Müşteri 02", email: "musteri02@example.invalid", orders: 4, lifetimeValue: 32680, segment: "Sadık", lastActivity: "Bugün", city: "Ankara", consent: "E-posta", support: "Açık talep yok" },
  { id: "CUS-86418", name: "Örnek Müşteri 03", email: "musteri03@example.invalid", orders: 11, lifetimeValue: 118940, segment: "VIP", lastActivity: "Dün", city: "İzmir", consent: "E-posta ve SMS", support: "İade talebi inceleniyor" },
  { id: "CUS-86417", name: "Örnek Müşteri 04", email: "musteri04@example.invalid", orders: 2, lifetimeValue: 12480, segment: "Yeni", lastActivity: "3 gün önce", city: "Bursa", consent: "E-posta", support: "İlk sipariş kuponu kullanıldı" },
  { id: "CUS-86416", name: "Örnek Müşteri 05", email: "musteri05@example.invalid", orders: 6, lifetimeValue: 44120, segment: "Sadık", lastActivity: "Bugün", city: "Antalya", consent: "Yalnız zorunlu", support: "Ürün sorusu yanıtlandı" },
];

export const sellerOrderRows = [
  { id: "SS-10482-1", parent: "NS-10482", seller: "Demo Teknoloji", item: "Apple iPhone 15 128 GB", amount: 51999, shipping: "Bugün 16:00", status: "Hazırlanıyor" },
  { id: "SS-10481-1", parent: "NS-10481", seller: "NovaStore", item: "NovaTech AeroBook 14", amount: 18999, shipping: "Kargoda", status: "Kargoya Verildi" },
  { id: "SS-10480-1", parent: "NS-10480", seller: "Demo Ev", item: "NovaHome S10 Robot Süpürge", amount: 7999, shipping: "Bugün 14:30", status: "Yeni" },
  { id: "SS-10479-1", parent: "NS-10479", seller: "Demo Teknoloji", item: "Samsung Galaxy S24 256 GB", amount: 38999, shipping: "Kargoda", status: "Kargoya Verildi" },
];

export const returnRows = [
  { id: "IAD-3021", order: "NS-10463", customer: "Örnek Müşteri 06", seller: "Demo Teknoloji", reason: "Beklentiyi karşılamadı", amount: 3499, sla: "42 dk", status: "İnceleniyor" },
  { id: "IAD-3020", order: "NS-10451", customer: "Örnek Müşteri 07", seller: "Demo Ev", reason: "Hasarlı ürün", amount: 1299, sla: "1 sa 08 dk", status: "Kargo bekleniyor" },
  { id: "IAD-3019", order: "NS-10442", customer: "Örnek Müşteri 08", seller: "NovaStore", reason: "Yanlış ürün", amount: 18999, sla: "2 sa 14 dk", status: "Onay bekliyor" },
];

export const stockRiskRows = [
  { sku: "NVS-S10-RBT", product: "NovaHome S10 Robot Süpürge", seller: "Demo Ev", available: 7, reserved: 4, cover: "1,8 gün", status: "Kritik" },
  { sku: "NVS-WCH-02", product: "Smartix Watch 2", seller: "Demo Teknoloji", available: 0, reserved: 2, cover: "Tükendi", status: "Stokta yok" },
  { sku: "NVS-AB14-512", product: "NovaTech AeroBook 14", seller: "NovaStore", available: 18, reserved: 9, cover: "3,2 gün", status: "İzleniyor" },
];

export const notificationRows = [
  { id: "NTF-8", title: "12 sipariş SLA sınırına yaklaştı", detail: "Operasyon kuyruğu · son 15 dakika", tone: "warning", read: false },
  { id: "NTF-7", title: "7 satıcı başvurusu inceleme bekliyor", detail: "Pazaryeri · bugün", tone: "info", read: false },
  { id: "NTF-6", title: "Hakediş mutabakatında 3 fark bulundu", detail: "Finans · örnek veri", tone: "warning", read: false },
  { id: "NTF-5", title: "Katalog içeriği %94 tamlığa ulaştı", detail: "Katalog · örnek veri", tone: "success", read: true },
];

export const analyticsPeriods = {
  "Son 7 gün": { gross: "₺4,6 Mn", net: "₺3,2 Mn", conversion: "%3,94", basket: "₺1.914", multiplier: 0.25 },
  "Son 30 gün": { gross: "₺18,4 Mn", net: "₺12,8 Mn", conversion: "%3,82", basket: "₺1.877", multiplier: 1 },
  "Bu yıl": { gross: "₺126,8 Mn", net: "₺88,2 Mn", conversion: "%3,61", basket: "₺1.804", multiplier: 6.9 },
};

export const categoryPreviewRows = [
  { id: "CAT-1", name: "Elektronik", path: "Elektronik", depth: 0, products: 1284, state: "Yayında" },
  { id: "CAT-2", name: "Cep Telefonu", path: "Elektronik / Cep Telefonu", depth: 1, products: 418, state: "Yayında" },
  { id: "CAT-3", name: "Dizüstü Bilgisayar", path: "Elektronik / Bilgisayar / Dizüstü", depth: 2, products: 214, state: "Yayında" },
  { id: "CAT-4", name: "Ev & Yaşam", path: "Ev & Yaşam", depth: 0, products: 726, state: "Yayında" },
  { id: "CAT-5", name: "Ev Tekstili", path: "Ev & Yaşam / Ev Tekstili", depth: 1, products: 188, state: "İnceleniyor" },
];

export const filterTemplateRows = [
  { id: "TPL-12", name: "Cep telefonu özellikleri", category: "Cep Telefonu", attributes: 14, required: 6, state: "Etkin" },
  { id: "TPL-11", name: "Dizüstü bilgisayar özellikleri", category: "Dizüstü Bilgisayar", attributes: 18, required: 8, state: "Etkin" },
  { id: "TPL-10", name: "Ev tekstili filtreleri", category: "Ev Tekstili", attributes: 9, required: 3, state: "Taslak" },
];

export const roleLayoutSeed = [
  { id: "operations", initials: "OY", label: "Operasyon Yöneticisi", detail: "6 modül · varsayılan" },
  { id: "catalog", initials: "KE", label: "Katalog Editörü", detail: "4 modül" },
  { id: "finance", initials: "FY", label: "Finans Yöneticisi", detail: "3 modül" },
];

const orderSeed = [
  { seller: "Demo Teknoloji", customer: "Örnek Müşteri 01", product: "Apple iPhone 15 128 GB", channel: "Web", amount: 51999, status: "Hazırlanıyor", owner: "Demo Operatör A", image: "/assets/phone-iphone.webp" },
  { seller: "NovaStore", customer: "Örnek Müşteri 02", product: "NovaTech AeroBook 14", channel: "Web", amount: 18999, status: "Kargoya Verildi", owner: "Demo Operatör B", image: "/assets/product-laptop.webp" },
  { seller: "Demo Ev", customer: "Örnek Müşteri 03", product: "NovaHome S10 Robot Süpürge", channel: "Hepsiburada", amount: 7999, status: "Yeni", owner: "Demo Operatör B", image: "/assets/product-vacuum.webp" },
  { seller: "Demo Teknoloji", customer: "Örnek Müşteri 04", product: "Samsung Galaxy S24 256 GB", channel: "Trendyol", amount: 38999, status: "Kargoya Verildi", owner: "Demo Operatör A", image: "/assets/phone-samsung.webp" },
  { seller: "Demo Ev", customer: "Örnek Müşteri 05", product: "NovaSound Bar 600", channel: "Web", amount: 4999, status: "Teslim Edildi", owner: "Demo Operatör B", image: "/assets/product-headphones.webp" },
  { seller: "NovaStore", customer: "Örnek Müşteri 06", product: "Nova Cook Airfryer 5.5L", channel: "Mobil", amount: 2899, status: "Hazırlanıyor", owner: "Demo Operatör A", image: "/assets/category-home.webp" },
  { seller: "Demo Teknoloji", customer: "Örnek Müşteri 07", product: "Logitech MX Master 3S", channel: "Web", amount: 2199, status: "Yeni", owner: "Demo Operatör B", image: "/assets/product-laptop.webp" },
];

export const orderRecords = Array.from({ length: 28 }, (_, index) => {
  const seed = orderSeed[index % orderSeed.length];
  const cycle = Math.floor(index / orderSeed.length);
  return {
    ...seed,
    id: `NS-${10482 - index}`,
    amount: seed.amount + cycle * 240,
    age: `${1 + Math.floor(index / 8)} sa ${String((18 + index * 7) % 60).padStart(2, "0")} dk`,
    today: index < 12,
  };
});

export const catalogPolicyVersion = "demo-catalog-policy-v0.1";
export const catalogPolicyEvaluatedAt = "2026-07-14T09:00:00+03:00";
export const firstPartySellerId = "SEL-NOVASTORE";

export function isFirstPartyOffer(record) {
  return record?.ownershipType === "first_party" && record?.sellerId === firstPartySellerId;
}

export function getInventoryStatus(stockValue) {
  if (stockValue === "" || stockValue === null || stockValue === undefined) return "Stok bekleniyor";
  const stock = Number(stockValue);
  if (!Number.isFinite(stock) || stock <= 0) return "Stokta yok";
  if (stock < 10) return "Düşük stok";
  return "Stokta";
}

export function evaluateProductPublication(record) {
  const policy = record?.policyContext || {};
  const reasons = [];
  const addReason = (code, label, action, owner, outcome) => reasons.push({ code, label, action, owner, outcome });
  const requiredPolicySignals = ["sellerStatus", "categoryAllowed", "requiredFieldsComplete", "brandAuthorizationStatus", "canonicalMatchConfidence", "prohibitedContent", "priceAnomaly"];
  const allowedSellerStatuses = ["active", "suspended", "inactive", "closed"];
  const allowedAuthorizationStatuses = ["verified", "not_required", "pending", "unverified", "missing"];

  if (requiredPolicySignals.some((key) => !Object.prototype.hasOwnProperty.call(policy, key))) {
    addReason("POLICY_INPUT_INCOMPLETE", "Politika değerlendirme girdisi eksik", "Eksik entegrasyon verisi tamamlanana kadar teklifi yayınlama", "Platform", "blocked");
  }
  if (
    (Object.prototype.hasOwnProperty.call(policy, "sellerStatus") && !allowedSellerStatuses.includes(policy.sellerStatus))
    || (Object.prototype.hasOwnProperty.call(policy, "categoryAllowed") && typeof policy.categoryAllowed !== "boolean")
    || (Object.prototype.hasOwnProperty.call(policy, "requiredFieldsComplete") && typeof policy.requiredFieldsComplete !== "boolean")
    || (Object.prototype.hasOwnProperty.call(policy, "brandAuthorizationStatus") && !allowedAuthorizationStatuses.includes(policy.brandAuthorizationStatus))
    || (Object.prototype.hasOwnProperty.call(policy, "canonicalMatchConfidence") && (!Number.isFinite(policy.canonicalMatchConfidence) || policy.canonicalMatchConfidence < 0 || policy.canonicalMatchConfidence > 1))
    || (Object.prototype.hasOwnProperty.call(policy, "priceAnomaly") && typeof policy.priceAnomaly !== "boolean")
    || (Object.prototype.hasOwnProperty.call(policy, "prohibitedContent") && typeof policy.prohibitedContent !== "boolean")
  ) {
    addReason("POLICY_INPUT_INVALID", "Politika değerlendirme girdisi geçersiz", "Hatalı entegrasyon verisi düzeltilene kadar teklifi yayınlama", "Platform", "blocked");
  }

  if (policy.sellerStatus !== undefined && policy.sellerStatus !== "active") {
    addReason("SELLER_NOT_ACTIVE", "Satıcı hesabı aktif değil", "Satıcı hesabı yeniden etkinleştirilmeden teklif yayınlanamaz", "Platform", "blocked");
  }
  if (policy.prohibitedContent === true || policy.categoryAllowed === false) {
    addReason("CATALOG_RESTRICTION", "Kategori veya içerik yayın politikasına uygun değil", "Kısıt gerekçesi çözülmeden teklifi yayında tutma", "Platform", "blocked");
  }
  if (policy.requiredFieldsComplete === false) {
    addReason("REQUIRED_ATTRIBUTE_MISSING", "Zorunlu ürün alanı eksik", "Satıcı eksik ürün bilgisini tamamlamalı", "Satıcı", "seller_action");
  }
  if (policy.brandAuthorizationStatus === "missing") {
    addReason("BRAND_PERMISSION_MISSING", "Gerekli marka satış belgesi eksik", "Satıcı marka yetki belgesini eklemeli", "Satıcı", "seller_action");
  }
  if (["pending", "unverified"].includes(policy.brandAuthorizationStatus)) {
    addReason("BRAND_PERMISSION_UNVERIFIED", "Marka satış yetkisi doğrulanamadı", "Satıcı yetki belgesini tamamlamalı; yetkili ekip istisnayı incelemeli", "Satıcı + Platform", "exception_review");
  }
  if (Number.isFinite(policy.canonicalMatchConfidence) && policy.canonicalMatchConfidence < 0.75) {
    addReason("CANONICAL_MATCH_UNCERTAIN", "Kanonik ürün eşleşmesi belirsiz", "Katalog ekibi eşleşmeyi doğrulamalı", "Platform", "exception_review");
  }
  if (policy.priceAnomaly === true) {
    addReason("PRICE_ANOMALY_REVIEW", "Fiyat tutarlılık kontrolü istisna üretti", "Teklif fiyatını değiştirmeden önce kaynağı doğrula", "Platform", "exception_review");
  }

  const hasOutcome = (outcome) => reasons.some((reason) => reason.outcome === outcome);
  const publicationStatus = hasOutcome("blocked")
    ? "Yayından kaldırıldı"
    : hasOutcome("exception_review")
      ? "İstisna incelemesi"
      : hasOutcome("seller_action")
        ? "Satıcı aksiyonu"
        : "Otomatik yayında";
  if (reasons.length === 0) {
    addReason("POLICY_CHECKS_PASSED", "Yayın politikası kontrolleri geçti", "Teklif insan onayı olmadan otomatik yayınlanabilir", "Politika motoru", "passed");
  }
  return {
    publicationStatus,
    reasons,
    policyVersion: catalogPolicyVersion,
    evaluatedAt: record?.policyEvaluatedAt || catalogPolicyEvaluatedAt,
    evaluatedBy: "Deterministik örnek kural seti",
  };
}

const withProductPolicy = (record) => {
  const evaluation = evaluateProductPublication(record);
  return {
    ...record,
    ...evaluation,
    inventoryStatus: getInventoryStatus(record.stock),
  };
};

export const productRecords = [
  { canonicalId: "KAT-1001", offerId: "TKL-4101", sellerId: "SEL-TEKNOPARK", ownershipType: "third_party", sku: "NVS-IP15-128", name: "Apple iPhone 15 128 GB", seller: "Demo Teknoloji", category: "Cep Telefonu", stock: 42, price: 51999, policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "verified", canonicalMatchConfidence: 0.99, prohibitedContent: false, priceAnomaly: false }, image: "/assets/phone-iphone.webp" },
  { canonicalId: "KAT-1001", offerId: "TKL-4106", sellerId: firstPartySellerId, ownershipType: "first_party", sku: "NVS-IP15-128", name: "Apple iPhone 15 128 GB", seller: "NovaStore", category: "Cep Telefonu", stock: 11, price: 52499, policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "verified", canonicalMatchConfidence: 1, prohibitedContent: false, priceAnomaly: false }, image: "/assets/phone-iphone.webp" },
  { canonicalId: "KAT-1002", offerId: "TKL-4102", sellerId: firstPartySellerId, ownershipType: "first_party", sku: "NVS-AB14-512", name: "NovaTech AeroBook 14", seller: "NovaStore", category: "Dizüstü Bilgisayar", stock: 18, price: 18999, policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "not_required", canonicalMatchConfidence: 1, prohibitedContent: false, priceAnomaly: false }, image: "/assets/product-laptop.webp" },
  { canonicalId: "KAT-1003", offerId: "TKL-4103", sellerId: "SEL-EVIVA", ownershipType: "third_party", sku: "NVS-S10-RBT", name: "NovaHome S10 Robot Süpürge", seller: "Demo Ev", category: "Elektrikli Ev Aleti", stock: 7, price: 7999, policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "not_required", canonicalMatchConfidence: 0.98, prohibitedContent: false, priceAnomaly: false }, image: "/assets/product-vacuum.webp" },
  {
    canonicalId: "KAT-1004",
    offerId: "TKL-4104",
    sellerId: "SEL-TEKNOPARK",
    ownershipType: "third_party",
    sku: "NVS-WCH-02",
    name: "Smartix Watch 2",
    seller: "Demo Teknoloji",
    category: "Akıllı Saat",
    stock: 0,
    price: 3499,
    policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "unverified", canonicalMatchConfidence: 0.96, prohibitedContent: false, priceAnomaly: false },
    image: "/assets/product-watch.webp",
  },
  {
    canonicalId: "KAT-1005",
    offerId: "TKL-4105",
    sellerId: "SEL-EVIVA",
    ownershipType: "third_party",
    sku: "NVS-BDS-04",
    name: "Soft Touch Nevresim Seti",
    seller: "Demo Ev",
    category: "Ev Tekstili",
    stock: 84,
    price: 1299,
    policyContext: { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: false, brandAuthorizationStatus: "not_required", canonicalMatchConfidence: 0.97, prohibitedContent: false, priceAnomaly: false },
    image: "/assets/product-bedding.webp",
  },
].map(withProductPolicy);

export const sellerReviewRuleset = "demo-onboarding-v0.1";
export const sellerRequiredDocumentKeys = ["tax", "signature", "agreement", "license"];

export function isSellerDocumentStateValid(key, value) {
  return key === "license"
    ? ["verified", "missing", "expired", "not-required"].includes(value)
    : ["verified", "missing", "expired"].includes(value);
}

export function isSellerDocumentComplete(key, value) {
  return value === "verified" || (key === "license" && value === "not-required");
}

const sellerReviewLabels = {
  company: "