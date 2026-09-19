import assert from "node:assert/strict";
import test from "node:test";
import { createCartV2Adapter, normalizeCartV2Response } from "../src/adapters/cartV2Adapter.js";
import { createCheckoutAdapter } from "../src/adapters/checkoutAdapter.js";
import { createCustomerHttp } from "../src/integration/customerHttp.js";
import { createCommerceRuntime } from "../src/integration/createCommerceRuntime.js";
import { cartEditedQuantity, cartIncreaseQuantity } from "../src/integration/cartQuantityPolicy.js";

const storage = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
};
const envelope = (items = [], revision = 0, migration = { status: "NONE", unresolvedItems: [] }) => ({
  key: "cart", exists: revision > 0, revision, payload: { cartSchemaVersion: 2, items: items.map((row) => ({ storeId: 71, ...row })) }, migration,
});
const line = (variantId, quantity = 1) => ({ productId: 501, variantId, quantity });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const setup = ({ initial = {}, items = [], revision = 0, request } = {}) => {
  const local = storage({ nova_user_info: JSON.stringify({ id: 7 }), nova_user_token: "account-7", novastore_cart_v2_imported_7: "1", ...initial });
  let remote = envelope(items, revision);
  const calls = [];
  const http = { request: async (path, options = {}) => {
    calls.push({ path, ...options });
    if (request) return request(path, options);
    if (options.method === "PUT") {
      if (options.body.expectedRevision !== remote.revision) throw Object.assign(new Error("conflict"), { code: "CART_REVISION_CONFLICT", status: 409 });
      remote = envelope(options.body.payload.items, remote.revision + 1, remote.migration);
      if (options.body.resolveLegacyProductIds) remote.migration = { status: "NONE", unresolvedItems: [] };
    }
    return structuredClone(remote);
  } };
  const adapter = createCartV2Adapter({ http, storage: local, root: {}, getProduct: (id) => ({ id, variantSelectionRequired: id === 501 }) });
  return { adapter, local, calls, remote: () => remote, change: (value) => { remote = value; } };
};

test("B03 V2 two variants survive canonical store identity, replace, reload and sibling removal", async () => {
  const f = setup();
  await f.adapter.load();
  const saved = await f.adapter.persist([line(901), line(902)]);
  assert.deepEqual(saved.items, [{ storeId: 71, ...line(901) }, { storeId: 71, ...line(902) }]);
  assert.equal(saved.remoteSaved, true);
  assert.deepEqual(await f.adapter.load(), saved.items);
  await f.adapter.persist([line(902)]);
  assert.deepEqual(f.remote().payload.items, [{ storeId: 71, ...line(902) }]);
  for (const call of f.calls) assert.equal(call.cartCapability, true);
});

test("B03 only exact duplicate variant merges; simple product has explicit null", async () => {
  const f = setup(); await f.adapter.load();
  await f.adapter.persist([line(901), line(901, 2), line(902), { productId: 502, quantity: 1 }]);
  assert.deepEqual(f.calls.at(-1).body.payload.items, [line(901, 3), line(902), { productId: 502, variantId: null, quantity: 1 }]);
  assert.equal(f.calls.at(-1).body.expectedRevision, 0);
});

test("B03 client preserves explicit store identity for server validation but strips display and price authority", async () => {
  const f = setup(); await f.adapter.load();
  await f.adapter.persist([{ ...line(901), storeId: 9999, price: 0.01, name: "FORGED", stock: 999999, cartKey: "forged" }]);
  assert.deepEqual(f.calls.at(-1).body.payload.items, [{ storeId: 9999, ...line(901) }]);
});

test("B03 stale CAS reloads canonical state and does not retry stale replacement", async () => {
  const f = setup({ items: [line(901)], revision: 1 }); await f.adapter.load();
  f.change(envelope([line(901), line(902)], 2));
  const events = []; f.adapter.subscribe((items) => events.push(items));
  await assert.rejects(f.adapter.persist([]), { code: "CART_REVISION_CONFLICT" });
  assert.equal(f.calls.filter((call) => call.method === "PUT").length, 1);
  assert.deepEqual(events.at(-1), [{ storeId: 71, ...line(901) }, { storeId: 71, ...line(902) }]);
  assert.deepEqual(f.remote().payload.items, events.at(-1));
});

