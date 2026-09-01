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

const previousNodeEnvironment = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
const { build } = await import("vite");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "..");
const targetPath = path.join(repositoryRoot, "frontend", "commerce-pro", "index.html");
const configPath = path.join(root, "vite.cutover.config.mjs");
const tempPrefix = "novastore-commerce-pro-cutover-";
const SERVED_RUNTIME_SCRIPTS = Object.freeze([
  Object.freeze({
    requestPath: "/shared-state-sync.js",
    sourcePath: path.join(repositoryRoot, "frontend", "shared-state-sync.js"),
  }),
  Object.freeze({
    requestPath: "/favorites-sync.js",
    sourcePath: path.join(repositoryRoot, "frontend", "favorites-sync.js"),
  }),
]);

const EXPECTED = Object.freeze({
  canonical: "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d",
  app: "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6",
  catalog: "a38d2e5f5a09fdc47bd9102800b04c423cf19b8d4d6bc952b77a5b77dc74062d",
  css: "5b8e0d4a4eb1fb954e089f5c0e9dbabcad8217032ef12e3a67a03d89072e0896",
});

const PRODUCTION_ARTIFACT_HYGIENE_RULES = Object.freeze([
  Object.freeze({
    pattern: /createCanonicalFixtureRuntime|main-integrated-fixture|fixture-integrated/i,
    label: "fixture runtime",
  }),
  Object.freeze({
    pattern: /commerce-pro-(?:preview|integration-preview)|noindex|nofollow/i,
    label: "preview/noindex",
  }),
  Object.freeze({
    pattern: /\b(?:localhost|127\.0\.0\.1)\b/i,
    label: "local host",
  }),
  Object.freeze({
    pattern: /\b(?:5273|55437)\b/,
    label: "local review/demo port",
  }),
  Object.freeze({
    pattern: /(?:@local\.invalid|@novastore\.test|@example\.invalid)\b/i,
    label: "local/test customer identity",
  }),
  Object.freeze({
    pattern: /(?:\blocal-review-|isIsolatedLocalReview|\breviewOnly\b|LocalReview(?:Auth|Payment)Boundary|LOCAL_REVIEW_RUNTIME_ENABLED|__NOVASTORE_LOCAL_REVIEW_RUNTIME__|Yerel inceleme|Sentetik inceleme|Bu sunucu gerçek üyelik)/iu,
    label: "local review authority",
  }),
  Object.freeze({
    pattern: /(?:\bfriend[-_ ]demo\b|novastore_friend_demo_20260831|customer-credential\.xml|start-customer-demo\.ps1|sync-real-public-catalog\.ps1|deneme\.novastore\.tr)/i,
    label: "friend-demo dependency",
  }),
  Object.freeze({
    pattern: /\bnovastore_(?:friend_demo(?:_\d+)?|preview|test|ci)(?:_[a-z0-9_-]+)?\b/i,
    label: "demo/test database",
  }),
  Object.freeze({
    pattern: /\b(?:PAYTR_MERCHANT_KEY|PAYTR_MERCHANT_SALT|JWT_SECRET|DATABASE_URL|RESEND_API_KEY|VAPID_PRIVATE_KEY|FIREBASE_PRIVATE_KEY|CLOUDINARY_API_SECRET)\b/i,
    label: "private secret environment name",
  }),
  Object.freeze({
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    label: "private key material",
  }),
  Object.freeze({
    pattern: /\bpostgres(?:ql)?:\/\/[^\s"'`<>]+/i,
    label: "database connection string",
  }),
  Object.freeze({
    pattern: /\bBearer[ \t]+[A-Za-z0-9._~+/=-]{20,}(?![A-Za-z0-9._~+/=-])/,
    label: "embedded bearer credential",
  }),
  Object.freeze({ pattern: /file:\/\//i, label: "file URL" }),
  Object.freeze({
    pattern: /[A-Za-z]:[\\/](?:Users|Windows|Program Files|AppData|Temp)[\\/]/i,
    label: "Windows absolute path",
  }),
  Object.freeze({
    pattern: /(?:AppData[\\/]Local[\\/]Temp|novastore-commerce-pro-cutover-)/i,
    label: "temp path",
  }),
  Object.freeze({
    pattern: /(?:@vite\/client|vite\/dist\/client|sourceMappingURL)/i,
    label: "dev/sourcemap marker",
  }),
]);

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function assertMediaCsp(html) {
  const cspMeta = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .find((tag) => /\bhttp-equiv\s*=\s*["']Content-Security-Policy["']/i.test(tag));
  const content = cspMeta?.match(/\bcontent\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
  if (!content) throw new Error("Production artifact CSP meta içeriğini taşımıyor.");
  const directives = new Map(content.split(";").map((value) => value.trim()).filter(Boolean).map((value) => {
    const [name, ...sources] = value.split(/\s+/);
    return [name.toLowerCase(), sources];
  }));
  if (JSON.stringify(directives.get("media-src")) !== JSON.stringify(["'self'", "https:"])) {
    throw new Error("Production artifact CSP media-src sınırını tam olarak 'self' + https ile taşımıyor.");
  }
}

function assertEmbeddedInterFonts(html) {
  const fontFaces = html.match(/@font-face\s*\{[^}]*\}/gi) || [];
  const interFaces = fontFaces.filter((face) => /font-family:\s*(?:"Inter"|Inter)\s*;/i.test(face));
  if (interFaces.length !== 10) throw new Error(`Production artifact tam 10 Inter font yüzü taşımıyor: ${interFaces.length}`);
  for (const weight of [400, 500, 600, 700, 800]) {
    const faces = interFaces.filter((face) => new RegExp(`font-weight:\\s*${weight}\\s*;`, "i").test(face));
    const subsets = faces.map((face) => {
      if (/unicode-range:\s*U\+0100-02BA/i.test(face)) return "latin-ext";
      if (/unicode-range:\s*U\+0000-00FF/i.test(face)) return "latin";
      return "unknown";
    }).sort();
    if (faces.length !== 2 || JSON.stringify(subsets) !== JSON.stringify(["latin", "latin-ext"])) {
      throw new Error(`Production artifact Inter ${weight} latin/latin-ext çiftini taşımıyor.`);
    }
    if (faces.some((face) => !/font-style:\s*normal\s*;[\s\S]*font-display:\s*swap\s*;/i.test(face)
      || !/src:\s*url\(data:font\/woff2;base64,/i.test(face))) {
      throw new Error(`Production artifact Inter ${weight} gömülü WOFF2/swap sözleşmesini taşımıyor.`);
    }
  }
}

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

function assertProductionClosureHygiene(sources) {
  for (const { label: sourceLabel, content } of sources) {
    for (const { pattern, label } of PRODUCTION_ARTIFACT_HYGIENE_RULES) {
      if (pattern.test(content)) {
        throw new Error(`Production artifact closure ${sourceLabel} yasaklı ${label} içeriyor.`);
      }
    }

    const origins = [...content.matchAll(/https?:\/\/[^"'`\s<>\)]+/g)].map((match) => match[0]);
    const unexpectedOrigins = origins.filter((origin) => !origin.startsWith("http://www.w3.org/"));
    if (unexpectedOrigins.length > 0) {
      throw new Error(`Production artifact closure ${sourceLabel} beklenmeyen external origin içeriyor: ${[...new Set(unexpectedOrigins)].join(", ")}`);
    }
  }
}

function validateArtifact(buffer, servedRuntimeSources) {
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
    "/api/notifications?limit=50",
    "/api/notifications/unread-count",
    "/api/notifications/web-push/config",
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

  assertMediaCsp(html);
  assertEmbeddedInterFonts(html);
  if (/inter-(?:latin|latin-ext)-(?:400|500|600|700|800)-normal\.woff2/.test(html)) {
    throw new Error("Production artifact çözümlenmemiş Inter font yolu içeriyor.");
  }

  if (!/import\s*["']\/shared-state-sync\.js["'];\s*import\s*["']\/favorites-sync\.js["']/.test(html)) {
    throw new Error("Production artifact shared cart/favorites owner sırasını korumuyor.");
  }

  const servedSourceByPath = new Map(servedRuntimeSources.map(({ requestPath, content }) => [requestPath, content]));
  if (servedSourceByPath.size !== SERVED_RUNTIME_SCRIPTS.length) {
    throw new Error("Production artifact served runtime script closure eksik veya tekrarlı.");
  }
  const productionClosure = [
    { label: "generated HTML", content: html },
    ...SERVED_RUNTIME_SCRIPTS.map(({ requestPath }) => {
      const content = servedSourceByPath.get(requestPath);
      if (typeof content !== "string") {
        throw new Error(`Production artifact served runtime script closure eksik: ${requestPath}`);
      }
      return { label: requestPath, content };
    }),
  ];
  assertProductionClosureHygiene(productionClosure);

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
  const servedRuntimeSources = await Promise.all(SERVED_RUNTIME_SCRIPTS.map(async ({ requestPath, sourcePath }) => ({
    requestPath,
    content: await readFile(sourcePath, "utf8"),
  })));
  validateArtifact(artifact, servedRuntimeSources);

  const candidatePath = path.join(tempRoot, "production-index.html");
  await writeFile(candidatePath, artifact);
  const writeStatus = await replaceTarget(candidatePath, artifact, tempRoot);
  const persisted = await readFile(targetPath);
  if (!persisted.equals(artifact)) throw new Error("Yazılan production artifact aday baytları değişti.");

  console.log(`cutover artifact verified: ${sha256(artifact)}`);
  console.log(`cutover artifact write: ${writeStatus}`);
} finally {
  if (previousNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnvironment;
  if (previousOutputRoot === undefined) delete process.env.NOVASTORE_CUTOVER_OUT_DIR;
  else process.env.NOVASTORE_CUTOVER_OUT_DIR = previousOutputRoot;
  assertSafeTempRoot(tempRoot);
  await rm(tempRoot, { recursive: true, force: true });
}
