import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import {
  NOVABOT_PRESENTATION_STORAGE_KEY,
  loadNovaBotPresentationPreference,
  normalizeNovaBotPresentationPreference,
  resolveNovaBotBoundaryTransfer,
  resolveNovaBotEdge,
} from "../src/assistant/novabotPresentation";

const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);
const cssUrl = new URL("../src/prototype.css", import.meta.url);

async function box(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value).not.toBeNull();
  return value!;
}

async function drag(page: Page, trigger: Locator, x: number, y: number) {
  const start = await box(trigger);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

async function syntheticTouch(locator: Locator, type: "touchstart" | "touchmove", clientY: number) {
  await locator.evaluate((element, input) => {
    const event = new Event(input.type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: [{ clientX: 100, clientY: input.clientY }] });
    element.dispatchEvent(event);
  }, { type, clientY });
}

test("R11-R5 presentation preferences and scroll transfer fail closed", () => {
  expect(normalizeNovaBotPresentationPreference({ schemaVersion: 1, edge: "left", safeVerticalRatio: 3, movable: false, hidden: true }))
    .toEqual({ schemaVersion: 1, edge: "left", safeVerticalRatio: 1, movable: false, hidden: true });
  expect(normalizeNovaBotPresentationPreference({ schemaVersion: 99, edge: "left", hidden: true }))
    .toEqual({ schemaVersion: 1, edge: "right", safeVerticalRatio: 0.62, movable: true, hidden: false });
  expect(loadNovaBotPresentationPreference({ getItem: () => { throw new Error("storage denied"); } }))
    .toEqual({ schemaVersion: 1, edge: "right", safeVerticalRatio: 0.62, movable: true, hidden: false });
  expect(resolveNovaBotEdge(179, 360)).toBe("left");
  expect(resolveNovaBotEdge(180, 360)).toBe("right");

  const common = { innerScrollHeight: 500, innerClientHeight: 100, parentScrollHeight: 1200, parentClientHeight: 400 };
  expect(resolveNovaBotBoundaryTransfer({ ...common, fingerDeltaY: 30, innerScrollTop: 0, parentScrollTop: 100 })).toBe(70);
  expect(resolveNovaBotBoundaryTransfer({ ...common, fingerDeltaY: -30, innerScrollTop: 400, parentScrollTop: 100 })).toBe(130);
  expect(resolveNovaBotBoundaryTransfer({ ...common, fingerDeltaY: 30, innerScrollTop: 120, parentScrollTop: 100 })).toBe(100);
  expect(resolveNovaBotBoundaryTransfer({ ...common, fingerDeltaY: 30, innerScrollTop: 0, parentScrollTop: 0 })).toBe(0);
});

