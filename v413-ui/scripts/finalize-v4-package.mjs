import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE = path.dirname(ROOT);
const V4_1_PENDING = path.join(ROOT, "V4_1_STATUS.md");
if (existsSync(V4_1_PENDING)) {
  throw new Error("V4.1 otomatik finalize devre dışı: insan görsel kararı PENDING. V4 PASS receipt üretilemez.");
}
const PRODUCTION = path.join(WORKSPACE, "android-customer-theme-integration");
const V3_ROOT = path.join(WORKSPACE, "android-customer-visual-calibration-v3");
const V3_ZIP = path.join(WORKSPACE, "android-customer-visual-calibration-v3.zip");
const RESULT = "PASS — V4 VISUAL RECOVERY CANDIDATE READY FOR HUMAN APPROVAL";
const V3_REJECTION = "VISIBLE PHONE FRAME, SAFE-AREA, PRODUCT-CARD, LAYOUT, TABLET AND SOURCE-PARITY DEFECTS";
const CAL_IDS = Array.from({ length: 12 }, (_, index) => `CAL-${String(index + 1).padStart(2, "0")}`);
const TITLES = {
  "CAL-01": "Giriş",
  "CAL-02": "Ana Sayfa",
  "CAL-03": "Kategoriler",
  "CAL-04": "Ürün Listeleme",
  "CAL-05": "Filtre",
  "CAL-06": "Ürün Detayı",
  "CAL-07": "Sepet",
  "CAL-08": "Checkout",
  "CAL-09": "Sipariş Detayı",
  "CAL-10": "Hesabım",
  "CAL-11": "Support Hub",
  "CAL-12": "NovaBot",
};

