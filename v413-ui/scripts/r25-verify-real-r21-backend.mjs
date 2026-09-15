// R25 Customer Android contract against immutable R21 controllers and a
// uniquely owned, loopback-only disposable PostgreSQL database.
import assert from "node:assert/strict";
import crypto, { createHash } from "node:crypto";
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
import { seedR25Database } from "./r25-real-r21-fixtures.mjs";

const v413Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r25Root = path.resolve(v413Root, "..");
const sourceRoot = path.resolve(r25Root, "..");
const expectedR21Root = path.join(sourceRoot, "android-customer-theme-20260722", "pc1-r21-stocky-system-commerce");
const r21Root = path.resolve(process.env.NOVASTORE_R21_ROOT || expectedR21Root);
const artifactRoot = path.join(v413Root, "artifacts", "r25-real-r21");
const EXPECTED_R21_HEAD = "6492cc1d7b3033c63cdd1454f62f00975fd51e79";
const EXPECTED_R21_TREE = "0f74570e9a7c60ad63e11e2b49ae799c0fa198fc";
const ACCEPTED_R19_HEAD = "d3e5fdadf961429c6860f18bd1706fac23add9e7";
const execute = process.argv.includes("--execute-disposable-db");
const runId = crypto.randomBytes(8).toString("hex");
const containerName = `novastore-r25-r21-${runId}`;
const databaseName = `novastore_r25_r21_${runId}_test`;
const databaseUser = `r25_${runId}`;
const databasePassword = crypto.randomBytes(32).toString("base64url");
const jwtSecret = crypto.randomBytes(48).toString("base64url");
const sellerSecret = crypto.randomBytes(48).toString("base64url");
const syntheticMerchantKey = crypto.randomBytes(32).toString("base64url");
const syntheticMerchantSalt = crypto.randomBytes(32).toString("base64url");
const customerPassword = crypto.randomBytes(18).toString("base64url");
const sensitive = new Set([databasePassword, jwtSecret, sellerSecret, syntheticMerchantKey, syntheticMerchantSalt, customerPassword]);
const requireR21 = createRequire(path.join(r21Root, "package.json"));
const requireV413 = createRequire(path.join(v413Root, "package.json"));
const originalConsole = Object.fromEntries(["log", "info", "warn", "error", "debug"].map((key) => [key, console[key]]));
const backendLogs = [];
let dockerLaunchAttempted = false;
let pool;
let server;
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
let sourceHashesAtStart = {};
let clientBundlePath = "";
let clientBundleSha256 = "";
let artifactPathProven = false;
let cleanup = { serverClosed: false, poolClosed: false, containerRemoved: false };
const originalLocalStorage = globalThis.localStorage;
const webStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => webStorage.has(String(key)) ? webStorage.get(String(key)) : null,
  setItem: (key, value) => { webStorage.set(String(key), String(value)); },
  removeItem: (key) => { webStorage.delete(String(key)); },
  clear: () => { webStorage.clear(); },
  key: (index) => [...webStorage.keys()][index] ?? null,
  get length() { return webStorage.size; },
};

