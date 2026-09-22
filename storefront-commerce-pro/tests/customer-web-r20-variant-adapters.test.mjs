import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { createCatalogAdapter } from "../src/adapters/catalogAdapter.js";
import { createCartAdapter } from "../src/adapters/cartAdapter.js";
import { createCheckoutAdapter, normalizeQuote, reconcileFinalizedCart, toCheckoutCartItems } from "../src/adapters/checkoutAdapter.js";
import { normalizeCustomerOrder } from "../src/adapters/customerAccountAdapter.js";
import { assertProductVariant, cartLineKey, normalizePurchasableVariants, normalizeVariantId } from "../src/adapters/variantContract.js";

const serverVariants = [
  { id: 123, sku: "RED-M", selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }], price: 100.25, availableStock: 4, purchasable: true, commerce_revision: 2 },
  { id: 124, sku: "RED-L", selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "L" }], price: 125.75, availableStock: 3, purchasable: true, commerce_revision: 7 },
  { id: 125, sku: "BLUE-L", selections: [{ group: "Renk", value: "Mavi" }, { group: "Beden", value: "L" }], price: 90, availableStock: 0, purchasable: false, commerce_revision: 1 },
];
const variantProduct = { id: 42, name: "Kanonik Gömlek", price: 90, stock: 7,
  variantSelectionRequired: true, variantContractLoaded: true, variants: normalizePurchasableVariants(serverVariants) };
const simpleProduct = { id: 41, name: "Sade Ürün", price: 60, stock: 8, variantSelectionRequired: false, variants: [] };
const products = new Map([[41, simpleProduct], [42, variantProduct]]);
const createStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
};

async function realLegacyBridge(initial = {}, remoteItems = []) {
  const storage = createStorage(initial);
  const events = new Map();
  const requests = [];
  const root = {
    localStorage: storage,
    location: { assign: () => {} },
    addEventListener(type, listener) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(listener); },
    removeEventListener(type, listener) { events.get(type)?.delete(listener); },
    dispatchEvent(event) { events.get(event.type)?.forEach((listener) => listener(event)); },
    fetch: async (path, options) => {
      requests.push({ path, body: options.body ? JSON.parse(options.body) : null });
      return { ok: true, text: async () => JSON.stringify({ exists: true, payload: { items: remoteItems } }) };
    },
  };
  vm.runInNewContext(await readFile(new URL("../../frontend/shared-state-sync.js", import.meta.url), "utf8"),
    { window: root, CustomEvent, console, setTimeout });
  return { storage, root, requests, adapter: createCartAdapter({ root, storage, getProduct: (id) => products.get(id) }) };
}

test("R20 strict canonical variant IDs reject coercion, overflows and conflicting aliases", () => {
  for (const id of [0, -1, 1.5, 2147483648, true, {}, [], "", " 123", "123 ", "01", "1e2", "123x", "1.0"]) {
    assert.equal(normalizeVariantId(id), null, String(id));
    assert.throws(() => toCheckoutCartItems([{ productId: 42, variantId: id, quantity: 1 }]), { code: "VARIANT_ID_INVALID" });
  }
  assert.equal(normalizeVariantId("2147483647"), 2147483647);
  assert.throws(() => toCheckoutCartItems([{ productId: 42, variantId: 123, variant_id: 124, quantity: 1 }]), { code: "VARIANT_ID_INVALID" });
  assert.throws(() => toCheckoutCartItems([{ productId: 42, product_id: 41, variantId: 123, quantity: 1 }]), { code: "PRODUCT_ID_INVALID" });
});

