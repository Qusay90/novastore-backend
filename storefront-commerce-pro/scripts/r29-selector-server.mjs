// Owned loopback HTTP fixture. Uses the actual production artifact/adapters;
// never mounts a DB, provider, remote API or a production write path.
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ownerVariants, threeDimensionVariants, manyVariants, hostileVariants } from "./r29-variant-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function startSelectorFixture(port = 0) {
  const html = await fs.readFile(path.join(root, "../frontend/commerce-pro/index.html"));
  const image = await fs.readFile(path.join(root, "src/assets/optimized/product-headphones.webp"));
  const bridges = new Map(await Promise.all(["shared-state-sync.js", "favorites-sync.js"].map(async (name) => ["/" + name, await fs.readFile(path.join(root, "../frontend", name))])));
  const state = {
    products: [
      [42, "Kanonik renk ve beden", ownerVariants],
      [43, "Üç boyutlu seçenekler", threeDimensionVariants],
      [44, "Çok seçenekli ürün", manyVariants],
      [45, "Güvenli metin seçenekleri", hostileVariants],
      [46, "Belirsiz sözleşme", [ownerVariants[0], { ...ownerVariants[0], id: 999 }]],
      [47, "Basit ürün", []],
    ].map(([id, name, variants]) => ({ id, slug: `r29-${id}`, name, brand: "NovaStore", price: 100, stock: 99,
      categoryIds: [1], primaryCategoryId: 1, is_active: true, description: "Yerel seçenek doğrulama ürünü.",
      image_url: "/r29-product.webp", variant_selection_required: id !== 47, variants: structuredClone(variants),
      attributes: [{ code: "descriptive", name: "Açıklama", value: "Bu metin seçenek oluşturmaz" }],
    })),
    calls: [], unknown: [], cart: { version: 1, items: [] }, checkout: {}, favorites: [],
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const json = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    try {
      if (url.pathname === "/") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(html); }
      if (url.pathname === "/r29-product.webp") { res.writeHead(200, { "Content-Type": "image/webp" }); return res.end(image); }
      if (bridges.has(url.pathname)) { res.writeHead(200, { "Content-Type": "application/javascript" }); return res.end(bridges.get(url.pathname)); }
      if (!url.pathname.startsWith("/api/")) { res.writeHead(204); return res.end(); }
      let raw = ""; for await (const chunk of req) { raw += chunk; assert(raw.length <= 128 * 1024); }
      const body = raw ? JSON.parse(raw) : null;
      state.calls.push({ path: url.pathname, method: req.method, body });
      if (url.pathname === "/api/products") return json(state.products.map(({ variants, ...summary }) => summary));
      if (/^\/api\/products\/\d+$/.test(url.pathname)) return json(state.products.find((product) => product.id === Number(url.pathname.split("/").at(-1))));
      if (url.pathname === "/api/public/categories") return json([{ id: 1, name: "Seçenekler", slug: "secenekler", path: "secenekler", parent_id: null, children: [] }]);
      if (url.pathname === "/api/public/categories/secenekler/filters") return json({ filters: [] });
      if (url.pathname === "/api/public/navigation/main") return json({ code: "main", items: [] });
      if (["/api/public/collections", "/api/campaigns/coupons/active", "/api/addresses"].includes(url.pathname)) return json([]);
      if (["/api/public/business-identity", "/api/business-identity"].includes(url.pathname)) return json({ status: "pending_owner_company_formation", identity: null });
      if (url.pathname === "/api/assistant/capability") return json({ available: false, reason: "provider_not_configured", modes: [] });
      if (url.pathname === "/api/payments/capability") return json({ provider: "paytr", ready: false, state: "unavailable", message: "Yerel test", agreements: [] });
      if (/^\/api\/questions\/product\//.test(url.pathname)) return json({ items: [], limit: 20, hasMore: false, nextCursor: null });
      if (/^\/api\/reviews\/product\//.test(url.pathname)) return json({ reviews: [], average: 0, totalReviews: 0, pagination: { limit: 20, hasMore: false, nextCursor: null } });
      if (url.pathname === "/api/shared-state/cart") { if (body) state.cart = body.payload; return json({ exists: true, payload: state.cart }); }
      if (url.pathname === "/api/shared-state/checkout") { if (body) state.checkout = body.payload; return json({ exists: true, payload: state.checkout }); }
      if (url.pathname === "/api/campaigns/quote") {
        const items = (body?.cartItems || []).map((line) => {
          const product = state.products.find((p) => p.id === line.product_id);
          const row = product?.variants.find((v) => v.id === line.variant_id);
          assert(product && (!product.variant_selection_required || row?.purchasable && row.availableStock >= line.quantity));
          return { id: product.id, variant_id: row?.id, name: product.name, price: row?.price ?? product.price, quantity: line.quantity, line_total: (row?.price ?? product.price) * line.quantity };
        });
        const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
        return json({ items, subtotal, shipping: 0, discount: 0, grandTotal: subtotal, currency: "TRY", appliedCoupons: [], promotions: [] });
      }
      if (url.pathname === "/api/favorites" || url.pathname.startsWith("/api/favorites/")) return json({ productIds: [] });
      state.unknown.push({ path: url.pathname, method: req.method });
      return json({ code: "R29_FIXTURE_ROUTE_DENIED" }, 404);
    } catch { json({ code: "R29_FIXTURE_REJECTED" }, 409); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { state, base: `http://127.0.0.1:${server.address().port}`, html,
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }) };
}
if (process.argv.includes("--serve")) {
  const fixture = await startSelectorFixture(5092);
  console.log(`R29 fixture ready: ${fixture.base}`);
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void fixture.close());
}
