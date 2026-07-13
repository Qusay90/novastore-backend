export const customerRecords = [
  { id: "CUS-86420", name: "Seda Arslan", email: "seda.arslan@email.com", orders: 7, lifetimeValue: 86240, segment: "VIP", lastActivity: "2 gün önce", city: "İstanbul", consent: "E-posta ve SMS", support: "Teslimat tercihi güncellendi" },
  { id: "CUS-86419", name: "Ahmet Demir", email: "ahmet.demir@email.com", orders: 4, lifetimeValue: 32680, segment: "Sadık", lastActivity: "Bugün", city: "Ankara", consent: "E-posta", support: "Açık talep yok" },
  { id: "CUS-86418", name: "Mustafa Çelik", email: "mustafa.celik@email.com", orders: 11, lifetimeValue: 118940, segment: "VIP", lastActivity: "Dün", city: "İzmir", consent: "E-posta ve SMS", support: "İade talebi inceleniyor" },
  { id: "CUS-86417", name: "Elif Nazlı", email: "elif.nazli@email.com", orders: 2, lifetimeValue: 12480, segment: "Yeni", lastActivity: "3 gün önce", city: "Bursa", consent: "E-posta", support: "İlk sipariş kuponu kullanıldı" },
  { id: "CUS-86416", name: "Burak Güneş", email: "burak.gunes@email.com", orders: 6, lifetimeValue: 44120, segment: "Sadık", lastActivity: "Bugün", city: "Antalya", consent: "Yalnız zorunlu", support: "Ürün sorusu yanıtlandı" },
];

export const sellerOrderRows = [
  { id: "SS-10482-1", parent: "NS-10482", seller: "TeknoPark Mağazası", item: "Apple iPhone 15 128 GB", amount: 51999, shipping: "Bugün 16:00", status: "Hazırlanıyor" },
  { id: "SS-10481-1", parent: "NS-10481", seller: "NovaStore", item: "NovaTech AeroBook 14", amount: 18999, shipping: "Kargoda", status: "Kargoya Verildi" },
  { id: "SS-10480-1", parent: "NS-10480", seller: "Eviva Home", item: "NovaHome S10 Robot Süpürge", amount: 7999, shipping: "Bugün 14:30", status: "Yeni" },
  { id: "SS-10479-1", parent: "NS-10479", seller: "TeknoPark", item: "Samsung Galaxy S24 256 GB", amount: 38999, shipping: "Kargoda", status: "Kargoya Verildi" },
];

export const returnRows = [
  { id: "IAD-3021", order: "NS-10463", customer: "Zeynep Koç", seller: "TeknoPark", reason: "Beklentiyi karşılamadı", amount: 3499, sla: "42 dk", status: "İnceleniyor" },
  { id: "IAD-3020", order: "NS-10451", customer: "Kerem Şen", seller: "Eviva Home", reason: "Hasarlı ürün", amount: 1299, sla: "1 sa 08 dk", status: "Kargo bekleniyor" },
  { id: "IAD-3019", order: "NS-10442", customer: "Dila Akın", seller: "NovaStore", reason: "Yanlış ürün", amount: 18999, sla: "2 sa 14 dk", status: "Onay bekliyor" },
];

