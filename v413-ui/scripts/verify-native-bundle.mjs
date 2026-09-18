import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const webRoot = resolve(root, "dist/native");
const androidRoot = resolve(root, "android/app/src/main/assets/public");
const allowedAndroidExtras = new Set(["cordova.js", "cordova_plugins.js"]);
const nativeProfileReceiptPath = "native-build-profile.json";
const nativeProfiles = new Set(["release", "debug", "uat"]);
const profileOrigins = Object.freeze({
  release: Object.freeze({ required: null, forbidden: ["10.0.2.2", "127.0.0.1"] }),
  debug: Object.freeze({ required: "http://10.0.2.2:5000", forbidden: ["127.0.0.1"] }),
  uat: Object.freeze({ required: "http://127.0.0.1:5000", forbidden: ["10.0.2.2"] }),
});
const forbiddenFragments = [
  "phone-stage",
  "phone-bezel",
  "device-screen",
  "android-navigation-bar",
  "keyboard-dock",
  "cal-switcher",
  "Kalibrasyon ekranı seç",
  "V4.13 Kalibrasyon",
  "capture-mode",
];
const forbiddenAssetNames = [
  "Keyboard.png",
  "navigation-bar.svg",
  "Bezel.png",
  "status-icons.svg",
  "pdp-headphones-hero-source.png",
  "product-cart-orb-source.png",
  "novabot-avatar.png",
  ".provenance.txt",
  `${sep}sources${sep}`,
];

function filesUnder(directory) {
  if (!existsSync(directory)) throw new Error(`Missing directory: ${directory}`);
  const output = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) output.push(full);
    }
  };
  visit(directory);
  return output.sort((left, right) => left.localeCompare(right, "en"));
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function normalizedRelative(base, file) {
  return relative(base, file).split(sep).join("/");
}

const webFiles = filesUnder(webRoot);
const manifest = webFiles.map((file) => {
  const bytes = readFileSync(file);
  return {
    path: normalizedRelative(webRoot, file),
    bytes: statSync(file).size,
    sha256: sha256(bytes),
  };
});

const profileReceipt = JSON.parse(readFileSync(resolve(webRoot, nativeProfileReceiptPath), "utf8"));
if (profileReceipt?.schemaVersion !== 1 || !nativeProfiles.has(profileReceipt?.profile)) {
  throw new Error("Native build profile receipt is invalid.");
}

for (const entry of manifest) {
  const synced = resolve(androidRoot, entry.path);
  if (!existsSync(synced)) throw new Error(`Android sync is missing ${entry.path}`);
  const actual = sha256(readFileSync(synced));
  if (actual !== entry.sha256) throw new Error(`Android sync hash mismatch for ${entry.path}`);
  if (forbiddenAssetNames.some((fragment) => synced.includes(fragment))) {
    throw new Error(`Preview-only asset reached the native bundle: ${entry.path}`);
  }
}

const androidExtras = filesUnder(androidRoot)
  .map((file) => normalizedRelative(androidRoot, file))
  .filter((path) => !manifest.some((entry) => entry.path === path));
if (androidExtras.some((path) => !allowedAndroidExtras.has(path))) {
  throw new Error(`Unexpected Android asset extras: ${androidExtras.join(", ")}`);
}

for (const entry of manifest.filter(({ path }) => /\.(?:css|html|js)$/.test(path))) {
  const text = readFileSync(resolve(webRoot, entry.path), "utf8");
  const forbidden = forbiddenFragments.find((fragment) => text.includes(fragment));
  if (forbidden) throw new Error(`Preview-only runtime fragment '${forbidden}' found in ${entry.path}`);
}

const index = readFileSync(resolve(webRoot, "index.html"), "utf8");
if (!index.includes("connect-src 'none'") || !index.includes("frame-src 'none'")) {
  throw new Error("Native Content-Security-Policy is not fail-closed.");
}
if (/__NOVASTORE_NATIVE_(?:IMAGE|MEDIA)_ORIGIN__/.test(index)) {
  throw new Error("Native asset-origin placeholder reached the built bundle.");
}
const profilePolicy = profileOrigins[profileReceipt.profile];
const expectedMediaSources = "'self' https://novastore.tr https://www.novastore.tr https://res.cloudinary.com"
  + (profilePolicy.required ? ` ${profilePolicy.required}` : "");
if (index.match(/(?:^|;)\s*media-src\s+([^;]+)/)?.[1].trim() !== expectedMediaSources) {
  throw new Error("Native public-media policy does not match the approved profile origins.");
}
if (profilePolicy.required && !index.includes(profilePolicy.required)) {
  throw new Error(`Native ${profileReceipt.profile} image origin is missing.`);
}
for (const forbiddenOrigin of profilePolicy.forbidden) {
  if (manifest.some(({ path }) => /\.(?:css|html|js|json)$/.test(path)
      && readFileSync(resolve(webRoot, path), "utf8").includes(forbiddenOrigin))) {
    throw new Error(`Forbidden backend origin reached the native ${profileReceipt.profile} bundle.`);
  }
}

const treeInput = manifest.map((entry) => `${entry.path}\0${entry.bytes}\0${entry.sha256}\n`).join("");
const receipt = {
  profile: profileReceipt.profile,
  webBuildSha256: sha256(Buffer.from(treeInput)),
  fileCount: manifest.length,
  totalBytes: manifest.reduce((total, entry) => total + entry.bytes, 0),
  syncedAssets: manifest.length,
  allowedCapacitorPlaceholders: androidExtras.sort(),
  forbiddenRuntimeMatches: 0,
  forbiddenBackendOriginMatches: 0,
};
console.log(JSON.stringify(receipt, null, 2));