const originalNetwork = {
  netConnect: net.connect,
  netCreateConnection: net.createConnection,
  httpRequest: http.request,
  httpGet: http.get,
  httpsRequest: https.request,
  httpsGet: https.get,
  tlsConnect: tls.connect,
  socketConnect: net.Socket.prototype.connect,
};

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const redact = (value) => {
  let text = String(value ?? "");
  for (const secret of sensitive) if (secret) text = text.split(secret).join("[REDACTED]");
  return text;
};
const command = (program, args, { cwd = r25Root, env = process.env, timeout = 120000 } = {}) => {
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
    redirect: "error",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...(key ? { "idempotency-key": key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
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
const expectCode = async (checks, evidence, name, request, status, code) => {
  const result = await request;
  assert.equal(result.status, status, `${name} status`);
  assert.equal(result.payload.code, code, `${name} code`);
  evidence[name] = { status, code };
  checks.push(name);
  return result;
};
const expectClientCode = async (checks, evidence, name, promise, status, code) => {
  let observedError = null;
  try {
    await promise;
  } catch (error) {
    observedError = error;
  }
  assert.ok(observedError, `${name} returned false success`);
  assert.equal(observedError.status, status, `${name} status`);
  assert.equal(observedError.code, code, `${name} code`);
  evidence[name] = { status, code };
  checks.push(name);
};
const isLoopback = (host) => ["127.0.0.1", "localhost", "::1"].includes(String(host || "").replace(/^\[|\]$/gu, ""));
const socketHost = (args) => {
  const first = args[0];
  if (Array.isArray(first)) return socketHost(first);
  if (first && typeof first === "object") {
    if (typeof first.host === "string") return first.host;
    if (typeof first.hostname === "string") return first.hostname;
    if (typeof first.address === "string") return first.address;
    if (typeof first.path === "string") return "localhost";
  }
  return typeof args[1] === "string" ? args[1] : "localhost";
};
const requestHost = (args) => {
  try {
    if (typeof args[0] === "string" || args[0] instanceof URL) return new URL(args[0], publicBase || "http://127.0.0.1").hostname;
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
  net.Socket.prototype.connect = function guardedSocketConnect(...args) { const host = socketHost(args); if (!isLoopback(host)) return reject(host); return originalNetwork.socketConnect.apply(this, args); };
};
const restoreNetworkGuard = () => {
  net.connect = originalNetwork.netConnect;
  net.createConnection = originalNetwork.netCreateConnection;
  http.request = originalNetwork.httpRequest;
  http.get = originalNetwork.httpGet;
  https.request = originalNetwork.httpsRequest;
  https.get = originalNetwork.httpsGet;
  tls.connect = originalNetwork.tlsConnect;
  net.Socket.prototype.connect = originalNetwork.socketConnect;
};

async function sourceHashes(files) {
  return Object.fromEntries(await Promise.all(files.map(async (file) => [path.relative(r25Root, file).replaceAll("\\", "/"), sha256(await fsp.readFile(file))])));
}

async function proveArtifactTarget() {
  const artifactsParent = path.resolve(v413Root, "artifacts");
  assert.equal(path.resolve(artifactRoot), path.join(artifactsParent, "r25-real-r21"), "artifact target must remain the exact R25 directory");
  await fsp.mkdir(artifactsParent, { recursive: true });
  const realV413Root = await fsp.realpath(v413Root);
  const realArtifactsParent = await fsp.realpath(artifactsParent);
  assert.equal(path.relative(realV413Root, realArtifactsParent), "artifacts", "artifact parent must be a direct non-junction child of v413-ui");
  try {
    const targetStat = await fsp.lstat(artifactRoot);
    assert.equal(targetStat.isSymbolicLink(), false, "artifact target must not be a link or junction");
    const realTarget = await fsp.realpath(artifactRoot);
    assert.equal(realTarget, path.join(realArtifactsParent, "r25-real-r21"), "artifact target realpath escaped its intended parent");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  artifactPathProven = true;
}

async function loadExactAndroidClientContract() {
  let vite;
  try { vite = await import(pathToFileURL(requireV413.resolve("vite")).href); } catch {
    throw new Error("v413-ui dependencies are absent. Run `npm ci` in v413-ui before the disposable R21 harness.");
  }
  const bundlePath = path.join(artifactRoot, `r25-client-contract-${runId}.mjs`);
  await vite.build({
    root: v413Root,
    configFile: false,
    logLevel: "silent",
    build: {
      ssr: path.join(v413Root, "scripts", "r25-client-contract-entry.ts"),
      outDir: artifactRoot,
      emptyOutDir: false,
      minify: false,
      rollupOptions: { output: { entryFileNames: path.basename(bundlePath) } },
    },
  });
  clientBundlePath = bundlePath;
  clientBundleSha256 = sha256(await fsp.readFile(bundlePath));
  return import(`${pathToFileURL(bundlePath).href}?run=${runId}`);
}

async function main() {
  assert(execute, "Use --execute-disposable-db.");
  assert.equal(r21Root.toLocaleLowerCase("en-US"), expectedR21Root.toLocaleLowerCase("en-US"), "R21 root must be the exact named authority checkout.");
  const r21Identity = gitIdentity(r21Root);
  assert.deepEqual(r21Identity, { head: EXPECTED_R21_HEAD, tree: EXPECTED_R21_TREE });
  const r21StatusBefore = command("git", ["status", "--porcelain=v1"], { cwd: r21Root });
  assert.equal(r21StatusBefore, "", "R21 source must start completely clean.");
  assert.equal(command("git", ["rev-parse", `${EXPECTED_R21_HEAD}^{tree}`], { cwd: r21Root }), EXPECTED_R21_TREE);
  command("git", ["merge-base", "--is-ancestor", ACCEPTED_R19_HEAD, EXPECTED_R21_HEAD], { cwd: r21Root });
  await proveArtifactTarget();
  await fsp.rm(artifactRoot, { recursive: true, force: true });
  await fsp.mkdir(artifactRoot, { recursive: true });
  const protectedSources = [
    fileURLToPath(import.meta.url),
    path.join(v413Root, "scripts", "r25-real-r21-fixtures.mjs"),
    path.join(v413Root, "scripts", "r25-client-contract-entry.ts"),
    path.join(v413Root, "src", "adapters", "customerProductClient.ts"),
    path.join(v413Root, "src", "adapters", "customerProductContract.ts"),
    path.join(v413Root, "src", "adapters", "canonicalVariant.ts"),
    path.join(v413Root, "src", "checkout", "customerCheckoutApi.ts"),
    path.join(v413Root, "src", "checkout", "deviceCart.ts"),
    path.join(v413Root, "src", "account", "customerAccountApi.ts"),
    path.join(v413Root, "src", "notifications", "customerNotificationApi.ts"),
    path.join(v413Root, "src", "auth", "customerSession.ts"),
    path.join(v413Root, "src", "Prototype.tsx"),
    path.join(v413Root, "package-lock.json"),
  ];
  sourceHashesAtStart = await sourceHashes(protectedSources);
  dockerContextName = command("docker", ["context", "show"]);
  const contextEndpoint = command("docker", ["context", "inspect", dockerContextName, "--format", "{{(index .Endpoints \"docker\").Host}}"]);
  dockerEndpoint = String(process.env.DOCKER_HOST || contextEndpoint).trim();
  assert(/^(?:npipe|unix):\/\//u.test(dockerEndpoint), `Docker daemon must be local; rejected endpoint scheme: ${dockerEndpoint.split(":", 1)[0] || "missing"}`);
  dockerLocalEnv = { ...process.env, POSTGRES_DB: databaseName, POSTGRES_USER: databaseUser, POSTGRES_PASSWORD: databasePassword };
  for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]) delete dockerLocalEnv[key];
  dockerLaunchAttempted = true;
  dockerCommand(["run", "--pull", "never", "--rm", "--name", containerName, "-d", "-p", "127.0.0.1::5432", "-e", "POSTGRES_DB", "-e", "POSTGRES_USER", "-e", "POSTGRES_PASSWORD", "postgres:16-bookworm"]);
  const portMatch = /^127\.0\.0\.1:(\d+)$/u.exec(dockerCommand(["port", containerName, "5432/tcp"]));
  assert(portMatch, "Disposable PostgreSQL port must bind only to 127.0.0.1.");
  const port = Number(portMatch[1]);
  const connectionString = `postgresql://${databaseUser}:${encodeURIComponent(databasePassword)}@127.0.0.1:${port}/${databaseName}`;
  sensitive.add(connectionString);
  const { Client } = requireR21("pg");
  await waitForPostgres(connectionString, Client);

  const inheritedIntegrationKey = /^(?:DATABASE_URL|DB_|PAYTR_|IYZICO_|STRIPE_|SUPABASE_|AWS_|AZURE_|GOOGLE_|CLOUDINARY_|FIREBASE_|REDIS_|OPENAI_|ANTHROPIC_|RESEND_|SMTP_|MAIL_|SENTRY_|RENDER_|STOCKY_)/u;
  for (const key of Object.keys(process.env)) if (inheritedIntegrationKey.test(key)) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: "test",
    NOVASTORE_DEPLOY_ENV: "local",
    NOVASTORE_SAFE_LOCAL_BACKEND: "true",
    NOVASTORE_ALLOW_REMOTE_DB: "false",
    SKIP_SCHEMA_INIT: "true",
    NOVASTORE_ALLOW_SCHEMA_INIT: "false",
    DATABASE_URL: connectionString,
    DB_HOST: "127.0.0.1",
    DB_PORT: String(port),
    DB_NAME: databaseName,
    DB_USER: databaseUser,
    DB_PASSWORD: databasePassword,
    DB_SSL: "false",
    SUPABASE_USE_POOLER: "false",
    SUPABASE_POOLER_HOST: "",
    SUPABASE_REGION: "",
    SUPABASE_PROJECT_REF: "",
    DOTENV_CONFIG_PATH: path.join(artifactRoot, "intentionally-absent.env"),
    JWT_SECRET: jwtSecret,
    SELLER_ACCESS_TOKEN_SECRET: sellerSecret,
    NOVASTORE_NOTIFICATION_WORKER_ENABLED: "false",
    NOVASTORE_REQUEST_LOGGING_ENABLED: "false",
    PAYMENT_PROVIDER: "paytr",
    PAYTR_MERCHANT_ID: `r25-${runId}`,
    PAYTR_MERCHANT_KEY: syntheticMerchantKey,
    PAYTR_MERCHANT_SALT: syntheticMerchantSalt,
    APP_BASE_URL: "https://novastore.example",
    PAYTR_BASE_URL: "https://www.paytr.com",
    PAYTR_CALLBACK_URL: "https://novastore.example/api/payments/webhook/paytr",
    PAYTR_SUCCESS_URL: "https://novastore.example/payment-result.html",
    PAYTR_FAIL_URL: "https://novastore.example/payment-result.html",
    PAYTR_TEST_MODE: "true",
    PAYTR_DEBUG_ON: "false",
    PAYTR_LIVE_REQUESTS_ALLOWED: "true",
    NOVASTORE_REQUIRE_BUSINESS_IDENTITY_FOR_PAYMENT: "false",
    BUSINESS_LEGAL_COMPANY_NAME: "NovaStore Local Integration Test",
    BUSINESS_TRADE_NAME: "NovaStore R25 R21 Test",
    BUSINESS_TAX_VKN: "1234567890",
    BUSINESS_TAX_OFFICE: "Yerel Test Vergi Dairesi",
    BUSINESS_MERSIS_NUMBER: "1234567890123456",
    BUSINESS_REGISTERED_ADDRESS: "Yalnız yerel R25 R21 test adresi, İstanbul",
    BUSINESS_KEP_ADDRESS: "r25-r21@example.test",
    BUSINESS_PHONE: "+905550000025",
    BUSINESS_EMAIL: "r25-r21@example.test",
    CUSTOMER_PUBLIC_DOMAIN: "https://novastore.example",
    NOVASTORE_LEGAL_PRE_INFORMATION_APPROVED: "true",
    NOVASTORE_LEGAL_PRE_INFORMATION_VERSION: "r25-real-v1",
    NOVASTORE_LEGAL_PRE_INFORMATION_TEXT: "Yalnız yerel R25 R21 testi ön bilgilendirme metni.",
    NOVASTORE_LEGAL_DISTANCE_SALE_APPROVED: "true",
    NOVASTORE_LEGAL_DISTANCE_SALE_VERSION: "r25-real-v1",
    NOVASTORE_LEGAL_DISTANCE_SALE_TEXT: "Yalnız yerel R25 R21 testi mesafeli satış metni.",
    NOVASTORE_RETURN_WINDOW_DAYS: "14",
    FREE_SHIPPING_THRESHOLD: "1",
    DEFAULT_SHIPPING_FEE: "49.90",
    IYZICO_API_KEY: "",
    IYZICO_SECRET_KEY: "",
    IYZICO_BASE_URL: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
  });
  requireR21("dotenv").config = () => ({ parsed: {} });
  installNetworkGuard();
  for (const key of Object.keys(originalConsole)) console[key] = (...args) => backendLogs.push(format(...args));

  const { LOCAL_TEST_CAPABILITY } = requireR21(path.join(r21Root, "scripts", "staging-migrations", "guard.js"));
  const { loadRegistry } = requireR21(path.join(r21Root, "scripts", "staging-migrations", "registry.js"));
  const { runApply } = requireR21(path.join(r21Root, "scripts", "staging-migrations", "runner.js"));
  const registry = loadRegistry();
  assert.equal(registry.length, 40);
  assert.equal(registry.at(-1).id, "20260915_01_stocky_system_commerce");
  const migrationEnv = {
    NODE_ENV: "test",
    NOVASTORE_DEPLOY_ENV: "staging",
    NOVASTORE_STAGING_MIGRATIONS_ENABLED: "true",
    NOVASTORE_STAGING_BOOTSTRAP_ENABLED: "true",
    NOVASTORE_ALLOW_REMOTE_DB: "true",
    NOVASTORE_EXPECTED_DATABASE_HOST: "127.0.0.1",
    NOVASTORE_EXPECTED_DATABASE_NAME: databaseName,
    [LOCAL_TEST_CAPABILITY]: "true",
    DATABASE_URL: connectionString,
  };
  assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, registry.map((entry) => entry.id));
  assert.deepEqual((await runApply({ env: migrationEnv, registry, output: () => {} })).applied, []);
  const serverModule = requireR21.resolve(path.join(r21Root, "server.js"));
  requireR21.cache[serverModule] = { id: serverModule, filename: serverModule, loaded: true, exports: { io: null } };
  pool = requireR21(path.join(r21Root, "config", "db.js"));
  const ids = await seedR25Database({ pool, requireR21, r21Root, customerPassword });

  const express = requireR21("express");
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));
  app.locals.sellerDatabase = pool;
  app.use("/api/products", requireR21(path.join(r21Root, "routes", "productRoutes.js")));
  app.use("/api/campaigns", requireR21(path.join(r21Root, "routes", "campaignRoutes.js")));
  const paymentController = requireR21(path.join(r21Root, "controllers", "paymentController.js"));
  paymentTestApi = paymentController.__test;
  paymentTestApi.setPaytrIframeSessionRequester(async ({ payload, config }) => {
    providerRequesterCalls += 1;
    const token = `local_${sha256(payload.merchant_oid).slice(0, 24)}`;
    return Object.freeze({
      type: "iframe",
      token,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${token}`,
      successUrl: payload.merchant_ok_url,
      failUrl: payload.merchant_fail_url,
    });
  });
  app.use("/api/payments", requireR21(path.join(r21Root, "routes", "paymentRoutes.js")));
  app.use("/api/users", requireR21(path.join(r21Root, "routes", "userRoutes.js")));
  app.use("/api/addresses", requireR21(path.join(r21Root, "routes", "addressRoutes.js")));
  app.use("/api/orders", requireR21(path.join(r21Root, "routes", "orderRoutes.js")));
  app.use("/api/returns", requireR21(path.join(r21Root, "routes", "returnRoutes.js")));
  app.get("/r25-product.svg", (_req, res) => res.type("image/svg+xml").send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#eee"/></svg>'));
  server = await new Promise((resolve) => { const listener = app.listen(0, "127.0.0.1", () => resolve(listener)); });
  publicBase = `http://127.0.0.1:${server.address().port}`;
  const clientPurchaseRequests = [];
  originalFetch = global.fetch;
  global.fetch = async (input, options) => {
    const raw = typeof input === "string" || input instanceof URL ? input : input?.url;
    const parsed = new URL(raw, publicBase);
    if (!isLoopback(parsed.hostname)) {
      outboundBackendAttempts += 1;
      throw new Error("Non-loopback network is forbidden by the R25 real-R21 harness.");
    }
    if (
      options?.method === "POST"
      && ["/api/payments/agreements/preview", "/api/payments/initialize"].includes(parsed.pathname)
      && typeof options.body === "string"
    ) {
      clientPurchaseRequests.push({ path: parsed.pathname, body: JSON.parse(options.body) });
    }
    return originalFetch(parsed, { ...options, redirect: "error" });
  };

  const client = await loadExactAndroidClientContract();
  const checkout = client.customerCheckoutApiTestUtils;
  assert.equal(typeof client.loadCanonicalProductDetail, "function");
  assert.equal(typeof client.normalizeCanonicalProductDetail, "function");
  assert.equal(typeof checkout.canonicalCartItems, "function");
  assert.equal(typeof checkout.requestBody, "function");
  assert.equal(typeof checkout.createCustomerPaymentInitializeBody, "function");
  assert.equal(typeof client.previewCustomerCheckout, "function");
  assert.equal(typeof client.initializeCustomerPayment, "function");
  assert.equal(typeof client.listCustomerOrders, "function");
  assert.equal(typeof client.createCustomerReturn, "function");
  assert.equal(typeof client.listCustomerReturns, "function");
  assert.equal(typeof client.getCustomerReturn, "function");

  const checks = [];
  const evidence = { clientContract: {}, negatives: {}, stale: {}, orderSnapshot: {}, returns: {} };
  const androidUser = await client.loginCustomer(ids.email, customerPassword);
  assert.equal(androidUser.id, ids.customerId);
  const androidSession = client.currentCustomerSession();
  assert.ok(androidSession?.accessToken);
  sensitive.add(androidSession.accessToken);
  if (androidSession.refreshToken) sensitive.add(androidSession.refreshToken);
  check(checks, "exact Android authentication client establishes the disposable R21 customer session");

  const androidPdp = await client.loadCanonicalProductDetail(ids.variantProductId);
  assert.equal(androidPdp.id, ids.variantProductId);
  assert.equal(androidPdp.variantSelectionRequired, true);
  assert.deepEqual(androidPdp.variants.map((row) => row.id), [ids.variantM, ids.variantL, ids.zeroVariant]);
  assert.deepEqual(androidPdp.variants.map((row) => row.price), [100, 150.75, 180]);
  assert.deepEqual(androidPdp.variants.map((row) => row.availableStock), [4, 3, 0]);
  assert.deepEqual(androidPdp.variants[0].selections, [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }]);
  check(checks, "exact Android product client normalizes real R21 canonical variant detail");
  assert.equal(androidPdp.description, "Gerçek R21 varyant sözleşmesi ve kalıcı açıklaması.");
  assert.deepEqual(androidPdp.attributes, ids.expectedAttributes);
  assert.deepEqual(androidPdp.attributes.map(({ type }) => type), ["text", "number", "boolean", "option", "multi_option", "range"]);
  check(checks, "exact Android product client preserves real R21 description and all six canonical feature value shapes");
  evidence.productDetail = { description: androidPdp.description, attributes: androidPdp.attributes };
  const simplePdp = await client.loadCanonicalProductDetail(ids.simpleProductId);
  assert.equal(simplePdp.variantSelectionRequired, false);
  assert.equal(simplePdp.variants, null);
  check(checks, "exact Android product client preserves real R21 simple-product detail");

  const androidCartInput = [
    { id: ids.variantProductId, variantId: ids.variantM, quantity: 1, name: "ignored display", image: "/ignored.svg" },
    { id: ids.simpleProductId, quantity: 1, name: "ignored display", image: "/ignored.svg" },
  ];
  const canonicalLines = checkout.canonicalCartItems(androidCartInput);
  assert.deepEqual(canonicalLines, [
    { product_id: ids.variantProductId, variant_id: ids.variantM, quantity: 1 },
    { product_id: ids.simpleProductId, quantity: 1 },
  ]);
  assert.deepEqual(canonicalLines.map((line) => Object.keys(line).sort()), [
    ["product_id", "quantity", "variant_id"],
    ["product_id", "quantity"],
  ]);
  check(checks, "exact Android transformer emits only product_id, variant_id, and quantity authority");
  const duplicateLines = checkout.canonicalCartItems([
    { id: ids.variantProductId, variantId: ids.variantM, quantity: 1 },
    { id: ids.variantProductId, variantId: ids.variantL, quantity: 1 },
    { id: ids.variantProductId, variantId: ids.variantM, quantity: 2 },
  ]);
  assert.deepEqual(duplicateLines, [
    { product_id: ids.variantProductId, variant_id: ids.variantM, quantity: 3 },
    { product_id: ids.variantProductId, variant_id: ids.variantL, quantity: 1 },
  ]);
  check(checks, "exact Android transformer aggregates same variant and separates sibling variants");
  const previewBody = checkout.requestBody({ addressId: ids.addressId, cartItems: androidCartInput, couponCode: null });
  assert.deepEqual(previewBody.cartItems, canonicalLines);
  const quote = await jsonRequest("/api/campaigns/quote", { method: "POST", body: { cartItems: canonicalLines, couponCode: null } });
  assert.equal(quote.status, 200);
  assert.deepEqual(quote.payload.items.map((row) => row.variant_id || null), [ids.variantM, null]);
  assert.deepEqual(quote.payload.items.map((row) => Number(row.price)), [100, 80]);
  check(checks, "real R21 quote accepts the exact Android cart transformer output");

  const forged = canonicalLines.map((line) => ({ ...line, price: 1, stock: 9999, store_id: 999999, sku: "FORGED" }));
  const forgedQuote = await jsonRequest("/api/campaigns/quote", { method: "POST", body: { cartItems: forged } });
  assert.equal(forgedQuote.status, 200);
  assert.deepEqual(forgedQuote.payload.items.map((row) => ({ variantId: row.variant_id || null, price: Number(row.price) })), [
    { variantId: ids.variantM, price: 100 },
    { variantId: null, price: 80 },
  ]);
  check(checks, "real R21 ignores forged client price, stock, store, and SKU fields");

  const negativeCases = [
    ["missing required variant", { product_id: ids.variantProductId, quantity: 1 }, 400, "VARIANT_REQUIRED"],
    ["malformed variant", { product_id: ids.variantProductId, variant_id: "01", quantity: 1 }, 400, "VARIANT_ID_INVALID"],
    ["foreign-product variant", { product_id: ids.variantProductId, variant_id: ids.foreignVariant, quantity: 1 }, 409, "VARIANT_NOT_PURCHASABLE"],
    ["disabled variant", { product_id: ids.variantProductId, variant_id: ids.disabledVariant, quantity: 1 }, 409, "VARIANT_NOT_PURCHASABLE"],
    ["deleted variant", { product_id: ids.variantProductId, variant_id: ids.deletedVariant, quantity: 1 }, 409, "VARIANT_NOT_PURCHASABLE"],
    ["unpublished variant", { product_id: ids.variantProductId, variant_id: ids.unpublishedVariant, quantity: 1 }, 409, "VARIANT_NOT_PURCHASABLE"],
    ["out-of-stock variant", { product_id: ids.variantProductId, variant_id: ids.zeroVariant, quantity: 1 }, 409, "VARIANT_STOCK_UNAVAILABLE"],
    ["variant on simple product", { product_id: ids.simpleProductId, variant_id: ids.variantM, quantity: 1 }, 400, "VARIANT_NOT_ALLOWED"],
  ];
  for (const [name, line, status, code] of negativeCases) {
    await expectCode(checks, evidence.negatives, name, jsonRequest("/api/campaigns/quote", { method: "POST", body: { cartItems: [line] } }), status, code);
  }

  await pool.query("UPDATE seller_offer_variants SET deleted_at=NOW(),revision=revision+1 WHERE id=$1", [ids.variantL]);
  await expectCode(checks, evidence.negatives, "variant removed PDP to cart", jsonRequest("/api/campaigns/quote", {
    method: "POST",
    body: { cartItems: [{ product_id: ids.variantProductId, variant_id: ids.variantL, quantity: 1 }] },
  }), 409, "VARIANT_NOT_PURCHASABLE");
  await pool.query("UPDATE seller_offer_variants SET deleted_at=NULL,revision=revision+1 WHERE id=$1", [ids.variantL]);

  const cartToCheckoutInput = [{ id: ids.variantProductId, variantId: ids.variantL, quantity: 1 }];
  const cartToCheckoutBody = checkout.requestBody({ addressId: ids.addressId, cartItems: cartToCheckoutInput, couponCode: null });
  const cartToCheckoutPreview = await client.previewCustomerCheckout({ addressId: ids.addressId, cartItems: cartToCheckoutInput, couponCode: null });
  await pool.query("UPDATE seller_offer_variants SET deleted_at=NOW(),revision=revision+1 WHERE id=$1", [ids.variantL]);
  await expectClientCode(checks, evidence.negatives, "variant removed cart to checkout", client.initializeCustomerPayment({
    addressId: ids.addressId,
    cartItems: cartToCheckoutInput,
    couponCode: null,
    preview: cartToCheckoutPreview,
    acceptedSlugs: cartToCheckoutPreview.documents.map((document) => document.slug),
    idempotencyKey: `android-r25-removed-${runId}`,
  }), 409, "VARIANT_NOT_PURCHASABLE");
  assert.equal(providerRequesterCalls, 0);
  await pool.query("UPDATE seller_offer_variants SET deleted_at=NULL,revision=revision+1 WHERE id=$1", [ids.variantL]);

  const previewStock = await client.previewCustomerCheckout({ addressId: ids.addressId, cartItems: androidCartInput, couponCode: null });
  await pool.query("UPDATE seller_inventory_items SET quantity=0,revision=revision+1,updated_at=NOW() WHERE variant_id=$1", [ids.variantM]);
  await expectClientCode(checks, evidence.stale, "stale variant stock", client.initializeCustomerPayment({
    addressId: ids.addressId,
    cartItems: androidCartInput,
    couponCode: null,
    preview: previewStock,
    acceptedSlugs: previewStock.documents.map((document) => document.slug),
    idempotencyKey: `android-r25-stock-${runId}`,
  }), 409, "VARIANT_STOCK_UNAVAILABLE");
  assert.equal(providerRequesterCalls, 0);
  await pool.query("UPDATE seller_inventory_items SET quantity=4,revision=revision+1,updated_at=NOW() WHERE variant_id=$1", [ids.variantM]);

  const previewP1 = await client.previewCustomerCheckout({ addressId: ids.addressId, cartItems: androidCartInput, couponCode: null });
  await pool.query("UPDATE seller_offer_variants SET price_minor=12500,revision=revision+1,updated_at=NOW() WHERE id=$1", [ids.variantM]);
  await expectClientCode(checks, evidence.stale, "stale variant price and legal snapshot", client.initializeCustomerPayment({
    addressId: ids.addressId,
    cartItems: androidCartInput,
    couponCode: null,
    preview: previewP1,
    acceptedSlugs: previewP1.documents.map((document) => document.slug),
    idempotencyKey: `android-r25-price-${runId}`,
  }), 409, "CHECKOUT_AGREEMENT_SNAPSHOT_STALE");
  assert.equal(providerRequesterCalls, 0);
  const previewP2 = await client.previewCustomerCheckout({ addressId: ids.addressId, cartItems: androidCartInput, couponCode: null });
  assert.notEqual(previewP2.snapshotSha256, previewP1.snapshotSha256);
  assert.equal(previewP2.quote.items.find((item) => item.variantId === ids.variantM).price, 125);
  check(checks, "real R21 re-prices Android cart and changes the legal snapshot");
  const acceptedInitializeBody = checkout.createCustomerPaymentInitializeBody({
    addressId: ids.addressId,
    cartItems: androidCartInput,
    couponCode: null,
    preview: previewP2,
    acceptedSlugs: previewP2.documents.map((document) => document.slug),
    idempotencyKey: `android-r25-accepted-${runId}`,
  });
  assert.deepEqual(acceptedInitializeBody.cartItems, canonicalLines);
  const accepted = await client.initializeCustomerPayment({
    addressId: ids.addressId,
    cartItems: androidCartInput,
    couponCode: null,
    preview: previewP2,
    acceptedSlugs: previewP2.documents.map((document) => document.slug),
    idempotencyKey: `android-r25-accepted-${runId}`,
  });
  assert.equal(accepted.paymentStatus, "REQUIRES_ACTION");
  assert.match(accepted.paymentActionUrl, /^https:\/\/www\.paytr\.com\/odeme\/guvenli\/local_/u);
  assert.equal(providerRequesterCalls, 1);
  check(checks, "exact Android preview and initialize clients accept real R21 response contracts and one local REQUIRES_ACTION handoff");

  const orderId = accepted.orderId;
  const androidOrderBeforeMutation = (await client.listCustomerOrders(ids.customerId)).find((row) => row.id === orderId);
  assert.ok(androidOrderBeforeMutation);
  assert.equal(androidOrderBeforeMutation.items.find((item) => item.variantId === ids.variantM).sku, "R25-RED-M");
  const historicalVariant = androidOrderBeforeMutation.items.find((item) => item.variantId === ids.variantM);
  assert.deepEqual({ sku: historicalVariant.sku, selections: historicalVariant.variantSelections, price: historicalVariant.price }, {
    sku: "R25-RED-M",
    selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }],
    price: 125,
  });
  await pool.query(
    "UPDATE seller_offer_variants SET seller_sku='R25-MUTATED-LIVE',selections=$2::jsonb,price_minor=99900,revision=revision+1,updated_at=NOW() WHERE id=$1",
    [ids.variantM, JSON.stringify([{ group: "Renk", value: "Değişmiş" }, { group: "Beden", value: "XXL" }])],
  );
  const androidOrderAfterMutation = (await client.listCustomerOrders(ids.customerId)).find((row) => row.id === orderId);
  assert.ok(androidOrderAfterMutation);
  const androidPreservedVariant = androidOrderAfterMutation.items.find((item) => item.variantId === ids.variantM);
  assert.deepEqual({ sku: androidPreservedVariant.sku, selections: androidPreservedVariant.variantSelections, price: androidPreservedVariant.price }, {
    sku: "R25-RED-M",
    selections: [{ group: "Renk", value: "Kırmızı" }, { group: "Beden", value: "M" }],
    price: 125,
  });
  check(checks, "exact Android order normalizer preserves real R21 immutable variant SKU, labels, and price after live mutation");
  evidence.orderSnapshot = { orderId, variantId: ids.variantM, sku: androidPreservedVariant.sku, selections: androidPreservedVariant.variantSelections, price: androidPreservedVariant.price };

  await pool.query(
    "UPDATE orders SET status='Teslim Edildi',payment_status='PAID',delivered_at=NOW(),updated_at=NOW() WHERE id=$1",
    [orderId],
  );
  const createdReturn = await client.createCustomerReturn(orderId, "NOT_AS_DESCRIBED", "R25 yalnız yerel order-level varyant iade regresyonu.");
  assert.equal(createdReturn.reused, false);
  const returnId = createdReturn.return.id;
  const returnHistory = await client.listCustomerReturns();
  const returnDetail = await client.getCustomerReturn(returnId);
  assert.ok(returnHistory.some((row) => row.id === returnId && row.orderId === orderId));
  assert.equal(returnDetail.orderId, orderId);
  await pool.query(
    "UPDATE returns SET status='REJECTED',decision_note='R25 disposable ret kararı',decided_at=NOW(),revision=revision+1,updated_at=NOW() WHERE id=$1",
    [returnId],
  );
  await pool.query("UPDATE orders SET refund_status='REJECTED',updated_at=NOW() WHERE id=$1", [orderId]);
  const rejectedHistory = await client.listCustomerReturns();
  const rejectedDetail = await client.getCustomerReturn(returnId);
  assert.ok(rejectedHistory.some((row) => row.id === returnId && row.status === "REJECTED"));
  assert.equal(rejectedDetail.status, "REJECTED");
  assert.equal(rejectedDetail.refundStatus, "REJECTED");
  check(checks, "exact Android return clients accept real R21 create, history, exact detail, and rejected order-level responses");
  evidence.returns = { orderLevel: true, returnId, createdStatus: "REQUESTED", finalStatus: "REJECTED", exactDetail: true };

  const orders = (await pool.query("SELECT id,items,total_amount,payment_status FROM orders WHERE user_id=$1 ORDER BY id", [ids.customerId])).rows;
  assert.equal(orders.length, 1, "all rejected stale and tampered attempts must create no durable order");
  assert.equal(Number(orders[0].id), orderId);
  assert.equal(Number(orders[0].total_amount), 205);
  const inventory = await pool.query("SELECT variant_id,quantity FROM seller_inventory_items WHERE variant_id=ANY($1::bigint[]) ORDER BY variant_id", [[ids.variantM, ids.variantL, ids.zeroVariant]]);
  assert.equal(Number(inventory.rows.find((row) => Number(row.variant_id) === ids.variantM).quantity), 3);
  assert.equal(Number(inventory.rows.find((row) => Number(row.variant_id) === ids.variantL).quantity), 3);
  assert.equal(Number(inventory.rows.find((row) => Number(row.variant_id) === ids.zeroVariant).quantity), 0);
  assert.equal(providerRequesterCalls, 1);
  assert.equal(outboundBackendAttempts, 0);
  assert.equal(clientPurchaseRequests.filter((request) => request.path === "/api/payments/agreements/preview").length, 4);
  assert.equal(clientPurchaseRequests.filter((request) => request.path === "/api/payments/initialize").length, 4);
  for (const request of clientPurchaseRequests) {
    assert.ok(request.body.cartItems.every((line) => {
      const keys = Object.keys(line).sort().join(",");
      return keys === "product_id,quantity" || keys === "product_id,quantity,variant_id";
    }));
  }
  assert.deepEqual(clientPurchaseRequests.at(-1).body.cartItems, canonicalLines);
  assert.equal(clientPurchaseRequests.at(-1).body.agreementSnapshotSha256, previewP2.snapshotSha256);
  check(checks, "captured production Android preview and initialize requests retain exact canonical authority fields");
  check(checks, "all negative cases fail before provider and durable-order creation");
  check(checks, "the deterministic provider requester makes no network call or settlement");

  const hashesAtEnd = await sourceHashes(protectedSources);
  assert.deepEqual(hashesAtEnd, sourceHashesAtStart, "R25 harness or exact Android client source changed during the run");
  assert.equal(sha256(await fsp.readFile(clientBundlePath)), clientBundleSha256, "built exact Android client bundle changed during the run");
  assert.deepEqual(gitIdentity(r21Root), r21Identity, "R21 HEAD/tree changed during the run");
  assert.equal(command("git", ["status", "--porcelain=v1"], { cwd: r21Root }), r21StatusBefore, "R21 worktree/index changed during the run");
  evidence.clientContract = {
    productApi: "src/adapters/customerProductClient.ts#loadCanonicalProductDetail",
    productNormalizer: "src/adapters/customerProductContract.ts#normalizeCanonicalProductDetail",
    checkoutTransformer: "src/checkout/customerCheckoutApi.ts#customerCheckoutApiTestUtils",
    checkoutResponseClients: "src/checkout/customerCheckoutApi.ts#previewCustomerCheckout+initializeCustomerPayment",
    orderReturnClients: "src/account/customerAccountApi.ts#listCustomerOrders+createCustomerReturn+listCustomerReturns+getCustomerReturn",
    canonicalLineKeys: canonicalLines.map((line) => Object.keys(line).sort()),
    productionRequestCounts: { preview: 4, initialize: 4 },
  };
  runOutcome = {
    result: "PASS",
    scope: "exact R25 Customer Android client contract + immutable real R21 critical controllers + disposable PostgreSQL",
    identities: { r21: { ...r21Identity, path: r21Root }, r21StatusBefore, r21StatusAfter: r21StatusBefore, r25: gitIdentity(r25Root), sourceSha256: sourceHashesAtStart, exactClientBundleSha256: clientBundleSha256 },
    database: { image: "postgres:16-bookworm", dockerContext: dockerContextName, dockerEndpoint, loopbackOnly: true, migrationsApplied: registry.length, migrationNoopPass: true },
    providerBoundary: { deterministicRequesterCalls: providerRequesterCalls, externalProviderCalls: 0, settlementSimulated: false, backendNonLoopbackAttempts: outboundBackendAttempts, inheritedIntegrationEnvScrubbed: true, dotenvLoadingBlocked: true },
    counters: {
      clientVariantPriceAuthority: 0,
      clientVariantStockAuthority: 0,
      clientSelectedStoreAuthority: 0,
      variantCartCollisionCount: 0,
      variantLegalBypassCount: 0,
      staleVariantPriceFalseSuccess: 0,
      staleVariantStockFalseSuccess: 0,
      variantIdTamperFalseSuccess: 0,
      secretExposureCount: 0,
      productionWriteCount: 0,
      providerCallCount: 0,
    },
    applicability: { rawHtmlVariantLabelRendering: "NOT_APPLICABLE_TO_NATIVE_BACKEND_HARNESS" },
    securityReview: {
      measuredByHarness: false,
      assessment: "bounded independent source review",
      highFindingCount: 0,
      mediumFindingCount: 0,
      reviewedAreas: ["artifact path containment", "secret redaction", "environment scrubbing", "network/provider boundary", "owned-resource cleanup", "client/server authority fields"],
    },
    checks,
    evidence,
  };
}

