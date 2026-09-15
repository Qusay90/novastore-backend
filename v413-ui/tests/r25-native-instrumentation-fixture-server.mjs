import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.R25_NATIVE_FIXTURE_PORT ?? 5000);
const STORE_SLUG = "main6v-nova-teknoloji";
const MAX_BODY_BYTES = 128 * 1024;
const STATIC_ROOT = resolve(fileURLToPath(new URL("../dist/native/", import.meta.url)));
const selections = Object.freeze({
  2001: Object.freeze([{ group: "Renk", value: "Siyah" }, { group: "Kapasite", value: "128 GB" }]),
  2002: Object.freeze([{ group: "Renk", value: "Siyah" }, { group: "Kapasite", value: "256 GB" }]),
  2003: Object.freeze([{ group: "Renk", value: "Beyaz" }, { group: "Kapasite", value: "128 GB" }]),
});

let state = freshState();

function freshState() {
  return {
    productMode: "normal",
    initializeMode: "stale-price",
    previewRevision: 0,
    createdReturn: null,
    readNotificationIds: new Set(),
    requests: [],
  };
}

function product(productId) {
  if (productId === 101) return {
    id: 101, slug: "basit-keten-canta", name: "Basit Keten Çanta",
    description: "Tek kimlikli basit ürün.", category: "Aksesuar", price: "1299.00",
    old_price: null, stock: 5, is_purchasable: true,
    image_url: "/calibration-assets/generated/nova-pulse-anc-ivory-detail-v1.png", media: [],
    average_rating: "4.5", review_count: 8,
    store: { slug: STORE_SLUG, name: "R25 Kanonik Mağaza" },
    attributes: [{ code: "material", name: "Malzeme", type: "text", unit: null, value: "Pamuk" }],
    variant_selection_required: false, variants: null,
  };
  if (productId !== 202) return null;
  let rows = [
    { id: 2001, sku: "PHONE-BLK-128", selections: selections[2001], price: state.productMode === "repriced" ? 3799 : 3499, availableStock: state.productMode === "stock-lost" ? 0 : 3, purchasable: state.productMode !== "disabled" && state.productMode !== "stock-lost", commerce_revision: state.productMode === "normal" ? 11 : 21 },
    { id: 2002, sku: "PHONE-BLK-256", selections: selections[2002], price: 3999, availableStock: 0, purchasable: false, commerce_revision: 12 },
    { id: 2003, sku: "PHONE-WHT-128", selections: selections[2003], price: 3599, availableStock: 2, purchasable: true, commerce_revision: 13 },
  ];
  if (state.productMode === "removed" || state.productMode === "deleted") rows = rows.filter(({ id }) => id !== 2001);
  return {
    id: 202, slug: "kanonik-telefon", name: "Kanonik Telefon",
    description: "Tam satır seçimi gerektiren ürün.", category: "Elektronik",
    price: "3499.00", old_price: "4299.00", stock: 5, is_purchasable: true,
    image_url: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png", media: [],
    average_rating: "4.8", review_count: 19,
    store: { slug: STORE_SLUG, name: "R25 Kanonik Mağaza" },
    attributes: [
      { code: "material", name: "Malzeme", type: "text", unit: null, value: "Pamuk" },
      { code: "finish", name: "Yüzey", type: "option", unit: null, value: { label: "Mat" } },
    ],
    variant_selection_required: true, variants: rows,
  };
}

