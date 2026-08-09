import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { categories, products } from "../storefront-commerce-pro/src/catalog.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const storefrontPort = Number(process.env.NOVASTORE_REVIEW_STOREFRONT_PORT || 5173);
const adminPort = Number(process.env.NOVASTORE_REVIEW_ADMIN_PORT || 5174);
if (process.env.NOVASTORE_OFFICIAL_REVIEW !== "true") {
  throw new Error("Official local review server requires NOVASTORE_OFFICIAL_REVIEW=true.");
}
for (const [label, port] of [["storefront", storefrontPort], ["admin", adminPort]]) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error(`${label} review port is invalid.`);
}

const storefrontArtifactPath = path.join(root, "frontend", "commerce-pro", "index.html");
const adminArtifactPath = path.join(root, "frontend", "admin-commerce-pro-live.html");
const storefrontArtifact = fs.readFileSync(storefrontArtifactPath);
const adminArtifact = fs.readFileSync(adminArtifactPath);
const storefrontRuntimeModules = Object.freeze({
  "/shared-state-sync.js": fs.readFileSync(path.join(root, "frontend", "shared-state-sync.js")),
  "/favorites-sync.js": fs.readFileSync(path.join(root, "frontend", "favorites-sync.js")),
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const storefrontSha256 = sha256(storefrontArtifact);
const adminSha256 = sha256(adminArtifact);
const expectedArtifactSha256 = Object.freeze({
  storefront: "4ab340b774233ad35832eb277ef1de16a79e0c1f396f3d7079842db80ba01fef",
  admin: "9d0de6c5c250ce19eb442faf9ddd790fdac753ff989b338fc2b7ae91e01dab54",
});
if (storefrontSha256 !== expectedArtifactSha256.storefront) {
  throw new Error("Storefront artifact beklenen resmî inceleme digest'iyle eşleşmiyor.");
}
if (adminSha256 !== expectedArtifactSha256.admin) {
  throw new Error("Admin artifact beklenen resmî inceleme digest'iyle eşleşmiyor.");
}
const counters = { external: 0, mutation: 0, database: 0 };

const imageFiles = Object.freeze({
  "phone-iphone.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "phone-iphone.webp"),
  "phone-samsung.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "phone-samsung.webp"),
  "phone-xiaomi.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "phone-xiaomi.webp"),
  "product-phone.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-phone.webp"),
  "product-laptop.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-laptop.webp"),
  "product-headphones.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-headphones.webp"),
  "product-watch.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-watch.webp"),
  "product-vacuum.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-vacuum.webp"),
  "product-fashion.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-fashion.webp"),
  "product-skincare.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-skincare.webp"),
  "product-sports.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-sports.webp"),
  "product-toy.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-toy.webp"),
  "product-bedding.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-bedding.webp"),
  "product-sweatshirt.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-sweatshirt.webp"),
  "product-kids-coat.webp": path.join(root, "storefront-commerce-pro", "src", "assets", "optimized", "product-kids-coat.webp"),
});
const imageNameByKey = Object.freeze({
  "phone-iphone": "phone-iphone.webp",
  "phone-samsung": "phone-samsung.webp",
  "phone-xiaomi": "phone-xiaomi.webp",
  phone: "product-phone.webp",
  laptop: "product-laptop.webp",
  headphones: "product-headphones.webp",
  watch: "product-watch.webp",
  vacuum: "product-vacuum.webp",
  fashion: "product-fashion.webp",
  skincare: "product-skincare.webp",
  sports: "product-sports.webp",
  toy: "product-toy.webp",
  bedding: "product-bedding.webp",
  sweatshirt: "product-sweatshirt.webp",
  "kids-coat": "product-kids-coat.webp",
});

const numericProductId = (value) => {
  const match = String(value || "").match(/(\d+)$/);
  return match ? Number(match[1]) : null;
};
const publicProducts = Object.freeze(products.map((product) => ({
  id: numericProductId(product.id),
  slug: product.slug,
  name: product.name,
  brand: product.brand,
  description: product.description,
  price: product.price,
  old_price: product.oldPrice,
  stock: product.stock,
  average_rating: product.rating,
  review_count: product.reviews,
  category_ids: [product.categoryId],
  primary_category_id: product.categoryId,
  image_url: `/review-assets/${imageNameByKey[product.imageKey] || "product-phone.webp"}`,
  media: [{ id: `${numericProductId(product.id)}-main`, media_url: `/review-assets/${imageNameByKey[product.imageKey] || "product-phone.webp"}`, media_type: "image", is_main: true, sort_order: 0 }],
  attributes: (product.features || []).map((value, index) => ({ code: `feature-${index + 1}`, name: `Özellik ${index + 1}`, value })),
})).filter((product) => Number.isInteger(product.id)));

