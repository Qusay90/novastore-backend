import assert from "node:assert/strict";
import test from "node:test";

import {
  createHelpSecurityIntent,
  resolveOrderProductDetailIntent,
  resolveRepeatOrderProductDetailIntent,
} from "../../src/adapters/contracts.ts";

test("an order item produces an explicit product-detail intent", () => {
  assert.deepEqual(resolveOrderProductDetailIntent({ product_id: "sound-n1", id: "order-line-91" }), {
    ok: true,
    intent: {
      kind: "open-product-detail",
      source: "order",
      productId: "sound-n1",
      route: { cal: "CAL-06", tab: "home", view: "" },
    },
  });
});

test("a repeat-order item uses the same typed PDP contract", () => {
  assert.deepEqual(resolveRepeatOrderProductDetailIntent({ productId: "pulse-anc" }), {
    ok: true,
    intent: {
      kind: "open-product-detail",
      source: "repeat-order",
      productId: "pulse-anc",
      route: { cal: "CAL-06", tab: "home", view: "" },
    },
  });
});

test("order intents reject legacy or conflicting identities without a destination", () => {
  assert.deepEqual(resolveOrderProductDetailIntent({ id: 201 }), {
    ok: false,
    reason: "legacy-id-only",
  });
  assert.deepEqual(resolveRepeatOrderProductDetailIntent({ productId: "pulse-anc", product_id: "sound-n1" }), {
    ok: false,
    reason: "conflicting-product-ids",
  });
});

test("help has one deterministic security destination", () => {
  assert.deepEqual(createHelpSecurityIntent(), {
    kind: "open-security",
    source: "help",
    route: { cal: "CAL-10", tab: "account", view: "security" },
  });
});
