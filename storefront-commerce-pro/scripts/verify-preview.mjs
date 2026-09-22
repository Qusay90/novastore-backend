import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalPath = path.join(root, "canonical", "NovaStore-Commerce-Pro.html");
const previewPath = path.resolve(root, "..", "frontend", "commerce-pro-preview", "index.html");
const EXPECTED_SHA256 = "8b6301362b6c01b649db1d7cfa4dc00d5b4392309e4ece2c7c14870cab0f2b0d";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const [canonical, preview] = await Promise.all([
  readFile(canonicalPath),
  readFile(previewPath)
]);

if (sha256(canonical) !== EXPECTED_SHA256) {
  throw new Error("Kanonik HTML parmak izi beklenen değerle eşleşmiyor.");
}
if (!canonical.equals(preview)) {
  throw new Error(`Preview kanonik kaynakla byte eşit değil: ${sha256(preview)}`);
}

console.log(`exact preview verified: ${EXPECTED_SHA256}`);
