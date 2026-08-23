import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(currentFilePath), "..");
const canonicalPath = path.join(root, "canonical", "NovaStore-Commerce-Pro.html");
const cssPath = path.join(root, "src", "canonical.css");
const appPath = path.join(root, "src", "App.jsx");
const runtimePresentationPath = path.join(root, "src", "CanonicalRuntimePresentation.jsx");

const EXPECTED_HTML_SHA256 = "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d";
const EXPECTED_APP_SHA256 = "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6";
const EXPECTED_SCRIPT_SHA256 = "06c0c03c68cb90659c5324a2035cd01b76c1dcea9dfe0a7d2dd5544d040605d9";
const EXPECTED_CSS_SHA256 = "5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896";

export const CANONICAL_CATALOG_IMPORT = '} from "./catalog.js";';
export const RUNTIME_CATALOG_IMPORT = '} from "./integration/runtimeCatalog.js";';
export const CANONICAL_HOME_HREF = 'href="#/"';
export const RUNTIME_HOME_HREF = 'href="#/"';
export const CANONICAL_MOBILE_HOME_ITEM = '[House,"Ana Sayfa","#/","home"]';
export const RUNTIME_MOBILE_HOME_ITEM = '[House,"Ana Sayfa","#/","home"]';
export const CANONICAL_BRAND_STAR_MARK = '<StarFour className="brand-mark" weight="fill" aria-hidden="true" />';
export const EXPECTED_CANONICAL_HOME_HREF_COUNT = 5;
export const EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT = 1;
export const CANONICAL_REACT_IMPORT = 'import { useEffect, useMemo, useRef, useState } from "react";';
export const RUNTIME_REACT_IMPORT = CANONICAL_REACT_IMPORT;
export const CANONICAL_PORTAL_IMPORT = 'import { createPortal } from "react-dom";';
export const CANONICAL_ICON_IMPORT = '} from "@phosphor-icons/react";';
export const RUNTIME_ICON_IMPORT = '} from "./CustomerIcon.jsx";';
export const CANONICAL_SPARKLE_IMPORT = '  Sparkle,\n';
export const RUNTIME_SEMANTIC_IMPORTS = '  BadgePercent,\n  Flower,\n';
export const CANONICAL_STAR_FOUR_IMPORT = '  StarFour,\n';
export const CANONICAL_COSMETICS_ICON = '  "kozmetik-kisisel-bakim": Sparkle,';
export const RUNTIME_COSMETICS_ICON = '  "kozmetik-kisisel-bakim": Flower,';
export const CANONICAL_DEALS_ICON = '<a className="deals-link" href="#/koleksiyon/firsatlar"><Sparkle weight="fill" /> Fırsatlar</a>';
export const RUNTIME_DEALS_ICON = '<a className="deals-link" href="#/koleksiyon/firsatlar"><BadgePercent /> Fırsatlar</a>';
export const CANONICAL_HOME_DECORATION = '<span className="section-kicker"><Sparkle weight="fill" /> Nova seçkisi</span>';
export const RUNTIME_HOME_DECORATION = '<span className="section-kicker">Nova seçkisi</span>';
export const CANONICAL_PRICE_NOTIFICATION_ICON = '<article><Sparkle /><span><strong>Favori ürününde fiyat avantajı var</strong>';
export const RUNTIME_PRICE_NOTIFICATION_ICON = '<article><BadgePercent /><span><strong>Favori ürününde fiyat avantajı var</strong>';
export const CANONICAL_MODAL_BACKGROUND_QUERY = 'const backgroundNodes = [...document.querySelectorAll("#root > .skip-link, #root > .site-header, #root > main, #root > .site-footer, #root > .mobile-bottom-nav")];';
export const RUNTIME_MODAL_BACKGROUND_QUERY = 'const backgroundNodes = [...document.querySelectorAll("#root > *")];';
export const RUNTIME_COMPARISON_IMPORT = 'import { RuntimeComparisonContext } from "./integration/RuntimeComparisonContext.jsx";';
export const RUNTIME_PRODUCT_CARD_IMPORT = 'import { CustomerProductCard } from "./CustomerProductCard.jsx";';
export const RUNTIME_FAVORITE_BUTTON_IMPORT = 'import { CustomerFavoriteButton } from "./CustomerFavoriteButton.jsx";';
export const RUNTIME_PRODUCT_MEDIA_LIGHTBOX_IMPORT = 'import { ProductMediaLightbox } from "./ProductMediaLightbox.jsx";';
export const CANONICAL_COMPARISON_STATE = 'const [compared, setCompared] = useState(false);';
export const RUNTIME_COMPARISON_STATE = 'const comparison = useContext(RuntimeComparisonContext);\n  const compared = comparison.ids.has(product.id);';
export const CANONICAL_COMPARISON_TOGGLE = 'onClick={() => setCompared((value) => !value)}';
export const RUNTIME_COMPARISON_TOGGLE = 'disabled={!comparison.available} onClick={() => comparison.toggle(product.id)}';
export const CANONICAL_PRODUCT_DETAIL_SIGNATURE = 'function ProductDetail({ product, favorite, favorites, onFavorite, onAdd }) {';
export const RUNTIME_PRODUCT_DETAIL_SIGNATURE = 'function ProductDetail({ product, favorite, favorites, onFavorite, onAdd, onBuyNow, buyNowPending = false }) {';
export const CANONICAL_PRODUCT_IMAGE_FUNCTION = 'function productImage(product) {\n  return IMAGE_MAP[product.imageKey] || phoneImage;\n}';
export const RUNTIME_PRODUCT_IMAGE_FUNCTION = 'function productImage(product) {\n  return product?.imageUrl || IMAGE_MAP[product?.imageKey] || phoneImage;\n}';
export const CANONICAL_PRODUCT_QUANTITY_STATE = 'const [quantity, setQuantity] = useState(1);';
export const CANONICAL_PRODUCT_QUANTITY_CONTROL = '<div className="quantity-control"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(9, value + 1))} aria-label="Adedi artır"><Plus /></button></div>';
export const RUNTIME_PRODUCT_QUANTITY_CONTROL = '<div className="quantity-control"><button type="button" disabled={soldOut || quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" disabled={soldOut || quantity >= maxQuantity} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} aria-label="Adedi artır"><Plus /></button></div>';
export const CANONICAL_PRODUCT_GALLERY_CLASS = 'className="product-gallery"';
export const RUNTIME_PRODUCT_GALLERY_CLASS = 'className="product-gallery runtime-product-gallery"';
export const CANONICAL_PRODUCT_FAVORITE_BUTTON = '<button className={cx("favorite-button", favorite && "is-active")} type="button" onClick={() => onFavorite(product.id)} aria-pressed={favorite} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}><Heart weight={favorite ? "fill" : "regular"} /></button>';
export const RUNTIME_PRODUCT_FAVORITE_BUTTON = '<CustomerFavoriteButton productId={product.id} productName={product.name} favorite={favorite} onFavorite={onFavorite} />';
export const CANONICAL_PRODUCT_IMAGE = '<img src={productImage(product)} alt={product.name} />';
export const RUNTIME_PRODUCT_IMAGE_BOUNDARY = `${RUNTIME_PRODUCT_FAVORITE_BUTTON}${CANONICAL_PRODUCT_IMAGE}`;
export const CANONICAL_PRODUCT_ZOOM_NOTE = '<span className="zoom-note"><span>Görseli büyütmek için üzerine gel</span><b>Dokunarak büyüt</b></span>';
export const RUNTIME_PRODUCT_ZOOM_NOTE = '<span className="zoom-note"><span>Tam görsel için tıkla</span><b>Dokunarak büyüt</b></span>';
export const CANONICAL_REVIEW_TARGET = 'document.getElementById("reviews")';
export const RUNTIME_REVIEW_TARGET = 'document.getElementById("community-reviews")';
export const CANONICAL_DESKTOP_ADD_BUTTON = '<button className="primary-button" type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}>';
export const CANONICAL_MOBILE_PURCHASE = '<div className="mobile-purchase-bar"><div><small>Toplam</small><strong>{money.format(product.price * quantity)}</strong></div><button type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}><ShoppingCart />{soldOut ? "Tükendi" : "Sepete ekle"}</button></div>';
export const CANONICAL_PRODUCT_CARD_SIGNATURE = 'function ProductCard({ product, favorite, onFavorite, onAdd }) {';
export const CANONICAL_PRODUCT_GRID_SIGNATURE = 'function ProductGrid({ items, favorites, onFavorite, onAdd, compact = false }) {';
export const RUNTIME_PRODUCT_CARD = `function ProductCard({ product, favorite, onFavorite, onAdd }) {
  return <CustomerProductCard product={product} favorite={favorite} onFavorite={onFavorite} onAdd={onAdd} mediaFallback={productImage(product)} />;
}`;

