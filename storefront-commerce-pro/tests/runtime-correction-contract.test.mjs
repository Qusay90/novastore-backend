import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRuntimePresentation } from "../scripts/sync-canonical.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("runtime corrections preserve the sealed canonical presentation", async () => {
  const [canonicalApp, canonicalCss, runtimePresentation] = await Promise.all([
    read("src/App.jsx"),
    read("src/canonical.css"),
    read("src/CanonicalRuntimePresentation.jsx"),
  ]);

  assert.equal(sha256(canonicalApp), "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6");
  assert.equal(sha256(canonicalCss), "5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896");
  assert.equal(runtimePresentation, createRuntimePresentation(canonicalApp));
});

test("runtime presentation owns the shared card, product media, review anchor, and buy-now behavior", async () => {
  const [runtimePresentation, lightbox, integratedApp, integratedCss, comparisonContext, cartAdapter, sharedCard] = await Promise.all([
    read("src/CanonicalRuntimePresentation.jsx"),
    read("src/ProductMediaLightbox.jsx"),
    read("src/IntegratedApp.jsx"),
    read("src/integrated.css"),
    read("src/integration/RuntimeComparisonContext.jsx"),
    read("src/adapters/cartAdapter.js"),
    read("src/CustomerProductCard.jsx"),
  ]);

  assert.match(runtimePresentation, /CustomerProductCard/);
  assert.doesNotMatch(runtimePresentation, /\[compared, setCompared\] = useState/);
  assert.doesNotMatch(runtimePresentation, /@phosphor-icons\/react/);
  assert.match(sharedCard, /useContext\(RuntimeComparisonContext\)/);
  assert.match(sharedCard, /disabled=\{!comparison\.available\}/);
  assert.match(runtimePresentation, /runtime-product-media-stage/);
  assert.match(runtimePresentation, /runtime-product-thumbnails/);
  assert.match(runtimePresentation, /ProductMediaLightbox/);
  assert.match(lightbox, /runtime-media-lightbox/);
  assert.match(lightbox, /document\.querySelectorAll\("#root > \*"\)/);
  assert.match(lightbox, /keepFocusInDialog\(event, dialogRef\.current\)/);
  assert.match(lightbox, /returnFocusRef\?\.current\?\.focus\(\)/);
  assert.match(lightbox, /document\.body\.classList\.add\("is-locked"\)/);
  assert.match(lightbox, /PDP_LIGHTBOX_ZOOM_MAX = 4/);
  assert.match(lightbox, /event\.key === "ArrowLeft"/);
  assert.match(lightbox, /event\.key === "ArrowRight"/);
  assert.match(runtimePresentation, /quantity >= maxQuantity/);
  assert.match(runtimePresentation, /Math\.min\(maxQuantity, value \+ 1\)/);
  assert.match(runtimePresentation, /buyNowPending \? "Hazırlanıyor" : "Hemen Al"/);
  assert.match(runtimePresentation, /document\.getElementById\("community-reviews"\)/);
  assert.match(runtimePresentation, /onBuyNow\?\.\(product\.id, quantity\)/);

  assert.match(integratedApp, /<RuntimeComparisonContext\.Provider value=\{comparisonContext\}>/);
  assert.match(integratedApp, /available: true, ids: comparisonIds, toggle: toggleComparison/);
  assert.match(integratedApp, /const COMPARISON_TRAY_ROUTE_TYPES = new Set\(\[[\s\S]*?"home"[\s\S]*?"category"[\s\S]*?"search"[\s\S]*?"collection"[\s\S]*?"favorites"[\s\S]*?\]\)/);
  assert.doesNotMatch(integratedApp.slice(integratedApp.indexOf("const COMPARISON_TRAY_ROUTE_TYPES"), integratedApp.indexOf("function cx")), /"product(?:-id)?"/);
  assert.match(integratedApp, /comparisonIds\.size > 0 && COMPARISON_TRAY_ROUTE_TYPES\.has\(route\.type\)/);
  assert.doesNotMatch(integratedApp, /comparisonIds\.size > 0 && !\[/);
  assert.doesNotMatch(integratedApp, /comparison-tray-reserve/);
  assert.ok(integratedApp.indexOf("{comparisonVisible && <ComparisonTray") < integratedApp.indexOf("{content}"));
  assert.match(integratedApp, /if \(buyNowPendingRef\.current\) return/);
  assert.match(integratedApp, /buyNowPendingRef\.current = true/);
  assert.match(integratedApp, /finally \{\s*buyNowPendingRef\.current = false/);
  assert.match(integratedApp, /runtime\.cart\.handoffToCheckout\(next\)/);
  assert.doesNotMatch(integratedApp, /document\.addEventListener\("click"/);
  assert.match(comparisonContext, /available: false/);
  assert.match(cartAdapter, /const \{ enriched, normalized \} = persistLocal\(items\)/);
  assert.match(cartAdapter, /const stockIssue = requestedItems\.find/);
  assert.ok(
    cartAdapter.indexOf("const { enriched, normalized } = persistLocal(items);")
      < cartAdapter.indexOf("const stockIssue = requestedItems.find"),
    "checkout handoff must preserve the local cart before stock validation can reject",
  );

  assert.match(integratedCss, /--commerce-pro-font:/);
  assert.match(integratedCss, /\.brand > \.brand-mark\s*\{\s*display: none/);
  assert.match(integratedCss, /outline: 3px solid var\(--orange-600\)/);
  assert.match(integratedCss, /\.footer-bottom\s*\{\s*font-size: 11px/);
  assert.doesNotMatch(integratedCss, /comparison-tray-reserve/);
  assert.match(integratedCss, /@media \(max-width: 620px\)[\s\S]*?\.comparison-tray\s*\{[\s\S]*?position: relative;[\s\S]*?bottom: auto;[\s\S]*?width: calc\(100% - 20px\);[\s\S]*?margin: 10px auto 0/);
  assert.match(integratedCss, /\.comparison-clear\s*\{[\s\S]*?width: 44px;[\s\S]*?height: 44px;[\s\S]*?flex: 0 0 44px/);
  assert.doesNotMatch(integratedCss, /\.comparison-clear\s*\{\s*display: none/);
});
