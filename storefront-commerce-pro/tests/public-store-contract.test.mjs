import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createPublicStoreAdapter, normalizePublicStoreSlug } from "../src/adapters/publicStoreAdapter.js";
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
  assert.equal(result.products[0].slug, "501");
  assert.equal(result.products[0].imageUrl, "https://cdn.example.test/nova-main.webp");
  assert.equal(result.products[0].rating, 4.8);
  assert.equal(result.products[0].reviews, 12);
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
  assert.match(pageSource, /document\.addEventListener\("click", blockCustomerChrome, true\)/);
  assert.doesNotMatch(pageSource, /dangerouslySetInnerHTML|localStorage|sessionStorage|Authorization|analytics|fetch\(/);
  assert.match(cssSource, /\.public-store-hero/);
  assert.match(cssSource, /@media \(max-width: 390px\)/);
});
