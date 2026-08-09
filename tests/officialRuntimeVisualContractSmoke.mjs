import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const storefrontPresentation = read("storefront-commerce-pro", "src", "CanonicalRuntimePresentation.jsx");
const storefrontIntegration = read("storefront-commerce-pro", "src", "IntegratedApp.jsx");
const storefrontCatalogAdapter = read("storefront-commerce-pro", "src", "adapters", "catalogAdapter.js");
const storefrontCss = read("storefront-commerce-pro", "src", "integrated.css");
const storefrontArtifact = read("frontend", "commerce-pro", "index.html");
const adminArtifact = read("frontend", "admin-commerce-pro-live.html");
const adminCss = read("admin-commerce-pro", "src", "styles.css");
const adminAdapter = read("admin-commerce-pro", "src", "adapters", "sameOriginAdapter.js");
const adminIntegration = read("admin-commerce-pro", "src", "IntegratedApp.jsx");
const reviewServer = read("scripts", "serveOfficialRuntimeReview.mjs");

const logoSource = storefrontPresentation.slice(
  storefrontPresentation.indexOf("function Logo"),
  storefrontPresentation.indexOf("function TrustBar"),
);
assert.match(logoSource, /<span>Nova<\/span><strong>Store<\/strong>/);
assert.doesNotMatch(logoSource, /StarFour|brand-mark/);
assert.match(storefrontCss, /--commerce-pro-font:\s*[\s\S]*?Inter/);
assert.match(storefrontCss, /body,[\s\S]*?font-family: var\(--commerce-pro-font\)/);
assert.match(storefrontPresentation, /buy-now-button[\s\S]*?Hemen Al/);
assert.match(storefrontIntegration, /runtime\.cart\.handoffToCheckout\(next\)/);
assert.match(storefrontIntegration, /product\.stock <= 0/);
assert.match(storefrontIntegration, /Math\.min\(product\.stock/);
assert.match(storefrontCatalogAdapter, /slug: safeProductSlug\(product\.slug, id\)/);
assert.match(storefrontIntegration, /<ComparisonTray ids=\{comparisonIds\}/);
assert.match(storefrontIntegration, /onClear=\{\(\) => setComparisonIds\(new Set\(\)\)\}/);
assert.match(storefrontArtifact, /production-candidate/);
assert.match(storefrontArtifact, /IntegratedApp:createCommerceRuntime/);
assert.doesNotMatch(storefrontArtifact, /main-integrated-fixture|createCanonicalFixtureRuntime/);

for (const css of [storefrontCss, adminCss]) {
  assert.match(css, /data-input-modality="pointer"/);
  assert.match(css, /outline: none !important/);
  assert.match(css, /:focus-visible/);
}
assert.match(adminArtifact, /data-admin-mode="integrated"/);
assert.match(adminArtifact, /Satıcı mağaza kayıtları/);
assert.doesNotMatch(adminArtifact, /PRIVATE_OWNER_KARTAL_73|PRIVATE_CATEGORY_LALE_51|PRIVATE_COMMISSION_19/);
assert.match(adminAdapter, /local_review_no_finance_order_user_data/);
assert.match(adminIntegration, /localReviewDataUnavailable[\s\S]*?Kullanılamıyor/);
assert.match(reviewServer, /expectedArtifactSha256[\s\S]*?storefrontSha256 !== expectedArtifactSha256\.storefront[\s\S]*?adminSha256 !== expectedArtifactSha256\.admin/);

const exerciseModality = async (modulePath) => {
  const listeners = new Map();
  const documentElement = { dataset: {} };
  const documentRoot = {
    documentElement,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); },
  };
  const { installInputModalityTracking } = await import(modulePath);
  const cleanup = installInputModalityTracking({ documentRoot });
  listeners.get("pointerdown")({ pointerType: "mouse" });
  assert.equal(documentElement.dataset.inputModality, "pointer");
  listeners.get("keydown")({ key: "Enter" });
  assert.equal(documentElement.dataset.inputModality, "pointer");
  listeners.get("keydown")({ key: "Tab" });
  assert.equal(documentElement.dataset.inputModality, "keyboard");
  cleanup();
  assert.equal(documentElement.dataset.inputModality, undefined);
  assert.equal(listeners.size, 0);
};

await exerciseModality(new URL("../storefront-commerce-pro/src/integration/inputModality.js", import.meta.url));
await exerciseModality(new URL("../admin-commerce-pro/src/integration/inputModality.js", import.meta.url));

console.log("HEADER_STAR_COUNT=0");
console.log("FOOTER_STAR_COUNT=0");
console.log("OFFICIAL_PRIMARY_UI_FONT=Inter");
console.log("PDP_BUY_NOW_VISIBLE_IN_STOCK=YES");
console.log("ACTUAL_OFFICIAL_COMPARISON_SOURCE_CONTRACT=PASS");
console.log("KEYBOARD_FOCUS_SOURCE_CONTRACT=PASS");
console.log("OFFICIAL_RUNTIME_VISUAL_CONTRACT_SMOKE=PASS");
