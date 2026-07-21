import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_CATALOG_IMPORT,
  CANONICAL_HOME_HREF,
  CANONICAL_MOBILE_HOME_ITEM,
  EXPECTED_CANONICAL_HOME_HREF_COUNT,
  EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
  RUNTIME_CATALOG_IMPORT,
  RUNTIME_EXPORTS,
  RUNTIME_HOME_HREF,
  RUNTIME_MOBILE_HOME_ITEM,
  countExactOccurrences,
  createRuntimePresentation,
} from "../scripts/sync-canonical.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = path.join(root, "canonical", "NovaStore-Commerce-Pro.html");
const previewPath = path.resolve(root, "..", "frontend", "commerce-pro-preview", "index.html");
const canonicalAppPath = path.join(root, "src", "App.jsx");
const runtimePresentationPath = path.join(root, "src", "CanonicalRuntimePresentation.jsx");
const EXPECTED_SHA256 = "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d";
const EXPECTED_APP_SHA256 = "d31e7642f6bccb75094361be3dc2dd3b85cc38a4d968bbfd57ee3ee7ffd80fb6";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const NON_HOME_HASH_ROUTES = Object.freeze([
  "#/kategori/",
  "#/urun/",
  "#/favoriler",
  "#/sepet",
  "#/odeme/teslimat",
  "#/hesabim",
  "#/siparis-takibi",
  "#/yardim",
]);

test("canonical upload and preview remain byte-identical", async () => {
  const [canonical, preview] = await Promise.all([
    readFile(canonicalPath),
    readFile(previewPath)
  ]);

  assert.equal(canonical.length, 2_332_461);
  assert.equal(sha256(canonical), EXPECTED_SHA256);
  assert.ok(canonical.equals(preview));
});

test("canonical preview is self-contained and isolated", async () => {
  const html = await readFile(canonicalPath, "utf8");

  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html\s+lang="tr">/i);
  assert.match(html, /<title>NovaStore — Kategori Deneyimi<\/title>/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\b(?:href|rel)\s*=/i);
  assert.doesNotMatch(html, /<(?:img|source)\b[^>]*\b(?:src|srcset)=["'](?:https?:)?\/\//i);
  assert.doesNotMatch(html, /["'`]\/api(?:\/|["'`])/i);
  assert.doesNotMatch(html, /\b(?:paytr|iyzico|cloudinary)\b/i);
  assert.equal((html.match(/\bfetch\s*\(/g) || []).length, 1);
  assert.match(html, /querySelectorAll\('link\[rel="modulepreload"\]'\)/);
  assert.doesNotMatch(html, /<link\b[^>]*rel=["']modulepreload["']/i);
  assert.match(html, /data:image\/webp;base64,/i);
  assert.match(html, /data:font\/woff2;base64,/i);

  for (const route of [
    "#/kategori/",
    "#/urun/",
    "#/favoriler",
    "#/sepet",
    "#/odeme/teslimat",
    "#/hesabim/siparisler"
  ]) {
    assert.ok(html.includes(route), `Kanonik etkileşim rotası eksik: ${route}`);
  }
});

test("runtime presentation is generated directly from canonical App.jsx", async () => {
  const [canonicalApp, runtimePresentation] = await Promise.all([
    readFile(canonicalAppPath, "utf8"),
    readFile(runtimePresentationPath, "utf8"),
  ]);
  assert.equal(sha256(canonicalApp), EXPECTED_APP_SHA256);
  assert.equal(
    countExactOccurrences(canonicalApp, CANONICAL_HOME_HREF),
    EXPECTED_CANONICAL_HOME_HREF_COUNT,
  );
  assert.equal(
    countExactOccurrences(canonicalApp, CANONICAL_MOBILE_HOME_ITEM),
    EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
  );

  const independentlyExpected = canonicalApp
    .replace(CANONICAL_CATALOG_IMPORT, RUNTIME_CATALOG_IMPORT)
    .replaceAll(CANONICAL_HOME_HREF, RUNTIME_HOME_HREF)
    .replace(CANONICAL_MOBILE_HOME_ITEM, RUNTIME_MOBILE_HOME_ITEM)
    .trimEnd()
    .concat("\n", RUNTIME_EXPORTS);
  assert.equal(createRuntimePresentation(canonicalApp), independentlyExpected);
  assert.equal(runtimePresentation, independentlyExpected);
  assert.equal(countExactOccurrences(runtimePresentation, CANONICAL_HOME_HREF), 0);
  assert.equal(countExactOccurrences(runtimePresentation, CANONICAL_MOBILE_HOME_ITEM), 0);
  assert.equal(
    countExactOccurrences(runtimePresentation, RUNTIME_HOME_HREF),
    countExactOccurrences(canonicalApp, RUNTIME_HOME_HREF) + EXPECTED_CANONICAL_HOME_HREF_COUNT,
  );
  assert.equal(
    countExactOccurrences(runtimePresentation, RUNTIME_MOBILE_HOME_ITEM),
    countExactOccurrences(canonicalApp, RUNTIME_MOBILE_HOME_ITEM) + EXPECTED_CANONICAL_MOBILE_HOME_ITEM_COUNT,
  );

  for (const route of NON_HOME_HASH_ROUTES) {
    assert.equal(
      countExactOccurrences(runtimePresentation, route),
      countExactOccurrences(canonicalApp, route),
      `non-home hash route must remain unchanged: ${route}`,
    );
  }

  assert.throws(
    () => createRuntimePresentation(canonicalApp.replace(CANONICAL_HOME_HREF, 'href="#/drift"')),
    /Canonical document-root home href owners drifted; expected 5 exact occurrence\(s\), found 4/,
  );
  assert.throws(
    () => createRuntimePresentation(
      canonicalApp.replace(CANONICAL_MOBILE_HOME_ITEM, '[House,"Ana Sayfa","#/drift","home"]'),
    ),
    /Canonical mobile home item drifted; expected 1 exact occurrence\(s\), found 0/,
  );
});
