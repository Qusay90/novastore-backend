import assert from "node:assert/strict";

export async function optionButton(page, group, value) {
  for (const button of await page.$$("[data-variant-option]")) {
    if (await button.evaluate((el, group, value) => el.dataset.variantOption === value
      && el.closest("[data-variant-group]")?.dataset.variantGroup === group, group, value)) return button;
    await button.dispose();
  }
  throw new Error(`Missing option: ${group}: ${value}`);
}

export async function clickOption(page, group, value) {
  const button = await optionButton(page, group, value);
  assert.equal(await button.evaluate((el) => el.getAttribute("aria-disabled")), "false", `${group}: ${value} available`);
  await button.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await button.click();
  await button.dispose();
}

export async function clearOptions(page) {
  for (const button of await page.$$(".runtime-variant-clear")) {
    if (await button.evaluate((el) => el.getAttribute("aria-disabled") === "false")) {
      await button.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
      await button.click();
    }
    await button.dispose();
  }
}

export async function selectCanonicalVariant(page, row) {
  assert(row?.id && row.selections?.length, "test must supply an actual canonical DTO row");
  await page.waitForSelector(".runtime-variant-selection");
  await clearOptions(page);
  for (const { group, value } of row.selections) await clickOption(page, group, value);
  await page.waitForFunction((id) => document.querySelector(".runtime-variant-selection")?.dataset.resolvedVariantId === String(id), {}, row.id);
  assert.equal(await page.$$eval('[data-variant-option][aria-pressed="true"]', (buttons) => buttons.length), row.selections.length);
}

export async function clickCentered(page, selector) {
  const button = await page.waitForSelector(selector, { visible: true });
  await button.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForFunction((el) => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)); }, { timeout: 5000 }, button);
  await button.click(); await button.dispose();
}
