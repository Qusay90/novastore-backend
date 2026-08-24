import assert from "node:assert/strict";
import test from "node:test";

import { resolveProductIdentity } from "../../src/adapters/contracts.ts";

test("explicit camel-case and snake-case product identities are accepted", () => {
  assert.deepEqual(resolveProductIdentity({ productId: "pulse-anc" }), {
    ok: true,
    productId: "pulse-anc",
    source: "productId",
  });
  assert.deepEqual(resolveProductIdentity({ product_id: 201 }), {
    ok: true,
    productId: "201",
    source: "product_id",
  });
});

test("matching typed fields normalize to one canonical identity", () => {
  assert.deepEqual(resolveProductIdentity({ productId: "00201", product_id: 201 }), {
    ok: true,
    productId: "201",
    source: "both",
  });
});

test("conflicting or invalid typed fields fail closed", () => {
  assert.deepEqual(resolveProductIdentity({ productId: "pulse-anc", product_id: "sound-n1" }), {
    ok: false,
    reason: "conflicting-product-ids",
  });
  assert.deepEqual(resolveProductIdentity({ productId: "../admin", product_id: "pulse-anc" }), {
    ok: false,
    reason: "invalid-product-id",
  });
  assert.deepEqual(resolveProductIdentity({ productId: 0 }), {
    ok: false,
    reason: "invalid-product-id",
  });
});

test("legacy id is never used as a product identity", () => {
  assert.deepEqual(resolveProductIdentity({ id: 201 }), {
    ok: false,
    reason: "legacy-id-only",
  });
  assert.deepEqual(resolveProductIdentity({ id: 201, productId: undefined }), {
    ok: false,
    reason: "invalid-product-id",
  });
});

test("missing identities fail closed", () => {
  assert.deepEqual(resolveProductIdentity({}), {
    ok: false,
    reason: "missing-product-id",
  });
  assert.deepEqual(resolveProductIdentity(null), {
    ok: false,
    reason: "missing-product-id",
  });
});
