import assert from "node:assert/strict";
import {
  analyticsPeriods,
  buildCsv,
  calculateSellerReviewPriority,
  catalogPolicyVersion,
  categoryPreviewRows,
  customerRecords,
  evaluateProductPublication,
  filterTemplateRows,
  firstPartySellerId,
  getInventoryStatus,
  initialWorkspaceSettings,
  isFirstPartyOffer,
  isSellerDocumentComplete,
  isSellerDocumentStateValid,
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
  sellerReviewRuleset,
  sellerOrderRows,
  setCustomerSegment,
  setOrderOwner,
  setOrderStatuses,
  setSellerDecision,
  settlementRecords,
  stockRiskRows,
  storeFilterValue,
  toggleModuleAvailability,
  upsertProductOffer,
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
assert.equal(setSellerDecision([{ id: "S", status: "İncelemede" }], "S", "Reddedildi", "")[0].status, "İncelemede", "boş red gerekçesi model katmanında reddedilmeli");
assert.equal(setSellerDecision([{ id: "S", status: "İncelemede" }], "S", "Reddedildi", "kısa")[0].status, "İncelemede", "beş karakterden kısa red gerekçesi model katmanında reddedilmeli");
assert.equal(setSellerDecision([{ id: "S", status: "İncelemede" }], "S", "Belirsiz", "yeterli gerekçe")[0].status, "İncelemede", "tanımsız onboarding kararı fail-closed kalmalı");
const eligibleVerification = { company: "verified", bank: "verified", documents: { tax: "verified", signature: "verified", agreement: "verified", license: "not-required" }, permission: "not-required", duplicate: "clear" };
const approvedSellerTransition = setSellerDecision([{ ...sellerTransition[0], verification: eligibleVerification, review: { approvalEligible: false } }], "S", "Onaylandı");
assert.equal(approvedSellerTransition[0].status, "Onaylandı", "yalnız açıkça uygun satıcı onaylanmalı");
assert.equal(approvedSellerTransition[0].decisionReason, "", "onaylanan satıcının eski red gerekçesi temizlenmeli");
const blockedApproval = setSellerDecision([{ id: "B", status: "İncelemede", verification: { ...eligibleVerification, bank: "pending" }, review: { approvalEligible: true } }], "B", "Onaylandı");
assert.equal(blockedApproval[0].status, "İncelemede", "zorunlu onboarding doğrulaması eksik satıcı onaylanamamalı");
const missingReviewApproval = setSellerDecision([{ id: "M", status: "İncelemede" }], "M", "Onaylandı");
assert.equal(missingReviewApproval[0].status, "İncelemede", "review verisi yoksa onboarding onayı fail-closed kalmalı");
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
assert.equal(storeFilterValue("Demo Teknoloji · 2 mağaza"), "demo teknoloji");
assert.equal(matchesStore({ seller: "Demo Ev" }, "Tüm Mağazalar · 12"), true);
assert.equal(matchesStore({ seller: "Demo Teknoloji Mağazası" }, "Demo Teknoloji · 2 mağaza"), true);
assert.equal(matchesStore({ store: "Demo Teknoloji Merkez" }, "Demo Teknoloji · 2 mağaza"), true, "store alanı da filtrelenebilmeli");
assert.equal(matchesStore({ seller: "Demo Ev" }, "Demo Teknoloji · 2 mağaza"), false);

const products = [{ offerId: "TKL-A", sellerId: firstPartySellerId, sku: "NVS-ABC", name: "Mevcut" }];
assert.equal(validateProductDraft({ name: "Yeni ürün", sellerId: firstPartySellerId, sku: "nvs-abc", price: 100, stock: 2 }, products), "Bu stok kodu aynı satıcının başka bir örnek teklifinde kullanılıyor.");
assert.equal(validateProductDraft({ name: "Yeni ürün", sellerId: firstPartySellerId, sku: "nvs-abc", price: 100, stock: 2 }, products, "TKL-A"), "", "düzenlenen teklif kendi satıcı stok kodunu koruyabilmeli");
assert.equal(validateProductDraft({ name: "Yeni ürün", sku: "nvs-abc", price: 100, stock: 2 }, [{ offerId: "TKL-B", sellerId: "SEL-BASKA", sku: "NVS-ABC" }]), "", "aynı stok kodu farklı satıcı kapsamlarında kullanılabilmeli");
assert.equal(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 2 }, products), "");
assert.ok(validateProductDraft({ name: "Yo", sku: "nvs-new", price: 100, stock: 2 }, products), "kısa ürün adı reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nv_1", price: 100, stock: 2 }, products), "geçersiz stok kodu reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 0, stock: 2 }, products), "pozitif olmayan fiyat reddedilmeli");
assert.ok(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 2.5 }, products), "kesirli stok reddedilmeli");
assert.equal(validateProductDraft({ name: "Yeni ürün", sku: "nvs-new", price: 100, stock: 0 }, products), "", "stok sağlığı yayın kararından bağımsız doğrulanmalı");
const newProduct = productFromDraft({ name: " Yeni ürün ", sku: "nvs-new", seller: "Başka satıcı", category: "Elektronik", price: "199", stock: "0" });
assert.deepEqual({
  canonicalId: newProduct.canonicalId,
  offerId: newProduct.offerId,
  sku: newProduct.sku,
  name: newProduct.name,
  seller: newProduct.seller,
  category: newProduct.category,
  stock: newProduct.stock,
  price: newProduct.price,
  publicationStatus: newProduct.publicationStatus,
  inventoryStatus: newProduct.inventoryStatus,
  policyVersion: newProduct.policyVersion,
}, {
  canonicalId: "KAT-YEREL-NVS-NEW",
  offerId: "TKL-YEREL-NVS-NEW",
  sku: "NVS-NEW",
  name: "Yeni ürün",
  seller: "NovaStore",
  category: "Elektronik",
  stock: 0,
  price: 199,
  publicationStatus: "Otomatik yayında",
  inventoryStatus: "Stokta yok",
  policyVersion: catalogPolicyVersion,
});
assert.equal(getInventoryStatus(""), "Stok bekleniyor");
assert.equal(getInventoryStatus(0), "Stokta yok");
assert.equal(getInventoryStatus(4), "Düşük stok");
assert.equal(getInventoryStatus(10), "Stokta");
const passingPolicy = { sellerStatus: "active", categoryAllowed: true, requiredFieldsComplete: true, brandAuthorizationStatus: "verified", canonicalMatchConfidence: 0.99, prohibitedContent: false, priceAnomaly: false };
assert.equal(evaluateProductPublication({ stock: 0, policyContext: passingPolicy }).publicationStatus, "Otomatik yayında", "stok sıfır tek başına insan onayı üretmemeli");
assert.equal(evaluateProductPublication({ policyContext: { ...passingPolicy, requiredFieldsComplete: false } }).publicationStatus, "Satıcı aksiyonu", "düzeltilebilir zorunlu alan eksikliği satıcıya dönmeli");
assert.equal(evaluateProductPublication({ policyContext: { ...passingPolicy, brandAuthorizationStatus: "unverified" } }).publicationStatus, "İstisna incelemesi", "marka yetkisi belirsizliği insan istisnasına düşmeli");
assert.equal(evaluateProductPublication({ policyContext: { ...passingPolicy, sellerStatus: "suspended" } }).publicationStatus, "Yayından kaldırıldı", "askıdaki satıcının teklifi fail-closed olmalı");
assert.equal(evaluateProductPublication({}).publicationStatus, "Yayından kaldırıldı", "eksik politika girdisi otomatik yayınlanmamalı");
for (const signal of Object.keys(passingPolicy)) {
  const incompletePolicy = { ...passingPolicy };
  delete incompletePolicy[signal];
  assert.equal(evaluateProductPublication({ policyContext: incompletePolicy }).publicationStatus, "Yayından kaldırıldı", `${signal} eksikse politika fail-closed kalmalı`);
}
assert.equal(evaluateProductPublication({ policyContext: { ...passingPolicy, categoryAllowed: "evet" } }).publicationStatus, "Yayından kaldırıldı", "geçersiz politika veri tipi otomatik yayınlanmamalı");
assert.equal(evaluateProductPublication({ policyContext: passingPolicy }).reasons[0].code, "POLICY_CHECKS_PASSED", "başarılı otomatik yayın da açıklanabilir reason code taşımalı");