main().catch((error) => {
  runError = error;
  originalConsole.error(`r25 real-R21 backend FAIL: ${redact(error.stack || error.message)}`);
  process.exitCode = 1;
}).finally(async () => {
  for (const [key, value] of Object.entries(originalConsole)) console[key] = value;
  global.fetch = originalFetch;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  if (paymentTestApi?.resetPaytrIframeSessionRequester) paymentTestApi.resetPaytrIframeSessionRequester();
  const cleanupErrors = [];
  if (!server) cleanup.serverClosed = true;
  else try { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); cleanup.serverClosed = true; } catch (error) { cleanupErrors.push(`server: ${redact(error.message)}`); }
  if (!pool) cleanup.poolClosed = true;
  else try { await pool.end(); cleanup.poolClosed = true; } catch (error) { cleanupErrors.push(`pool: ${redact(error.message)}`); }
  restoreNetworkGuard();
  if (!dockerLaunchAttempted) cleanup.containerRemoved = true;
  if (dockerLaunchAttempted) {
    assert(/^novastore-r25-r21-[a-f0-9]{16}$/u.test(containerName));
    try {
      const beforeRemoval = dockerCommand(["ps", "-a", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"], { timeout: 30000 });
      if (beforeRemoval) {
        assert.equal(beforeRemoval, containerName, "Docker name filter returned an unexpected container");
        dockerCommand(["rm", "-f", containerName]);
      }
      const remaining = dockerCommand(["ps", "-a", "--filter", `name=^/${containerName}$`, "--format", "{{.Names}}"], { timeout: 30000 });
      cleanup.containerRemoved = remaining === "";
      if (!cleanup.containerRemoved) throw new Error("owned disposable PostgreSQL container still exists after cleanup");
    } catch (error) { cleanupErrors.push(`container: ${redact(error.message)}`); }
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
    assert(artifactPathProven, "artifact path was not proven safe; refusing to write an artifact");
    await fsp.mkdir(artifactRoot, { recursive: true });
    await fsp.rm(path.join(artifactRoot, pass ? "failure.json" : "result.json"), { force: true });
    await fsp.writeFile(path.join(artifactRoot, pass ? "result.json" : "failure.json"), serialized, "utf8");
    if (pass) {
      originalConsole.log(`PASS exact Android + real R21 backend E2E (${runOutcome.checks.length} checks)`);
      originalConsole.log(`Evidence: ${path.join(artifactRoot, "result.json")}`);
    }
  } catch (error) {
    originalConsole.error(`r25 artifact finalization FAIL: ${redact(error.stack || error.message)}`);
    process.exitCode = 1;
  }
});
