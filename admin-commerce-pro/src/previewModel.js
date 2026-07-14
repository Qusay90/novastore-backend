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
  company: "Şirket / vergi kimliği",
  bank: "Banka hesabı sahipliği",
  documents: "Zorunlu belgeler",
  permission: "Kategori / marka izni",
  duplicate: "Yinelenen başvuru sinyali",
};

const sellerReviewMaxPoints = {
  company: 30,
  bank: 25,
  documents: 20,
  permission: 15,
  duplicate: 10,
};

const sellerReviewStatusLabels = {
  verified: "Doğrulandı",
  pending: "Doğrulama bekliyor",
  mismatch: "Uyuşmazlık",
  complete: "Tam",
  incomplete: "Eksik veya süresi geçmiş",
  "not-required": "Gerekmiyor",
  missing: "Eksik",
  invalid: "Geçersiz",
  clear: "Sinyal yok",
  possible: "Olası eşleşme",
  confirmed: "Doğrulanmış eşleşme",
  unknown: "Eksik veri",
};

export function calculateSellerReviewPriority(record) {
  const verification = record?.verification || {};
  const knownCompany = ["verified", "pending", "mismatch"].includes(verification.company);
  const knownBank = ["verified", "pending", "mismatch"].includes(verification.bank);
  const documents = verification.documents && typeof verification.documents === "object" ? verification.documents : {};
  const knownDocuments = sellerRequiredDocumentKeys.every((key) => (
    Object.prototype.hasOwnProperty.call(documents, key) && isSellerDocumentStateValid(key, documents[key])
  ));
  const knownPermission = ["verified", "pending", "missing", "invalid", "not-required"].includes(verification.permission);
  const knownDuplicate = ["clear", "possible", "confirmed"].includes(verification.duplicate);

  const companyPoints = verification.company === "mismatch" ? 30 : verification.company === "pending" ? 12 : 0;
  const bankPoints = verification.bank === "mismatch" ? 25 : verification.bank === "pending" ? 10 : 0;
  const incompleteDocuments = sellerRequiredDocumentKeys.filter((key) => !isSellerDocumentComplete(key, documents[key])).length;
  const documentPoints = incompleteDocuments >= 2 ? 20 : incompleteDocuments === 1 ? 10 : 0;
  const permissionPoints = verification.permission === "missing" || verification.permission === "invalid"
    ? 15
    : verification.permission === "pending" ? 7 : 0;
  const duplicatePoints = verification.duplicate === "confirmed" ? 10 : verification.duplicate === "possible" ? 5 : 0;

  const dimensions = [
    { code: "company", known: knownCompany, points: companyPoints, status: verification.company || "unknown" },
    { code: "bank", known: knownBank, points: bankPoints, status: verification.bank || "unknown" },
    { code: "documents", known: knownDocuments, points: documentPoints, status: knownDocuments ? (incompleteDocuments ? "incomplete" : "complete") : "unknown" },
    { code: "permission", known: knownPermission, points: permissionPoints, status: verification.permission || "unknown" },
    { code: "duplicate", known: knownDuplicate, points: duplicatePoints, status: verification.duplicate || "unknown" },
  ];
  const score = dimensions.reduce((total, dimension) => total + dimension.points, 0);
  const completeness = Math.round(dimensions.filter((dimension) => dimension.known).length / dimensions.length * 100);
  const level = completeness < 100 ? "Eksik veri" : score >= 50 ? "Öncelikli" : score >= 20 ? "İnceleme gerekli" : "Rutin";
  const reasons = dimensions.map((dimension) => ({
    code: dimension.code,
    label: sellerReviewLabels[dimension.code],
    points: dimension.points,
    maxPoints: sellerReviewMaxPoints[dimension.code],
    status: sellerReviewStatusLabels[dimension.status] || sellerReviewStatusLabels.unknown,
  }));
  const hardStops = [];
  if (verification.company === "mismatch") hardStops.push("Şirket / vergi kimliği uyuşmazlığı çözülmeli");
  if (verification.bank === "mismatch") hardStops.push("Banka hesabı sahipliği uyuşmazlığı çözülmeli");
  if (["missing", "invalid"].includes(verification.permission)) hardStops.push("Zorunlu kategori veya marka izni tamamlanmalı");
  if (verification.duplicate === "confirmed") hardStops.push("Yinelenen başvuru incelemesi tamamlanmalı");

  const approvalBlockers = [];
  if (!knownCompany || verification.company !== "verified") approvalBlockers.push("Şirket kimliği doğrulanmalı");
  if (!knownBank || verification.bank !== "verified") approvalBlockers.push("Banka hesabı doğrulanmalı");
  if (!knownDocuments || incompleteDocuments > 0) approvalBlockers.push("Zorunlu belgeler tamamlanmalı");
  if (!knownPermission || !["verified", "not-required"].includes(verification.permission)) approvalBlockers.push("Kategori / marka izni netleşmeli");
  if (!knownDuplicate || verification.duplicate !== "clear") approvalBlockers.push("Yinelenen başvuru kontrolü kapanmalı");

  return {
    score,
    level,
    completeness,
    reasons,
    hardStops,
    approvalBlockers: [...new Set(approvalBlockers)],
    approvalEligible: completeness === 100 && approvalBlockers.length === 0 && hardStops.length === 0,
    ruleset: sellerReviewRuleset,
  };
}