const productCountForCategory = (category) => publicProducts.filter((product) => {
  const assigned = categories.find((candidate) => candidate.id === product.primary_category_id);
  return assigned && (assigned.path === category.path || assigned.path.startsWith(`${category.path}/`));
}).length;
const categoryTree = (parentId = null) => categories
  .filter((category) => category.parentId === parentId && category.active !== false && category.customerVisible !== false && category.archived !== true)
  .sort((left, right) => left.sortOrder - right.sortOrder)
  .map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    parent_id: category.parentId,
    path: category.path,
    depth: category.depth,
    sort_order: category.sortOrder,
    subtree_visible_product_count: productCountForCategory(category),
    subtree_sellable_product_count: publicProducts.filter((product) => product.stock > 0).filter((product) => {
      const assigned = categories.find((candidate) => candidate.id === product.primary_category_id);
      return assigned && (assigned.path === category.path || assigned.path.startsWith(`${category.path}/`));
    }).length,
    children: categoryTree(category.id),
  }));

const navigationItems = (items) => items.map((item) => ({
  id: `category-${item.id}`,
  label: item.name,
  target: { type: "category", id: item.id },
  children: navigationItems(item.children || []),
}));
const publicNavigation = Object.freeze({
  key: "main",
  items: Object.freeze(navigationItems(categoryTree())),
});

const storeSummaries = Object.freeze([
  Object.freeze({ id: 73, storeName: "Atlas Teknoloji", operationalStatus: "active", productCount: 18, customerVisibleProductCount: 14, createdAt: "2026-07-10T09:15:00.000Z", updatedAt: "2026-08-08T13:20:00.000Z" }),
  Object.freeze({ id: 74, storeName: "Mavi Ev", operationalStatus: "inactive", productCount: 6, customerVisibleProductCount: 0, createdAt: "2026-07-18T11:00:00.000Z", updatedAt: "2026-08-07T16:30:00.000Z" }),
]);
const storeDetails = Object.freeze({
  73: Object.freeze({ ...storeSummaries[0], ownerName: "Elif Kaya", catalogCategories: Object.freeze([{ id: 4, name: "Elektronik" }, { id: 9, name: "Giyilebilir Teknoloji" }]) }),
  74: Object.freeze({ ...storeSummaries[1], ownerName: "Mert Aydın", catalogCategories: Object.freeze([{ id: 12, name: "Ev ve Yaşam" }]) }),
});

const adminToken = [
  Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({ id: 17, role: "admin", exp: 4_102_444_800 })).toString("base64url"),
  "local-review",
].join(".");

const isLoopback = (address) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
const commonHeaders = (mode, artifactSha256 = "") => ({
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "default-src 'self' data: blob:; img-src 'self' data: blob:; media-src 'self' data: blob:; style-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-NovaStore-Runtime-Mode": mode,
  ...(artifactSha256 ? { "X-NovaStore-Artifact-Sha256": artifactSha256 } : {}),
});
const send = (request, response, status, body, contentType, headers = {}) => {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  response.writeHead(status, { "Content-Type": contentType, "Content-Length": payload.length, ...headers });
  if (request.method === "HEAD") response.end();
  else response.end(payload);
};
const sendJson = (request, response, status, value, mode) => send(
  request,
  response,
  status,
  JSON.stringify(value),
  "application/json; charset=utf-8",
  commonHeaders(mode),
);
const authorizeAdmin = (request, response) => {
  if (request.headers.authorization === `Bearer ${adminToken}`) return true;
  sendJson(request, response, 401, { error: "Yerel inceleme yönetici oturumu gerekli." }, "INTEGRATED_COMMERCE_PRO_ADMIN");
  return false;
};
const validateRequest = (request, response, port, mode) => {
  const host = String(request.headers.host || "").toLocaleLowerCase("en-US");
  if (!isLoopback(request.socket.remoteAddress) || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
    counters.external += 1;
    sendJson(request, response, 403, { error: "Yalnız loopback inceleme isteğine izin verilir." }, mode);
    return false;
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    counters.mutation += 1;
    sendJson(request, response, 405, { error: "Yerel inceleme çalışma zamanı salt okunurdur." }, mode);
    return false;
  }
  return true;
};

