import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
Object.assign(process.env, {
  NODE_ENV: "test",
  JWT_SECRET: "seller-application-summary-privacy-smoke-secret",
  DATABASE_URL: "postgresql://novastore_privacy:novastore_privacy_only@127.0.0.1:55432/novastore_privacy",
  DB_SSL: "false",
  NOVASTORE_SAFE_LOCAL_BACKEND: "true",
  NOVASTORE_ALLOW_REMOTE_DB: "false",
  SKIP_SCHEMA_INIT: "true",
  NOVASTORE_ALLOW_SCHEMA_INIT: "false",
  SUPABASE_USE_POOLER: "false",
  SUPABASE_POOLER_HOST: "",
  SUPABASE_REGION: "",
  SUPABASE_PROJECT_REF: "",
});

const { authenticate, requireAdmin } = require("../middlewares/authMiddleware");
const { privateNoStore } = require("../middlewares/privateNoStore");
const { createRequireCurrentAdmin } = require("../services/currentAdminGuard");
const { createAuthSessionFixture } = require("./helpers/createAuthSessionFixture");
const {
  createGetAdminStoreDetail,
  createGetAdminStoreSummaries,
} = require("../services/adminCommerceReadService");
const {
  normalizeAdminStoreDetail,
  normalizeAdminStoreSummaryPage,
} = await import("../admin-commerce-pro/src/integration/storeRead.js");

const OWNER_CANARY = "PRIVATE_OWNER_KARTAL_73";
const CATEGORY_CANARY = "PRIVATE_CATEGORY_LALE_51";
const FINANCE_CANARY = "PRIVATE_COMMISSION_19";
const authFixture = createAuthSessionFixture();
authFixture.install();

const tokenFor = ({ id, role }) => authFixture.issue({
  userId: id,
  role,
  principal: role === "admin" ? "admin" : "customer",
}).token;

const createResponse = () => ({
  statusCode: 200,
  payload: null,
  headers: {},
  status(code) { this.statusCode = code; return this; },
  json(value) { this.payload = value; return this; },
  setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
});

const runChain = async (handlers, request) => {
  const response = createResponse();
  const dispatch = async (index) => {
    if (index >= handlers.length) return;
    let continuation;
    const next = () => {
      continuation = dispatch(index + 1);
      return continuation;
    };
    await handlers[index](request, response, next);
    if (continuation) await continuation;
  };
  await dispatch(0);
  return response;
};

const summaryRow = {
  id: 73,
  store_name: "Lale Tasarım",
  is_active: true,
  product_count: 12,
  customer_visible_product_count: 8,
  created_at: "2026-08-01T08:00:00.000Z",
  updated_at: "2026-08-08T09:00:00.000Z",
  owner_name: OWNER_CANARY,
  category_name: CATEGORY_CANARY,
  commission: FINANCE_CANARY,
};

