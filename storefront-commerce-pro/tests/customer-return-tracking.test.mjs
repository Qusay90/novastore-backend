import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerHttp, normalizeCustomerApiRequest } from "../src/integration/customerHttp.js";
import { createCustomerAccountAdapter, normalizeCustomerOrder } from "../src/adapters/customerAccountAdapter.js";
import { normalizeCustomerReturn, RETURN_STATUS_LABELS, REFUND_STATUS_LABELS } from "../src/adapters/customerReturnContract.js";
import { resolveNotificationTarget } from "../../web-notifications/notificationClient.js";
import { safeCustomerReturnPath } from "../src/customerAuthUx.js";

const row = (extra = {}) => ({ id: 71, order_id: 31, user_id: 1, revision: 1, status: "REQUESTED", reason_code: "DAMAGED", note: "Hasarlı", decision_note: null, refund_amount: 120, created_at: "2026-09-01T10:00:00Z", ...extra });
const session = { user: { id: 1 } };
function harness(fetchImpl) {
  const values = new Map([["nova_user_token", "test-A"], ["nova_user_info", JSON.stringify({ id: 1 })]]);
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const http = createCustomerHttp({ fetchImpl, storage, origin: "http://localhost", eventTarget: {} });
  return { storage, account: createCustomerAccountAdapter({ http, storage, eventTarget: {} }) };
}

test("R13 real adapter and transport reach only authenticated canonical return routes", async () => {
  const calls = [];
  const { account } = harness(async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify(path.endsWith("mine") ? [row({ id: 80 }), row()] : options.method === "POST" ? { reused: false, return: row() } : row({ refund_status: "PENDING", payment_status: "PAID", order_status: "Teslim Edildi" })), { status: 200 });
  });
  assert.equal((await account.createReturnRequest(31, { reasonCode: "DAMAGED" })).return.id, 71);
  assert.deepEqual((await account.listReturns(session)).map((r) => r.id), [80, 71]);
  assert.equal((await account.getReturn(session, 71)).orderRefundStatus, "PENDING");
  assert.deepEqual(calls.map((c) => [c.path, c.options.method]), [["/api/returns", "POST"], ["/api/returns/mine", "GET"], ["/api/returns/71", "GET"]]);
  assert.ok(calls.every((c) => c.options.headers.Authorization === "Bearer test-A"));
  for (const [path, method] of [["/api/returns", "GET"], ["/api/returns/admin/all", "GET"], ["/api/returns/1/status", "PATCH"], ["/api/returns/1", "DELETE"], ["/api/returns/0", "GET"], ["/api/returns/mine?user_id=2", "GET"], ["//evil.invalid/api/returns", "POST"], ["/api/returns/1/events", "GET"]]) assert.throws(() => normalizeCustomerApiRequest(path, method, "http://localhost"));
});

test("R13 delayed A response and delayed A 401 cannot affect B session", async () => {
  for (const status of [200, 401]) {
    let resolve;
    const h = harness(() => new Promise((done) => { resolve = done; }));
    const pending = h.account.getReturn(session, 71);
    h.storage.setItem("nova_user_token", "test-B");
    h.storage.setItem("nova_user_info", JSON.stringify({ id: 2 }));
    resolve(new Response(JSON.stringify(row({ refund_status: "PENDING", payment_status: "PAID", order_status: "Teslim Edildi" })), { status }));
    await assert.rejects(pending, { code: "CUSTOMER_SESSION_CHANGED" });
    assert.equal(h.storage.getItem("nova_user_token"), "test-B");
  }
});

test("R13 malformed list/detail fails instead of empty history or wrong request", async () => {
  for (const payload of [{}, [row(), row()], [row({ status: "RECEIVED" })]]) {
    const { account } = harness(async () => new Response(JSON.stringify(payload)));
    await assert.rejects(account.listReturns(session));
  }
  assert.throws(() => normalizeCustomerReturn(row({ id: 72 }), { expectedId: 71 }));
  assert.throws(() => normalizeCustomerReturn(row({ refund_amount: -1 })));
  assert.throws(() => normalizeCustomerReturn(row({ status: "FAILED" })));
});

test("R13 return approval and refund state remain independent, including failure/completion", () => {
  for (const refund of Object.keys(REFUND_STATUS_LABELS)) {
    const normalized = normalizeCustomerReturn(row({ status: "APPROVED", refund_status: refund, payment_status: "PAID", order_status: "Teslim Edildi" }), { detail: true });
    assert.equal(normalized.statusLabel, "İade talebi onaylandı");
    assert.equal(normalized.orderRefundStatus, refund);
  }
  assert.deepEqual(Object.keys(RETURN_STATUS_LABELS), ["REQUESTED", "IN_REVIEW", "APPROVED", "REJECTED", "COMPLETED"]);
});

test("R13 rejected history does not block later eligible request; active request does", () => {
  const order = { id: 31, status: "Teslim Edildi", payment_status: "PAID", return_id: 71 };
  assert.equal(normalizeCustomerOrder({ ...order, return_status: "REJECTED" }).returnable, true);
  for (const status of ["REQUESTED", "IN_REVIEW", "APPROVED", "UNKNOWN"]) assert.equal(normalizeCustomerOrder({ ...order, return_status: status }).returnable, false);
});

test("R13 typed notification and login return retain exact request ID", () => {
  assert.equal(resolveNotificationTarget({ entity_type: "return_request", entity_id: 71 }, "customer"), "#/hesabim/iadeler/71");
  assert.equal(resolveNotificationTarget({ entity_type: "return_request", entity_id: "1/evil" }, "customer"), null);
  assert.equal(safeCustomerReturnPath("/hesabim/iadeler/71"), "/hesabim/iadeler/71");
  assert.equal(safeCustomerReturnPath("/hesabim/iadeler"), "/hesabim/iadeler");
  assert.equal(safeCustomerReturnPath("/hesabim/iadeler/71?user=2"), "/");
});
