import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CUSTOMER_CARD_MEDIA_LIMIT,
  productCardMediaIndex,
  resolveCustomerCardImages,
  safeCustomerMediaUrl,
} from "../src/customerProductCardModel.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

test("müşteri kartı medyası güvenli URL, ana görsel sırası ve tekrar temizliği uygular", () => {
  assert.equal(safeCustomerMediaUrl("/uploads/product.webp"), "/uploads/product.webp");
  assert.equal(safeCustomerMediaUrl("https://cdn.example.test/product.webp"), "https://cdn.example.test/product.webp");
  for (const value of ["http://cdn.example.test/a.webp", "//evil.example/a.webp", "/\\evil.example/a.webp", "javascript:alert(1)", "data:text/html,bad"]) {
    assert.equal(safeCustomerMediaUrl(value), null, value);
  }

  const images = resolveCustomerCardImages({
    imageUrl: "https://cdn.example.test/cover.webp",
    media: [
      { id: "later", type: "image", url: "https://cdn.example.test/later.webp", sortOrder: 2 },
      { id: "cover", type: "image", url: "https://cdn.example.test/cover.webp", sortOrder: 9, isMain: true },
      { id: "video", type: "video", url: "https://cdn.example.test/demo.mp4", sortOrder: 0 },
      { id: "middle", type: "image", url: "https://cdn.example.test/middle.webp", sortOrder: 1 },
    ],
  });
  assert.deepEqual(images, [
    "https://cdn.example.test/cover.webp",
    "https://cdn.example.test/middle.webp",
    "https://cdn.example.test/later.webp",
  ]);
  assert.ok(Object.isFrozen(images));
});

test("müşteri kartı medya fan-out sınırı uygular", () => {
  const images = resolveCustomerCardImages({
    media: Array.from({ length: CUSTOMER_CARD_MEDIA_LIMIT + 5 }, (_, index) => ({
      id: index,
      type: "image",
      url: `https://cdn.example.test/${index}.webp`,
      sortOrder: index,
    })),
  });
  assert.equal(images.length, CUSTOMER_CARD_MEDIA_LIMIT);
});

test("yatay işaretçi bölgeleri tüm medya indekslerini deterministik seçer", () => {
  assert.equal(productCardMediaIndex(100, 100, 400, 4), 0);
  assert.equal(productCardMediaIndex(199, 100, 400, 4), 0);
  assert.equal(productCardMediaIndex(200, 100, 400, 4), 1);
  assert.equal(productCardMediaIndex(399, 100, 400, 4), 2);
  assert.equal(productCardMediaIndex(500, 100, 400, 4), 3);
  assert.equal(productCardMediaIndex(-100, 100, 400, 4), 0);
});

test("aktif storefront tek ortak kart ve merkezi Lucide ikon sınırını kullanır", async () => {
  const [card, icons, generated, integrated, publicStore, css, packageSource] = await Promise.all([
    read("src/CustomerProductCard.jsx"),
    read("src/CustomerIcon.jsx"),
    read("src/CanonicalRuntimePresentation.jsx"),
    read("src/IntegratedApp.jsx"),
    read("src/PublicStorePage.jsx"),
    read("src/integrated.css"),
    read("package.json"),
  ]);
  const activeSources = [card, icons, generated, integrated, publicStore].join("\n");
  const packageJson = JSON.parse(packageSource);

  assert.doesNotMatch(activeSources, /@phosphor-icons\/react/);
  assert.doesNotMatch([card, generated, publicStore].join("\n"), /Satışa hazır/);
  assert.equal(packageJson.dependencies["lucide-react"], "1.33.0");
  assert.equal(packageJson.devDependencies["@phosphor-icons/react"], "2.1.10", "sealed exact-source preview dependency stays development-only");
  assert.match(icons, /CUSTOMER_ICON_SEMANTICS/);
  assert.match(icons, /strokeWidth=\{strokeWidth \?\? \(weight === "bold" \? 2\.25 : 2\)\}/);
  assert.match(generated, /CustomerProductCard/);
  assert.match(integrated, /CustomerProductCard/);
  assert.match(publicStore, /CustomerProductCard/);
  assert.match(card, /CUSTOMER_CARD_AUTOPLAY_DWELL_MS = 360/);
  assert.match(card, /CUSTOMER_CARD_AUTOPLAY_INTERVAL_MS = 1050/);
  assert.match(card, /window\.setInterval/);
  assert.match(card, /onPointerLeave=\{resetMedia\}/);
  assert.match(card, /setActiveMedia\(0\)/);
  assert.match(card, /setGalleryPrimed\(true\)/);
  assert.match(card, /window\.clearInterval\(cycleTimer\.current\)/);
  assert.match(card, /referrerPolicy="no-referrer"/);
  assert.doesNotMatch(card, /loading=\{index === 0 \? "lazy" : "eager"\}/);
  assert.doesNotMatch(card, /onClick=\{[^}]*setActiveMedia/);
  assert.match(css, /\.customer-card-media-stage[\s\S]*?padding: 0/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
