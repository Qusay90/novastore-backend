import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createSourceFingerprint } from "../admin-commerce-pro/scripts/source-fingerprint.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const commerceRoot = path.join(repositoryRoot, "admin-commerce-pro");
const livePath = path.join(repositoryRoot, "frontend", "admin-commerce-pro-live.html");
const source = fs.readFileSync(livePath, "utf8");
const integratedAppSource = fs.readFileSync(path.join(commerceRoot, "src", "IntegratedApp.jsx"), "utf8");
const resourceHookSource = fs.readFileSync(path.join(commerceRoot, "src", "integration", "useResource.js"), "utf8");
const { value: expectedFingerprint } = await createSourceFingerprint(commerceRoot, { mode: "integrated" });

assert.match(source, /<html\b[^>]*data-admin-mode="integrated"/i);
assert.match(source, /<meta\b[^>]*Content-Security-Policy[^>]*connect-src 'self'/i);
assert.doesNotMatch(source, /connect-src 'none'/i);
assert.match(source, new RegExp(`novastore-source-fingerprint" content="${expectedFingerprint}"`, "i"));
assert.match(source, /data-testid["']?\s*(?:=|:)\s*["']integrated-admin-shell["']/);
assert.match(source, /Entegre tek-satıcı modu/);
assert.match(source, /Mock fallback yok/);
assert.match(source, /Sipariş özeti okuma yeteneği bu admin oturumunda açık değil/);
assert.match(source, /Dashboard okuma yeteneği bu admin oturumunda açık değil/);
assert.match(source, /Filtrelenmiş sipariş sayısı/);
assert.match(integratedAppSource, /if \(!enabledPages\.includes\(page\) && enabledPages\[0\]\) setPage\(enabledPages\[0\]\)/);
assert.match(integratedAppSource, /page === "dashboard"[\s\S]{0,180}!statsEnabled[\s\S]{0,180}dashboardUnavailableError/);
assert.match(integratedAppSource, /page === "orders"[\s\S]{0,180}!ordersEnabled[\s\S]{0,180}ordersUnavailableError/);
assert.match(integratedAppSource, /page === "returns"[\s\S]{0,180}!returnsEnabled[\s\S]{0,180}returnsUnavailableError/);
assert.match(integratedAppSource, /page === "notifications"[\s\S]{0,180}!notificationsEnabled[\s\S]{0,180}notificationsUnavailableError/);
assert.match(resourceHookSource, /if \(!enabled\) \{[\s\S]{0,160}setState\(initialState\)/);
assert.match(resourceHookSource, /error\?\.status !== 401 && error\?\.status !== 403/);
assert.match(source, /\/api\/admin\/session/);
assert.match(source, /\/api\/admin\/stats/);
assert.match(source, /\/api\/admin\/orders\/summary\?limit=100/);
assert.match(source, /\/api\/admin\/returns\/summary\?limit=100/);
assert.match(source, /\/api\/admin\/notifications\/summary\?limit=50/);
assert.match(source, /ADMIN_SESSION_EXPIRED/);
assert.match(source, /INVALID_API_PATH/);
assert.doesNotMatch(source, /Demo Operatör|demo-operasyon@example\.invalid|Demo Teknoloji|Demo Ev/);
assert.match(source, /live-returns/);
assert.match(source, /live-notifications/);
assert.match(source, /Taşıyıcı doğrulanmadı/);
assert.match(source, /gerçek refund isteği gönderilmez/);
assert.match(source, /sağlayıcı\/para hareketi doğrulanmadı/);
assert.doesNotMatch(source, /\/api\/returns\/admin\/all|\/api\/notifications\/admin|\/api\/shipments\//);
assert.doesNotMatch(source, /\/api\/orders\/[^"']+\/status|\/api\/returns\/[^"']+\/status|\/api\/notifications\/[^"']+\/read/);
assert.doesNotMatch(source, /<script\b[^>]*\bsrc\s*=/i);
assert.doesNotMatch(source, /<link\b[^>]*\brel=["'][^"']*stylesheet/i);
assert.doesNotMatch(source, /<(?:img|script|link|source)\b[^>]*\b(?:src|href|srcset)=["'](?:https?:)?\/\//i);
assert.match(source, /data:font\/woff2;base64,/i);

const scripts = Array.from(source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi), (match) => match[1]);
assert.ok(scripts.length >= 1);
scripts.forEach((script, index) => {
  assert.doesNotThrow(() => new vm.Script(script, { filename: `admin-commerce-pro-live.inline-${index + 1}.js` }));
});

console.log("admin Commerce Pro live artifact smoke passed");
