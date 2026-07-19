import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createSourceFingerprint } from "../admin-commerce-pro/scripts/source-fingerprint.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commerceRoot = path.join(repositoryRoot, "admin-commerce-pro");
const livePath = path.join(repositoryRoot, "frontend", "admin-commerce-pro-live.html");
const source = fs.readFileSync(livePath, "utf8");
const integratedAppSource = fs.readFileSync(path.join(commerceRoot, "src", "IntegratedApp.jsx"), "utf8");
const adapterSource = fs.readFileSync(path.join(commerceRoot, "src", "adapters", "sameOriginAdapter.js"), "utf8");
const catalogReadSource = fs.readFileSync(path.join(commerceRoot, "src", "integration", "catalogRead.js"), "utf8");
const catalogStructureSource = fs.readFileSync(path.join(commerceRoot, "src", "integration", "catalogStructureRead.js"), "utf8");
const catalogMutationsSource = fs.readFileSync(path.join(commerceRoot, "src", "integration", "catalogMutations.js"), "utf8");
const resourceHookSource = fs.readFileSync(path.join(commerceRoot, "src", "integration", "useResource.js"), "utf8");
const {
  value: expectedFingerprint,
  fingerprintFiles,
} = await createSourceFingerprint(commerceRoot, { mode: "integrated" });

assert.deepEqual(
  fingerprintFiles,
  [...fingerprintFiles].sort(),
  "live fingerprint girdileri deterministik sırada olmalı",
);
assert.ok(
  fingerprintFiles.every((relativePath) => (
    !relativePath.includes("\\")
    && !relativePath.startsWith("/")
    && !/^[A-Za-z]:\//.test(relativePath)
  )),
  "live fingerprint makine yolundan bağımsız canonical göreli yollar kullanmalı",
);
assert.ok(fingerprintFiles.includes("src/IntegratedApp.jsx"));
assert.ok(!fingerprintFiles.includes("src/App.jsx"));