export const RUNTIME_EXPORTS = `
export {
  BenefitStrip,
  Breadcrumbs,
  CartDrawer,
  CategoryLanding,
  FavoritesPage,
  Footer,
  Header,
  HomePage,
  LoadingPage,
  Logo,
  MobileBottomNav,
  MobileCategoryDrawer,
  NotFound,
  ProductDetail,
  ProductListing,
  TrustBar,
};
`;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export const countExactOccurrences = (source, token) => {
  if (typeof source !== "string" || typeof token !== "string" || token.length === 0) {
    throw new TypeError("Exact occurrence counting requires a string source and a non-empty token.");
  }
  return source.split(token).length - 1;
};

export const assertExactCount = (source, token, expected, label) => {
  const actual = countExactOccurrences(source, token);
  if (actual !== expected) {
    throw new Error(`${label} drifted; expected ${expected} exact occurrence(s), found ${actual}.`);
  }
};

const replaceExactOnce = (source, token, replacement, label) => {
  assertExactCount(source, token, 1, label);
  return source.replace(token, replacement);
};

const replaceProductCard = (source) => {
  assertExactCount(source, CANONICAL_PRODUCT_CARD_SIGNATURE, 1, "Canonical product card signature");
  assertExactCount(source, CANONICAL_PRODUCT_GRID_SIGNATURE, 1, "Canonical product grid signature");
  const start = source.indexOf(CANONICAL_PRODUCT_CARD_SIGNATURE);
  const end = source.indexOf(CANONICAL_PRODUCT_GRID_SIGNATURE, start);
  const block = source.slice(start, end);
  assertExactCount(block, CANONICAL_COMPARISON_STATE, 1, "Canonical product card comparison state");
  assertExactCount(block, CANONICAL_COMPARISON_TOGGLE, 1, "Canonical product card comparison toggle");
  return `${source.slice(0, start)}${RUNTIME_PRODUCT_CARD}\n\n${source.slice(end)}`;
};

