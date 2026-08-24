import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "05_comparisons");

const screens = [
  ["CAL-01", "Giriş", "EXACT_REFERENCE", "CAL-01-login.png"],
  ["CAL-02", "Ana Sayfa", "EXACT_REFERENCE", "CAL-02-home.png"],
  ["CAL-03", "Kategoriler", "EXACT_REFERENCE", "CAL-03-categories.png"],
  ["CAL-04", "Ürün Listeleme", "PARTIAL_REFERENCE", "CAL-04-plp.png"],
  ["CAL-05", "Filtre", "INFERRED_PROTOTYPE", "CAL-05-filter.png"],
  ["CAL-06", "Ürün Detayı", "EXACT_GEOMETRY_WITH_BRAND_PALETTE_DELTA", "CAL-06-product-detail.png"],
  ["CAL-07", "Sepet", "INFERRED_PROTOTYPE", "CAL-07-cart.png"],
  ["CAL-08", "Checkout", "EXACT_REFERENCE", "CAL-08-checkout.png"],
  ["CAL-09", "Sipariş Detayı", "EXACT_REFERENCE", "CAL-09-order-detail.png"],
  ["CAL-10", "Hesabım", "EXACT_REFERENCE", "CAL-10-account.png"],
  ["CAL-11", "Support Hub", "EXACT_VISUAL_WITH_ROUTE_DELTA", "CAL-11-support-hub.png"],
  ["CAL-12", "NovaBot", "EXACT_SHELL_WITH_REQUIRED_RICH_STATE", "CAL-12-novabot.png"],
];

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), "utf8"));
}

function href(relativePath) {
  return `../../${relativePath}`;
}