const externalPrevious = productRecords.find((product) => product.ownershipType === "third_party");
const protectedExternalOffer = productFromDraft(
  { ...externalPrevious, name: "Güncel kanonik ad", category: "Elektronik", seller: "NovaStore", sku: "DEGISTI", price: 1, stock: 999 },
  externalPrevious,
);
assert.equal(protectedExternalOffer.name, "Güncel kanonik ad", "platform kanonik içeriği güncelleyebilmeli");
assert.equal(protectedExternalOffer.seller, externalPrevious.seller, "haricî teklif sahibi korunmalı");
assert.equal(protectedExternalOffer.sku, externalPrevious.sku, "satıcı SKU alanı admin düzenlemesinden korunmalı");
assert.equal(protectedExternalOffer.price, externalPrevious.price, "satıcı fiyatı admin düzenlemesinden korunmalı");
assert.equal(protectedExternalOffer.stock, externalPrevious.stock, "satıcı stoku admin düzenlemesinden korunmalı");
assert.equal(isFirstPartyOffer({ ...externalPrevious, seller: "NovaStore" }), false, "gösterim adı teklif sahipliğini değiştirmemeli");
const protectedMislabelledOffer = productFromDraft(
  { ...externalPrevious, seller: "NovaStore", sku: "DEGISTI", price: 1, stock: 999 },
  { ...externalPrevious, seller: "NovaStore" },
);
assert.equal(protectedMislabelledOffer.sku, externalPrevious.sku, "haricî ownership kimliği gösterim adından bağımsız SKU koruması sağlamalı");
assert.equal(protectedMislabelledOffer.price, externalPrevious.price);
assert.equal(protectedMislabelledOffer.stock, externalPrevious.stock);