const publicProjection = Object.freeze({
  store: {
    slug: STORE_SLUG, name: "R25 Kanonik Mağaza", description: "Yerel Android UAT mağazası",
    logo_url: "/calibration-assets/official/app_icon_foreground.png",
    banner_url: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png",
    status: "open", rating: 4.8, review_count: 41, follower_count: 120,
    total_units_sold: 88, product_count: 3, shipping_summary: "", return_summary: "Sunucu uygunluğu ile",
  },
  products: [
    {
      id: 201, slug: "nova-pulse-anc", name: "Nova Pulse ANC Kulaklık", price: 4299,
      old_price: 5199, stock: 7, is_purchasable: true,
      image_url: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png",
      average_rating: 4.8, review_count: 326,
      media: [
        { id: 1, product_id: 201, media_url: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png", is_main: true, sort_order: 1, media_type: "image", card_framing: { focal_x: 0.5, focal_y: 0.5, zoom: 1 } },
        { id: 2, product_id: 201, media_url: "/calibration-assets/generated/nova-pulse-anc-ivory-side-v1.png", is_main: false, sort_order: 2, media_type: "image", card_framing: null },
        { id: 3, product_id: 201, media_url: "/calibration-assets/generated/nova-pulse-anc-ivory-detail-v1.png", is_main: false, sort_order: 3, media_type: "image", card_framing: null },
      ],
    },
    { id: 101, slug: "basit-keten-canta", name: "Basit Keten Çanta", price: 1299, old_price: null, stock: 5, is_purchasable: true, image_url: "/calibration-assets/generated/nova-pulse-anc-ivory-detail-v1.png", average_rating: 4.5, review_count: 8, media: [] },
    { id: 202, slug: "kanonik-telefon", name: "Kanonik Telefon", price: 3499, old_price: 4299, stock: 5, is_purchasable: true, image_url: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png", average_rating: 4.8, review_count: 19, media: [] },
  ],
});

const historicalOrder = Object.freeze({
  id: 501, status: "Teslim Edildi", display_status: "Teslim Edildi", payment_status: "PAID",
  delivered_at: "2026-09-03T10:00:00.000Z", created_at: "2026-09-01T10:00:00.000Z", total_amount: 3399,
  items: [{ id: 202, variant_id: 2001, variant_selections: [{ group: "Renk", value: "Gece Siyahı" }, { group: "Kapasite", value: "128 GB Tarihsel" }], sku: "PHONE-BLK-128-HIST", name: "Kanonik Telefon (Satın Alındığı Gün)", quantity: 1, price: 3399, image: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png" }],
});

const rejectedReturn = Object.freeze({
  id: 801, order_id: 502, reason_code: "NOT_AS_DESCRIBED", note: "Varyant açıklamasıyla uyuşmadı.",
  status: "REJECTED", refund_amount: 3599, revision: 2,
  decision_note: "İade uygunluk süresi sona ermiş.", decided_at: "2026-09-08T10:00:00.000Z",
  created_at: "2026-09-06T10:00:00.000Z", updated_at: "2026-09-08T10:00:00.000Z",
  order_status: "Teslim Edildi", payment_status: "PAID", refund_status: "NONE",
});

const rejectedReturnOrder = Object.freeze({
  id: 502, status: "Teslim Edildi", display_status: "Teslim Edildi", payment_status: "PAID",
  delivered_at: "2026-09-05T10:00:00.000Z", created_at: "2026-09-02T10:00:00.000Z", total_amount: 3599,
  return_id: rejectedReturn.id, return_status: rejectedReturn.status, return_revision: rejectedReturn.revision,
  return_decision_note: rejectedReturn.decision_note,
  items: [{ id: 202, variant_id: 2003, variant_selections: selections[2003], sku: "PHONE-WHT-128-HIST", name: "Kanonik Telefon (Beyaz Tarihsel)", quantity: 1, price: 3599, image: "/calibration-assets/generated/nova-pulse-anc-ivory-v1.png" }],
});

function createdReturn() {
  return {
    id: 901, order_id: 501, reason_code: "CHANGED_MIND", note: null, status: "REQUESTED",
    refund_amount: 3399, revision: 1, decision_note: null, decided_at: null,
    created_at: "2026-09-15T10:00:00.000Z", updated_at: "2026-09-15T10:00:00.000Z",
    order_status: "Teslim Edildi", payment_status: "PAID", refund_status: "NONE",
  };
}

function orderProjection() {
  return state.createdReturn
    ? { ...historicalOrder, return_id: state.createdReturn.id, return_status: state.createdReturn.status, return_revision: state.createdReturn.revision }
    : historicalOrder;
}

function notificationRecord(id, type, returnId, title, message) {
  const isRead = state.readNotificationIds.has(id);
  return {
    id, type, category: "RETURN", priority: "HIGH", title, message,
    is_read: isRead, read_at: isRead ? "2026-09-15T10:05:00.000Z" : null,
    entity_type: "return_request", entity_id: returnId,
    created_at: "2026-09-15T10:00:00.000Z", updated_at: isRead ? "2026-09-15T10:05:00.000Z" : "2026-09-15T10:00:00.000Z",
  };
}

function notifications() {
  const items = [notificationRecord(701, "RETURN_STATUS_CHANGED", rejectedReturn.id, "İade talebi sonuçlandı", "İade talebiniz reddedildi.")];
  if (state.createdReturn) items.unshift(notificationRecord(702, "RETURN_REQUESTED", state.createdReturn.id, "İade talebiniz alındı", "İade talebiniz incelemeye alındı."));
  return items;
}

function preview(cartItems) {
  const revision = state.previewRevision;
  const items = cartItems.map((item) => {
    const variantId = item.variant_id;
    const price = item.product_id === 101 ? 1299 : variantId === 2003 ? 3599 : revision ? 3799 : 3499;
    return { id: item.product_id, ...(variantId ? { variant_id: variantId, variant_selections: selections[variantId], sku: variantId === 2001 ? "PHONE-BLK-128" : "PHONE-WHT-128" } : {}), name: item.product_id === 101 ? "Basit Keten Çanta" : "Kanonik Telefon", quantity: item.quantity, price, line_total: price * item.quantity, image: null };
  });
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  return {
    schemaVersion: "checkout-agreements-v2", snapshotSha256: revision ? "b".repeat(64) : "a".repeat(64),
    documents: [
      { slug: "pre-information", path: "/legal/pre-information", title: "Ön Bilgilendirme Formu", version: revision ? "2" : "1", text: "Güncel ürün, fiyat ve teslimat bilgileri.", contentSha256: revision ? "d".repeat(64) : "c".repeat(64) },
      { slug: "distance-sale", path: "/legal/distance-sale", title: "Mesafeli Satış Sözleşmesi", version: revision ? "2" : "1", text: "Cayma ve iade hakları.", contentSha256: revision ? "f".repeat(64) : "e".repeat(64) },
    ],
    quote: { items, totals: { subtotal, bundleDiscount: 0, couponDiscount: 0, shippingFee: 0, total: subtotal, currency: "TRY" }, coupon: { applied: false, code: null } },
  };
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}

const CONTENT_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
});

async function staticAsset(pathname, response) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const candidate = resolve(STATIC_ROOT, relative);
  if (candidate !== STATIC_ROOT && !candidate.startsWith(`${STATIC_ROOT}${sep}`)) return false;
  try {
    const body = await readFile(candidate);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(candidate).toLowerCase()] ?? "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store",
    });
    response.end(body);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "EISDIR") return false;
    throw error;
  }
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  if (!bytes) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const method = request.method ?? "GET";
  try {
    if (url.pathname === "/__fixture/health" && method === "GET") return json(response, 200, { ready: true });
    if (url.pathname === "/__fixture/reset" && method === "POST") {
      state = freshState();
      return json(response, 200, { reset: true });
    }
    if (url.pathname === "/__fixture/mode" && method === "POST") {
      const body = await readJson(request);
      const allowedProductModes = new Set(["normal", "removed", "deleted", "disabled", "repriced", "stock-lost"]);
      const allowedInitializeModes = new Set(["stale-price", "stale-stock"]);
      if (body.productMode !== undefined && !allowedProductModes.has(body.productMode)) return json(response, 400, { code: "MODE_INVALID" });
      if (body.initializeMode !== undefined && !allowedInitializeModes.has(body.initializeMode)) return json(response, 400, { code: "MODE_INVALID" });
      if (body.productMode !== undefined) state.productMode = body.productMode;
      if (body.initializeMode !== undefined) state.initializeMode = body.initializeMode;
      if (body.previewRevision !== undefined) state.previewRevision = body.previewRevision === 1 ? 1 : 0;
      return json(response, 200, { productMode: state.productMode, initializeMode: state.initializeMode, previewRevision: state.previewRevision });
    }
    if (url.pathname === "/__fixture/evidence" && method === "GET") return json(response, 200, { requests: state.requests });

    const body = method === "GET" ? null : await readJson(request);
    state.requests.push({ method, path: `${url.pathname}${url.search}`, body });
    if (url.pathname === `/api/public/stores/${STORE_SLUG}` && method === "GET") return json(response, 200, publicProjection);
    const productMatch = /^\/api\/products\/(\d+)$/u.exec(url.pathname);
    if (productMatch && method === "GET") {
      const value = product(Number(productMatch[1]));
      return value ? json(response, 200, value) : json(response, 404, { code: "NOT_FOUND" });
    }
    if (url.pathname === "/api/users/me" && method === "GET") return json(response, 200, { user: { id: 17, fullName: "R25 Müşteri", email: "r25@example.test", role: "customer" } });
    if (url.pathname === "/api/addresses" && method === "GET") return json(response, 200, [{ id: 71, title: "Ev", fullName: "R25 Müşteri", phone: "05550000001", city: "İstanbul", district: "Kadıköy", addressLine: "Kanonik Sokak 1", isDefault: true }]);
    if (url.pathname === "/api/orders/user/17" && method === "GET") return json(response, 200, [orderProjection(), rejectedReturnOrder]);
    if (url.pathname === "/api/returns/mine" && method === "GET") return json(response, 200, state.createdReturn ? [state.createdReturn, rejectedReturn] : [rejectedReturn]);
    if (url.pathname === "/api/returns" && method === "POST") {
      if (body.order_id !== 501 || !["DAMAGED", "WRONG_ITEM", "NOT_AS_DESCRIBED", "CHANGED_MIND", "OTHER"].includes(body.reason_code)) {
        return json(response, 400, { code: "RETURN_REQUEST_INVALID" });
      }
      const reused = Boolean(state.createdReturn);
      if (!state.createdReturn) state.createdReturn = { ...createdReturn(), reason_code: body.reason_code, note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null };
      return json(response, reused ? 200 : 201, { reused, return: state.createdReturn });
    }
    const returnMatch = /^\/api\/returns\/([1-9]\d*)$/u.exec(url.pathname);
    if (returnMatch && method === "GET") {
      const returnId = Number(returnMatch[1]);
      const value = returnId === rejectedReturn.id ? rejectedReturn : returnId === state.createdReturn?.id ? state.createdReturn : null;
      return value ? json(response, 200, value) : json(response, 404, { code: "RETURN_NOT_FOUND" });
    }
    if (url.pathname === "/api/messages/history/17" && method === "GET") return json(response, 200, []);
    if (url.pathname === "/api/users/security-status" && method === "GET") return json(response, 200, { email: "r25@example.test", emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true });
    if (["/api/campaigns/coupons/active", "/api/questions/user", "/api/store-follows", "/api/reviews/user/17"].includes(url.pathname) && method === "GET") return json(response, 200, []);
    if (url.pathname === "/api/favorites" && method === "GET") return json(response, 200, { productIds: [] });
    if (url.pathname === "/api/notifications" && method === "GET") return json(response, 200, { items: notifications(), page: { limit: 50, hasMore: false, nextCursor: null } });
    if (url.pathname === "/api/notifications/unread-count" && method === "GET") return json(response, 200, { unreadCount: notifications().filter((item) => !item.is_read).length });
    const notificationReadMatch = /^\/api\/notifications\/([1-9]\d*)\/read$/u.exec(url.pathname);
    if (notificationReadMatch && method === "PATCH") {
      const notificationId = Number(notificationReadMatch[1]);
      const current = notifications().find((item) => item.id === notificationId);
      if (!current) return json(response, 404, { code: "NOTIFICATION_NOT_FOUND" });
      state.readNotificationIds.add(notificationId);
      const updated = notifications().find((item) => item.id === notificationId);
      return json(response, 200, { notification: updated });
    }
    if (url.pathname === "/api/payments/capability" && method === "GET") return json(response, 200, { provider: "paytr", ready: true, state: "READY", message: "Yerel sağlayıcı kapısı hazır", requirements: { providerReady: true, businessIdentityReady: true, legalDocumentsReady: true } });
    if (url.pathname === "/api/payments/agreements/preview" && method === "POST") return json(response, 200, preview(body.cartItems));
    if (url.pathname === "/api/payments/initialize" && method === "POST") {
      const code = state.initializeMode === "stale-stock" ? "VARIANT_STOCK_UNAVAILABLE" : "VARIANT_PRICE_CHANGED";
      if (code === "VARIANT_PRICE_CHANGED") state.previewRevision = 1;
      Object.assign(state.requests.at(-1), { responseStatus: 409, responseCode: code });
      return json(response, 409, { code, message: code === "VARIANT_PRICE_CHANGED" ? "Varyant fiyatı değişti." : "Varyant stoku tükendi." });
    }
    if (method === "GET" && await staticAsset(url.pathname, response)) return;
    return json(response, 404, { code: "NOT_FOUND" });
  } catch (error) {
    return json(response, 400, { code: error instanceof Error ? error.message : "FIXTURE_REQUEST_INVALID" });
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`R25_NATIVE_FIXTURE_READY http://${HOST}:${PORT}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