export const createRuntimePresentation = (canonicalApp) => {
  assertExactCount(canonicalApp, CANONICAL_CATALOG_IMPORT, 1, "Canonical catalog import boundary");
  assertExactCount(
    canonicalApp,
    CANONICAL_HOME_HREF,
    EXPECTED_CANONICAL_HOME_HREF_COUNT,
    "Canonical document-root home href owners"
  );
  assertExactCount(
    canonicalApp,
    CANONICAL_MOBILE_HOME_ITEM,
    EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
    "Canonical mobile home item"
  );

  let runtimePresentation = canonicalApp
    .replace(CANONICAL_CATALOG_IMPORT, RUNTIME_CATALOG_IMPORT);

  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_ICON_IMPORT,
    RUNTIME_ICON_IMPORT,
    "Canonical icon import boundary",
  );

  runtimePresentation = replaceExactOnce(runtimePresentation, CANONICAL_SPARKLE_IMPORT, RUNTIME_SEMANTIC_IMPORTS, "Canonical decorative sparkle import");
  runtimePresentation = replaceExactOnce(runtimePresentation, CANONICAL_STAR_FOUR_IMPORT, "", "Canonical decorative brand icon import");
  runtimePresentation = replaceExactOnce(runtimePresentation, CANONICAL_COSMETICS_ICON, RUNTIME_COSMETICS_ICON, "Canonical cosmetics semantic icon");
  runtimePresentation = replaceExactOnce(runtimePresentation, CANONICAL_DEALS_ICON, RUNTIME_DEALS_ICON, "Canonical deals semantic icon");
  runtimePresentation = replaceExactOnce(runtimePresentation, CANONICAL_HOME_DECORATION, RUNTIME_HOME_DECORATION, "Canonical home decorative sparkle");
  runtimePresentation = replaceExactOnce(runtimePresentation, CANONICAL_PRICE_NOTIFICATION_ICON, RUNTIME_PRICE_NOTIFICATION_ICON, "Canonical notification semantic icon");

  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_BRAND_STAR_MARK,
    "",
    "Integrated runtime brand star",
  );

  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PORTAL_IMPORT,
    `${CANONICAL_PORTAL_IMPORT}\n${RUNTIME_PRODUCT_CARD_IMPORT}\n${RUNTIME_FAVORITE_BUTTON_IMPORT}\n${RUNTIME_PRODUCT_MEDIA_LIGHTBOX_IMPORT}`,
    "Canonical portal import boundary",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_MODAL_BACKGROUND_QUERY,
    RUNTIME_MODAL_BACKGROUND_QUERY,
    "Canonical modal background isolation",
  );
  runtimePresentation = replaceProductCard(runtimePresentation);
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_DETAIL_SIGNATURE,
    RUNTIME_PRODUCT_DETAIL_SIGNATURE,
    "Canonical product detail boundary",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_IMAGE_FUNCTION,
    RUNTIME_PRODUCT_IMAGE_FUNCTION,
    "Canonical product image resolver",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_QUANTITY_STATE,
    `${CANONICAL_PRODUCT_QUANTITY_STATE}
  const maxQuantity = Math.max(1, Math.min(9, Number(product.stock) || 1));
  const runtimeMedia = useMemo(() => {
    const media = Array.isArray(product.media)
      ? product.media.filter((item) => item?.url && ["image", "video"].includes(item.type))
      : [];
    return media.length > 0
      ? media
      : [{ id: \`${"${product.id}"}-primary\`, url: productImage(product), type: "image", isMain: true }];
  }, [product]);
  const [activeMediaId, setActiveMediaId] = useState(() => runtimeMedia[0]?.id);
  const [mediaOpen, setMediaOpen] = useState(false);
  const mediaTriggerRef = useRef(null);
  const activeMedia = runtimeMedia.find((item) => item.id === activeMediaId) || runtimeMedia[0];

  useEffect(() => {
    setActiveMediaId(runtimeMedia[0]?.id);
    setMediaOpen(false);
    setQuantity((current) => Math.min(maxQuantity, Math.max(1, current)));
  }, [maxQuantity, product.id, runtimeMedia]);`,
    "Canonical product quantity state",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_GALLERY_CLASS,
    RUNTIME_PRODUCT_GALLERY_CLASS,
    "Canonical product gallery class",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_FAVORITE_BUTTON,
    RUNTIME_PRODUCT_FAVORITE_BUTTON,
    "Canonical product detail favorite owner",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    RUNTIME_PRODUCT_IMAGE_BOUNDARY,
    `${RUNTIME_PRODUCT_FAVORITE_BUTTON}<button ref={mediaTriggerRef} className="runtime-product-media-stage" type="button" onClick={() => setMediaOpen(true)} aria-label={\`${"${product.name}"} medyasını büyüt\`}>
              {activeMedia?.type === "video"
                ? <video src={activeMedia.url} muted playsInline preload="metadata" />
                : <img src={activeMedia?.url || productImage(product)} alt={product.name} />}
            </button>
            {runtimeMedia.length > 1 && <div className="runtime-product-thumbnails" aria-label="Ürün medyaları">{runtimeMedia.map((item, index) => <button key={item.id} className={cx(item.id === activeMedia?.id && "is-active")} type="button" aria-label={\`${"${index + 1}"}. medyayı göster\`} aria-pressed={item.id === activeMedia?.id} onClick={() => setActiveMediaId(item.id)}>{item.type === "video" ? <video src={item.url} muted playsInline preload="metadata" /> : <img src={item.url} alt="" />}</button>)}</div>}
            <ProductMediaLightbox activeMediaId={activeMedia?.id} media={runtimeMedia} onActiveMediaIdChange={setActiveMediaId} onClose={() => setMediaOpen(false)} open={mediaOpen} productName={product.name} returnFocusRef={mediaTriggerRef} />`,
    "Canonical product image owner",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_QUANTITY_CONTROL,
    RUNTIME_PRODUCT_QUANTITY_CONTROL,
    "Canonical product quantity control",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_ZOOM_NOTE,
    RUNTIME_PRODUCT_ZOOM_NOTE,
    "Runtime product zoom note",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_REVIEW_TARGET,
    RUNTIME_REVIEW_TARGET,
    "Canonical review anchor",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_DESKTOP_ADD_BUTTON,
    `<button className="buy-now-button" type="button" disabled={soldOut || buyNowPending || typeof onBuyNow !== "function"} onClick={() => onBuyNow?.(product.id, quantity)}><CreditCard /> {buyNowPending ? "Hazırlanıyor" : "Hemen Al"}</button>${CANONICAL_DESKTOP_ADD_BUTTON}`,
    "Canonical desktop add button",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_MOBILE_PURCHASE,
    '<div className="mobile-purchase-bar"><div><small>Toplam</small><strong>{money.format(product.price * quantity)}</strong></div><button type="button" disabled={soldOut || buyNowPending || typeof onBuyNow !== "function"} onClick={() => onBuyNow?.(product.id, quantity)}><CreditCard />{soldOut ? "Tükendi" : buyNowPending ? "Hazırlanıyor" : "Hemen Al"}</button></div>',
    "Canonical mobile purchase owner",
  );

  assertExactCount(runtimePresentation, CANONICAL_CATALOG_IMPORT, 0, "Runtime canonical catalog import");
  assertExactCount(runtimePresentation, RUNTIME_CATALOG_IMPORT, 1, "Runtime catalog import boundary");
  assertExactCount(runtimePresentation, CANONICAL_HOME_HREF, EXPECTED_CANONICAL_HOME_HREF_COUNT, "Runtime hash-router home href owners");
  assertExactCount(
    runtimePresentation,
    RUNTIME_HOME_HREF,
    EXPECTED_CANONICAL_HOME_HREF_COUNT,
    "Runtime hash-router home href owners"
  );
  assertExactCount(runtimePresentation, CANONICAL_MOBILE_HOME_ITEM, EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT, "Runtime hash-router mobile home item");
  assertExactCount(runtimePresentation, CANONICAL_BRAND_STAR_MARK, 0, "Runtime brand star mark");
  assertExactCount(
    runtimePresentation,
    RUNTIME_MOBILE_HOME_ITEM,
    EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
    "Runtime hash-router mobile home item"
  );
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_CARD_IMPORT, 1, "Runtime shared product card import");
  assertExactCount(runtimePresentation, RUNTIME_FAVORITE_BUTTON_IMPORT, 1, "Runtime shared favorite button import");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_MEDIA_LIGHTBOX_IMPORT, 1, "Runtime product media lightbox import");
  assertExactCount(runtimePresentation, RUNTIME_ICON_IMPORT, 1, "Runtime Lucide icon boundary");
  assertExactCount(runtimePresentation, RUNTIME_MODAL_BACKGROUND_QUERY, 1, "Runtime modal background isolation");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_CARD, 1, "Runtime shared product card owner");
  assertExactCount(runtimePresentation, CANONICAL_ICON_IMPORT, 0, "Runtime Phosphor icon import");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_DETAIL_SIGNATURE, 1, "Runtime product detail boundary");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_QUANTITY_CONTROL, 1, "Runtime product quantity control");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_GALLERY_CLASS, 1, "Runtime product gallery class");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_FAVORITE_BUTTON, 1, "Runtime shared product detail favorite owner");
  assertExactCount(runtimePresentation, RUNTIME_REVIEW_TARGET, 1, "Runtime review anchor");

  return `${runtimePresentation.trimEnd()}\n${RUNTIME_EXPORTS}`;
};

