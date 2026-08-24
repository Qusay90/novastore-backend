#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bridgePath = resolve(
  root,
  "node_modules/@capacitor/android/capacitor/src/main/java/com/getcapacitor/Bridge.java",
);
const originalHash = "91bb58293057bee4dd3d10104295b0e01aba2afd4009fbe750a003e9ff4900a7";
const patchedHash = "ecc921954cf107693d6c0b1cf2438d20d48799c2913d306cb7eee16d823bb012";
const originalBlock = [
  "        this.registerPlugin(com.getcapacitor.plugin.CapacitorCookies.class);",
  "        this.registerPlugin(com.getcapacitor.plugin.WebView.class);",
  "        this.registerPlugin(com.getcapacitor.plugin.CapacitorHttp.class);",
  "        this.registerPlugin(com.getcapacitor.plugin.SystemBars.class);",
  "",
].join("\n");
const patchedBlock = [
  "        // NovaStore preview intentionally exposes no mutable Capacitor core plugins.",
  "        // Only explicit application plugins from initialPlugins are registered below.",
  "",
].join("\n");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const source = readFileSync(bridgePath);
const currentHash = sha256(source);

if (currentHash === patchedHash) {
  console.log("Capacitor bridge patch already present and hash-verified.");
  process.exit(0);
}

if (currentHash !== originalHash) {
  throw new Error(
    `Refusing to patch unknown @capacitor/android Bridge.java (${currentHash}). Expected ${originalHash}.`,
  );
}

const text = source.toString("utf8");
const occurrences = text.split(originalBlock).length - 1;
if (occurrences !== 1) {
  throw new Error(`Expected one mutable-core registration block, found ${occurrences}.`);
}

const patched = text.replace(originalBlock, patchedBlock);
if (sha256(patched) !== patchedHash) {
  throw new Error("Patched Capacitor bridge did not match the recorded output hash.");
}

writeFileSync(bridgePath, patched, "utf8");
console.log("Capacitor bridge narrowed to explicit application plugins (hash-verified).");
