import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../src/prototype.css", import.meta.url), "utf8");
const prototype = await readFile(new URL("../src/Prototype.tsx", import.meta.url), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

test("product media uses the elastic reference wave", () => {
  const media = rule(".product-media");
  assert.match(media, /aspect-ratio: 1\.025 \/ 1/);
  assert.match(media, /curve to 65\.4% 100% with 88\.5% calc\(100% - var\(--card-wave-right-control-lift\)\) \/ 77% calc\(100% - var\(--card-wave-trough-control-lift\)\)/);
  assert.match(media, /curve to 0 calc\(100% - var\(--card-wave-left-lift\)\) with 43\.6% 100% \/ 21\.8% calc\(100% - var\(--card-wave-left-crest-control-lift\)\)/);
  assert.doesNotMatch(media, /card-wave-right-lift\) \+ 5px/);
  assert.doesNotMatch(media, /card-wave-left-lift\) \+ 2px/);
});

test("cart recess derives equal top and left clearance from one radius", () => {
  const card = rule(".product-card");
  const copy = rule(".product-copy");
  const recess = rule(".product-copy::before");
  assert.match(card, /--cart-edge-offset:/);
  assert.match(card, /--cart-visual-size:/);
  assert.match(card, /--cart-cradle-gap:/);
  assert.match(card, /--cart-cradle-gap: clamp\(2px, \.525cqw, 2\.5px\)/);
  assert.match(card, /--cart-cradle-radius: calc\(var\(--cart-visual-size\) \/ 2 \+ var\(--cart-cradle-gap\)\)/);
  assert.match(card, /--cart-center-inset:/);
  assert.match(card, /--cart-cradle-circle-handle: calc\(var\(--cart-cradle-radius\) \* \.55228475\)/);
  assert.match(card, /--cart-shoulder-ease: calc\(var\(--cart-cradle-shoulder\) \* \.48\)/);
  assert.match(card, /--cart-cradle-tail: clamp\(22px, 6cqw, 26px\)/);
  assert.match(card, /--cart-tail-ease: calc\(var\(--cart-cradle-tail\) \* \.55228475\)/);
  assert.doesNotMatch(card, /--cart-cradle-handle:/);

  const sharedTop = "calc(100% - var(--cart-center-inset) - var(--cart-cradle-radius))";
  const sharedLeft = "calc(100% - var(--cart-center-inset) - var(--cart-cradle-radius))";
  assert.ok(copy.includes(`curve to calc(100% - var(--cart-center-inset)) ${sharedTop}`));
  assert.ok(copy.includes(`curve to ${sharedLeft} calc(100% - var(--cart-center-inset))`));
  assert.match(copy, /with 100% calc\(100% - var\(--cart-center-inset\) - var\(--cart-cradle-radius\) - var\(--cart-cradle-shoulder\) \+ var\(--cart-shoulder-ease\)\)/);
  assert.match(copy, /var\(--cart-cradle-tail\) \+ var\(--cart-tail-ease\)\) 100%/);
  assert.match(recess, /clip-path: var\(--product-copy-surface\)/);
  assert.doesNotMatch(recess, /line to 100% 38%/);
  assert.doesNotMatch(recess, /curve to 59\.5% 100%/);
});

test("product information clears the media wave and keeps responsive side padding", () => {
  const card = rule(".product-card");
  const copy = rule(".product-copy");
  const price = rule(".product-copy .price");
  const tabletCopy = rule(".layout-tablet .product-copy");

  assert.match(card, /--card-info-top-gap:/);
  assert.match(card, /--card-info-top-gap: clamp\(8px, 2\.05cqw, 9\.5px\)/);
  assert.match(card, /--card-info-side-padding:/);
  assert.match(copy, /padding: calc\(var\(--card-wave-right-lift\) \+ var\(--card-info-top-gap\)\) var\(--card-info-side-padding\)/);
  assert.match(price, /max-width: calc\(100% - var\(--cart-visual-size\) - 3px\)/);
  assert.match(tabletCopy, /padding: calc\(var\(--card-wave-right-lift\) \+ var\(--card-info-top-gap\)\)/);
  assert.doesNotMatch(css, /--card-wave-depth/);
});

