import assert from "node:assert/strict";
import {
  analyticsPeriods,
  buildCsv,
  categoryPreviewRows,
  customerRecords,
  filterTemplateRows,
  initialWorkspaceSettings,
  matchesQuery,
  matchesStore,
  markNotificationsRead,
  moduleRecords,
  normalizeText,
  notificationRows,
  orderRecords,
  paginateRows,
  productFromDraft,
  productRecords,
  returnRows,
  roleLayoutSeed,
  sellerApplicationRecords,
  sellerOrderRows,
  setCustomerSegment,
  setOrderOwner,
  setOrderStatuses,
  setSellerDecision,
  settlementRecords,
  stockRiskRows,
  storeFilterValue,
  toggleModuleAvailability,
  validateProductDraft,
} from "../admin-commerce-pro/src/previewModel.js";

const rows = Array.from({ length: 12 }, (_value, index) => ({ id: index + 1 }));
assert.deepEqual(paginateRows(rows, 2, 5), {
  page: 2,
  pageSize: 5,
  pageCount: 3,
  start: 6,
  end: 10,
  rows: rows.slice(5, 10),
});
assert.equal(paginateRows([], 8, 5).page, 1, "boş sonuçta sayfa 1'e sıkıştırılmalı");
assert.deepEqual(paginateRows([], 8, 5), {
  page: 1,
  pageSize: 5,
  pageCount: 1,
  start: 0,
  end: 0,
  rows: [],
});
assert.equal(paginateRows(rows, 99, 5).page, 3, "taşan sayfa son sayfaya sıkıştırılmalı");
assert.equal(paginateRows(rows, -4, -2).pageSize, 1, "negatif sayfa boyutu güvenli alt sınıra sıkıştırılmalı");
assert.equal(paginateRows(rows, "geçersiz", "geçersiz").pageSize, 10, "geçersiz sayfa boyutu varsayılana dönmeli");
assert.deepEqual(rows.map((row) => row.id), Array.from({ length: 12 }, (_value, index) => index + 1), "sayfalama girdiyi değiştirmemeli");

const transitionOrders = [{ id: "A", status: "Yeni", owner: "Ece" }, { id: "B", status: "Yeni", owner: "Mehmet" }];
const statusTransition = setOrderStatuses(transitionOrders, ["A"], "Hazırlanıyor");
assert.equal(statusTransition[0].status, "Hazırlanıyor", "hedef sipariş durumu değişmeli");
assert.equal(statusTransition[1], transitionOrders[1], "hedef dışı sipariş referansı korunmalı");
assert.equal(transitionOrders[0].status, "Yeni", "sipariş durum geçişi girdiyi değiştirmemeli");
const ownerTransition = setOrderOwner(transitionOrders, new Set(["B"]), "Ayşe");
assert.equal(ownerTransition[1].owner, "Ayşe", "toplu sahip ataması hedef ID'yi güncellemeli");
assert.equal(ownerTransition[0].owner, "Ece", "toplu sahip ataması hedef dışını korumalı");

const customerTransition = setCustomerSegment([{ id: "C", segment: "Yeni" }], "C", "VIP");
assert.equal(customerTransition[0].segment, "VIP", "müşteri segment geçişi uygulanmalı");
const sellerTransition = setSellerDecision([{ id: "S", status: "İncelemede" }], "S", "Reddedildi", "  Eksik belge  ");
assert.deepEqual(sellerTransition[0], { id: "S", status: "Reddedildi", decisionReason: "Eksik belge" }, "satıcı kararı gerekçeyi normalize etmeli");
const approvedSellerTransition = setSellerDecision(sellerTransition, "S", "Onaylandı");
assert.deepEqual(approvedSellerTransition[0], { id: "S", status: "Onaylandı", decisionReason: "" }, "onaylanan satıcının eski red gerekçesi temizlenmeli");
const moduleTransition = toggleModuleAvailability([{ id: "M", enabled: false }], "M");
assert.equal(moduleTransition[0].enabled, true, "modül genel kullanılabilirliği terslenmeli");
const notificationTransition = markNotificationsRead([{ id: "N1", read: false }, { id: "N2", read: false }], "N1");
assert.deepEqual(notificationTransition.map((item) => item.read), [true, false], "tek bildirim okundu geçişi hedefe uygulanmalı");
assert.ok(markNotificationsRead(notificationTransition).every((item) => item.read), "tüm bildirimleri okundu geçişi uygulanmalı");

