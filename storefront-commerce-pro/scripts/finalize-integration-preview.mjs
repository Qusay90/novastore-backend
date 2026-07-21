import { createHash } from "node:crypto";
import { readdir, readFile, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendRoot = path.resolve(root, "..", "frontend");
const outputRoot = path.join(frontendRoot, "commerce-pro-integration-preview");
const builtPath = path.join(outputRoot, "integrated.html");
const previewPath = path.join(outputRoot, "index.html");

const EXPECTED = Object.freeze({
  canonical: "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d",
  app: "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6",
  catalog: "a38d2e5f5a09fdc47bd9102800b04c423cf19b8d4d6bc952b77a5b77dc74062d",
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const [canonical, app, catalog, integratedApp, built] = await Promise.all([
  readFile(path.join(root, "canonical", "NovaStore-Commerce-Pro.html")),
  readFile(path.join(root, "src", "App.jsx")),
  readFile(path.join(root, "src", "catalog.js")),
  readFile(path.join(root, "src", "IntegratedApp.jsx"), "utf8"),
  readFile(builtPath),
]);

for (const [label, buffer] of Object.entries({ canonical, app, catalog })) {
  if (sha256(buffer) !== EXPECTED[label]) {
    throw new Error(`${label} parmak izi değişti; entegrasyon çıktısı reddedildi.`);
  }
}

const html = built.toString("utf8");
for (const required of [
  "connect-src 'self'",
  "/shared-state-sync.js",
  "/favorites-sync.js",
  "/api/products",
  "/api/public/categories",
  "/api/public/collections",
  "/api/addresses",
  "novastore_addresses_migrated_",
  "/api/orders/user/",
  "/api/campaigns/quote",
  "/api/payments/initialize",
  "/api/notifications/user/",
  "/api/messages/history/",
  "/api/reviews/product/",
  "/api/questions/product/",
  "/api/questions/ask",
  "/api/assistant/chat",
  "/api/assistant/escalate",
  "#/giris",
  "#/hesabim",
  "#/hesabim/adresler",
  "#/hesabim/siparisler",
  "#/hesabim/kuponlar",
  "#/hesabim/bildirimler",
  "#/hesabim/guvenlik",
  "#/favoriler",
  "#/sepet",
  "#/sifremi-unuttum",
  "/sifre-sifirla",
  "#/odeme/teslimat",
  "/odeme/sonuc",
  "#/siparis-takibi",
  "#/yardim",
  "#/iletisim",
  "Stok kontrolü gerekli",
  "Sepetindeki stok sorununu düzelt",
  "Tümünü sepete ekle",
]) {
  if (!html.includes(required)) throw new Error(`Entegrasyon çıktısında zorunlu sınır eksik: ${required}`);
}

for (const customerRoute of [
  "/favoriler",
  "/sepet",
  "/hesabim",
  "/hesabim/adresler",
  "/hesabim/siparisler",
  "/hesabim/kuponlar",
  "/hesabim/bildirimler",
  "/hesabim/guvenlik",
  "/giris",
  "/sifremi-unuttum",
  "/sifre-sifirla",
  "/odeme/teslimat",
  "/odeme/sonuc",
  "/siparis-takibi",
  "/yardim",
  "/iletisim",
]) {
  if (!integratedApp.includes(`pathname === "${customerRoute}"`)) {
    throw new Error(`Entegrasyon yönlendiricisinde müşteri rotası eksik: ${customerRoute}`);
  }
}
if (!/import\s*["']\/shared-state-sync\.js["'];\s*import\s*["']\/favorites-sync\.js["']/.test(html)) {
  throw new Error("Ortak sepet ve favori state owner yükleme sırası korunmuyor.");
}

for (const forbidden of [
  "/api/admin",
  "nova_admin_token",
  "Ahmet Yılmaz",
  "ahmet@example.com",
  "NS-2026-00923",
  "NS-2026-00702",
  "NOVA5",
  "Güvenli prototip ödeme akışı",
  "İade işlemleri müşteri hesabında",
  "Müşteri hesabından yönetilir",
  "Mevcut ödeme sayfasına aktarılır",
]) {
  if (html.includes(forbidden)) throw new Error(`Entegrasyon çıktısında mock/admin izi bulundu: ${forbidden}`);
}

for (const legacyPath of ["/profile.html", "/login.html", "/checkout.html"]) {
  const builtOccurrences = html.split(legacyPath).length - 1;
  const sourceLines = integratedApp.split(/\r?\n/).filter((line) => line.includes(legacyPath));
  if (
    builtOccurrences !== 1
    || sourceLines.length !== 1
    || !sourceLines[0].includes(`pathname.endsWith("${legacyPath}")`)
  ) {
    throw new Error(`${legacyPath} yalnız gelen eski adresi Commerce Pro rotasına çevirmek için bulunabilir.`);
  }
}

await rename(builtPath, previewPath);
const outputFiles = await readdir(outputRoot);
if (outputFiles.length !== 1 || outputFiles[0] !== "index.html") {
  throw new Error(`Entegrasyon çıktısı tek HTML artefaktı değil: ${outputFiles.join(", ")}`);
}

console.log(`integration preview verified: ${sha256(built)}`);
