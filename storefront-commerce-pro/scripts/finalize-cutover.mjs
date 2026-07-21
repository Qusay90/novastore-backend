import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "..");
const targetPath = path.join(repositoryRoot, "frontend", "commerce-pro", "index.html");
const configPath = path.join(root, "vite.cutover.config.mjs");
const tempPrefix = "novastore-commerce-pro-cutover-";

const EXPECTED = Object.freeze({
  canonical: "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d",
  app: "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6",
  catalog: "a38d2e5f5a09fdc47bd9102800b04c423cf19b8d4d6bc952b77a5b77dc74062d",
  css: "5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896",
});

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertSafeTempRoot(tempRoot) {
  const systemTempRoot = path.resolve(os.tmpdir());
  const resolved = path.resolve(tempRoot);
  const relative = path.relative(systemTempRoot, resolved);
  if (
    !relative
    || relative.startsWith("..")
    || path.isAbsolute(relative)
    || !path.basename(resolved).startsWith(tempPrefix)
  ) {
    throw new Error("Güvenli olmayan cutover temp yolu reddedildi.");
  }
}

function assertIntegratedSourceChain(sources) {
  const ownerState = sources.cutover.indexOf('/shared-state-sync.js');
  const ownerFavorites = sources.cutover.indexOf('/favorites-sync.js');
  const runtimeEntry = sources.cutover.indexOf('/src/main-integrated.jsx');
  if (!(ownerState >= 0 && ownerState < ownerFavorites && ownerFavorites < runtimeEntry)) {
    throw new Error("Cutover owner script sırası veya integrated entrypoint bozuldu.");
  }
  if (!sources.mainIntegrated.includes('from "./IntegratedApp.jsx"')) {
    throw new Error("main-integrated.jsx IntegratedApp sınırını kullanmıyor.");
  }
  if (
    !sources.integratedApp.includes('from "./integration/useCommerceRuntime.js"')
    || !sources.integratedApp.includes('from "./CanonicalRuntimePresentation.jsx"')
  ) {
    throw new Error("IntegratedApp canonical sunum veya gerçek runtime hook sınırını kaybetti.");
  }
  if (!sources.runtimeHook.includes('from "./createCommerceRuntime.js"')) {
    throw new Error("useCommerceRuntime gerçek Commerce runtime factory kullanmıyor.");
  }
  for (const requiredAdapter of [
    "createCatalogAdapter",
    "createCartAdapter",
    "createFavoritesAdapter",
    "createCheckoutAdapter",
    "createCustomerAccountAdapter",
  ]) {
    if (!sources.runtimeFactory.includes(requiredAdapter)) {
      throw new Error(`Gerçek runtime adapter sınırı eksik: ${requiredAdapter}`);
    }
  }
  const productionChain = [sources.cutover, sources.mainIntegrated, sources.integratedApp, sources.runtimeHook, sources.runtimeFactory].join("\n");
  for (const forbidden of ["createCanonicalFixtureRuntime", "main-integrated-fixture", "fixture-integrated.html"]) {
    if (productionChain.includes(forbidden)) {
      throw new Error(`Production source zincirinde fixture izi bulundu: ${forbidden}`);
    }
  }
}

