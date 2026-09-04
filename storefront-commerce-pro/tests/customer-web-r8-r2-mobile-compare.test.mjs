import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read = (path) => fs.readFile(new URL(path, import.meta.url), "utf8");

test("R8-R2 mobile compare uses a fixed bottom sheet above canonical bottom navigation", async () => {
  const css = await read("../src/integrated.css");
  const mobileRule = css.slice(css.indexOf("@media (max-width: 620px)", css.indexOf(".comparison-launcher")));
  const trayBlock = mobileRule.match(/\.comparison-tray\s*\{([^}]*)\}/u)?.[1] || "";
  assert.match(mobileRule, /\.comparison-tray\s*\{[\s\S]*?position: fixed;[\s\S]*?right: 10px;[\s\S]*?bottom: calc\(78px \+ env\(safe-area-inset-bottom\)\);[\s\S]*?left: 10px;[\s\S]*?display: grid;/u);
  assert.match(mobileRule, /grid-template-areas:[\s\S]*?"summary close"[\s\S]*?"products products"[\s\S]*?"action clear";/u);
  assert.doesNotMatch(trayBlock, /position: relative;/u);
  assert.match(mobileRule, /\.assistant-widget\.has-comparison\s*\{[\s\S]*?bottom: calc\(248px \+ env\(safe-area-inset-bottom\)\);/u);
  assert.match(mobileRule, /\.comparison-tray__products button\s*\{[\s\S]*?width: 24px;[\s\S]*?height: 24px;/u);
});

test("R8-R2 compare surface exposes selection, remove, clear, primary action and close", async () => {
  const app = await read("../src/IntegratedApp.jsx");
  assert.match(app, /role="region" aria-labelledby="comparison-tray-title"/u);
  assert.match(app, /aria-live="polite">\{selectedProducts\.length\}\/3 ürün seçildi/u);
  assert.match(app, /aria-label=\{`\$\{product\.name\} ürününü karşılaştırmadan çıkar`\}/u);
  assert.match(app, /className="comparison-open"[\s\S]*?"Karşılaştır"/u);
  assert.match(app, /className="comparison-clear"[\s\S]*?aria-label="Karşılaştırma listesini temizle"/u);
  assert.match(app, /className="comparison-tray__close"[\s\S]*?aria-label="Karşılaştırma listesini kapat"/u);
  assert.match(app, /className="comparison-launcher"[\s\S]*?Karşılaştırma listesini aç/u);
});

test("R8-R2 NovaBot reserves space only for a visible compare surface", async () => {
  const [app, css] = await Promise.all([
    read("../src/IntegratedApp.jsx"),
    read("../src/integrated.css"),
  ]);
  assert.match(app, /const \[comparisonSurfaceVisible, setComparisonSurfaceVisible\] = useState\(false\);/u);
  assert.match(app, /onVisibilityChange=\{setComparisonSurfaceVisible\}/u);
  assert.match(app, /raised=\{comparisonAvailable && comparisonSurfaceVisible\}/u);
  assert.match(css, /body\.is-comparison-dialog-open \.assistant-widget\s*\{[\s\S]*?visibility: hidden;[\s\S]*?pointer-events: none;[\s\S]*?opacity: 0;/u);
});

test("R8-R2 compare dialog retains modal focus containment and safe restoration", async () => {
  const app = await read("../src/IntegratedApp.jsx");
  assert.match(app, /role="dialog" aria-modal="true" aria-labelledby="comparison-title"/u);
  assert.match(app, /event\.key === "Escape"\) closeAndRestore\(\)/u);
  assert.match(app, /keepFocusInDialog\(event, dialogRef\.current\)/u);
  assert.match(app, /restoreFocus\(returnFocusRef\)/u);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => launcherRef\.current\?\.focus\(\)\)/u);
  assert.match(app, /window\.requestAnimationFrame\(\(\) => closeRef\.current\?\.focus\(\)\)/u);
});
