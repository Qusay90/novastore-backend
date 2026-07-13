import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSourceFingerprint } from "./scripts/source-fingerprint.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

let buildSourceFingerprint = "";

const sourceFingerprintPlugin = {
  name: "novastore-source-fingerprint",
  async buildStart() {
    ({ value: buildSourceFingerprint } = await createSourceFingerprint(root));
  },
  async writeBundle() {
    if (!buildSourceFingerprint) throw new Error("Build kaynak parmak izi oluşturulamadı.");
    await writeFile(path.join(root, "dist", ".source-fingerprint"), buildSourceFingerprint, "utf8");
  },
};

export default defineConfig({
  build: {
    modulePreload: {
      polyfill: false,
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), sourceFingerprintPlugin],
});
