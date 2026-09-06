import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSameOriginAdapter } from "../src/adapters/sameOriginAdapter.js";
import { normalizeReturnDetail, normalizeReturnSummaryPage } from "../src/integration/legacyMappers.js";

const returnRow = (overrides = {}) => ({
  id: 101,
  order_id: 202,
  reason_code: "DAMAGED",
  note: "<img src=x onerror=alert(1)>",
  status: "REQUESTED",
  refund_amount: "349.90",
  revision: 3,
  decision_note: null,
  decided_at: null,
  created_at: "2026-09-06T08:00:00.000Z",
  updated_at: "2026-09-06T08:05:00.000Z",
  order_status: "Teslim Edildi",
  payment_status: "PAID",
  refund_status: "REQUESTED",
  currency: "TRY",
  customer_name: "Müşteri 101",
  ...overrides,
});

const page = normalizeReturnSummaryPage({
  items: [returnRow()],
  limit: 100,
  hasMore: true,
  nextCursor: "opaque+/cursor=",
});
assert.equal(page.items[0].rawId, 101);
assert.equal(page.nextCursor, "opaque+/cursor=");
assert.throws(() => normalizeReturnSummaryPage({ ...page, items: [returnRow()], nextCursor: null }), /nextCursor/);
assert.throws(() => normalizeReturnSummaryPage({ ...page, items: [returnRow()], hasMore: false }), /nextCursor/);

const detail = normalizeReturnDetail(returnRow());
assert.equal(detail.note, "<img src=x onerror=alert(1)>");
assert.equal(detail.revision, 3);
assert.equal(detail.refundStatus, "REQUESTED");
assert.throws(() => normalizeReturnDetail({ ...returnRow(), note: undefined }), /return.note/);
assert.throws(() => normalizeReturnDetail({ ...returnRow(), status: "CLIENT_STATUS" }), /canonical/);

const calls = [];
const http = {
  async request(path, options = {}) {
    calls.push({ path, options });
    if (path.startsWith("/api/admin/returns/summary")) {
      return { items: [returnRow()], limit: 100, hasMore: false, nextCursor: null };
    }
    if (path === "/api/returns/101" && !options.method) return returnRow();
    if (path === "/api/returns/101/status" && options.method === "PATCH") {
      return { return: returnRow({ status: "IN_REVIEW", revision: 4, refund_status: "IN_REVIEW" }) };
    }
    throw new Error(`Unexpected request: ${path}`);
  },
};

const adapter = createSameOriginAdapter(http);
await adapter.returns();
await adapter.returns({ cursor: "opaque+/cursor=" });
assert.equal(calls[0].path, "/api/admin/returns/summary?limit=100");
assert.equal(calls[1].path, "/api/admin/returns/summary?limit=100&cursor=opaque%2B%2Fcursor%3D");

const readOnlyActions = adapter.mutationActions({ returnsRead: true, returnWrite: false });
assert.equal(typeof readOnlyActions.getReturn, "function");
assert.equal(typeof readOnlyActions.loadReturnPage, "function");
assert.equal(readOnlyActions.updateReturnStatus, undefined);
await readOnlyActions.getReturn({ returnId: 101 });
assert.equal(calls.filter((call) => call.options.method === "PATCH").length, 0);

const writableActions = adapter.mutationActions({ returnsRead: true, returnWrite: true });
await writableActions.updateReturnStatus({
  returnId: 101,
  expectedRevision: 3,
  status: "IN_REVIEW",
  decisionNote: null,
});
const patchCall = calls.at(-1);
assert.equal(patchCall.path, "/api/returns/101/status");
assert.deepEqual(JSON.parse(patchCall.options.body), {
  status: "IN_REVIEW",
  expected_revision: 3,
  decision_note: null,
});

const appSource = await readFile(new URL("../src/IntegratedApp.jsx", import.meta.url), "utf8");
const detailSource = appSource.slice(appSource.indexOf("function ReturnDetailDialog"), appSource.indexOf("function Returns("));
assert.match(detailSource, /\{detail\.note \|\| "Müşteri not bırakmadı\."\}/);
assert.doesNotMatch(detailSource, /dangerouslySetInnerHTML/);
assert.doesNotMatch(detailSource, /onDecision\(detail, "COMPLETED"\)/);
assert.match(appSource, /requestError\?\.status === 409/);
assert.match(appSource, /await fetchDetail\(detailState\.rawId, \{ preserveData: true \}\)/);

console.log("admin return processing UI contract smoke passed");