const storefrontServer = http.createServer((request, response) => {
  const mode = "INTEGRATED_COMMERCE_PRO";
  if (!validateRequest(request, response, storefrontPort, mode)) return;
  const url = new URL(request.url, `http://127.0.0.1:${storefrontPort}`);

  if (url.pathname === "/__review/meta") return sendJson(request, response, 200, { mode, artifactSha256: storefrontSha256, sourceEntry: "storefront-commerce-pro/src/main-integrated.jsx", localData: "canonical-local-catalog-through-same-origin-read-api", counters }, mode);
  if (storefrontRuntimeModules[url.pathname]) {
    return send(request, response, 200, storefrontRuntimeModules[url.pathname], "text/javascript; charset=utf-8", commonHeaders(mode));
  }
  if (url.pathname.startsWith("/review-assets/")) {
    const fileName = url.pathname.slice("/review-assets/".length);
    const filePath = imageFiles[fileName];
    if (!filePath || !fs.existsSync(filePath)) return sendJson(request, response, 404, { error: "Görsel bulunamadı." }, mode);
    return send(request, response, 200, fs.readFileSync(filePath), "image/webp", commonHeaders(mode));
  }
  if (url.pathname === "/api/public/categories") return sendJson(request, response, 200, categoryTree(), mode);
  if (url.pathname === "/api/products") return sendJson(request, response, 200, publicProducts, mode);
  if (url.pathname === "/api/public/collections") return sendJson(request, response, 200, [], mode);
  if (url.pathname === "/api/public/navigation/main") return sendJson(request, response, 200, publicNavigation, mode);
  const productMatch = url.pathname.match(/^\/api\/products\/(\d+)$/);
  if (productMatch) {
    const product = publicProducts.find((item) => item.id === Number(productMatch[1]));
    return product ? sendJson(request, response, 200, product, mode) : sendJson(request, response, 404, { error: "Ürün bulunamadı." }, mode);
  }
  if (/^\/api\/(?:reviews|questions)\/product\/\d+$/.test(url.pathname)) return sendJson(request, response, 200, [], mode);
  if (url.pathname.startsWith("/api/")) return sendJson(request, response, 404, { error: "Yerel inceleme endpoint'i yok." }, mode);
  return send(request, response, 200, storefrontArtifact, "text/html; charset=utf-8", commonHeaders(mode, storefrontSha256));
});

const adminBootstrap = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>NovaStore yerel Admin inceleme girişi</title></head><body><p>Yerel, salt okunur Admin inceleme oturumu hazırlanıyor…</p><script>localStorage.setItem("nova_admin_token",${JSON.stringify(adminToken)});location.replace("/admin-commerce-pro-live.html#/sellerApplications");</script></body></html>`;
const adminServer = http.createServer((request, response) => {
  const mode = "INTEGRATED_COMMERCE_PRO_ADMIN";
  if (!validateRequest(request, response, adminPort, mode)) return;
  const url = new URL(request.url, `http://127.0.0.1:${adminPort}`);

  if (url.pathname === "/__review/meta") return sendJson(request, response, 200, { mode, artifactSha256: adminSha256, sourceEntry: "admin-commerce-pro/src/main-integrated.jsx", localData: "deterministic-platform-admin-store-summary-detail", counters }, mode);
  if (url.pathname === "/" || url.pathname === "/admin-login.html") return send(request, response, 200, adminBootstrap, "text/html; charset=utf-8", commonHeaders(mode));
  if (url.pathname === "/admin-commerce-pro-live.html") return send(request, response, 200, adminArtifact, "text/html; charset=utf-8", commonHeaders(mode, adminSha256));
  if (!url.pathname.startsWith("/api/admin/")) return sendJson(request, response, 404, { error: "Yerel Admin inceleme yolu bulunamadı." }, mode);
  if (!authorizeAdmin(request, response)) return;
  if (url.pathname === "/api/admin/session") return sendJson(request, response, 200, {
    user: { id: 17, role: "admin" },
    commerceMode: "single_vendor",
    apiVersion: "2026-08-09-local-review",
    capabilities: { dashboardRead: true, storesRead: true },
  }, mode);
  if (url.pathname === "/api/admin/stats") return sendJson(request, response, 200, {
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: publicProducts.length,
    totalUsers: 0,
    dataScope: "local_review_no_finance_order_user_data",
  }, mode);
  if (url.pathname === "/api/admin/stores/summary") return sendJson(request, response, 200, { items: storeSummaries, limit: 100, hasMore: false }, mode);
  const storeMatch = url.pathname.match(/^\/api\/admin\/stores\/(\d+)$/);
  if (storeMatch) {
    const detail = storeDetails[Number(storeMatch[1])];
    return detail ? sendJson(request, response, 200, detail, mode) : sendJson(request, response, 404, { error: "Mağaza kaydı bulunamadı." }, mode);
  }
  return sendJson(request, response, 404, { error: "Yerel Admin inceleme endpoint'i yok." }, mode);
});

const listen = (server, port) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", resolve);
});
await Promise.all([listen(storefrontServer, storefrontPort), listen(adminServer, adminPort)]);
console.log(`OFFICIAL_STOREFRONT_URL=http://127.0.0.1:${storefrontPort}/`);
console.log(`OFFICIAL_ADMIN_BOOTSTRAP_URL=http://127.0.0.1:${adminPort}/`);
console.log(`OFFICIAL_ADMIN_URL=http://127.0.0.1:${adminPort}/admin-commerce-pro-live.html#/sellerApplications`);
console.log(`SERVED_STOREFRONT_ARTIFACT_SHA256=${storefrontSha256}`);
console.log(`SERVED_ADMIN_ARTIFACT_SHA256=${adminSha256}`);
console.log("REMOTE_DATABASE_CONNECTION_COUNT=0");

const close = () => Promise.allSettled([
  new Promise((resolve) => storefrontServer.close(resolve)),
  new Promise((resolve) => adminServer.close(resolve)),
]).finally(() => process.exit(0));
process.once("SIGINT", close);
process.once("SIGTERM", close);