test("R11-R5 launcher snaps, persists, disambiguates drag, and remains recoverable", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/r11-r5-novabot-interaction-fixture.html");
  await page.evaluate((key) => localStorage.removeItem(key), NOVABOT_PRESENTATION_STORAGE_KEY);
  await page.reload();
  const anchor = page.getByTestId("global-novabot-anchor");
  const trigger = page.getByTestId("global-novabot-trigger");
  const dots = page.getByTestId("global-novabot-menu-trigger");
  await expect(anchor).toHaveAttribute("data-ready", "true");
  await expect(anchor).toHaveAttribute("data-edge", "right");
  const topbar = await box(page.getByTestId("fixture-topbar"));
  const bottomNav = await box(page.getByTestId("fixture-bottom-nav"));
  await expect.poll(async () => (await box(anchor)).y).toBeGreaterThanOrEqual(topbar.y + topbar.height);
  const initialAnchor = await box(anchor);
  const app = await box(page.getByTestId("calibration-app"));
  expect(initialAnchor.y).toBeGreaterThanOrEqual(topbar.y + topbar.height);
  expect(initialAnchor.y + initialAnchor.height).toBeLessThanOrEqual(bottomNav.y);
  await expect.poll(async () => {
    const value = await box(trigger);
    return value.x + value.width;
  }).toBeCloseTo(app.x + app.width - 8, 1);
  const settledInitialTrigger = await box(trigger);
  const settledInitialDots = await box(dots);
  expect(settledInitialDots.width).toBeCloseTo(22, 1);
  expect(settledInitialDots.x + settledInitialDots.width).toBeCloseTo(settledInitialTrigger.x + settledInitialTrigger.width + 4, 1);
  expect(settledInitialDots.y + settledInitialDots.height).toBeGreaterThan(settledInitialTrigger.y);
  await expect(dots).toHaveText("⋮");

  await dots.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByTestId("global-novabot-control-menu");
  await expect(menu).toBeVisible();
  for (const item of await menu.getByRole("menuitem").all()) expect((await box(item)).height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("fixture-open-count")).toHaveText("1");
  await drag(page, trigger, 18, 280);
  await expect(anchor).toHaveAttribute("data-edge", "left");
  await expect(page.getByTestId("fixture-open-count")).toHaveText("1");
  await expect.poll(async () => (await box(trigger)).x).toBeCloseTo(app.x + 8, 1);
  const settledLeftTrigger = await box(trigger);
  const settledLeftDots = await box(dots);
  expect(settledLeftDots.x).toBeCloseTo(settledLeftTrigger.x - 4, 1);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null")?.edge, NOVABOT_PRESENTATION_STORAGE_KEY)).toBe("left");

  await dots.click();
  await page.getByRole("menuitem", { name: "Bu konumda sabitle" }).click();
  await expect(anchor).toHaveAttribute("data-movable", "false");
  const fixedAnchor = await box(anchor);
  await drag(page, trigger, 330, 500);
  const afterFixedDrag = await box(anchor);
  expect(afterFixedDrag.x).toBeCloseTo(fixedAnchor.x, 1);
  expect(afterFixedDrag.y).toBeCloseTo(fixedAnchor.y, 1);
  await dots.click();
  await page.getByRole("menuitem", { name: "Hareketli kullan" }).click();
  await expect(anchor).toHaveAttribute("data-movable", "true");

  await dots.click();
  await page.getByRole("menuitem", { name: "Konumu sıfırla" }).click();
  await expect(anchor).toHaveAttribute("data-edge", "right");
  await dots.click();
  await page.getByRole("menuitem", { name: "NovaBot’u gizle" }).click();
  await expect(anchor).toBeHidden();
  await page.getByTestId("fixture-recovery").click();
  await expect(anchor).toBeVisible();
  await expect(anchor).toHaveAttribute("data-edge", "right");
  await expect(anchor).toHaveAttribute("data-movable", "true");

  await drag(page, trigger, 18, 260);
  await expect(anchor).toHaveAttribute("data-edge", "left");
  await page.reload();
  await expect(anchor).toHaveAttribute("data-ready", "true");
  await expect(anchor).toHaveAttribute("data-edge", "left");
});

test("R11-R5 message boundaries chain to the parent without arming page refresh", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/r11-r5-novabot-interaction-fixture.html");
  const outer = page.getByTestId("fixture-outer-scroll");
  const inner = page.getByTestId("fixture-messages");

  await outer.evaluate((element) => { element.scrollTop = 100; });
  await inner.evaluate((element) => { element.scrollTop = 0; });
  await syntheticTouch(inner, "touchstart", 100);
  await syntheticTouch(inner, "touchmove", 130);
  await expect.poll(() => outer.evaluate((element) => element.scrollTop)).toBe(70);

  await outer.evaluate((element) => { element.scrollTop = 100; });
  await inner.evaluate((element) => { element.scrollTop = 80; });
  await syntheticTouch(inner, "touchstart", 100);
  await syntheticTouch(inner, "touchmove", 130);
  await expect.poll(() => outer.evaluate((element) => element.scrollTop)).toBe(100);

  await inner.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await syntheticTouch(inner, "touchstart", 130);
  await syntheticTouch(inner, "touchmove", 100);
  await expect.poll(() => outer.evaluate((element) => element.scrollTop)).toBe(130);
  await expect(inner).toHaveAttribute("data-scroll-drag", "ignore");
});

