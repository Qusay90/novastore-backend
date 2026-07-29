import assert from "node:assert/strict";
import { createCustomerHttp } from "../storefront-commerce-pro/src/integration/customerHttp.js";
import { createCustomerAccountAdapter } from "../storefront-commerce-pro/src/adapters/customerAccountAdapter.js";

class FakeStorage {
  constructor(values = {}) { this.values = new Map(Object.entries(values)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const warning = "Bu cihazdaki oturum kapatıldı; sunucu oturumunun kapatıldığı doğrulanamadı.";
const token = "customer-session-token-never-log";

const runCase = async ({ status, throws = false, withToken = true }) => {
  const storage = new FakeStorage({
    ...(withToken ? { nova_user_token: token } : {}),
    nova_user_info: JSON.stringify({ id: 42, role: "customer" }),
    novastore_checkout_42: JSON.stringify({ step: "payment-handoff" }),
  });
  const requests = [];
  let authEvents = 0;
  const http = createCustomerHttp({
    storage,
    origin: "http://localhost",
    eventTarget: { dispatchEvent() { authEvents += 1; } },
    fetchImpl: async (input, init) => {
      requests.push({ input, init });
      if (throws) throw new Error("synthetic network failure");
      return new Response(status === 204 ? null : JSON.stringify({ ok: true }), {
        status,
        headers: status === 204 ? {} : { "content-type": "application/json" },
      });
    },
  });
  const adapter = createCustomerAccountAdapter({ storage, http, eventTarget: { dispatchEvent() {} } });
  const result = await adapter.logout();
  assert.equal(storage.getItem("nova_user_token"), null);
  assert.equal(storage.getItem("nova_user_info"), null);
  assert.equal(storage.getItem("novastore_checkout_42"), JSON.stringify({ step: "payment-handoff" }));
  assert.equal(result.serverRevocationVerified, status === 204 && !throws && withToken);
  assert.equal(result.warning, result.serverRevocationVerified ? null : warning);
  assert.equal(String(result.warning || "").includes(token), false);
  if (withToken) {
    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, "/api/users/logout");
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[0].init.credentials, "same-origin");
    assert.equal(requests[0].init.headers.Authorization, `Bearer ${token}`);
  } else {
    assert.equal(requests.length, 0);
  }
  assert(authEvents <= 1);
};

await runCase({ status: 204 });
await runCase({ status: 500 });
await runCase({ status: 401 });
await runCase({ status: 200 });
await runCase({ status: 0, throws: true });
await runCase({ status: 204, withToken: false });

console.log("webCustomerLogoutSmoke: PASS cases=6 exact-204=1 cleanup=6 checkout-preserved=6");
