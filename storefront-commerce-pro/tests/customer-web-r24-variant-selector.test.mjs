import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transformWithEsbuild } from "vite";
import { normalizePurchasableVariants, toPurchaseCartItems } from "../src/adapters/variantContract.js";
import { createVariantMatrix, resolveVariantSelection } from "../src/adapters/variantMatrix.js";

const selectorUrl = new URL("../src/integration/VariantSelection.jsx", import.meta.url);
const selectorCssUrl = new URL("../src/integration/variant-selection.css", import.meta.url);

async function loadVariantSelection() {
  const source = await readFile(selectorUrl, "utf8");
  const transformed = await transformWithEsbuild(source, selectorUrl.pathname, {
    loader: "jsx",
    jsx: "automatic",
  });
  const executable = transformed.code
    .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")))
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
    .replaceAll('"../adapters/variantMatrix.js"', JSON.stringify(new URL("../src/adapters/variantMatrix.js", import.meta.url).href));
  return import(`data:text/javascript;base64,${Buffer.from(executable).toString("base64")}`);
}

const variants = normalizePurchasableVariants([
  { id: 123, sku: "RED-M", selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }], price: 100.25, availableStock: 4, purchasable: true },
  { id: 124, sku: "BLUE-L", selections: [{ group: "Renk", value: "Mavi" }, { group: "Beden", value: "L" }], price: 125.75, availableStock: 0, purchasable: false },
]);

test("R24 authority survives grouped R29 choices with one exact resolved ID and non-color cues", async () => {
  const { VariantSelection } = await loadVariantSelection();
  const html = renderToStaticMarkup(createElement(VariantSelection, {
    product: { variantSelectionRequired: true, variants },
    matrix: createVariantMatrix(variants), selections: variants[0].selections, cleared: [],
    resolution: resolveVariantSelection(createVariantMatrix(variants), variants[0].selections), onChange: () => {},
  }));

  assert.match(html, /^<fieldset class="runtime-variant-selection" data-resolved-variant-id="123"/);
  assert.match(html, /<legend>Seçenekleri belirle<\/legend>/);
  assert.equal((html.match(/aria-pressed="true"/g) || []).length, 2);
  assert.equal((html.match(/class="runtime-variant-selected">✓/g) || []).length, 2);
  assert.match(html, /data-variant-option="Mavi" data-option-state="UNAVAILABLE_COMBINATION" aria-pressed="false" aria-disabled="true"/);
  assert.match(html, /data-variant-option="L" data-option-state="UNAVAILABLE_COMBINATION" aria-pressed="false" aria-disabled="true"/);
});

test("R24 selector stylesheet keeps an explicit keyboard focus indicator", async () => {
  const css = await readFile(selectorCssUrl, "utf8");
  assert.match(css, /\.runtime-variant-options button:focus-visible\s*\{[^}]*outline:\s*3px solid #[0-9a-f]{6};[^}]*outline-offset:\s*3px;/i);
  assert.match(css, /\.runtime-variant-selected\s*\{[^}]*font-weight:\s*800;/i);
});

test("R24 selector renders server labels as escaped text", async () => {
  const { VariantSelection } = await loadVariantSelection();
  const hostileVariants = normalizePurchasableVariants([{
    id: 321,
    sku: "SAFE-SKU",
    selections: [{ group: '<img src=x onerror="alert(1)">', value: "<script>alert(1)</script>" }],
    price: 1,
    availableStock: 1,
    purchasable: true,
  }]);
  const html = renderToStaticMarkup(createElement(VariantSelection, {
    product: { variantSelectionRequired: true, variants: hostileVariants },
    matrix: createVariantMatrix(hostileVariants), selections: [], cleared: [],
    resolution: resolveVariantSelection(createVariantMatrix(hostileVariants), []), onChange: () => {},
  }));

  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("R24 rejects incomplete or malformed canonical server rows", () => {
  const valid = {
    id: 123,
    sku: "RED-M",
    selections: [{ group: "Renk", value: "Kırmızı" }],
    price: 100.25,
    availableStock: 4,
    purchasable: true,
  };
  const malformed = [
    { ...valid, id: "123junk" },
    { ...valid, selections: [] },
    { ...valid, selections: [{ group: "", value: "Kırmızı" }] },
    { ...valid, selections: [{ group: "Renk", value: "" }] },
    { ...valid, price: "100.25" },
    { ...valid, price: -1 },
    { ...valid, price: Number.POSITIVE_INFINITY },
    { ...valid, availableStock: "4" },
    { ...valid, availableStock: -1 },
    { ...valid, availableStock: 1.5 },
    { ...valid, purchasable: "true" },
  ];

  for (const row of malformed) assert.deepEqual(normalizePurchasableVariants([row]), []);
  assert.deepEqual(normalizePurchasableVariants([valid, { ...valid }]), [], "duplicate canonical IDs are ambiguous");
});

test("R24 purchase serialization strips client price, stock, store, seller and label authority", () => {
  const payload = toPurchaseCartItems([{
    productId: 42,
    variantId: 123,
    quantity: 2,
    price: 0.01,
    priceDelta: -999,
    stock: 99999,
    availableStock: 99999,
    storeId: 888,
    store_id: 888,
    sellerId: 777,
    seller_id: 777,
    sku: "FORGED",
    variantSelections: [{ group: "Beden", value: "<b>FORGED</b>" }],
    purchasable: true,
  }]);

  assert.deepEqual(payload, [{ product_id: 42, variant_id: 123, quantity: 2 }]);
  assert.deepEqual(Object.keys(payload[0]).sort(), ["product_id", "quantity", "variant_id"]);
});
