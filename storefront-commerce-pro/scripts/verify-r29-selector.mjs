import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import puppeteer from "puppeteer-core";
import { startSelectorFixture } from "./r29-selector-server.mjs";
import { clearOptions, clickOption, optionButton, selectCanonicalVariant } from "./variant-selector-browser.mjs";
import { ownerVariants, threeDimensionVariants, manyVariants, hostileVariants, hostileGroup, hostileValue } from "./r29-variant-fixtures.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.resolve(root, "../artifacts/r29-verification");
await fs.mkdir(out, { recursive: true });
const fixture = await startSelectorFixture();
const browser = await puppeteer.launch({ executablePath: process.env.NOVASTORE_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--disable-background-networking", "--no-first-run"] });
const page = await browser.newPage();
const checks = [], geometry = [], screenshots = [], errors = [], external = [], accessibility = [], timings = [];
const check = (name, condition = true) => { assert(condition, name); checks.push(name); console.log("PASS " + name); };
page.on("pageerror", (error) => errors.push(error.message));
await page.setRequestInterception(true);
page.on("request", (request) => {
  if (/^(data|blob):/.test(request.url()) || request.url().startsWith(fixture.base + "/")) return request.continue();
  external.push(request.url()); return request.abort();
});
const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const clickVisible = async (selector) => {
  const button = await page.$(selector);
  assert(button, selector);
  await button.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await settle();
  await page.waitForFunction((el) => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)); }, { timeout: 5000 }, button);
  const hit = await button.evaluate((el) => { const r=el.getBoundingClientRect(), target=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2); return { reachable:el.contains(target), rect:r.toJSON(), target:target?.outerHTML.slice(0,600), active:document.activeElement?.outerHTML.slice(0,300), scroll:scrollY }; });
  assert(hit.reachable, `${selector} reachable before click: ${JSON.stringify(hit)}`);
  await button.click(); await button.dispose();
};
const goto = async (id) => {
  await page.mouse.move(0, 0);
  await page.goto(`${fixture.base}/#/urun/r29-${id}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".purchase-row");
  if (id !== 47) await page.waitForSelector(".runtime-variant-options");
};
const selectedId = () => page.$eval(".runtime-variant-selection", (el) => el.dataset.resolvedVariantId || null);
const pressed = () => page.$$eval('[data-variant-option][aria-pressed="true"]', (nodes) => nodes.map((el) => ({ group: el.closest("[data-variant-group]").dataset.variantGroup, value: el.dataset.variantOption })));
const optionState = async (group, value) => {
  const button = await optionButton(page, group, value);
  const state = await button.evaluate((el) => ({ state: el.dataset.optionState, disabled: el.getAttribute("aria-disabled") === "true", pressed: el.getAttribute("aria-pressed") === "true", label: el.getAttribute("aria-label") }));
  await button.dispose(); return state;
};
const gated = () => page.$$eval(".purchase-row .primary-button, .buy-now-button, .mobile-purchase-bar button", (nodes) => nodes.length >= 2 && nodes.every((el) => el.disabled));
const capture = async (name, viewport) => {
  const selector = await page.$(".runtime-variant-selection");
  await selector.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })); await settle();
  const file = `${name}-${viewport.width}.png`;
  await page.screenshot({ path: path.join(out, file) });
  screenshots.push({ file, ...viewport });
};
async function inspectGeometry(surface, viewport) {
  await settle();
  const controls = [];
  for (const button of await page.$$(".runtime-variant-selection button")) {
    // Clear controls are contextual in R30. All visible controls retain the
    // complete touch size, clipping and point reachability assertions below.
    if (!(await button.evaluate((el) => getComputedStyle(el).visibility === "visible"))) { await button.dispose(); continue; }
    await button.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" })); await settle();
    const metrics = await button.evaluate((el) => {
      const rect = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect();
      const points = [[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]];
      return { label: el.getAttribute("aria-label"), width: rect.width, height: rect.height,
        clipped: rect.left < 0 || rect.right > innerWidth || rect.width <= 0 || rect.height <= 0
          || el.scrollWidth > el.clientWidth + 1 || rect.left < parent.left - 1 || rect.right > parent.right + 1,
        reachable: points.every(([x,y]) => el.contains(document.elementFromPoint(rect.left+rect.width*x,rect.top+rect.height*y))) };
    });
    assert(!metrics.clipped && metrics.reachable && metrics.width >= 43.99 && metrics.height >= 43.99, `${surface} ${viewport.width}: ${JSON.stringify(metrics)}`);
    controls.push(metrics); await button.dispose();
  }
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
  assert.equal(overflow, 0, `${surface} horizontal overflow ${viewport.width}`);
  geometry.push({ surface, ...viewport, overflow, controls });
  check(`${surface} ${viewport.width}: all ${controls.length} controls reachable, unclipped, >=44px`);
}
async function axeCheck(surface, viewport) {
  await page.addScriptTag({ path: path.join(root, "node_modules/axe-core/axe.min.js") });
  const result = await page.evaluate(async () => {
    const result = await axe.run(document.querySelector(".runtime-variant-selection"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] } });
    return { violations: result.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target) })), passes: result.passes.length, incomplete: result.incomplete.map((v) => v.id) };
  });
  accessibility.push({ surface, ...viewport, ...result });
  assert.deepEqual(result.violations, [], `${surface} axe ${viewport.width}`);
  check(`${surface} ${viewport.width}: axe selector audit has zero violations`);
}
async function tabTo(group, value) {
  const button = await optionButton(page, group, value);
  for (let i = 0; i < 220; i++) {
    await page.keyboard.press("Tab");
    if (await button.evaluate((el) => el === document.activeElement)) { await button.dispose(); return; }
  }
  throw new Error(`Keyboard cannot reach ${group}: ${value}`);
}

let failure;
try {
  const desktop = { width: 1440, height: 1000 };
  await page.setViewport(desktop); await goto(42);
  check("English canonical keys display Turkish groups, colors and remaining-choice prompt", await page.$eval(".runtime-variant-selection", (el) => {
    const text = el.innerText;
    return ["Renk", "Beden", "Turuncu", "Mavi", "Yeşil", "Kalan seçim: Renk, Beden"].every((label) => text.includes(label)) && !/Color|Size|Orange|Blue|Green/.test(text);
  }));
  check("refresh starts with no selected options, no price truth and both purchase paths gated", (await pressed()).length === 0 && await selectedId() === null && await gated() && await page.$eval(".detail-price", (el) => el.innerText.includes("Seçenek seç")));
  for (const [color, allowed] of [["Orange", ["M","L"]], ["Blue", ["M"]], ["Green", ["L"]]]) {
    await clearOptions(page); await clickOption(page, "Color", color);
    for (const value of ["M","L"]) assert.equal((await optionState("Size", value)).disabled, !allowed.includes(value));
    check(`${color} first enables only canonical sizes and does not auto-complete`, await selectedId() === null && await gated());
  }
  for (const [size, allowed] of [["M", ["Orange","Blue"]], ["L", ["Orange","Green"]]]) {
    await clearOptions(page); await clickOption(page, "Size", size);
    for (const value of ["Orange","Blue","Green"]) assert.equal((await optionState("Color", value)).disabled, !allowed.includes(value));
    check(`${size} first enables only canonical colors`);
  }
  await selectCanonicalVariant(page, ownerVariants[2]);
  check("selected price and stock are exact canonical Blue M values", await selectedId() === "303"
    && await page.$eval(".detail-price strong", (el) => /249[,.]50/.test(el.innerText))
    && await page.$eval(".stock-line", (el) => /2 adet/.test(el.innerText)));
  const beforeDisabled = await pressed();
  const disabledL = await optionButton(page, "Size", "L"); await disabledL.click();
  await disabledL.focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Space");
  assert.deepEqual(await pressed(), beforeDisabled);
  check("pointer, Enter and Space cannot select an incompatible combination", await selectedId() === "303");
  await capture("selected-color-text-disabled", desktop);
  await page.click('.runtime-variant-clear[aria-label="Beden seçimini temizle"]');
  check("explicit clear retains color, removes exact ID and stale selected price immediately", await selectedId() === null
    && JSON.stringify(await pressed()) === JSON.stringify([{ group: "Color", value: "Blue" }])
    && await gated() && await page.$eval(".detail-price", (el) => el.innerText.includes("Seçenek seç")));
  await goto(42);
  await tabTo("Color", "Orange");
  check("Tab reaches a native option with visible focus", await page.$eval('[data-variant-option="Orange"]', (el) => el === document.activeElement && el.matches(":focus-visible") && parseFloat(getComputedStyle(el).outlineWidth) >= 3));
  await page.keyboard.press("Enter"); await tabTo("Size", "L"); await page.keyboard.press("Space");
  check("Enter and Space complete exactly Orange L", await selectedId() === "302");
  check("every selected group has a visible check and aria-pressed", await page.$$eval('[data-variant-option][aria-pressed="true"]', (nodes) => nodes.length === 2 && nodes.every((el) => el.querySelector(".runtime-variant-selected")?.innerText === "✓")));
  await page.keyboard.press("Tab");
  check("keyboard leaves selector without a focus trap", await page.evaluate(() => !document.activeElement.closest(".runtime-variant-selection")));
  await page.keyboard.press("Escape"); await page.mouse.move(0, 0); await settle();
  await clickVisible(".purchase-row .primary-button");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("novastore_variant_cart_guest") || "[]").some((line) => line.variantId === 302));
  check("Add to Cart persists only exact canonical identity and quantity", await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem("novastore_variant_cart_guest") || "[]");
    return rows.length === 1 && rows[0].productId === 42 && rows[0].variantId === 302 && rows[0].quantity === 1 && Object.keys(rows[0]).sort().join() === "productId,quantity,variantId";
  }));
  await clickVisible(".buy-now-button");
  await page.waitForFunction(() => location.hash.startsWith("#/giris") || location.hash.startsWith("#/odeme"));
  check("Buy Now uses the same exact variant as Add to Cart", await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem("novastore_variant_cart_guest") || "[]");
    return rows.length === 1 && rows[0].variantId === 302;
  }));
  await goto(42);
  check("reload does not restore cart selection into PDP", await selectedId() === null && (await pressed()).length === 0);
  await selectCanonicalVariant(page, ownerVariants[2]);
  Object.assign(fixture.state.products[0].variants[2], { availableStock: 0, purchasable: false });
  await page.reload({ waitUntil: "networkidle0" }); await page.waitForSelector(".runtime-variant-options");
  check("fresh server sold-out state defeats prior selection", await selectedId() === null && (await optionState("Color", "Blue")).state === "OUT_OF_STOCK" && await gated());
  Object.assign(fixture.state.products[0].variants[2], ownerVariants[2]);

  await goto(43);
  check("stock absence and positive-stock ineligibility remain distinct", (await optionState("Renk", "Mor")).state === "OUT_OF_STOCK" && (await optionState("Renk", "Beyaz")).state === "NOT_PURCHASABLE");
  await capture("out-of-stock-three-dimensions", desktop);
  await clickOption(page, "Kapasite", "256 GB"); await clickOption(page, "Beden", "M");
  check("third dimension first constrains both siblings without auto-pick", (await optionState("Renk", "Mavi")).disabled === false
    && (await optionState("Renk", "Turuncu")).disabled === true && await selectedId() === null);
  await clickOption(page, "Renk", "Mavi");
  check("three-dimensional final resolution is canonical", await selectedId() === "403");
  await capture("three-dimensions-selected", desktop);
  await goto(46); await clickOption(page, "Color", "Orange"); await clickOption(page, "Size", "M");
  check("duplicate-combination ambiguity never picks an arbitrary ID", await selectedId() === null && await gated()
    && await page.$eval(".runtime-variant-status", (el) => el.innerText.includes("tek bir ürün")));

  await goto(45);
  check("HTML-shaped, quoted, Unicode, RTL and emoji labels render as inert text", await page.evaluate(() => !window.__r29Injected
    && document.querySelectorAll(".runtime-variant-selection script,.runtime-variant-selection img").length === 0)
    && await page.$eval(".runtime-variant-selection", (el, group, value) => el.textContent.includes(group) && el.textContent.includes(value), hostileGroup, hostileValue));
  check("arbitrary server color text never reaches CSS or classes", await page.$eval(".runtime-variant-selection", (el) => el.querySelectorAll("[style],.runtime-variant-swatch").length === 0
    && [...el.querySelectorAll("[class]")].every((node) => !/url\(|unsafe\.invalid|<script/i.test(node.className))));
  await selectCanonicalVariant(page, hostileVariants[0]);
  await capture("hostile-labels", desktop);

  const viewports = [desktop, {width:1280,height:720}, {width:1024,height:768}, {width:768,height:1024}, {width:390,height:844}, {width:360,height:800}];
  for (const viewport of viewports) {
    await page.setViewport({ ...viewport, isMobile: viewport.width <= 390, hasTouch: viewport.width <= 768 });
    await goto(42); await selectCanonicalVariant(page, ownerVariants[2]);
    await inspectGeometry("owner", viewport); await capture("owner-selector", viewport); await axeCheck("owner", viewport);
    await goto(43); await selectCanonicalVariant(page, threeDimensionVariants[2]);
    await inspectGeometry("three-dimensions", viewport); await capture("three-dimensions", viewport);
    await goto(44);
    await inspectGeometry("many-long-options", viewport); await capture("many-long-options", viewport);
    await selectCanonicalVariant(page, manyVariants.at(-2));
    check(`long textual choice resolves safely at ${viewport.width}`, await selectedId() === "530");
    await goto(45); await inspectGeometry("hostile-labels", viewport); await capture("hostile-labels", viewport);
  }
  await page.setViewport(desktop); await goto(42);
  const orange = await optionButton(page, "Color", "Orange");
  await orange.hover(); await new Promise((resolve) => setTimeout(resolve, 200));
  const hover = await orange.evaluate((el) => ({ transform: getComputedStyle(el).transform, duration: getComputedStyle(el).transitionDuration }));
  check("hover uses restrained 160ms movement", hover.transform !== "none" && hover.duration.includes("0.16s"));
  const rect = await orange.boundingBox(); await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2); await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 200));
  const press = await orange.evaluate((el) => getComputedStyle(el).transform);
  check("press produces a tactile scale", /0\.98/.test(press)); await page.mouse.up();
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  await orange.hover(); await page.mouse.down();
  check("reduced motion removes transition properties and transforms", await orange.evaluate((el) => getComputedStyle(el).transitionProperty === "none" && getComputedStyle(el).transform === "none"));
  await page.mouse.up(); await clearOptions(page); await clickOption(page, "Size", "M"); await clickOption(page, "Color", "Blue");
  check("reduced motion preserves selection feedback and exact ID", await selectedId() === "303");
  await capture("reduced-motion", desktop);
  await page.emulateMediaFeatures([]);
  await goto(44);
  for (let i=0;i<10;i++) {
    const start=performance.now(); await selectCanonicalVariant(page, manyVariants[i]); timings.push(performance.now()-start);
  }
  check("many-option UI completes repeated selection without stale IDs", await selectedId() === String(manyVariants[9].id));
  await goto(47); check("simple product remains selector-free and purchasable", !(await page.$(".runtime-variant-selection")) && !(await page.$eval(".purchase-row .primary-button", (el) => el.disabled)));
  check("zero raw-label execution, browser errors, external network and unknown API routes", errors.length === 0 && external.length === 0 && fixture.state.unknown.length === 0);
} catch (error) { failure = error; console.error(error); await page.screenshot({ path:path.join(out,"failure.png"),fullPage:true }).catch(()=>{}); }
finally {
  await fs.writeFile(path.join(out,"selector-result.json"),JSON.stringify({result:failure?"FAIL":"PASS",error:failure?.message,checks,geometry,screenshots,accessibility,timings,errors,external,unknown:fixture.state.unknown,
    bundleSha256:createHash("sha256").update(fixture.html).digest("hex"), productionWrites:0,providerCalls:0},null,2));
  await browser.close(); await fixture.close();
}
if(failure) process.exitCode=1;
