import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSourceFingerprint } from "./scripts/source-fingerprint.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));

let buildSourceFingerprint = "";

const createSourceFingerprintPlugin = (outputDirectory, mode) => ({
  name: "novastore-source-fingerprint",
  async buildStart() {
    ({ value: buildSourceFingerprint } = await createSourceFingerprint(root, { mode }));
  },
  async writeBundle() {
    if (!buildSourceFingerprint) throw new Error("Build kaynak parmak izi oluşturulamadı.");
    await writeFile(path.join(root, outputDirectory, ".source-fingerprint"), buildSourceFingerprint, "utf8");
  },
});

export default defineConfig(({ mode }) => {
  const integrated = mode === "integrated";
  const outputDirectory = integrated ? "dist-integrated" : "dist";

  return {
    build: {
      outDir: outputDirectory,
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(root, integrated ? "integrated.html" : "index.html"),
      },
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
        clientFiles: [integrated ? "./src/main-integrated.jsx" : "./src/main.jsx"],
      },
    },
    plugins: [react(), createSourceFingerprintPlugin(outputDirectory, integrated ? "integrated" : "preview")],
  };
});
