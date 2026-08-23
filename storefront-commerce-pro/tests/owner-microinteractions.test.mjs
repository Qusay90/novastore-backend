import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), "utf8");

test("favorite state commits only after the authoritative mutation succeeds", async () => {
  const [favoriteSource, cardSource, appSource] = await Promise.all([
    read("../src/CustomerFavoriteButton.jsx"),
    read("../src/CustomerProductCard.jsx"),
    read("../src/IntegratedApp.jsx"),
  ]);
  const toggleStart = appSource.indexOf("async function toggleFavorite(productId)");
  const toggleEnd = appSource.indexOf("async function addToCart", toggleStart);
  const toggleSource = appSource.slice(toggleStart, toggleEnd);
  const mutationIndex = toggleSource.indexOf("await runtime.favorites.set(productId, shouldFavorite)");
  const commitIndex = toggleSource.indexOf("favoritesRef.current = next");

  assert.ok(toggleStart >= 0 && toggleEnd > toggleStart);
  assert.ok(mutationIndex >= 0, "authoritative favorite mutation must be awaited");
  assert.ok(commitIndex > mutationIndex, "visible favorite state must commit after mutation success");
  assert.doesNotMatch(toggleSource.slice(0, mutationIndex), /setFavorites\(next\)/);
  assert.doesNotMatch(toggleSource, /favoritesRef\.current = previous|setFavorites\(previous\)/);
  assert.match(favoriteSource, /const pendingRef = useRef\(false\)/);
  assert.match(favoriteSource, /if \(pendingRef\.current\) return/);
  assert.match(favoriteSource, /const result = await onFavorite\?\.\(productId\)/);
  assert.match(favoriteSource, /if \(result !== false\)/);
  assert.match(favoriteSource, /disabled=\{pending \|\| typeof onFavorite !== "function"\}/);
  assert.match(favoriteSource, /aria-busy=\{pending \|\| undefined\}/);
  assert.match(cardSource, /<CustomerFavoriteButton productId=\{product\.id\} productName=\{product\.name\} favorite=\{favorite\} onFavorite=\{onFavorite\} \/>/);
});

