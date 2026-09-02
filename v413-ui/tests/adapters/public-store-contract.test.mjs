import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CUSTOMER_CARD_FRAMING,
  canonicalPublicStoreSlug,
  normalizePublicStoreProjection,
  orderedCustomerCardMedia,
  orderedCustomerOriginalMediaUrls,
  resolveCustomerCardFraming,
} from "../../src/adapters/publicStoreContract.ts";

function projection(overrides = {}) {
  return {
    store: {
      slug: "main6v-nova-teknoloji",
      name: "Nova Audio Mağazası",
      description: "Yetkili ses mağazası",
      logo_url: "/uploads/logo.png",
      banner_url: "/uploads/banner.png",
      status: "open",
      rating: 4.8,
      review_count: 42,
      follower_count: 18400,
      total_units_sold: 3260,
      product_count: 1,
      shipping_summary: "",
      return_summary: "14 gün",
    },
    products: [{
      id: 201,
      slug: "nova-pulse-anc",
      name: "Nova Pulse ANC Kulaklık",
      price: 4299,
      old_price: 5199,
      stock: 7,
      is_purchasable: true,
      image_url: "/uploads/fallback.png",
      average_rating: 4.8,
      review_count: 326,
      media: [
        { id: 3, product_id: 201, media_url: "/uploads/side.png", is_main: false, sort_order: 2, media_type: "image", card_framing: { focal_x: 0.75, focal_y: 0.3, zoom: 1.6 } },
        { id: 1, product_id: 201, media_url: "/uploads/main.png", is_main: true, sort_order: 1, media_type: "image", card_framing: { focal_x: 0.25, focal_y: 0.4, zoom: 1.4 } },
        { id: 2, product_id: 201, media_url: "/uploads/video.mp4", is_main: false, sort_order: 1, media_type: "video", card_framing: null },
      ],
    }],
    ...overrides,
  };
}

test("canonical public slug validation is normalized and fail-closed", () => {
  assert.equal(canonicalPublicStoreSlug(" MAIN6V-NOVA-TEKNOLOJI "), "main6v-nova-teknoloji");
  for (const value of ["../admin", "seller_private", "-leading", "two--dashes", ""]) {
    assert.throws(() => canonicalPublicStoreSlug(value), /INVALID_PUBLIC_STORE_SLUG/);
  }
});

test("public store DTO is normalized against the requested slug", () => {
  const value = normalizePublicStoreProjection(
    projection(),
    "main6v-nova-teknoloji",
    "http://10.0.2.2:5000",
    true,
  );
  assert.equal(value.store.name, "Nova Audio Mağazası");
  assert.equal(value.store.logoUrl, "http://10.0.2.2:5000/uploads/logo.png");
  assert.equal(value.products[0].id, "201");
  assert.equal(value.products[0].media.length, 2);
  assert.throws(
    () => normalizePublicStoreProjection(projection(), "different-store"),
    /PUBLIC_STORE_SLUG_MISMATCH/,
  );
});

test("private or unexpected fields never cross the public adapter", () => {
  const leaked = projection();
  leaked.store.tenant_id = "tenant-secret";
  assert.throws(
    () => normalizePublicStoreProjection(leaked, "main6v-nova-teknoloji"),
    /UNEXPECTED_PUBLIC_FIELD/,
  );

  const leakedProduct = projection();
  leakedProduct.products[0].seller_cost = 19;
  assert.throws(
    () => normalizePublicStoreProjection(leakedProduct, "main6v-nova-teknoloji"),
    /UNEXPECTED_PUBLIC_FIELD/,
  );
});

test("card framing validates normalized bounds and defaults atomically", () => {
  assert.deepEqual(resolveCustomerCardFraming({ focal_x: 0.2, focal_y: 0.7, zoom: 1.8 }), {
    focalX: 0.2,
    focalY: 0.7,
    zoom: 1.8,
  });
  assert.equal(resolveCustomerCardFraming({ focal_x: -1, focal_y: 0.7, zoom: 1.8 }), DEFAULT_CUSTOMER_CARD_FRAMING);
  assert.equal(resolveCustomerCardFraming({ focal_x: 0.2, focal_y: 0.7, zoom: 9 }), DEFAULT_CUSTOMER_CARD_FRAMING);
});

test("card media is ordered and framed while PDP media remains original URLs only", () => {
  const product = normalizePublicStoreProjection(
    projection(),
    "main6v-nova-teknoloji",
    "https://novastore.tr",
  ).products[0];
  const card = orderedCustomerCardMedia(product);
  assert.deepEqual(card.map((item) => item.url), [
    "https://novastore.tr/uploads/main.png",
    "https://novastore.tr/uploads/side.png",
    "https://novastore.tr/uploads/fallback.png",
  ]);
  assert.deepEqual(card[0].cardFraming, { focalX: 0.25, focalY: 0.4, zoom: 1.4 });
  assert.deepEqual(orderedCustomerOriginalMediaUrls(product), card.map((item) => item.url));
  assert.equal("cardFraming" in Object(orderedCustomerOriginalMediaUrls(product)[0]), false);
});

test("unsafe media schemes and non-loopback cleartext URLs are rejected", () => {
  for (const mediaUrl of ["javascript:alert(1)", "data:text/html,evil", "http://private.example.invalid/p.png"] ) {
    const value = projection();
    value.products[0].media[0].media_url = mediaUrl;
    assert.throws(
      () => normalizePublicStoreProjection(value, "main6v-nova-teknoloji"),
      /PUBLIC_MEDIA_URL_INVALID/,
    );
  }
});

test("cleartext media requires explicit authorization and the exact active origin", () => {
  const matching = projection();
  matching.products[0].media[0].media_url = "http://10.0.2.2:5000/uploads/side.png";
  assert.throws(
    () => normalizePublicStoreProjection(matching, "main6v-nova-teknoloji", "http://10.0.2.2:5000"),
    /PUBLIC_MEDIA_URL_INVALID/,
  );
  assert.doesNotThrow(() => normalizePublicStoreProjection(
    matching,
    "main6v-nova-teknoloji",
    "http://10.0.2.2:5000",
    true,
  ));

  for (const origin of ["https://novastore.tr", "http://127.0.0.1:5000", "http://10.0.2.2:5001"]) {
    assert.throws(
      () => normalizePublicStoreProjection(matching, "main6v-nova-teknoloji", origin, true),
      /PUBLIC_MEDIA_URL_INVALID/,
    );
  }
});

test("media cannot cross product identity boundaries", () => {
  const mismatched = projection();
  mismatched.products[0].media[0].product_id = 999;
  assert.throws(
    () => normalizePublicStoreProjection(mismatched, "main6v-nova-teknoloji", "https://novastore.tr"),
    /PUBLIC_MEDIA_PRODUCT_ID_MISMATCH/,
  );
});
