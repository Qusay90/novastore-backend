import assert from "node:assert/strict";
import test from "node:test";

import { createAssistantAdapter } from "../src/adapters/assistantAdapter.js";
import { createAuthAdapter } from "../src/adapters/authAdapter.js";
import { createCartAdapter } from "../src/adapters/cartAdapter.js";
import { createCatalogAdapter } from "../src/adapters/catalogAdapter.js";
import { createCheckoutAdapter, normalizeQuote, reconcileFinalizedCart } from "../src/adapters/checkoutAdapter.js";
import { createCustomerAccountAdapter } from "../src/adapters/customerAccountAdapter.js";
import { createFavoritesAdapter } from "../src/adapters/favoritesAdapter.js";
import { createProductCommunityAdapter } from "../src/adapters/productCommunityAdapter.js";
import {
  configureRuntimeCatalog,
  getProductsForCategory,
  getVisibleProducts,
  getVisibleRoots,
  resolveCategoryPath,
} from "../src/integration/runtimeCatalog.js";
import {
  createStorefrontHttp,
  normalizeStorefrontApiPath,
  StorefrontHttpError,
} from "../src/integration/storefrontHttp.js";
import { createCommerceRuntime } from "../src/integration/createCommerceRuntime.js";
import {
  createCustomerHttp,
  CustomerHttpError,
  normalizeCustomerApiRequest,
} from "../src/integration/customerHttp.js";

const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
};

const categoryTree = Object.freeze([
  {
    id: 1,
    name: "Kadın",
    slug: "kadin",
    path: "kadin",
    parent_id: null,
    depth: 0,
    sort_order: 1,
    children: [{
      id: 11,
      name: "Giyim",
      slug: "kadin-giyim",
      path: "kadin/giyim",
      parent_id: 1,
      depth: 1,
      sort_order: 1,
      children: [],
    }],
  },
  {
    id: 2,
    name: "Erkek",
    slug: "erkek",
    path: "erkek",
    parent_id: null,
    depth: 0,
    sort_order: 2,
    children: [{
      id: 21,
      name: "Giyim",
      slug: "erkek-giyim",
      path: "erkek/giyim",
      parent_id: 2,
      depth: 1,
      sort_order: 1,
      children: [],
    }],
  },
]);

const publicProducts = Object.freeze([
  {
    id: 101,
    name: "Kadın Elbise",
    price: 1200,
    stock: 0,
    category: "Giyim",
    categories: ["Giyim"],
    categoryIds: [11],
    primaryCategoryId: 11,
  },
  {
    id: 202,
    name: "Erkek Gömlek",
    price: 900,
    stock: 4,
    category: "Giyim",
    categories: ["Giyim"],
    categoryIds: [21],
    primaryCategoryId: 21,
  },
  {
    id: 303,
    name: "Belirsiz Eski Kayıt",
    price: 500,
    stock: 8,
    category: "Giyim",
    categories: ["Giyim"],
  },
]);