const sellerApplicationSeeds = [
  { id: "SLR-208", name: "Demo Kozmetik", owner: "Demo Yetkili 01", category: "Kozmetik", products: 126, commission: "%14", status: "İncelemede", verification: { company: "verified", bank: "verified", documents: { tax: "verified", signature: "verified", agreement: "verified", license: "verified" }, permission: "verified", duplicate: "clear" } },
  { id: "SLR-207", name: "Demo Outdoor", owner: "Demo Yetkili 02", category: "Spor & Outdoor", products: 84, commission: "%12", status: "Belge bekleniyor", verification: { company: "verified", bank: "pending", documents: { tax: "verified", signature: "missing", agreement: "verified", license: "not-required" }, permission: "not-required", duplicate: "clear" } },
  { id: "SLR-206", name: "Demo Çocuk", owner: "Demo Yetkili 03", category: "Anne & Çocuk", products: 218, commission: "%16", status: "İncelemede", verification: { company: "pending", bank: "verified", documents: { tax: "verified", signature: "verified", agreement: "verified", license: "verified" }, permission: "pending", duplicate: "possible" } },
  { id: "SLR-205", name: "Demo Mobil", owner: "Demo Yetkili 04", category: "Elektronik", products: 342, commission: "%10", status: "İncelemede", verification: { company: "mismatch", bank: "mismatch", documents: { tax: "verified", signature: "missing", agreement: "expired", license: "verified" }, permission: "missing", duplicate: "possible" } },
];

export const sellerApplicationRecords = sellerApplicationSeeds.map((record) => ({
  ...record,
  review: calculateSellerReviewPriority(record),
}));

export const settlementRecords = [
  { id: "HKD-0726", seller: "Demo Teknoloji", period: "01–07 Tem 2026", gross: 482140, commission: 48214, returns: 12490, net: 421436, status: "Ödemeye hazır" },
  { id: "HKD-0725", seller: "Demo Ev", period: "01–07 Tem 2026", gross: 214890, commission: 30085, returns: 7999, net: 176806, status: "Kontrol ediliyor" },
  { id: "HKD-0724", seller: "Demo Kozmetik", period: "01–07 Tem 2026", gross: 118420, commission: 16579, returns: 2840, net: 99001, status: "Blokeli" },
  { id: "HKD-0719", seller: "Demo Outdoor", period: "24–30 Haz 2026", gross: 97220, commission: 11666, returns: 0, net: 85554, status: "Ödendi" },
];

export const auditRecords = [
  { time: "10:24", actor: "Demo Operatör A", action: "Sipariş durumunu güncelledi", target: "NS-10482 · Hazırlanıyor", source: "Web" },
  { time: "10:18", actor: "Demo Operatör B", action: "Satıcı başvurusunu inceledi", target: "SLR-208 · Demo Kozmetik", source: "Web" },
  { time: "09:56", actor: "Sistem", action: "Hakediş raporu oluşturdu", target: "HKD-0726 · Demo Teknoloji", source: "Otomasyon" },
  { time: "09:41", actor: "Politika motoru", action: "Teklif otomatik yayına alındı", target: "TKL-4101 · NVS-IP15-128", source: "Örnek kural" },
  { time: "09:12", actor: "Sistem", action: "Sipariş oluşturuldu", target: "NS-10482", source: "Entegrasyon" },
];

