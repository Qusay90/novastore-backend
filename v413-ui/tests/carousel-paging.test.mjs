import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { transformWithOxc } from "vite";

const sourceUrl = new URL("../src/mobile/Carousel.tsx", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const require = createRequire(import.meta.url);
const transformed = await transformWithOxc(source, fileURLToPath(sourceUrl), {
  jsx: { runtime: "automatic" },
  lang: "tsx",
});
const resolvedImports = transformed.code
  .replaceAll(
    'from "react/jsx-runtime"',
    `from ${JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href)}`,
  )
  .replaceAll(
    'from "react"',
    `from ${JSON.stringify(pathToFileURL(require.resolve("react")).href)}`,
  );
const runtimeModule = await import(
  `data:text/javascript;base64,${Buffer.from(resolvedImports).toString("base64")}`
);

const {
  pagedCarouselBounds,
  pagedCarouselSettleProgress,
  resolvePagedCarouselTarget,
} = runtimeModule;

test("paged drag range never exceeds one adjacent viewport", () => {
  assert.deepEqual(pagedCarouselBounds(2, 320, 1280), [320, 960]);
  assert.deepEqual(pagedCarouselBounds(0, 320, 1280), [0, 320]);
  assert.deepEqual(pagedCarouselBounds(4, 320, 1280), [960, 1280]);

  // A partial last page must remain reachable without exposing space beyond it.
  assert.deepEqual(pagedCarouselBounds(3, 320, 1100), [640, 1100]);
});

test("gesture target is current or exactly one neighbor regardless of distance", () => {
  const resolve = (overrides = {}) => resolvePagedCarouselTarget({
    startPage: 2,
    displacement: 0,
    velocity: 0,
    viewport: 320,
    maximumPage: 4,
    ...overrides,
  });

  assert.equal(resolve({ displacement: 10_000 }), 3);
  assert.equal(resolve({ displacement: -10_000 }), 1);
  assert.equal(resolve({ displacement: 20, velocity: 900 }), 3);
  assert.equal(resolve({ displacement: -20, velocity: -900 }), 1);
  assert.equal(resolve({ displacement: 20, velocity: 100 }), 2);
  assert.equal(resolve({ displacement: 10_000, canceled: true }), 2);
  assert.equal(resolve({ startPage: 0, displacement: -10_000 }), 0);
  assert.equal(resolve({ startPage: 4, displacement: 10_000 }), 4);
});

test("paged settle curve is bounded and monotonic with exact endpoints", () => {
  const samples = Array.from({ length: 101 }, (_, index) => (
    pagedCarouselSettleProgress(index / 100)
  ));

  assert.equal(pagedCarouselSettleProgress(-1), 0);
  assert.equal(pagedCarouselSettleProgress(0), 0);
  assert.equal(pagedCarouselSettleProgress(1), 1);
  assert.equal(pagedCarouselSettleProgress(2), 1);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(samples[index] >= samples[index - 1], `settle reversed at sample ${index}`);
    assert.ok(samples[index] >= 0 && samples[index] <= 1, `settle overshot at sample ${index}`);
  }
});
