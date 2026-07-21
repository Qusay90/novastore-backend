import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  build: {
    assetsInlineLimit: 30_000_000,
    cssCodeSplit: false,
    emptyOutDir: true,
    outDir: "../frontend/commerce-pro-integration-preview",
    rollupOptions: {
      external: ["/shared-state-sync.js", "/favorites-sync.js"],
      input: "integrated.html",
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main-integrated.jsx"],
    },
  },
  plugins: [react(), viteSingleFile()],
});