test("B03 queued stale edits stop after prior CAS conflict rather than writing a fresh revision", async () => {
  const f = setup({ items: [line(901)], revision: 1 }); await f.adapter.load();
  f.change(envelope([line(901), line(902)], 2));
  const outcomes = await Promise.allSettled([f.adapter.persist([]), f.adapter.persist([line(901, 2)])]);
  assert.deepEqual(outcomes.map((r) => r.reason.code), ["CART_REVISION_CONFLICT", "CART_REVISION_CONFLICT"]);
  assert.equal(f.calls.filter((call) => call.method === "PUT").length, 1);
});

test("B03 successful local writes serialize revisions without last-write race", async () => {
  const f = setup(); await f.adapter.load();
  await Promise.all([f.adapter.persist([line(901)]), f.adapter.persist([line(901), line(902)])]);
  assert.deepEqual(f.calls.filter((c) => c.method === "PUT").map((c) => c.body.expectedRevision), [0, 1]);
});

test("B03 stale read with lower revision never overwrites accepted cache", async () => {
  const f = setup({ items: [line(901), line(902)], revision: 5 }); await f.adapter.load();
  f.change(envelope([line(901)], 4));
  await assert.rejects(f.adapter.load(), { code: "CART_STALE_RESPONSE" });
  assert.equal(JSON.parse(f.local.getItem("novastore_cart_v2_7")).items.length, 2);
});

test("B03 unknown server schema fails closed without changing saved bytes", async () => {
  const f = setup(); await f.adapter.load();
  const previous = f.local.getItem("novastore_cart_v2_7");
  const future = envelope([line(901)], 1); future.payload.cartSchemaVersion = 99; f.change(future);
  await assert.rejects(f.adapter.load(), { code: "CART_SCHEMA_UNSUPPORTED" });
  assert.equal(f.local.getItem("novastore_cart_v2_7"), previous);
});

test("B03 unknown account cache version is preserved and not silently downgraded", async () => {
  const raw = JSON.stringify({ cartSchemaVersion: 99, revision: 100, items: [line(901)] });
  const f = setup({ initial: { novastore_cart_v2_7: raw } });
  await assert.rejects(f.adapter.load(), { code: "CART_SCHEMA_UNSUPPORTED" });
  assert.equal(f.calls.length, 0);
  assert.equal(f.local.getItem("novastore_cart_v2_7"), raw);
});

test("B03 a stale request from a second adapter cannot overwrite another instance's newer cache", async () => {
  const gate = deferred(); const f = setup({ request: () => gate.promise });
  const pending = f.adapter.load(); await tick();
  const newer = { cartSchemaVersion: 2, revision: 7, items: [{ storeId: 71, ...line(901) }, { storeId: 71, ...line(902) }], migration: { status: "NONE", unresolvedItems: [] } };
  f.local.setItem("novastore_cart_v2_7", JSON.stringify(newer));
  gate.resolve(envelope([line(901)], 6));
  await assert.rejects(pending, { code: "CART_STALE_RESPONSE" });
  assert.deepEqual(JSON.parse(f.local.getItem("novastore_cart_v2_7")), newer);
});

test("B03 rejects malformed response store, revisions and duplicate canonical rows", () => {
  assert.throws(() => normalizeCartV2Response(envelope([{ ...line(901), storeId: null }])), { code: "CART_STORE_INVALID" });
  assert.throws(() => normalizeCartV2Response(envelope([], -1)), { code: "CART_RESPONSE_INVALID" });
  assert.throws(() => normalizeCartV2Response(envelope([line(901), line(901)])), { code: "CART_RESPONSE_INVALID" });
});

test("B03 principal switch during read cannot write either account cache", async () => {
  const gate = deferred(); const f = setup({ request: () => gate.promise });
  const pending = f.adapter.load(); await tick();
  f.local.setItem("nova_user_info", JSON.stringify({ id: 8 })); f.local.setItem("nova_user_token", "account-8");
  gate.resolve(envelope([line(901)], 1));
  await assert.rejects(pending, { code: "SHARED_STATE_PRINCIPAL_CHANGED" });
  assert.equal(f.local.getItem("novastore_cart_v2_7"), null); assert.equal(f.local.getItem("novastore_cart_v2_8"), null);
});