export const stockRiskRows = [
  { sku: "NVS-S10-RBT", product: "NovaHome S10 Robot Süpürge", seller: "Eviva Home", available: 7, reserved: 4, cover: "1,8 gün", status: "Kritik" },
  { sku: "NVS-WCH-02", product: "Smartix Watch 2", seller: "TeknoPark", available: 0, reserved: 2, cover: "Tükendi", status: "Stokta yok" },
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
  { seller: "TeknoPark Mağazası", customer: "Seda Arslan", product: "Apple iPhone 15 128 GB", channel: "Web", amount: 51999, status: "Hazırlanıyor", owner: "Mehmet A.", image: "/assets/phone-iphone.webp" },
  { seller: "NovaStore", customer: "Ahmet Demir", product: "NovaTech AeroBook 14", channel: "Web", amount: 18999, status: "Kargoya Verildi", owner: "Ece T.", image: "/assets/product-laptop.webp" },
  { seller: "Eviva Home", customer: "Mustafa Çelik", product: "NovaHome S10 Robot Süpürge", channel: "Hepsiburada", amount: 7999, status: "Yeni", owner: "Ece T.", image: "/assets/product-vacuum.webp" },
  { seller: "TeknoPark", customer: "Elif Nazlı", product: "Samsung Galaxy S24 256 GB", channel: "Trendyol", amount: 38999, status: "Kargoya Verildi", owner: "Mehmet A.", image: "/assets/phone-samsung.webp" },
  { seller: "Eviva Home", customer: "Burak Güneş", product: "NovaSound Bar 600", channel: "Web", amount: 4999, status: "Teslim Edildi", owner: "Ece T.", image: "/assets/product-headphones.webp" },
  { seller: "NovaStore", customer: "Gamze İnce", product: "Nova Cook Airfryer 5.5L", channel: "Mobil", amount: 2899, status: "Hazırlanıyor", owner: "Mehmet A.", image: "/assets/category-home.webp" },
  { seller: "TeknoPark", customer: "Buse Yıldız", product: "Logitech MX Master 3S", channel: "Web", amount: 2199, status: "Yeni", owner: "Ece T.", image: "/assets/product-laptop.webp" },
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

export const productRecords = [
  { sku: "NVS-IP15-128", name: "Apple iPhone 15 128 GB", seller: "TeknoPark", category: "Cep Telefonu", stock: 42, price: 51999, status: "Yayında", image: "/assets/phone-iphone.webp" },
  { sku: "NVS-AB14-512", name: "NovaTech AeroBook 14", seller: "NovaStore", category: "Dizüstü Bilgisayar", stock: 18, price: 18999, status: "Yayında", image: "/assets/product-laptop.webp" },
  { sku: "NVS-S10-RBT", name: "NovaHome S10 Robot Süpürge", seller: "Eviva Home", category: "Elektrikli Ev Aleti", stock: 7, price: 7999, status: "Düşük stok", image: "/assets/product-vacuum.webp" },
  { sku: "NVS-WCH-02", name: "Smartix Watch 2", seller: "TeknoPark", category: "Akıllı Saat", stock: 0, price: 3499, status: "Stokta yok", image: "/assets/product-watch.webp" },
  { sku: "NVS-BDS-04", name: "Soft Touch Nevresim Seti", seller: "Eviva Home", category: "Ev Tekstili", stock: 84, price: 1299, status: "Onay bekliyor", image: "/assets/product-bedding.webp" },
];

export const sellerApplicationRecords = [
  { id: "SLR-208", name: "Dora Kozmetik", owner: "Derya Aydın", category: "Kozmetik", products: 126, commission: "%14", risk: "Düşük", status: "İncelemede" },
  { id: "SLR-207", name: "Atlas Outdoor", owner: "Can Öztürk", category: "Spor & Outdoor", products: 84, commission: "%12", risk: "Düşük", status: "Belge bekleniyor" },
  { id: "SLR-206", name: "Minika Dünyası", owner: "Selin Kaya", category: "Anne & Çocuk", products: 218, commission: "%16", risk: "Orta", status: "İncelemede" },
  { id: "SLR-205", name: "MobilPlus", owner: "Okan Şen", category: "Elektronik", products: 342, commission: "%10", risk: "Yüksek", status: "İncelemede" },
];

export const settlementRecords = [
  { id: "HKD-0726", seller: "TeknoPark", period: "01–07 Tem 2026", gross: 482140, commission: 48214, returns: 12490, net: 421436, status: "Ödemeye hazır" },
  { id: "HKD-0725", seller: "Eviva Home", period: "01–07 Tem 2026", gross: 214890, commission: 30085, returns: 7999, net: 176806, status: "Kontrol ediliyor" },
  { id: "HKD-0724", seller: "Dora Kozmetik", period: "01–07 Tem 2026", gross: 118420, commission: 16579, returns: 2840, net: 99001, status: "Blokeli" },
  { id: "HKD-0719", seller: "Atlas Outdoor", period: "24–30 Haz 2026", gross: 97220, commission: 11666, returns: 0, net: 85554, status: "Ödendi" },
];

export const auditRecords = [
  { time: "10:24", actor: "Mehmet Akın", action: "Sipariş durumunu güncelledi", target: "NS-10482 · Hazırlanıyor", source: "Web" },
  { time: "10:18", actor: "Ece Tan", action: "Satıcı başvurusunu inceledi", target: "SLR-208 · Dora Kozmetik", source: "Web" },
  { time: "09:56", actor: "Sistem", action: "Hakediş raporu oluşturdu", target: "HKD-0726 · TeknoPark", source: "Otomasyon" },
  { time: "09:41", actor: "Ayşe Kara", action: "Ürün yayına alındı", target: "NVS-IP15-128", source: "Web" },
  { time: "09:12", actor: "Sistem", action: "Sipariş oluşturuldu", target: "NS-10482", source: "Entegrasyon" },
];

export const moduleRecords = [
  { id: "live-orders", name: "Canlı Sipariş Akışı", description: "Sipariş SLA ve sahiplik takibi", version: "v2.4.1", dependency: "Sipariş çekirdeği", health: "Sağlıklı", enabled: true },
  { id: "seller-approvals", name: "Satıcı Onayları", description: "Yeni başvuru ve belge kontrolü", version: "v1.8.0", dependency: "Kimlik ve roller", health: "Sağlıklı", enabled: true },
  { id: "catalog-health", name: "Katalog Sağlığı", description: "Stok, medya ve içerik tamlığı", version: "v3.1.2", dependency: "Kanonik katalog", health: "Sağlıklı", enabled: true },
  { id: "settlement-radar", name: "Hakediş Radarı", description: "Ödeme ve mutabakat riskleri", version: "v1.6.4", dependency: "Finansal ledger", health: "Sağlıklı", enabled: true },
  { id: "customer-voice", name: "Müşteri Sesi", description: "Soru, iade ve memnuniyet özeti", version: "v1.2.0", dependency: "Müşteriler", health: "Hazır", enabled: false },
  { id: "conversion-lab", name: "Dönüşüm Laboratuvarı", description: "Ürün bazlı davranış içgörüleri", version: "v2.0.3", dependency: "Raporlar", health: "Hazır", enabled: false },
];

export const initialWorkspaceSettings = {
  name: "NovaStore Pazaryeri",
  email: "operasyon@novastore.tr",
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
    ? { ...record, status, decisionReason: status === "Reddedildi" ? normalizedReason : "" }
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

export function validateProductDraft(draft, products, editingSku = "") {
  const name = String(draft.name || "").trim();
  const sku = String(draft.sku || "").trim().toLocaleUpperCase("tr-TR");
  const price = Number(draft.price);
  const stock = Number(draft.stock);
  if (name.length < 3) return "Ürün adı en az 3 karakter olmalıdır.";
  if (!/^[A-Z0-9][A-Z0-9-]{2,31}$/.test(sku)) return "Stok kodu 3–32 karakter olmalı; yalnız harf, rakam ve tire içermelidir.";
  if (products.some((product) => product.sku === sku && product.sku !== editingSku)) return "Bu stok kodu başka bir örnek üründe kullanılıyor.";
  if (!Number.isFinite(price) || price <= 0) return "Satış fiyatı sıfırdan büyük olmalıdır.";
  if (!Number.isInteger(stock) || stock < 0) return "Başlangıç stoku sıfır veya pozitif tam sayı olmalıdır.";
  if (stock === 0 && draft.status && !["Stokta yok", "Onay bekliyor"].includes(draft.status)) return "Stoku olmayan ürün yalnız “Stokta yok” veya “Onay bekliyor” durumunda olabilir.";
  if (stock > 0 && draft.status === "Stokta yok") return "Stok bulunan ürün “Stokta yok” durumunda bırakılamaz.";
  return "";
}

export function productFromDraft(draft, previous = null) {
  const stock = Number(draft.stock);
  return {
    sku: String(draft.sku || "").trim().toLocaleUpperCase("tr-TR"),
    name: String(draft.name || "").trim(),
    seller: String(draft.seller || "NovaStore"),
    category: String(draft.category || "Elektronik"),
    stock,
    price: Number(draft.price),
    status: String(draft.status || (stock === 0 ? "Stokta yok" : stock < 10 ? "Düşük stok" : "Yayında")),
    image: previous?.image || "/assets/product-laptop.webp",
  };
}
