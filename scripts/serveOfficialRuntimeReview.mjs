import { createHash, randomBytes } from "node:crypto";
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
const deploymentMarkers = [
  process.env.NODE_ENV,
  process.env.NOVASTORE_ENV,
  process.env.RAILWAY_ENVIRONMENT_NAME,
  process.env.VERCEL_ENV,
  process.env.RENDER_SERVICE_NAME,
].map((value) => String(value || "").trim().toLocaleLowerCase("en-US")).filter(Boolean);
if (deploymentMarkers.some((value) => ["production", "staging", "preview"].includes(value)) || process.env.CI === "true") {
  throw new Error("Official local review server is disabled in production, staging, preview and CI environments.");
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
  storefront: "1ed6ee0f5a7e52d3618a3b453e6f2248fb351815e65e33a73d13cca43267bf47",
  admin: "1068c7698821d259b8dd01d6039fc3be6cf1dfe599e3fc029da56ae33b48cfa5",
});
if (storefrontSha256 !== expectedArtifactSha256.storefront) {
  throw new Error("Storefront artifact beklenen resmî inceleme digest'iyle eşleşmiyor.");
}
if (adminSha256 !== expectedArtifactSha256.admin) {
  throw new Error("Admin artifact beklenen resmî inceleme digest'iyle eşleşmiyor.");
}
const counters = { external: 0, mutation: 0, database: 0 };
const ownerLiveProductsFile = String(process.env.NOVASTORE_OWNER_LIVE_PRODUCTS_FILE || "").trim();
if (ownerLiveProductsFile && (!path.isAbsolute(ownerLiveProductsFile) || !fs.existsSync(ownerLiveProductsFile))) {
  throw new Error("Owner live-product fixture must be an existing absolute file.");
}

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
const reviewMediaByProductId = Object.freeze({
  1001: Object.freeze([
    "/review-media/iphone-15-angle.svg",
    "/review-media/iphone-15-detail.svg",
    "/review-media/iphone-15-pair.svg",
    "/review-media/iphone-15-screen.svg",
  ]),
});
const categoryById = new Map(categories.map((category) => [category.id, category]));
const isStructurallyPublicCategory = (categoryId) => {
  const visited = new Set();
  let category = categoryById.get(categoryId);
  while (category) {
    if (visited.has(category.id) || category.active === false || category.customerVisible === false || category.archived === true) return false;
    visited.add(category.id);
    category = category.parentId === null ? null : categoryById.get(category.parentId);
  }
  return visited.size > 0;
};
const canonicalPublicProducts = Object.freeze(products.filter((product) => isStructurallyPublicCategory(product.categoryId)).map((product) => ({
  id: numericProductId(product.id),
  slug: numericProductId(product.id) === 1001 ? "apple-iphone-15-128-gb" : product.slug,
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
  image_url: numericProductId(product.id) === 1001 ? "/review-media/iphone-15-angle.svg" : `/review-assets/${imageNameByKey[product.imageKey] || "product-phone.webp"}`,
  media: (reviewMediaByProductId[numericProductId(product.id)] || [imageNameByKey[product.imageKey] || "product-phone.webp"])
    .map((fileName, index) => ({ id: `${numericProductId(product.id)}-media-${index + 1}`, media_url: fileName.startsWith("/") ? fileName : `/review-assets/${fileName}`, media_type: "image", is_main: index === 0, sort_order: index, card_framing: null })),
  store: { slug: "owner-main6x-r1", name: "NovaStore Owner Canlı Ürün İncelemesi" },
  attributes: (product.features || []).map((value, index) => ({ code: `feature-${index + 1}`, name: `Özellik ${index + 1}`, value })),
})).filter((product) => Number.isInteger(product.id)));

const ownerText = (value, maxLength) => String(value ?? "")
  .replace(/<[^>]*>/g, " ")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);
const ownerMediaUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && ["res.cloudinary.com", "novastore.tr", "www.novastore.tr"].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const ownerSlug = (value, id) => ownerText(value, 160)
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 140) || `owner-product-${id}`;
const sanitizeOwnerProduct = (product, index) => {
  const id = Number(product?.id);
  const name = ownerText(product?.name, 240);
  const media = (Array.isArray(product?.media) ? product.media : [])
    .map((item, mediaIndex) => ({
      id: Number(item?.id) || `${id}-live-${mediaIndex + 1}`,
      media_url: ownerMediaUrl(item?.media_url || item?.url),
      media_type: "image",
      is_main: item?.is_main === true || mediaIndex === 0,
      sort_order: Number.isFinite(Number(item?.sort_order)) ? Number(item.sort_order) : mediaIndex,
      card_framing: null,
    }))
    .filter((item) => item.media_url)
    .slice(0, 8);
  const imageUrl = ownerMediaUrl(product?.image_url) || media[0]?.media_url || null;
  if (!Number.isInteger(id) || id <= 0 || !name || !imageUrl) return null;
  if (!media.length) media.push({ id: `${id}-live-primary`, media_url: imageUrl, media_type: "image", is_main: true, sort_order: 0 });
  return Object.freeze({
    id,
    slug: ownerSlug(product?.slug || name, id),
    name,
    description: ownerText(product?.description, 2_000),
    brand: ownerText(product?.brand, 120),
    price: Math.max(0, Number(product?.price) || 0),
    old_price: Number(product?.old_price) > Number(product?.price) ? Number(product.old_price) : null,
    stock: Math.max(0, Number.parseInt(product?.stock, 10) || 0),
    average_rating: Math.min(5, Math.max(0, Number(product?.average_rating) || 0)),
    review_count: Math.max(0, Number.parseInt(product?.review_count, 10) || 0),
    category_ids: ["home-living"],
    primary_category_id: "home-living",
    image_url: imageUrl,
    media,
    store: { slug: "owner-main6x-r1", name: "NovaStore Owner Canlı Ürün İncelemesi" },
    attributes: [],
    owner_fixture_rank: index + 1,
  });
};
const rawOwnerLiveProducts = ownerLiveProductsFile
  ? (() => {
      const stat = fs.statSync(ownerLiveProductsFile);
      if (!stat.isFile() || stat.size > 1_000_000) throw new Error("Owner live-product fixture exceeds the local review boundary.");
      const payload = JSON.parse(fs.readFileSync(ownerLiveProductsFile, "utf8"));
      const values = Array.isArray(payload) ? payload : Array.isArray(payload?.products) ? payload.products : Array.isArray(payload?.data) ? payload.data : [];
      return values.map(sanitizeOwnerProduct).filter(Boolean).slice(0, 8);
    })()
  : [];
