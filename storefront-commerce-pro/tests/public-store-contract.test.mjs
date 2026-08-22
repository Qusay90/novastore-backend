import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPublicStoreAdapter, normalizePublicStoreSlug } from "../src/adapters/publicStoreAdapter.js";
import { createStoreFollowAdapter } from "../src/adapters/storeFollowAdapter.js";
import { normalizeStorefrontApiPath, StorefrontHttpError } from "../src/integration/storefrontHttp.js";

test("public mağaza API yolu yalnız güvenli aynı-origin slug sözleşmesini kabul eder", () => {
  assert.equal(normalizeStorefrontApiPath("/api/public/stores/nova-teknoloji", "https://novastore.tr"), "/api/public/stores/nova-teknoloji");
  assert.equal(normalizePublicStoreSlug(" Nova-Teknoloji "), "nova-teknoloji");
  for (const value of ["", "bad_slug", "../admin", "a/b", "https://evil.example/store"]) {
    assert.equal(normalizePublicStoreSlug(value), null, value);
  }
  for (const path of [
    "/api/public/stores/bad_slug",
    "/api/public/stores/nova-teknoloji?token=secret",
    "https://evil.example/api/public/stores/nova-teknoloji",
    "//evil.example/api/public/stores/nova-teknoloji",
  ]) {
    assert.throws(() => normalizeStorefrontApiPath(path, "https://novastore.tr"), StorefrontHttpError, path);
  }
});

test("public mağaza adapterı server-isolated DTO ürünlerini mevcut müşteri ürün modeline taşır", async () => {
  const requests = [];
  const adapter = createPublicStoreAdapter({
    async request(path) {
      requests.push(path);
      return {
        store: {
          slug: "nova-teknoloji",
          name: "Nova Teknoloji",
          description: "Güncel teknoloji seçkisi",
          logo_url: null,
          banner_url: null,
          status: "open",
          rating: null,
          review_count: 0,
          follower_count: 24,
          total_units_sold: 137,
          product_count: 1,
          shipping_summary: "Aynı gün kargo",
          return_summary: "14 gün içinde iade",
        },
        products: [{
          id: 501,
          slug: "501",
          name: "Nova Kulaklık",
          price: 1250,
          old_price: 1499,
          stock: 7,
          is_purchasable: true,
          image_url: "https://cdn.example.test/nova-main.webp",
          media: [{ id: 1, media_url: "https://cdn.example.test/nova-main.webp", media_type: "image", is_main: true, sort_order: 0 }],
          average_rating: 4.8,
          review_count: 12,
        }],
      };
    },
  });
  const result = await adapter.load("nova-teknoloji", { catalog: { categories: [] } });
  assert.deepEqual(requests, ["/api/public/stores/nova-teknoloji"]);
  assert.equal(result.store.name, "Nova Teknoloji");
  assert.equal(result.store.logoUrl, null);
  assert.equal(result.store.bannerUrl, null);
  assert.equal(result.store.rating, null);
  assert.equal(result.store.followerCount, 24);
  assert.equal(result.store.totalUnitsSold, 137);
  assert.equal(result.store.productCount, 1);
  assert.equal(result.products[0].slug, "501");
  assert.equal(result.products[0].imageUrl, "https://cdn.example.test/nova-main.webp");
  assert.equal(result.products[0].rating, 4.8);
  assert.equal(result.products[0].reviews, 12);
});

test("müşteri mağaza takip adapterı yalnız public slug ve müşteri-auth yöntemlerini kullanır", async () => {
  const requests = [];
  const adapter = createStoreFollowAdapter({
    async request(path, options) {
      requests.push({ path, method: options.method });
      return {
        store_slug: "nova-teknoloji",
        following: options.method === "POST",
        follower_count: options.method === "POST" ? 25 : 24,
      };
    },
  });
  assert.deepEqual(await adapter.load("nova-teknoloji"), {
    slug: "nova-teknoloji",
    following: false,
    followerCount: 24,
  });
  assert.equal((await adapter.set("nova-teknoloji", true)).following, true);
  assert.equal((await adapter.set("nova-teknoloji", false)).following, false);
  assert.deepEqual(requests, [
    { path: "/api/store-follows/nova-teknoloji", method: "GET" },
    { path: "/api/store-follows/nova-teknoloji", method: "POST" },
    { path: "/api/store-follows/nova-teknoloji", method: "DELETE" },
  ]);
  await assert.rejects(
    () => adapter.load("../admin"),
    /Geçerli bir public mağaza slug/u,
  );
});

test("kanonik mağaza rotası ve preview modu tek PublicStorePage render yolunu kullanır", async () => {
  const [appSource, pageSource, serverSource, cssSource] = await Promise.all([
    readFile(new URL("../src/IntegratedApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/PublicStorePage.jsx", import.meta.url), "utf8"),
    readFile(new URL("../../server.js", import.meta.url), "utf8"),
    readFile(new URL("../src/integrated.css", import.meta.url), "utf8"),
  ]);
  assert.match(appSource, /pathname\.startsWith\("\/magaza\/"\)/);
  assert.match(appSource, /type: "public-store"/);
  assert.match(appSource, /query\.get\("mode"\) === "preview"/);
  assert.equal((appSource.match(/<PublicStorePage /g) || []).length, 1, "customer ve preview tek renderer kullanmalı");
  assert.match(serverSource, /kategori\|urun\|koleksiyon\|magaza/);
  assert.match(pageSource, /previewMode \? \(/);
  assert.match(pageSource, /Önizlemede işlem yapılamaz/);
  assert.match(pageSource, /Önizlemede takip kapalı/);
  assert.match(pageSource, /Mağazayı takip et/);
  assert.match(pageSource, /public-store-metrics/);
  assert.match(pageSource, /document\.addEventListener\("click", blockCustomerChrome, true\)/);
  assert.doesNotMatch(pageSource, /dangerouslySetInnerHTML|localStorage|sessionStorage|Authorization|analytics|fetch\(/);
  assert.match(cssSource, /\.public-store-hero/);
  assert.match(cssSource, /\.public-store-product-card \.product-card__media img[\s\S]*object-fit: contain/);
  assert.match(cssSource, /\.public-store-metrics/);
  assert.match(cssSource, /@media \(max-width: 390px\)/);
});
