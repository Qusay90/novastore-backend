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
  throw new Error("V4.1 eski V4 PASS receipt zinciriyle doğrulanamaz; insan görsel kararı PENDING.");
}
const PRODUCTION = path.join(WORKSPACE, "android-customer-theme-integration");
const V3_ZIP = path.join(WORKSPACE, "android-customer-visual-calibration-v3.zip");
const EXPECTED_RESULT = "PASS — V4 VISUAL RECOVERY CANDIDATE READY FOR HUMAN APPROVAL";
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const git = (args) => execFileSync("git", ["-C", PRODUCTION, ...args], { encoding: "utf8" }).replace(/\r\n/g, "\n");

const required = [
  "calibration-manifest.json", "REVIEW_FIRST.md", "design-qa.md", "calibration-index.html",
  "02_phone_1080x2400/capture-manifest.json", "03_tablet_1600x2560/capture-manifest.json", "04_framed_preview/capture-manifest.json",
  "04_source_native_parity/visual-evidence-manifest.json", "04_source_native_parity/product-card-authority/product-card-authority-manifest.json",
  "06_iteration_history/visual-difference-register.csv", "06_iteration_history/iteration-log.md",
  "07_interaction_evidence/interaction-evidence-manifest.json", "08_review_boards/review-board-manifest.json", "08_review_boards/calibration-contact-sheet.png",
  "09_machine/v4-geometry-measurements.json", "09_machine/v4-declared-delta-metrics.json", "09_machine/worktree-integrity.json",
  "09_machine/regression-gate-receipt.json", "09_machine/final-visual-review-receipt.json", "09_machine/validation-report.txt",
  "10_human_review/approval-matrix.csv", "10_human_review/review-checklist.md", "10_human_review/response-template.txt", "10_human_review/human-review-status.json",
];
const missing = required.filter((relative) => !existsSync(path.join(ROOT, relative)));
assert(missing.length === 0, `Zorunlu V4 dosyaları eksik: ${missing.join(", ")}`);

const manifest = await readJson("calibration-manifest.json");
const phone = await readJson("02_phone_1080x2400/capture-manifest.json");
const tablet = await readJson("03_tablet_1600x2560/capture-manifest.json");
const framed = await readJson("04_framed_preview/capture-manifest.json");
const parity = await readJson("04_source_native_parity/visual-evidence-manifest.json");
const interaction = await readJson("07_interaction_evidence/interaction-evidence-manifest.json");
const boards = await readJson("08_review_boards/review-board-manifest.json");
const geometry = await readJson("09_machine/v4-geometry-measurements.json");
const deltas = await readJson("09_machine/v4-declared-delta-metrics.json");
const worktree = await readJson("09_machine/worktree-integrity.json");
const regression = await readJson("09_machine/regression-gate-receipt.json");
const visualReview = await readJson("09_machine/final-visual-review-receipt.json");
const human = await readJson("10_human_review/human-review-status.json");

assert(manifest.exactResult === EXPECTED_RESULT, "Kanonik V4 exact result yanlış");
assert(manifest.humanDecisions.v2 === "REJECTED" && manifest.humanDecisions.v3 === "REJECTED" && manifest.humanDecisions.v4 === "PENDING", "İnsan karar zinciri yanlış");
assert(manifest.visualClosure.closedVisualDifferences === 15 && manifest.visualClosure.openVisualDifferences === 0, "Görsel kapanış sayıları yanlış");
assert(phone.files.length === 12 && tablet.files.length === 12 && framed.files.length === 12, "Capture matrisi 12/12/12 değil");
assert(phone.blockedExternalRequestCount === 0 && tablet.blockedExternalRequestCount === 0 && framed.blockedExternalRequestCount === 0, "Capture dış ağ sayacı sıfır değil");
assert(parity.completedCount === 12 && parity.skippedCount === 0, "Parity 12/12 değil");
assert(interaction.status === "PASS" && interaction.artifacts.length === 25 && Object.values(interaction.diagnostics).every((items) => items.length === 0), "Interaction/diagnostics kapısı başarısız");
assert(boards.boardCount === 12 && boards.boards.length === 12, "Review boards 12/12 değil");
assert(geometry.status === "PASS" && geometry.failureCount === 0 && geometry.records.length === 24 && geometry.records.every((record) => record.bottomReachPass), "Geometri/bottom-reach kapısı başarısız");
assert(deltas.records.length === 12 && deltas.status.startsWith("PASS"), "Declared-delta metriği başarısız");
assert(regression.status === "PASS" && regression.gates.every((gate) => gate.result === "PASS"), "Regresyon receipt PASS değil");
assert(visualReview.rounds.length === 2 && visualReview.rounds.every((round) => round.visibleDefects === 0), "İki ardışık görsel review kapanmadı");
assert(human.v4 === "PENDING" && human.selfApproved === false, "V4 insan kararı yanlışlıkla onaylandı");

