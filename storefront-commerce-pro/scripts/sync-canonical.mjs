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
export const EXPECTED_CANONICAL_HOME_HREF_COUNT = 5;
export const EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT = 1;

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

const assertExactCount = (source, token, expected, label) => {
  const actual = countExactOccurrences(source, token);
  if (actual !== expected) {
    throw new Error(`${label} drifted; expected ${expected} exact occurrence(s), found ${actual}.`);
  }
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
  const runtimePresentation = canonicalApp
    .replace(CANONICAL_CATALOG_IMPORT, RUNTIME_CATALOG_IMPORT)
    .replaceAll(CANONICAL_HOME_HREF, RUNTIME_HOME_HREF)
    .replace(CANONICAL_MOBILE_HOME_ITEM, RUNTIME_MOBILE_HOME_ITEM);

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
  assertExactCount(
    runtimePresentation,
    RUNTIME_MOBILE_HOME_ITEM,
    existingRuntimeMobileCount + EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
    "Runtime document-root mobile home item"
  );

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