test("owner favorite reference uses a compact red surface, white heart, halo, reverse, and reduced motion", async () => {
  const [favoriteSource, cssSource] = await Promise.all([
    read("../src/CustomerFavoriteButton.jsx"),
    read("../src/integrated.css"),
  ]);
  const r2Css = cssSource.slice(cssSource.indexOf("/* Main-6Y R2 owner reference:"));

  assert.match(favoriteSource, /<Heart weight=\{favorite \? "fill" : "regular"\} \/>/);
  assert.doesNotMatch(favoriteSource, /Sparkle|Confetti|Particle/);
  assert.match(r2Css, /--favorite-active-red: #d9233f/);
  assert.match(r2Css, /:is\(\.customer-product-card, \.runtime-product-gallery\) \.customer-favorite-button \{[\s\S]*?top: 4px;[\s\S]*?right: 3px;/);
  assert.match(r2Css, /\.customer-favorite-button::before[\s\S]*?width: 32px;[\s\S]*?height: 32px;[\s\S]*?border-radius: 10px/);
  assert.match(r2Css, /\.customer-favorite-button\.is-active::before[\s\S]*?background: var\(--favorite-active-red\)/);
  assert.match(r2Css, /\.customer-favorite-button\.is-active > svg[\s\S]*?fill: #fff;[\s\S]*?color: #fff/);
  assert.match(r2Css, /main6y-r2-favorite-halo-on 420ms/);
  assert.match(r2Css, /main6y-r2-favorite-surface-off 320ms/);
  assert.match(r2Css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.customer-favorite-button\.is-confirmed-on::before[\s\S]*?\.customer-favorite-button\.is-confirmed-off > svg[\s\S]*?animation: none/);
});

test("product cards and the runtime PDP share the same owner favorite control", async () => {
  const [cardSource, syncSource, runtimePresentation] = await Promise.all([
    read("../src/CustomerProductCard.jsx"),
    read("../scripts/sync-canonical.mjs"),
    read("../src/CanonicalRuntimePresentation.jsx"),
  ]);

  const sharedUsage = /<CustomerFavoriteButton productId=\{product\.id\} productName=\{product\.name\} favorite=\{favorite\} onFavorite=\{onFavorite\} \/>/;
  assert.match(cardSource, sharedUsage);
  assert.match(syncSource, /RUNTIME_FAVORITE_BUTTON_IMPORT/);
  assert.match(syncSource, /RUNTIME_PRODUCT_FAVORITE_BUTTON/);
  assert.match(runtimePresentation, /import \{ CustomerFavoriteButton \} from "\.\/CustomerFavoriteButton\.jsx"/);
  assert.match(runtimePresentation, sharedUsage);
  assert.doesNotMatch(runtimePresentation, /aria-label=\{favorite \? "Favorilerden çıkar" : "Favorilere ekle"\}><Heart/);
});

test("public store metric panel owns one outside-only green backlight while hovered cells only lift", async () => {
  const [pageSource, cssSource] = await Promise.all([
    read("../src/PublicStorePage.jsx"),
    read("../src/integrated.css"),
  ]);
  const r2Css = cssSource.slice(cssSource.indexOf("/* Main-6Y R2 owner reference:"));
  const metricMarkup = pageSource.slice(
    pageSource.indexOf("<ul className=\"public-store-metrics\""),
    pageSource.indexOf("</ul>", pageSource.indexOf("<ul className=\"public-store-metrics\"")),
  );

  assert.match(pageSource, /<span className="public-store-status"><i \/> Açık<\/span>/);
  assert.match(metricMarkup, /<li key=\{key\}>/);
  assert.doesNotMatch(metricMarkup, /onClick|role="button"|tabIndex|href=/);
  assert.match(r2Css, /--store-led-green: #54df8c/);
  assert.match(r2Css, /\.public-store-metrics:has\(> li:hover\)[\s\S]*?rgb\(21 148 90 \/ 35%\)/);
  assert.doesNotMatch(r2Css, /\.public-store-metrics::before/);
  assert.doesNotMatch(r2Css, /\.public-store-metrics > li::after/);
  assert.doesNotMatch(r2Css, /\.public-store-metrics > li:hover::before \{[^}]*(?:background|box-shadow):/);
  assert.match(r2Css, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.public-store-metrics > li:hover > \*[\s\S]*?translateY\(-3px\)/);
  assert.match(r2Css, /\.public-store-status:hover[\s\S]*?translateY\(-2px\)/);
  assert.match(r2Css, /@media \(hover: none\), \(pointer: coarse\)[\s\S]*?\.public-store-metrics[\s\S]*?rgb\(21 148 90 \/ 25%\)/);
  assert.match(r2Css, /@media \(max-width: 760px\)[\s\S]*?\.public-store-metrics[\s\S]*?rgb\(21 148 90 \/ 25%\)[\s\S]*?\.public-store-status::before[\s\S]*?opacity: \.62/);
  assert.match(r2Css, /@media \(max-width: 380px\)[\s\S]*?grid-template-columns: 21px minmax\(0, 1fr\)[\s\S]*?overflow-wrap: anywhere/);
  assert.doesNotMatch(r2Css, /cursor:\s*pointer/);
});

test("PDP benefit cells lift only their icon and copy for fine pointers", async () => {
  const cssSource = await read("../src/integrated.css");
  const followUpCss = cssSource.slice(cssSource.indexOf("/* Main-6Y R2 owner follow-up:"));

  assert.match(followUpCss, /\.product-page \.detail-benefits > div > svg,[\s\S]*?\.product-page \.detail-benefits > div > span \{[\s\S]*?transition: transform 190ms/);
  assert.match(followUpCss, /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?\.product-page \.detail-benefits > div:hover > svg,[\s\S]*?\.product-page \.detail-benefits > div:hover > span \{[\s\S]*?translateY\(-3px\)/);
  assert.match(followUpCss, /@media \(max-width: 760px\)[\s\S]*?\.product-page \.detail-benefits > div:hover > span \{[\s\S]*?transform: none/);
  assert.match(followUpCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.product-page \.detail-benefits > div:hover > span \{[\s\S]*?transform: none/);
  assert.doesNotMatch(followUpCss, /\.detail-benefits(?::hover)?\s*\{[^}]*(?:transform|cursor)/);
});