test("R20 catalog consumes complete server rows and ignores descriptive combinations", async () => {
  const raw = { id: 42, name: "Gömlek", categoryIds: [1], primaryCategoryId: 1, price: 90, stock: 7,
    attributes: [{ label: "Beden", value: ["M", "L", "XL"] }], variant_selection_required: true,
    variants: [...serverVariants, { ...serverVariants[0], id: "123x" }, { ...serverVariants[0], id: 126, price: "1" }] };
  const adapter = createCatalogAdapter({ request: async (path) => {
    if (path === "/api/products") return [raw];
    if (path === "/api/products/42") return raw;
    if (path === "/api/public/categories?format=tree") return [{ id: 1, name: "Giyim", slug: "giyim", children: [] }];
    if (path === "/api/public/navigation/main") return { items: [] };
    if (path === "/api/public/collections") return [];
    throw new Error(path);
  } });
  const catalog = await adapter.load();
  const product = await adapter.loadProduct(42, { catalog });
  assert.equal(product.variantSelectionRequired, true);
  assert.equal(product.variantContractLoaded, true);
  assert.deepEqual(product.variants.map((row) => row.id), [123, 124, 125]);
  assert.deepEqual(product.variants.map((row) => [row.price, row.availableStock, row.purchasable]), [[100.25, 4, true], [125.75, 3, true], [90, 0, false]]);
  assert.equal(product.variants.some((row) => row.selections.some((selection) => selection.value === "XL")), false);
  assert.deepEqual(normalizePurchasableVariants([serverVariants[0], serverVariants[0]]), [], "ambiguous duplicate IDs are not selectable");
  await assert.rejects(() => createCatalogAdapter({ request: async () => ({ ...raw, id: 43 }) }).loadProduct(42, { catalog }), /geçerli bir ürüne/);
  await assert.rejects(() => createCatalogAdapter({ request: async () => ({ ...raw, variant_selection_required: "true" }) }).loadProduct(42, { catalog }), /geçerli bir ürüne/);
});

test("R20 required, foreign, unavailable selections fail with truthful contract codes", () => {
  assert.throws(() => assertProductVariant(variantProduct, null), { code: "VARIANT_REQUIRED" });
  assert.throws(() => assertProductVariant(variantProduct, 999), { code: "VARIANT_NOT_PURCHASABLE" });
  assert.throws(() => assertProductVariant(variantProduct, 125), { code: "VARIANT_STOCK_UNAVAILABLE" });
  assert.throws(() => assertProductVariant(simpleProduct, 123), { code: "VARIANT_NOT_ALLOWED" });
  assert.equal(assertProductVariant(simpleProduct, null), null);
  assert.equal(assertProductVariant(variantProduct, 124).price, 125.75);
  assert.throws(() => toCheckoutCartItems([{ product: variantProduct, quantity: 1 }]), { code: "VARIANT_REQUIRED" });
});

test("R20 quote, legal preview and initialize send only canonical IDs and quantity", async () => {
  const calls = [];
  const serverError = Object.assign(new Error("fixture contract gate"), { code: "FIXTURE_GATE" });
  const adapter = createCheckoutAdapter({ http: { request: async (path, options) => { calls.push({ path, body: options.body }); throw serverError; } } });
  const items = [
    { product: { ...variantProduct, price: 0.01, stock: 999999, store_id: 999 }, variantId: 123, quantity: 2, price: 0.01, stock: 99999, sku: "FAKE", storeId: 999 },
    { productId: 42, variantId: 124, quantity: 1, name: "forged", variant_selections: [{ group: "Size", value: "fake" }] },
    { product: simpleProduct, quantity: 1 },
  ];
  const expected = [{ product_id: 42, variant_id: 123, quantity: 2 }, { product_id: 42, variant_id: 124, quantity: 1 }, { product_id: 41, quantity: 1 }];
  const session = { status: "authenticated", user: { id: 7 } };
  await assert.rejects(() => adapter.quote(items), serverError);
  await assert.rejects(() => adapter.previewAgreements({ session, address: { id: 1 }, items }), serverError);
  await assert.rejects(() => adapter.initialize({ session, address: { id: 1 }, items }), serverError);
  assert.deepEqual(calls.map((call) => call.body.cartItems), [expected, expected, expected]);
  for (const quantity of [0, -1, 1.5, "1x", "2", 21]) assert.throws(() => toCheckoutCartItems([{ productId: 42, variantId: 123, quantity }]), { code: "CART_QUANTITY_INVALID" });
  assert.throws(() => toCheckoutCartItems([1, 2, 3].map((productId) => ({ productId, quantity: 20 }))), { code: "CART_QUANTITY_INVALID" });
});

