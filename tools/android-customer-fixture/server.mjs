import { createReadStream, existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const LOOPBACK_HOST = "127.0.0.1";
const DEFAULT_PORT = 5000;
const VALID_SCENARIOS = new Set(["filled", "empty", "error", "loading"]);
const FIXTURE_TOKEN = "fixture.debug.token.not-a-credential";
const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(fixtureRoot, "../..");
const mediaRoot = join(repositoryRoot, "frontend", "uploads", "local-products");
const DEFAULT_MEDIA_ORIGIN = `http://10.0.2.2:${DEFAULT_PORT}`;

const mediaUrl = (fileName) => `${DEFAULT_MEDIA_ORIGIN}/fixture-media/${encodeURIComponent(fileName)}`;

const categories = [
  {
    id: 1,
    name: "Moda",
    slug: "moda",
    path: "moda",
    depth: 0,
    displayOrder: 1,
    visibleProductCount: 4,
    directVisibleProductCount: 0,
    isActive: true,
    children: [
      { id: 11, name: "Kadın", parentId: 1, slug: "kadin", path: "moda/kadin", depth: 1, displayOrder: 1, visibleProductCount: 2, directVisibleProductCount: 2, isActive: true, children: [] },
      { id: 12, name: "Çocuk", parentId: 1, slug: "cocuk", path: "moda/cocuk", depth: 1, displayOrder: 2, visibleProductCount: 2, directVisibleProductCount: 2, isActive: true, children: [] }
    ]
  },
  { id: 2, name: "Elektronik", slug: "elektronik", path: "elektronik", depth: 0, displayOrder: 2, visibleProductCount: 2, directVisibleProductCount: 2, isActive: true, children: [] },
  { id: 3, name: "Ev & Yaşam", slug: "ev-yasam", path: "ev-yasam", depth: 0, displayOrder: 3, visibleProductCount: 1, directVisibleProductCount: 1, isActive: true, children: [] },
  { id: 4, name: "Kozmetik", slug: "kozmetik", path: "kozmetik", depth: 0, displayOrder: 4, visibleProductCount: 1, directVisibleProductCount: 1, isActive: true, children: [] },
  { id: 5, name: "Spor", slug: "spor", path: "spor", depth: 0, displayOrder: 5, visibleProductCount: 0, directVisibleProductCount: 0, isActive: true, children: [] },
  { id: 6, name: "Süpermarket", slug: "supermarket", path: "supermarket", depth: 0, displayOrder: 6, visibleProductCount: 0, directVisibleProductCount: 0, isActive: true, children: [] }
];

const productSeed = [
  [101, "Gri Şortlu Erkek Çocuk Takım", 1299, 1699, 18, "gri-design-sortlu-erkek-cocuk-takim.jpg", "Çocuk", "moda/cocuk"],
  [102, "Siyah Fırfırlı Kareli Kız Çocuk Takım", 799, 999, 12, "siyah-firfirli-kareli-kiz-cocuk-takim.jpg", "Çocuk", "moda/cocuk"],
  [103, "Yıldızlı Tüllü Gri Kız Çocuk Takım", 1599, 1999, 9, "yildizli-tullu-gri-kiz-cocuk-takim.jpg", "Çocuk", "moda/cocuk"],
  [104, "Zümrüt Krep Ferace Takım", 2499, 3299, 7, "zumrut-krep-ferace-takim.jpg", "Kadın", "moda/kadin"],
  [201, "Nova Pulse ANC Kulaklık", 4299, 5199, 21, "gri-design-sortlu-erkek-cocuk-takim.jpg", "Elektronik", "elektronik"],
  [202, "Brewista Barista Pro Espresso Makinesi", 6999, 8499, 6, "zumrut-krep-ferace-takim.jpg", "Ev & Yaşam", "ev-yasam"],
  [203, "Pure Glow Cilt Bakım Seti", 1799, 2369, 15, "yildizli-tullu-gri-kiz-cocuk-takim.jpg", "Kozmetik", "kozmetik"],
  [204, "NovaWatch 2 Akıllı Saat", 1599, 1999, 10, "siyah-firfirli-kareli-kiz-cocuk-takim.jpg", "Elektronik", "elektronik"]
];

const products = productSeed.map(([id, name, price, oldPrice, stock, image, category, categoryPath], index) => ({
  id,
  name,
  price,
  old_price: oldPrice,
  stock,
  description: `${name}, hermetik Android müşteri görsel doğrulama fixture ürünüdür.`,
  image_url: mediaUrl(image),
  category,
  categories: [category],
  average_rating: (4.6 + (index % 3) / 10).toFixed(1),
  review_count: 119 + index * 23,
  media: [{ id: 1000 + id, product_id: id, media_url: mediaUrl(image), media_type: "image", is_main: true, sort_order: 0 }],
  categoryRelations: [{ categoryId: categoryPath === "moda/cocuk" ? 12 : categoryPath === "moda/kadin" ? 11 : categoryPath === "elektronik" ? 2 : categoryPath === "ev-yasam" ? 3 : 4, isPrimary: true, category: { id: 0, name: category, path: categoryPath, children: [] } }]
}));

const user = {
  id: 7001,
  fullName: "Nova Müşteri",
  email: "fixture.customer@example.invalid",
  role: "customer",
  phone: "05550000000",
  emailVerified: true,
  phoneVerified: true
};

const orderItems = [
  { id: 201, name: "Nova Pulse ANC Kulaklık", image: products[4].image_url, price: 1299, quantity: 1, old_price: 1499, line_total: 1299 },
  { id: 104, name: "Zümrüt Krep Ferace Takım", image: products[3].image_url, price: 2499, quantity: 1, old_price: 3299, line_total: 2499 }
];

const orders = [
  { id: 1234567, user_id: user.id, total_amount: "1299.00", status: "preparing", created_at: "2026-07-18T10:24:00Z", customer_name: user.fullName, email: user.email, phone: user.phone, address: "Atakum Mah. Cumhuriyet Cad. No:58 D:12, Samsun", items: [orderItems[0]], payment_status: "paid", payment_ref: "fixture-payment-1", display_status: "Hazırlanıyor", status_note: "Sipariş hazırlanıyor", is_pending_payment: false, is_payment_failed: false, shipment_provider: "Nova Kargo", tracking_no: null, shipment_status: "preparing", cancel_reason: null, refund_status: null, estimated_delivery_date: "2026-07-24", payment_method: "card", currency: "TRY", tracking_url: null, eta_date: "2026-07-24" },
  { id: 1234502, user_id: user.id, total_amount: "2499.00", status: "shipped", created_at: "2026-07-16T16:45:00Z", customer_name: user.fullName, email: user.email, phone: user.phone, address: "Atakum Mah. Cumhuriyet Cad. No:58 D:12, Samsun", items: [orderItems[1]], payment_status: "paid", payment_ref: "fixture-payment-2", display_status: "Kargoda", status_note: "Dağıtım merkezinde", is_pending_payment: false, is_payment_failed: false, shipment_provider: "Nova Kargo", tracking_no: "NX00001234502", shipment_status: "in_transit", cancel_reason: null, refund_status: null, estimated_delivery_date: "2026-07-22", payment_method: "card", currency: "TRY", tracking_url: "https://tracking.example.invalid/NX00001234502", eta_date: "2026-07-22" },
  { id: 1234401, user_id: user.id, total_amount: "1599.00", status: "delivered", created_at: "2026-07-12T09:18:00Z", customer_name: user.fullName, email: user.email, phone: user.phone, address: "Atakum Mah. Cumhuriyet Cad. No:58 D:12, Samsun", items: [{ ...orderItems[0], id: 204, name: "NovaWatch 2 Akıllı Saat", image: products[7].image_url, price: 1599, line_total: 1599 }], payment_status: "paid", payment_ref: "fixture-payment-3", display_status: "Teslim Edildi", status_note: "Teslim edildi", is_pending_payment: false, is_payment_failed: false, shipment_provider: "Nova Kargo", tracking_no: "NX00001234401", shipment_status: "delivered", cancel_reason: null, refund_status: null, estimated_delivery_date: "2026-07-15", payment_method: "card", currency: "TRY", tracking_url: null, eta_date: "2026-07-15" }
];

const initialCart = [
  { productId: 201, name: products[4].name, price: products[4].price, imageUrl: products[4].image_url, quantity: 1 },
  { productId: 104, name: products[3].name, price: products[3].price, imageUrl: products[3].image_url, quantity: 2 }
];

const initialAddresses = [
  { id: 501, title: "Ev", fullName: user.fullName, phone: user.phone, city: "Samsun", district: "Atakum", detail: "Cumhuriyet Cad. No:58 D:12", isDefault: true },
  { id: 502, title: "İş", fullName: user.fullName, phone: user.phone, city: "Samsun", district: "İlkadım", detail: "Liman Mah. No:24", isDefault: false }
];

const clone = (value) => JSON.parse(JSON.stringify(value));

function sendJson(response, status, value) {
  const materializedValue = response.fixtureMediaOrigin
    ? JSON.parse(JSON.stringify(value).replaceAll(DEFAULT_MEDIA_ORIGIN, response.fixtureMediaOrigin))
    : value;
  const body = JSON.stringify(materializedValue);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store"
  });
  response.end(body);
}

