// R24 production Customer Web against the immutable R19 controllers and a
// uniquely owned, loopback-only disposable PostgreSQL database. The only
// provider boundary is paymentController.__test's deterministic requester.
import assert from "node:assert/strict";
import crypto, { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format } from "node:util";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import puppeteer from "puppeteer-core";
import { clickCentered, selectCanonicalVariant } from "./variant-selector-browser.mjs";

const storefrontRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r24Root = path.resolve(storefrontRoot, "..");
const expectedR19Root = path.resolve(r24Root, "..", "android-customer-theme-20260722", "pc1-r19-purchasable-variants");
const r19Root = path.resolve(process.env.NOVASTORE_R19_ROOT || expectedR19Root);
const artifactRoot = path.join(r24Root, "artifacts", "r24-real-r19");
const browserHtmlPath = path.join(r24Root, "frontend", "commerce-pro", "index.html");
const EXPECTED_R19_HEAD = "d3e5fdadf961429c6860f18bd1706fac23add9e7";
const EXPECTED_R19_TREE = "b4004e0856ac0902374d8c04026a05bc9bb3c4dc";
const ACCEPTED_R24_BASE = "7a9f218e2d2e329cb39548ec979321e83d0502f6";
const execute = process.argv.includes("--execute-disposable-db");
const runId = crypto.randomBytes(8).toString("hex");
const containerName = `novastore-r24-r19-${runId}`;
const databaseName = `novastore_r24_r19_${runId}_test`;
const databaseUser = `r24_${runId}`;
const databasePassword = crypto.randomBytes(32).toString("base64url");
const jwtSecret = crypto.randomBytes(48).toString("base64url");
const sellerSecret = crypto.randomBytes(48).toString("base64url");
const syntheticMerchantKey = crypto.randomBytes(32).toString("base64url");
const syntheticMerchantSalt = crypto.randomBytes(32).toString("base64url");
const customerPassword = crypto.randomBytes(18).toString("base64url");
const sensitive = new Set([databasePassword, jwtSecret, sellerSecret, syntheticMerchantKey, syntheticMerchantSalt, customerPassword]);
const requireR19 = createRequire(path.join(r19Root, "package.json"));
const originalConsole = Object.fromEntries(["log", "info", "warn", "error", "debug"].map((key) => [key, console[key]]));
const backendLogs = [];
let dockerCreated = false;
let dockerLaunchAttempted = false;
let pool;
let server;
let browser;
let paymentTestApi;
let originalFetch = global.fetch;
let outboundBackendAttempts = 0;
let providerRequesterCalls = 0;
let publicBase = "";
let dockerContextName = "";
let dockerEndpoint = "";
let dockerLocalEnv;
let runOutcome;
let runError;
let harnessSha256AtStart = "";
let cleanup = { browserClosed: false, serverClosed: false, poolClosed: false, containerRemoved: false };
const originalNetwork = {
  netConnect: net.connect,
  netCreateConnection: net.createConnection,
  httpRequest: http.request,
  httpGet: http.get,
  httpsRequest: https.request,
  httpsGet: https.get,
  tlsConnect: tls.connect,
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const redact = (value) => {
  let text = String(value ?? "");
  for (const secret of sensitive) if (secret) text = text.split(secret).join("[REDACTED]");
  return text;
};
const command = (program, args, { cwd = r24Root, env = process.env, timeout = 120000 } = {}) => {
  const result = spawnSync(program, args, { cwd, env, timeout, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(program)} failed: ${redact(result.stderr || result.stdout || result.error?.message)}`);
  return String(result.stdout || "").trim();
};
const dockerCommand = (args, options = {}) => {
  assert(dockerEndpoint && dockerLocalEnv, "local Docker endpoint must be proven before use");
  return command("docker", ["--host", dockerEndpoint, ...args], { ...options, env: dockerLocalEnv });
};
const gitIdentity = (root) => ({
  head: command("git", ["rev-parse", "HEAD"], { cwd: root }),
  tree: command("git", ["rev-parse", "HEAD^{tree}"], { cwd: root }),
});
const jsonRequest = async (pathname, { method = "GET", token, body, key } = {}) => {
  const response = await originalFetch(`${publicBase}${pathname}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  return { status: response.status, payload };
};
const waitForPostgres = async (connectionString, Client) => {
  let last = "unavailable";
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const client = new Client({ connectionString, ssl: false, connectionTimeoutMillis: 800 });
    try {
      await client.connect();
      assert.equal((await client.query("SELECT current_database() AS name")).rows[0].name, databaseName);
      await client.end();
      return;
    } catch (error) {
      last = error.code || error.message;
      await client.end().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Disposable PostgreSQL did not become ready: ${redact(last)}`);
};
const check = (checks, name, condition = true) => {
  assert.ok(condition, name);
  checks.push(name);
  originalConsole.log(`PASS ${name}`);
};
const expectCode = async (checks, name, request, status, code) => {
  const result = await request;
  assert.equal(result.status, status, `${name} status`);
  assert.equal(result.payload.code, code, `${name} code`);
  checks.push(name);
};
const isLoopback = (host) => ["127.0.0.1", "localhost", "::1"].includes(String(host || "").replace(/^\[|\]$/g, ""));
const socketHost = (args) => typeof args[0] === "object" && args[0] !== null ? args[0].host || args[0].hostname : typeof args[1] === "string" ? args[1] : "localhost";
const requestHost = (args) => {
  try {
    if (typeof args[0] === "string" || args[0] instanceof URL) return new URL(args[0]).hostname;
    return args[0]?.hostname || args[0]?.host || "localhost";
  } catch { return "invalid"; }
};
const installNetworkGuard = () => {
  const reject = (host) => { outboundBackendAttempts += 1; throw new Error(`Non-loopback network is forbidden (${host}).`); };
  net.connect = function guardedConnect(...args) { const host = socketHost(args); if (!isLoopback(host)) return reject(host); return originalNetwork.netConnect.apply(this, args); };
  net.createConnection = function guardedCreateConnection(...args) { const host = socketHost(args); if (!isLoopback(host)) return reject(host); return originalNetwork.netCreateConnection.apply(this, args); };
  const wrapRequest = (original) => function guardedRequest(...args) { const host = requestHost(args); if (!isLoopback(host)) return reject(host); return original.apply(this, args); };
  http.request = wrapRequest(originalNetwork.httpRequest);
  http.get = wrapRequest(originalNetwork.httpGet);
  https.request = wrapRequest(originalNetwork.httpsRequest);
  https.get = wrapRequest(originalNetwork.httpsGet);
  tls.connect = function guardedTlsConnect(...args) { const host = socketHost(args); if (!isLoopback(host)) return reject(host); return originalNetwork.tlsConnect.apply(this, args); };
};
const restoreNetworkGuard = () => {
  net.connect = originalNetwork.netConnect; net.createConnection = originalNetwork.netCreateConnection;
  http.request = originalNetwork.httpRequest; http.get = originalNetwork.httpGet;
  https.request = originalNetwork.httpsRequest; https.get = originalNetwork.httpsGet;
  tls.connect = originalNetwork.tlsConnect;
};

async function seedDatabase() {
  const bcrypt = requireR19("bcrypt");
  const passwordHash = await bcrypt.hash(customerPassword, 4);
  const users = await pool.query(
    `INSERT INTO users (full_name,name,email,phone,password,role,auth_enabled)
     VALUES
       ('R24 Real Customer','R24 Real Customer','r24-real@example.test','05550000001',$1,'customer',TRUE),
       ('R24 Seller','R24 Seller','r24-seller@example.test','05550000002','unused','customer',TRUE),
       ('R24 Foreign Seller','R24 Foreign Seller','r24-foreign@example.test','05550000003','unused','customer',TRUE),
       ('R24 Admin','R24 Admin','r24-admin@example.test','05550000004','unused','admin',TRUE)
     RETURNING id,email`,
    [passwordHash],
  );
  const userId = new Map(users.rows.map((row) => [row.email, Number(row.id)]));
  const customerId = userId.get("r24-real@example.test");
  const sellerId = userId.get("r24-seller@example.test");
  const foreignSellerId = userId.get("r24-foreign@example.test");
  const adminId = userId.get("r24-admin@example.test");
  const addressId = Number((await pool.query(
    `INSERT INTO customer_addresses(user_id,title,full_name,phone,city,district,address_line,is_default)
     VALUES($1,'Ev','R24 Real Customer','05550000001','İstanbul','Kadıköy','Yalnız yerel R24 R19 doğrulama adresi No 24',TRUE)
     RETURNING id`, [customerId],
  )).rows[0].id);
  const stores = await pool.query(
    `INSERT INTO stores(name,slug,owner_user_id,is_active)
     VALUES('R24 Canonical Store','r24-canonical-store',$1,TRUE),('R24 Foreign Store','r24-foreign-store',$2,TRUE)
     RETURNING id,slug`, [sellerId, foreignSellerId],
  );
  const storeBySlug = new Map(stores.rows.map((row) => [row.slug, Number(row.id)]));
  const storeId = storeBySlug.get("r24-canonical-store");
  const foreignLegacyStoreId = storeBySlug.get("r24-foreign-store");
  const products = await pool.query(
    `INSERT INTO products(name,price,stock,description,image_url,category,categories,store_id,publication_status,is_customer_visible,sku,normalized_sku,variant_selection_required)
     VALUES
       ('R24 Kanonik Varyantlı Ürün',100.00,7,'Gerçek R19 varyant sözleşmesi.','/r24-product.svg','R24 Yerel Kategori',ARRAY['R24 Yerel Kategori'],$1,'active',TRUE,'R24-VARIANT','R24-VARIANT',TRUE),
       ('R24 Kanonik Basit Ürün',80.00,5,'Gerçek R19 basit ürün sözleşmesi.','/r24-product.svg','R24 Yerel Kategori',ARRAY['R24 Yerel Kategori'],$1,'active',TRUE,'R24-SIMPLE','R24-SIMPLE',FALSE),
       ('R24 Foreign Product',90.00,4,'Yabancı varyant negatif testi.','/r24-product.svg','R24 Yerel Kategori',ARRAY['R24 Yerel Kategori'],$2,'active',TRUE,'R24-FOREIGN','R24-FOREIGN',TRUE)
     RETURNING id,name`, [storeId, foreignLegacyStoreId],
  );
  const productByName = new Map(products.rows.map((row) => [row.name, Number(row.id)]));
  const variantProductId = productByName.get("R24 Kanonik Varyantlı Ürün");
  const simpleProductId = productByName.get("R24 Kanonik Basit Ürün");
  const foreignProductId = productByName.get("R24 Foreign Product");
  const categoryId = Number((await pool.query(
    `INSERT INTO categories(name,slug,path,depth,sort_order,is_active,is_customer_visible,show_in_menu,hide_when_empty)
     VALUES('R24 Yerel Kategori','r24-yerel','r24-yerel',0,1,TRUE,TRUE,TRUE,FALSE) RETURNING id`,
  )).rows[0].id);
  await pool.query(
    `INSERT INTO product_categories(product_id,category_id,is_primary)
     VALUES($1,$4,TRUE),($2,$4,TRUE),($3,$4,TRUE)`,
    [variantProductId, simpleProductId, foreignProductId, categoryId],
  );
  await requireR19(path.join(r19Root, "services", "categoryStatsService.js")).recalculateAllCategoryStats(pool);
  const orgs = await pool.query(
    `INSERT INTO seller_organizations(external_key,display_name)
     VALUES($1,'R24 Canonical Organization'),($2,'R24 Foreign Organization') RETURNING id,display_name`,
    [crypto.randomUUID(), crypto.randomUUID()],
  );
  const orgByName = new Map(orgs.rows.map((row) => [row.display_name, Number(row.id)]));
  const organizationId = orgByName.get("R24 Canonical Organization");
  const foreignOrganizationId = orgByName.get("R24 Foreign Organization");
  const sellerStores = await pool.query(
    `INSERT INTO seller_stores(organization_id,legacy_store_id,display_name)
     VALUES($1,$2,'R24 Canonical Store'),($3,$4,'R24 Foreign Store') RETURNING id,organization_id`,
    [organizationId, storeId, foreignOrganizationId, foreignLegacyStoreId],
  );
  const sellerStoreId = Number(sellerStores.rows.find((row) => Number(row.organization_id) === organizationId).id);
  const foreignSellerStoreId = Number(sellerStores.rows.find((row) => Number(row.organization_id) === foreignOrganizationId).id);
  const identityService = requireR19(path.join(r19Root, "services", "sellerPublicLegalIdentityService.js"));
  for (const [orgId, suffix] of [[organizationId, "Canonical"], [foreignOrganizationId, "Foreign"]]) {
    const identity = { version: "r24-real-v1", publicLegalName: `R24 ${suffix} Test Tüzel Kişisi`, publicTradeName: `R24 ${suffix} Test`, publicDisclosureText: "Yalnız yerel ve tek kullanımlık R24 R19 browser doğrulaması." };
    const row = await pool.query(
      `INSERT INTO seller_public_legal_identities(organization_id,version,public_legal_name,public_trade_name,public_disclosure_text,content_sha256,status,created_by_admin_user_id)
       VALUES($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING id`,
      [orgId, identity.version, identity.publicLegalName, identity.publicTradeName, identity.publicDisclosureText, identityService.buildSellerPublicLegalIdentityContentSha256(identity), adminId],
    );
    await pool.query("UPDATE seller_public_legal_identities SET status='approved',approved_by_admin_user_id=$2,approved_at=NOW(),revision=revision+1 WHERE id=$1", [row.rows[0].id, adminId]);
  }
  const offers = await pool.query(
    `INSERT INTO seller_offers(organization_id,store_id,product_id,status,visibility)
     VALUES($1,$2,$3,'active','seller_visible'),($1,$2,$7,'active','seller_visible'),($4,$5,$6,'active','seller_visible') RETURNING id,organization_id,product_id`,
    [organizationId, sellerStoreId, variantProductId, foreignOrganizationId, foreignSellerStoreId, foreignProductId, simpleProductId],
  );
  const offerId = Number(offers.rows.find((row) => Number(row.product_id) === variantProductId).id);
  const simpleOfferId = Number(offers.rows.find((row) => Number(row.product_id) === simpleProductId).id);
  const foreignOfferId = Number(offers.rows.find((row) => Number(row.organization_id) === foreignOrganizationId).id);
  const variants = await pool.query(
    `INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,seller_sku,price_minor,currency,status,product_id,selections,publication_status)
     VALUES
       ($1,$2,$3,'R24-RED-M',10000,'TRY','active',$4,$5::jsonb,'published'),
       ($1,$2,$3,'R24-RED-L',15075,'TRY','active',$4,$6::jsonb,'published'),
       ($1,$2,$3,'R24-BLUE-L',18000,'TRY','active',$4,$7::jsonb,'published'),
       ($1,$2,$3,'R24-DISABLED',19000,'TRY','inactive',$4,$8::jsonb,'published'),
       ($1,$2,$14,'R24-SIMPLE-OFFER',8000,'TRY','active',NULL,'[]'::jsonb,'draft'),
       ($9,$10,$11,'R24-FOREIGN-M',9000,'TRY','active',$12,$13::jsonb,'published')
     RETURNING id,seller_sku`,
    [organizationId, sellerStoreId, offerId, variantProductId,
      JSON.stringify([{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }]),
      JSON.stringify([{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "L" }]),
      JSON.stringify([{ group: "Renk", value: "Mavi" }, { group: "Beden", value: "L" }]),
      JSON.stringify([{ group: "Renk", value: "Siyah" }, { group: "Beden", value: "XL" }]),
      foreignOrganizationId, foreignSellerStoreId, foreignOfferId, foreignProductId,
      JSON.stringify([{ group: "Renk", value: "Yeşil" }, { group: "Beden", value: "M" }]), simpleOfferId],
  );
  const variantBySku = new Map(variants.rows.map((row) => [row.seller_sku, Number(row.id)]));
  const deletedVariant = Number((await pool.query(
    `INSERT INTO seller_offer_variants(organization_id,store_id,offer_id,seller_sku,price_minor,currency,status,product_id,selections,publication_status,deleted_at)
     VALUES($1,$2,$3,'R24-DELETED',17000,'TRY','active',$4,$5::jsonb,'published',NOW()) RETURNING id`,
    [organizationId, sellerStoreId, offerId, variantProductId, JSON.stringify([{ group: "Renk", value: "Beyaz" }, { group: "Beden", value: "S" }])],
  )).rows[0].id);
  await pool.query(
    `INSERT INTO seller_inventory_items(organization_id,store_id,variant_id,quantity)
     VALUES($1,$2,$3,4),($1,$2,$4,3),($1,$2,$5,0),($1,$2,$6,2),($1,$2,$10,5),($1,$2,$11,2),($7,$8,$9,4)`,
    [organizationId, sellerStoreId, variantBySku.get("R24-RED-M"), variantBySku.get("R24-RED-L"), variantBySku.get("R24-BLUE-L"), variantBySku.get("R24-DISABLED"), foreignOrganizationId, foreignSellerStoreId, variantBySku.get("R24-FOREIGN-M"), variantBySku.get("R24-SIMPLE-OFFER"), deletedVariant],
  );
  return {
    customerId, addressId, variantProductId, simpleProductId, foreignProductId,
    variantM: variantBySku.get("R24-RED-M"), variantL: variantBySku.get("R24-RED-L"),
    zeroVariant: variantBySku.get("R24-BLUE-L"), disabledVariant: variantBySku.get("R24-DISABLED"),
    foreignVariant: variantBySku.get("R24-FOREIGN-M"), deletedVariant, simpleOfferVariant: variantBySku.get("R24-SIMPLE-OFFER"), email: "r24-real@example.test",
  };
}

async function browserFlow(ids, checks, evidence) {
  const blockedBrowserRequests = [];
  const pageErrors = [];
  const purchaseRequests = [];
  browser = await puppeteer.launch({
    executablePath: process.env.NOVASTORE_TEST_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
    args: ["--no-first-run", "--disable-background-networking", "--disable-component-update"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const parsed = new URL(url);
    if (request.method() === "POST" && ["/api/campaigns/quote", "/api/payments/agreements/preview", "/api/payments/initialize"].includes(parsed.pathname)) {
      purchaseRequests.push({ path: parsed.pathname, body: JSON.parse(request.postData() || "{}") });
    }
    if (parsed.origin === new URL(publicBase).origin || ["data:", "blob:"].includes(parsed.protocol)) request.continue();
    else { blockedBrowserRequests.push(parsed.origin); request.abort(); }
  });
  const navigate = async (hash) => page.evaluate((next) => { location.hash = next; }, hash);
  const settle = async () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const clickText = async (selector, label) => {
    await page.waitForFunction((s, text) => [...document.querySelectorAll(s)].some((element) => element.textContent.trim() === text && !element.disabled), { timeout: 15000 }, selector, label);
    await page.evaluate((s, text) => [...document.querySelectorAll(s)].find((element) => element.textContent.trim() === text && !element.disabled).click(), selector, label);
  };
  await page.goto(`${publicBase}/`, { waitUntil: "networkidle0" });
  await navigate("#/giris");
  await page.waitForSelector('.auth-card input[name="email"]');
  await page.type('.auth-card input[name="email"]', ids.email);
  await page.type('.auth-card input[name="password"]', customerPassword);
  await page.click('.auth-card form button[type="submit"]');
  await page.waitForFunction(() => Boolean(localStorage.getItem("nova_user_token")));
  check(checks, "browser authenticates through the real R19 customer login controller");
  const browserToken = await page.evaluate(() => localStorage.getItem("nova_user_token"));
  sensitive.add(browserToken);
  const browserCatalog = await page.evaluate(async () => {
    const response = await fetch("/api/products");
    return { status: response.status, body: await response.json() };
  });
  assert.equal(browserCatalog.status, 200);
  assert.ok(browserCatalog.body.some((product) => Number(product.id) === ids.variantProductId));
  await page.reload({ waitUntil: "networkidle0" });

  await navigate(`#/urun-id/${ids.variantProductId}`);
  try {
    await page.waitForSelector('[data-variant-option="M"]', { timeout: 15000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ hash: location.hash, main: document.querySelector("#main-content")?.innerText?.slice(0, 1200) || "", body: document.body.innerText.slice(0, 1200) }));
    throw new Error(`Variant PDP did not render: ${JSON.stringify(state)}`, { cause: error });
  }
  const canonicalPdp = (await jsonRequest(`/api/products/${ids.variantProductId}`)).payload;
  check(checks, "real R19 PDP exposes only the three published active variants", JSON.stringify(canonicalPdp.variants.map((row) => row.id).sort((a,b) => a-b)) === JSON.stringify([ids.variantM, ids.variantL, ids.zeroVariant].sort((a,b) => a-b)));
  check(checks, "R29 groups contain only real R19 row labels", JSON.stringify((await page.$$eval("[data-variant-option]", (nodes) => nodes.map((node) => node.closest("[data-variant-group]").dataset.variantGroup+":"+node.dataset.variantOption))).sort()) === JSON.stringify([...new Set(canonicalPdp.variants.flatMap((row) => row.selections.map((s) => s.group+":"+s.value)))].sort()));
  check(checks, "zero-stock canonical combination stays visible and disabled", await page.$eval('[data-variant-option="Mavi"]', (el) => el.getAttribute("aria-disabled") === "true" && el.dataset.optionState === "OUT_OF_STOCK"));
  check(checks, "required variant has no automatic selection", await page.$$eval("[data-variant-option]", (elements) => elements.every((element) => element.getAttribute("aria-pressed") !== "true")));
  await selectCanonicalVariant(page, canonicalPdp.variants.find((row) => row.id === ids.variantM));
  await clickCentered(page, ".purchase-row .primary-button");
  await page.waitForFunction((userId, variantId) => JSON.parse(localStorage.getItem(`novastore_variant_cart_${userId}`) || "[]").some((row) => row.variantId === variantId), {}, ids.customerId, ids.variantM);
  await navigate(`#/urun-id/${ids.simpleProductId}`);
  await page.waitForSelector(".purchase-row .primary-button");
  check(checks, "simple R19 PDP renders without a variant selector", !(await page.$(".runtime-variant-selection")));
  await clickCentered(page, ".purchase-row .primary-button");
  await page.waitForFunction(() => /sepete eklendi/.test(document.body.innerText));
  await navigate("#/sepet");
  await page.waitForSelector(".cart-page-line");
  const cartLines = await page.$$eval(".cart-page-line", (rows) => rows.map((row) => ({ key: row.dataset.cartLineKey, text: row.innerText })));
  check(checks, "browser cart keeps canonical variant and simple product as distinct lines", cartLines.length === 2 && cartLines.some((row) => row.key.endsWith(`:${ids.variantM}`)) && cartLines.some((row) => row.key === String(ids.simpleProductId)));
  evidence.browserCart = cartLines.map((line) => line.key);

  // Checkout prefetches legal preview as soon as its default address and quote
  // are ready, before navigation to the payment step. Subscribe before mount.
  const previewP1ResponsePromise = page.waitForResponse((response) => response.url().includes("/api/payments/agreements/preview") && response.request().method() === "POST", { timeout: 15000 });
  await page.waitForSelector("button.checkout-button:not([disabled])", { timeout: 15000 });
  await clickCentered(page, "button.checkout-button:not([disabled])");
  try {
    await page.waitForSelector('.connected-checkout-addresses input[type="radio"]', { timeout: 15000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ hash: location.hash, main: document.querySelector("#main-content")?.innerText?.slice(0, 2400) || "" }));
    throw new Error(`Checkout addresses did not render: ${JSON.stringify(state)}`, { cause: error });
  }
  await page.$eval('.connected-checkout-addresses input[type="radio"]', (input) => input.click());
  await page.waitForFunction(() => document.querySelector('.connected-checkout-addresses input[type="radio"]')?.checked === true);
  await page.waitForSelector("button.checkout-next:not([disabled])", { timeout: 15000 });
  await navigate("#/odeme/odeme");
  try {
    await page.waitForSelector('.exact-agreement input[type="checkbox"]', { timeout: 15000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ hash: location.hash, main: document.querySelector("#main-content")?.innerText?.slice(0, 2400) || "" }));
    throw new Error(`Checkout agreements did not render: ${JSON.stringify(state)} backend=${backendLogs.slice(-8).map(redact).join(" | ")}`, { cause: error });
  }
  const previewP1Response = await previewP1ResponsePromise;
  assert.equal(previewP1Response.status(), 200);
  const previewStockBody = await previewP1Response.json();
  await pool.query("UPDATE seller_inventory_items SET quantity=0,revision=revision+1,updated_at=NOW() WHERE variant_id=$1", [ids.variantM]);
  await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.forEach((input) => { if (!input.checked) input.click(); }));
  await clickText(".checkout-navigation button", "Siparişi kontrol et");
  await page.waitForSelector(".review-products");
  const stockInitializePromise = page.waitForResponse((response) => response.url().includes("/api/payments/initialize") && response.request().method() === "POST", { timeout: 15000 });
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç");
  const stockInitializeResponse = await stockInitializePromise;
  const stockInitializeBody = await stockInitializeResponse.json();
  assert.equal(stockInitializeResponse.status(), 409);
  assert.equal(stockInitializeBody.code, "VARIANT_STOCK_UNAVAILABLE");
  assert.equal(providerRequesterCalls, 0, "insufficient stock must fail before provider session creation");
  check(checks, "browser initialize rejects authoritative stock loss before the provider boundary");
  await pool.query("UPDATE seller_inventory_items SET quantity=4,revision=revision+1,updated_at=NOW() WHERE variant_id=$1", [ids.variantM]);
  const pricePreviewPromise = page.waitForResponse((response) => response.url().includes("/api/payments/agreements/preview") && response.request().method() === "POST" && response.status() === 200, { timeout: 15000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-content");
  if ((await page.evaluate(() => location.hash)) !== "#/odeme/odeme") {
    await page.waitForSelector('.connected-checkout-addresses input[type="radio"]', { timeout: 15000 });
    await page.$eval('.connected-checkout-addresses input[type="radio"]', (input) => input.click());
    await page.waitForSelector("button.checkout-next:not([disabled])", { timeout: 15000 });
    await navigate("#/odeme/odeme");
  }
  await page.waitForSelector('.exact-agreement input[type="checkbox"]', { timeout: 15000 });
  const pricePreviewResponse = await pricePreviewPromise;
  const previewP1Body = await pricePreviewResponse.json();
  assert.equal(previewP1Body.snapshotSha256, previewStockBody.snapshotSha256, "stock count is not part of the legal snapshot hash");
  await pool.query("UPDATE seller_offer_variants SET price_minor=12500,revision=revision+1,updated_at=NOW() WHERE id=$1", [ids.variantM]);
  await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.forEach((input) => { if (!input.checked) input.click(); }));
  await clickText(".checkout-navigation button", "Siparişi kontrol et");
  await page.waitForSelector(".review-products");
  const previewP2ResponsePromise = page.waitForResponse((response) => response.url().includes("/api/payments/agreements/preview") && response.request().method() === "POST", { timeout: 15000 });
  const staleInitializePromise = page.waitForResponse((response) => response.url().includes("/api/payments/initialize") && response.request().method() === "POST", { timeout: 15000 });
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç");
  const staleInitializeResponse = await staleInitializePromise;
  const staleInitializeBody = await staleInitializeResponse.json();
  assert.equal(staleInitializeResponse.status(), 409);
  assert.equal(staleInitializeBody.code, "CHECKOUT_AGREEMENT_SNAPSHOT_STALE");
  try {
    await page.waitForFunction(() => document.querySelector("#main-content")?.innerText.includes("Sipariş özeti değişti"), { timeout: 15000 });
  } catch (error) {
    const state = await page.evaluate(() => ({ path: location.pathname, hash: location.hash, main: document.querySelector("#main-content")?.innerText?.slice(0, 2600) || "" }));
    throw new Error(`Stale P1 response did not surface expected message: ${JSON.stringify(state)} providerCalls=${providerRequesterCalls} backend=${backendLogs.slice(-8).map(redact).join(" | ")}`, { cause: error });
  }
  check(checks, "browser P1 initialize fails closed after authoritative variant price changes");
  const previewP2Response = await previewP2ResponsePromise;
  assert.equal(previewP2Response.status(), 200);
  const previewP2Body = await previewP2Response.json();
  assert.notEqual(previewP2Body.snapshotSha256, previewP1Body.snapshotSha256);
  await page.waitForSelector('.exact-agreement input[type="checkbox"]');
  check(checks, "stale P1 response clears all legal acceptances", await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.every((input) => !input.checked)));
  assert.equal(Number(previewP2Body.quote.items.find((item) => Number(item.variant_id) === ids.variantM).price), 125);
  check(checks, "refreshed P2 shows the authoritative 205 TRY cart total", (await page.$eval("#main-content", (main) => main.innerText)).includes("205"));
  await page.$$eval('.exact-agreement input[type="checkbox"]', (inputs) => inputs.forEach((input) => { if (!input.checked) input.click(); }));
  await clickText(".checkout-navigation button", "Siparişi kontrol et");
  await page.waitForSelector(".review-products");
  const acceptedInitializePromise = page.waitForResponse((response) => response.url().includes("/api/payments/initialize") && response.request().method() === "POST", { timeout: 15000 });
  await clickText(".checkout-navigation .primary-button", "PayTR güvenli ödeme ekranına geç");
  const acceptedInitializeResponse = await acceptedInitializePromise;
  const acceptedInitializeBody = await acceptedInitializeResponse.json();
  assert.equal(acceptedInitializeResponse.status(), 201);
  assert.ok(Number(acceptedInitializeBody.orderId) > 0);
  await page.waitForFunction(() => location.pathname === "/paytr-checkout.html", { timeout: 15000 });
  check(checks, "browser accepts refreshed P2 snapshot and reaches the deterministic PayTR handoff page");
  evidence.browserBlockedOrigins = [...new Set(blockedBrowserRequests)].sort();
  evidence.pageErrors = pageErrors;
  evidence.browserInitialize = { stockLoss: { status: stockInitializeResponse.status(), code: stockInitializeBody.code, providerCallsAtRejection: 0 }, stale: { status: staleInitializeResponse.status(), code: staleInitializeBody.code, snapshotSha256Changed: true }, accepted: { status: acceptedInitializeResponse.status(), orderId: Number(acceptedInitializeBody.orderId) } };
  const expectedExternalOrigins = new Set(["https://www.paytr.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
  assert.ok(evidence.browserBlockedOrigins.includes("https://www.paytr.com"));
  check(checks, "browser intercepted the expected PayTR handoff and no unexpected external origin", evidence.browserBlockedOrigins.every((origin) => expectedExternalOrigins.has(origin)));
  const canonicalKeys = (line) => Object.keys(line).sort().join(",");
  assert.ok(purchaseRequests.some((request) => request.path === "/api/campaigns/quote"));
  assert.ok(purchaseRequests.some((request) => request.path === "/api/payments/agreements/preview"));
  assert.equal(purchaseRequests.filter((request) => request.path === "/api/payments/initialize").length, 3);
  for (const request of purchaseRequests) {
    assert.ok(Array.isArray(request.body.cartItems) && request.body.cartItems.length === 2);
    assert.deepEqual(request.body.cartItems.map(canonicalKeys), ["product_id,quantity", "product_id,quantity,variant_id"]);
    assert.deepEqual(request.body.cartItems.map((line) => ({ product_id: Number(line.product_id), variant_id: line.variant_id ? Number(line.variant_id) : null, quantity: Number(line.quantity) })), [
      { product_id: ids.simpleProductId, variant_id: null, quantity: 1 },
      { product_id: ids.variantProductId, variant_id: ids.variantM, quantity: 1 },
    ]);
  }
  const initializeRequests = purchaseRequests.filter((request) => request.path === "/api/payments/initialize");
  assert.deepEqual(initializeRequests.map((request) => request.body.agreementSnapshotSha256), [previewStockBody.snapshotSha256, previewP1Body.snapshotSha256, previewP2Body.snapshotSha256]);
  assert.deepEqual(initializeRequests.map((request) => request.body.agreementAcceptances.map(({ slug, version, accepted }) => ({ slug, version, accepted }))), Array(3).fill([
    { slug: "pre-information", version: "r24-real-v1", accepted: true },
    { slug: "distance-sale", version: "r24-real-v1", accepted: true },
  ]));
  check(checks, "browser sends only canonical product_id, variant_id, and quantity line authority");
  evidence.browserPurchaseRequests = purchaseRequests.map((request) => ({ path: request.path, cartItems: request.body.cartItems, snapshotSha256: request.body.agreementSnapshotSha256 || null, acceptances: request.body.agreementAcceptances || null }));
}

async function main() {
  assert(execute, "Use --execute-disposable-db.");
  assert.equal(r19Root.toLocaleLowerCase("en-US"), expectedR19Root.toLocaleLowerCase("en-US"), "R19 root must be the exact named sibling checkout.");
  assert.equal(path.resolve(artifactRoot), path.join(r24Root, "artifacts", "r24-real-r19"));
  const r19Identity = gitIdentity(r19Root);
  assert.deepEqual(r19Identity, { head: EXPECTED_R19_HEAD, tree: EXPECTED_R19_TREE });
  const r19StatusBefore = command("git", ["status", "--porcelain=v1"], { cwd: r19Root });
  assert.equal(r19StatusBefore, "", "R19 source must start completely clean.");
  assert.equal(command("git", ["rev-parse", `${EXPECTED_R19_HEAD}^{tree}`], { cwd: r19Root }), EXPECTED_R19_TREE);
  command("git", ["merge-base", "--is-ancestor", ACCEPTED_R24_BASE, "HEAD"], { cwd: r24Root });
  const r24Identity = gitIdentity(r24Root);
  harnessSha256AtStart = sha256(await fsp.readFile(fileURLToPath(import.meta.url)));
  const browserHtml = await fsp.readFile(browserHtmlPath);
  assert.equal(sha256(browserHtml), "4d9c9cc2240867346aa259a208f4fffe3298b162b36d39ad4d6c743e022f4a7c");
  const servedAssets = new Map(await Promise.all([
    ["/shared-state-sync.js", path.join(r24Root, "frontend", "shared-state-sync.js")],
    ["/favorites-sync.js", path.join(r24Root, "frontend", "favorites-sync.js")],
    ["/mobile-bridge.js", path.join(r24Root, "frontend", "mobile-bridge.js")],
    ["/paytr-checkout.html", path.join(r24Root, "frontend", "paytr-checkout.html")],
  ].map(async ([route, file]) => [route, { file, bytes: await fsp.readFile(file) }])));
  const servedAssetSha256 = Object.fromEntries([...servedAssets].map(([route, asset]) => [route, sha256(asset.bytes)]));
  await fsp.rm(artifactRoot, { recursive: true, force: true });
  await fsp.mkdir(artifactRoot, { recursive: true });
  dockerContextName = command("docker", ["context", "show"]);
  const contextEndpoint = command("docker", ["context", "inspect", dockerContextName, "--format", "{{(index .Endpoints \"docker\").Host}}"]).trim();
  dockerEndpoint = String(process.env.DOCKER_HOST || contextEndpoint).trim();
  assert(/^(?:npipe|unix):\/\//u.test(dockerEndpoint), `Docker daemon must be local; rejected endpoint scheme: ${dockerEndpoint.split(":", 1)[0] || "missing"}`);
  dockerLocalEnv = { ...process.env, POSTGRES_DB: databaseName, POSTGRES_USER: databaseUser, POSTGRES_PASSWORD: databasePassword };
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete dockerLocalEnv[key];
  dockerLaunchAttempted = true;
  dockerCommand(["run", "--pull", "never", "--rm", "--name", containerName, "-d", "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB", "-e", "POSTGRES_USER", "-e", "POSTGRES_PASSWORD", "postgres:16-bookworm"]);
  dockerCreated = true;
  const portMatch = /^127\.0\.0\.1:(\d+)$/u.exec(dockerCommand(["port", containerName, "5432/tcp"]));
  assert(portMatch, "Disposable PostgreSQL port must bind only to 127.0.0.1.");
  const port = Number(portMatch[1]);
  const connectionString = `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}`;
  sensitive.add(connectionString);
  const { Client } = requireR19("pg");
  await waitForPostgres(connectionString, Client);
  const inheritedIntegrationKey = /^(?:DATABASE_URL|DB_|PAYTR_|IYZICO_|STRIPE_|SUPABASE_|AWS_|AZURE_|GOOGLE_|CLOUDINARY_|FIREBASE_|REDIS_|OPENAI_|ANTHROPIC_|RESEND_|SMTP_|MAIL_|SENTRY_|RENDER_)/u;
  for (const key of Object.keys(process.env)) if (inheritedIntegrationKey.test(key)) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test", NOVASTORE_DEPLOY_ENV: "local", NOVASTORE_SAFE_LOCAL_BACKEND: "true", NOVASTORE_ALLOW_REMOTE_DB: "false",
    SKIP_SCHEMA_INIT: "true", NOVASTORE_ALLOW_SCHEMA_INIT: "false", DATABASE_URL: connectionString,
    DB_HOST: "127.0.0.1", DB_PORT: String(port), DB_NAME: databaseName, DB_USER: databaseUser, DB_PASSWORD: databasePassword, DB_SSL: "false",
    SUPABASE_USE_POOLER: "false", SUPABASE_POOLER_HOST: "", SUPABASE_REGION: "", SUPABASE_PROJECT_REF: "",
    DOTENV_CONFIG_PATH: path.join(artifactRoot, "intentionally-absent.env"),
    JWT_SECRET: jwtSecret, SELLER_ACCESS_TOKEN_SECRET: sellerSecret, NOVASTORE_NOTIFICATION_WORKER_ENABLED: "false", NOVASTORE_REQUEST_LOGGING_ENABLED: "false",
    PAYMENT_PROVIDER: "paytr", PAYTR_MERCHANT_ID: `r24-${runId}`, PAYTR_MERCHANT_KEY: syntheticMerchantKey, PAYTR_MERCHANT_SALT: syntheticMerchantSalt,
    APP_BASE_URL: "https://novastore.example", PAYTR_BASE_URL: "https://www.paytr.com", PAYTR_CALLBACK_URL: "https://novastore.example/api/payments/webhook/paytr",
    PAYTR_SUCCESS_URL: "https://novastore.example/payment-result.html", PAYTR_FAIL_URL: "https://novastore.example/payment-result.html",
    PAYTR_TEST_MODE: "true", PAYTR_DEBUG_ON: "false", PAYTR_LIVE_REQUESTS_ALLOWED: "true",
    NOVASTORE_REQUIRE_BUSINESS_IDENTITY_FOR_PAYMENT: "false", BUSINESS_LEGAL_COMPANY_NAME: "NovaStore Local Integration Test",
    BUSINESS_TRADE_NAME: "NovaStore R24 R19 Test", BUSINESS_TAX_VKN: "1234567890", BUSINESS_TAX_OFFICE: "Yerel Test Vergi Dairesi",
    BUSINESS_MERSIS_NUMBER: "1234567890123456", BUSINESS_REGISTERED_ADDRESS: "Yalnız yerel R24 R19 test adresi, İstanbul",
    BUSINESS_KEP_ADDRESS: "r24-r19@example.test", BUSINESS_PHONE: "+905550000024", BUSINESS_EMAIL: "r24-r19@example.test",
    CUSTOMER_PUBLIC_DOMAIN: "https://novastore.example", NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED: "true",
    NOVASTORE_LEGAL_PRE_INFORMATION_VERSION: "r24-real-v1", NOVASTORE_LEGAL_PRE_INFORMATION_TEXT: "Yalnız yerel R24 R19 testi ön bilgilendirme metni.",
    NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED: "true", NOVASTORE_LEGAL_DISTANCE_SALE_VERSION: "r24-real-v1",
    NOVASTORE_LEGAL_DISTANCE_SALE_TEXT: "Yalnız yerel R24 R19 testi mesafeli satış metni.", FREE_SHIPPING_THRESHOLD: "1", DEFAULT_SHIPPING_FEE: "49.90",
    IYZICO_API_KEY: "", IYZICO_SECRET_KEY: "", IYZICO_BASE_URL: "", STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "",
  });
  requireR19("dotenv").config = () => ({ parsed: {} });
  installNetworkGuard();
  for (const key of Object.keys(originalConsole)) console[key] = (...args) => backendLogs.push(format(...args));
  const { LOCAL_TEST_CAPABILITY } = requireR19(path.join(r19Root, "scripts", "staging-migrations", "guard.js"));
  const { loadRegistry } = requireR19(path.join(r19Root, "scripts", "staging-migrations", "registry.js"));
  const { runApply } = requireR19(path.join(r19Root, "scripts", "staging-migrations", "runner.js"));
  const registry = loadRegistry();
  assert.equal(registry.length, 39);
  assert.equal(registry.at(-1).id, "20260908_01_purchasable_variants");
  const migrationEnv = { NODE_ENV: "test", NOVASTORE_DEPLOY_ENV: "staging", NOVASTORE_STAGING_MIGRATIONS_ENABLED: "true", NOVASTORE_STAGING_BOOTSTRAP_ENABLED: "true", NOVASTORE_ALLOW_REMOTE_DB: "true", NOVASTORE_EXPECTED_DATABASE_HOST: "127.0.0.1", NOVASTORE_EXPECTED_DATABASE_NAME: databaseName, [LOCAL_TEST_CAPABILITY]: "true", DATABASE_URL: connectionString };
  assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, registry.map((entry) => entry.id));
  assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, []);
  const serverModule = requireR19.resolve(path.join(r19Root, "server.js"));
  requireR19.cache[serverModule] = { id: serverModule, filename: serverModule, loaded: true, exports: { io: null } };
  pool = requireR19(path.join(r19Root, "config", "db.js"));
  originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
      outboundBackendAttempts += 1;
      throw new Error("Non-loopback network is forbidden by the R24 real-R19 harness.");
    }
    return originalFetch(url, options);
  };
  const ids = await seedDatabase();
  const express = requireR19("express");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.locals.sellerDatabase = pool;
  app.use("/api/products", requireR19(path.join(r19Root, "routes", "productRoutes.js")));
  app.use("/api/campaigns", requireR19(path.join(r19Root, "routes", "campaignRoutes.js")));
  const paymentController = requireR19(path.join(r19Root, "controllers", "paymentController.js"));
  paymentTestApi = paymentController.__test;
  paymentTestApi.setPaytrIframeSessionRequester(async ({ payload, config }) => {
    providerRequesterCalls += 1;
    const token = `local_${sha256(payload.merchant_oid).slice(0, 24)}`;
    return Object.freeze({ type: "iframe", token, iframeUrl: `${config.baseUrl}/odeme/guvenli/${token}`, successUrl: payload.merchant_ok_url, failUrl: payload.merchant_fail_url });
  });
  app.use("/api/payments", requireR19(path.join(r19Root, "routes", "paymentRoutes.js")));
  app.use("/api/users", requireR19(path.join(r19Root, "routes", "userRoutes.js")));
  app.use("/api/addresses", requireR19(path.join(r19Root, "routes", "addressRoutes.js")));
  app.use("/api/shared-state", requireR19(path.join(r19Root, "routes", "sharedStateRoutes.js")));
  app.use("/api/favorites", requireR19(path.join(r19Root, "routes", "favoriteRoutes.js")));
  app.use("/api/public/categories", requireR19(path.join(r19Root, "routes", "publicCategoryRoutes.js")));
  app.get("/api/public/navigation/main", (_req, res) => res.json({ code: "main", items: [] }));
  app.get("/api/public/collections", (_req, res) => res.json([]));
  app.get("/api/public/business-identity", (_req, res) => res.json({ status: "ready", identity: { tradeName: "NovaStore R24 R19 Test" } }));
  app.get("/api/assistant/capability", (_req, res) => res.status(503).json({ available: false }));
  app.get("/api/notifications/unread-count", (_req, res) => res.json({ unreadCount: 0 }));
  app.get("/r24-product.svg", (_req, res) => res.type("image/svg+xml").send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#eee"/><path d="M50 40L80 25Q100 45 120 25L150 40L175 85L145 100L140 180L60 180L55 100L25 85Z" fill="#b73848"/></svg>'));
  app.get("/shared-state-sync.js", (_req, res) => res.type("application/javascript").send(servedAssets.get("/shared-state-sync.js").bytes));
  app.get("/favorites-sync.js", (_req, res) => res.type("application/javascript").send(servedAssets.get("/favorites-sync.js").bytes));
  app.get("/mobile-bridge.js", (_req, res) => res.type("application/javascript").send(servedAssets.get("/mobile-bridge.js").bytes));
  app.get("/paytr-checkout.html", (_req, res) => res.type("html").send(servedAssets.get("/paytr-checkout.html").bytes));
  app.get("/", (_req, res) => res.type("html").send(browserHtml));
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  publicBase = `http://127.0.0.1:${server.address().port}`;

  const checks = [];
  const evidence = { contract: {}, directApiNegatives: {}, browserCart: [], browserBlockedOrigins: [], pageErrors: [] };
  const login = await jsonRequest("/api/users/login", { method: "POST", body: { email: ids.email, password: customerPassword } });
  assert.equal(login.status, 200);
  sensitive.add(login.payload.token);
  const pdp = await jsonRequest(`/api/products/${ids.variantProductId}`);
  assert.equal(pdp.status, 200);
  assert.equal(pdp.payload.variant_selection_required, true);
  assert.deepEqual(pdp.payload.variants.map((row) => row.id), [ids.variantM, ids.variantL, ids.zeroVariant]);
  assert.deepEqual(pdp.payload.variants.map((row) => row.price), [100, 150.75, 180]);
  assert.deepEqual(pdp.payload.variants.map((row) => row.availableStock), [4, 3, 0]);
  assert.equal(pdp.payload.variants.some((row) => Object.hasOwn(row, "price_minor")), false);
  check(checks, "real R19 public PDP exposes canonical price/stock fields and omits price_minor");
  const simplePdp = await jsonRequest(`/api/products/${ids.simpleProductId}`);
  assert.equal(simplePdp.payload.variant_selection_required, false);
  check(checks, "real R19 public PDP marks the simple product as variant-free");
  const { createCatalogAdapter } = await import(pathToFileURL(path.join(storefrontRoot, "src", "adapters", "catalogAdapter.js")));
  const directCatalog = await createCatalogAdapter({ request: async (pathname) => {
    const response = await originalFetch(`${publicBase}${pathname}`);
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status });
    return response.json();
  } }).load();
  assert.ok(directCatalog.categories.length > 0, `direct catalog category count ${directCatalog.categories.length}`);
  assert.ok(directCatalog.products.length > 0, `direct catalog product count ${directCatalog.products.length}`);
  check(checks, "real R19 public category and product projections normalize into the R24 catalog adapter");
  const quoteBody = { cartItems: [{ product_id: ids.variantProductId, variant_id: ids.variantM, quantity: 1 }, { product_id: ids.simpleProductId, quantity: 1 }], couponCode: null };
  const quote = await jsonRequest("/api/campaigns/quote", { method: "POST", body: quoteBody });
  assert.equal(quote.status, 200);
  assert.deepEqual(quote.payload.items.map((row) => row.variant_id || null), [ids.variantM, null]);
  assert.deepEqual(quote.payload.items.map((row) => row.price), [100, 80]);
  check(checks, "real R19 quote resolves canonical variant and simple lines from server authority");
  const forgedQuote = await jsonRequest("/api/campaigns/quote", { method: "POST", body: { cartItems: [
    { product_id: ids.variantProductId, variant_id: ids.variantM, quantity: 1, price: 1, stock: 9999, store_id: 999999, sku: "FORGED" },
    { product_id: ids.variantProductId, variant_id: ids.variantL, quantity: 1, price: 1, stock: 9999, store_id: 999999, sku: "FORGED" },
    { product_id: ids.variantProductId, variant_id: ids.variantM, quantity: 1, price: 1, stock: 9999, store_id: 999999, sku: "FORGED" },
  ] } });
  assert.equal(forgedQuote.status, 200);
  assert.deepEqual(forgedQuote.payload.items.map((item) => ({ variantId: Number(item.variant_id), quantity: Number(item.quantity), price: Number(item.price), sku: item.sku })), [
    { variantId: ids.variantM, quantity: 2, price: 100, sku: "R24-RED-M" },
    { variantId: ids.variantL, quantity: 1, price: 150.75, sku: "R24-RED-L" },
  ]);
  check(checks, "real R19 quote aggregates duplicate product+variant lines, separates sibling variants, and ignores forged authority fields");
  const negativeCases = [
    ["missing", { product_id: ids.variantProductId, quantity: 1 }, 400, "VARIANT_REQUIRED"],
    ["malformed", { product_id: ids.variantProductId, variant_id: "01", quantity: 1 }, 400, "VARIANT_ID_INVALID"],
    ["foreign", { product_id: ids.variantProductId, variant_id: ids.foreignVariant, quantity: 1 }, 409, "VARIANT_NOT_PURCHASABLE"],
    ["disabled", { product_id: ids.variantProductId, variant_id: ids.disabledVariant, quantity: 1 }, 409, "VARIANT_NOT_PURCHASABLE"],
    ["insufficient-stock", { product_id: ids.variantProductId, variant_id: ids.variantL, quantity: 4 }, 409, "VARIANT_STOCK_UNAVAILABLE"],
    ["simple-with-variant", { product_id: ids.simpleProductId, variant_id: ids.variantM, quantity: 1 }, 400, "VARIANT_NOT_ALLOWED"],
  ];
  for (const [name, line, status, code] of negativeCases) {
    await expectCode(checks, `direct API rejects ${name}`, jsonRequest("/api/campaigns/quote", { method: "POST", body: { cartItems: [line] } }), status, code);
    evidence.directApiNegatives[name] = code;
  }
  await expectCode(checks, "direct API rejects deleted variant", jsonRequest("/api/campaigns/quote", { method: "POST", body: { cartItems: [{ product_id: ids.variantProductId, variant_id: ids.deletedVariant, quantity: 1 }] } }), 409, "VARIANT_NOT_PURCHASABLE");
  evidence.directApiNegatives.deleted = "VARIANT_NOT_PURCHASABLE";
  await browserFlow(ids, checks, evidence);
  const inventory = await pool.query("SELECT variant_id,quantity FROM seller_inventory_items WHERE variant_id=ANY($1::bigint[]) ORDER BY variant_id", [[ids.variantM, ids.variantL, ids.zeroVariant]]);
  assert.equal(Number(inventory.rows.find((row) => Number(row.variant_id) === ids.variantM).quantity), 3);
  assert.equal(Number(inventory.rows.find((row) => Number(row.variant_id) === ids.variantL).quantity), 3);
  assert.equal(Number(inventory.rows.find((row) => Number(row.variant_id) === ids.zeroVariant).quantity), 0);
  const orders = (await pool.query("SELECT id,items,total_amount,payment_status FROM orders WHERE user_id=$1 ORDER BY id", [ids.customerId])).rows;
  assert.equal(orders.length, 1, "stale P1 must not create a durable order");
  const order = orders[0];
  assert.equal(Number(order.id), evidence.browserInitialize.accepted.orderId);
  assert.equal(order.payment_status, "REQUIRES_ACTION");
  assert.equal(Number(order.total_amount), 205);
  assert.equal(order.items.length, 2);
  const variantSnapshot = order.items.find((item) => Number(item.variant_id) === ids.variantM);
  const simpleSnapshot = order.items.find((item) => Number(item.id) === ids.simpleProductId);
  assert.deepEqual({ id: Number(variantSnapshot.id), variant_id: Number(variantSnapshot.variant_id), sku: variantSnapshot.sku, variant_selections: variantSnapshot.variant_selections, quantity: Number(variantSnapshot.quantity), price: Number(variantSnapshot.price) }, { id: ids.variantProductId, variant_id: ids.variantM, sku: "R24-RED-M", variant_selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }], quantity: 1, price: 125 });
  assert.deepEqual({ id: Number(simpleSnapshot.id), variant_id: simpleSnapshot.variant_id || null, sku: simpleSnapshot.sku, quantity: Number(simpleSnapshot.quantity), price: Number(simpleSnapshot.price) }, { id: ids.simpleProductId, variant_id: null, sku: "R24-SIMPLE", quantity: 1, price: 80 });
  assert.equal(Number((await pool.query("SELECT stock FROM products WHERE id=$1", [ids.variantProductId])).rows[0].stock), 6);
  assert.equal(Number((await pool.query("SELECT stock FROM products WHERE id=$1", [ids.simpleProductId])).rows[0].stock), 4);
  assert.equal(Number((await pool.query("SELECT quantity FROM seller_inventory_items WHERE variant_id=$1", [ids.simpleOfferVariant])).rows[0].quantity), 5, "simple-product stock authority is products.stock, not seller variant inventory");
  check(checks, "successful initialize reserves exact inventory and stores immutable P2 item snapshots");
  assert.equal(providerRequesterCalls, 1, "stale P1 must fail before the single accepted P2 deterministic provider session");
  assert.equal(outboundBackendAttempts, 0);
  check(checks, "deterministic payment requester made no backend network call and created no settlement");
  evidence.contract = {
    publicVariantFields: ["id", "sku", "selections", "price", "availableStock", "purchasable", "commerce_revision"],
    initialPrices: [100, 150.75, 180], initialStocks: [4, 3, 0],
    staleSnapshot: "CHECKOUT_AGREEMENT_SNAPSHOT_STALE", finalPaymentStatus: order.payment_status,
    finalInventory: Object.fromEntries(inventory.rows.map((row) => [String(row.variant_id), Number(row.quantity)])),
    orderItems: order.items.map((item) => ({ productId: Number(item.id), variantId: item.variant_id ? Number(item.variant_id) : null, sku: item.sku, selections: item.variant_selections || [], quantity: Number(item.quantity), price: Number(item.price) })),
  };
  assert.deepEqual(evidence.pageErrors, []);
  assert.equal(sha256(await fsp.readFile(browserHtmlPath)), sha256(browserHtml), "production bundle bytes changed during the run");
  for (const asset of servedAssets.values()) assert.equal(sha256(await fsp.readFile(asset.file)), sha256(asset.bytes), `served asset changed during the run: ${asset.file}`);
  assert.equal(sha256(await fsp.readFile(fileURLToPath(import.meta.url))), harnessSha256AtStart, "harness source changed during its own run");
  assert.deepEqual(gitIdentity(r19Root), r19Identity, "R19 HEAD/tree changed during the run");
  assert.equal(command("git", ["status", "--porcelain=v1"], { cwd: r19Root }), r19StatusBefore, "R19 worktree/index status changed during the run");
  runOutcome = {
    result: "PASS", scope: "R24 production Customer Web + immutable real R19 critical controllers + disposable PostgreSQL",
    identities: { r19: { ...r19Identity, path: r19Root }, r19StatusBefore, r19StatusAfter: r19StatusBefore, r24: r24Identity, acceptedR24Base: ACCEPTED_R24_BASE, productionBundleSha256: sha256(browserHtml), servedAssetSha256, harnessSha256: harnessSha256AtStart },
    database: { image: "postgres:16-bookworm", dockerContext: dockerContextName, dockerEndpoint, loopbackOnly: true, migrationsApplied: registry.length, migrationNoopPass: true },
    providerBoundary: { requester: "paymentController.__test.setPaytrIframeSessionRequester", calls: providerRequesterCalls, settlementSimulated: false, backendNonLoopbackAttempts: outboundBackendAttempts, inheritedIntegrationEnvScrubbed: true, dotenvLoadingBlocked: true },
    checks, evidence,
  };
}