test("B03 switching accounts ignores former-account UI cart supplied to login refresh", async () => {
  const f = setup({ items: [line(902)], revision: 1 });
  f.local.setItem("nova_user_info", JSON.stringify({ id: 8 })); f.local.setItem("nova_user_token", "account-8");
  f.local.setItem("novastore_cart_v2_imported_8", "1");
  const result = await f.adapter.refreshAfterAuthentication([line(901)]);
  assert.deepEqual(result, [{ storeId: 71, ...line(902) }]);
  assert.equal(f.calls.some((call) => call.method === "PUT"), false);
});

test("B03 logout to guest leaves canonical account cache and server intact", async () => {
  const f = setup({ items: [line(901)], revision: 2 }); await f.adapter.load();
  const previous = f.local.getItem("novastore_cart_v2_7");
  f.local.removeItem("nova_user_info"); f.local.removeItem("nova_user_token");
  assert.deepEqual(await f.adapter.load(), []);
  assert.equal(f.local.getItem("novastore_cart_v2_7"), previous);
  assert.equal(f.calls.some((call) => call.method === "DELETE"), false);
  f.local.setItem("nova_user_info", JSON.stringify({ id: 7 })); f.local.setItem("nova_user_token", "account-7-relogin");
  assert.deepEqual(await f.adapter.load(), [{ storeId: 71, ...line(901) }]);
});

test("B03 guest tuple cart crosses login once and never collapses sibling variants", async () => {
  const f = setup({ items: [line(901)], revision: 1, initial: { novastore_cart_v2_guest: JSON.stringify({ cartSchemaVersion: 2, items: [line(901), line(902)] }) } });
  const result = await f.adapter.refreshAfterAuthentication();
  assert.deepEqual(result, [{ storeId: 71, ...line(901) }, { storeId: 71, ...line(902) }]);
  assert.equal(f.local.getItem("novastore_cart_v2_guest"), null);
  await f.adapter.refreshAfterAuthentication();
  assert.equal(f.calls.filter((c) => c.method === "PUT").length, 1);
});

test("B03 R24 account-local canonical variants import only once; old product row does not duplicate", async () => {
  const f = setup({ items: [line(901)], revision: 1, initial: {
    novastore_cart_v2_imported_7: "", novastore_variant_cart_7: JSON.stringify([line(901), line(902)]),
    novastore_cart_7: JSON.stringify([{ productId: 501, quantity: 2 }]),
  } });
  assert.equal((await f.adapter.load()).length, 2);
  await f.adapter.persist([line(902)]);
  assert.deepEqual(await f.adapter.load(), [{ storeId: 71, ...line(902) }]);
});

test("B03 ambiguous local rows stay explicit review records and never get invented variants", async () => {
  const f = setup({ initial: { novastore_cart_v2_imported_7: "", novastore_cart_7: JSON.stringify([{ productId: 501, quantity: 2 }]) } });
  assert.deepEqual(await f.adapter.load(), []);
  assert.deepEqual(f.adapter.getMigration().localItems, [{ productId: 501, variantId: null, quantity: 2 }]);
  assert.equal(f.calls.some((c) => c.method === "PUT"), false);
  await f.adapter.resolveLegacy(501, true);
  assert.deepEqual(f.adapter.getMigration().localItems, []);
});

test("B03 server pending legacy rows require an explicit acknowledgment with CAS", async () => {
  const f = setup({ items: [line(901)], revision: 1 });
  f.change(envelope([line(901)], 1, { status: "REVIEW_REQUIRED", unresolvedItems: [{ productId: 503, quantity: 1, reason: "VARIANT_REQUIRED" }] }));
  await f.adapter.load();
  assert.equal(f.adapter.getMigration().unresolvedItems.length, 1);
  await f.adapter.resolveLegacy(503);
  assert.deepEqual(f.calls.at(-1).body.resolveLegacyProductIds, [503]);
  assert.deepEqual(f.calls.at(-1).body.payload.items, [{ storeId: 71, ...line(901) }]);
});

