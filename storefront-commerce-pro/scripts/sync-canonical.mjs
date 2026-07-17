import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = path.join(root, "canonical", "NovaStore-Commerce-Pro.html");
const cssPath = path.join(root, "src", "canonical.css");
const appPath = path.join(root, "src", "App.jsx");
const runtimePresentationPath = path.join(root, "src", "CanonicalRuntimePresentation.jsx");

const EXPECTED_HTML_SHA256 = "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d";
const EXPECTED_APP_SHA256 = "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6";
const EXPECTED_SCRIPT_SHA256 = "06c0c03c68cb90659c5324a2035cd01b76c1dcea9dfe0a7d2dd5544d040605d9";
const EXPECTED_CSS_SHA256 = "5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

const runtimeCatalogImport = '} from "./catalog.js";';
const runtimePresentation = canonicalApp.replace(
  runtimeCatalogImport,
  '} from "./integration/runtimeCatalog.js";',
);
if (runtimePresentation === canonicalApp) {
  throw new Error("Canonical App.jsx catalog import boundary was not found.");
}

const runtimeExports = `
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

await Promise.all([
  writeFile(cssPath, css, "utf8"),
  writeFile(runtimePresentationPath, `${runtimePresentation.trimEnd()}\n${runtimeExports}`, "utf8"),
]);
console.log(`canonical CSS synchronized: ${css.length} characters`);
console.log("canonical runtime presentation synchronized from App.jsx");