function sendEmpty(response, status = 204) {
  response.writeHead(status, { "cache-control": "no-store" });
  response.end();
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createState() {
  return {
    favorites: new Set([101, 103, 201, 202, 203, 204]),
    cart: clone(initialCart),
    checkout: { version: 1, items: clone(initialCart), selectedAddressId: 501, couponCode: "NOVA150", paymentMethod: "card", updatedAt: "2026-07-20T12:00:00Z" },
    addresses: clone(initialAddresses),
    messages: [
      { id: 1, sender_id: user.id, receiver_id: null, message: "Siparişim için yardıma ihtiyacım var.", created_at: "2026-07-20T11:20:00Z", is_ai_handoff: false, support_thread_id: 8801, is_ai_handoff_dismissed: false },
      { id: 2, sender_id: null, receiver_id: user.id, message: "Merhaba, birlikte kontrol edelim.", created_at: "2026-07-20T11:21:00Z", is_ai_handoff: true, support_thread_id: 8801, is_ai_handoff_dismissed: false }
    ],
    reviews: [
      { id: 7101, product_id: 201, rating: 5, comment: "Ürün beklentimi karşıladı.", status: "PUBLISHED", created_at: "2026-07-18T09:00:00Z", product_name: products[4].name, image_url: products[4].image_url, media: [] },
      { id: 7102, product_id: 101, rating: 4, comment: "Yayın incelemesinde.", status: "PENDING", created_at: "2026-07-19T09:00:00Z", product_name: products[0].name, image_url: products[0].image_url, media: [] },
      { id: 7103, product_id: 103, rating: 3, comment: "Yayından kaldırılmış değerlendirme.", status: "HIDDEN", created_at: "2026-07-20T09:00:00Z", product_name: products[2].name, image_url: products[2].image_url, media: [] }
    ]
  };
}

const privatePath = (method, path) =>
  /^\/api\/(notifications|orders|messages|addresses|favorites|shared-state)\//.test(path) ||
  ["/api/addresses", "/api/favorites", "/api/returns"].includes(path) ||
  /^\/api\/reviews\/user\//.test(path) ||
  /^\/api\/returns\//.test(path) ||
  path === "/api/reviews" || path === "/api/questions/user" || path === "/api/questions/ask" ||
  path === "/api/campaigns/coupons/active" || path === "/api/assistant/escalate" ||
  path === "/api/payments/initialize" || (path === "/api/users/me" && method !== "POST");

const requestedUserId = (path) => {
  const match = path.match(/^\/api\/(?:notifications\/user|orders\/user|messages\/history|reviews\/user)\/(\d+)$/);
  return match ? Number(match[1]) : null;
};

export function createFixtureServer({ scenario = "filled", delayMs = 1800 } = {}) {
  if (!VALID_SCENARIOS.has(scenario)) throw new Error(`Unsupported fixture scenario: ${scenario}`);
  const state = createState();

  return createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${LOOPBACK_HOST}:${DEFAULT_PORT}`}`);
    const path = url.pathname;
    response.fixtureMediaOrigin = url.origin;

    if (privatePath(request.method, path)) {
      if (request.headers.authorization !== `Bearer ${FIXTURE_TOKEN}`) {
        sendJson(response, 401, { error: "Kimlik doğrulaması gerekli." });
        return;
      }
      const ownerId = requestedUserId(path);
      if (ownerId !== null && ownerId !== user.id) {
        sendJson(response, 403, { error: "Bu müşteri kaydına erişim yetkiniz yok." });
        return;
      }
    }

    if (path === "/__fixture/status") {
      sendJson(response, 200, { fixture: "novastore-android-customer", scenario, hermetic: true, remoteCalls: false });
      return;
    }

    if (path.startsWith("/fixture-media/")) {
      const fileName = decodeURIComponent(path.slice("/fixture-media/".length));
      const absolute = resolve(mediaRoot, fileName);
      const relativePath = relative(mediaRoot, absolute);
      const escapesMediaRoot = relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath);
      if (escapesMediaRoot || !existsSync(absolute)) {
        sendJson(response, 404, { message: "Fixture media bulunamadı." });
        return;
      }
      const type = extname(absolute).toLowerCase() === ".webp" ? "image/webp" : "image/jpeg";
      response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      createReadStream(absolute).pipe(response);
      return;
    }

    if (scenario === "error") {
      sendJson(response, 503, { message: "Hermetik hata senaryosu." });
      return;
    }
    if (scenario === "loading") await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    const empty = scenario === "empty";

    try {
      if (request.method === "GET" && path === "/api/products") {
        const category = url.searchParams.get("category")?.toLocaleLowerCase("tr-TR");
        const result = empty ? [] : category ? products.filter((product) => product.categoryRelations.some((relation) => relation.category.path.startsWith(category))) : products;
        sendJson(response, 200, result);
      } else if (request.method === "GET" && /^\/api\/products\/\d+$/.test(path)) {
        const id = Number(path.split("/").at(-1));
        const product = products.find((item) => item.id === id);
        product ? sendJson(response, 200, product) : sendJson(response, 404, { message: "Ürün bulunamadı." });
      } else if (request.method === "GET" && path === "/api/public/categories") {
        sendJson(response, 200, empty ? [] : categories);
      } else if (request.method === "POST" && path === "/api/users/login") {
        sendJson(response, 200, { mesaj: "Hermetik fixture oturumu açıldı.", token: FIXTURE_TOKEN, user });
      } else if (request.method === "POST" && path === "/api/users/register") {
        sendJson(response, 200, { mesaj: "Hermetik fixture hesabı oluşturuldu.", user });
      } else if (request.method === "POST" && path === "/api/users/logout") {
        sendEmpty(response);
      } else if (request.method === "GET" && path === "/api/users/me") {
        sendJson(response, 200, { mesaj: "Fixture müşteri profili.", user });
      } else if (request.method === "PATCH" && path === "/api/users/me") {
        const body = await readJson(request);
        sendJson(response, 200, { mesaj: "Fixture profil güncellendi.", user: { ...user, fullName: body.fullName || user.fullName, phone: body.phone ?? user.phone } });
      } else if (request.method === "GET" && path === "/api/users/security-status") {
        sendJson(response, 200, { email: user.email, emailVerified: true, phone: user.phone, phoneVerified: true, twoFactorEnabled: false, hasPassword: true });
      } else if (request.method === "POST" && path.startsWith("/api/users/verification/")) {
        sendJson(response, 200, { mesaj: "Hermetik doğrulama isteği işlendi." });
      } else if (request.method === "POST" && path === "/api/users/password-reset/request") {
        sendJson(response, 200, { mesaj: "Kod gönderilebiliyorsa gönderildi." });
      } else if (request.method === "POST" && path === "/api/users/password-reset/verify") {
        sendJson(response, 200, { valid: true, expiresAt: "2026-07-20T12:10:00Z", message: "Kod doğrulandı." });
      } else if (request.method === "POST" && ["/api/users/password-reset/complete", "/api/users/change-password"].includes(path)) {
        sendJson(response, 200, { mesaj: "Hermetik parola işlemi tamamlandı." });
      } else if (request.method === "GET" && /^\/api\/notifications\/user\/\d+$/.test(path)) {
        sendJson(response, 200, empty ? [] : [
          { id: 1, user_id: user.id, type: "order_update", message: "Siparişin kargoya verildi.", is_read: false, created_at: "2026-07-20T10:00:00Z", entity_type: "order", entity_id: 1234502 },
          { id: 2, user_id: user.id, type: "product_update", message: "Ürün yeniden stokta.", is_read: false, created_at: "2026-07-20T10:01:00Z", entity_type: "product", entity_id: 201 },
          { id: 3, user_id: user.id, type: "question_answered", message: "Ürün sorun yanıtlandı.", is_read: false, created_at: "2026-07-20T10:02:00Z", entity_type: "product_question", entity_id: 1 },
          { id: 4, user_id: user.id, type: "return_update", message: "İade talebin güncellendi.", is_read: false, created_at: "2026-07-20T10:03:00Z", entity_type: "return_request", entity_id: 9901 },
          { id: 5, user_id: user.id, type: "review_update", message: "Değerlendirmen yayınlandı.", is_read: false, created_at: "2026-07-20T10:04:00Z", entity_type: "review", entity_id: 7101 },
          { id: 6, user_id: user.id, type: "ai_handoff", message: "Destek kaydın temsilciye aktarıldı.", is_read: false, created_at: "2026-07-20T10:05:00Z", entity_type: "support_thread", entity_id: 8801 },
          { id: 7, user_id: user.id, type: "system", message: "Eski kayıt artık bulunmuyor.", is_read: true, created_at: "2026-07-20T10:06:00Z", entity_type: "order", entity_id: 999999 }
        ]);
      } else if (request.method === "PATCH" && path.startsWith("/api/notifications/")) {
        sendJson(response, 200, { mesaj: "Bildirim durumu güncellendi." });
      } else if (request.method === "GET" && /^\/api\/orders\/user\/\d+$/.test(path)) {
        sendJson(response, 200, empty ? [] : orders);
      } else if (request.method === "POST" && /^\/api\/orders\/\d+\/cancel$/.test(path)) {
        sendJson(response, 200, { mesaj: "Hermetik sipariş iptali kaydedildi." });
      } else if (request.method === "GET" && path === "/api/campaigns/coupons/active") {
        sendJson(response, 200, empty ? [] : [{ id: 1, code: "NOVA150", discount_type: "fixed", discount_value: 150, min_order_amount: 1000, max_discount_amount: 150, starts_at: "2026-07-01T00:00:00Z", ends_at: "2026-12-31T23:59:59Z" }]);
      } else if (request.method === "GET" && /^\/api\/messages\/history\/\d+$/.test(path)) {
        sendJson(response, 200, empty ? [] : state.messages);
      } else if (request.method === "POST" && path === "/api/messages/send") {
        const body = await readJson(request);
        const message = { id: state.messages.length + 1, sender_id: user.id, receiver_id: null, message: String(body.message || ""), created_at: "2026-07-20T11:30:00Z", is_ai_handoff: false, support_thread_id: 8801, is_ai_handoff_dismissed: false };
        state.messages.push(message);
        sendJson(response, 200, message);
      } else if (request.method === "GET" && /^\/api\/reviews\/user\/\d+$/.test(path)) {
        sendJson(response, 200, empty ? [] : state.reviews);
      } else if (request.method === "GET" && /^\/api\/reviews\/product\/\d+$/.test(path)) {
        const productId = Number(path.split("/").at(-1));
        const alreadyReviewed = state.reviews.some((review) => review.product_id === productId);
        const delivered = orders.some((order) => order.status === "delivered" && order.items.some((item) => (item.product_id ?? item.id) === productId));
        const permission = request.headers.authorization !== `Bearer ${FIXTURE_TOKEN}`
          ? { canReview: false, requiresAuth: true, code: "AUTH_REQUIRED", message: "Değerlendirme yapmak için giriş yapmalısınız." }
          : alreadyReviewed
          ? { canReview: false, requiresAuth: false, code: "ALREADY_REVIEWED", message: "Bu ürünü zaten değerlendirdiniz." }
          : delivered
            ? { canReview: true, requiresAuth: false, code: "ELIGIBLE", message: null }
            : { canReview: false, requiresAuth: false, code: "DELIVERY_REQUIRED", message: "Teslim edilen sipariş gerekli." };
        sendJson(response, 200, { reviews: [], average: 0, totalReviews: 0, reviewPermission: permission });
      } else if (request.method === "POST" && path === "/api/reviews") {
        const body = await readJson(request);
        const productId = Number(body.product_id ?? body.productId);
        const product = products.find((item) => item.id === productId);
        const delivered = orders.some((order) =>
          order.status === "delivered" && order.items.some((item) => (item.product_id ?? item.id) === productId)
        );
        const rating = Number(body.rating);
        const comment = body.comment == null ? null : String(body.comment);
        if (!product) {
          sendJson(response, 404, { error: "Ürün bulunamadı.", code: "PRODUCT_NOT_FOUND" });
        } else if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          sendJson(response, 400, { error: "Puan 1 ile 5 arasında olmalıdır.", code: "REVIEW_RATING_INVALID" });
        } else if (comment != null && comment.length > 2000) {
          sendJson(response, 400, { error: "Yorum metni çok uzun.", code: "REVIEW_COMMENT_INVALID" });
        } else if (!delivered) {
          sendJson(response, 403, { error: "Teslim edilen sipariş gerekli.", code: "DELIVERY_REQUIRED" });
        } else if (state.reviews.some((review) => review.product_id === productId)) {
          sendJson(response, 409, { error: "Bu ürünü zaten değerlendirdiniz.", code: "ALREADY_REVIEWED" });
        } else {
          const reviewId = 7200 + state.reviews.length;
          state.reviews.push({ id: reviewId, product_id: productId, rating, comment, status: "PENDING", created_at: "2026-08-14T00:00:00Z", product_name: product.name, media: [] });
          sendJson(response, 201, { mesaj: "Değerlendirmeniz alındı ve yayın incelemesine gönderildi.", reviewId, status: "PENDING" });
        }
      } else if (request.method === "GET" && path === "/api/questions/user") {
        sendJson(response, 200, empty ? [] : [{ id: 1, product_id: 201, user_id: user.id, question: "Garanti süresi nedir?", answer: "İki yıl garantilidir.", created_at: "2026-07-18T09:00:00Z", answered_at: "2026-07-18T10:00:00Z", user_name: user.fullName, product_name: products[4].name, product_image: products[4].image_url, status: "answered", is_answered: true }]);
      } else if (request.method === "GET" && /^\/api\/questions\/product\/\d+$/.test(path)) {
        sendJson(response, 200, empty ? [] : [{ id: 1, question: "Garanti süresi nedir?", answer: "İki yıl garantilidir.", created_at: "2026-07-18T09:00:00Z", answered_at: "2026-07-18T10:00:00Z", user_name: "Nova M.", status: "answered", is_answered: true }]);
      } else if (request.method === "POST" && path === "/api/questions/ask") {
        sendJson(response, 200, { mesaj: "Hermetik soru kaydedildi." });
      } else if (request.method === "GET" && path === "/api/addresses") {
        sendJson(response, 200, empty ? [] : state.addresses);
      } else if (request.method === "POST" && path === "/api/addresses") {
        const body = await readJson(request);
        const address = { ...body, id: 900 + state.addresses.length };
        state.addresses.push(address);
        sendJson(response, 200, address);
      } else if (request.method === "PUT" && /^\/api\/addresses\/\d+$/.test(path)) {
        const id = Number(path.split("/").at(-1));
        const body = await readJson(request);
        const address = { ...body, id };
        state.addresses = state.addresses.map((item) => item.id === id ? address : item);
        sendJson(response, 200, address);
      } else if (request.method === "DELETE" && /^\/api\/addresses\/\d+$/.test(path)) {
        const id = Number(path.split("/").at(-1));
        state.addresses = state.addresses.filter((item) => item.id !== id);
        sendJson(response, 200, { mesaj: "Adres silindi." });
      } else if (request.method === "PATCH" && /^\/api\/addresses\/\d+\/default$/.test(path)) {
        const id = Number(path.split("/").at(-2));
        state.addresses = state.addresses.map((item) => ({ ...item, isDefault: item.id === id }));
        sendJson(response, 200, state.addresses.find((item) => item.id === id));
      } else if (request.method === "GET" && path === "/api/favorites") {
        sendJson(response, 200, { productIds: empty ? [] : [...state.favorites], favorites: [] });
      } else if (["POST", "DELETE"].includes(request.method) && /^\/api\/favorites\/\d+$/.test(path)) {
        const id = Number(path.split("/").at(-1));
        if (request.method === "POST") state.favorites.add(id); else state.favorites.delete(id);
        sendJson(response, 200, { productId: id, favorited: request.method === "POST", created: request.method === "POST", removed: request.method === "DELETE", localOnly: false });
      } else if (request.method === "POST" && path === "/api/favorites/sync") {
        const body = await readJson(request);
        state.favorites = new Set(Array.isArray(body.productIds) ? body.productIds : []);
        sendJson(response, 200, { productIds: [...state.favorites], favorites: [] });
      } else if (request.method === "GET" && path === "/api/shared-state/cart") {
        sendJson(response, 200, { key: "cart", exists: !empty, payload: { version: 1, items: empty ? [] : state.cart, updatedAt: "2026-07-20T12:00:00Z" }, updatedAt: "2026-07-20T12:00:00Z" });
      } else if (request.method === "PUT" && path === "/api/shared-state/cart") {
        const body = await readJson(request);
        state.cart = body.payload?.items ?? [];
        sendJson(response, 200, { key: "cart", exists: true, payload: { ...body.payload, items: state.cart }, updatedAt: "2026-07-20T12:00:00Z" });
      } else if (request.method === "GET" && path === "/api/shared-state/checkout") {
        sendJson(response, 200, { key: "checkout", exists: !empty, payload: empty ? { version: 1, items: [] } : state.checkout, updatedAt: "2026-07-20T12:00:00Z" });
      } else if (request.method === "PUT" && path === "/api/shared-state/checkout") {
        const body = await readJson(request);
        state.checkout = body.payload ?? state.checkout;
        sendJson(response, 200, { key: "checkout", exists: true, payload: state.checkout, updatedAt: "2026-07-20T12:00:00Z" });
      } else if (request.method === "POST" && path === "/api/returns") {
        sendJson(response, 503, {
          code: "RETURN_WRITES_DISABLED",
          error: "İade talebi ve durum değişiklikleri güvenli iade akışı tamamlanana kadar geçici olarak kapalıdır."
        });
      } else if (request.method === "GET" && /^\/api\/returns\/\d+$/.test(path)) {
        const id = Number(path.split("/").at(-1));
        id === 9901
          ? sendJson(response, 200, { id, order_id: 1234401, status: "IN_REVIEW", reason: "CUSTOMER_REQUEST", note: "Ürün kontrol ediliyor.", created_at: "2026-08-13T09:00:00Z" })
          : sendJson(response, 404, { error: "İade talebi bulunamadı." });
      } else if (request.method === "POST" && path === "/api/payments/initialize") {
        sendJson(response, 200, { orderId: 99001, paymentRef: "fixture-payment", paymentStatus: "sandbox_pending", provider: "fixture", idempotencyKey: "fixture-idempotency", totals: { subtotal: 9798, total: 9798, currency: "TRY" }, paymentAction: { provider: "fixture", status: "sandbox", action: null, type: "fixture" }, message: "Hermetik fixture ödeme eylemi; gerçek provider çağrısı yapılmadı." });
      } else if (request.method === "GET" && path === "/api/payments/status") {
        sendJson(response, 200, { orderId: Number(url.searchParams.get("orderId") || 99001), paymentRef: url.searchParams.get("paymentRef") || "fixture-payment", paymentStatus: "sandbox_pending", orderStatus: "pending", refundStatus: null, provider: "fixture", finalized: false, providerFinalized: false, commerceFinalized: false, reconciliationRequired: false, reconciliationReason: null, message: "Hermetik fixture ödeme durumu.", nextAction: null });
      } else if (request.method === "POST" && path === "/api/assistant/chat") {
        const reply = "Hermetik NovaBot yanıtı: Sipariş ve teslimat konularında yardımcı olabilirim.";
        sendJson(response, 200, { reply, message: reply, conversationId: "fixture-conversation", mode: "novabot", escalated: false });
      } else if (request.method === "POST" && path === "/api/assistant/escalate") {
        sendJson(response, 200, { message: "Konuşma özeti yerel destek kaydına aktarıldı.", escalation: state.messages[1], thread: { id: 8801, customerId: user.id, status: "OPEN", assignedAdminId: null, source: "AI_HANDOFF", lastMessageAt: "2026-07-20T11:21:00Z" } });
      } else {
        sendJson(response, 404, { message: "Hermetik fixture rotası bulunamadı." });
      }
    } catch {
      sendJson(response, 400, { message: "Hermetik fixture isteği işlenemedi." });
    }
  });
}

export function startFixtureServer({ scenario = "filled", port = DEFAULT_PORT, delayMs = 1800 } = {}) {
  const server = createFixtureServer({ scenario, delayMs });
  return new Promise((resolveStart, rejectStart) => {
    server.once("error", rejectStart);
    server.listen(port, LOOPBACK_HOST, () => {
      server.off("error", rejectStart);
      resolveStart(server);
    });
  });
}

function parseArgs(argv) {
  const options = { scenario: "filled", port: DEFAULT_PORT, delayMs: 1800 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--scenario") options.scenario = argv[++index];
    else if (value === "--port") options.port = Number(argv[++index]);
    else if (value === "--delay-ms") options.delayMs = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = parseArgs(process.argv.slice(2));
  const server = await startFixtureServer(options);
  console.log(`NOVASTORE_ANDROID_FIXTURE_READY host=${LOOPBACK_HOST} port=${options.port} scenario=${options.scenario} hermetic=true`);
  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
