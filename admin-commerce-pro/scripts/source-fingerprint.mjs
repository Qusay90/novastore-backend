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
    fingerprint.update(relativePath);
    fingerprint.update(await readFile(path.join(root, relativePath)));
  }

  return {
    mode,
    fingerprintFiles,
    sourceFiles,
    value: fingerprint.digest("hex"),
  };
}