test("R11-R5 composer reveal keeps the input above bottom navigation", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/tests/r11-r5-novabot-interaction-fixture.html");
  const outer = page.getByTestId("fixture-outer-scroll");
  const composer = page.getByTestId("fixture-composer");
  const bottomNav = page.getByTestId("fixture-bottom-nav");
  await outer.evaluate((element) => { element.scrollTop = 0; });
  expect((await box(composer)).y + (await box(composer)).height).toBeGreaterThan((await box(bottomNav)).y);
  await page.getByTestId("fixture-reveal-composer").click();
  await expect.poll(async () => {
    const composerBox = await box(composer);
    const navBox = await box(bottomNav);
    return composerBox.y + composerBox.height <= navBox.y - 9;
  }).toBe(true);

  await outer.evaluate((element) => {
    const app = element.closest<HTMLElement>(".cal-app")!;
    app.classList.add("mobile-page");
    app.dataset.keyboardVisible = "true";
    app.style.setProperty("--shell-safe-bottom", "40px");
    element.style.bottom = "260px";
    element.scrollTop = 0;
  });
  await page.getByTestId("fixture-reveal-composer").click();
  await expect.poll(async () => {
    const composerBox = await box(composer);
    const outerBox = await box(outer);
    return composerBox.y + composerBox.height <= outerBox.y + outerBox.height - 49;
  }).toBe(true);
});

test("R11-R5 source keeps one global launcher policy, safe exclusions, and keyboard recovery", () => {
  const source = readFileSync(prototypeUrl, "utf8");
  const css = readFileSync(cssUrl, "utf8");
  expect(source.match(/<GlobalNovaBotLauncher /g)).toHaveLength(1);
  expect(source).toContain("&& !keyboard.visible");
  expect(source).toContain('!["CAL-01", "CAL-08", "CAL-12"].includes(route.cal)');
  expect(source).toContain('data-testid="novabot-settings-recovery"');
  expect(source).toContain('data-testid="novabot-help-recovery"');
  expect(source.match(/data-scroll-drag="ignore"/g)).toHaveLength(2);
  expect(source.match(/ref=\{composerRef\}/g)).toHaveLength(2);
  expect(css).toMatch(/\.messages\s*\{[^}]*overscroll-behavior-y:\s*auto[^}]*touch-action:\s*pan-y/u);
  expect(css).toMatch(/\.global-novabot-menu-trigger\s*\{[^}]*position:\s*absolute/u);
  expect(css).toMatch(/\.global-novabot-anchor\s*\{[^}]*width:\s*56px/u);
  expect(css).toContain('.global-novabot-anchor[data-edge="right"] .global-novabot-menu-trigger { right: -4px; }');
  expect(css).toContain('.global-novabot-anchor[data-edge="left"] .global-novabot-menu-trigger { left: -4px; }');
  const nativeSuggestions = source.indexOf('<div className="suggestion-row" aria-label="NovaBot önerileri">');
  const nativeComposer = source.indexOf('<form ref={composerRef} className="composer native-composer"');
  const supportHandoff = source.indexOf('<button className="escalate" type="button"');
  expect(nativeSuggestions).toBeGreaterThan(-1);
  expect(nativeComposer).toBeGreaterThan(nativeSuggestions);
  expect(supportHandoff).toBeGreaterThan(nativeComposer);
  expect(source).toContain('className={`chat-card native-chat-card${messages.length > 1 ? " active-conversation" : ""}`}');
  expect(css).toMatch(/\.native-chat-card \.composer\.native-composer\s*\{[^}]*position:\s*relative[^}]*bottom:\s*auto[^}]*margin:\s*8px 14px 0/u);
  expect(css).toMatch(/\.chat-card\.native-chat-card\.active-conversation \.messages\s*\{[^}]*padding-bottom:\s*14px/u);
});