export const synchronizeCanonical = async () => {
  const [html, canonicalApp] = await Promise.all([
    readFile(canonicalPath, "utf8"),
    readFile(appPath, "utf8"),
  ]);
  if (sha256(html) !== EXPECTED_HTML_SHA256) {
    throw new Error("Kanonik Commerce Pro HTML parmak izi değişti; senkronizasyon durduruldu.");
  }
  if (sha256(canonicalApp) !== EXPECTED_APP_SHA256) {
    throw new Error("Canonical App.jsx hash changed; runtime presentation was not generated.");
  }

  const scriptTagStart = html.lastIndexOf('<script type="module"');
  const scriptStart = html.indexOf(">", scriptTagStart) + 1;
  const scriptEnd = html.indexOf("</script>", scriptStart);
  const styleTagStart = html.lastIndexOf("<style ");
  const styleStart = html.indexOf(">", styleTagStart) + 1;
  const styleEnd = html.indexOf("</style>", styleStart);

  if (scriptTagStart < 0 || scriptStart <= 0 || scriptEnd < 0 || styleTagStart < 0 || styleStart <= 0 || styleEnd < 0) {
    throw new Error("Kanonik HTML içindeki tek dosyalık script/style sınırları bulunamadı.");
  }

  const script = html.slice(scriptStart, scriptEnd);
  const css = html.slice(styleStart, styleEnd);
  if (sha256(script) !== EXPECTED_SCRIPT_SHA256) {
    throw new Error("Kanonik React/etkileşim bundle parmak izi eşleşmiyor.");
  }
  if (sha256(css) !== EXPECTED_CSS_SHA256) {
    throw new Error("Kanonik CSS/font katmanı parmak izi eşleşmiyor.");
  }

  const runtimePresentation = createRuntimePresentation(canonicalApp);
  await Promise.all([
    writeFile(cssPath, css, "utf8"),
    writeFile(runtimePresentationPath, runtimePresentation, "utf8"),
  ]);
  console.log(`canonical CSS synchronized: ${css.length} characters`);
  console.log("canonical runtime presentation synchronized from App.jsx");
  console.log(
    `runtime home preservation: href=${EXPECTED_CANONICAL_HOME_HREF_COUNT} mobile=${EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT}`
  );
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const normalizePath = (value) => (
  process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value
);
if (invokedPath && normalizePath(invokedPath) === normalizePath(path.resolve(currentFilePath))) {
  await synchronizeCanonical();
}