const ownerMediaCache = new Map();
const liveOwnerProducts = [];
for (const product of rawOwnerLiveProducts) {
  const media = [];
  for (const [index, item] of product.media.entries()) {
    const route = `/owner-live-media/${product.id}-${index + 1}`;
    const remote = await fetch(item.media_url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(20_000) });
    const contentType = String(remote.headers.get("content-type") || "").split(";")[0].trim().toLocaleLowerCase("en-US");
    const length = Number(remote.headers.get("content-length") || 0);
    if (!remote.ok || !contentType.startsWith("image/") || (length && length > 8_000_000)) continue;
    const body = Buffer.from(await remote.arrayBuffer());
    if (!body.length || body.length > 8_000_000) continue;
    ownerMediaCache.set(route, Object.freeze({ body, contentType }));
    media.push({ ...item, media_url: route, is_main: media.length === 0 });
  }
  if (!media.length) continue;
  liveOwnerProducts.push(Object.freeze({ ...product, image_url: media[0].media_url, media: Object.freeze(media) }));
}
const deterministicOwnerProduct = Object.freeze({
  id: 900001,
  slug: "owner-hover-dort-gorsel",
  name: "Owner İnceleme · Dört Görselli Ürün",
  description: "Yalnız yerel owner hover incelemesi için deterministik ürün.",
  brand: "Yerel İnceleme",
  price: 1499,
  old_price: 1899,
  stock: 12,
  average_rating: 4.8,
  review_count: 24,
  category_ids: ["home-living"],
  primary_category_id: "home-living",
  image_url: "/review-media/iphone-15-angle.svg",
  media: reviewMediaByProductId[1001].map((mediaUrl, index) => ({ id: `900001-media-${index + 1}`, media_url: mediaUrl, media_type: "image", is_main: index === 0, sort_order: index, card_framing: index === 0 ? { focal_x: 0.32, focal_y: 0.46, zoom: 1.38 } : null })),
  store: { slug: "owner-main6x-r1", name: "NovaStore Owner Canlı Ürün İncelemesi" },
  attributes: [],
});
const publicProducts = Object.freeze(ownerLiveProductsFile
  ? [...liveOwnerProducts, deterministicOwnerProduct]
  : canonicalPublicProducts);
const reviewFramingByMediaId = new Map(publicProducts.flatMap((product) => product.media.map((media) => [String(media.id), media.card_framing || null])));
let reviewCatalogRevision = 1;
const withReviewFraming = (product) => ({
  ...product,
  media: product.media.map((media) => ({ ...media, card_framing: reviewFramingByMediaId.get(String(media.id)) || null })),
});
const customerReviewProducts = () => publicProducts.map(withReviewFraming);

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
const reviewCustomerId = 1_900_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000);
const reviewCustomer = Object.freeze({ id: reviewCustomerId, fullName: "Yerel İnceleme Müşterisi", email: "review.customer@local.invalid", phone: "+90 555 000 00 00", role: "customer" });
const reviewAddresses = Object.freeze([{ id: 1, title: "Ev", fullName: reviewCustomer.fullName, phone: reviewCustomer.phone, city: "İstanbul", district: "Kadıköy", address_line: "Moda Caddesi 12", is_default: true }]);
const reviewOrders = Object.freeze([{ id: 7002, display_status: "Kargoya Verildi", total_amount: 51999, created_at: "2026-08-01T10:00:00.000Z", tracking_no: "LOCAL-7002", eta_date: "2026-08-15T18:00:00.000Z", items: [{ id: 1001, product_id: 1001, name: "Apple iPhone 15 128 GB", quantity: 1, price: 51999, image_url: "/review-media/iphone-15-angle.svg" }], shipping_address: "Moda Caddesi 12, Kadıköy, İstanbul", payment_method: "Yerel inceleme verisi", payment_status: "İnceleme için hazır" }]);
const reviewNotifications = Object.freeze([{ id: 1, type: "order", message: "Yerel inceleme siparişin kargoya verildi.", is_read: false, created_at: "2026-08-01T12:00:00.000Z" }]);
const initialReviewMessages = Object.freeze([Object.freeze({ id: 1, sender_id: 0, message: "Bu destek geçmişi yalnızca yerel inceleme içindir.", created_at: "2026-08-01T12:00:00.000Z" })]);
const customerReviewSessions = new Map();
const customerReviewSessionTtlMs = 30 * 60 * 1000;
const customerReviewSessionLimit = 16;
const createCustomerReviewSession = () => {
  const now = Date.now();
  for (const [token, session] of customerReviewSessions) {
    if (session.expiresAt < now) customerReviewSessions.delete(token);
  }
  while (customerReviewSessions.size >= customerReviewSessionLimit) {
    customerReviewSessions.delete(customerReviewSessions.keys().next().value);
  }
  const token = `local-review-${randomBytes(32).toString("base64url")}`;
  const session = {
    token,
    expiresAt: now + customerReviewSessionTtlMs,
    state: {
      user: { ...reviewCustomer },
      cart: [],
      favorites: [],
      messages: [],
      addresses: reviewAddresses.map((address) => ({ ...address })),
      notifications: reviewNotifications.map((notification) => ({ ...notification })),
      questionsByProduct: new Map(),
      nextAddressId: 2,
      nextQuestionId: 1,
    },
  };
  customerReviewSessions.set(token, session);
  return session;
};
const reviewMediaVariants = Object.freeze({
  "iphone-15-angle.svg": Object.freeze({ source: "phone-iphone.webp", viewBox: "0 0 1448 1086", image: "0 0 1448 1086" }),
  "iphone-15-detail.svg": Object.freeze({ source: "phone-iphone.webp", viewBox: "360 110 650 820", image: "0 0 1448 1086" }),
  "iphone-15-pair.svg": Object.freeze({ source: "product-phone.webp", viewBox: "0 0 1086 1086", image: "0 0 1086 1086" }),
  "iphone-15-screen.svg": Object.freeze({ source: "product-phone.webp", viewBox: "390 70 610 940", image: "0 0 1086 1086" }),
});
const renderReviewMedia = ({ source, viewBox, image }) => {
  const [x, y, width, height] = image.split(" ").map(Number);
  const encoded = fs.readFileSync(imageFiles[source]).toString("base64");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img"><rect x="0" y="0" width="100%" height="100%" fill="#f7f4ef"/><image x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/webp;base64,${encoded}" preserveAspectRatio="xMidYMid slice"/></svg>`;
};