assert.match(source, /<html\b[^>]*data-admin-mode="integrated"/i);
assert.match(source, /<meta\b[^>]*Content-Security-Policy[^>]*connect-src 'self'/i);
assert.doesNotMatch(source, /connect-src 'none'/i);
assert.match(source, new RegExp(`novastore-source-fingerprint" content="${expectedFingerprint}"`, "i"));
assert.match(source, /data-testid["']?\s*(?:=|:)\s*["']integrated-admin-shell["']/);
assert.match(source, /Entegre tek-satıcı modu/);
assert.match(source, /Mock fallback yok/);
assert.match(source, /Sipariş özeti okuma yeteneği bu admin oturumunda açık değil/);
assert.match(source, /Dashboard okuma yeteneği bu admin oturumunda açık değil/);
assert.match(source, /Filtrelenmiş sipariş sayısı/);
assert.match(integratedAppSource, /if \(!enabledPages\.includes\(page\) && enabledPages\[0\]\) setPage\(enabledPages\[0\]\)/);
assert.match(integratedAppSource, /page === "dashboard"[\s\S]{0,180}!statsEnabled[\s\S]{0,180}dashboardUnavailableError/);
assert.match(integratedAppSource, /page === "orders"[\s\S]{0,180}!ordersEnabled[\s\S]{0,180}ordersUnavailableError/);
assert.match(integratedAppSource, /page === "returns"[\s\S]{0,180}!returnsEnabled[\s\S]{0,180}returnsUnavailableError/);
assert.match(integratedAppSource, /page === "notifications"[\s\S]{0,180}!notificationsEnabled[\s\S]{0,180}notificationsUnavailableError/);
assert.match(integratedAppSource, /page === "catalog"[\s\S]{0,180}!catalogEnabled[\s\S]{0,220}catalogUnavailableError/);
assert.match(integratedAppSource, /useResource\(loadCatalog, \{ enabled: catalogEnabled \}\)/, "kapalı capability katalog resource isteğini başlatmamalı");
assert.match(integratedAppSource, /useResource\(loadCatalogStructure, \{ enabled: catalogStructureEnabled \}\)/, "kapalı capability katalog yapı isteğini başlatmamalı");
assert.match(integratedAppSource, /\["catalog", "catalogStructure"\]\.includes\(item\.id\) && !enabled\) return null/, "kapalı capability katalog yapı rail yüzeyini gizlemeli");
assert.match(integratedAppSource, /catalogEnabled && <button[\s\S]{0,180}>Ürünler</, "katalog context yüzeyi yalnız açık capability ile oluşmalı");
assert.match(integratedAppSource, /catalogStructureEnabled && <button[\s\S]{0,220}>Katalog yapısı</, "katalog yapı context yüzeyi yalnız açık capability ile oluşmalı");
assert.match(resourceHookSource, /if \(!enabled\) \{[\s\S]{0,160}setState\(initialState\)/);
assert.match(resourceHookSource, /error\?\.status !== 401 && error\?\.status !== 403/);
assert.match(source, /\/api\/admin\/session/);
assert.match(source, /\/api\/admin\/stats/);
assert.match(source, /\/api\/admin\/orders\/summary\?limit=100/);
assert.match(source, /\/api\/admin\/returns\/summary\?limit=100/);
assert.match(source, /\/api\/admin\/notifications\/summary\?limit=50/);
assert.match(source, /\/api\/admin\/catalog\/products\/summary\?limit=100/);
assert.match(source, /\/api\/admin\/catalog\/products/);
assert.match(source, /\/api\/admin\/catalog\/structure\/summary\?limit=100/);
assert.match(source, /ADMIN_SESSION_EXPIRED/);
assert.match(source, /INVALID_API_PATH/);
assert.doesNotMatch(source, /Demo Operatör|demo-operasyon@example\.invalid|Demo Teknoloji|Demo Ev/);
assert.match(source, /live-returns/);
assert.match(source, /live-notifications/);
assert.match(source, /Taşıyıcı doğrulanmadı/);
assert.match(source, /gerçek refund isteği gönderilmez/);
assert.match(source, /sağlayıcı\/para hareketi doğrulanmadı/);
assert.match(source, /\/api\/orders\//);
assert.match(source, /\/api\/shipments\//);
assert.match(source, /Sağlayıcı refund'u otomatik çalıştırılmadı/);
assert.match(source, /Taşıyıcı API\/etiket işlemi yapılmadı/);
assert.match(source, /Paketi fiziksel olarak taşıyıcıya teslim ettiğimi doğruluyorum/);
assert.match(source, /Birinci taraf ürün özeti tablosu/);
assert.match(source, /İç yayın incelemesi/);
assert.match(source, /manuel ürün onay kuyruğu oluşturulmaz/);
assert.match(source, /daha eski ürünler bu turda gösterilmiyor/);
assert.match(source, /medyasız ürün JSON CRUD/i);
assert.match(source, /Tam DTO alınıyor/);
assert.match(source, /hard-delete yapılmadan arşivlendi/);
assert.match(source, /Katalog yapısı/);
assert.match(source, /Satıcı portalı veya ürün izin kuyruğu değildir/);
assert.match(source, /menülerin iç URL değerleri de DTO'ya alınmaz/);
assert.match(source, /Kategoriler/);
assert.match(source, /Özellikler/);
assert.match(source, /Şablonlar/);
assert.match(source, /Koleksiyonlar/);
assert.match(source, /Menüler/);
assert.doesNotMatch(source, /Yayın bekliyor/);
assert.doesNotMatch(integratedAppSource, /<img|image_url|imageUrl/);
assert.doesNotMatch(integratedAppSource, /<input[^>]+type=["']file|FormData/i, "canlı ürün CRUD medya veya multipart kontrolü içermemeli");
assert.match(integratedAppSource, /getCatalogProduct\(\{ productId: summary\.rawId \}\)/, "edit/archive özetten alan tahmin etmeden tam DTO çekmeli");
assert.match(integratedAppSource, /Boolean\(error\) \|\| refreshing \|\| sessionRefreshing/, "stale katalog veya oturum yenilemesi yazmaları fail-closed kapatmalı");
assert.match(integratedAppSource, /if \(!writesBlocked \|\| !operation\) return;/, "açık ürün modalı yazma sınırı kaybolduğunda kapanmalı");
assert.match(catalogMutationsSource, /CATALOG_PRODUCT_INPUT_INVALID/);
assert.match(catalogMutationsSource, /\/api\/admin\/catalog\/products\/\$\{productId\}\/archive/);
assert.match(catalogMutationsSource, /expected_revision: expectedRevision/);
assert.doesNotMatch(catalogMutationsSource, /FormData|image_url|imageUrl|cloudinary|store_id|seller_id/i, "katalog mutation sözleşmesi medya, mağaza veya satıcı alanı taşımamalı");
assert.match(catalogReadSource, /!product\.deletedAt[\s\S]{0,100}product\.publicationStatus === "active"[\s\S]{0,100}product\.customerVisible/, "etkin görünürlük silinmiş ve yayın dışı kayıtları fail-closed dışarıda bırakmalı");
const catalogAdapterSource = adapterSource.match(/const catalog = async[\s\S]*?\n  \);/)?.[0] || "";
assert.match(catalogAdapterSource, /\/api\/admin\/catalog\/products\/summary\?limit=100/);
assert.doesNotMatch(catalogAdapterSource, /method:|body:|cloudinary|\/api\/products/i, "katalog adapteri yalnız yeni salt-okunur same-origin endpoint'i kullanmalı");
const catalogStructureAdapterSource = adapterSource.match(/const catalogStructure = async[\s\S]*?\n  \);/)?.[0] || "";
assert.match(catalogStructureAdapterSource, /\/api\/admin\/catalog\/structure\/summary\?limit=100/);
assert.doesNotMatch(catalogStructureAdapterSource, /method:|body:|cloudinary|\/api\/admin\/(?:categories|attributes|collections|menus)/i, "katalog yapı adapteri yalnız bounded salt-okunur endpoint'i kullanmalı");
assert.match(catalogStructureSource, /payload\?\.structureScope !== "shared_catalog"/);
assert.match(catalogStructureSource, /targetType === "category"[\s\S]*categoryId !== null[\s\S]*collectionId === null[\s\S]*!hasInternalUrl/);
assert.doesNotMatch(catalogStructureSource, /\bseller(?:Id|Name|_id|_name)?\b|\brisk\b|approvalAction|validation_metadata/i);
assert.doesNotMatch(source, /\/api\/returns\/admin\/all|\/api\/notifications\/admin/);
assert.doesNotMatch(source, /\/api\/shipments\/[^"']+\/create/);
assert.doesNotMatch(source, /\/api\/orders\/[^"']+\/status|\/api\/returns\/[^"']+\/status|\/api\/notifications\/[^"']+\/read/);
assert.doesNotMatch(source, /\/api\/payments\/|paytr|iyzico/i);
assert.doesNotMatch(source, /<script\b[^>]*\bsrc\s*=/i);
assert.doesNotMatch(source, /<link\b[^>]*\brel=["'][^"']*stylesheet/i);
assert.doesNotMatch(source, /<(?:img|script|link|source)\b[^>]*\b(?:src|href|srcset)=["'](?:https?:)?\/\//i);
assert.match(source, /data:font\/woff2;base64,/i);

const scripts = Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), (match) => match[1]);
assert.ok(scripts.length >= 1);
scripts.forEach((script, index) => {
  assert.doesNotThrow(() => new vm.Script(script, { filename: `admin-commerce-pro-live.inline-${index + 1}.js` }));
});

console.log("admin Commerce Pro live artifact smoke passed");