export const moduleRecords = [
  { id: "live-orders", name: "Sipariş Akışı Önizlemesi", description: "Yerel sipariş SLA ve sahiplik simülasyonu", version: "demo-2.4", dependency: "Yerel örnek kayıtlar", health: "Yerel örnek", enabled: true },
  { id: "seller-approvals", name: "Satıcı Onboarding", description: "Hedef başvuru ve belge kontrolü", version: "demo-1.8", dependency: "Kimlik ve roller · henüz yok", health: "Entegrasyonda", enabled: false },
  { id: "catalog-health", name: "Katalog Sağlığı Önizlemesi", description: "Yerel stok, medya ve içerik tamlığı simülasyonu", version: "demo-3.1", dependency: "Yerel örnek katalog", health: "Yerel örnek", enabled: true },
  { id: "settlement-radar", name: "Hakediş Radarı", description: "Hedef ödeme ve mutabakat görünümü", version: "demo-1.6", dependency: "Finansal ledger · henüz yok", health: "Entegrasyonda", enabled: false },
  { id: "customer-voice", name: "Müşteri Sesi", description: "Hedef soru, iade ve memnuniyet özeti", version: "demo-1.2", dependency: "Müşteri entegrasyonu · henüz yok", health: "Entegrasyonda", enabled: false },
  { id: "conversion-lab", name: "Dönüşüm Laboratuvarı", description: "Hedef ürün davranış içgörüleri", version: "demo-2.0", dependency: "Raporlama entegrasyonu · henüz yok", health: "Entegrasyonda", enabled: false },
];

export const initialWorkspaceSettings = {
  name: "NovaStore Pazaryeri",
  email: "demo-operasyon@example.invalid",
  timezone: "Europe/Istanbul",
  store: "Tüm Mağazalar · 24",
  approval: true,
  settlement: true,
  digest: false,
};

export function normalizeText(value) {
  return String(value ?? "").toLocaleLowerCase("tr-TR").replaceAll("\u0307", "").trim();
}

export function matchesQuery(record, query) {
  const needle = normalizeText(query);
  if (!needle) return true;
  return Object.values(record).some((value) => normalizeText(value).includes(needle));
}

export function storeFilterValue(store) {
  if (!store || store.startsWith("Tüm Mağazalar")) return "";
  return normalizeText(String(store).split("·")[0]);
}

export function matchesStore(record, store) {
  const needle = storeFilterValue(store);
  if (!needle) return true;
  return normalizeText(record.seller || record.store).includes(needle);
}

export function paginateRows(rows, requestedPage, requestedPageSize) {
  const pageSize = Math.max(1, Number.parseInt(requestedPageSize, 10) || 10);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(requestedPage, 10) || 1), pageCount);
  const startIndex = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    pageCount,
    start: rows.length === 0 ? 0 : startIndex + 1,
    end: Math.min(startIndex + pageSize, rows.length),
    rows: rows.slice(startIndex, startIndex + pageSize),
  };
}

export function setOrderStatuses(records, ids, status) {
  const targetIds = ids instanceof Set ? ids : new Set(ids);
  return records.map((record) => targetIds.has(record.id) ? { ...record, status } : record);
}

export function setOrderOwner(records, ids, owner) {
  const targetIds = ids instanceof Set ? ids : new Set(ids);
  return records.map((record) => targetIds.has(record.id) ? { ...record, owner } : record);
}

export function setCustomerSegment(records, id, segment) {
  return records.map((record) => record.id === id ? { ...record, segment } : record);
}

