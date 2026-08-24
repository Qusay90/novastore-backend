import type { Page } from "@playwright/test";

const REQUIRED_FONT_FACES = [
  ['500 16px "Nova Lato"', "NovaStore"],
  ['600 16px "Nova Lato"', "NovaStore"],
  ['400 16px "Nova Inter"', "NovaStore"],
  ['500 16px "Nova Inter"', "NovaStore"],
  ['600 16px "Nova Inter"', "NovaStore"],
] as const;

export async function waitForRequiredFonts(page: Page) {
  const missing = await page.evaluate(async (faces) => {
    const results = await Promise.all(faces.map(async ([font, sample]) => {
      try {
        const loaded = await document.fonts.load(font, sample);
        return loaded.length > 0 && document.fonts.check(font, sample) ? null : font;
      } catch {
        return font;
      }
    }));
    return results.filter((font): font is string => font !== null);
  }, REQUIRED_FONT_FACES);

  if (missing.length > 0) {
    throw new Error(`Required local fonts did not load: ${missing.join(", ")}`);
  }
}