main().catch((error) => {
  runError = error;
  originalConsole.error(`verify-r19-backend FAIL: ${redact(error.stack || error.message)}`);
  process.exitCode = 1;
}).finally(async () => {
  for (const [key, value] of Object.entries(originalConsole)) console[key] = value;
  global.fetch = originalFetch;
  if (paymentTestApi?.resetPaytrIframeSessionRequester) paymentTestApi.resetPaytrIframeSessionRequester();
  const cleanupErrors = [];
  if (!browser) cleanup.browserClosed = true;
  else try { await browser.close(); cleanup.browserClosed = true; } catch (error) { cleanupErrors.push(`browser: ${redact(error.message)}`); }
  if (!server) cleanup.serverClosed = true;
  else try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); cleanup.serverClosed = true; } catch (error) { cleanupErrors.push(`server: ${redact(error.message)}`); }
  if (!pool) cleanup.poolClosed = true;
  else try { await pool.end(); cleanup.poolClosed = true; } catch (error) { cleanupErrors.push(`pool: ${redact(error.message)}`); }
  restoreNetworkGuard();
  if (!dockerLaunchAttempted) cleanup.containerRemoved = true;
  if (dockerLaunchAttempted) {
    assert(/^novastore-r24-r19-[a-f0-9]{16}$/u.test(containerName));
    try {
      const beforeRemoval = dockerCommand(["ps", "-a", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"], { timeout: 30000 });
      if (beforeRemoval) {
        assert.equal(beforeRemoval, containerName, "Docker name filter returned an unexpected container");
        dockerCommand(["rm", "-f", containerName]);
      }
      const remaining = dockerCommand(["ps", "-a", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"], { timeout: 30000 });
      cleanup.containerRemoved = remaining === "";
      if (!cleanup.containerRemoved) throw new Error("owned disposable PostgreSQL container still exists after cleanup");
    }
    catch (error) { cleanupErrors.push(`container: ${redact(error.message)}`); }
  }
  try {
    const cleanupProven = Object.values(cleanup).every(Boolean) && cleanupErrors.length === 0;
    if (!cleanupProven) process.exitCode = 1;
    const pass = Boolean(runOutcome) && cleanupProven && !runError;
    const payload = pass
      ? { ...runOutcome, database: { ...runOutcome.database, cleanupProven: true }, cleanup }
      : { result: "FAIL", error: redact(runError?.message || cleanupErrors.join(" | ") || "cleanup not proven"), cleanup, cleanupErrors };
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    for (const secret of sensitive) assert(!serialized.includes(secret), "artifact must not contain a generated credential or customer token");
    for (const log of backendLogs) for (const secret of sensitive) assert(!log.includes(secret), "captured backend log must not contain a generated credential or customer token");
    await fsp.mkdir(artifactRoot, { recursive: true });
    await fsp.rm(path.join(artifactRoot, pass ? "failure.json" : "result.json"), { force: true });
    await fsp.writeFile(path.join(artifactRoot, pass ? "result.json" : "failure.json"), serialized, "utf8");
    if (pass) {
      originalConsole.log(`PASS real R19 browser E2E (${runOutcome.checks.length} checks)`);
      originalConsole.log(`Evidence: ${path.join(artifactRoot, "result.json")}`);
    }
  } catch (error) {
    originalConsole.error(`verify-r19-backend artifact finalization FAIL: ${redact(error.stack || error.message)}`);
    process.exitCode = 1;
  }
});
