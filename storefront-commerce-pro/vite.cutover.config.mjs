import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const rawOutputRoot = process.env.NOVASTORE_CUTOVER_OUT_DIR;

if (!rawOutputRoot) {
  throw new Error("NOVASTORE_CUTOVER_OUT_DIR yalnız finalize-cutover tarafından ayarlanmalıdır.");
}

const outputRoot = path.resolve(rawOutputRoot);
const systemTempRoot = path.resolve(os.tmpdir());
const relativeToTemp = path.relative(systemTempRoot, outputRoot);
if (
  !relativeToTemp
  || relativeToTemp.startsWith("..")
  || path.isAbsolute(relativeToTemp)
  || !path.basename(outputRoot).startsWith("novastore-commerce-pro-cutover-")
) {
  throw new Error("Cutover build çıktısı yalnız doğrulanmış OS temp dizinine yazılabilir.");
}

const developmentOrigin = "http://localhost";
const reactErrorOrigin = "https://react.dev/errors/";

function productionOriginGuard() {
  let localFallbackCount = 0;
  let reactErrorLinkCount = 0;

  return {
    name: "novastore-production-origin-guard",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replaceAll("\\", "/");
      let transformed = code;

      if (normalizedId.includes("/storefront-commerce-pro/src/")) {
        const count = transformed.split(developmentOrigin).length - 1;
        if (count > 0) {
          localFallbackCount += count;
          transformed = transformed
            .replaceAll(`"${developmentOrigin}"`, "globalThis.location.origin")
            .replaceAll(`'${developmentOrigin}'`, "globalThis.location.origin");
        }
      }

      if (normalizedId.includes("/node_modules/react-dom/") && transformed.includes(reactErrorOrigin)) {
        reactErrorLinkCount += transformed.split(reactErrorOrigin).length - 1;
        transformed = transformed.replaceAll(reactErrorOrigin, "/commerce-pro/runtime-error/");
      }

      return transformed === code ? null : { code: transformed, map: null };
    },
    buildEnd(error) {
      if (error) return;
      if (localFallbackCount !== 7) {
        throw new Error(`Production origin guard 7 yerine ${localFallbackCount} local fallback dönüştürdü.`);
      }
      if (reactErrorLinkCount < 1) {
        throw new Error("React production error origin guard beklenen kaynağı bulamadı.");
      }
    },
  };
}

export default defineConfig({
  root: projectRoot,
  base: "/commerce-pro/",
  build: {
    assetsInlineLimit: 30_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    manifest: false,
    minify: "esbuild",
    modulePreload: false,
    outDir: outputRoot,
    reportCompressedSize: false,
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      external: ["/shared-state-sync.js", "/favorites-sync.js"],
      input: path.join(projectRoot, "cutover.html"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  plugins: [productionOriginGuard(), react(), viteSingleFile()],
});