const canonicalOffers = productRecords.filter((product) => product.canonicalId === "KAT-1001");
assert.equal(canonicalOffers.length, 2, "aynı kanonik ürüne bağlı iki satıcı teklifi örneklenmeli");
assert.equal(canonicalOffers[0].sku, canonicalOffers[1].sku, "satıcı kapsamlı SKU çakışma senaryosu görünür olmalı");
const canonicalUpdate = { ...canonicalOffers[0], name: "Ortak kanonik ad", category: "Telefon" };
const canonicalUpdatedRows = upsertProductOffer(productRecords, canonicalUpdate, canonicalUpdate.offerId);
assert.ok(canonicalUpdatedRows.filter((product) => product.canonicalId === canonicalUpdate.canonicalId).every((product) => product.name === "Ortak kanonik ad" && product.category === "Telefon"), "kanonik içerik bağlı bütün teklif görünümlerine yayılmalı");
assert.equal(canonicalUpdatedRows.find((product) => product.offerId === canonicalOffers[1].offerId).price, canonicalOffers[1].price, "kanonik güncelleme diğer satıcının teklif fiyatını değiştirmemeli");
const tamperedExternalUpdate = upsertProductOffer(productRecords, { ...externalPrevious, offerId: "TKL-HACK", sellerId: firstPartySellerId, ownershipType: "first_party", seller: "NovaStore", sku: "HACK", price: 1, stock: 999 }, externalPrevious.offerId);
const preservedExternal = tamperedExternalUpdate.find((product) => product.offerId === externalPrevious.offerId);
assert.equal(preservedExternal.sellerId, externalPrevious.sellerId, "upsert değişmez satıcı kimliğini korumalı");
assert.equal(preservedExternal.ownershipType, "third_party");
assert.equal(preservedExternal.sku, externalPrevious.sku);
assert.equal(preservedExternal.price, externalPrevious.price);
assert.equal(preservedExternal.stock, externalPrevious.stock);
assert.equal(tamperedExternalUpdate.some((product) => product.offerId === "TKL-HACK"), false, "düzenlemede offerId değiştirilememeli");
assert.equal(upsertProductOffer(productRecords, { name: "Kopya", sku: canonicalOffers[1].sku, price: 10, stock: 1 }, ""), productRecords, "aynı first-party seller SKU ile doğrudan ekleme reddedilmeli");
assert.equal(upsertProductOffer(productRecords, canonicalUpdate, "BULUNMAYAN"), productRecords, "bilinmeyen offer kimliği fail-closed kalmalı");

