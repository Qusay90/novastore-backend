import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  build: {
    commonjsOptions: { include: [/node_modules/, /shared/] },
    assetsInlineLimit: 30_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: "../artifacts/commerce-pro-qa/fixture-preview",
    rollupOptions: {
      input: "fixture-integrated.html",
    },
  },
  plugins: [react(), viteSingleFile()],
});