test("long prices remain inside the cart-safe column without shrinking ordinary card copy", () => {
  const price = rule(".product-copy .price");
  const currentPrice = rule(".product-copy .price strong");
  const oldPrice = rule(".product-copy .price del");
  const compactCurrentPrice = rule('.product-copy .price[data-price-fit="compact"] strong');
  const tightCurrentPrice = rule('.product-copy .price[data-price-fit="tight"] strong');
  const compactOldPrice = rule('.product-copy .price[data-old-price-fit="compact"] del');

  assert.match(price, /max-width: calc\(100% - var\(--cart-visual-size\) - 3px\)/);
  assert.match(price, /flex-wrap: wrap/);
  assert.match(price, /column-gap: clamp\(3px, 1cqw, 5px\)/);
  assert.match(currentPrice, /max-width: 100%/);
  assert.match(currentPrice, /font-size: 17px/);
  assert.match(currentPrice, /font-variant-numeric: tabular-nums/);
  assert.match(oldPrice, /max-width: 100%/);
  assert.match(oldPrice, /font-size: 10px/);
  assert.match(compactCurrentPrice, /font-size: 15\.5px/);
  assert.match(tightCurrentPrice, /font-size: 14px/);
  assert.match(compactOldPrice, /font-size: 9px/);
  assert.match(prototype, /function productCardPriceFit\(formattedPrice: string\)/);
  assert.match(prototype, /if \(digitCount >= 10\) return "tight"/);
  assert.match(prototype, /if \(digitCount >= 8\) return "compact"/);
  assert.match(prototype, /data-price-fit=\{priceFit\} data-old-price-fit=\{oldPriceFit\}/);
});

