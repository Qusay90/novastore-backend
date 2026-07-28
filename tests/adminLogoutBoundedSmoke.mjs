import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ADMIN_TOKEN_KEY,
  createAdminHttp,
} from "../admin-commerce-pro/src/integration/adminHttp.js";

const token = "synthetic-admin-session-token";

class FakeStorage {
  constructor() {
    this.values = new Map([[ADMIN_TOKEN_KEY, token]]);
    this.removeCalls = 0;
  }

  getItem(key) {
    return this.values.get(key) || null;
  }

  removeItem(key) {
    this.removeCalls += 1;
    this.values.delete(key);
  }
}

const runCase = async (outcome) => {
  const storage = new FakeStorage();
  const requests = [];
  let timer = null;
  let clearedTimer = null;
  let rejectPendingRequest;

  const http = createAdminHttp({
    storage,
    location: { href: "admin-commerce-pro-live.html" },
    logoutTimeoutMs: 37,
    setTimeoutImpl(callback, milliseconds) {
      timer = { callback, milliseconds, id: 41 };
      return timer.id;
    },
    clearTimeoutImpl(id) {
      clearedTimer = id;
    },
    fetchImpl(input, init) {
      requests.push({ input, init });
      if (outcome === "sync-throw") throw new Error("synthetic synchronous offline");
      if (outcome === "async-throw") return Promise.reject(new Error("synthetic asynchronous offline"));
      if (outcome === "pending") {
        return new Promise((_resolve, reject) => {
          rejectPendingRequest = reject;
        });
      }
      return Promise.resolve({ status: outcome === "success" ? 204 : 503 });
    },
  });

  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  let result;
  try {
    const logoutPromise = http.logout();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(timer?.milliseconds, 37);
    if (outcome === "pending") {
      timer.callback();
    }
    result = await logoutPromise;
    if (outcome === "pending") {
      assert.equal(requests[0].init.signal.aborted, true);
      rejectPendingRequest(new Error("synthetic late rejection"));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(unhandled.length, 0);
    }
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }

  assert.equal(result.serverRevocationVerified, outcome === "success");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].input, "/api/auth/logout");
  assert.equal(requests[0].init.method, "POST");
  assert.equal(requests[0].init.credentials, "same-origin");
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${token}`);
  assert.equal(requests[0].init.body, undefined);
  assert.equal(storage.getItem(ADMIN_TOKEN_KEY), null);
  assert.equal(storage.removeCalls, 1);
  assert.equal(clearedTimer, 41);
};

for (const outcome of ["success", "http-error", "sync-throw", "async-throw", "pending"]) {
  await runCase(outcome);
}

const integratedAdminSource = fs.readFileSync(
  new URL("../admin-commerce-pro/src/IntegratedApp.jsx", import.meta.url),
  "utf8",
);
const logoutBody = integratedAdminSource.match(
  /const logout = async \(\) => \{([\s\S]*?)\r?\n  \};/,
)?.[1];
assert(logoutBody, "integrated admin logout caller must remain discoverable");
assert.match(logoutBody, /await http\.logout\(\)/);
assert.doesNotMatch(logoutBody, /\balert\s*(?:\?\.)?\s*\(/, "modal alert must not delay logout navigation");
assert.match(logoutBody, /window\.location\.href = "admin-login\.html\?next=admin-commerce-pro-live\.html"/);
assert(
  logoutBody.indexOf("await http.logout()") < logoutBody.indexOf("window.location.href"),
  "bounded server revoke attempt and local cleanup must precede navigation",
);

console.log("adminLogoutBoundedSmoke: PASS cases=5 pending=1 cleanup-once=5 navigation-nonmodal=1");