test("B03 finalization sends only server verified order ID, preserves receipt retry semantics", async () => {
  const calls = []; let finalized = false;
  const f = setup({ request: async (path, options) => {
    calls.push({ path, ...options });
    if (path.endsWith("/finalize")) { finalized = true; return envelope([line(902)], 3); }
    return envelope([line(901), line(902)], 2);
  } });
  await f.adapter.load();
  assert.deepEqual(await f.adapter.finalize([line(999, 20)], { orderId: 100 }), [{ storeId: 71, ...line(902) }]);
  assert.equal(finalized, true);
  assert.deepEqual(calls.at(-1).body, { expectedRevision: 2, orderId: 100 });
});

test("B03 checkout snapshot uses V2 and independent checkout revision", async () => {
  const requests = [], assigned = [];
  const f = setup();
  const adapter = createCartV2Adapter({ storage: f.local, root: {}, location: { assign: (path) => assigned.push(path) }, http: { request: async (path, opts) => {
    requests.push({ path, ...opts });
    return envelope(opts.body?.payload?.items || [], path.endsWith("checkout") ? 9 : (opts.method === "PUT" ? 1 : 0));
  } } });
  await adapter.load(); await adapter.handoffToCheckout([line(901), line(902)]);
  assert.equal(requests.at(-1).body.expectedRevision, 9);
  assert.deepEqual(requests.at(-1).body.payload.items, [{ storeId: 71, ...line(901) }, { storeId: 71, ...line(902) }]);
  assert.deepEqual(assigned, ["#/odeme/teslimat"]);
});

test("B03 pending checkout remains until durable finalization success is consumed", () => {
  const local = storage({ nova_user_info: '{"id":7}', novastore_pending_checkout_7: JSON.stringify({ paymentRef: "p", orderId: 100, items: [{ product_id: 501, variant_id: 901, quantity: 1 }] }) });
  const checkout = createCheckoutAdapter({ storage: local, http: { request: async () => ({}) } });
  assert.deepEqual(checkout.consumeFinalizedCheckout({ orderId: 100, paymentRef: "p", consume: false }), [line(901)]);
  assert.ok(local.getItem("novastore_pending_checkout_7"));
  checkout.consumeFinalizedCheckout({ orderId: 100, paymentRef: "p" });
  assert.equal(local.getItem("novastore_pending_checkout_7"), null);
});

test("B03 actual customer HTTP gate sends fixed caps and refuses missing capability", async () => {
  const requests = [], local = storage({ nova_user_token: "private-customer-token" });
  const http = createCustomerHttp({ storage: local, origin: "http://localhost", fetchImpl: async (path, options) => {
    requests.push({ path, options }); return new Response(JSON.stringify(envelope()), { status: 200 });
  } });
  await assert.rejects(http.request("/api/shared-state/cart"), { code: "CART_CLIENT_UPGRADE_REQUIRED" });
  await http.request("/api/shared-state/cart", { cartCapability: true });
  assert.equal(requests[0].options.headers["X-Cart-Schema-Version"], "2");
  assert.equal(requests[0].options.headers["X-Cart-Variant-Line-Identity"], "true");
  assert.equal(requests[0].options.headers["X-Cart-CAS"], "true");
  assert.equal(requests[0].options.headers.Authorization, "Bearer private-customer-token");
  await assert.rejects(http.request("/api/shared-state/not-cart", { cartCapability: true }), { code: "CUSTOMER_PATH_FORBIDDEN" });
});

test("B03 removing available sibling keeps canonical store identity on an unavailable saved line", async () => {
  const f = setup({ items: [{ ...line(901), unavailable: true }, line(902)], revision: 5 });
  const items = await f.adapter.load();
  await f.adapter.persist(items.filter((item) => item.variantId !== 902));
  assert.deepEqual(f.calls.at(-1).body.payload.items, [{ storeId: 71, ...line(901) }]);
  assert.deepEqual(f.remote().payload.items, [{ storeId: 71, ...line(901) }]);
});