test("peeled white body carries a narrow contact shadow around the full cart cutout", () => {
  const mask = rule(".cart-cutout-shadow");
  const shadow = rule(".cart-cutout-shadow > i");
  const visibleLayer = rule(".product-copy .cart-cutout-shadow");
  assert.match(mask, /clip-path: shape\(/);
  assert.match(visibleLayer, /z-index: 2/);
  assert.match(mask, /background: transparent/);
  assert.match(mask, /var\(--cart-shadow-lane\)/);
  assert.match(mask, /from 100% calc\(100% - var\(--cart-center-inset\) - var\(--cart-cradle-radius\) - var\(--cart-cradle-shoulder\)\)/);
  assert.match(mask, /var\(--cart-cradle-circle-handle\) \+ var\(--cart-shadow-lane\)/);
  assert.doesNotMatch(mask, /polygon\(/);
  assert.match(mask, /transparent calc\(100% - var\(--cart-center-inset\) - var\(--cart-cradle-radius\) - var\(--cart-cradle-shoulder\) - 1px\)/);
  assert.match(shadow, /clip-path: var\(--product-copy-surface\)/);
  assert.match(shadow, /drop-shadow\(\.55px \.8px \.4px rgba\(20,27,48,\.58\)\)/);
  assert.match(shadow, /drop-shadow\(\.75px 1\.45px \.85px rgba\(32,36,62,\.20\)\)/);
  assert.match(shadow, /transform: none/);
  assert.doesNotMatch(css, /\.product-copy::after\s*\{/);
});

test("cart cradle quarter curve stays circular at the reference kappa", () => {
  const kappa = 0.55228475;
  const cubic = (p0, p1, p2, p3, t) => {
    const mt = 1 - t;
    return mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3;
  };
  let maximumRadialError = 0;
  for (let index = 0; index <= 100; index += 1) {
    const t = index / 100;
    const x = cubic(0, -kappa, -1, -1, t);
    const y = cubic(-1, -1, -kappa, 0, t);
    maximumRadialError = Math.max(maximumRadialError, Math.abs(Math.hypot(x, y) - 1));
  }
  assert.ok(maximumRadialError < .001, `quarter-circle radial error ${maximumRadialError} is too high`);
});

test("cart sits at the balanced corner and uses the reference plus badge", () => {
  const button = rule(".add-cart");
  const visual = rule(".add-cart-visual");
  const plus = rule(".add-cart .cart-state-mark");
  const check = rule(".add-cart .cart-confirm-check");

  assert.match(button, /right: var\(--cart-edge-offset\)/);
  assert.match(button, /bottom: var\(--cart-edge-offset\)/);
  assert.match(button, /width: 48px/);
  assert.match(button, /height: 48px/);
  assert.match(visual, /width: var\(--cart-visual-size\)/);
  assert.match(visual, /height: var\(--cart-visual-size\)/);
  assert.match(plus, /border-radius: 50%/);
  assert.match(plus, /color: var\(--nova-deep\)/);
  assert.match(plus, /background: #fff/);
  assert.match(check, /color: #35d275/);
  assert.doesNotMatch(check, /clip-path/);
  assert.match(rule(".add-cart.feedback:disabled"), /opacity: 1/);
  assert.match(rule(".add-cart.feedback .cart-idle-glyph"), /animation: cart-fold-into-check \.2s ease-out both/);
  assert.match(rule(".add-cart.feedback .cart-confirm-check"), /animation: cart-check-morph \.26s cubic-bezier\(\.2,\.82,\.24,1\) both/);
  assert.match(css, /@keyframes cart-fold-into-check/);
  assert.match(css, /@keyframes cart-check-morph/);
  assert.match(prototype, /<span className="add-cart-visual"><span className="cart-idle-glyph">/);
});

test("reference-scaled card chrome stays compact and light", () => {
  const favorite = rule(".product-media .icon-button");
  const favoriteIcon = rule(".product-media .icon-button svg");
  const discount = rule(".discount-badge");
  const bestseller = rule(".product-copy .bestseller");
  const store = rule(".product-copy small");
  const title = rule(".product-title-action");
  const cartGlyph = rule(".cart-idle-glyph");
  const plus = rule(".add-cart .cart-state-mark");

  assert.match(favorite, /width: 28px/);
  assert.match(favoriteIcon, /width: 15\.5px/);
  assert.match(discount, /top: 9px/);
  assert.match(discount, /left: 9px/);
  assert.match(discount, /font-size: 10\.5px/);
  assert.match(discount, /min-width: 34px/);
  assert.match(discount, /min-height: 27px/);
  assert.match(discount, /background: #fe6303/);
  assert.match(discount, /clip-path: shape\(from 34% 0, line to 92% 0/);
  assert.match(discount, /curve to 12% 100% with 100% 78% \/ 42% 100%/);
  assert.doesNotMatch(discount, /discount-shear|rotate/);
  assert.match(rule(".discount-badge > span"), /translate\(-2\.25px,-\.5px\)/);
  assert.match(prototype, /className="discount-badge"><span>\{badge\}<\/span><\/b>/);
  assert.match(bestseller, /font-size: 7px/);
  assert.match(store, /font-size: 7\.5px/);
  assert.match(title, /font-weight: 500/);
  assert.match(title, /font-size: clamp\(9\.2px, 2\.45cqw, 10\.1px\)/);
  assert.match(cartGlyph, /width: clamp\(19px, 5\.1cqw, 22px\)/);
  assert.match(plus, /top: -2px/);
  assert.match(plus, /right: -1px/);
  assert.match(plus, /stroke-width: 2\.2/);
});

test("first product exposes a protected three-photo card carousel", () => {
  assert.match(prototype, /const PRODUCT_GALLERY = \[/);
  assert.match(prototype, /images: PRODUCT_GALLERY/);
  assert.match(prototype, /<Carousel paged circular page=\{activeImage\} onPageChange=\{setActiveImage\} className="product-media-carousel"/);
  assert.match(prototype, /mediaAssets\.map\(\(asset, index\)/);
  assert.match(prototype, /showMediaImage\(index\)/);
  assert.match(prototype, /aria-label=\{`\$\{index \+ 1\}\. görseli göster`\}/);
  assert.match(prototype, /Görsel \{activeImage \+ 1\} \/ \{mediaAssets\.length\}/);
  assert.doesNotMatch(prototype, /handleMediaScroll|mediaSettleTimer|settledImage/);
  assert.match(prototype, /className="product-gallery-arrows"/);
  assert.doesNotMatch(css, /scroll-snap/);
  assert.match(rule(".product-media-carousel"), /container-type: inline-size/);
  assert.match(rule(".product-media-slide"), /overflow: hidden/);
  const indicator = rule(".product-media-position button.active::after");
  assert.match(indicator, /width: 7px/);
  assert.match(indicator, /height: 7px/);
  assert.match(indicator, /border-radius: 50%/);
});

test("favorite feedback animates without replacing the Phosphor heart icon", () => {
  assert.match(prototype, /if \(favorite\) \{\s+setFavoriteMotion\("remove"\)/);
  assert.match(prototype, /toggleFavorite\(id\);\s+setFavoriteMotion\(null\);\s+\}, 380\)/);
  assert.match(prototype, /setFavoriteMotion\("add"\);\s+toggleFavorite\(id\)/);
  assert.match(prototype, /`favorite-motion-\$\{favoriteMotion\}`/);
  assert.match(prototype, /<PhosphorHeartIcon weight=\{favorite \? "fill" : "regular"\} \/>/);
  assert.match(css, /@keyframes favorite-heart-add/);
  assert.match(css, /@keyframes favorite-heart-remove/);
  assert.match(css, /@keyframes favorite-ring/);
});