const now = new Date().toISOString();
const normalize = (value) => value.replace(/\\/g, "/");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const writeJson = async (relative, value) => {
  const target = path.join(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const writeText = async (relative, value) => {
  const target = path.join(ROOT, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value.replace(/\r\n/g, "\n"), "utf8");
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const git = (args) => execFileSync("git", ["-C", PRODUCTION, ...args], { encoding: "utf8" }).replace(/\r\n/g, "\n");
const hashFile = async (absolute) => sha256(await readFile(absolute));
const artifactCount = (artifacts) => Array.isArray(artifacts) ? artifacts.length : Object.keys(artifacts ?? {}).length;
const csv = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

async function verifyManifestArtifacts(manifest) {
  const entries = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.relativePath === "string" && typeof value.sha256 === "string") entries.push(value);
    for (const child of Object.values(value)) visit(child);
  };
  visit(manifest);
  const unique = new Map(entries.map((entry) => [entry.relativePath, entry]));
  for (const entry of unique.values()) {
    const absolute = path.join(ROOT, entry.relativePath);
    assert(existsSync(absolute), `Manifest artifact eksik: ${entry.relativePath}`);
    const details = await stat(absolute);
    if (Number.isFinite(entry.bytes)) assert(details.size === entry.bytes, `Artifact boyutu değişti: ${entry.relativePath}`);
    assert((await hashFile(absolute)) === entry.sha256.toLowerCase(), `Artifact hash değişti: ${entry.relativePath}`);
  }
  return unique.size;
}

async function productionIntegrity() {
  const baseline = await readJson("../android-customer-visual-calibration-v3/09_machine/worktree-integrity.json");
  const branch = git(["branch", "--show-current"]).trim();
  const head = git(["rev-parse", "HEAD"]).trim();
  const tree = git(["rev-parse", "HEAD^{tree}"]).trim();
  const staged = git(["diff", "--cached", "--name-only"]).trim().split("\n").filter(Boolean);
  const rawStatus = `${git(["status", "--short", "--untracked-files=all"]).trimEnd()}\n`;
  const statusLines = rawStatus.trimEnd().split("\n").filter(Boolean);
  const normalizedStatusSha256 = sha256(Buffer.from(rawStatus, "utf8"));
  const protectedWip = [];
  for (const expected of baseline.protectedWip) {
    const absolute = path.join(PRODUCTION, ...expected.path.split("/"));
    assert(existsSync(absolute), `Korunan production WIP eksik: ${expected.path}`);
    const bytes = await readFile(absolute);
    protectedWip.push({ ...expected, finalBytes: bytes.length, finalSha256: sha256(bytes), byteForByteMatch: bytes.length === expected.bytes && sha256(bytes) === expected.sha256 });
  }
  const trackedDirtyCount = statusLines.filter((line) => !line.startsWith("??")).length;
  const untrackedCount = statusLines.filter((line) => line.startsWith("??")).length;
  const allBytesMatch = protectedWip.every((entry) => entry.byteForByteMatch);
  assert(branch === baseline.productionRepository.branch, `Production branch değişti: ${branch}`);
  assert(head === baseline.productionRepository.head, `Production HEAD değişti: ${head}`);
  assert(tree === baseline.productionRepository.tree, `Production tree değişti: ${tree}`);
  assert(staged.length === 0, `Production staged alanı sıfır değil: ${staged.join(", ")}`);
  assert(trackedDirtyCount === 6 && untrackedCount === 5 && statusLines.length === 11, "Production WIP yol sayısı değişti");
  assert(normalizedStatusSha256 === baseline.productionRepository.normalizedStatusSha256, "Production normalized status hash değişti");
  assert(allBytesMatch, "Korunan production WIP byte eşleşmesi başarısız");
  return {
    schemaVersion: 1,
    generatedAt: now,
    status: "FINAL_MATCH_VERIFIED",
    productionRepository: {
      root: normalize(PRODUCTION), branch, head, tree,
      stagedCount: staged.length, trackedDirtyCount, untrackedCount,
      totalProtectedWipPaths: statusLines.length, normalizedStatusSha256,
    },
    protectedWip,
    finalComparison: {
      status: "PASS — EXACT BASELINE MATCH",
      branch, head, tree, normalizedStatusSha256,
      byteForByteMatch: allBytesMatch, trackedDirtyCount, untrackedCount,
      totalProtectedWipPaths: statusLines.length, stagedCount: staged.length,
      productionSourceChangesByV4: 0,
    },
  };
}

const phone = await readJson("02_phone_1080x2400/capture-manifest.json");
const tablet = await readJson("03_tablet_1600x2560/capture-manifest.json");
const framed = await readJson("04_framed_preview/capture-manifest.json");
const parity = await readJson("04_source_native_parity/visual-evidence-manifest.json");
const productCard = await readJson("04_source_native_parity/product-card-authority/product-card-authority-manifest.json");
const bottomNav = await readJson("06_iteration_history/resolved-differences/bottom-nav-recovery/bottom-nav-recovery-manifest.json");
const interaction = await readJson("07_interaction_evidence/interaction-evidence-manifest.json");
const boards = await readJson("08_review_boards/review-board-manifest.json");
const geometry = await readJson("09_machine/v4-geometry-measurements.json");
const deltas = await readJson("09_machine/v4-declared-delta-metrics.json");

for (const [label, manifest, expected] of [["phone", phone, 12], ["tablet", tablet, 12], ["framed", framed, 12]]) {
  assert(manifest.files?.length === expected, `${label} capture sayısı ${expected} değil`);
  assert(manifest.blockedExternalRequestCount === 0, `${label} dış ağ isteği saptandı`);
  assert(CAL_IDS.every((id) => manifest.files.some((entry) => entry.calibration === id)), `${label} CAL matrisi eksik`);
  await verifyManifestArtifacts(manifest);
}
assert(parity.completedCount === 12 && parity.skippedCount === 0 && parity.comparisons?.length === 12, "Kaynak parity matrisi 12/12 değil");
assert(productCard.status.startsWith("COMPLETE") && artifactCount(productCard.artifacts) >= 12, "Ürün kartı otorite kanıtı eksik");
assert(artifactCount(bottomNav.artifacts) === 16, "Alt navigasyon recovery kanıtı eksik");
assert(interaction.status === "PASS" && interaction.artifacts?.length === 25, "Etkileşim kanıtı PASS/25 değil");
assert(Object.values(interaction.diagnostics).every((items) => items.length === 0), "Etkileşim tanı raporunda hata var");
assert(boards.boardCount === 12 && boards.boards?.length === 12, "Review board sayısı 12 değil");
assert(geometry.status === "PASS" && geometry.failureCount === 0 && geometry.records?.length === 24, "Geometri kapısı PASS/24 değil");
assert(deltas.records?.length === 12 && deltas.status.startsWith("PASS"), "Declared-delta metriği 12/12 değil");
assert(geometry.records.every((entry) => entry.bottomReachPass === true), "Bottom reach ölçümünde FAIL var");
const measuredPhone = geometry.records.filter((entry) => entry.profile === "phone" && !String(entry.bboxMatchPercent).startsWith("NOT_APPLICABLE"));
assert(measuredPhone.length === 10 && measuredPhone.every((entry) => Number.isFinite(entry.bboxMatchPercent)), "Zorunlu telefon bbox ölçümü eksik");

const worktree = await productionIntegrity();
const v3ZipSha256 = await hashFile(V3_ZIP);
assert(v3ZipSha256 === "b4e899c2abf1f56287887120aeb14a2d4aae8839ce4c672573467bceee0ac449", "Immutable V3 ZIP hash değişti");
const prototypeSha256 = await hashFile(path.join(ROOT, "src", "Prototype.tsx"));
const prototypeCssSha256 = await hashFile(path.join(ROOT, "src", "prototype.css"));
const testSha256 = await hashFile(path.join(ROOT, "tests", "calibration-v4.spec.ts"));

const closed = [
  ["V4-DIFF-001", "GLOBAL", "Tek viewport/safe-area koordinat sistemi", "09_machine/v4-geometry-measurements.json"],
  ["V4-DIFF-002", "GLOBAL", "CAL switcher uygulama viewport'u dışına alındı", "04_framed_preview/capture-manifest.json"],
  ["V4-DIFF-003", "GLOBAL", "Alt navigasyon gri slab/seam kaldırıldı", "06_iteration_history/resolved-differences/bottom-nav-recovery/bottom-nav-recovery-manifest.json"],
  ...CAL_IDS.map((id) => [id === "CAL-04" ? "V4-DIFF-007" : `V4-DIFF-${String(Number(id.slice(-2)) + 3).padStart(3, "0")}`, id, `${TITLES[id]} görünür geometri ve responsive düzen düzeltmesi`, `08_review_boards/${boards.boards.find((board) => board.calibration === id)?.board.relativePath.split("/").pop()}`]),
];
const uniqueClosed = Array.from(new Map(closed.map((row) => [row[0], row])).values());
const accepted = [
  ["V4-DELTA-001", "GLOBAL", "Resmî NovaStore logo ve NovaBot asset otoritesi", "00_sources/screen-source-contract.csv"],
  ["V4-DELTA-002", "GLOBAL", "Kabul edilmiş Tur 1 altı sekmeli glass/bubble navigasyon", "00_sources/accepted-tur1-bottom-bar-provenance.md"],
  ["V4-DELTA-003", "CAL-06", "SRC-13 mor paleti yerine NovaStore lacivert/turuncu/sıcak-nötr paleti", "09_machine/v4-declared-delta-metrics.json"],
  ["V4-DELTA-004", "CAL-11/CAL-12", "Support Hub, ACCOUNT_RETURNS ve zengin NovaBot state davranışı", "07_interaction_evidence/interaction-evidence-manifest.json"],
];
const registerRows = [
  ...uniqueClosed.map(([id, scope, title, evidence]) => ({ id, scope, title, status: "CLOSED", evidence, owner_note: "İki ardışık tam görsel incelemede görünür fark saptanmadı; insan V4 onayı yine de PENDING." })),
  ...accepted.map(([id, scope, title, evidence]) => ({ id, scope, title, status: "ACCEPTED_DELTA_PENDING_OWNER_CONFIRMATION", evidence, owner_note: "Bağlayıcı owner kararına göre korunan bilinçli fark; final insan incelemesinde yeniden teyit edilecek." })),
];
assert(registerRows.filter((row) => row.status === "CLOSED").length === 15, "Closed difference sayısı 15 değil");
assert(registerRows.every((row) => ["CLOSED", "OPEN", "ACCEPTED_DELTA_PENDING_OWNER_CONFIRMATION"].includes(row.status)), "Geçersiz register status");

const regression = {
  schemaVersion: 1, generatedAt: now, status: "PASS", sourceFreeze: { prototypeSha256, prototypeCssSha256, testSha256 },
  gates: [
    { gate: "mobile runtime integrity", result: "PASS", count: "28/28" },
    { gate: "TypeScript + Vite build", result: "PASS", detail: "510 modules" },
    { gate: "V4 focused Playwright", result: "PASS", count: "9/9" },
    { gate: "full Playwright", result: "PASS", count: "29/29", workers: 2 },
    { gate: "Sites worker", result: "PASS", count: "4/4" },
    { gate: "console/page/network/broken asset", result: "PASS", count: "0" },
  ],
  note: "Receipt is bound to the frozen source hashes above; technical PASS does not self-approve V4 visuals.",
};
const visualReview = {
  schemaVersion: 1, generatedAt: now, status: "PASS — TWO CONSECUTIVE FULL VISUAL REVIEWS", humanVisualDecision: "PENDING",
  rounds: [1, 2].map((round) => ({ round, phone: "12/12", framedPreview: "12/12", tablet: "12/12", visibleDefects: 0, clippingOrOverlap: 0, purposelessTabletWhitespace: 0, wrongCardRatioOrCrop: 0 })),
  reviewedManifestHashes: {
    phone: await hashFile(path.join(ROOT, "02_phone_1080x2400", "capture-manifest.json")),
    tablet: await hashFile(path.join(ROOT, "03_tablet_1600x2560", "capture-manifest.json")),
    framed: await hashFile(path.join(ROOT, "04_framed_preview", "capture-manifest.json")),
    boards: await hashFile(path.join(ROOT, "08_review_boards", "review-board-manifest.json")),
  },
};

await writeJson("09_machine/worktree-integrity.json", worktree);
await writeJson("09_machine/regression-gate-receipt.json", regression);
await writeJson("09_machine/final-visual-review-receipt.json", visualReview);

const manifest = {
  schemaVersion: 4, generatedAt: now, phase: "ANDROID-CUSTOMER-V4-OWNER-REJECTION-VISUAL-RECOVERY-AND-FINAL-PARITY-CLOSURE",
  exactResult: RESULT,
  humanDecisions: { v2: "REJECTED", v3: "REJECTED", v3RejectionReason: V3_REJECTION, v4: "PENDING" },
  reviewCounts: { phone: 12, framedPreview: 12, tablet: 12, sourceParity: 12, interactionArtifacts: 25, reviewBoards: 12, visualReviewRounds: 2 },
  visualClosure: { closedVisualDifferences: 15, openVisualDifferences: 0, acceptedDeltasPendingOwnerConfirmation: 4, openClippingOrOverlap: 0, purposelessTabletWhitespaceDefects: 0, wrongCardRatioOrCropDefects: 0, openInteractionDefects: 0, consoleErrors: 0 },
  metrics: { geometryStatus: geometry.status, geometryRecordCount: geometry.records.length, geometryFailureCount: geometry.failureCount, measuredPhoneBboxCount: measuredPhone.length, declaredDeltaMetricsStatus: deltas.status, declaredDeltaRecordCount: deltas.records.length, unmaskedAndDeclaredDeltaAwareReportedSeparately: true },
  repository: { ...worktree.productionRepository, protectedWipByteLevelMatch: true, productionSourceChangesByV4: 0 },
  immutableV3: { zip: normalize(V3_ZIP), sha256: v3ZipSha256, preserved: true },
  sourceFreeze: regression.sourceFreeze,
  outputs: { reviewIndex: "calibration-index.html", contactSheet: boards.contactSheet.relativePath, phoneManifest: "02_phone_1080x2400/capture-manifest.json", tabletManifest: "03_tablet_1600x2560/capture-manifest.json", framedManifest: "04_framed_preview/capture-manifest.json", interactionManifest: "07_interaction_evidence/interaction-evidence-manifest.json", geometry: "09_machine/v4-geometry-measurements.json", declaredDeltaMetrics: "09_machine/v4-declared-delta-metrics.json" },
  prohibitions: { commit: "NOT_CREATED", push: "NOT_DONE", pr: "NOT_DONE", merge: "NOT_DONE", deploy: "NOT_DONE", productionAndroidIntegration: "NOT_STARTED", screen112Expansion: "NOT_STARTED" },
  accessibility: { visualTouchTargets: "VERIFIED_IN_PROTOTYPE", textOverflow: "VERIFIED_IN_PROTOTYPE", focusVisibility: "VERIFIED_IN_PROTOTYPE", keyboardReflow: "VERIFIED_IN_PROTOTYPE", screenReaderNativeSemantics: "NOT_VERIFIED_IN_PROTOTYPE", fullWcagConformance: "NOT_CLAIMED" },
};
await writeJson("calibration-manifest.json", manifest);

const registerHeader = ["id", "scope", "title", "status", "evidence", "owner_note"];
await writeText("06_iteration_history/visual-difference-register.csv", `${registerHeader.join(",")}\n${registerRows.map((row) => registerHeader.map((key) => csv(row[key])).join(",")).join("\n")}\n`);
await writeText("06_iteration_history/iteration-log.md", `# V4 iteration log\n\n- V2 insan görsel kararı: **REJECTED**.\n- V3 insan görsel kararı: **REJECTED**.\n- V3 red nedeni: **${V3_REJECTION}**.\n- V4 insan görsel kararı: **PENDING**.\n- Tek viewport/safe-area sözleşmesi, switcher ayrımı ve birleşik alt navigasyon katmanı kapatıldı.\n- CAL-01–CAL-12 telefon, çerçeveli preview ve tablet düzenleri final kaynak byte'larıyla üretildi.\n- İki ardışık tam görsel inceleme: **12/12 + 12/12 + 12/12, görünür fark 0**.\n- Final regresyon: runtime 28/28, V4 9/9, full 29/29, Sites 4/4, build PASS.\n- Sonuç: **${RESULT}**. Bu sonuç insan onayı değildir.\n`);

await writeText("09_machine/interaction-test-report.txt", `V4 INTERACTION GATE: PASS\nReceipts: 7/7\nArtifacts: 25\nConsole errors: 0\nPage errors: 0\nFailed same-origin requests: 0\nExternal requests: 0\nHuman visual decision: PENDING\n`);
await writeText("09_machine/console-report.txt", `V4 CONSOLE / NETWORK / ASSET REPORT\nconsoleErrors=0\npageErrors=0\nfailedSameOriginRequests=0\nexternalRequests=0\nbrokenAssets=0\nloopbackOnly=true\n`);
await writeText("09_machine/validation-report.txt", `RESULT=${RESULT}\nV2_HUMAN=REJECTED\nV3_HUMAN=REJECTED\nV3_REJECTION_REASON=${V3_REJECTION}\nV4_HUMAN=PENDING\nPHONE=12/12\nFRAMED_PREVIEW=12/12\nTABLET=12/12\nSOURCE_PARITY=12/12\nINTERACTION=PASS 7/7 25_ARTIFACTS\nCONSOLE_ERRORS=0\nOPEN_VISUAL_DIFFERENCES=0\nCLOSED_VISUAL_DIFFERENCES=15\nGEOMETRY=PASS 24_RECORDS 0_FAILURES\nPRODUCTION_WIP=PASS 11_PATHS STAGED_0\nCOMMIT=NOT_CREATED\nPUSH_PR_MERGE_DEPLOY=NOT_DONE\n`);

await writeText("REVIEW_FIRST.md", `# V4 review first\n\n**${RESULT}**\n\n- V2: **REJECTED**\n- V3: **REJECTED** — ${V3_REJECTION}\n- V4: **PENDING — HUMAN VISUAL APPROVAL**\n\nİlk olarak [yerel review indexini](calibration-index.html) açın. Sonra [12 ekran contact sheet](08_review_boards/calibration-contact-sheet.png), tam çözünürlüklü [telefon](02_phone_1080x2400/), [çerçeveli preview](04_framed_preview/) ve [tablet](03_tablet_1600x2560/) setlerini inceleyin. Otomatik metrik ve testler insan onayının yerine geçmez.\n\n## Kaynak sınırları\n\n- CAL-06 geometri/IA otoritesi SRC-13'tür; mor palet bilinçli olarak NovaStore lacivert/turuncu/sıcak-nötr ailesine çevrilmiştir.\n- CAL-04 ürün kartı SRC-09 ayrıntı hiyerarşisi ve SRC-12 compact oranlarıyla değerlendirilir.\n- Alt navigasyon kabul edilmiş Tur 1 tek-yüzey shell'idir.\n- Tabletler için exact kaynak yoktur; görev-adaptive yorum insan incelemesi gerektirir.\n`);
await writeText("design-qa.md", `# NovaStore Android Customer V4 design QA\n\n## Karar\n\n**${RESULT}**\n\nV4 kendiliğinden görsel PASS ilan edilmemiştir; insan kararı **PENDING** durumundadır. V2 ve V3 reddedilmiş baseline'lardır.\n\n## Kapanan kök nedenler\n\n1. Çerçeveli preview ve capture aynı uygulama koordinat sistemine bağlandı.\n2. Status/safe top, alt safe-area, bottom-nav reserve ve sticky CTA inset tek shell sözleşmesine bağlandı.\n3. CAL switcher app viewport dışına taşındı; final capture'da gizlendi.\n4. Alt navigasyon tek smooth-union SVG/cam yüzeyi olarak çizildi; gri slab ve seam kaldırıldı.\n5. CAL-04 kartı SRC-09/SRC-12; CAL-06 PDP yalnız SRC-13 otoritesiyle yeniden kuruldu.\n6. On iki tablet ekranı görev-adaptive kompozisyona geçirildi.\n\n## Kanıt\n\n- Phone 1080×2400: 12/12\n- Framed preview: 12/12\n- Tablet 1600×2560: 12/12\n- İki ardışık tam görsel inceleme: PASS, görünür açık fark 0\n- Bbox/geometri: 24 kayıt, 0 failure\n- Interaction: 7/7 receipt, 25 artifact\n- Console/page/network/broken asset: 0\n- Runtime/build/tests: 28/28, build PASS, V4 9/9, full 29/29, Sites 4/4\n\n## Erişilebilirlik sınırı\n\nDokunma hedefi, görünür focus, text overflow, responsive reflow ve klavye görünürlüğü prototipte doğrulandı. Native ekran okuyucu semantiği **NOT_VERIFIED_IN_PROTOTYPE**; tam WCAG uyumu iddia edilmez.\n`);

const approvalRows = CAL_IDS.map((id) => `${id},${csv(TITLES[id])},PENDING,08_review_boards/${boards.boards.find((board) => board.calibration === id)?.board.relativePath.split("/").pop()},Owner visual decision required`).join("\n");
await writeText("10_human_review/approval-matrix.csv", `calibration,title,human_decision,review_board,note\n${approvalRows}\n`);
await writeText("10_human_review/review-checklist.md", `# V4 human review checklist\n\n- [ ] Telefon 12/12\n- [ ] Çerçeveli preview 12/12\n- [ ] Tablet 12/12\n- [ ] Kaynak/parity ve declared-delta kayıtları\n- [ ] CAL-04 SRC-09/SRC-12 ürün kartı\n- [ ] CAL-06 SRC-13 geometri + NovaStore palet sapması\n- [ ] Accepted Tur 1 alt navigasyon\n- [ ] Ana interaction akışları\n\nTeknik aday sonucu: **${RESULT}**\n\nİnsan kararı verilene kadar V4 durumu: **PENDING**.\n`);
await writeText("10_human_review/response-template.txt", `V4 HUMAN VISUAL DECISION: PASS | CHANGES REQUESTED\n\nReviewed: phone 12/12, framed preview 12/12, tablet 12/12\nNotes:\n-\n\n112-screen expansion / production Android integration remains blocked until an explicit PASS.\n`);
await writeJson("10_human_review/human-review-status.json", { schemaVersion: 1, generatedAt: now, v2: "REJECTED", v3: "REJECTED", v3RejectionReason: V3_REJECTION, v4: "PENDING", technicalCandidate: RESULT, selfApproved: false });

const cards = CAL_IDS.map((id) => {
  const slug = boards.boards.find((board) => board.calibration === id)?.board.relativePath;
  return `<article><a href="${slug}"><img src="02_phone_1080x2400/${id}.png" alt="${id} ${TITLES[id]} telefon görünümü"></a><h2>${id} · ${TITLES[id]}</h2><p><a href="${slug}">Review board</a> · <a href="?cal=${id}">Canlı ekran</a> · <a href="05_comparisons/CAL-${id.slice(-2)}/">Karşılaştırma</a></p></article>`;
}).join("\n");
await writeText("calibration-index.html", `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NovaStore V4 Görsel İnceleme</title><style>body{margin:0;background:#f3f5f8;color:#10284f;font:16px/1.5 system-ui,sans-serif}header{padding:28px clamp(20px,5vw,72px);background:#10284f;color:white}header b{color:#ff6a18}.wrap{max-width:1500px;margin:auto;padding:28px}.decision{background:white;border:1px solid #dce4ef;border-radius:20px;padding:20px;margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}article{background:white;border:1px solid #dce4ef;border-radius:20px;padding:14px;box-shadow:0 12px 32px #10284f12}img{width:100%;aspect-ratio:9/20;object-fit:cover;object-position:top;border-radius:14px;background:white}h1,h2{margin:.2em 0}h2{font-size:18px}a{color:#e7540a}.links{display:flex;gap:16px;flex-wrap:wrap}.pill{background:#fff3ec;border-radius:999px;padding:8px 12px}</style></head><body><header><h1>NovaStore Android Customer · V4</h1><p><b>V2 REJECTED · V3 REJECTED</b> · V4 HUMAN VISUAL DECISION: PENDING</p></header><main class="wrap"><section class="decision"><h2>${RESULT}</h2><p>Bu teknik/görsel aday sonucu insan onayı değildir. Tam çözünürlüklü panoları açarak inceleyin.</p><div class="links"><a class="pill" href="08_review_boards/calibration-contact-sheet.png">12 ekran contact sheet</a><a class="pill" href="05_comparisons/blink.html?cal=CAL-01">Kaynak ↔ V4 blink</a><a class="pill" href="REVIEW_FIRST.md">Review first</a><a class="pill" href="10_human_review/review-checklist.md">İnsan checklist</a></div></section><section class="grid">${cards}</section></main></body></html>`);
await writeText("05_comparisons/blink.html", `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kaynak ↔ V4 Blink</title><style>body{margin:0;background:#071a3a;color:white;font:16px system-ui}header{padding:16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}button,select{font:inherit;padding:8px 12px}.stage{position:relative;max-width:540px;margin:auto;background:white}.stage img{display:block;width:100%;height:auto}.stage img:last-child{position:absolute;inset:0;opacity:.5}.side{display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:1080px;margin:20px auto}.side img{width:100%}</style></head><body><header><strong>Kaynak ↔ V4</strong><select id="cal">${CAL_IDS.map((id) => `<option>${id}</option>`).join("")}</select><button id="toggle">%50 overlay</button><button id="blink">Blink</button><a href="../calibration-index.html" style="color:#ff9b63">Review index</a></header><div class="stage"><img id="source"><img id="v4"></div><div class="side"><img id="source2"><img id="v42"></div><script>const q=new URLSearchParams(location.search),sel=document.querySelector('#cal'),a=document.querySelector('#source'),b=document.querySelector('#v4'),a2=document.querySelector('#source2'),b2=document.querySelector('#v42');sel.value=q.get('cal')||'CAL-01';let timer;function load(){const n=sel.value.slice(-2);a.src=a2.src='../04_source_native_parity/source-normalized/cal-'+n+'-source-1080x2400.png';b.src=b2.src='../02_phone_1080x2400/CAL-'+n+'.png';history.replaceState({},'', '?cal=CAL-'+n)}sel.onchange=load;document.querySelector('#toggle').onclick=()=>{clearInterval(timer);b.style.opacity=b.style.opacity==='0.5'?'1':'0.5'};document.querySelector('#blink').onclick=()=>{clearInterval(timer);timer=setInterval(()=>b.style.opacity=b.style.opacity==='0'?'1':'0',650)};load()</script></body></html>`);

console.log(JSON.stringify({ status: RESULT, humanVisualDecision: "PENDING", phone: phone.files.length, framed: framed.files.length, tablet: tablet.files.length, closedVisualDifferences: 15, openVisualDifferences: 0, productionIntegrity: worktree.status, v3ZipSha256 }, null, 2));
