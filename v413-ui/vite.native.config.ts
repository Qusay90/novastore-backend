import { copyFileSync, cpSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import postcss from "postcss";

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(root, "dist/native");
const nativeProfiles = Object.freeze({
  release: Object.freeze({ imageOrigin: "" }),
  debug: Object.freeze({ imageOrigin: "http://10.0.2.2:5000" }),
  uat: Object.freeze({ imageOrigin: "http://127.0.0.1:5000" }),
});
const forbiddenNativeSelectors = [
  ".cal-switcher",
  ".capture-mode",
  ".phone-stage",
  ".phone-scale-box",
  ".phone-device",
  ".phone-bezel",
  ".device-screen",
  ".device-camera",
  ".device-menu",
  ".device-picker",
  ".status-bar",
  ".status-time",
  ".status-indicator",
  ".home-indicator",
  ".android-navigation-bar",
  ".keyboard-dock",
  ".keyboard-asset",
  ".mobile-cursor",
  ".mobile-app-viewport",
  ".flow-",
] as const;
const nativeExtracts = [
  "bestseller-flame-source.png",
  "cat-beauty.png",
  "cat-electronics.png",
  "cat-fashion.png",
  "cat-living.png",
  "cat-market.png",
  "cat-sport.png",
  "home-hero.png",
  "order-headphones.png",
  "product-coffee-clean.png",
  "product-luggage-clean.png",
  "sub-appliance.png",
  "sub-game.png",
  "sub-laptop.png",
  "sub-phone.png",
  "sub-tech.png",
  "sub-tv.png",
  "sub-wearable.png",
] as const;

export default defineConfig(({ mode }) => {
  const profileName = mode === "production" ? "release" : mode;
  const profile = nativeProfiles[profileName as keyof typeof nativeProfiles];
  if (!profile) throw new Error(`Unsupported native build profile: ${mode}`);
  return {
  base: "./",
  publicDir: false,
  define: {
    __NOVASTORE_NATIVE__: true,
  },
  build: {
    outDir: "dist/native",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, "index-native.html"),
    },
  },
  resolve: {
    alias: [
      {
        find: /^\.\/mobile$/,
        replacement: resolve(root, "src/native/mobile/index.ts"),
      },
    ],
  },
  plugins: [
    react(),
    {
      name: "novastore-native-build-profile",
      enforce: "pre",
      transformIndexHtml(html) {
        const placeholder = "__NOVASTORE_NATIVE_IMAGE_ORIGIN__";
        if (html.split(placeholder).length !== 2) {
          throw new Error("Native image-origin placeholder must occur exactly once.");
        }
        return html.replace(
          placeholder,
          profile.imageOrigin ? ` ${profile.imageOrigin}` : "",
        );
      },
    },
    {
      name: "novastore-strip-preview-only-css",
      generateBundle(_options, bundle) {
        for (const outputFile of Object.values(bundle)) {
          if (outputFile.type !== "asset" || !outputFile.fileName.endsWith(".css")) continue;
          const stylesheet = postcss.parse(String(outputFile.source));
          stylesheet.walkRules((rule) => {
            if (forbiddenNativeSelectors.some((selector) => rule.selector.includes(selector))) {
              rule.remove();
            }
          });
          outputFile.source = stylesheet.toString();
        }
      },
    },
    {
      name: "novastore-native-authoritative-assets",
      closeBundle() {
        renameSync(resolve(output, "index-native.html"), resolve(output, "index.html"));
        writeFileSync(
          resolve(output, "native-build-profile.json"),
          `${JSON.stringify({ schemaVersion: 1, profile: profileName })}\n`,
          "utf8",
        );
        const destination = resolve(output, "calibration-assets");
        const source = resolve(root, "public/calibration-assets");
        mkdirSync(resolve(destination, "extracts"), { recursive: true });
        for (const filename of nativeExtracts) {
          copyFileSync(resolve(source, "extracts", filename), resolve(destination, "extracts", filename));
        }
        cpSync(resolve(source, "generated"), resolve(destination, "generated"), { recursive: true });
        cpSync(resolve(source, "official", "fonts"), resolve(destination, "official", "fonts"), { recursive: true });
        cpSync(resolve(source, "official", "nav"), resolve(destination, "official", "nav"), { recursive: true });
        for (const filename of ["app_icon_foreground.png", "support_novastore.png", "troy-logo-white.png"] as const) {
          copyFileSync(resolve(source, "official", filename), resolve(destination, "official", filename));
        }
      },
    },
  ],
  };
});
