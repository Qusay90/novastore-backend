import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const app = read("storefront-commerce-pro", "src", "IntegratedApp.jsx");
const css = read("storefront-commerce-pro", "src", "integrated.css");
const assistant = read("storefront-commerce-pro", "src", "AssistantWidget.jsx");

assert.match(app, /pathname === "\/iade-degisim"/);
assert.match(app, /type: "return-exchange"/);
assert.match(app, /function ReturnExchangePage\(\)/);
assert.match(app, /Bu bilgi sayfası yeni bir iade ya da stok işlemi oluşturmaz\./);
assert.match(app, /İade\/geri ödeme ve stok işlemlerinin tam backend akışı/);
assert.match(app, /href="#\/iade-degisim">İade & değişim/);
assert.doesNotMatch(app.slice(app.indexOf("function Footer()")), /href="#\/yardim">İade & değişim/);

assert.match(css, /\.comparison-dialog\s*\{[\s\S]*?grid-template-rows:\s*auto minmax\(0, 1fr\)/);
assert.match(css, /\.comparison-scroll\s*\{[\s\S]*?min-height:\s*0[\s\S]*?padding-bottom:\s*28px[\s\S]*?scrollbar-gutter:\s*stable both-edges/);
assert.match(css, /\.help-page \.help-hero:not\(\.compact\) h1\s*\{[\s\S]*?font-size:\s*clamp\(32px, 4\.3vw, 52px\)/);
assert.match(css, /\.return-exchange-grid\s*\{[\s\S]*?grid-template-columns:/);
assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.help-page \.help-hero:not\(\.compact\) h1/);

assert.match(assistant, /function NovaBotMark\(\)/);
assert.match(assistant, /className="novabot-mark"/);
assert.match(assistant, /aria-label=\{open \? "NovaBot penceresini kapat" : "NovaBot alışveriş asistanını aç"\}/);
assert.match(css, /\.novabot-mark svg\s*\{[\s\S]*?stroke: #fff8ef/);
assert.match(css, /\.assistant-fab:hover/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.assistant-fab \{ transition: none; \}/);

console.log("COMPARISON_SCROLL_END_SOURCE_CONTRACT=PASS");
console.log("HELP_HERO_RESPONSIVE_SOURCE_CONTRACT=PASS");
console.log("FOOTER_RETURN_EXCHANGE_ROUTE=DEDICATED_RETURN_EXCHANGE_ROUTE");
console.log("NOVABOT_ICON_VECTOR_SOURCE_CONTRACT=PASS");
console.log("STOREFRONT_R4_HUMAN_REVIEW_SMOKE=PASS");
