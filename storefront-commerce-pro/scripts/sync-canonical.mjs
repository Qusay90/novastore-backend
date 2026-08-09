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
export const RUNTIME_HOME_HREF = 'href="/"';
export const CANONICAL_MOBILE_HOME_ITEM = '[House,"Ana Sayfa","#/","home"]';
export const RUNTIME_MOBILE_HOME_ITEM = '[House,"Ana Sayfa","/","home"]';
export const CANONICAL_BRAND_STAR_MARK = '<StarFour className="brand-mark" weight="fill" aria-hidden="true" />';
export const EXPECTED_CANONICAL_HOME_HREF_COUNT = 5;
export const EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT = 1;
export const CANONICAL_REACT_IMPORT = 'import { useEffect, useMemo, useRef, useState } from "react";';
export const RUNTIME_REACT_IMPORT = 'import { useContext, useEffect, useMemo, useRef, useState } from "react";';
export const CANONICAL_PORTAL_IMPORT = 'import { createPortal } from "react-dom";';
export const CANONICAL_MODAL_BACKGROUND_QUERY = 'const backgroundNodes = [...document.querySelectorAll("#root > .skip-link, #root > .site-header, #root > main, #root > .site-footer, #root > .mobile-bottom-nav")];';
export const RUNTIME_MODAL_BACKGROUND_QUERY = 'const backgroundNodes = [...document.querySelectorAll("#root > *")];';
export const RUNTIME_COMPARISON_IMPORT = 'import { RuntimeComparisonContext } from "./integration/RuntimeComparisonContext.jsx";';
export const CANONICAL_COMPARISON_STATE = 'const [compared, setCompared] = useState(false);';
export const RUNTIME_COMPARISON_STATE = 'const comparison = useContext(RuntimeComparisonContext);\n  const compared = comparison.ids.has(product.id);';
export const CANONICAL_COMPARISON_TOGGLE = 'onClick={() => setCompared((value) => !value)}';
export const RUNTIME_COMPARISON_TOGGLE = 'disabled={!comparison.available} onClick={() => comparison.toggle(product.id)}';
export const CANONICAL_PRODUCT_DETAIL_SIGNATURE = 'function ProductDetail({ product, favorite, favorites, onFavorite, onAdd }) {';
export const RUNTIME_PRODUCT_DETAIL_SIGNATURE = 'function ProductDetail({ product, favorite, favorites, onFavorite, onAdd, onBuyNow, buyNowPending = false }) {';
export const CANONICAL_PRODUCT_QUANTITY_STATE = 'const [quantity, setQuantity] = useState(1);';
export const CANONICAL_PRODUCT_QUANTITY_CONTROL = '<div className="quantity-control"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(9, value + 1))} aria-label="Adedi artır"><Plus /></button></div>';
export const RUNTIME_PRODUCT_QUANTITY_CONTROL = '<div className="quantity-control"><button type="button" disabled={soldOut || quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" disabled={soldOut || quantity >= maxQuantity} onClick={() => setQuantity((value) => Math.min(maxQuantity, value + 1))} aria-label="Adedi artır"><Plus /></button></div>';
export const CANONICAL_PRODUCT_GALLERY_CLASS = 'className="product-gallery"';
export const RUNTIME_PRODUCT_GALLERY_CLASS = 'className="product-gallery runtime-product-gallery"';
export const CANONICAL_PRODUCT_IMAGE = '<Heart weight={favorite ? "fill" : "regular"} /></button><img src={productImage(product)} alt={product.name} />';
export const CANONICAL_REVIEW_TARGET = 'document.getElementById("reviews")';
export const RUNTIME_REVIEW_TARGET = 'document.getElementById("community-reviews")';
export const CANONICAL_DESKTOP_ADD_BUTTON = '<button className="primary-button" type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}>';
export const CANONICAL_MOBILE_PURCHASE = '<div className="mobile-purchase-bar"><div><small>Toplam</small><strong>{money.format(product.price * quantity)}</strong></div><button type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}><ShoppingCart />{soldOut ? "Tükendi" : "Sepete ekle"}</button></div>';

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

  const existingRuntimeHrefCount = countExactOccurrences(canonicalApp, RUNTIME_HOME_HREF);
  const existingRuntimeMobileCount = countExactOccurrences(canonicalApp, RUNTIME_MOBILE_HOME_ITEM);
  let runtimePresentation = canonicalApp
    .replace(CANONICAL_CATALOG_IMPORT, RUNTIME_CATALOG_IMPORT)
    .replaceAll(CANONICAL_HOME_HREF, RUNTIME_HOME_HREF)
    .replace(CANONICAL_MOBILE_HOME_ITEM, RUNTIME_MOBILE_HOME_ITEM);

  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_BRAND_STAR_MARK,
    "",
    "Integrated runtime brand star",
  );

  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_REACT_IMPORT,
    RUNTIME_REACT_IMPORT,
    "Canonical React import boundary",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PORTAL_IMPORT,
    `${CANONICAL_PORTAL_IMPORT}\n${RUNTIME_COMPARISON_IMPORT}`,
    "Canonical portal import boundary",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_MODAL_BACKGROUND_QUERY,
    RUNTIME_MODAL_BACKGROUND_QUERY,
    "Canonical modal background isolation",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_COMPARISON_STATE,
    RUNTIME_COMPARISON_STATE,
    "Canonical comparison state owner",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_COMPARISON_TOGGLE,
    RUNTIME_COMPARISON_TOGGLE,
    "Canonical comparison toggle owner",
  );
  runtimePresentation = replaceExactOnce(
    runtimePresentation,
    CANONICAL_PRODUCT_DETAIL_SIGNATURE,
    RUNTIME_PRODUCT_DETAIL_SIGNATURE,
    "Canonical product detail boundary",
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
  const mediaDialogRef = useRef(null);
  const mediaCloseRef = useRef(null);
  const activeMedia = runtimeMedia.find((item) => item.id === activeMediaId) || runtimeMedia[0];

  useEffect(() => {
    setActiveMediaId(runtimeMedia[0]?.id);
    setMediaOpen(false);
    setQuantity((current) => Math.min(maxQuantity, Math.max(1, current)));
  }, [maxQuantity, product.id, runtimeMedia]);

  useEffect(() => {
    if (!mediaOpen) return undefined;
    const restorePage = isolatePageFromModal();
    document.body.classList.add("is-locked");
    window.requestAnimationFrame(() => mediaCloseRef.current?.focus());
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMediaOpen(false);
        return;
      }
      keepFocusInDialog(event, mediaDialogRef.current);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("is-locked");
      restorePage();
      restoreFocus(mediaTriggerRef);
    };
  }, [mediaOpen]);`,
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
    CANONICAL_PRODUCT_IMAGE,
    `<Heart weight={favorite ? "fill" : "regular"} /></button><button ref={mediaTriggerRef} className="runtime-product-media-stage" type="button" onClick={() => setMediaOpen(true)} aria-label={\`${"${product.name}"} medyasını büyüt\`}>
              {activeMedia?.type === "video"
                ? <video src={activeMedia.url} muted playsInline preload="metadata" />
                : <img src={activeMedia?.url || productImage(product)} alt={product.name} />}
            </button>
            {runtimeMedia.length > 1 && <div className="runtime-product-thumbnails" aria-label="Ürün medyaları">{runtimeMedia.map((item, index) => <button key={item.id} className={cx(item.id === activeMedia?.id && "is-active")} type="button" aria-label={\`${"${index + 1}"}. medyayı göster\`} aria-pressed={item.id === activeMedia?.id} onClick={() => setActiveMediaId(item.id)}>{item.type === "video" ? <video src={item.url} muted playsInline preload="metadata" /> : <img src={item.url} alt="" />}</button>)}</div>}
            {mediaOpen && activeMedia && createPortal(<div className="runtime-media-lightbox" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setMediaOpen(false)}><div ref={mediaDialogRef} className="runtime-media-lightbox__dialog" role="dialog" aria-modal="true" aria-label={\`${"${product.name}"} medya önizlemesi\`} tabIndex="-1"><button ref={mediaCloseRef} className="runtime-media-lightbox__close" type="button" onClick={() => setMediaOpen(false)} aria-label="Medya önizlemesini kapat"><X /></button>{activeMedia.type === "video" ? <video src={activeMedia.url} controls autoPlay playsInline /> : <img src={activeMedia.url} alt={product.name} />}</div></div>, document.body)}`,
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
  assertExactCount(runtimePresentation, CANONICAL_HOME_HREF, 0, "Runtime hash-only home href owners");
  assertExactCount(
    runtimePresentation,
    RUNTIME_HOME_HREF,
    existingRuntimeHrefCount + EXPECTED_CANONICAL_HOME_HREF_COUNT,
    "Runtime document-root home href owners"
  );
  assertExactCount(runtimePresentation, CANONICAL_MOBILE_HOME_ITEM, 0, "Runtime hash-only mobile home item");
  assertExactCount(runtimePresentation, CANONICAL_BRAND_STAR_MARK, 0, "Runtime brand star mark");
  assertExactCount(
    runtimePresentation,
    RUNTIME_MOBILE_HOME_ITEM,
    existingRuntimeMobileCount + EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
    "Runtime document-root mobile home item"
  );
  assertExactCount(runtimePresentation, RUNTIME_COMPARISON_IMPORT, 1, "Runtime comparison context import");
  assertExactCount(runtimePresentation, RUNTIME_MODAL_BACKGROUND_QUERY, 1, "Runtime modal background isolation");
  assertExactCount(runtimePresentation, RUNTIME_COMPARISON_STATE, 1, "Runtime comparison state owner");
  assertExactCount(runtimePresentation, RUNTIME_COMPARISON_TOGGLE, 1, "Runtime comparison toggle owner");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_DETAIL_SIGNATURE, 1, "Runtime product detail boundary");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_QUANTITY_CONTROL, 1, "Runtime product quantity control");
  assertExactCount(runtimePresentation, RUNTIME_PRODUCT_GALLERY_CLASS, 1, "Runtime product gallery class");
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
    `runtime home transform: href=${EXPECTED_CANONICAL_HOME_HREF_COUNT} mobile=${EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT}`
  );
};

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const normalizePath = (value) => (
  process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value
);
if (invokedPath && normalizePath(invokedPath) === normalizePath(path.resolve(currentFilePath))) {
  await synchronizeCanonical();
}