function validateArtifact(buffer) {
  const html = buffer.toString("utf8");
  for (const required of [
    "novastore-artifact-kind",
    "production-candidate",
    "scripts/finalize-cutover.mjs",
    "src/main-integrated.jsx",
    "IntegratedApp:createCommerceRuntime",
    "connect-src 'self'",
    "/shared-state-sync.js",
    "/favorites-sync.js",
    "/api/products",
    "/api/public/categories",
    "/api/public/collections",
    "/api/addresses",
    "/api/campaigns/quote",
    "/api/payments/initialize",
    "/api/notifications/user/",
    "/api/messages/history/",
    "/api/reviews/product/",
    "/api/questions/product/",
    "/api/assistant/chat",
    "#/giris",
    "#/hesabim",
    "#/favoriler",
    "#/sepet",
    "#/odeme/teslimat",
    "Tükendi",
  ]) {
    if (!html.includes(required)) throw new Error(`Production artifact sınırı eksik: ${required}`);
  }

  if (!/import\s*["']\/shared-state-sync\.js["'];\s*import\s*["']\/favorites-sync\.js["']/.test(html)) {
    throw new Error("Production artifact shared cart/favorites owner sırasını korumuyor.");
  }

  const forbiddenPatterns = [
    [/createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i, "fixture runtime"],
    [/commerce-pro-(?:preview|integration-preview)|noindex|nofollow/i, "preview/noindex"],
    [/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/i, "local development URL"],
    [/file:\/\//i, "file URL"],
    [/[A-Za-z]:[\\/](?:Users|Windows|Program Files|AppData|Temp)[\\/]/i, "Windows absolute path"],
    [/(?:AppData[\\/]Local[\\/]Temp|novastore-commerce-pro-cutover-)/i, "temp path"],
    [/(?:@vite\/client|vite\/dist\/client|sourceMappingURL)/i, "dev/sourcemap marker"],
  ];
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(html)) throw new Error(`Production artifact yasaklı ${label} içeriyor.`);
  }

  const origins = [...html.matchAll(/https?:\/\/[^"'`\s<>\)]+/g)].map((match) => match[0]);
  const unexpectedOrigins = origins.filter((origin) => !origin.startsWith("http://www.w3.org/"));
  if (unexpectedOrigins.length > 0) {
    throw new Error(`Production artifact beklenmeyen external origin içeriyor: ${[...new Set(unexpectedOrigins)].join(", ")}`);
  }

  if (!html.endsWith("\n") || html.includes("\r")) {
    throw new Error("Production artifact LF/final newline sözleşmesini karşılamıyor.");
  }
}

async function replaceTarget(candidatePath, candidateBuffer, tempRoot) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  let existing = null;
  try {
    existing = await readFile(targetPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (existing?.equals(candidateBuffer)) return "unchanged";
  if (!existing) {
    await rename(candidatePath, targetPath);
    return "created";
  }

  const backupPath = path.join(tempRoot, "previous-index.html");
  await rename(targetPath, backupPath);
  try {
    await rename(candidatePath, targetPath);
  } catch (error) {
    await rename(backupPath, targetPath);
    throw error;
  }
  return "replaced";
}

const [canonical, app, catalog, css, cutover, mainIntegrated, integratedApp, runtimeHook, runtimeFactory] = await Promise.all([
  readFile(path.join(root, "canonical", "NovaStore-Commerce-Pro.html")),
  readFile(path.join(root, "src", "App.jsx")),
  readFile(path.join(root, "src", "catalog.js")),
  readFile(path.join(root, "src", "canonical.css")),
  readFile(path.join(root, "cutover.html"), "utf8"),
  readFile(path.join(root, "src", "main-integrated.jsx"), "utf8"),
  readFile(path.join(root, "src", "IntegratedApp.jsx"), "utf8"),
  readFile(path.join(root, "src", "integration", "useCommerceRuntime.js"), "utf8"),
  readFile(path.join(root, "src", "integration", "createCommerceRuntime.js"), "utf8"),
]);

for (const [label, buffer] of Object.entries({ canonical, app, catalog, css })) {
  if (sha256(buffer) !== EXPECTED[label]) {
    throw new Error(`${label} canonical parmak izi değişti; cutover build reddedildi.`);
  }
}
assertIntegratedSourceChain({ cutover, mainIntegrated, integratedApp, runtimeHook, runtimeFactory });

const tempRoot = await mkdtemp(path.join(os.tmpdir(), tempPrefix));
assertSafeTempRoot(tempRoot);
const previousOutputRoot = process.env.NOVASTORE_CUTOVER_OUT_DIR;

try {
  process.env.NOVASTORE_CUTOVER_OUT_DIR = tempRoot;
  await build({ configFile: configPath, mode: "production", logLevel: "info" });

  const outputFiles = await readdir(tempRoot);
  if (outputFiles.length !== 1 || outputFiles[0] !== "cutover.html") {
    throw new Error(`Cutover build tek HTML üretmedi: ${outputFiles.join(", ")}`);
  }

  const built = await readFile(path.join(tempRoot, "cutover.html"), "utf8");
  const normalized = `${built.replace(/\r\n?/g, "\n").trimEnd()}\n`;
  const artifact = Buffer.from(normalized, "utf8");
  validateArtifact(artifact);

  const candidatePath = path.join(tempRoot, "production-index.html");
  await writeFile(candidatePath, artifact);
  const writeStatus = await replaceTarget(candidatePath, artifact, tempRoot);
  const persisted = await readFile(targetPath);
  if (!persisted.equals(artifact)) throw new Error("Yazılan production artifact aday baytları değişti.");

  console.log(`cutover artifact verified: ${sha256(artifact)}`);
  console.log(`cutover artifact write: ${writeStatus}`);
} finally {
  if (previousOutputRoot === undefined) delete process.env.NOVASTORE_CUTOVER_OUT_DIR;
  else process.env.NOVASTORE_CUTOVER_OUT_DIR = previousOutputRoot;
  assertSafeTempRoot(tempRoot);
  await rm(tempRoot, { recursive: true, force: true });
}