export function setSellerDecision(records, id, status, reason = "") {
  const normalizedReason = String(reason).trim();
  return records.map((record) => record.id === id
    ? ((!["Onaylandı", "Reddedildi"].includes(status))
      || (status === "Onaylandı" && calculateSellerReviewPriority(record).approvalEligible !== true)
      || (status === "Reddedildi" && normalizedReason.length < 5)
      ? record
      : { ...record, status, decisionReason: status === "Reddedildi" ? normalizedReason : "" })
    : record);
}

export function toggleModuleAvailability(records, id) {
  return records.map((record) => record.id === id ? { ...record, enabled: !record.enabled } : record);
}

export function markNotificationsRead(records, id = null) {
  return records.map((record) => id === null || record.id === id ? { ...record, read: true } : record);
}

function csvCell(value) {
  const raw = String(value ?? "");
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replaceAll('"', '""')}"`;
}

export function buildCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(";");
  const body = rows.map((row) => columns.map((column) => csvCell(typeof column.value === "function" ? column.value(row) : row[column.value])).join(";")).join("\n");
  return `\uFEFF${header}${body ? `\n${body}` : ""}`;
}

export function validateProductDraft(draft, products, editingOfferId = "") {
  const name = String(draft.name || "").trim();
  const sku = String(draft.sku || "").trim().toLocaleUpperCase("tr-TR");
  const price = Number(draft.price);
  const stock = Number(draft.stock);
  if (name.length < 3) return "Ürün adı en az 3 karakter olmalıdır.";
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(sku)) return "Stok kodu 3–32 karakter olmalı; yalnız harf, rakam ve tire içermelidir.";
  const existingOffer = editingOfferId ? products.find((product) => product.offerId === editingOfferId) : null;
  const sellerId = existingOffer?.sellerId || firstPartySellerId;
  if (products.some((product) => product.sellerId === sellerId && product.sku === sku && product.offerId !== editingOfferId)) return "Bu stok kodu aynı satıcının başka bir örnek teklifinde kullanılıyor.";
  if (!Number.isFinite(price) || price <= 0) return "Satış fiyatı sıfırdan büyük olmalıdır.";
  if (!Number.isInteger(stock) || stock < 0) return "Başlangıç stoku sıfır veya pozitif tam sayı olmalıdır.";
  return "";
}

export function productFromDraft(draft, previous = null) {
  const externalOffer = Boolean(previous && !isFirstPartyOffer(previous));
  const sku = externalOffer ? previous.sku : String(draft.sku || "").trim().toLocaleUpperCase("tr-TR");
  const stock = externalOffer ? previous.stock : Number(draft.stock);
  const base = {
    ...previous,
    canonicalId: previous?.canonicalId || `KAT-YEREL-${sku}`,
    offerId: previous?.offerId || `TKL-YEREL-${sku}`,
    sellerId: previous?.sellerId || firstPartySellerId,
    ownershipType: previous?.ownershipType || "first_party",
    sku,
    name: String(draft.name || "").trim(),
    seller: previous?.seller || "NovaStore",
    category: String(draft.category || "Elektronik"),
    stock,
    price: externalOffer ? previous.price : Number(draft.price),
    policyContext: previous?.policyContext || { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "not_required", canonicalMatchConfidence: 1, prohibitedContent: false, priceAnomaly: false },
    image: previous?.image || "/assets/product-laptop.webp",
  };
  return withProductPolicy(base);
}

export function upsertProductOffer(records, nextProduct, editingOfferId = "") {
  if (!editingOfferId) {
    const normalized = productFromDraft(nextProduct);
    const duplicate = records.some((record) => record.offerId === normalized.offerId || (record.sellerId === normalized.sellerId && record.sku === normalized.sku));
    return duplicate ? records : [normalized, ...records];
  }
  const previous = records.find((record) => record.offerId === editingOfferId);
  if (!previous) return records;
  const normalized = productFromDraft({ ...previous, ...nextProduct }, previous);
  const duplicate = records.some((record) => record.offerId !== editingOfferId && record.sellerId === normalized.sellerId && record.sku === normalized.sku);
  if (duplicate) return records;
  return records.map((record) => record.offerId === editingOfferId
    ? normalized
    : record.canonicalId === normalized.canonicalId
      ? { ...record, name: normalized.name, category: normalized.category }
      : record);
}
