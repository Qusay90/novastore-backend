import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [];
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
  const full = path.join(directory, entry.name);
  if (entry.isDirectory()) walk(full); else files.push(full);
});
walk(path.join(root, "storefront-theme", "src"));
const source = files
  .filter((file) => !file.endsWith(path.join("api", "httpClient.ts")))
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

for (const forbidden of ["nova_admin_token", "/api/admin/", "drizzle", "mysql", "stripe", "trpc", "manus", "cloudinary", "carrier"]) {
  assert(!source.toLowerCase().includes(forbidden), `forbidden storefront boundary: ${forbidden}`);
}
assert(!source.includes("expected_revision"));
assert(!source.includes("restoreCatalogProduct"));
assert(!/(^|[^A-Za-z])fetch\s*\(/m.test(source), "fetch must stay in the HTTP client only");
assert(readFile("storefront-theme/src/api/httpClient.ts").includes("fetch("));
console.log("storefront theme boundary smoke passed");

function readFile(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