test("storefront HTTP yalnız allowlist içindeki aynı-origin GET yollarını kabul eder", async () => {
  assert.equal(normalizeStorefrontApiPath("/api/products?category=kadin", "https://novastore.tr"), "/api/products?category=kadin");
  assert.equal(normalizeStorefrontApiPath("/api/public/categories/kadin/filters", "https://novastore.tr"), "/api/public/categories/kadin/filters");

  for (const path of [
    "https://evil.example/api/products",
    "//evil.example/api/products",
    "/api/admin/products",
    "/api/orders",
    "/api/products#secret",
    "/api/products\\..\\admin",
  ]) {
    assert.throws(
      () => normalizeStorefrontApiPath(path, "https://novastore.tr"),
      StorefrontHttpError,
      path,
    );
  }

  const storage = createStorage({ nova_user_token: "customer-token" });
  const requests = [];
  const http = createStorefrontHttp({
    storage,
    origin: "https://novastore.tr",
    fetchImpl: async (path, options) => {
      requests.push({ path, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await http.request("/api/products");
  await http.request("/api/users/me", { authenticated: true });
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.credentials, "same-origin");
  assert.equal(requests[0].options.headers.Authorization, undefined);
  assert.equal(requests[1].options.headers.Authorization, "Bearer customer-token");
});

test("401 müşteri yanıtı yalnız müşteri oturumunu temizler", async () => {
  const storage = createStorage({
    nova_user_token: "expired",
    nova_user_info: JSON.stringify({ id: 9 }),
    nova_admin_token: "admin-must-remain",
  });
  const events = [];
  const http = createStorefrontHttp({
    storage,
    eventTarget: { dispatchEvent: (event) => events.push(event.type) },
    origin: "https://novastore.tr",
    fetchImpl: async () => new Response(JSON.stringify({ error: "Oturum sona erdi" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  });

  await assert.rejects(() => http.request("/api/users/me", { authenticated: true }), { status: 401 });
  assert.equal(storage.getItem("nova_user_token"), null);
  assert.equal(storage.getItem("nova_user_info"), null);
  assert.equal(storage.getItem("nova_admin_token"), "admin-must-remain");
  assert.deepEqual(events, ["novastore:auth-required"]);
});

test("catalog adapter gerçek navigasyon sırasını ve çoklu kategori kimliklerini korur", async () => {
  const navigation = {
    code: "main",
    items: [
      { target: { type: "category", id: 2 }, children: [] },
      { target: { type: "category", id: 1 }, children: [] },
    ],
  };
  const http = {
    request: async (path) => {
      if (path === "/api/public/categories?format=tree") return categoryTree;
      if (path === "/api/products") return publicProducts;
      if (path === "/api/public/collections") return [];
      if (path === "/api/public/navigation/main") return navigation;
      throw new Error(`Beklenmeyen yol: ${path}`);
    },
  };

  const catalog = await createCatalogAdapter(http).load();
  configureRuntimeCatalog(catalog);

  assert.deepEqual(getVisibleRoots().map((category) => category.name), ["Erkek", "Kadın"]);
  assert.deepEqual(getVisibleProducts().map((product) => product.id), [202, 101]);
  assert.deepEqual(getProductsForCategory("11").map((product) => product.id), [101]);
  assert.deepEqual(getProductsForCategory("21").map((product) => product.id), [202]);
  assert.equal(resolveCategoryPath("kadin/giyim")?.id, "11");
  assert.equal(getVisibleProducts().some((product) => product.id === 303), false, "Çift adlı legacy kategori yanlış dala bağlanmamalı");
});

test("catalog adapter bozuk sayısal ürün alanlarını güvenli varsayılanlara sınırlar", async () => {
  const malformed = {
    id: 404,
    name: "Bozuk Sayısal Kayıt",
    price: "geçersiz",
    old_price: "geçersiz",
    stock: "geçersiz",
    average_rating: 99,
    review_count: -12,
    categoryIds: [21],
    primaryCategoryId: 21,
  };
  const catalog = await createCatalogAdapter({
    request: async (path) => {
      if (path === "/api/public/categories?format=tree") return categoryTree;
      if (path === "/api/products") return [malformed, { ...malformed, id: 405, name: "" }];
      if (path === "/api/public/collections") return [];
      if (path === "/api/public/navigation/main") return { code: "main", items: [] };
      throw new Error(`Beklenmeyen yol: ${path}`);
    },
  }).load();
  const product = catalog.products[0];
  assert.equal(catalog.products.length, 1, "adı olmayan public ürün satırı render edilmemeli");
  assert.equal(product.price, 0);
  assert.equal(product.oldPrice, null);
  assert.equal(product.stock, 0);
  assert.equal(product.rating, 5);
  assert.equal(product.reviews, 0);
});

test("navigasyon yalnız 404 durumunda gerçek public kategori ağacına düşer", async () => {
  const makeHttp = (navigationError) => ({
    request: async (path) => {
      if (path === "/api/public/categories?format=tree") return categoryTree;
      if (path === "/api/products") return publicProducts.slice(0, 2);
      if (path === "/api/public/collections") return [];
      if (path === "/api/public/navigation/main") throw navigationError;
      throw new Error(`Beklenmeyen yol: ${path}`);
    },
  });

  const fallback = await createCatalogAdapter(makeHttp({ status: 404 })).load();
  assert.equal(fallback.navigation.source, "public-categories");
  assert.deepEqual(fallback.navigation.items.map((item) => item.title), ["Kadın", "Erkek"]);

  await assert.rejects(
    () => createCatalogAdapter(makeHttp({ status: 500, message: "down" })).load(),
    { status: 500 },
  );
});

test("opsiyonel koleksiyon kesintisi ana kategori ve ürün kataloğunu düşürmez", async () => {
  const baseRequest = async (path) => {
    if (path === "/api/public/categories?format=tree") return categoryTree;
    if (path === "/api/products") return publicProducts.slice(0, 2);
    if (path === "/api/public/navigation/main") return { code: "main", items: [] };
    throw new Error(`Beklenmeyen yol: ${path}`);
  };
  const detailFailure = await createCatalogAdapter({
    request: async (path) => {
      if (path === "/api/public/collections") return [{ slug: "vitrin", show_on_home: true }];
      if (path === "/api/public/collections/vitrin?page=1&limit=8") throw Object.assign(new Error("geçici kesinti"), { status: 503 });
      return baseRequest(path);
    },
  }).load();
  assert.deepEqual(detailFailure.products.map((product) => product.id), [101, 202]);
  assert.deepEqual(detailFailure.collectionDetails, []);
  assert.deepEqual(detailFailure.warnings, ["Bazı ana sayfa koleksiyon ayrıntıları şu anda alınamıyor."]);

  const listFailure = await createCatalogAdapter({
    request: async (path) => {
      if (path === "/api/public/collections") throw Object.assign(new Error("geçici kesinti"), { status: 503 });
      return baseRequest(path);
    },
  }).load();
  assert.deepEqual(listFailure.products.map((product) => product.id), [101, 202]);
  assert.deepEqual(listFailure.collections, []);
  assert.deepEqual(listFailure.warnings, ["Ana sayfa koleksiyonları şu anda alınamıyor."]);
});

test("ürün detay adapterı public attribute değerlerini gerçek PDP alanlarına taşır", async () => {
  const requests = [];
  const http = {
    request: async (path) => {
      requests.push(path);
      return {
        id: 202,
        name: "Erkek Gömlek",
        description: "Pamuklu gömlek",
        price: 900,
        stock: 4,
        categoryIds: [21],
        primaryCategoryId: 21,
        attributes: [
          { code: "marka", name: "Marka", type: "text", value: "Nova Atelier" },
          { code: "renk", name: "Renk", type: "option", value: { value: "lacivert", label: "Lacivert" } },
          { code: "olcu", name: "Ölçü", type: "range", unit: "cm", value: { min: 70, max: 74 } },
        ],
      };
    },
  };
  const adapter = createCatalogAdapter(http);
  const catalog = {
    categories: [
      { id: "2", name: "Erkek", slug: "erkek", path: "erkek", parentId: null },
      { id: "21", name: "Giyim", slug: "erkek-giyim", path: "erkek/giyim", parentId: "2" },
    ],
    products: [{ id: 202, rating: 4.7, reviews: 12, featuredRank: 7, collectionSlugs: ["yeni-gelenler"] }],
    collectionDetails: [],
  };

  const detail = await adapter.loadProduct(202, { catalog });
  assert.deepEqual(requests, ["/api/products/202"]);
  assert.equal(detail.brand, "Nova Atelier");
  assert.equal(detail.color, "Lacivert");
  assert.equal(detail.featuredRank, 7);
  assert.equal(detail.rating, 4.7);
  assert.equal(detail.reviews, 12);
  assert.deepEqual(detail.collectionSlugs, ["yeni-gelenler"]);
  assert.ok(detail.features.includes("Ölçü: 70–74 cm"));
});

test("koleksiyon adapterı yalnız katalogda doğrulanmış ürünleri gerçek koleksiyon sırasıyla döndürür", async () => {
  const http = {
    request: async (path) => {
      assert.equal(path, "/api/public/collections/yeni?page=1&limit=100");
      return {
        collection: { id: 4, name: "Yeni Gelenler", slug: "yeni" },
        products: [
          { id: 202, name: "Güncel Gömlek", price: 850, old_price: 950, stock: 3, image_url: "/new-shirt.webp" },
          { id: 999, name: "Katalog dışı", price: 50, stock: 1 },
        ],
        pagination: { page: 1, total: 2 },
      };
    },
  };
  const adapter = createCatalogAdapter(http);
  const detail = await adapter.loadCollection("yeni", {
    catalog: {
      products: [{
        id: 202,
        name: "Erkek Gömlek",
        price: 900,
        oldPrice: null,
        stock: 4,
        imageUrl: "/shirt.webp",
        collectionSlugs: [],
      }],
    },
  });
  assert.equal(detail.collection.name, "Yeni Gelenler");
  assert.deepEqual(detail.products.map((product) => product.id), [202]);
  assert.equal(detail.products[0].price, 850);
  assert.equal(detail.products[0].imageUrl, "/new-shirt.webp");
  assert.deepEqual(detail.products[0].collectionSlugs, ["yeni"]);
});

test("favorites adapter mevcut state owner dışında yeni sahip oluşturmaz", async () => {
  assert.throws(() => createFavoritesAdapter({ root: {} }), /NovaStoreFavorites sözleşmesi hazır değil/);

  const calls = [];
  const root = {
    NovaStoreFavorites: {
      loadFavoriteIds: async () => [101, 202, 999, "bozuk"],
      setFavorite: async (id, value) => calls.push([id, value]),
      reportError: () => {},
      isAuthenticated: () => false,
    },
  };
  const adapter = createFavoritesAdapter({ root });
  const ids = await adapter.load({ allowedProductIds: new Set([101, 202]) });
  assert.deepEqual([...ids], [101, 202]);
  await adapter.set(101, true);
  assert.deepEqual(calls, [[101, true]]);
  await assert.rejects(() => adapter.set("invalid", true), /Geçersiz ürün kimliği/);
});

test("cart adapter guest, authenticated ve checkout handoff sözleşmelerini korur", async () => {
  const storage = createStorage({
    nova_user_info: JSON.stringify({ id: 7 }),
    novastore_cart_7: JSON.stringify([
      { productId: 101, quantity: 2 },
      { productId: 999, quantity: 4 },
    ]),
  });
  const calls = { hydrate: 0, saveCart: [], saveCheckout: [], assigned: [], events: [] };
  let authenticated = false;
  const normalize = (items) => Array.isArray(items) ? items : [];
  const owner = {
    isAuthenticated: () => authenticated,
    hydrateCart: async () => { calls.hydrate += 1; },
    saveCart: async (items) => { calls.saveCart.push(items); },
    saveCheckout: async (payload) => { calls.saveCheckout.push(payload); },
    writeCartLocal: (items) => {
      storage.setItem("novastore_cart_7", JSON.stringify(items));
      return items;
    },
    normalizeCartItems: normalize,
    reportError: () => {},
  };
  const products = new Map([
    [101, { id: 101, name: "Kadın Elbise", price: 1200, oldPrice: null, imageUrl: "/dress.webp", stock: 3 }],
    [202, { id: 202, name: "Erkek Gömlek", price: 900, oldPrice: 1000, imageUrl: "/shirt.webp", stock: 4 }],
  ]);
  const root = {
    localStorage: storage,
    NovaStoreSharedState: owner,
    dispatchEvent: (event) => calls.events.push(event.type),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const adapter = createCartAdapter({
    root,
    storage,
    location: { assign: (path) => calls.assigned.push(path) },
    getProduct: (id) => products.get(Number(id)) || null,
  });

  assert.deepEqual(await adapter.load({ allowedProductIds: new Set(products.keys()) }), [{ productId: 101, quantity: 2 }]);
  assert.equal(calls.hydrate, 1);
  const guestResult = await adapter.persist([{ productId: 101, quantity: 9 }]);
  assert.equal(guestResult.remoteSaved, false);
  assert.equal(guestResult.items[0].quantity, 3, "Sepet miktarı gerçek stokla sınırlandırılmalı");
  assert.deepEqual(calls.saveCart, []);

  authenticated = true;
  await adapter.persist([{ productId: 202, quantity: 2 }]);
  assert.equal(calls.saveCart.length, 1);
  await assert.rejects(
    () => adapter.handoffToCheckout([{ productId: 202, quantity: 5 }]),
    /güncel stokla uyuşmuyor/,
  );
  await adapter.handoffToCheckout([{ productId: 202, quantity: 1 }]);
  assert.equal(calls.saveCheckout.length, 1);
  assert.deepEqual(calls.assigned, ["#/odeme/teslimat"]);
  assert.ok(calls.events.includes("novastore:shared-cart-updated"));
});

test("cart adapter giriş sonrası hesap ve misafir sepetini kayıpsız birleştirir", async () => {
  const storage = createStorage({
    nova_user_token: "customer-token",
    nova_user_info: JSON.stringify({ id: 7 }),
    novastore_cart_guest: JSON.stringify([{ id: 101, name: "Elbise", price: 1200, quantity: 2 }]),
    novastore_cart_7: JSON.stringify([{ id: 202, name: "Gömlek", price: 900, quantity: 1 }]),
  });
  const products = new Map([
    [101, { id: 101, name: "Elbise", price: 1200, oldPrice: null, imageUrl: "/dress.webp", stock: 3 }],
    [202, { id: 202, name: "Gömlek", price: 900, oldPrice: null, imageUrl: "/shirt.webp", stock: 4 }],
  ]);
  const saves = [];
  const owner = {
    isAuthenticated: () => true,
    hydrateCart: async () => {},
    saveCart: async (items) => saves.push(items),
    saveCheckout: async () => {},
    writeCartLocal: (items) => {
      storage.setItem("novastore_cart_7", JSON.stringify(items));
      return items;
    },
    normalizeCartItems: (items) => Array.isArray(items) ? items : [],
    reportError: () => {},
  };
  const adapter = createCartAdapter({
    root: {
      localStorage: storage,
      NovaStoreSharedState: owner,
      dispatchEvent: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    storage,
    getProduct: (id) => products.get(Number(id)) || null,
  });
  const merged = await adapter.refreshAfterAuthentication(
    [{ productId: 101, quantity: 2 }],
    { allowedProductIds: new Set(products.keys()) },
  );
  assert.deepEqual(merged, [
    { productId: 202, quantity: 1 },
    { productId: 101, quantity: 2 },
  ]);
  assert.equal(saves.length, 1);
  assert.equal(storage.getItem("novastore_cart_guest"), null);
});

test("auth adapter /api/users/me response zarfını açar ve güvenli sayfalara aktarır", async () => {
  const storage = createStorage({
    nova_user_token: "valid",
    nova_user_info: JSON.stringify({ id: 7, fullName: "Yerel Ad", email: "yerel@example.test" }),
  });
  const assigned = [];
  const adapter = createAuthAdapter({
    storage,
    location: { assign: (path) => assigned.push(path) },
    http: {
      request: async () => ({ user: { id: 7, fullName: "Doğrulanmış Ad", email: "dogru@example.test", role: "customer" } }),
    },
  });

  const session = await adapter.load();
  assert.equal(session.status, "authenticated");
  assert.equal(session.user.fullName, "Doğrulanmış Ad");
  adapter.openAccount(session);
  adapter.openAccount({ status: "guest" });
  assert.deepEqual(assigned, ["#/hesabim", "#/giris"]);
  assert.equal(JSON.parse(storage.getItem("nova_user_info")).fullName, "Doğrulanmış Ad");
});

test("commerce runtime gerçek adapterları tek katalog, favori ve sepet durumunda birleştirir", async () => {
  const storage = createStorage({
    novastore_cart_guest: JSON.stringify([{ productId: 202, quantity: 1 }]),
  });
  const eventListeners = new Map();
  const root = {
    localStorage: storage,
    location: { origin: "https://novastore.tr", assign: () => {} },
    fetch: async (path) => {
      let payload;
      if (path === "/api/public/categories?format=tree") payload = categoryTree;
      else if (path === "/api/products") payload = publicProducts.slice(0, 2);
      else if (path === "/api/public/collections") payload = [];
      else if (path === "/api/public/navigation/main") payload = { code: "main", items: [] };
      else throw new Error(`Beklenmeyen runtime yolu: ${path}`);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    NovaStoreFavorites: {
      loadFavoriteIds: async () => [202],
      setFavorite: async () => {},
      reportError: () => {},
      isAuthenticated: () => false,
    },
    NovaStoreSharedState: {
      isAuthenticated: () => false,
      hydrateCart: async () => {},
      saveCart: async () => {},
      saveCheckout: async () => {},
      writeCartLocal: (items) => items,
      normalizeCartItems: (items) => items,
      reportError: () => {},
    },
    dispatchEvent: () => {},
    addEventListener: (name, listener) => eventListeners.set(name, listener),
    removeEventListener: (name) => eventListeners.delete(name),
  };

  const runtime = await createCommerceRuntime({ root }).initialize();
  assert.equal(runtime.session.status, "guest");
  assert.deepEqual([...runtime.favorites.initialIds], [202]);
  assert.deepEqual(runtime.cart.initialItems, [{ productId: 202, quantity: 1 }]);
  assert.deepEqual(runtime.catalog.products.map((product) => product.id), [202, 101]);
  assert.equal(typeof runtime.catalog.loadProduct, "function");
  assert.equal(typeof runtime.catalog.loadCollection, "function");
  assert.equal(typeof runtime.cart.handoffToCheckout, "function");
  assert.equal(typeof runtime.customer.login, "function");
  assert.equal(typeof runtime.customer.listOrders, "function");
  assert.equal(typeof runtime.checkout.quote, "function");
  assert.equal(typeof runtime.community.load, "function");
  assert.equal(typeof runtime.assistant.chat, "function");
  assert.equal(typeof runtime.refreshCustomerState, "function");
});

test("customer HTTP yöntem, rota, sorgu ve müşteri token sınırlarını birlikte uygular", async () => {
  assert.deepEqual(
    normalizeCustomerApiRequest("/api/addresses/12/default", "PATCH", "https://novastore.tr"),
    { path: "/api/addresses/12/default", method: "PATCH", authenticated: true },
  );
  assert.deepEqual(
    normalizeCustomerApiRequest("/api/payments/status?paymentRef=ref-1&orderId=7", "GET", "https://novastore.tr"),
    { path: "/api/payments/status?paymentRef=ref-1&orderId=7", method: "GET", authenticated: true },
  );
  assert.deepEqual(
    normalizeCustomerApiRequest("/api/reviews/product/202", "GET", "https://novastore.tr"),
    { path: "/api/reviews/product/202", method: "GET", authenticated: "optional" },
  );
  assert.deepEqual(
    normalizeCustomerApiRequest("/api/assistant/chat", "POST", "https://novastore.tr"),
    { path: "/api/assistant/chat", method: "POST", authenticated: "optional" },
  );

  for (const [path, method] of [
    ["/api/admin/orders", "GET"],
    ["https://evil.example/api/addresses", "GET"],
    ["/api/addresses?role=admin", "GET"],
    ["/api/users/login", "GET"],
    ["/api/payments/status?paymentRef=x&orderId=1&debug=1", "GET"],
  ]) {
    assert.throws(
      () => normalizeCustomerApiRequest(path, method, "https://novastore.tr"),
      CustomerHttpError,
      `${method} ${path}`,
    );
  }

  const storage = createStorage({
    nova_user_token: "customer-token",
    nova_user_info: JSON.stringify({ id: 7 }),
    nova_admin_token: "admin-remains",
  });
  const requests = [];
  const http = createCustomerHttp({
    storage,
    origin: "https://novastore.tr",
    fetchImpl: async (path, options) => {
      requests.push({ path, options });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await http.request("/api/users/login", { method: "POST", body: { email: "a@b.test", password: "secret" } });
  await http.request("/api/addresses");
  await http.request("/api/reviews/product/202");
  await http.request("/api/assistant/chat", { method: "POST", body: { message: "Gömlek öner" } });
  assert.equal(requests[0].options.headers.Authorization, undefined, "public auth isteği müşteri tokenı taşımamalı");
  assert.equal(requests[1].options.headers.Authorization, "Bearer customer-token");
  assert.equal(requests[1].options.credentials, "same-origin");
  assert.equal(requests[2].options.headers.Authorization, "Bearer customer-token", "opsiyonel yorum uygunluğu mevcut müşteri tokenını kullanmalı");
  assert.equal(requests[3].options.headers.Authorization, "Bearer customer-token", "opsiyonel NovaBot isteği mevcut müşteri tokenını kullanmalı");
  assert.equal(storage.getItem("nova_admin_token"), "admin-remains");
});

test("NovaBot adapterı yalnız canlı katalog ürünlerini ve onaylı eylemleri kabul eder", async () => {
  const calls = [];
  const products = new Map([
    [202, { id: 202, name: "Erkek Gömlek", slug: "erkek-gomlek", price: 900, stock: 4 }],
    [303, { id: 303, name: "Tükenen Mont", slug: "tukenen-mont", price: 1800, stock: 0 }],
  ]);
  const http = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === "/api/assistant/chat") return {
        reply: "Gömlek canlı katalogda stokta.",
        cards: [
          { productId: 202, name: "Sunucudan değiştirilemez ad" },
          { productId: 999, name: "Katalog dışı ürün" },
        ],
        suggestions: ["Sepete ekle", "Sepete ekle", "Karşılaştır"],
        requiresConfirmation: true,
        pendingAction: { type: "add_to_cart", productId: 202, quantity: 99 },
      };
      if (path === "/api/assistant/escalate") return { message: "Destek kaydı açıldı." };
      throw new Error(`Beklenmeyen NovaBot yolu: ${path}`);
    },
  };
  const adapter = createAssistantAdapter({
    http,
    getProduct: (id) => products.get(Number(id)) || null,
  });
  const response = await adapter.chat({
    message: "\u0000 Gömlek öner ",
    history: Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 ? "assistant" : "user",
      message: `Mesaj ${index + 1}`,
    })),
  });
  assert.deepEqual(response.products.map((product) => product.id), [202]);
  assert.equal(response.products[0].name, "Erkek Gömlek", "ürün içeriği yalnız canlı katalogdan gelmeli");
  assert.deepEqual(response.suggestions, ["Sepete ekle", "Karşılaştır"]);
  assert.deepEqual(response.pendingAction, { type: "add_to_cart", productId: 202, quantity: 4 });
  const chatCall = calls.find((call) => call.path === "/api/assistant/chat");
  assert.equal(chatCall.options.body.message, "Gömlek öner");
  assert.equal(chatCall.options.body.history.length, 10);
  assert.equal(chatCall.options.body.history[0].message, "Mesaj 3");
  await adapter.escalate("Müşteri teslimat tarihi hakkında canlı destek istedi.");
  const escalationCall = calls.find((call) => call.path === "/api/assistant/escalate");
  assert.deepEqual(escalationCall.options.body, {
    summary: "Müşteri teslimat tarihi hakkında canlı destek istedi.",
  });
  await assert.rejects(() => adapter.escalate("kısa"), /biraz daha ayrıntı/);
});

test("NovaBot stokta olmayan ürünü sepete ekleme eylemine dönüştürmez ve misafir sohbete izin verir", async () => {
  const storage = createStorage();
  const requests = [];
  const customerHttp = createCustomerHttp({
    storage,
    origin: "https://novastore.tr",
    fetchImpl: async (path, options) => {
      requests.push({ path, options });
      return new Response(JSON.stringify({
        reply: "Ürün tükendi.",
        requiresConfirmation: true,
        pendingAction: { type: "add_to_cart", productId: 303, quantity: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const adapter = createAssistantAdapter({
    http: customerHttp,
    getProduct: (id) => Number(id) === 303
      ? { id: 303, name: "Tükenen Mont", slug: "tukenen-mont", price: 1800, stock: 0 }
      : null,
  });
  const response = await adapter.chat({ message: "Bu ürünü sepete ekle" });
  assert.equal(response.pendingAction, null);
  assert.equal(requests[0].options.headers.Authorization, undefined);
});

test("ürün topluluk adapterı gerçek yorum ve soruları normalize eder, yazma sınırlarını korur", async () => {
  const calls = [];
  const http = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === "/api/reviews/product/202") return {
        reviews: [{
          id: 8,
          rating: 4,
          comment: "Kalıbı ve kumaşı iyi.",
          full_name: "N*** M***",
          created_at: "2026-07-14T12:00:00.000Z",
          media: [
            { id: 1, media_url: "/review.webp", media_type: "image", sort_order: 1 },
            { id: 2, media_url: "javascript:alert(1)", media_type: "image", sort_order: 0 },
          ],
        }, { id: 0, rating: 5, comment: "Geçersiz kayıt" }],
        average: "4.0",
        totalReviews: 1,
        reviewPermission: { canReview: true, requiresAuth: false, code: "ELIGIBLE", message: null },
      };
      if (path === "/api/questions/product/202") return [{
        id: 6,
        question: "Ürün dar kalıp mı?",
        answer: "Standart kalıptır.",
        user_name: "A*** K***",
        status: "answered",
      }, { id: null, question: "Geçersiz soru" }];
      if (path === "/api/reviews") return { mesaj: "Değerlendirme eklendi." };
      if (path === "/api/questions/ask") return { mesaj: "Soru iletildi." };
      throw new Error(`Beklenmeyen topluluk yolu: ${path}`);
    },
  };
  const adapter = createProductCommunityAdapter({ http });
  const detail = await adapter.load(202);
  assert.equal(detail.average, 4);
  assert.equal(detail.permission.canReview, true);
  assert.equal(detail.reviews.length, 1, "bozuk yorum satırı sağlam topluluk verisini düşürmemeli");
  assert.equal(detail.reviews[0].media.length, 1, "güvensiz medya URL'si elenmeli");
  assert.equal(detail.questions.length, 1, "bozuk soru satırı sağlam topluluk verisini düşürmemeli");
  assert.equal(detail.questions[0].status, "answered");
  await adapter.addReview(202, { rating: 5, comment: "Çok iyi" });
  await adapter.askQuestion(202, "Garanti süresi nedir?");
  const reviewCall = calls.find((call) => call.path === "/api/reviews");
  assert.deepEqual(reviewCall.options.body, { productId: 202, rating: 5, comment: "Çok iyi" });
  const questionCall = calls.find((call) => call.path === "/api/questions/ask");
  assert.deepEqual(questionCall.options.body, { product_id: 202, question: "Garanti süresi nedir?" });
  await assert.rejects(() => adapter.addReview(202, { rating: 6 }), /1 ile 5/);
  await assert.rejects(() => adapter.askQuestion(202, "x"), /5 ile 1000/);
});

test("ürün topluluk adapterı tek public kaynak aksadığında diğer gerçek bölümü korur", async () => {
  const adapter = createProductCommunityAdapter({
    http: {
      request: async (path) => {
        if (path.startsWith("/api/reviews/")) throw Object.assign(new Error("yorum servisi geçici olarak kapalı"), { status: 503 });
        return [{ id: 5, question: "Stok yenilenir mi?", answer: null, status: "pending" }];
      },
    },
  });
  const detail = await adapter.load(202);
  assert.equal(detail.reviews.length, 0);
  assert.equal(detail.questions.length, 1);
  assert.deepEqual(detail.warnings, ["Değerlendirmeler şu anda alınamıyor."]);
});

test("customer hesap adapterı gerçek oturum, sipariş, adres ve çıkış sözleşmesini normalize eder", async () => {
  const storage = createStorage({ nova_admin_token: "must-remain" });
  const calls = [];
  const http = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === "/api/users/login") return {
        token: "customer-token",
        user: { id: 7, full_name: "Nova Müşteri", email: "musteri@example.test", role: "customer" },
      };
      if (path === "/api/orders/user/7") return [
        {
          id: 91,
          display_status: "Hazırlanıyor",
          total_amount: "1499.90",
          items: JSON.stringify([{ id: 202, name: "Gömlek", price: 749.95, quantity: 2, image: "javascript:alert(1)" }]),
          created_at: "2026-07-15T10:00:00.000Z",
        },
        {
          id: 92,
          display_status: "Kargoya Verildi",
          total_amount: "900",
          items: JSON.stringify([{ id: 202, name: "Gömlek", price: 900, quantity: 1 }]),
          created_at: "2026-07-14T10:00:00.000Z",
        },
      ];
      if (path === "/api/addresses") return [{
        id: 4,
        title: "Ev",
        fullName: "Nova Müşteri",
        phone: "05555555555",
        city: "İstanbul",
        district: "Kadıköy",
        addressLine: "Örnek Mahallesi",
        isDefault: true,
      }];
      if (path === "/api/orders/91/cancel") return { mesaj: "Sipariş iptal edildi." };
      throw new Error(`Beklenmeyen hesap yolu: ${path}`);
    },
  };
  const adapter = createCustomerAccountAdapter({ http, storage, eventTarget: { dispatchEvent: () => {} } });
  const session = await adapter.login({ email: "musteri@example.test", password: "Password1" });
  assert.equal(session.user.fullName, "Nova Müşteri");
  assert.equal(storage.getItem("nova_user_token"), "customer-token");
  const orders = await adapter.listOrders(session);
  assert.equal(orders[0].items[0].quantity, 2);
  assert.equal(orders[0].items[0].image, "", "sipariş medyası güvenli URL sınırından geçmeli");
  assert.equal(orders[0].cancellable, true);
  assert.equal(orders[0].total, 1499.9);
  assert.equal(orders[1].cancellable, false, "kargoya verilmiş sipariş backend durum makinesine göre iptal edilemez");
  const addresses = await adapter.listAddresses();
  assert.equal(addresses[0].singleLine, "Örnek Mahallesi, Kadıköy, İstanbul");
  await adapter.cancelOrder(orders[0], { reasonCode: "CUSTOMER_REQUEST" });
  const cancelCall = calls.find((call) => call.path === "/api/orders/91/cancel");
  assert.equal(cancelCall.options.body.expected_status, "Hazırlanıyor");
  adapter.logout();
  assert.equal(storage.getItem("nova_user_token"), null);
  assert.equal(storage.getItem("nova_admin_token"), "must-remain");
});

test("customer hesap adapterı eski yerel adresleri bir kez ve kopyasız biçimde backend'e taşır", async () => {
  const storage = createStorage({
    nova_user_token: "customer-token",
    nova_user_info: JSON.stringify({ id: 7, fullName: "Nova Müşteri", email: "musteri@example.test", phone: "05555555555" }),
    novastore_addresses_7: JSON.stringify([
      {
        title: "Ev",
        city: "İstanbul",
        district: "Kadıköy",
        detail: "Nova Sokak 7",
        isDefault: true,
      },
      {
        title: "Aynı adres",
        fullName: "Nova Müşteri",
        phone: "0555 555 55 55",
        city: "İstanbul",
        district: "Kadıköy",
        addressLine: "Nova Sokak 7",
      },
    ]),
  });
  const remote = [];
  const calls = [];
  const http = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (path !== "/api/addresses") throw new Error(`Beklenmeyen adres yolu: ${path}`);
      if (options.method === "POST") {
        const created = { id: 14, ...options.body, isDefault: true };
        remote.push(created);
        return created;
      }
      return remote;
    },
  };
  const adapter = createCustomerAccountAdapter({ http, storage, eventTarget: { dispatchEvent: () => {} } });
  const migrated = await adapter.listAddresses();
  assert.equal(migrated.length, 1);
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1, "aynı fiziksel adres iki kez oluşturulmamalı");
  assert.deepEqual(calls.find((call) => call.options.method === "POST").options.body, {
    title: "Ev",
    fullName: "Nova Müşteri",
    phone: "05555555555",
    city: "İstanbul",
    district: "Kadıköy",
    addressLine: "Nova Sokak 7",
    isDefault: true,
  });
  assert.equal(storage.getItem("novastore_addresses_migrated_7"), "1");
  assert.equal(storage.getItem("novastore_addresses_7"), null);

  await adapter.listAddresses();
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1, "tamamlanan aktarım yeniden çalışmamalı");
});

test("checkout adapterı sunucu fiyatını kullanır, kart verisi toplamaz ve PayTR handoffunu sınırlar", async () => {
  const storage = createStorage({
    nova_user_token: "customer-token",
    nova_user_info: JSON.stringify({ id: 7, fullName: "Nova Müşteri", email: "musteri@example.test" }),
  });
  const sessionStorage = createStorage();
  const assigned = [];
  const calls = [];
  const http = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === "/api/campaigns/quote") return {
        totals: { currency: "TRY", subtotal: 900, bundleDiscount: 0, couponDiscount: 100, shippingFee: 49.9, total: 849.9 },
        coupon: { applied: true, code: "REAL100", discountAmount: 100 },
        campaigns: { freeShippingApplied: false },
        items: [],
      };
      if (path === "/api/payments/initialize") return {
        orderId: 44,
        paymentRef: "NST-PAYTR-44-safe",
        paymentAction: {
          type: "iframe",
          token: "safe-token",
          iframeUrl: "https://www.paytr.com/odeme/guvenli/safe-token",
          successUrl: "https://novastore.tr/payment-result.html",
          failUrl: "https://novastore.tr/payment-result.html",
        },
      };
      throw new Error(`Beklenmeyen checkout yolu: ${path}`);
    },
  };
  const root = { NovaAnalytics: { getSessionId: () => "analytics-session" } };
  const adapter = createCheckoutAdapter({
    http,
    root,
    storage,
    sessionStorage,
    location: { origin: "https://novastore.tr", assign: (path) => assigned.push(path) },
  });
  const items = [{ product: { id: 202, name: "Gömlek", imageUrl: "/shirt.webp" }, quantity: 1 }];
  const quote = await adapter.quote(items, "REAL100");
  assert.equal(quote.totals.total, 849.9);
  assert.throws(
    () => normalizeQuote({ totals: { currency: "TRY", subtotal: "bozuk", total: 10 } }),
    /ara toplam alanı geçersiz/,
  );
  assert.throws(
    () => normalizeQuote({ totals: { currency: "USD", subtotal: 10, total: 10 } }),
    /para birimi TRY/,
  );
  const session = { status: "authenticated", user: { id: 7, fullName: "Nova Müşteri", email: "musteri@example.test" } };
  const result = await adapter.initialize({
    session,
    address: {
      title: "Ev",
      fullName: "Nova Müşteri",
      phone: "05555555555",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Örnek Mahallesi",
    },
    items,
    couponCode: "REAL100",
  });
  await adapter.initialize({
    session: { ...session, status: "unverified" },
    address: {
      title: "Ev",
      fullName: "Nova Müşteri",
      phone: "05555555555",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "Örnek Mahallesi",
    },
    items,
    couponCode: "REAL100",
  });
  await assert.rejects(() => adapter.initialize({
    session: { status: "guest", user: null },
    address: {},
    items,
  }), /müşteri oturumu/);
  const initializeBody = calls.find((call) => call.path === "/api/payments/initialize").options.body;
  assert.equal(initializeBody.paymentMethod, "card");
  assert.equal(initializeBody.analyticsSessionKey, "analytics-session");
  for (const forbidden of ["cardNumber", "cardCvv", "expiry", "cvv"]) {
    assert.equal(Object.hasOwn(initializeBody, forbidden), false);
  }
  const handoffPath = adapter.handoff(result, items);
  assert.match(handoffPath, /^\/paytr-checkout\.html\?/);
  assert.deepEqual(assigned, [handoffPath]);
  assert.ok(sessionStorage.getItem("novastore.paytrCheckout.NST-PAYTR-44-safe"));
  assert.equal(
    JSON.parse(sessionStorage.getItem("novastore.paytrCheckout.NST-PAYTR-44-safe")).storefrontEntry,
    "/index.html",
  );
  const purchased = adapter.consumeFinalizedCheckout({ orderId: 44, paymentRef: "NST-PAYTR-44-safe" });
  assert.deepEqual(purchased, [{ productId: 202, quantity: 1 }]);
  assert.deepEqual(
    reconcileFinalizedCart([
      { productId: 202, quantity: 3 },
      { productId: 303, quantity: 2 },
    ], purchased),
    [
      { productId: 202, quantity: 2 },
      { productId: 303, quantity: 2 },
    ],
    "ödeme sonrasında yalnız satın alınan adet düşülmeli",
  );
  assert.equal(storage.getItem("novastore_pending_checkout_7"), null);

  const redirectResult = {
    orderId: 45,
    paymentRef: "NST-IYZICO-45-safe",
    paymentAction: {
      action: {
        type: "REDIRECT",
        successUrl: "https://novastore.tr/payment-result.html?status=success&paymentRef=NST-IYZICO-45-safe&orderId=45",
        failUrl: "https://novastore.tr/payment-result.html?status=failed&paymentRef=NST-IYZICO-45-safe&orderId=45",
      },
    },
  };
  const redirectPath = adapter.handoff(redirectResult, items);
  assert.match(redirectPath, /^\/payment-result\.html\?/);
  assert.equal(
    JSON.parse(sessionStorage.getItem("novastore.paytrCheckout.NST-IYZICO-45-safe")).storefrontEntry,
    "/index.html",
    "aynı-origin redirect ödeme sonucu da Commerce Pro dönüş bilgisini korumalı",
  );
  assert.deepEqual(
    adapter.consumeFinalizedCheckout({ orderId: 45, paymentRef: "NST-IYZICO-45-safe" }),
    [{ productId: 202, quantity: 1 }],
  );
});
