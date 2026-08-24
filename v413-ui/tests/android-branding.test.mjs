import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const project = join(dirname(fileURLToPath(import.meta.url)), "..");
const res = join(project, "android", "app", "src", "main", "res");
const official = readFileSync(join(project, "public", "calibration-assets", "official", "app_icon_foreground.png"));

const pngSize = (bytes) => ({
  width: bytes.readUInt32BE(16),
  height: bytes.readUInt32BE(20),
});

const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});

test("Android branding is generated from the official NovaStore icon", () => {
  const packagedOfficial = readFileSync(join(res, "drawable-nodpi", "novastore_app_icon.png"));
  assert.deepEqual(packagedOfficial, official);

  const launcherForeground = readFileSync(join(res, "drawable", "novastore_launcher_foreground.xml"), "utf8");
  assert.match(launcherForeground, /android:width="74dp"/);
  assert.match(launcherForeground, /android:height="74dp"/);
  assert.match(launcherForeground, /android:src="@drawable\/novastore_app_icon"/);

  const expectedPixels = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, pixels] of Object.entries(expectedPixels)) {
    for (const name of ["ic_launcher.png", "ic_launcher_round.png"]) {
      const bytes = readFileSync(join(res, `mipmap-${density}`, name));
      assert.deepEqual(pngSize(bytes), { width: pixels, height: pixels });
    }
  }
});

test("Android launcher and splash do not retain Capacitor template resources", () => {
  const files = walk(res).map((path) => relative(res, path).replaceAll("\\", "/"));
  assert.equal(files.some((path) => path.endsWith("/ic_launcher_foreground.png")), false);
  assert.equal(files.includes("drawable-v24/ic_launcher_foreground.xml"), false);
  assert.equal(files.includes("drawable/ic_launcher_background.xml"), false);
  assert.equal(files.some((path) => path.endsWith("/splash.png") || path === "drawable/splash.png"), false);

  const styles = readFileSync(join(res, "values", "styles.xml"), "utf8");
  assert.match(styles, /windowSplashScreenAnimatedIcon">@drawable\/novastore_splash_icon/);
  assert.doesNotMatch(styles, /windowSplashScreenAnimatedIcon">@mipmap\/ic_launcher/);
  for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    const adaptive = readFileSync(join(res, "mipmap-anydpi-v26", name), "utf8");
    assert.match(adaptive, /@drawable\/novastore_launcher_foreground/);
  }
  assert.equal(existsSync(join(res, "drawable-nodpi", "novastore_app_icon.png")), true);

  const nativeShell = readFileSync(join(project, "index-native.html"), "utf8");
  const manifest = readFileSync(join(project, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET" \/>/);
  assert.match(nativeShell, /connect-src 'none'/);
  assert.match(nativeShell, /img-src 'self' data: blob: https:\/\/novastore\.tr https:\/\/www\.novastore\.tr https:\/\/res\.cloudinary\.com http:\/\/10\.0\.2\.2:5000/);
  assert.doesNotMatch(nativeShell, /img-src[^;"]*\*/);
});
