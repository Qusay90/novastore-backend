import assert from "node:assert/strict";
import test from "node:test";
import { deviceCartKey, restoreDeviceCart } from "../src/checkout/deviceCart.ts";

const row = (variantId, quantity = 1) => ({
  id: "untrusted-cache-key", productId: "42", quantity,
  ...(variantId === undefined ? {} : { variantId, variantSelections: [{ group: "Beden", value: variantId === 100 ? "M" : "L" }] }),
  snapshot: { id: "42", name: "Ürün", store: "Mağaza", image: "/product.png", price: "₺125,00", amount: 125, stock: 4, isPublicProjection: true },
});
const cache = (lines) => JSON.stringify({ version: 1, lines });

test("device reopen restores same product sibling variants and a simple identity separately", () => {
  const restored = restoreDeviceCart(cache([row(100, 2), row(101), row(undefined)]));
  assert.deepEqual(restored.map(({ id, variantId, quantity }) => ({ id, variantId, quantity })), [
    { id: "product-42-variant-100", variantId: 100, quantity: 2 },
    { id: "product-42-variant-101", variantId: 101, quantity: 1 },
    { id: "product-42", variantId: undefined, quantity: 1 },
  ]);
  assert.equal(restored[0].variantSelections[0].value, "M");
  assert.equal(restored[1].variantSelections[0].value, "L");
  assert.notEqual(deviceCartKey("42", 100), deviceCartKey("42", 101));
});

test("recreation refuses ambiguous duplicates, invalid identities and corrupted snapshots", () => {
  for (const variantId of [0, -1, 2147483648, true, "1e2", "../1", 1.2, null]) {
    assert.deepEqual(restoreDeviceCart(cache([row(variantId)])), []);
  }
  assert.deepEqual(restoreDeviceCart(cache([row(100), row(100)])), []);
  assert.deepEqual(restoreDeviceCart(cache([{ ...row(100), variantSelections: [] }])), []);
  assert.deepEqual(restoreDeviceCart(cache([{ ...row(100), snapshot: { ...row(100).snapshot, image: "javascript:alert(1)" } }])), []);
  assert.deepEqual(restoreDeviceCart("not-json"), []);
});

test("cache limits fail closed and arbitrary extra properties never become restored authority", () => {
  assert.deepEqual(restoreDeviceCart(cache([row(100, 21)])), []);
  assert.deepEqual(restoreDeviceCart(cache([row(100, 20), row(101, 20), row(102, 11)])), []);
  const restored = restoreDeviceCart(cache([{ ...row(100), token: "synthetic-only", priceDelta: 5, storeId: 999 }]));
  assert.equal(restored.length, 1);
  assert.equal(Object.hasOwn(restored[0], "token"), false);
  assert.equal(Object.hasOwn(restored[0], "priceDelta"), false);
  assert.equal(Object.hasOwn(restored[0], "storeId"), false);
});