const summaryQueries = [];
const summaryHandler = createGetAdminStoreSummaries({
  async query(sql, params) {
    summaryQueries.push({ sql, params });
    return { rows: [summaryRow] };
  },
});
const summaryResponse = createResponse();
await summaryHandler({ query: { limit: "100" } }, summaryResponse);
assert.equal(summaryResponse.statusCode, 200);
assert.deepEqual(Object.keys(summaryResponse.payload.items[0]).sort(), [
  "createdAt",
  "customerVisibleProductCount",
  "id",
  "operationalStatus",
  "productCount",
  "storeName",
  "updatedAt",
]);
assert.equal(summaryResponse.payload.items[0].storeName, "Lale Tasarım");
assert.equal(summaryResponse.payload.items[0].operationalStatus, "active");
assert.equal(summaryResponse.payload.hasMore, false);
const serializedSummary = JSON.stringify(summaryResponse.payload);
for (const canary of [OWNER_CANARY, CATEGORY_CANARY, FINANCE_CANARY]) {
  assert.equal(serializedSummary.includes(canary), false, `summary leaked ${canary}`);
}
assert.deepEqual(summaryQueries[0].params, ["novastore-platform", 101]);
assert.doesNotMatch(summaryQueries[0].sql, /\busers\b|\bcategories\b|\borders\b|commission|revenue|gmv|total_amount|\bSUM\s*\(/i);
assert.match(summaryQueries[0].sql, /LOWER\(store\.slug\) <> LOWER\(\$1\)/i);

const normalizedSummary = normalizeAdminStoreSummaryPage(summaryResponse.payload);
assert.equal(normalizedSummary.items[0].storeName, "Lale Tasarım");
assert.throws(
  () => normalizeAdminStoreSummaryPage({
    ...summaryResponse.payload,
    items: [{ ...summaryResponse.payload.items[0], ownerName: OWNER_CANARY }],
  }),
  /izin verilmeyen alan/,
);
assert.throws(
  () => normalizeAdminStoreSummaryPage({
    ...summaryResponse.payload,
    items: [{ ...summaryResponse.payload.items[0], categoryName: CATEGORY_CANARY }],
  }),
  /izin verilmeyen alan/,
);

const detailQueries = [];
const detailHandler = createGetAdminStoreDetail({
  async query(sql, params) {
    detailQueries.push({ sql, params });
    if (/SELECT DISTINCT category\.id/i.test(sql)) {
      return { rows: [{ id: 4, name: CATEGORY_CANARY }] };
    }
    return { rows: [{ ...summaryRow, owner_name: OWNER_CANARY }] };
  },
});
const detailResponse = createResponse();
await detailHandler({ params: { id: "73" } }, detailResponse);
assert.equal(detailResponse.statusCode, 200);
assert.equal(detailResponse.payload.ownerName, OWNER_CANARY);
assert.equal(detailResponse.payload.catalogCategories[0].name, CATEGORY_CANARY);
assert.equal(JSON.stringify(detailResponse.payload).includes(FINANCE_CANARY), false);
assert.deepEqual(detailQueries[0].params, [73, "novastore-platform"]);
assert.deepEqual(detailQueries[1].params, [73]);
const normalizedDetail = normalizeAdminStoreDetail(detailResponse.payload);
assert.equal(normalizedDetail.ownerName, OWNER_CANARY);
assert.equal(normalizedDetail.catalogCategories[0].name, CATEGORY_CANARY);

let invalidIdQueries = 0;
const invalidIdResponse = createResponse();
await createGetAdminStoreDetail({ async query() { invalidIdQueries += 1; return { rows: [] }; } })(
  { params: { id: "73junk" } },
  invalidIdResponse,
);
assert.equal(invalidIdResponse.statusCode, 400);
assert.equal(invalidIdQueries, 0);

const missingResponse = createResponse();
await createGetAdminStoreDetail({ async query() { return { rows: [] }; } })(
  { params: { id: "999" } },
  missingResponse,
);
assert.equal(missingResponse.statusCode, 404);

const sensitiveError = new Error(`${OWNER_CANARY}:${CATEGORY_CANARY}`);
const logged = [];
const originalConsoleError = console.error;
console.error = (...values) => logged.push(values.join(" "));
try {
  const failingResponse = createResponse();
  await createGetAdminStoreSummaries({ async query() { throw sensitiveError; } })(
    { query: {} },
    failingResponse,
  );
  assert.equal(failingResponse.statusCode, 500);
} finally {
  console.error = originalConsoleError;
}
assert.equal(logged.some((entry) => entry.includes(OWNER_CANARY) || entry.includes(CATEGORY_CANARY)), false);

let guardedQueries = 0;
const guardedSummary = createGetAdminStoreSummaries({
  async query() { guardedQueries += 1; return { rows: [summaryRow] }; },
});
const currentAdminGuard = createRequireCurrentAdmin({
  async query() { return { rows: [{ id: 17, role: "admin", auth_enabled: true }] }; },
});
const chain = [privateNoStore, authenticate, requireAdmin, currentAdminGuard, guardedSummary];

const noToken = await runChain(chain, { headers: {}, query: {} });
assert.equal(noToken.statusCode, 401);
assert.equal(guardedQueries, 0);
const customer = await runChain(chain, {
  headers: { authorization: `Bearer ${tokenFor({ id: 9, role: "customer" })}` },
  query: {},
});
assert.equal(customer.statusCode, 401);
assert.equal(guardedQueries, 0);
const demoted = await runChain([
  privateNoStore,
  authenticate,
  requireAdmin,
  createRequireCurrentAdmin({ async query() { return { rows: [{ id: 17, role: "customer", auth_enabled: true }] }; } }),
  guardedSummary,
], {
  headers: { authorization: `Bearer ${tokenFor({ id: 17, role: "admin" })}` },
  query: {},
});
assert.equal(demoted.statusCode, 403);
assert.equal(guardedQueries, 0);
const validAdmin = await runChain(chain, {
  headers: { authorization: `Bearer ${tokenFor({ id: 17, role: "admin" })}` },
  query: {},
});
assert.equal(validAdmin.statusCode, 200);
assert.equal(validAdmin.headers["cache-control"], "private, no-store, max-age=0");
assert.equal(guardedQueries, 1);

const routeSource = fs.readFileSync(path.join(root, "routes", "adminRoutes.js"), "utf8");
assert.match(routeSource, /integratedAdminRead = \[privateNoStore, authenticate, requireAdmin, requireCurrentAdmin\]/);
assert.match(routeSource, /router\.get\('\/stores\/summary', \.\.\.integratedAdminRead, getAdminStoreSummaries\)/);
assert.match(routeSource, /router\.get\('\/stores\/:id', \.\.\.integratedAdminRead, getAdminStoreDetail\)/);

const integratedSource = fs.readFileSync(path.join(root, "admin-commerce-pro", "src", "IntegratedApp.jsx"), "utf8");
assert.match(integratedSource, /selectedStoreId, setSelectedStoreId/);
assert.match(integratedSource, /enabled: storesEnabled && selectedStoreId !== null, preserveDataOnError: false/);
assert.match(integratedSource, /selectedStore && <StoreDetailDialog/);
const summaryComponentSource = integratedSource.slice(
  integratedSource.indexOf("function SellerApplications"),
  integratedSource.indexOf("const railItems"),
);
assert.doesNotMatch(
  summaryComponentSource,
  /ownerName|catalogCategories/,
);

console.log("STORE_NAME_VISIBLE=YES");
console.log("OWNER_NAME_VISIBLE_IN_SUMMARY=NO");
console.log("CATEGORY_VISIBLE_IN_SUMMARY=NO");
console.log("OWNER_NAME_VISIBLE_IN_AUTHORIZED_DETAIL=YES");
console.log("CATEGORY_VISIBLE_IN_AUTHORIZED_DETAIL=YES");
console.log("SUMMARY_API_OWNER_NAME_FIELD_PRESENT=NO");
console.log("SUMMARY_API_CATEGORY_FIELD_PRESENT=NO");
console.log("FABRICATED_FINANCIAL_METRIC_COUNT=0");
console.log("SELLER_APPLICATION_SUMMARY_PRIVACY_SMOKE=PASS");
