import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("R8-R1 Home and Favorites keep one canonical Customer product card", async () => {
  const app = await read("../src/IntegratedApp.jsx");
  assert.match(app, /function ProductCard\(\{ product, favorite, onFavorite, onAdd \}\)[\s\S]*?<CustomerProductCard/u);
  assert.match(app, /function ProductGrid\(\{ items, favorites, onFavorite, onAdd, compact = false \}\)[\s\S]*?<ProductCard/u);
  assert.match(app, /function HomePage[\s\S]*?<ProductGrid items=\{featured\}/u);
  assert.match(app, /function FavoritesPage[\s\S]*?<ProductGrid items=\{items\}/u);
});

test("R8-R1 normal phone Favorites use the accepted two-column Home geometry", async () => {
  const css = await read("../src/integrated.css");
  const ownerClosure = css.slice(css.lastIndexOf("Customer Web R8-R1 final cascade"));
  assert.match(ownerClosure, /@media \(max-width: 620px\)[\s\S]*?\.favorites-page \.product-grid\s*\{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*?gap: 9px;/u);
  assert.match(ownerClosure, /\.favorites-page \.product-card\.customer-product-card\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;/u);
  assert.match(ownerClosure, /\.favorites-page \.customer-product-card \.product-card__media\s*\{[\s\S]*?aspect-ratio: 1 \/ 1;/u);
  assert.doesNotMatch(ownerClosure, /grid-template-columns: (?:minmax\(0, 1fr\)|1fr);/u);
});

test("R8-R1 auth entry switches semantic Lucide icon and preserves canonical routes", async () => {
  const [app, icons] = await Promise.all([
    read("../src/IntegratedApp.jsx"),
    read("../src/CustomerIcon.jsx"),
  ]);
  assert.match(icons, /LogIn,/u);
  assert.match(icons, /export const SignIn = adapt\(LogIn\);/u);
  assert.match(app, /const AccountIcon = authenticated \? User : SignIn;/u);
  assert.match(app, /className=\{!authenticated && "is-login-entry"\} icon=\{AccountIcon\}/u);
  assert.match(app, /accessibleName=\{authenticated \? `Hesabım: \$\{accountDetail\}` : "Giriş yap"\}/u);
  assert.match(app, /<AccountIcon \/><span>\{authenticated \? "Hesabım" : "Giriş yap"\}<\/span>/u);
  assert.match(app, /navigate\(customerAccountEntryPath\(authenticated\)\)/u);
});

test("R8-R1 guest treatment is emerald, focus-visible and not color-only", async () => {
  const css = await read("../src/integrated.css");
  assert.match(css, /\.header-action\.is-login-entry\s*\{[\s\S]*?border: 1px solid rgb\(65 203 150 \/ 38%\);[\s\S]*?border-radius: 999px;/u);
  assert.match(css, /\.header-action\.is-login-entry \.header-action__icon\s*\{[\s\S]*?color: #70dfb3;/u);
  assert.match(css, /\.header-action\.is-login-entry:focus-visible,[\s\S]*?\.mobile-customer-shortcuts a\.is-login-entry:focus-visible/u);
  assert.match(css, /\.mobile-customer-shortcuts a\.is-login-entry\s*\{[\s\S]*?border-color:/u);
});