async function main() {
  const parity = await json("04_source_native_parity/visual-evidence-manifest.json");
  const phone = await json("02_phone_1080x2400/capture-manifest.json");
  const tablet = await json("03_tablet_1600x2560/capture-manifest.json");
  const boards = await json("08_review_boards/review-board-manifest.json");
  const v2 = await json("05_comparisons/v2-rejected-phone/v2-rejected-baseline-manifest.json");

  for (const [calId, title, classification, boardName] of screens) {
    const comparison = parity.comparisons.find((entry) => entry.calibration === calId);
    const phoneFile = phone.files.find((entry) => entry.calibration === calId);
    const tabletFile = tablet.files.find((entry) => entry.calibration === calId);
    const board = boards.boards.find((entry) => entry.calibration === calId);
    const v2File = v2.captures.find((entry) => entry.calibration === calId);
    if (!comparison || !phoneFile || !tabletFile || !board || !v2File) {
      throw new Error(`${calId}: final comparison input is missing.`);
    }

    const lower = calId.toLowerCase();
    const record = {
      schemaVersion: 1,
      calibration: calId,
      title,
      classification,
      v2HumanDecision: "REJECTED",
      v3HumanDecision: "REJECTED",
      v4HumanDecision: "PENDING",
      rapidSwitch: {
        href: `../blink.html?cal=${calId}`,
        mode: "SOURCE_V4_BLINK_650MS_WITH_MANUAL_TOGGLE",
        status: "AVAILABLE_LOCAL_ONLY",
      },
      canonicalArtifacts: {
        sourceOriginal: {
          href: href(`00_sources/${comparison.source.relativePath}`),
          ...comparison.source,
        },
        sourceNormalized: {
          href: href(`04_source_native_parity/${comparison.artifacts.normalizedSource.relativePath}`),
          ...comparison.artifacts.normalizedSource,
        },
        v2RejectedPhone: {
          href: href(`05_comparisons/v2-rejected-phone/${calId}.png`),
          ...v2File,
        },
        v4Phone: { href: href(phoneFile.relativePath), ...phoneFile },
        v4Tablet: { href: href(tabletFile.relativePath), ...tabletFile },
        sideBySide: {
          href: href(`04_source_native_parity/${comparison.artifacts.sideBySide.relativePath}`),
          ...comparison.artifacts.sideBySide,
        },
        overlay50: {
          href: href(`04_source_native_parity/${comparison.artifacts.overlay50.relativePath}`),
          ...comparison.artifacts.overlay50,
        },
        absoluteDifference: {
          href: href(`04_source_native_parity/${comparison.artifacts.absoluteDifference.relativePath}`),
          ...comparison.artifacts.absoluteDifference,
        },
        heatmap: {
          href: href(`04_source_native_parity/${comparison.artifacts.heatmap.relativePath}`),
          ...comparison.artifacts.heatmap,
        },
        reviewBoard: {
          href: href(`08_review_boards/${boardName}`),
          ...board.board,
        },
      },
      metrics: comparison.metrics,
      componentAuthorityEvidence: calId === "CAL-04" ? {
        role: "EXACT_PRODUCT_CARD_COMPONENT_WITH_PARTIAL_FULL_SCREEN_REFERENCE",
        manifestHref: "../../04_source_native_parity/product-card-authority/product-card-authority-manifest.json",
        detailedSourceHref: "../../00_sources/SRC-09__ürün kartı tasarımı.png",
        compactCrossCheckHref: "../../00_sources/SRC-12__favori kısmı.png",
        explicitExclusion: "SRC-09 is not a CAL-06/PDP source.",
      } : null,
      brandPaletteDelta: calId === "CAL-06" ? {
        geometryInformationArchitectureCompositionAuthority: "SRC-13",
        purpleAuthoritative: false,
        authoritativePalette: "NovaStore navy/orange/warm-neutral",
        fullPixelColorGate: "NOT_APPLICABLE_BY_OWNER_CONTRACT",
      } : null,
      note: classification === "EXACT_GEOMETRY_WITH_BRAND_PALETTE_DELTA"
        ? "SRC-13 is exact for geometry, information architecture, and composition. The owner-approved NovaStore palette delta makes full-pixel color metrics diagnostic only; human visual approval is pending."
        : classification.startsWith("EXACT")
          ? "Numeric evidence is diagnostic and remains outside preferred thresholds; human visual approval is pending."
          : "No exact full-screen pixel-parity acceptance applies; this evidence is a source-family/adaptive review surface.",
    };

    const directory = path.join(OUTPUT, calId);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "evidence-manifest.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    const links = Object.entries(record.canonicalArtifacts)
      .map(([name, artifact]) => `- [${name}](${artifact.href})`)
      .join("\n");
    const authorityLinks = calId === "CAL-04"
      ? "\n- [Ürün kartı component authority manifesti](../../04_source_native_parity/product-card-authority/product-card-authority-manifest.json)\n- [SRC-09 ayrıntılı ürün kartı](../../00_sources/SRC-09__ürün%20kartı%20tasarımı.png)\n- [SRC-12 Favoriler sol üst kart çapraz doğrulaması](../../00_sources/SRC-12__favori%20kısmı.png)\n"
      : calId === "CAL-06"
        ? "\n- Otorite: SRC-13 geometri/bilgi mimarisi/kompozisyon exact. Mor palet otorite değildir; NovaStore lacivert/turuncu/sıcak-nötr paleti bağlayıcıdır.\n"
        : "";
    await writeFile(path.join(directory, "README.md"), `# ${calId} · ${title}\n\n- Kaynak sınıfı: \`${classification}\`\n- V2 insan kararı: **REJECTED**\n- V3 insan kararı: **REJECTED**\n- V4 insan kararı: **PENDING**\n- [650 ms kaynak ↔ V4 blink / manuel toggle](../blink.html?cal=${calId})\n\n${links}\n${authorityLinks}\nBu klasör binary dosyaları çoğaltmadan final kanonik artifact’lere bağlanır. Tam çözünürlüklü dosyalar açılmadan insan görsel kararı verilmemelidir.\n`, "utf8");
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exitCode = 1;
});