function recoveryRuntime({ authExpired = false } = {}) {
  const cached = JSON.stringify({ cartSchemaVersion: 2, revision: 3, items: [{ storeId: 71, ...line(901) }], migration: { status: "NONE", unresolvedItems: [] } });
  const local = storage({ nova_user_info: '{"id":7}', nova_user_token: "old-token", novastore_cart_v2_7: cached, novastore_cart_v2_imported_7: "1" });
  const calls = [];
  let server = envelope([], 0);
  const root = {
    localStorage: local, location: { origin: "http://localhost", assign() {} },
    dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
    NovaStoreFavorites: { loadFavoriteIds: async () => [], setFavorite: async () => {}, reportError() {} },
    fetch: async (path, options) => {
      calls.push({ path, ...options });
      let payload;
      if (path === "/api/users/me") return new Response(JSON.stringify(authExpired ? { error: "Invalid or expired token" } : { user: { id: 7, fullName: "Customer" } }), { status: authExpired ? 401 : 200 });
      if (path === "/api/products") payload = [{ id: 501, name: "Ürün", slug: "urun", price: 100, stock: 10, primaryCategoryId: 1, categoryIds: [1] }];
      else if (path === "/api/public/categories?format=tree") payload = [{ id: 1, name: "Kategori", slug: "kategori", children: [] }];
      else if (path === "/api/public/navigation/main") payload = { items: [] };
      else if (path === "/api/public/collections") payload = [];
      else if (path === "/api/business-identity") payload = { status: "pending_owner_company_formation" };
      else if (path === "/api/shared-state/cart") payload = server;
      else throw new Error(`Unexpected path ${path}`);
      return new Response(JSON.stringify(payload));
    },
  };
  return { factory: createCommerceRuntime({ root }), local, calls, cached, change: (value) => { server = value; } };
}

test("B03 expired login does not brick storefront or erase the account's V2 cache", async () => {
  const f = recoveryRuntime({ authExpired: true });
  const runtime = await f.factory.initialize();
  assert.equal(runtime.session.status, "guest");
  assert.equal(runtime.catalog.products.length, 1);
  assert.equal(runtime.cart.getSyncStatus().phase, "ready");
  assert.equal(f.local.getItem("nova_user_token"), null);
  assert.equal(f.local.getItem("novastore_cart_v2_7"), f.cached);
  assert.equal(f.calls.some((call) => call.path.startsWith("/api/shared-state/")), false);
});

test("B03 stale recovery leaves catalog/login available but blocks all cart/checkout mutations until explicit retry", async () => {
  const f = recoveryRuntime();
  const runtime = await f.factory.initialize();
  assert.equal(runtime.catalog.products.length, 1);
  assert.equal(runtime.session.status, "authenticated");
  assert.equal(runtime.cart.getSyncStatus().phase, "blocked");
  assert.equal(runtime.cart.getSyncStatus().code, "CART_STALE_RESPONSE");
  await assert.rejects(runtime.cart.persist([line(902)]), { code: "CART_SYNC_BLOCKED" });
  await assert.rejects(runtime.cart.handoffToCheckout([line(902)]), { code: "CART_SYNC_BLOCKED" });
  await assert.rejects(runtime.cart.finalize([], { orderId: 100 }), { code: "CART_SYNC_BLOCKED" });
  await assert.rejects(runtime.checkout.initialize({}), { code: "CART_SYNC_BLOCKED" });
  await assert.rejects(runtime.checkout.previewAgreements({}), { code: "CART_SYNC_BLOCKED" });
  assert.equal(f.calls.some((call) => ["PUT", "POST", "DELETE"].includes(call.method)), false);
  assert.equal(f.local.getItem("novastore_cart_v2_7"), f.cached);
  f.change(envelope([line(901), line(902)], 4));
  const updated = await runtime.cart.retrySync();
  assert.equal(updated.length, 2);
  assert.equal(runtime.cart.getSyncStatus().phase, "ready");
});

test("B03 shared storage accepts 200 lines and 999 quantity without purchase-limit truncation", async () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ productId: 501 + i, variantId: i === 0 ? 901 : null, quantity: i === 0 ? 999 : 1 }));
  const f = setup({ items: rows, revision: 1 });
  const loaded = await f.adapter.load();
  assert.equal(loaded.length, 200); assert.equal(loaded[0].quantity, 999);
  await f.adapter.persist(loaded.filter((row) => row.productId !== 502));
  assert.equal(f.remote().payload.items.length, 199);
  assert.equal(f.remote().payload.items[0].quantity, 999);
  const reduced = f.remote().payload.items.map((row) => row.productId === 501 ? { ...row, quantity: 998 } : row);
  await f.adapter.persist(reduced);
  assert.equal(f.remote().payload.items[0].quantity, 998);
  const before = f.calls.length;
  await assert.rejects(f.adapter.handoffToCheckout(reduced), { code: "CART_QUANTITY_INVALID" });
  assert.equal(f.calls.length, before, "purchase-limit failure does not overwrite the preserved cart");
});