const sellerReview = (company, bank, documents, permission, duplicate) => calculateSellerReviewPriority({
  verification: { company, bank, documents, permission, duplicate },
});
const verifiedDocuments = { tax: "verified", signature: "verified", agreement: "verified", license: "verified" };
const boundary19 = sellerReview("pending", "verified", verifiedDocuments, "pending", "clear");
assert.equal(boundary19.score, 19);
assert.equal(boundary19.level, "Rutin", "19 puan rutin sınırında kalmalı");
const boundary20 = sellerReview("verified", "verified", { ...verifiedDocuments, tax: "missing", signature: "expired" }, "verified", "clear");
assert.equal(boundary20.score, 20);
assert.equal(boundary20.level, "İnceleme gerekli", "20 puan inceleme sınırını açmalı");
const boundary49 = sellerReview("pending", "pending", { ...verifiedDocuments, tax: "missing" }, "pending", "confirmed");
assert.equal(boundary49.score, 49);
assert.equal(boundary49.level, "İnceleme gerekli", "49 puan inceleme bandında kalmalı");
const boundary50 = sellerReview("verified", "mismatch", { ...verifiedDocuments, tax: "missing" }, "missing", "clear");
assert.equal(boundary50.score, 50);
assert.equal(boundary50.level, "Öncelikli", "50 puan öncelikli sınırını açmalı");
const incompleteReview = calculateSellerReviewPriority({ verification: { company: "verified" } });
assert.equal(incompleteReview.level, "Eksik veri", "eksik sinyal düşük öncelik gibi gösterilmemeli");
assert.equal(incompleteReview.approvalEligible, false);
const partialDocumentReview = sellerReview("verified", "verified", { tax: "verified" }, "not-required", "clear");
assert.equal(partialDocumentReview.level, "Eksik veri", "zorunlu belge anahtarı eksikse veri tam sayılmamalı");
assert.equal(partialDocumentReview.approvalEligible, false, "kısmi belge nesnesi onboarding onayını açmamalı");
const invalidWaiverReview = sellerReview("verified", "verified", { tax: "not-required", signature: "not-required", agreement: "not-required", license: "not-required" }, "not-required", "clear");
assert.equal(invalidWaiverReview.level, "Eksik veri", "vergi, imza ve sözleşme belgeleri koşulsuz not-required sayılamamalı");
assert.equal(invalidWaiverReview.approvalEligible, false);
assert.equal(isSellerDocumentStateValid("tax", "not-required"), false);
assert.equal(isSellerDocumentComplete("tax", "not-required"), false);
assert.equal(isSellerDocumentStateValid("license", "not-required"), true);
assert.equal(isSellerDocumentComplete("license", "not-required"), true);
const possibleDuplicateReview = sellerReview("verified", "verified", verifiedDocuments, "verified", "possible");
assert.equal(possibleDuplicateReview.approvalEligible, false, "olası yinelenen başvuru kapanmadan onboarding onayı açılmamalı");

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
  ["ürün teklifi", productRecords, "offerId"],
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
assert.equal(productRecords.filter((product) => product.publicationStatus === "Otomatik yayında").length, 4, "normal teklifler otomatik yayınlanmalı");
assert.equal(productRecords.filter((product) => product.publicationStatus === "İstisna incelemesi").length, 1, "yalnız politika istisnası insan kuyruğuna düşmeli");
assert.equal(productRecords.filter((product) => product.publicationStatus === "Satıcı aksiyonu").length, 1, "düzeltilebilir eksik satıcıya dönmeli");
assert.ok(productRecords.every((product) => product.policyVersion === catalogPolicyVersion), "her teklif politika sürümü taşımalı");
assert.ok(productRecords.every((product) => product.canonicalId && product.offerId && product.sellerId && product.ownershipType), "kanonik ürün, teklif ve sahiplik kimlikleri ayrılmalı");
assert.equal(new Set(productRecords.map((product) => product.offerId)).size, productRecords.length, "teklif kimliği global UI kimliği olarak benzersiz olmalı");
assert.equal(new Set(productRecords.map((product) => `${product.sellerId}:${product.sku}`)).size, productRecords.length, "satıcı SKU benzersizliği seller-scope içinde uygulanmalı");
assert.ok(productRecords.every((product) => product.reasons.length > 0 && product.evaluatedAt), "her politika sonucu reason code ve değerlendirme zamanı taşımalı");
const outOfStockException = productRecords.find((product) => product.stock === 0);
assert.equal(outOfStockException.inventoryStatus, "Stokta yok");
assert.equal(outOfStockException.publicationStatus, "İstisna incelemesi", "stok ekseni politika ekseninden bağımsız kalmalı");

