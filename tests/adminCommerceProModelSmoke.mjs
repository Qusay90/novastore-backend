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
assert.equal(incompleteReview.approvalEligible, fal