test("R20 same variant aggregates while real legacy normalization never receives variant rows", async () => {
  const { adapter, root, storage, requests } = await realLegacyBridge();
  const updates = [];
  const unsubscribe = adapter.subscribe((items) => updates.push(items));
  const result = await adapter.persist([
    { productId: 42, variantId: 123, quantity: 1, price: 0.01, stock: 999999 },
    { productId: 42, variantId: 124, quantity: 1 }, { productId: 42, variantId: 123, quantity: 1 },
    { productId: 41, quantity: 1 },
  ]);
  assert.equal(result.variantPersistence, "account-scoped-local");
  const expected = [{ productId: 42, variantId: 123, quantity: 2 }, { productId: 42, variantId: 124, quantity: 1 }];
  assert.deepEqual(JSON.parse(storage.getItem("novastore_variant_cart_guest")), expected);
  assert.deepEqual(JSON.parse(storage.getItem("novastore_cart_guest")).map((item) => item.productId), [41]);
  assert.deepEqual((await adapter.load()).filter((item) => item.variantId), expected);
  root.dispatchEvent(new CustomEvent("novastore:shared-cart-updated", { detail: { items: [] } }));
  assert.deepEqual(updates.at(-1), expected, "legacy empty hydration must not delete canonical variant rows");
  assert.equal(requests.length, 0);
  assert.equal(new Set((await adapter.load()).map((item) => cartLineKey(item))).size, 3);
  unsubscribe();
});

test("R20 auth hydration and guest merge retain canonical variant selections across account scopes", async () => {
  const initial = { nova_user_info: JSON.stringify({ id: 7 }), nova_user_token: "fixture-token",
    novastore_variant_cart_7: JSON.stringify([{ productId: 42, variantId: 123, quantity: 1 }]),
    novastore_variant_cart_guest: JSON.stringify([{ productId: 42, variantId: 124, quantity: 2 }]) };
  const { adapter, storage, requests } = await realLegacyBridge(initial, [{ id: 41, name: "Sade", price: 60, quantity: 1 }]);
  const merged = await adapter.refreshAfterAuthentication([{ productId: 42, variantId: 124, quantity: 2 }]);
  assert.deepEqual(merged.filter((item) => item.variantId), [{ productId: 42, variantId: 123, quantity: 1 }, { productId: 42, variantId: 124, quantity: 2 }]);
  assert.equal(storage.getItem("novastore_variant_cart_guest"), null);
  assert.equal(requests.filter((request) => request.body).every((request) => request.body.payload.items.every((item) => item.productId === 41 && item.variantId === undefined)), true);
  storage.setItem("nova_user_info", JSON.stringify({ id: 8 }));
  assert.deepEqual((await adapter.load()).filter((item) => item.variantId), [], "other account must not inherit private selections");
});

test("R20 raw legacy variants migrate before lossy hydration and malformed sidecars fail closed", async () => {
  const { adapter, storage } = await realLegacyBridge({
    nova_user_info: JSON.stringify({ id: 7 }), nova_user_token: "fixture-token",
    novastore_cart_7: JSON.stringify([{ productId: 42, variantId: 123, quantity: 1 }, { productId: 42, variantId: 124, quantity: 1 }]),
  });
  assert.deepEqual(await adapter.load(), [{ productId: 42, variantId: 123, quantity: 1 }, { productId: 42, variantId: 124, quantity: 1 }]);
  storage.setItem("novastore_variant_cart_7", JSON.stringify([{ productId: 42, variantId: "123junk", quantity: 1 }]));
  await assert.rejects(() => adapter.load(), { code: "VARIANT_ID_INVALID" });
});

test("R20 remote product-only legacy carts require reselection when products now require variants", async () => {
  const { adapter, storage } = await realLegacyBridge({ nova_user_info: JSON.stringify({ id: 7 }), nova_user_token: "fixture-token" },
    [{ id: 42, name: "Old Product Row", price: 90, quantity: 1 }]);
  assert.deepEqual(await adapter.load(), [{ productId: 42, quantity: 1 }]);
  assert.deepEqual(JSON.parse(storage.getItem("novastore_variant_cart_7")), [{ productId: 42, quantity: 1 }]);
  await assert.rejects(async () => adapter.handoffToCheckout(await adapter.load()), { code: "VARIANT_REQUIRED" });
});