test("B03 21 distinct shared lines synchronize; true storage boundaries fail without truncation", async () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ productId: 501 + i, variantId: null, quantity: 1 }));
  const f = setup({ items: rows, revision: 1 });
  assert.equal((await f.adapter.load()).length, 21);
  await f.adapter.persist(rows);
  assert.equal(f.remote().payload.items.length, 21);
  assert.throws(() => f.adapter.persist(Array.from({ length: 201 }, (_, i) => ({ productId: i + 1, variantId: null, quantity: 1 }))), { code: "CART_ITEMS_INVALID" });
  assert.throws(() => f.adapter.persist([line(901, 1000)]), { code: "CART_LINE_INVALID" });
  assert.equal(f.remote().payload.items.length, 21);
});

test("B03 oversized stored rows can decrease exactly; add never reduces an existing row", () => {
  assert.equal(cartEditedQuantity({ currentQuantity: 999, totalQuantity: 1000, requestedQuantity: 998, availableStock: 0 }), 998);
  assert.equal(cartEditedQuantity({ currentQuantity: 21, totalQuantity: 70, requestedQuantity: 20, availableStock: 0 }), 20);
  assert.equal(cartEditedQuantity({ currentQuantity: 999, totalQuantity: 1000, requestedQuantity: 0, availableStock: 0 }), 0);
  assert.equal(cartIncreaseQuantity({ currentQuantity: 21, totalQuantity: 70, requestedQuantity: 1, availableStock: 100 }), 21);
  assert.equal(cartIncreaseQuantity({ currentQuantity: 0, totalQuantity: 70, requestedQuantity: 1, availableStock: 100 }), 0);
  assert.throws(() => cartEditedQuantity({ currentQuantity: 21, totalQuantity: 70, requestedQuantity: 22, availableStock: 100 }), { code: "CART_PURCHASE_LIMIT" });
});

test("B03 rejected old local tuples remain explicitly reviewable, without blocking the canonical cart or retrying forever", async () => {
  const requests = [];
  const f = setup({ initial: { novastore_cart_v2_imported_7: "", novastore_variant_cart_7: JSON.stringify([line(901), line(902)]) }, request: async (path, options) => {
    requests.push({ path, ...options });
    if (options.method === "PUT") throw Object.assign(new Error("unavailable"), { code: "VARIANT_NOT_PURCHASABLE", status: 409 });
    return envelope([{ productId: 800, variantId: null, quantity: 1 }], 5);
  } });
  assert.deepEqual(await f.adapter.load(), [{ storeId: 71, productId: 800, variantId: null, quantity: 1 }]);
  assert.equal(f.adapter.getSyncStatus().phase, "ready");
  assert.equal(f.adapter.getMigration().localItems.length, 2);
  assert.equal(f.local.getItem("novastore_variant_cart_7"), JSON.stringify([line(901), line(902)]));
  await f.adapter.load();
  assert.equal(requests.filter((call) => call.method === "PUT").length, 1);
  await f.adapter.resolveLegacy(501, true, 901);
  assert.deepEqual(f.adapter.getMigration().localItems, [{ ...line(902), reason: "VARIANT_NOT_PURCHASABLE" }]);
});

test("B03 migration does not turn network or CAS failures into successful local review", async () => {
  for (const code of ["CUSTOMER_NETWORK_ERROR", "CART_REVISION_CONFLICT"]) {
    const f = setup({ initial: { novastore_cart_v2_imported_7: "", novastore_variant_cart_7: JSON.stringify([line(901)]) }, request: async (_path, options) => {
      if (options.method === "PUT") throw Object.assign(new Error(code), { code });
      return envelope([], 1);
    } });
    await assert.rejects(f.adapter.load(), { code });
    assert.notEqual(f.local.getItem("novastore_cart_v2_imported_7"), "1");
    assert.equal(f.local.getItem("novastore_cart_v2_local_review_7"), null);
  }
});
