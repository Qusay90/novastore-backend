#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSourceFingerprint, fontNames, imageNames } from "./source-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modeFlag = process.argv.indexOf("--mode");
const modeArgument = modeFlag >= 0 ? process.argv[modeFlag + 1] : "preview";

if (!["preview", "integrated"].includes(modeArgument)) {
  throw new Error("`--mode` yalnızca preview veya integrated olabilir.");
}

const integrated = modeArgument === "integrated";
const dist = path.join(root, integrated ? "dist-integrated" : "dist");
const assets = path.join(dist, "assets");
const outputFlag = process.argv.indexOf("--output");
const outputArgument = outputFlag >= 0 ? process.argv[outputFlag + 1] : "standalone/index.html";

if (!outputArgument || outputArgument.startsWith("--")) {
  throw new Error("`--output` için geçerli bir dosya yolu verilmelidir.");
}

const output = path.resolve(root, outputArgument);
const outputDirectory = path.dirname(output);

const files = (await readdir(assets)).sort();
const entryName = integrated ? "integrated" : "index";
const jsFile = files.find((name) => new RegExp(`^${entryName}-.+\\.js$`).test(name));
const cssFile = files.find((name) => new RegExp(`^${entryName}-.+\\.css$`).test(name));

if (!jsFile || !cssFile) {
  throw new Error("Önce `npm run build` ile Vite çıktısı oluşturulmalıdır.");
}

const encode = async (file, mime) => {
  const body = await readFile(file);
  return `data:${mime};base64,${body.toString("base64")}`;
};

let [javascript, css, icons] = await Promise.all([
  readFile(path.join(assets, jsFile), "utf8"),
  readFile(path.join(assets, cssFile), "utf8"),
  readFile(path.join(root, "public", "icons.js"), "utf8"),
]);

for (const name of imageNames) {
  const dataUrl = await encode(path.join(assets, name), "image/webp");
  javascript = javascript.replaceAll(`/assets/${name}`, dataUrl);
}

for (const name of fontNames) {
  const dataUrl = await encode(path.join(assets, "fonts", name), "font/woff2");
  css = css.replaceAll(`/assets/fonts/${name}`, dataUrl);
}

const unresolved = [
  ...(javascript.match(/\/assets\/[A-Za-z0-9_./-]+/g) || []),
  ...(css.match(/\/assets\/[A-Za-z0-9_./-]+/g) || []),
];

if (unresolved.length > 0) {
  throw new Error(`Standalone içinde çözümlenmemiş asset kaldı: ${[...new Set(unresolved)].join(", ")}`);
}

const [{ value: sourceFingerprint }, builtFingerprint] = await Promise.all([
  createSourceFingerprint(root, { mode: modeArgument }),
  readFile(path.join(dist, ".source-fingerprint"), "utf8").catch(() => ""),
]);

if (builtFingerprint.trim() !== sourceFingerprint) {
  throw new Error("Vite çıktısı güncel kaynak parmak iziyle eşleşmiyor. Önce `npm run build` çalıştırılmalıdır.");
}

const safeIcons = icons.replaceAll("</script", "<\\/script");
const safeJavascript = javascript.replaceAll("</script", "<\\/script");
const safeCss = css.replaceAll("</style", "<\\/style");
const favicon = await encode(path.join(root, "public", "favicon-96x96.png"), "image/png");
const connectPolicy = integrated ? "'self'" : "'none'";
const contentSecurityPolicy = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  `connect-src ${connectPolicy}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const html = `<!doctype html>
<html lang="tr" data-admin-mode="${modeArgument}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#031d39" />
    <meta name="robots" content="noindex,nofollow,noarchive" />
    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy}" />
    <meta name="description" content="${integrated ? "NovaStore tek satıcılı entegre yönetim konsolu" : "NovaStore çok satıcılı yönetim konsolu etkileşimli önizlemesi"}" />
    <link rel="icon" type="image/png" href="${favicon}" />
    <meta name="novastore-source-fingerprint" content="${sourceFingerprint}" />
    <title>NovaStore Admin Commerce Pro — ${integrated ? "Entegre Veri" : "Önizleme"}</title>
    <style>${safeCss}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${safeIcons}</script>
    <script>${safeJavascript}</script>
  </body>
</html>
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(output, html, "utf8");

process.stdout.write(`${output}\n${Buffer.byteLength(html)} bytes\n`);