const registerText = await readFile(path.join(ROOT, "06_iteration_history/visual-difference-register.csv"), "utf8");
const registerLines = registerText.trim().split(/\r?\n/).slice(1);
const closedCount = registerLines.filter((line) => line.includes(",CLOSED,")).length;
const openCount = registerLines.filter((line) => line.includes(",OPEN,")).length;
const acceptedCount = registerLines.filter((line) => line.includes(",ACCEPTED_DELTA_PENDING_OWNER_CONFIRMATION,")).length;
assert(closedCount === 15 && openCount === 0 && acceptedCount === 4, `Register sayıları yanlış: closed=${closedCount} open=${openCount} accepted=${acceptedCount}`);

const canonicalTextFiles = ["calibration-manifest.json", "REVIEW_FIRST.md", "design-qa.md", "00_sources/README.md", "00_sources/accepted-tur1-bottom-bar-provenance.md", "06_iteration_history/iteration-log.md", "06_iteration_history/visual-difference-register.csv", "09_machine/validation-report.txt", "10_human_review/review-checklist.md", "10_human_review/response-template.txt", "10_human_review/human-review-status.json"];
const stalePatterns = [/V3 HUMAN VISUAL DECISION:\s*PENDING/i, /V3_HUMAN_PENDING/i, /OPEN_BINDING_SOURCE_CORRECTION_PENDING_FINAL_EVIDENCE/i, /bbox_match[^\n]*NOT_MEASURED/i, /yeniden kanıtlanmalıdır/i];
for (const relative of canonicalTextFiles) {
  const text = await readFile(path.join(ROOT, relative), "utf8");
  assert(!text.includes(String.fromCodePoint(0xfffd)), `UTF-8 replacement karakteri: ${relative}`);
  for (const pattern of stalePatterns) assert(!pattern.test(text), `Eski karar/metrik metni: ${relative} / ${pattern}`);
}

const indexText = await readFile(path.join(ROOT, "calibration-index.html"), "utf8");
const links = [...indexText.matchAll(/(?:href|src)="([^"?#]+)(?:[?#][^"]*)?"/g)].map((match) => match[1]).filter((target) => !/^(?:https?:|data:|\/)/.test(target));
const brokenLinks = links.filter((target) => !existsSync(path.resolve(ROOT, target)));
assert(brokenLinks.length === 0, `Review index kırık bağlantıları: ${brokenLinks.join(", ")}`);

const branch = git(["branch", "--show-current"]).trim();
const head = git(["rev-parse", "HEAD"]).trim();
const tree = git(["rev-parse", "HEAD^{tree}"]).trim();
const staged = git(["diff", "--cached", "--name-only"]).trim().split("\n").filter(Boolean);
const statusRaw = `${git(["status", "--short", "--untracked-files=all"]).trimEnd()}\n`;
assert(branch === worktree.productionRepository.branch && head === worktree.productionRepository.head && tree === worktree.productionRepository.tree, "Production Git kimliği değişti");
assert(staged.length === 0 && sha256(Buffer.from(statusRaw, "utf8")) === worktree.productionRepository.normalizedStatusSha256, "Production staged/status bütünlüğü değişti");
for (const entry of worktree.protectedWip) {
  const bytes = await readFile(path.join(PRODUCTION, ...entry.path.split("/")));
  assert(bytes.length === entry.bytes && sha256(bytes) === entry.sha256, `Production WIP byte değişti: ${entry.path}`);
}
assert((await hashFile(V3_ZIP)) === manifest.immutableV3.sha256, "Immutable V3 ZIP değişti");

async function hashFile(absolute) { return sha256(await readFile(absolute)); }
const receipt = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: "PASS — V4 PACKAGE STRUCTURE AND CANONICAL DECISIONS",
  requiredFileCount: required.length,
  missingCount: missing.length,
  captureCounts: { phone: phone.files.length, framed: framed.files.length, tablet: tablet.files.length },
  evidenceCounts: { parity: parity.completedCount, interactionArtifacts: interaction.artifacts.length, reviewBoards: boards.boardCount, geometryRecords: geometry.records.length, declaredDeltaRecords: deltas.records.length },
  register: { closed: closedCount, open: openCount, acceptedDeltaPendingOwnerConfirmation: acceptedCount },
  canonicalDecision: { result: manifest.exactResult, v2: "REJECTED", v3: "REJECTED", v4: "PENDING", selfApproved: false },
  diagnostics: { console: 0, page: 0, failedSameOrigin: 0, external: 0, brokenIndexLinks: brokenLinks.length },
  productionIntegrity: { status: worktree.status, protectedWipPaths: worktree.productionRepository.totalProtectedWipPaths, staged: 0, byteForByteMatch: true },
  checksumContract: "PENDING — build-v4-checksums.mjs will bind the final allowlist before hashing",
};
await mkdir(path.join(ROOT, "09_machine"), { recursive: true });
await writeFile(path.join(ROOT, "09_machine", "package-structure-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
console.log(JSON.stringify(receipt, null, 2));
