import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import {
  getAssistantViewportMetrics,
  nextModeOptionIndex,
} from "../src/integration/assistantResponsive.js";

test("R8 NovaBot visual viewport geometry follows the usable browser viewport", () => {
  assert.deepEqual(getAssistantViewportMetrics({ height: 533.4, offsetTop: 211.6 }, 844), { height: 533, top: 212 });
  assert.deepEqual(getAssistantViewportMetrics(null, 844), { height: 844, top: 0 });
  assert.deepEqual(getAssistantViewportMetrics({ height: -20, offsetTop: -4 }, 844), { height: 1, top: 0 });
});

test("R8 NovaBot mode listbox keyboard navigation is bounded and deterministic", () => {
  assert.equal(nextModeOptionIndex(1, 9, "ArrowDown"), 2);
  assert.equal(nextModeOptionIndex(0, 9, "ArrowUp"), 8);
  assert.equal(nextModeOptionIndex(4, 9, "Home"), 0);
  assert.equal(nextModeOptionIndex(4, 9, "End"), 8);
  assert.equal(nextModeOptionIndex(4, 9, "Enter"), null);
  assert.equal(nextModeOptionIndex(0, 0, "ArrowDown"), null);
});

test("R8 Customer Web uses server modes in one styled accessible listbox", async () => {
  const widget = await fs.readFile(new URL("../src/AssistantWidget.jsx", import.meta.url), "utf8");
  assert.match(widget, /capabilityModes\.map\(\(option, index\) =>/u);
  assert.match(widget, /aria-haspopup="listbox"/u);
  assert.match(widget, /role="listbox"/u);
  assert.match(widget, /role="option" aria-selected=/u);
  assert.match(widget, /aria-activedescendant=/u);
  assert.match(widget, /visualViewport\?\.addEventListener\("resize", syncViewport\)/u);
  assert.match(widget, /visualViewport\?\.addEventListener\("scroll", syncViewport\)/u);
  assert.doesNotMatch(widget, /<select\b/u);
  assert.doesNotMatch(widget, /dangerouslySetInnerHTML/u);
  assert.doesNotMatch(widget, /const\s+CANONICAL_SERVER_MODES/u);
  assert.match(widget, /assistant\.chat\(\{ message: text, history, modeId: selectedServerModeId \}\)/u);
});

test("R8 responsive CSS removes the 620px favorites collision and constrains checkout surfaces", async () => {
  const css = await fs.readFile(new URL("../src/integrated.css", import.meta.url), "utf8");
  assert.match(css, /\.favorites-page \.product-card\.customer-product-card\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/u);
  assert.match(css, /\.favorites-page \.customer-product-card \.product-card__media\s*\{[\s\S]*?height: auto;[\s\S]*?min-height: 0;[\s\S]*?aspect-ratio: 1\.28 \/ 1 !important;/u);
  assert.match(css, /@media \(max-width: 480px\)\s*\{[\s\S]*?\.favorites-page \.product-grid\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/u);
  assert.match(css, /--assistant-visual-viewport-height/u);
  assert.match(css, /\.assistant-widget\.is-open\s*\{[\s\S]*?--assistant-visual-viewport-top/u);
  assert.match(css, /\.assistant-mode__listbox\s*\{[\s\S]*?overflow-y: auto;/u);
  assert.match(css, /\.assistant-mode\s*\{[\s\S]*?position: relative;/u);
  assert.match(css, /\.assistant-widget\.is-checkout:not\(\.is-open\)\s*\{[\s\S]*?position: absolute;/u);
  assert.match(css, /\.checkout-page :is\(\.checkout-layout,[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/u);
  assert.match(css, /\.checkout-page \.payment-provider-disclosure,[\s\S]*?grid-template-columns: 32px minmax\(0, 1fr\);/u);
});

test("R8 compact drawer preserves every canonical global navigation path", async () => {
  const app = await fs.readFile(new URL("../src/IntegratedApp.jsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/integrated.css", import.meta.url), "utf8");
  assert.match(app, /className="mobile-customer-shortcuts" aria-label="Müşteri bağlantıları"/u);
  assert.match(app, /href="#\/favoriler"/u);
  assert.match(app, /href=\{`#\$\{customerAccountEntryPath\(authenticated\)\}`\}/u);
  assert.match(app, /href="#\/sepet"/u);
  assert.match(app, /href="#\/hesabim\/bildirimler"/u);
  assert.match(app, /authenticated \? "Hesabım" : "Giriş yap"/u);
  assert.match(css, /\.mobile-customer-shortcuts\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/u);
  assert.match(css, /\.mobile-customer-shortcuts a:focus-visible/u);
});

test("R8 category navigation keeps edge actions fixed and every overflow item reachable", async () => {
  const app = await fs.readFile(new URL("../src/IntegratedApp.jsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../src/integrated.css", import.meta.url), "utf8");
  assert.match(app, /className=\{cx\("category-rail", railState\.overflow/u);
  assert.match(app, /aria-label="Önceki kategorileri göster"/u);
  assert.match(app, /aria-label="Sonraki kategorileri göster"/u);
  assert.match(app, /scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\)/u);
  assert.match(css, /\.category-rail nav\s*\{[\s\S]*?overflow-x: auto;[\s\S]*?scrollbar-width: none;[\s\S]*?touch-action: pan-x pan-y;/u);
  assert.match(css, /\.category-rail nav > ul\s*\{[\s\S]*?width: max-content;[\s\S]*?flex-wrap: nowrap;/u);
  assert.match(css, /\.category-rail nav > ul > li\s*\{[\s\S]*?flex: 0 0 auto;/u);
});