assert.equal(normalizeText("  İADE İNCELEMESİ  "), "iade incelemesi");
assert.equal(normalizeText(null), "");
assert.equal(matchesQuery({ name: "İade İncelemesi", id: "IAD-42" }, "iade"), true);
assert.equal(matchesQuery({ name: "İade İncelemesi", id: "IAD-42" }, "42"), true, "sayısal tanımlayıcı aranabilmeli");
assert.equal(matchesQuery({ name: "İade İncelemesi", id: "IAD-42" }, ""), true, "boş sorgu tüm kayıtları eşlemeli");
assert.equal(matchesQuery({ name: "İade İncelemesi", id: "IAD-42" }, "sipariş"), false);
assert.equal(storeFilterValue("Tüm Mağazalar · 12"), "");
assert.equal(storeFilterValue("TeknoPark · 2 mağaza"), "teknopark");
assert.equal(matchesStore({ seller: "Eviva Home" }, "Tüm Mağazalar · 12"), true);
assert.equal(matchesStore({ seller: "TeknoPark Mağazası" }, "TeknoPark · 2 mağaza"), true);
assert.equal(matchesStore({ store: "TeknoPark Merkez" }, "TeknoPark · 2 mağaza"), true, "store alanı da filtrelenebilmeli");
assert.equal(matchesStore({ seller: "Eviva Home" }, "TeknoPark · 2 mağaza"), false);

const products = [{ sku: "NVS-ABC", name: "Mevcut" }];
assert.equal(validateProductDraft({ name: "Yeni ürün", sku: "nvs-abc", price: 100, stock: 2 }, products), "Bu stok kodu başka bir örnek üründe kullanılıyor.");
assert.equal(validateProductDraft({ name: "Yeni ürün", sku: "nvs-abc", price: 100, stock: 2 }, products, "NVS-ABC"), "", "düzenlenen ürün kendi stok kodunu koruyabilmeli");
assert.equal(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 2 }, products), "");
assert.ok(validateProductDraft({ name: "Yo", sku: "nvs-new", price: 100, stock: 2 }, products), "kısa ürün adı reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nv_1", price: 100, stock: 2 }, products), "geçersiz stok kodu reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 0, stock: 2 }, products), "pozitif olmayan fiyat reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 2.5 }, products), "kesirli stok reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 0, status: "Yayında" }, products), "stoksuz ürün yayında bırakılamamalı");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 2, status: "Stokta yok" }, products), "stoklu ürün stokta yok bırakılamamalı");
assert.deepEqual(productFromDraft({ name: " Yeni ürün ", sku: "nvs-new", seller: "NovaStore", category: "Elektronik", price: "199", stock: "0" }), {
  sku: "NVS-NEW",
  name: "Yeni ürün",
  seller: "NovaStore",
  category: "Elektronik",
  stock: 0,
  price: 199,
  status: "Stokta yok",
  image: "/assets/product-laptop.webp",
});
assert.equal(productFromDraft({ name: "Az stok", sku: "az-stok", price: 10, stock: 4 }).status, "Düşük stok");
assert.equal(productFromDraft({ name: "Yeterli stok", sku: "stok-ok", price: 10, stock: 10 }).status, "Yayında");
assert.deepEqual(
  productFromDraft(
    { name: "Güncel ad", sku: "urun-1", seller: "NovaStore", category: "Elektronik", price: 250, stock: 12, status: "Taslak" },
    { image: "/assets/product-watch.webp" },
  ),
  {
    sku: "URUN-1",
    name: "Güncel ad",
    seller: "NovaStore",
    category: "Elektronik",
    stock: 12,
    price: 250,
    status: "Taslak",
    image: "/assets/product-watch.webp",
  },
  "düzenleme önceki görseli ve açık durumu korumalı",
);

