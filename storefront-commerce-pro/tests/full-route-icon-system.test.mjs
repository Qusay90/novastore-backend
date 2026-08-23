import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("active customer runtime uses the central Lucide layer without decorative stars", async () => {
  const files = [
    "src/CustomerIcon.jsx",
    "src/IntegratedApp.jsx",
    "src/CanonicalRuntimePresentation.jsx",
    "src/AssistantWidget.jsx",
    "src/NovaServiceIcon.jsx",
    "src/PublicStorePage.jsx",
  ];
  const sources = await Promise.all(files.map(async (file) => [file, await readFile(path.join(root, file), "utf8")]));
  for (const [file, source] of sources) {
    assert.doesNotMatch(source, /\bSparkles?\b|\bStarFour\b|nova-service-icon__accent/, `${file} contains a decorative star/sparkle owner.`);
    if (file !== "src/CustomerIcon.jsx") assert.doesNotMatch(source, /from\s+["']lucide-react["']/, `${file} bypasses the semantic icon layer.`);
  }
  const iconLayer = sources.find(([file]) => file === "src/CustomerIcon.jsx")[1];
  assert.match(iconLayer, /CircleHelp/);
  assert.match(iconLayer, /BadgePercent/);
  assert.match(iconLayer, /Bot/);
  assert.match(iconLayer, /export const Star = adapt\(LucideStar\)/, "Rating star semantic must remain available.");
});

test("icon target and visible glyph sizing remain explicitly separate", async () => {
  const css = await readFile(path.join(root, "src/integrated.css"), "utf8");
  assert.match(css, /--customer-icon-glyph-compact:\s*18px/);
  assert.match(css, /--customer-icon-glyph-standard:\s*20px/);
  assert.match(css, /--customer-icon-glyph-semantic:\s*24px/);
  assert.match(css, /--customer-icon-target:\s*44px/);
  assert.match(css, /transform:\s*scale\(1\.04\)/);
  assert.match(css, /transform:\s*scale\(\.97\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.customer-product-card\.public-store-product-card \.customer-card-media-stage > img\.is-active[\s\S]*?opacity:\s*1/, "Public-store shared card cover must win the public-store image opacity cascade.");
});
