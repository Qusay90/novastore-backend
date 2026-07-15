import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const server = read("server.js");
const html = read("storefront-theme/index.html");
const http = read("storefront-theme/src/api/httpClient.ts");
const catalog = read("storefront-theme/src/api/catalog.ts");
const cart = read("storefront-theme/src/adapters/cartAdapter.ts");
const favorites = read("storefront-theme/src/adapters/favoritesAdapter.ts");

assert.match(server, /app\.get\(\/\^\\\/theme-preview/);
assert(server.includes("frontend', 'theme-preview', 'index.html"));
assert(html.includes('/shared-state-sync.js'));
assert(html.includes('/favorites-sync.js'));
assert(catalog.includes('storefrontGet("/api/products"'));
assert(catalog.includes('storefrontGet("/api/public/categories?format=tree"'));
assert(catalog.includes('storefrontGet("/api/public/collections"'));
assert(http.includes("ADMIN_API_FORBIDDEN"));
assert(cart.includes("window.NovaStoreSharedState"));
assert(favorites.includes("window.NovaStoreFavorites"));
console.log("storefront theme integration smoke passed");