const isLoopback = (address) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address);
const commonHeaders = (mode, artifactSha256 = "") => ({
  "Cache-Control": "private, no-store, max-age=0",
  "Content-Security-Policy": "default-src 'self' data: blob:; img-src 'self' data: blob: https://res.cloudinary.com https://novastore.tr https://www.novastore.tr; media-src 'self' data: blob: https://res.cloudinary.com https://novastore.tr https://www.novastore.tr; style-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
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
const findCustomerSession = (request) => {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = customerReviewSessions.get(token);
  if (session && Date.now() <= session.expiresAt) return session;
  if (session) customerReviewSessions.delete(token);
  return null;
};
const authorizeCustomer = (request, response, mode) => {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expiredSession = customerReviewSessions.get(token);
  const session = findCustomerSession(request);
  if (session) return session;
  if (expiredSession && Date.now() > expiredSession.expiresAt) response.setHeader("X-NovaStore-Review-Session", "expired");
  sendJson(request, response, 401, { error: "Yerel inceleme müşteri oturumu gerekli." }, mode);
  return null;
};
const validateRequest = (request, response, port, mode, allowedDisposableMethods = new Set()) => {
  const host = String(request.headers.host || "").toLocaleLowerCase("en-US");
  if (!isLoopback(request.socket.remoteAddress) || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host)) {
    counters.external += 1;
    sendJson(request, response, 403, { error: "Yalnız loopback inceleme isteğine izin verilir." }, mode);
    return false;
  }
  const methodKey = `${String(request.method || "GET").toUpperCase()} ${String(request.url || "").split("?")[0]}`;
  const allowedMutation = typeof allowedDisposableMethods === "function"
    ? allowedDisposableMethods(methodKey)
    : allowedDisposableMethods.has(methodKey);
  if (!["GET", "HEAD"].includes(request.method) && !allowedMutation) {
    counters.mutation += 1;
    sendJson(request, response, 405, { error: "Yerel inceleme çalışma zamanı salt okunurdur." }, mode);
    return false;
  }
  return true;
};

const readJsonBody = (request, { maxBytes = 32_768 } = {}) => new Promise((resolve, reject) => {
  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(new Error("PAYLOAD_TOO_LARGE"));
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    try {
      resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
    } catch {
      reject(new Error("INVALID_JSON"));
    }
  });
  request.on("error", reject);
});

