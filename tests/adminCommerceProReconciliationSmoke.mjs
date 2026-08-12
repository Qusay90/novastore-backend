import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  integratedAdminPageHash,
  resolveIntegratedAdminPage,
} from "../admin-commerce-pro/src/integration/adminHistory.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const preview = read("admin-commerce-pro/src/App.jsx");
const live = read("admin-commerce-pro/src/IntegratedApp.jsx");
const shell = read("admin-commerce-pro/src/AdminPresentationShell.jsx");
const styles = read("admin-commerce-pro/src/styles.css");
const integratedStyles = read("admin-commerce-pro/src/integrated.css");

assert.match(preview, /import \{ AdminPresentationShell \} from "\.\/AdminPresentationShell\.jsx"/);
assert.match(live, /import \{ AdminPresentationShell \} from "\.\/AdminPresentationShell\.jsx"/);
assert.match(preview, /<AdminPresentationShell[\s\S]*testId="admin-shell"/);
assert.match(live, /<AdminPresentationShell[\s\S]*testId="integrated-admin-shell"/);
assert.equal((shell.match(/className="content-area"/g) || []).length, 1, "ortak içerik sahibi tek olmalı");
assert.match(shell, /href="#main-content"/);
assert.match(shell, /event\.preventDefault\(\)/, "skip-link route hashini değiştirmemeli");
assert.match(shell, /contentRef\?\.current\?\.focus\(\)/, "skip-link ortak ana içeriğe odaklanmalı");
assert.match(live, /const contentRef = useRef\(null\)/, "canlı kabuk ana içerik odağını sahiplenmeli");
assert.match(live, /contentRef=\{contentRef\}/, "canlı kabuk skip-link refini ortak sunuma aktarmalı");
assert.match(live, /<h1 className="mobile-admin-heading">Commerce Pro — \{pageLabels\[page\]/, "mobil admin görünümü erişilebilir ana başlığı korumalı");
assert.match(live, /className="secondary-button live-refresh" aria-label=\{sessionResource\.refreshing[\s\S]*?"Veriyi yenile"/, "ikon-only mobil yenileme düğmesi erişilebilir adını korumalı");
assert.match(integratedStyles, /\.mobile-admin-heading \{[\s\S]*?display: none;[\s\S]*?@media \(max-width: 760px\) \{[\s\S]*?\.mobile-admin-heading \{[\s\S]*?clip-path: inset\(50%\)/, "mobil ana başlık görsel olarak gizlenirken erişilebilir kalmalı");

assert.match(preview, /useState\(20\)/, "kabul edilen sipariş satır sayısı korunmalı");
assert.match(preview, />Sipariş Operasyonu<\/h2>/, "kabul edilen operasyon başlığı korunmalı");
assert.doesNotMatch(preview, /Sipariş Operasyonu Önizlemesi/);

assert.equal(resolveIntegratedAdminPage("#/orders"), "orders");
assert.equal(resolveIntegratedAdminPage("#/catalogStructure?from=orders"), "catalogStructure");
assert.equal(resolveIntegratedAdminPage("#/unknown"), "dashboard");
assert.equal(resolveIntegratedAdminPage("javascript:alert(1)"), "dashboard");
assert.equal(integratedAdminPageHash("notifications"), "#/notifications");
assert.equal(integratedAdminPageHash("unknown"), "#/dashboard");
assert.match(live, /addEventListener\("popstate", synchronizePage\)/);
assert.match(live, /writeIntegratedPageToHistory\(next\)/);

assert.match(styles, /outline: 3px solid var\(--orange-700\)/);
assert.match(
  styles,
  /@media \(max-width: 760px\)[\s\S]*?\.command-trigger \{ display: grid; place-items: center;/,
  "kabul edilen mobil komut tetikleyicisi davranışı korunmalı",
);
assert.match(styles, /@media \(min-width: 761px\) and \(max-width: 1279px\)[\s\S]*?\.operations-heading \.heading-actions \{[\s\S]*?flex-wrap: wrap;/);

console.log("Admin Commerce Pro reconciliation smoke passed");
