import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERIFY = process.argv.includes("--verify-only");
const MANIFEST = path.join(ROOT, "checksums.sha256");
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "test-results", "playwright-report", "_work", "__pycache__"]);
const EXCLUDED_FILES = new Set([
  "checksums.sha256",
  "scripts/finalize-package-metadata.mjs",
  "scripts/finalize-review-evidence.py",
  "scripts/verify-review-index.mjs",
  "scripts/verify-package-structure.mjs",
  "scripts/build-checksums.mjs",
]);
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const normalize = (value) => value.split(path.sep).join("/");
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const excluded = (relative) => {
  const normalized = normalize(relative);
  const parts = normalized.split("/");
  if (parts.some((part) => EXCLUDED_DIRS.has(part))) return true;
  if (EXCLUDED_FILES.has(normalized)) return true;
  if (/^04_source_native_parity\/product-card-authority\/.*v3.*$/i.test(normalized)) return true;
  return false;
};

async function walk(directory, prefix = "") {
  const output = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    const relative = prefix ? path.join(prefix, entry.name) : entry.name;
    if (excluded(relative)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute, relative));
    else if (entry.isFile()) output.push(relative);
  }
  return output;
}

async function actualFiles() { return (await walk(ROOT)).map(normalize).sort(); }

if (VERIFY) {
  const lines = (await readFile(MANIFEST, "utf8")).trim().split(/\r?\n/).filter(Boolean);
  const expected = new Map(lines.map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    assert(match, `Malformed checksum line: ${line}`);
    return [match[2], match[1]];
  }));
  const actual = await actualFiles();
  assert(expected.size === actual.length, `Checksum allowlist count mismatch expected=${expected.size} actual=${actual.length}`);
  assert(actual.every((relative) => expected.has(relative)), "Checksum allowlist path mismatch");
  let bytes = 0;
  for (const relative of actual) {
    const content = await readFile(path.join(ROOT, ...relative.split("/")));
    bytes += content.length;
    assert(sha256(content) === expected.get(relative), `Checksum mismatch: ${relative}`);
  }
  console.log(JSON.stringify({ status: "PASS", mode: "VERIFY_ONLY", files: actual.length, bytes, checksumSha256: sha256(await readFile(MANIFEST)) }, null, 2));
} else {
  const receiptPath = path.join(ROOT, "09_machine", "package-structure-receipt.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  receipt.checksumContract = {
    status: "BOUND_BEFORE_HASHING",
    excludedDirectories: [...EXCLUDED_DIRS].sort(),
    excludedFiles: [...EXCLUDED_FILES].sort(),
    excludedPatterns: ["04_source_native_parity/product-card-authority/*v3*"],
    selfExcluded: "checksums.sha256",
  };
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  const files = await actualFiles();
  const lines = [];
  let bytes = 0;
  for (const relative of files) {
    const content = await readFile(path.join(ROOT, ...relative.split("/")));
    bytes += content.length;
    lines.push(`${sha256(content)}  ${relative}`);
  }
  await writeFile(MANIFEST, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", mode: "CREATE", files: files.length, bytes, checksumSha256: sha256(await readFile(MANIFEST)) }, null, 2));
}
