import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { request as httpRequest } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");
const server = read("scripts", "serveOfficialRuntimeReview.mjs");
const app = read("storefront-commerce-pro", "src", "IntegratedApp.jsx");
const connected = read("storefront-commerce-pro", "src", "ConnectedCustomerPages.jsx");
const community = read("storefront-commerce-pro", "src", "ProductCommunity.jsx");
const assistant = read("storefront-commerce-pro", "src", "AssistantWidget.jsx");
const icon = read("storefront-commerce-pro", "src", "NovaServiceIcon.jsx");
const css = read("storefront-commerce-pro", "src", "integrated.css");
const searchText = read("storefront-commerce-pro", "src", "searchText.js");
const routes = read("OWNER-MANUAL-REVIEW-ROUTES.md");
const captureEvidence = read("scripts", "captureOfficialRuntimeR5Evidence.mjs");

assert.match(server, /NOVASTORE_OFFICIAL_REVIEW !== "true"/);
assert.match(server, /deploymentMarkers[\s\S]*?"production", "staging", "preview"/);
assert.match(server, /server\.listen\(port, "127\.0\.0\.1"/);
assert.match(server, /isLoopback\(request\.socket\.remoteAddress\)/);
assert.match(server, /randomBytes\(32\)/);
assert.match(server, /30 \* 60 \* 1000/);
assert.match(server, /createCustomerReviewSession\(\)/);
assert.match(server, /customerReviewSessions = new Map\(\)/);
assert.match(server, /customerReviewSessionLimit = 16/);
assert.match(server, /reviewCustomerId = 1_900_000_000/);
assert.match(server, /questionsByProduct: new Map\(\)/);
assert.match(server, /isStructurallyPublicCategory/);
assert.match(server, /isReviewMutationAllowed/);
assert.match(server, /POST \/api\/questions\/ask/);
assert.match(server, /POST \/api\/assistant\/chat/);
assert.doesNotMatch(server, /POST \/api\/payments\/initialize/);
assert.match(server, /const expandReviewItems = \(items\)/);
assert.match(server, /PUT \/api\/shared-state\/cart/);
assert.match(server, /POST \/api\/campaigns\/quote/);
assert.match(server, /unexpected|Yerel inceleme çalışma zamanı salt okunurdur/);
assert.doesNotMatch(server, /postgres|DATABASE_URL|supabase|resend|paytr/i);
assert.match(server, /ownerMediaUrl[\s\S]*?res\.cloudinary\.com/);
assert.doesNotMatch(server, /CLOUDINARY_URL|cloudinary\.v2|from ["']cloudinary["']|require\(["']cloudinary["']\)/i);

assert.match(server, /1001: Object\.freeze\(\[/);
assert.match(server, /numericProductId\(product\.id\) === 1001 \? "\/review-media\/iphone-15-angle\.svg"/);
assert.match(server, /iphone-15-angle\.svg/);
assert.match(server, /iphone-15-detail\.svg/);
assert.match(server, /iphone-15-pair\.svg/);
assert.match(server, /iphone-15-screen\.svg/);
assert.match(server, /numericProductId\(product\.id\) === 1001 \? "apple-iphone-15-128-gb"/);
assert.match(routes, /\/#\/urun\/apple-iphone-15-128-gb`/);
assert.doesNotMatch(routes, /\/#\/urun\/apple-iphone-15-128-gb-siyah/);
assert.match(captureEvidence, /const normalizeLoopbackReviewOrigin = \(value\)/);
assert.match(captureEvidence, /\["127\.0\.0\.1", "localhost"\]\.includes\(candidate\.hostname\)/);
assert.match(captureEvidence, /const localStorefrontArtifactSha256 = sha256\(fs\.readFileSync/);
assert.match(captureEvidence, /meta\.artifactSha256, localStorefrontArtifactSha256/);
assert.match(captureEvidence, /x-novastore-artifact-sha256/);
assert.doesNotMatch(captureEvidence, /const record = \{ fileName, absolutePath/);
assert.doesNotMatch(captureEvidence, /token: `\$\{authSession\.token\.slice/);

assert.match(app, /return createPortal\([\s\S]*?cart-drawer-overlay/);
assert.match(app, /const openCart = useCallback/);
assert.match(app, /const closeCart = useCallback/);
assert.match(app, /onQuantity=\{updateCartQuantity\}/);
assert.match(app, /cart-line__product-link/);
assert.match(app, /const localReviewSurface = window\.location\.protocol === "http:"[\s\S]*?window\.location\.port === "5273"/);
assert.match(connected, /function LocalReviewAuthBoundary/);
assert.match(connected, /href="\/__review\/customer"/);
assert.match(connected, /couponIntentKeyRef/);
assert.match(app, /const cartItems = useMemo\([\s\S]*?\[cart\]/);
assert.doesNotMatch(app, /id="global-search"[\s\S]{0,250}role="combobox"/);
assert.doesNotMatch(app, /id="global-search"[\s\S]{0,350}aria-expanded/);
assert.match(searchText, /function normalizeSearchText\(value\)[\s\S]*?replace\(\/\[Iİı\]\/g, "i"\)/);
assert.match(app, /const needle = normalizeSearchText\(value\)/);
assert.match(app, /const needle = normalizeSearchText\(route\.term\)/);
assert.match(css, /body\s*\{\s*min-width:\s*0;/);
assert.match(community, /state\.phase === "loading"[\s\S]*?id=\{activePanelId\}[\s\S]*?role="tabpanel"[\s\S]*?aria-labelledby=\{activeTabId\}/);
assert.match(community, /state\.phase === "error"[\s\S]*?id=\{activePanelId\}[\s\S]*?role="tabpanel"[\s\S]*?aria-labelledby=\{activeTabId\}/);

for (const kind of ["help", "orders", "delivery", "returns", "payment", "support", "bot"]) {
  assert.match(icon, new RegExp(`${kind}:`));
}
assert.match(app, /<NovaServiceIcon \/>/);
assert.match(app, /<NovaServiceIcon kind="returns" \/>/);
assert.match(connected, /<NovaServiceIcon kind="delivery" \/>/);
assert.match(connected, /<NovaServiceIcon kind="support" \/>/);
assert.match(assistant, /<NovaServiceIcon kind="bot" compact \/>/);
assert.doesNotMatch(icon, /https?:\/\//);

const finalTypography = css.lastIndexOf("R5 review runtime: final semantic type and interaction layer.");
assert.ok(finalTypography > css.length * 0.75, "R5 typography override must remain in the final cascade segment.");
assert.equal(css.slice(finalTypography).includes("@font-face"), false, "No later font source may override the final review layer.");
assert.match(css.slice(finalTypography), /html body[\s\S]*?font-family: Inter[\s\S]*?font-weight: 400/);
assert.match(css.slice(finalTypography), /body :is\(p, label, input, textarea, select, small\)[\s\S]*?font-weight: 400/);
assert.match(css.slice(finalTypography), /body \.connected-form label,[\s\S]*?font-weight: 500/);
assert.match(css.slice(finalTypography), /body \.connected-form input,[\s\S]*?body \.help-grid button > span:not\(\.nova-service-icon\)[\s\S]*?font-weight: 400/);
assert.match(css.slice(finalTypography), /cart-drawer-overlay[\s\S]*?pointer-events: auto/);

for (const route of [
  "/#/hesabim",
  "/#/hesabim/adresler",
  "/#/hesabim/siparisler",
  "/#/hesabim/siparisler/7002",
  "/#/hesabim/kuponlar",
  "/#/hesabim/bildirimler",
  "/#/hesabim/guvenlik",
  "/#/siparis-takibi",
  "/#/iletisim",
  "/#/odeme/teslimat",
]) assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const runNegative = (extraEnv = {}) => spawnSync(process.execPath, [path.join(root, "scripts", "serveOfficialRuntimeReview.mjs")], {
  cwd: root,
  encoding: "utf8",
  timeout: 10_000,
  env: {
    ...process.env,
    NOVASTORE_REVIEW_STOREFRONT_PORT: "5293",
    NOVASTORE_REVIEW_ADMIN_PORT: "5294",
    ...extraEnv,
  },
});

const missingFlag = runNegative({ NOVASTORE_OFFICIAL_REVIEW: "", NODE_ENV: "test", CI: "" });
assert.notEqual(missingFlag.status, 0);
assert.match(`${missingFlag.stdout}${missingFlag.stderr}`, /requires NOVASTORE_OFFICIAL_REVIEW=true/);
const production = runNegative({ NOVASTORE_OFFICIAL_REVIEW: "true", NODE_ENV: "production", CI: "" });
assert.notEqual(production.status, 0);
assert.match(`${production.stdout}${production.stderr}`, /disabled in production, staging, preview and CI/);

const rejectedEvidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "novastore-r5-origin-negative-"));
try {
  for (const rejectedOrigin of ["https://127.0.0.1:5273", "http://review.example:5273", "http://127.0.0.1:5273/unexpected"]) {
    const evidenceDirectory = path.join(rejectedEvidenceRoot, encodeURIComponent(rejectedOrigin));
    const rejectedCapture = spawnSync(process.execPath, [path.join(root, "scripts", "captureOfficialRuntimeR5Evidence.mjs")], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
      env: {
        ...process.env,
        NOVASTORE_REVIEW_STOREFRONT_ORIGIN: rejectedOrigin,
        NOVASTORE_R5_EVIDENCE_DIR: evidenceDirectory,
      },
    });
    assert.notEqual(rejectedCapture.status, 0);
    assert.match(`${rejectedCapture.stdout}${rejectedCapture.stderr}`, /must be an explicit loopback HTTP origin/);
    assert.equal(fs.existsSync(evidenceDirectory), false, "Rejected origins must fail before evidence output is created.");
  }
} finally {
  fs.rmSync(rejectedEvidenceRoot, { recursive: true, force: false });
}

const reviewRequest = ({ path: requestPath, method = "GET", token = "", host = "127.0.0.1:5293", body = "" }) => new Promise((resolve, reject) => {
  const request = httpRequest({ hostname: "127.0.0.1", port: 5293, path: requestPath, method, headers: {
    Host: host,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {}),
  } }, (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, text: Buffer.concat(chunks).toString("utf8") }));
  });
  request.on("error", reject);
  if (body) request.write(body);
  request.end();
});

const positive = spawn(process.execPath, [path.join(root, "scripts", "serveOfficialRuntimeReview.mjs")], {
  cwd: root,
  windowsHide: true,
  env: {
    ...process.env,
    NOVASTORE_OFFICIAL_REVIEW: "true",
    NOVASTORE_REVIEW_STOREFRONT_PORT: "5293",
    NOVASTORE_REVIEW_ADMIN_PORT: "5294",
    NODE_ENV: "test",
    CI: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let positiveOutput = "";
positive.stdout.on("data", (chunk) => { positiveOutput += chunk.toString("utf8"); });
positive.stderr.on("data", (chunk) => { positiveOutput += chunk.toString("utf8"); });

try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for isolated review server.\n${positiveOutput}`)), 10_000);
    const inspect = () => {
      if (positiveOutput.includes("OFFICIAL_ADMIN_URL=")) {
        clearTimeout(timeout);
        resolve();
      }
    };
    positive.stdout.on("data", inspect);
    positive.once("exit", (code) => {
      if (!positiveOutput.includes("OFFICIAL_ADMIN_URL=")) {
        clearTimeout(timeout);
        reject(new Error(`Isolated review server exited ${code}.\n${positiveOutput}`));
      }
    });
  });

  const firstBootstrap = await reviewRequest({ path: "/__review/customer" });
  const secondBootstrap = await reviewRequest({ path: "/__review/customer" });
  const firstToken = firstBootstrap.text.match(/local-review-[A-Za-z0-9_-]+/)?.[0];
  const secondToken = secondBootstrap.text.match(/local-review-[A-Za-z0-9_-]+/)?.[0];
  assert.equal(firstBootstrap.status, 200);
  assert.equal(secondBootstrap.status, 200);
  assert.ok(firstToken && secondToken);
  assert.notEqual(firstToken, secondToken);
  assert.match(firstBootstrap.text, /novastore_review_expires_at/);

  const firstIdentity = await reviewRequest({ path: "/api/users/me", token: firstToken });
  const secondIdentity = await reviewRequest({ path: "/api/users/me", token: secondToken });
  assert.equal(firstIdentity.status, 200);
  assert.equal(secondIdentity.status, 200);
  assert.equal(JSON.parse(firstIdentity.text).user.email, "review.customer@local.invalid");

  const profilePatch = await reviewRequest({ path: "/api/users/me", method: "PATCH", token: firstToken, body: JSON.stringify({ fullName: "Yerel Test Müşterisi", phone: "+90 555 000 00 01" }) });
  assert.equal(profilePatch.status, 200);
  assert.equal(JSON.parse(profilePatch.text).user.fullName, "Yerel Test Müşterisi");
  assert.equal(JSON.parse((await reviewRequest({ path: "/api/users/me", token: secondToken })).text).user.fullName, "Yerel İnceleme Müşterisi");

  const createdAddressResponse = await reviewRequest({ path: "/api/addresses", method: "POST", token: firstToken, body: JSON.stringify({ title: "İş", fullName: "Yerel Test Müşterisi", phone: "05550000001", city: "İstanbul", district: "Beşiktaş", addressLine: "Yerel Sokak 1", isDefault: false }) });
  assert.equal(createdAddressResponse.status, 201);
  const createdAddress = JSON.parse(createdAddressResponse.text);
  assert.equal(createdAddress.id, 2);
  assert.equal(JSON.parse((await reviewRequest({ path: "/api/addresses", token: firstToken })).text).length, 2);
  assert.equal(JSON.parse((await reviewRequest({ path: "/api/addresses", token: secondToken })).text).length, 1);
  assert.equal((await reviewRequest({ path: "/api/addresses/2/default", method: "PATCH", token: firstToken })).status, 200);
  assert.equal((await reviewRequest({ path: "/api/addresses/2", method: "PUT", token: firstToken, body: JSON.stringify({ ...createdAddress, title: "Ofis" }) })).status, 200);
  assert.equal((await reviewRequest({ path: "/api/addresses/2", method: "DELETE", token: firstToken })).status, 200);

  assert.equal((await reviewRequest({ path: "/api/notifications/1/read", method: "PATCH", token: firstToken })).status, 200);
  assert.equal(JSON.parse((await reviewRequest({ path: `/api/notifications/user/${JSON.parse(firstIdentity.text).user.id}`, token: firstToken })).text)[0].is_read, true);
  assert.equal(JSON.parse((await reviewRequest({ path: `/api/notifications/user/${JSON.parse(secondIdentity.text).user.id}`, token: secondToken })).text)[0].is_read, false);

  const questionText = "Bu ürün yerel inceleme sırasında stokta mı?";
  assert.equal((await reviewRequest({ path: "/api/questions/ask", method: "POST", token: firstToken, body: JSON.stringify({ product_id: 1001, question: questionText }) })).status, 200);
  assert.equal(JSON.parse((await reviewRequest({ path: "/api/questions/product/1001", token: firstToken })).text)[0].question, questionText);
  assert.deepEqual(JSON.parse((await reviewRequest({ path: "/api/questions/product/1001", token: secondToken })).text), []);

  const chat = await reviewRequest({ path: "/api/assistant/chat", method: "POST", body: JSON.stringify({ message: "Canlı desteğe bağlanmak istiyorum" }) });
  assert.equal(chat.status, 200);
  assert.equal(JSON.parse(chat.text).pendingAction.type, "live_support");
  assert.equal((await reviewRequest({ path: "/api/assistant/escalate", method: "POST", token: firstToken, body: JSON.stringify({ summary: "Yerel inceleme destek görüşmesi özeti" }) })).status, 200);

  const cartBody = JSON.stringify({ payload: { items: [{ productId: 1001, quantity: 2 }] } });
  assert.equal((await reviewRequest({ path: "/api/shared-state/cart", method: "PUT", token: firstToken, body: cartBody })).status, 200);
  const firstCart = JSON.parse((await reviewRequest({ path: "/api/shared-state/cart", token: firstToken })).text);
  const secondCart = JSON.parse((await reviewRequest({ path: "/api/shared-state/cart", token: secondToken })).text);
  assert.equal(firstCart.payload.items[0].quantity, 2);
  assert.equal(firstCart.payload.items[0].name, "Apple iPhone 15 128 GB");
  assert.equal(firstCart.payload.items[0].price, 51999);
  assert.equal(firstCart.payload.items[0].imageUrl, "/review-media/iphone-15-angle.svg");
  assert.deepEqual(secondCart.payload.items, []);

  const firstHistoryBefore = JSON.parse((await reviewRequest({ path: `/api/messages/history/${JSON.parse(firstIdentity.text).user.id}`, token: firstToken })).text);
  const secondHistoryBefore = JSON.parse((await reviewRequest({ path: `/api/messages/history/${JSON.parse(secondIdentity.text).user.id}`, token: secondToken })).text);
  assert.equal(firstHistoryBefore.length, 2);
  assert.equal(secondHistoryBefore.length, 1);
  const supportMessage = "Birinci yerel oturum destek mesajı";
  const sentMessageResponse = await reviewRequest({ path: "/api/messages/send", method: "POST", token: firstToken, body: JSON.stringify({ message: supportMessage }) });
  assert.equal(sentMessageResponse.status, 200);
  const sentMessage = JSON.parse(sentMessageResponse.text);
  assert.equal(sentMessage.message, supportMessage);
  assert.equal(sentMessage.sender_id, JSON.parse(firstIdentity.text).user.id);
  assert.match(sentMessage.created_at, /^\d{4}-\d{2}-\d{2}T/);
  const firstHistoryAfter = JSON.parse((await reviewRequest({ path: `/api/messages/history/${JSON.parse(firstIdentity.text).user.id}`, token: firstToken })).text);
  const secondHistoryAfter = JSON.parse((await reviewRequest({ path: `/api/messages/history/${JSON.parse(secondIdentity.text).user.id}`, token: secondToken })).text);
  assert.equal(firstHistoryAfter.length, 3);
  assert.equal(firstHistoryAfter.at(-1).message, supportMessage);
  assert.equal(firstHistoryAfter.at(-1).sender_id, JSON.parse(firstIdentity.text).user.id);
  assert.equal(secondHistoryAfter.length, 1);
  assert.equal((await reviewRequest({ path: "/api/messages/send", method: "POST", token: firstToken, body: JSON.stringify({ message: "   " }) })).status, 400);

  const quote = await reviewRequest({ path: "/api/campaigns/quote", method: "POST", body: JSON.stringify({ cartItems: [{ productId: 1001, quantity: 1 }] }) });
  assert.equal(quote.status, 200);
  assert.equal(JSON.parse(quote.text).totals.total, 51999);
  const invalidCoupon = JSON.parse((await reviewRequest({ path: "/api/campaigns/quote", method: "POST", body: JSON.stringify({ cartItems: [{ productId: 1001, quantity: 1 }], couponCode: "BOGUS" }) })).text);
  assert.equal(invalidCoupon.coupon.applied, false);
  assert.equal(invalidCoupon.coupon.reason, "Kupon kodu geçerli değil.");
  assert.equal((await reviewRequest({ path: "/api/public/collections/indirim?limit=100" })).status, 200);
  assert.equal((await reviewRequest({ path: "/api/products/1016" })).status, 404);

  assert.equal((await reviewRequest({ path: "/api/users/me", token: "local-review-invalid" })).status, 401);
  assert.equal((await reviewRequest({ path: "/__review/meta", host: "review.example:5293" })).status, 403);
  assert.equal((await reviewRequest({ path: "/api/payments/initialize", method: "POST", token: firstToken, body: "{}" })).status, 405);
  assert.equal((await reviewRequest({ path: "/api/users/change-password", method: "POST", token: firstToken, body: "{}" })).status, 405);
  const meta = JSON.parse((await reviewRequest({ path: "/__review/meta" })).text);
  assert.equal(meta.counters.external, 1);
  assert.equal(meta.counters.mutation, 2);
  assert.equal(meta.counters.database, 0);
} finally {
  if (positive.exitCode === null) {
    const exited = new Promise((resolve) => positive.once("exit", resolve));
    positive.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  }
}

console.log("LOCAL_REVIEW_AUTH_SOURCE_CONTRACT=PASS");
console.log("LOCAL_REVIEW_AUTH_HTTP_LIFECYCLE=PASS");
console.log("PRODUCTION_AUTH_NEGATIVE_SMOKE=PASS");
console.log("CART_DRAWER_SOURCE_CONTRACT=PASS");
console.log("HELP_SERVICE_ICON_FAMILY_SOURCE_CONTRACT=PASS");
console.log("TYPOGRAPHY_FINAL_CASCADE_CONTRACT=PASS");
console.log("MULTI_MEDIA_REVIEW_PRODUCT_SOURCE_CONTRACT=PASS");
console.log("OWNER_MANUAL_REVIEW_ROUTE_MAP_SOURCE_CONTRACT=PASS");
console.log("STOREFRONT_R5_REVIEW_CONTRACT_SMOKE=PASS");
