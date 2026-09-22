import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  define: {
    __NOVASTORE_LOCAL_REVIEW_RUNTIME__: "true",
  },
  build: {
    assetsInlineLimit: 30_000_000,
    cssCodeSplit: false,
    commonjsOptions: { include: [/node_modules/, /shared/] },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), viteSingleFile()],
});