const cleanReviewText = (value, maxLength = 2_000) => String(value || "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  .trim()
  .slice(0, maxLength);
const reviewAddressFromBody = (body, id, defaultValue = false) => ({
  id,
  title: cleanReviewText(body?.title, 80) || "Adres",
  fullName: cleanReviewText(body?.fullName || body?.full_name, 160),
  phone: cleanReviewText(body?.phone, 40),
  city: cleanReviewText(body?.city, 80),
  district: cleanReviewText(body?.district, 80),
  addressLine: cleanReviewText(body?.addressLine || body?.address_line, 500),
  isDefault: body?.isDefault === true || body?.is_default === true || defaultValue,
});
const validReviewAddress = (address) => (
  address.fullName && address.phone && address.city && address.district && address.addressLine
);

const compactReviewItems = (value) => (Array.isArray(value) ? value : [])
  .map((item) => ({
    productId: Number(item?.productId ?? item?.product_id ?? item?.id),
    quantity: Math.max(1, Math.min(99, Number.parseInt(item?.quantity || 1, 10) || 1)),
  }))
  .filter((item) => publicProducts.some((product) => product.id === item.productId));

const expandReviewItems = (items) => compactReviewItems(items).map(({ productId, quantity }) => {
  const product = publicProducts.find((candidate) => candidate.id === productId);
  return {
    id: productId,
    productId,
    name: product.name,
    price: product.price,
    oldPrice: product.old_price || null,
    image: product.image_url,
    imageUrl: product.image_url,
    quantity,
    selected: true,
  };
});

const reviewMutationMethods = new Set([
  "PUT /api/shared-state/cart",
  "PUT /api/shared-state/checkout",
  "POST /api/campaigns/quote",
  "POST /api/favorites/sync",
  "POST /api/users/logout",
  "POST /api/messages/send",
  "PATCH /api/users/me",
  "POST /api/addresses",
  "POST /api/questions/ask",
  "POST /api/assistant/chat",
  "POST /api/assistant/escalate",
  ...publicProducts.flatMap(({ id }) => [`POST /api/favorites/${id}`, `DELETE /api/favorites/${id}`]),
]);
const reviewMutationPatterns = Object.freeze([
  /^PUT \/api\/addresses\/\d+$/,
  /^DELETE \/api\/addresses\/\d+$/,
  /^PATCH \/api\/addresses\/\d+\/default$/,
  /^PATCH \/api\/notifications\/\d+\/read$/,
  /^PATCH \/api\/notifications\/read-all\/\d+$/,
]);
const isReviewMutationAllowed = (methodKey) => (
  reviewMutationMethods.has(methodKey) || reviewMutationPatterns.some((pattern) => pattern.test(methodKey))
);

const storefrontServer = http.createServer((request, response) => {
  const mode = "INTEGRATED_COMMERCE_PRO";
  if (!validateRequest(request, response, storefrontPort, mode, isReviewMutationAllowed)) return;
  const url = new URL(request.url, `http://127.0.0.1:${storefrontPort}`);

  if (url.pathname === "/__review/meta") return sendJson(request, response, 200, { mode, artifactSha256: storefrontSha256, sourceEntry: "storefront-commerce-pro/src/main-integrated.jsx", localData: ownerLiveProductsFile ? "sanitized-current-public-products-plus-deterministic-owner-product" : "canonical-local-catalog-through-same-origin-read-api", ownerLiveProductCount: liveOwnerProducts.length, deterministicOwnerProductCount: ownerLiveProductsFile ? 1 : 0, counters }, mode);
  if (url.pathname === "/__review/customer") {
    const reviewSession = createCustomerReviewSession();
    const reviewUserId = String(reviewCustomer.id);
    const bootstrap = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Yerel müşteri inceleme oturumu</title><script>localStorage.setItem("nova_user_token",${JSON.stringify(reviewSession.token)});localStorage.setItem("nova_user_info",${JSON.stringify(JSON.stringify(reviewCustomer))});localStorage.setItem("novastore_review_expires_at",${JSON.stringify(String(reviewSession.expiresAt))});localStorage.setItem(${JSON.stringify(`novastore_addresses_migrated_${reviewUserId}`)},"1");localStorage.setItem(${JSON.stringify(`novastore_cart_migrated_${reviewUserId}`)},"1");localStorage.setItem(${JSON.stringify(`novastore_favs_migrated_${reviewUserId}`)},"1");localStorage.setItem(${JSON.stringify(`novastore_cart_${reviewUserId}`)},"[]");localStorage.setItem(${JSON.stringify(`novastore_favs_${reviewUserId}`)},"[]");location.replace("/#/hesabim");</script>`;
    return send(request, response, 200, bootstrap, "text/html; charset=utf-8", commonHeaders(mode));
  }
  if (storefrontRuntimeModules[url.pathname]) {
    return send(request, response, 200, storefrontRuntimeModules[url.pathname], "text/javascript; charset=utf-8", commonHeaders(mode));
  }
  if (url.pathname.startsWith("/review-assets/")) {
    const fileName = url.pathname.slice("/review-assets/".length);
    const filePath = imageFiles[fileName];
    if (!filePath || !fs.existsSync(filePath)) return sendJson(request, response, 404, { error: "Görsel bulunamadı." }, mode);
    return send(request, response, 200, fs.readFileSync(filePath), "image/webp", commonHeaders(mode));
  }
  if (url.pathname.startsWith("/review-media/")) {
    const fileName = url.pathname.slice("/review-media/".length);
    const variant = reviewMediaVariants[fileName];
    if (!variant) return sendJson(request, response, 404, { error: "Yerel review medyası bulunamadı." }, mode);
    return send(request, response, 200, renderReviewMedia(variant), "image/svg+xml; charset=utf-8", commonHeaders(mode));
  }
  if (url.pathname === "/api/public/categories") return sendJson(request, response, 200, categoryTree(), mode);
  if (url.pathname === "/api/public/navigation/main") return sendJson(request, response, 200, publicNavigation, mode);
  if (url.pathname === "/api/products") return sendJson(request, response, 200, customerReviewProducts(), mode);
  if (/^\/api\/products\/\d+$/.test(url.pathname)) {
    const product = customerReviewProducts().find((candidate) => candidate.id === Number(url.pathname.split("/").pop()));
    return product ? sendJson(request, response, 200, product, mode) : sendJson(request, response, 404, { error: "Ürün bulunamadı." }, mode);
  }
  if (url.pathname.startsWith("/owner-live-media/")) {
    const media = ownerMediaCache.get(url.pathname);
    return media
      ? send(request, response, 200, media.body, media.contentType, commonHeaders(mode))
      : sendJson(request, response, 404, { error: "Owner canlı ürün görseli bulunamadı." }, mode);
  }
  if (url.pathname === "/api/public/stores/owner-main6x-r1") return sendJson(request, response, 200, {
    store: {
      slug: "owner-main6x-r1",
      name: "NovaStore Owner Canlı Ürün İncelemesi",
      description: "Güncel anonim public ürünlerin kanonik müşteri kartı ve mağaza görünümünde task-owned yerel incelemesi.",
      status: "open",
      rating: 4.8,
      review_count: 24,
      follower_count: 1284,
      total_units_sold: 2861,
      product_count: publicProducts.length,
      shipping_summary: "Teslimat bilgisi ürün ve adres adımında doğrulanır.",
      return_summary: "İade koşulları NovaStore destek akışında doğrulanır.",
    },
    products: customerReviewProducts(),
  }, mode);
  if (url.pathname === "/api/public/collections") return sendJson(request, response, 200, [{ id: 1, slug: "indirim", name: "Günün fırsatları", show_on_home: true }], mode);
  if (["/api/public/collections/indirim", "/api/public/collections/firsatlar"].includes(url.pathname)) {
    const discountedProducts = customerReviewProducts().filter((product) => Number(product.old_price) > Number(product.price));
    return sendJson(request, response, 200, {
      collection: { id: 1, slug: "indirim", name: "Günün fırsatları" },
      products: discountedProducts,
      pagination: { page: 1, limit: Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 100)), total: discountedProducts.length, hasMore: false },
    }, mode);
  }
  if (url.pathname === "/api/public/navigation/main") return sendJson(request, response, 200, publicNavigation, mode);
  const productMatch = url.pathname.match(/^\/api\/products\/(\d+)$/);
  if (productMatch) {
    const product = customerReviewProducts().find((item) => item.id === Number(productMatch[1]));
    return product ? sendJson(request, response, 200, product, mode) : sendJson(request, response, 404, { error: "Ürün bulunamadı." }, mode);
  }
  if (/^\/api\/reviews\/product\/\d+$/.test(url.pathname)) return sendJson(request, response, 200, [], mode);
  const productQuestionsMatch = url.pathname.match(/^\/api\/questions\/product\/(\d+)$/);
  if (productQuestionsMatch) {
    const optionalSession = findCustomerSession(request);
    return sendJson(request, response, 200, optionalSession?.state.questionsByProduct.get(Number(productQuestionsMatch[1])) || [], mode);
  }
  let customerSession = null;
  if (url.pathname === "/api/users/me") {
    customerSession = authorizeCustomer(request, response, mode);
    if (!customerSession) return;
    if (request.method === "PATCH") {
      return readJsonBody(request).then((body) => {
        const fullName = cleanReviewText(body?.fullName, 160);
        const phone = cleanReviewText(body?.phone, 40) || null;
        if (fullName.length < 2) return sendJson(request, response, 400, { error: "Geçerli ad soyad gerekli." }, mode);
        customerSession.state.user = { ...customerSession.state.user, fullName, phone };
        return sendJson(request, response, 200, { user: customerSession.state.user, localOnly: true }, mode);
      }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel profil verisi." }, mode));
    }
    return sendJson(request, response, 200, { user: customerSession.state.user }, mode);
  }
  if (url.pathname === "/api/assistant/chat" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      const message = cleanReviewText(body?.message);
      if (!message) return sendJson(request, response, 400, { error: "NovaBot mesajı boş olamaz." }, mode);
      const asksForSupport = /destek|canlı|müşteri temsilcisi/i.test(message);
      return sendJson(request, response, 200, {
        reply: asksForSupport ? "İstersen konuşma özetini yerel destek geçmişine aktarabilirsin." : "Yerel incelemede katalog, sepet ve destek akışlarını güvenle deneyebilirsin.",
        mode: "friendly",
        modeLabel: "NovaBot",
        suggestions: asksForSupport ? [] : ["Canlı desteğe aktar"],
        products: [],
        requiresConfirmation: asksForSupport,
        pendingAction: asksForSupport ? { type: "live_support", reason: "Yerel inceleme destek talebi" } : null,
        allowEscalation: asksForSupport,
        localOnly: true,
      }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel NovaBot verisi." }, mode));
  }
  const customerDataPath = /^\/api\/(?:addresses|orders\/user|campaigns\/coupons\/active|notifications|messages\/history|shared-state|favorites|messages\/send|users\/logout|questions\/ask|assistant\/escalate)/.test(url.pathname);
  if (customerDataPath) {
    customerSession = authorizeCustomer(request, response, mode);
    if (!customerSession) return;
  }
  if (url.pathname === "/api/addresses" && request.method === "GET") return sendJson(request, response, 200, customerSession.state.addresses, mode);
  if (url.pathname === "/api/addresses" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      const address = reviewAddressFromBody(body, customerSession.state.nextAddressId, customerSession.state.addresses.length === 0);
      if (!validReviewAddress(address)) return sendJson(request, response, 400, { error: "Adres alanları eksik." }, mode);
      customerSession.state.nextAddressId += 1;
      if (address.isDefault) customerSession.state.addresses = customerSession.state.addresses.map((item) => ({ ...item, isDefault: false, is_default: false }));
      customerSession.state.addresses.push(address);
      return sendJson(request, response, 201, { ...address, localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel adres verisi." }, mode));
  }
  const addressDefaultMatch = url.pathname.match(/^\/api\/addresses\/(\d+)\/default$/);
  if (addressDefaultMatch && request.method === "PATCH") {
    const addressId = Number(addressDefaultMatch[1]);
    const address = customerSession.state.addresses.find((item) => Number(item.id) === addressId);
    if (!address) return sendJson(request, response, 404, { error: "Adres bulunamadı." }, mode);
    customerSession.state.addresses = customerSession.state.addresses.map((item) => ({ ...item, isDefault: Number(item.id) === addressId, is_default: Number(item.id) === addressId }));
    return sendJson(request, response, 200, { ...customerSession.state.addresses.find((item) => Number(item.id) === addressId), localOnly: true }, mode);
  }
  const addressMatch = url.pathname.match(/^\/api\/addresses\/(\d+)$/);
  if (addressMatch && request.method === "PUT") {
    const addressId = Number(addressMatch[1]);
    const index = customerSession.state.addresses.findIndex((item) => Number(item.id) === addressId);
    if (index < 0) return sendJson(request, response, 404, { error: "Adres bulunamadı." }, mode);
    return readJsonBody(request).then((body) => {
      const address = reviewAddressFromBody(body, addressId, customerSession.state.addresses[index].isDefault === true);
      if (!validReviewAddress(address)) return sendJson(request, response, 400, { error: "Adres alanları eksik." }, mode);
      if (address.isDefault) customerSession.state.addresses = customerSession.state.addresses.map((item) => ({ ...item, isDefault: false, is_default: false }));
      customerSession.state.addresses[index] = address;
      return sendJson(request, response, 200, { ...address, localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel adres verisi." }, mode));
  }
  if (addressMatch && request.method === "DELETE") {
    const addressId = Number(addressMatch[1]);
    const address = customerSession.state.addresses.find((item) => Number(item.id) === addressId);
    if (!address) return sendJson(request, response, 404, { error: "Adres bulunamadı." }, mode);
    customerSession.state.addresses = customerSession.state.addresses.filter((item) => Number(item.id) !== addressId);
    if (address.isDefault && customerSession.state.addresses.length) customerSession.state.addresses[0] = { ...customerSession.state.addresses[0], isDefault: true, is_default: true };
    return sendJson(request, response, 200, { deleted: true, id: addressId, localOnly: true }, mode);
  }
  if (url.pathname === `/api/orders/user/${reviewCustomer.id}`) return sendJson(request, response, 200, reviewOrders, mode);
  if (url.pathname === "/api/campaigns/coupons/active") return sendJson(request, response, 200, [{ id: 1, code: "LOCAL10", discount_type: "PERCENT", discount_value: 10, min_order_amount: 1000 }], mode);
  if (url.pathname === `/api/notifications/user/${reviewCustomer.id}`) return sendJson(request, response, 200, customerSession.state.notifications, mode);
  const notificationReadMatch = url.pathname.match(/^\/api\/notifications\/(\d+)\/read$/);
  if (notificationReadMatch && request.method === "PATCH") {
    const notificationId = Number(notificationReadMatch[1]);
    const notification = customerSession.state.notifications.find((item) => Number(item.id) === notificationId);
    if (!notification) return sendJson(request, response, 404, { error: "Bildirim bulunamadı." }, mode);
    notification.is_read = true;
    return sendJson(request, response, 200, { ...notification, localOnly: true }, mode);
  }
  if (url.pathname === `/api/notifications/read-all/${reviewCustomer.id}` && request.method === "PATCH") {
    const count = customerSession.state.notifications.filter((item) => item.is_read !== true).length;
    customerSession.state.notifications.forEach((item) => { item.is_read = true; });
    return sendJson(request, response, 200, { updated: true, count, localOnly: true }, mode);
  }
  if (url.pathname === `/api/messages/history/${reviewCustomer.id}`) return sendJson(request, response, 200, [...initialReviewMessages, ...customerSession.state.messages], mode);
  if (url.pathname === "/api/shared-state/cart" && request.method === "GET") return sendJson(request, response, 200, { exists: true, updatedAt: null, payload: { version: 1, items: expandReviewItems(customerSession.state.cart) } }, mode);
  if (url.pathname === "/api/favorites" && request.method === "GET") return sendJson(request, response, 200, { productIds: customerSession.state.favorites }, mode);
  if (url.pathname === "/api/users/logout" && request.method === "POST") {
    customerReviewSessions.delete(customerSession.token);
    return send(request, response, 204, "", "application/json; charset=utf-8", commonHeaders(mode));
  }
  if (url.pathname === "/api/shared-state/cart" && request.method === "PUT") {
    return readJsonBody(request).then((body) => {
      customerSession.state.cart = compactReviewItems(body?.payload?.items);
      sendJson(request, response, 200, { exists: true, payload: { version: 1, items: expandReviewItems(customerSession.state.cart) } }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel sepet verisi." }, mode));
  }
  if (url.pathname === "/api/shared-state/checkout" && request.method === "PUT") {
    return readJsonBody(request).then((body) => {
      customerSession.state.cart = compactReviewItems(body?.payload?.items);
      sendJson(request, response, 200, { saved: true, localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel checkout verisi." }, mode));
  }
  if (url.pathname === "/api/favorites/sync" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      customerSession.state.favorites = [...new Set((Array.isArray(body?.productIds) ? body.productIds : []).map(Number).filter((id) => publicProducts.some((product) => product.id === id)))];
      sendJson(request, response, 200, { productIds: customerSession.state.favorites, localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel favori verisi." }, mode));
  }
  const favoriteMatch = url.pathname.match(/^\/api\/favorites\/(\d+)$/);
  if (favoriteMatch && ["POST", "DELETE"].includes(request.method)) {
    const productId = Number(favoriteMatch[1]);
    if (!publicProducts.some((product) => product.id === productId)) return sendJson(request, response, 404, { error: "Ürün bulunamadı." }, mode);
    customerSession.state.favorites = request.method === "POST"
      ? [...new Set([...customerSession.state.favorites, productId])]
      : customerSession.state.favorites.filter((id) => id !== productId);
    return sendJson(request, response, 200, { productId, favorited: request.method === "POST", localOnly: true }, mode);
  }
  if (url.pathname === "/api/campaigns/quote" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      const items = compactReviewItems(body?.cartItems);
      if (!items.length) return sendJson(request, response, 400, { error: "Yerel fiyatlandırma için sepet boş." }, mode);
      const subtotal = items.reduce((sum, item) => sum + (publicProducts.find((product) => product.id === item.productId)?.price || 0) * item.quantity, 0);
      const requestedCoupon = cleanReviewText(body?.couponCode, 80).toLocaleUpperCase("tr-TR");
      const couponApplied = requestedCoupon === "LOCAL10";
      const couponDiscount = couponApplied ? Math.round(subtotal * .1) : 0;
      const shippingFee = subtotal >= 1500 ? 0 : 99;
      return sendJson(request, response, 200, { totals: { currency: "TRY", subtotal, bundleDiscount: 0, couponDiscount, shippingFee, total: subtotal - couponDiscount + shippingFee }, campaigns: {}, coupon: couponApplied ? { applied: true, code: "LOCAL10" } : requestedCoupon ? { applied: false, code: requestedCoupon, reason: "Kupon kodu geçerli değil." } : {}, items }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel fiyatlandırma verisi." }, mode));
  }
  if (url.pathname === "/api/messages/send" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      const message = typeof body?.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 2_000) return sendJson(request, response, 400, { error: "Geçersiz yerel destek verisi." }, mode);
      const entry = Object.freeze({
        id: initialReviewMessages.length + customerSession.state.messages.length + 1,
        sender_id: reviewCustomer.id,
        message,
        created_at: new Date().toISOString(),
      });
      customerSession.state.messages.push(entry);
      return sendJson(request, response, 200, { ...entry, delivered: true, localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel destek verisi." }, mode));
  }
  if (url.pathname === "/api/questions/ask" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      const productId = Number(body?.product_id ?? body?.productId);
      const question = cleanReviewText(body?.question, 1_000);
      if (!publicProducts.some((product) => product.id === productId) || question.length < 5) return sendJson(request, response, 400, { error: "Geçerli ürün ve soru gerekli." }, mode);
      const entry = {
        id: customerSession.state.nextQuestionId,
        question,
        user_name: customerSession.state.user.fullName,
        created_at: new Date().toISOString(),
        is_answered: false,
      };
      customerSession.state.nextQuestionId += 1;
      const existing = customerSession.state.questionsByProduct.get(productId) || [];
      customerSession.state.questionsByProduct.set(productId, [...existing, entry]);
      return sendJson(request, response, 200, { ...entry, mesaj: "Sorun yerel inceleme oturumunda kaydedildi.", localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel soru verisi." }, mode));
  }
  if (url.pathname === "/api/assistant/escalate" && request.method === "POST") {
    return readJsonBody(request).then((body) => {
      const summary = cleanReviewText(body?.summary, 4_000);
      if (summary.length < 10) return sendJson(request, response, 400, { error: "Destek özeti için biraz daha ayrıntı gerekli." }, mode);
      customerSession.state.messages.push({
        id: initialReviewMessages.length + customerSession.state.messages.length + 1,
        sender_id: 0,
        message: `[AI DESTEK DEVRI] ${summary}`,
        is_ai_handoff: true,
        created_at: new Date().toISOString(),
      });
      return sendJson(request, response, 200, { message: "Konuşma özeti yerel inceleme destek geçmişine aktarıldı.", localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel destek özeti." }, mode));
  }
  if (url.pathname.startsWith("/api/")) return sendJson(request, response, 404, { error: "Yerel inceleme endpoint'i yok." }, mode);
  return send(request, response, 200, storefrontArtifact, "text/html; charset=utf-8", commonHeaders(mode, storefrontSha256));
});

const adminBootstrap = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>NovaStore yerel Admin kadraj incelemesi</title></head><body><p>Yerel Admin ürün kadraj incelemesi hazırlanıyor…</p><script>localStorage.setItem("nova_admin_token",${JSON.stringify(adminToken)});location.replace("/admin-commerce-pro-live.html#/catalog");</script></body></html>`;
const reviewAdminProductSource = rawOwnerLiveProducts[0] || deterministicOwnerProduct;
const reviewAdminCustomerProduct = publicProducts.find((product) => product.id === reviewAdminProductSource.id) || deterministicOwnerProduct;
const reviewAdminSourceMedia = (rawOwnerLiveProducts[0]?.media || []).filter((media) => String(media.media_url || "").startsWith("https://"));
const reviewAdminLandscapeMedia = Object.freeze({ id: 990099, media_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg", is_main: false, sort_order: 99 });
const reviewAdminMedia = [
  ...(reviewAdminSourceMedia.length ? reviewAdminSourceMedia : [{ id: 990001, media_url: "https://res.cloudinary.com/demo/image/upload/sample.jpg", is_main: true, sort_order: 0 }]),
  ...(reviewAdminSourceMedia.some((media) => media.media_url === reviewAdminLandscapeMedia.media_url) ? [] : [reviewAdminLandscapeMedia]),
]
  .slice(0, 8)
  .map((media, index) => ({
    id: Number.isSafeInteger(Number(media.id)) && Number(media.id) > 0 ? Number(media.id) : 990001 + index,
    media_url: media.media_url,
    media_type: "image",
    is_main: index === 0,
    sort_order: index,
    customer_media_id: reviewAdminCustomerProduct.media[index]?.id || `admin-only-${index + 1}`,
  }));
const reviewAdminSummary = () => ({
  id: reviewAdminCustomerProduct.id,
  name: reviewAdminCustomerProduct.name,
  price: reviewAdminCustomerProduct.price,
  old_price: reviewAdminCustomerProduct.old_price,
  currency: "TRY",
  stock: reviewAdminCustomerProduct.stock,
  publication_status: "active",
  is_customer_visible: true,
  created_at: "2026-08-23T09:00:00.000Z",
  updated_at: "2026-08-23T09:00:00.000Z",
  deleted_at: null,
  revision: reviewCatalogRevision,
  primary_category_id: 1,
  primary_category_name: "Ev ve Yaşam",
  primary_category_path: "ev-yasam",
  category_count: 1,
  has_media: true,
});
const reviewAdminDetail = () => ({
  catalogMode: "first_party",
  product: {
    id: reviewAdminCustomerProduct.id,
    name: reviewAdminCustomerProduct.name,
    description: reviewAdminCustomerProduct.description || "Yerel owner inceleme ürünü.",
    price: reviewAdminCustomerProduct.price,
    old_price: reviewAdminCustomerProduct.old_price,
    currency: "TRY",
    stock: reviewAdminCustomerProduct.stock,
    sku: null,
    brand: reviewAdminCustomerProduct.brand || null,
    product_type: null,
    vat_rate: null,
    vat_rate_source: null,
    weight_grams: null,
    desi: null,
    publication_status: "active",
    is_customer_visible: true,
    deleted_at: null,
    created_at: "2026-08-23T09:00:00.000Z",
    updated_at: "2026-08-23T09:00:00.000Z",
    revision: reviewCatalogRevision,
    has_media: true,
    media: reviewAdminMedia.map((media) => ({
      id: media.id,
      media_url: media.media_url,
      media_type: "image",
      is_main: media.is_main,
      sort_order: media.sort_order,
      card_framing: reviewFramingByMediaId.get(String(media.customer_media_id)) || null,
    })),
    category_ids: [1],
    primary_category_id: 1,
    categories: [{ id: 1, name: "Ev ve Yaşam", path: "ev-yasam", is_primary: true }],
    attributes: [],
  },
});
const allowAdminReviewMutation = (methodKey) => /^PATCH \/api\/admin\/catalog\/products\/\d+\/media\/\d+\/framing$/u.test(methodKey);
const adminServer = http.createServer((request, response) => {
  const mode = "INTEGRATED_COMMERCE_PRO_ADMIN";
  if (!validateRequest(request, response, adminPort, mode, allowAdminReviewMutation)) return;
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
    capabilities: { dashboardRead: true, storesRead: true, firstPartyCatalogRead: true, firstPartyCatalogWrite: true },
  }, mode);
  if (url.pathname === "/api/admin/stats") return sendJson(request, response, 200, {
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: publicProducts.length,
    totalUsers: 0,
    dataScope: "local_review_no_finance_order_user_data",
  }, mode);
  if (url.pathname === "/api/admin/stores/summary") return sendJson(request, response, 200, { items: storeSummaries, limit: 100, hasMore: false }, mode);
  if (url.pathname === "/api/admin/catalog/products/summary") return sendJson(request, response, 200, { catalogMode: "first_party", items: [reviewAdminSummary()], limit: 100, hasMore: false }, mode);
  const adminCatalogProductMatch = url.pathname.match(/^\/api\/admin\/catalog\/products\/(\d+)$/);
  if (adminCatalogProductMatch && request.method === "GET") {
    return Number(adminCatalogProductMatch[1]) === reviewAdminCustomerProduct.id
      ? sendJson(request, response, 200, reviewAdminDetail(), mode)
      : sendJson(request, response, 404, { error: "Ürün bulunamadı." }, mode);
  }
  const adminFramingMatch = url.pathname.match(/^\/api\/admin\/catalog\/products\/(\d+)\/media\/(\d+)\/framing$/);
  if (adminFramingMatch && request.method === "PATCH") {
    if (Number(adminFramingMatch[1]) !== reviewAdminCustomerProduct.id) return sendJson(request, response, 404, { error: "Ürün bulunamadı." }, mode);
    const media = reviewAdminMedia.find((entry) => entry.id === Number(adminFramingMatch[2]));
    if (!media) return sendJson(request, response, 404, { error: "Medya bulunamadı." }, mode);
    return readJsonBody(request).then((body) => {
      if (Number(body?.expected_revision) !== reviewCatalogRevision) return sendJson(request, response, 409, { error: "Ürün revizyonu güncel değil." }, mode);
      const framing = body?.card_framing;
      const valid = framing === null || (framing && typeof framing === "object" && !Array.isArray(framing)
        && Object.keys(framing).length === 3
        && ["focal_x", "focal_y", "zoom"].every((key) => Object.prototype.hasOwnProperty.call(framing, key))
        && Number.isFinite(Number(framing.focal_x)) && Number(framing.focal_x) >= 0 && Number(framing.focal_x) <= 1
        && Number.isFinite(Number(framing.focal_y)) && Number(framing.focal_y) >= 0 && Number(framing.focal_y) <= 1
        && Number.isFinite(Number(framing.zoom)) && Number(framing.zoom) >= 1 && Number(framing.zoom) <= 3);
      if (!valid) return sendJson(request, response, 400, { error: "Kadraj aralık dışında." }, mode);
      reviewFramingByMediaId.set(String(media.customer_media_id), framing === null ? null : { focal_x: Number(framing.focal_x), focal_y: Number(framing.focal_y), zoom: Number(framing.zoom) });
      reviewCatalogRevision += 1;
      return sendJson(request, response, 200, { productId: reviewAdminCustomerProduct.id, revision: reviewCatalogRevision, media: reviewAdminDetail().product.media, storageMutation: false, localOnly: true }, mode);
    }).catch(() => sendJson(request, response, 400, { error: "Geçersiz yerel kadraj verisi." }, mode));
  }
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
console.log(`OFFICIAL_ADMIN_URL=http://127.0.0.1:${adminPort}/admin-commerce-pro-live.html#/catalog`);
console.log(`SERVED_STOREFRONT_ARTIFACT_SHA256=${storefrontSha256}`);
console.log(`SERVED_ADMIN_ARTIFACT_SHA256=${adminSha256}`);
console.log("REMOTE_DATABASE_CONNECTION_COUNT=0");

const close = () => Promise.allSettled([
  new Promise((resolve) => storefrontServer.close(resolve)),
  new Promise((resolve) => adminServer.close(resolve)),
]).finally(() => process.exit(0));
process.once("SIGINT", close);
process.once("SIGTERM", close);
