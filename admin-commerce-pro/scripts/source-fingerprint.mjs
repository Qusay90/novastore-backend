import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const imageNames = [
  "category-home.webp",
  "phone-iphone.webp",
  "phone-samsung.webp",
  "product-bedding.webp",
  "product-headphones.webp",
  "product-laptop.webp",
  "product-vacuum.webp",
  "product-watch.webp",
];

export const fontNames = [
  "inter-latin-ext-400-normal.woff2",
  "inter-latin-ext-600-normal.woff2",
  "inter-latin-ext-700-normal.woff2",
  "inter-latin-ext-800-normal.woff2",
];

const compareNames = (left, right) => (left < right ? -1 : left > right ? 1 : 0);

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".ts",
  ".tsx",
]);

const binaryExtensions = new Set([
  ".png",
  ".webp",
  ".woff2",
]);

export function canonicalizeFingerprintPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    throw new TypeError("Fingerprint yolu boş olmayan bir string olmalıdır.");
  }

  const canonicalPath = relativePath.replaceAll("\\", "/");
  const segments = canonicalPath.split("/");

  if (
    canonicalPath.startsWith("/")
    || /^[A-Za-z]:\//.test(canonicalPath)
    || segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Fingerprint yolu repository-relative olmalıdır: ${relativePath}`);
  }

  return segments.join("/");
}

export function classifyFingerprintInput(relativePath) {
  const canonicalPath = canonicalizeFingerprintPath(relativePath);
  const extension = path.posix.extname(canonicalPath).toLowerCase();

  if (textExtensions.has(extension)) return "text";
  if (binaryExtensions.has(extension)) return "binary";
  throw new Error(`Desteklenmeyen fingerprint girdisi: ${canonicalPath}`);
}

const asByteView = (content) => {
  if (!(content instanceof Uint8Array)) {
    throw new TypeError("Fingerprint içeriği Uint8Array veya Buffer olmalıdır.");
  }
  return Buffer.from(content.buffer, content.byteOffset, content.byteLength);
};

export function normalizeTextLineEndings(content) {
  const bytes = asByteView(content);
  if (!bytes.includes(0x0d)) return bytes;

  const normalized = Buffer.allocUnsafe(bytes.length);
  let outputIndex = 0;

  for (let inputIndex = 0; inputIndex < bytes.length; inputIndex += 1) {
    if (bytes[inputIndex] !== 0x0d) {
      normalized[outputIndex] = bytes[inputIndex];
      outputIndex += 1;
      continue;
    }

    normalized[outputIndex] = 0x0a;
    outputIndex += 1;
    if (bytes[inputIndex + 1] === 0x0a) inputIndex += 1;
  }

  return normalized.subarray(0, outputIndex);
}

export function canonicalizeFingerprintContent(relativePath, content) {
  const bytes = asByteView(content);
  return classifyFingerprintInput(relativePath) === "text"
    ? normalizeTextLineEndings(bytes)
    : bytes;
}

export function updateSourceFingerprint(fingerprint, relativePath, content) {
  const canonicalPath = canonicalizeFingerprintPath(relativePath);
  fingerprint.update(canonicalPath);
  fingerprint.update(canonicalizeFingerprintContent(canonicalPath, content));
}

export async function listSourceFiles(root, directory = path.join(root, "src")) {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .sort((left, right) => compareNames(left.name, right.name));
  const modules = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      modules.push(...await listSourceFiles(root, entryPath));
    } else if (entry.isFile()) {
      modules.push(path.relative(root, entryPath).split(path.sep).join("/"));
    }
  }

  return modules.sort(compareNames);
}

const sourceFilesForMode = (sourceFiles, mode) => sourceFiles.filter((relativePath) => {
  const integratedOnly = relativePath === "src/IntegratedApp.jsx"
    || relativePath === "src/integrated.css"
    || relativePath === "src/main-integrated.jsx"
    || relativePath.startsWith("src/adapters/")
    || relativePath.startsWith("src/integration/");
  const previewOnly = relativePath === "src/App.jsx"
    || relativePath === "src/main.jsx"
    || relativePath === "src/previewModel.js";

  if (mode === "preview") return !integratedOnly;
  if (mode === "integrated") return !previewOnly;
  return true;
});

export async function createSourceFingerprint(root, { mode = "preview" } = {}) {
  if (!["preview", "integrated"].includes(mode)) throw new Error(`Bilinmeyen fingerprint modu: ${mode}`);
  const sourceFiles = sourceFilesForMode(await listSourceFiles(root), mode);
  const fingerprintFiles = [
    mode === "integrated" ? "integrated.html" : "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.mjs",
    "scripts/build-standalone.mjs",
    "scripts/source-fingerprint.mjs",
    ...sourceFiles,
    "public/icons.js",
    "public/favicon-96x96.png",
    ...imageNames.map((name) => `public/assets/${name}`),
    ...fontNames.map((name) => `public/assets/fonts/${name}`),
  ].sort(compareNames);
  const fingerprint = createHash("sha256");

  for (const relativePath of fingerprintFiles) {
    const canonicalPath = canonicalizeFingerprintPath(relativePath);
    updateSourceFingerprint(
      fingerprint,
      canonicalPath,
      await readFile(path.join(root, ...canonicalPath.split("/"))),
    );
  }

  return {
    mode,
    fingerprintFiles,
    sourceFiles,
    value: fingerprint.digest("hex"),
  };
}