test("R20 delayed cart writes cannot hand off an old customer's cart after the session changes", async () => {
  const { root, storage } = await realLegacyBridge({ nova_user_info: JSON.stringify({ id: 7 }), nova_user_token: "fixture-a" });
  let resolveWrite;
  const assigned = [];
  root.NovaStoreSharedState.saveCart = () => new Promise((resolve) => { resolveWrite = resolve; });
  root.NovaStoreSharedState.reportError = () => {};
  const adapter = createCartAdapter({ root, storage, getProduct: (id) => products.get(id), location: { assign: (path) => assigned.push(path) } });
  const pending = adapter.handoffToCheckout([{ productId: 42, variantId: 123, quantity: 1 }]);
  storage.setItem("nova_user_info", JSON.stringify({ id: 8 }));
  storage.setItem("nova_user_token", "fixture-b");
  resolveWrite();
  await assert.rejects(() => pending, { code: "SHARED_STATE_PRINCIPAL_CHANGED" });
  assert.deepEqual(assigned, []);
  assert.equal(storage.getItem("novastore_variant_cart_8"), null);
});

test("R20 handoff retains stale/foreign IDs for server revalidation and rejects missing selection", async () => {
  const { adapter, storage, requests } = await realLegacyBridge({ nova_user_info: JSON.stringify({ id: 7 }), nova_user_token: "fixture-token" });
  await assert.rejects(() => adapter.handoffToCheckout([{ productId: 42, quantity: 1 }]), { code: "VARIANT_REQUIRED" });
  assert.deepEqual(JSON.parse(storage.getItem("novastore_variant_cart_7")), [{ productId: 42, quantity: 1 }]);
  await adapter.handoffToCheckout([{ productId: 42, variantId: 999, quantity: 20 }]);
  assert.deepEqual(JSON.parse(storage.getItem("novastore_variant_cart_7")), [{ productId: 42, variantId: 999, quantity: 20 }]);
  assert.equal(requests.some((request) => request.path === "/api/shared-state/checkout"), false);
});

test("R20 finalized reconciliation subtracts only the purchased combination and exact quantity", () => {
  assert.deepEqual(reconcileFinalizedCart([
    { productId: 42, variantId: 123, quantity: 3 }, { productId: 42, variantId: 124, quantity: 2 }, { productId: 41, quantity: 1 },
  ], [{ product_id: 42, variant_id: 123, quantity: 2 }]), [
    { productId: 42, variantId: 123, quantity: 1 }, { productId: 42, variantId: 124, quantity: 2 }, { productId: 41, quantity: 1 },
  ]);
  const storage = createStorage({ nova_user_info: JSON.stringify({ id: 7 }), novastore_pending_checkout_7: JSON.stringify({ orderId: 9, paymentRef: "fixture-ref", items: [{ product_id: 42, variant_id: 124, quantity: 1 }] }) });
  const checkout = createCheckoutAdapter({ http: { request: async () => ({}) }, storage });
  assert.deepEqual(checkout.consumeFinalizedCheckout({ orderId: 9, paymentRef: "fixture-ref" }), [{ productId: 42, variantId: 124, quantity: 1 }]);
});

test("R20 quote and order snapshots retain server selections after current labels and SKU change", () => {
  const item = { id: 42, name: "Historical Product", variant_id: 123, sku: "HISTORICAL-M", variant_selections: [{ group: "Beden", value: "Eski M" }], quantity: 1, price: 81.25 };
  const quoted = normalizeQuote({ items: [item], totals: { currency: "TRY", subtotal: 81.25, total: 81.25 } });
  assert.equal(quoted.items[0].cartKey, "42:123");
  const order = normalizeCustomerOrder({ id: 8, status: "Teslim Edildi", payment_status: "PAID", items: [item], total_amount: 81.25 });
  assert.equal(order.items[0].sku, "HISTORICAL-M");
  assert.equal(order.items[0].variantSelections[0].value, "Eski M");
  assert.equal(order.items[0].price, 81.25);
  assert.equal(order.returnable, true, "R13 return behavior remains order-level");
});