assert.deepEqual(sellerApplicationRecords.map((seller) => seller.review.score), [0, 20, 24, 95], "örnek onboarding skorları deterministik olmalı");
assert.deepEqual(sellerApplicationRecords.map((seller) => seller.review.level), ["Rutin", "İnceleme gerekli", "İnceleme gerekli", "Öncelikli"]);
assert.deepEqual(sellerApplicationRecords.map((seller) => seller.review.approvalEligible), [true, false, false, false], "yalnız doğrulamaları tamamlanan başvuru onaya uygun olmalı");
assert.ok(sellerApplicationRecords.every((seller) => seller.review.ruleset === sellerReviewRuleset), "her inceleme aynı sürümlü demo kural setini taşımalı");
assert.ok(sellerApplicationRecords.every((seller) => seller.review.score === seller.review.reasons.reduce((total, reason) => total + reason.points, 0)), "puan nedenlerin toplamına eşit olmalı");
assert.ok(sellerApplicationRecords.every((seller) => seller.review.reasons.reduce((total, reason) => total + reason.maxPoints, 0) === 100), "açıklanan boyut ağırlıkları toplam 100 olmalı");
assert.ok(sellerApplicationRecords.every((seller) => !("risk" in seller)), "hardcode risk etiketi saklanmamalı");
const protectedSignals = sellerApplicationRecords[2];
assert.deepEqual(
  calculateSellerReviewPriority({ ...protectedSignals, name: "Başka ad", owner: "Başka yetkili", products: 99999, commission: "%1" }),
  protectedSignals.review,
  "isim, yetkili, ürün sayısı ve komisyon inceleme puanını değiştirmemeli",
);
assert.ok(orderRecords.every((order) => Number.isFinite(order.amount) && order.amount > 0), "sipariş tutarları pozitif ve sayısal olmalı");
assert.ok(settlementRecords.every((row) => [row.gross, row.commission, row.returns, row.net].every(Number.isFinite)), "hakediş alanları sayısal olmalı");
assert.ok(settlementRecords.every((row) => row.net === row.gross - row.commission - row.returns), "hakediş aritmetiği tutarlı olmalı");
assert.ok(moduleRecords.some((module) => module.enabled) && moduleRecords.some((module) => !module.enabled), "modül toggle senaryoları için iki durum da bulunmalı");
assert.ok(moduleRecords.filter((module) => ["seller-approvals", "settlement-radar"].includes(module.id)).every((module) => module.health === "Entegrasyonda" && module.enabled === false), "uygulanmamış pazaryeri modülleri sağlıklı/etkin gösterilmemeli");
assert.ok(moduleRecords.filter((module) => module.enabled).every((module) => module.health === "Yerel örnek" && module.version.startsWith("demo-")), "etkin önizleme modülleri gerçek runtime sağlığı veya sürümü iddia etmemeli");
assert.ok(moduleRecords.filter((module) => !module.enabled).every((module) => module.health === "Entegrasyonda"), "uygulanmamış modüller Hazır veya Sağlıklı gösterilmemeli");
assert.equal(initialWorkspaceSettings.store, "Tüm Mağazalar · 24");
assert.equal(initialWorkspaceSettings.timezone, "Europe/Istanbul", "saat dilimi geçerli IANA kimliği kullanmalı");

assert.deepEqual(Object.keys(analyticsPeriods), ["Son 7 gün", "Son 30 gün", "Bu yıl"]);
assert.ok(
  Object.values(analyticsPeriods).every((period) => Number.isFinite(period.multiplier) && period.multiplier > 0),
  "analitik dönem çarpanları pozitif ve sayısal olmalı",
);

console.log("admin Commerce Pro model smoke passed");