const csv = buildCsv([
  { label: "Ürün", value: "name" },
  { label: "Tutar", value: (row) => row.amount },
], [{ name: "=HYPERLINK(\"https://example.invalid\")", amount: 42 }]);
assert.ok(csv.startsWith("\uFEFF"), "Excel için UTF-8 BOM bulunmalı");
assert.ok(csv.includes("'=HYPERLINK"), "CSV formül enjeksiyonu etkisizleştirilmeli");
assert.equal(buildCsv([{ label: "Ad;Soyad", value: "name" }], []), '\uFEFF"Ad;Soyad"', "boş CSV yalnız başlık satırını üretmeli");
const escapedCsv = buildCsv(
  [{ label: "Değer", value: "value" }],
  [{ value: 'Ayşe; "Nova"' }, { value: "+SUM(1;1)" }, { value: "-2+3" }, { value: "@cmd" }, { value: "\t=cmd" }, { value: "\r=cmd" }],
);
assert.ok(escapedCsv.includes('"Ayşe; ""Nova"""'), "ayraç ve tırnaklar CSV içinde kaçırılmalı");
for (const formula of ["'+SUM", "'-2+3", "'@cmd", "'\t=cmd", "'\r=cmd"]) {
  assert.ok(escapedCsv.includes(formula), `${formula.slice(1)} formülü etkisizleştirilmeli`);
}

for (const [label, records, idKey] of [
  ["müşteri", customerRecords, "id"],
  ["satıcı siparişi", sellerOrderRows, "id"],
  ["iade", returnRows, "id"],
  ["stok riski", stockRiskRows, "sku"],
  ["bildirim", notificationRows, "id"],
  ["kategori", categoryPreviewRows, "id"],
  ["filtre şablonu", filterTemplateRows, "id"],
  ["rol yerleşimi", roleLayoutSeed, "id"],
  ["sipariş", orderRecords, "id"],
  ["ürün", productRecords, "sku"],
  ["satıcı başvurusu", sellerApplicationRecords, "id"],
  ["hakediş", settlementRecords, "id"],
  ["modül", moduleRecords, "id"],
]) {
  assert.ok(records.length > 0, `${label} örnek verisi boş olmamalı`);
  const identifiers = records.map((record) => record[idKey]);
  assert.equal(new Set(identifiers).size, identifiers.length, `${label} tanımlayıcıları benzersiz olmalı`);
  assert.ok(identifiers.every(Boolean), `${label} tanımlayıcıları dolu olmalı`);
}

assert.equal(orderRecords.length, 28, "gerçek sayfalama için 28 deterministik sipariş bulunmalı");
assert.equal(orderRecords.filter((order) => order.today).length, 12, "Bugün görünümü 12 deterministik sipariş içermeli");
assert.ok(
  sellerOrderRows.every((sellerOrder) => orderRecords.some((order) => order.id === sellerOrder.parent)),
  "satıcı siparişlerinin ana siparişleri örnek siparişlerde bulunmalı",
);
assert.ok(
  stockRiskRows.every((stockRisk) => productRecords.some((product) => product.sku === stockRisk.sku)),
  "stok risklerinin SKU kayıtları örnek katalogda bulunmalı",
);
assert.ok(productRecords.every((product) => product.price > 0 && product.stock >= 0), "ürün fiyat ve stokları güvenli aralıkta olmalı");
assert.ok(orderRecords.every((order) => Number.isFinite(order.amount) && order.amount > 0), "sipariş tutarları pozitif ve sayısal olmalı");
assert.ok(settlementRecords.every((row) => [row.gross, row.commission, row.returns, row.net].every(Number.isFinite)), "hakediş alanları sayısal olmalı");
assert.ok(settlementRecords.every((row) => row.net === row.gross - row.commission - row.returns), "hakediş aritmetiği tutarlı olmalı");
assert.ok(moduleRecords.some((module) => module.enabled) && moduleRecords.some((module) => !module.enabled), "modül toggle senaryoları için iki durum da bulunmalı");
assert.equal(initialWorkspaceSettings.store, "Tüm Mağazalar · 24");
assert.equal(initialWorkspaceSettings.timezone, "Europe/Istanbul", "saat dilimi geçerli IANA kimliği kullanmalı");

assert.deepEqual(Object.keys(analyticsPeriods), ["Son 7 gün", "Son 30 gün", "Bu yıl"]);
assert.ok(
  Object.values(analyticsPeriods).every((period) => Number.isFinite(period.multiplier) && period.multiplier > 0),
  "analitik dönem çarpanları pozitif ve sayısal olmalı",
);

console.log("admin Commerce Pro model smoke passed");
