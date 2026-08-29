import { expect, test, type Page, type Route } from "@playwright/test";
import {
  createCustomerAddress,
  listCustomerAddresses,
  updateCustomerProfile,
} from "../src/account/customerAccountApi";
import {
  ANDROID_FCM_TOKEN_KEY,
  ANDROID_INSTALLATION_ID_KEY,
  authorizeCustomerNotificationTarget,
  clearCustomerSession,
  CUSTOMER_SESSION_KEY,
  currentCustomerSessionGuard,
  customerNotificationApiTestUtils,
  hasVerifiedCustomerSession,
  listCustomerNotifications,
  loginCustomer,
  logoutCustomer,
  markCustomerSessionVerified,
  registerFcmToken,
  refreshCustomerSession,
  revokeFcmSession,
  revokeFcmToken,
} from "../src/notifications/customerNotificationApi";

const profile = { id: 17, fullName: "Gerçek Müşteri A", email: "customer-a@example.test", phone: null, role: "customer" };
const profileB = { id: 18, fullName: "Gerçek Müşteri B", email: "customer-b@example.test", phone: null, role: "customer" };
const sessionV1 = {
  accessToken: "customer-access-token-generation-1",
  refreshToken: "customer-refresh-token-generation-1",
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  refreshExpiresAt: "2099-02-01T00:00:00.000Z",
  sessionId: 71,
};
const sessionV2 = {
  accessToken: "customer-access-token-generation-2",
  refreshToken: "customer-refresh-token-generation-2",
  tokenType: "Bearer",
  accessExpiresAt: "2099-01-02T00:00:00.000Z",
  refreshExpiresAt: "2099-02-01T00:00:00.000Z",
  sessionId: 71,
};
const sessionB = {
  accessToken: "customer-b-access-token-generation-1",
  refreshToken: "customer-b-refresh-token-generation-1",
  accessExpiresAt: "2099-01-03T00:00:00.000Z",
  refreshExpiresAt: "2099-02-01T00:00:00.000Z",
  sessionId: 72,
};
const fcmTokenA = "fcm-customer-a-binding-token-0001";
const fcmTokenB = "fcm-customer-b-binding-token-0001";
const installationIdA = "123e4567-e89b-42d3-a456-426614174000";
const installationIdB = "223e4567-e89b-42d3-a456-426614174001";
const notification = {
  id: 701,
  type: "ORDER_STATUS_CHANGED",
  category: "ORDER",
  priority: "NORMAL",
  title: "Customer A özel bildirimi",
  message: "Sipariş durumu güncellendi.",
  is_read: false,
  read_at: null,
  entity_type: "order",
  entity_id: 301,
  entity_key: null,
  created_at: "2026-08-29T12:00:00.000Z",
  updated_at: "2026-08-29T12:00:00.000Z",
};

function memoryStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
    },
  };
}

function installMemoryStorage(entries: Record<string, string> = {}) {
  const result = memoryStorage(entries);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: result.storage });
  return result;
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return Object.freeze({ promise, release });
}

const originalFetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function restoreGlobal(name: "fetch" | "localStorage", descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}

test.beforeEach(async () => {
  installMemoryStorage();
  await clearCustomerSession();
});

test.afterEach(async () => {
  try { await clearCustomerSession(); } catch { /* the next test receives a fresh isolated store */ }
  restoreGlobal("fetch", originalFetchDescriptor);
  restoreGlobal("localStorage", originalStorageDescriptor);
});

function authorization(init: RequestInit) {
  return String((init.headers as Record<string, string> | undefined)?.authorization || "");
}

async function installPersistedSession(page: Page, value = sessionV1) {
  await page.addInitScript(({ key, session, customer }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem("novastore.customer.verifiedUserId", String(customer.id));
  }, { key: CUSTOMER_SESSION_KEY, session: value, customer: profile });
}

function pathOf(route: Route) {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

async function fulfillPrivateAuthority(route: Route) {
  const path = pathOf(route);
  if (path === "/api/users/me") return route.fulfill({ json: { user: profile } });
  if (path === "/api/addresses") return route.fulfill({ json: [{ id: 101, title: "Ev", fullName: profile.fullName, phone: "", city: "İstanbul", district: "Kadıköy", addressLine: "Customer A adresi", isDefault: true }] });
  if (path === "/api/orders/user/17") return route.fulfill({ json: [{ id: 301, status: "Hazırlanıyor", total_amount: 1499.9, items: [] }] });
  if (path === "/api/messages/history/17") return route.fulfill({ json: [{ id: 501, sender_id: 17, message: "Customer A destek mesajı" }] });
  if (path === "/api/users/security-status") return route.fulfill({ json: { email: profile.email, emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } });
  if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [notification], page: { limit: 50, hasMore: false, nextCursor: null } } });
  if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 1 } });
  if (path === "/api/users/logout") return route.fulfill({ json: { success: true } });
  return route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: "not found" } });
}

test("a persisted legacy verification seal cannot authorize private notification access", async () => {
  installMemoryStorage({
    [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1),
    "novastore.customer.verifiedUserId": "17",
  });
  let fetchCount = 0;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => {
    ++fetchCount;
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  }});
  expect(hasVerifiedCustomerSession()).toBe(false);
  await expect(listCustomerNotifications()).rejects.toMatchObject({ status: 401, code: "CUSTOMER_SESSION_NOT_VERIFIED" });
  expect(fetchCount).toBe(0);
  await clearCustomerSession();
});

test("login persists one complete credential generation and no profile identity", async () => {
  const { values } = installMemoryStorage();
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string) => {
    expect(String(input)).toBe("/api/users/login");
    return new Response(JSON.stringify({
      token: sessionV1.accessToken,
      refreshToken: sessionV1.refreshToken,
      accessExpiresAt: sessionV1.accessExpiresAt,
      refreshExpiresAt: sessionV1.refreshExpiresAt,
      sessionId: sessionV1.sessionId,
      user: profile,
    }), { status: 200 });
  }});
  const user = await loginCustomer(profile.email, "customer-password");
  expect(user.id).toBe(profile.id);
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session).toEqual(sessionV1);
  expect(values.has("nova_user_token")).toBe(false);
  expect(values.has("nova_user_info")).toBe(false);
  expect(values.get(CUSTOMER_SESSION_KEY)).not.toContain(profile.email);
  expect(hasVerifiedCustomerSession()).toBe(false);
  await clearCustomerSession();
});

test("malformed login cannot leave a partial credential generation", async () => {
  const { values } = installMemoryStorage();
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => new Response(JSON.stringify({
    token: sessionV1.accessToken,
    refreshToken: sessionV1.refreshToken,
    user: profile,
  }), { status: 200 }) });
  await expect(loginCustomer(profile.email, "customer-password")).rejects.toMatchObject({ code: "CUSTOMER_LOGIN_RESPONSE_INVALID" });
  expect(values.has(CUSTOMER_SESSION_KEY)).toBe(false);
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session).toBeNull();
});

test("concurrent 401 requests share one refresh and observe only the complete replacement", async () => {
  installMemoryStorage({ [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1) });
  let oldRequestCount = 0;
  let refreshCount = 0;
  let meCount = 0;
  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    if (path === "/api/users/refresh") {
      ++refreshCount;
      expect(authorization(init)).toBe("");
      expect(JSON.parse(String(init.body))).toEqual({ refreshToken: sessionV1.refreshToken, sessionId: sessionV1.sessionId });
      await refreshGate;
      return new Response(JSON.stringify(sessionV2), { status: 200 });
    }
    if (path === "/api/users/me") {
      ++meCount;
      expect(authorization(init)).toBe(`Bearer ${sessionV2.accessToken}`);
      return new Response(JSON.stringify({ user: profile }), { status: 200 });
    }
    if (path === "/api/addresses" && authorization(init) === `Bearer ${sessionV1.accessToken}`) {
      ++oldRequestCount;
      return new Response(JSON.stringify({ code: "UNAUTHORIZED", error: "expired" }), { status: 401 });
    }
    if (path === "/api/addresses" && authorization(init) === `Bearer ${sessionV2.accessToken}`) {
      return new Response(JSON.stringify([{ id: 101, title: "Ev", city: "İstanbul", district: "Kadıköy", addressLine: "A Sokağı 1" }]), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  }});

  const pending = Promise.all(Array.from({ length: 6 }, () => listCustomerAddresses()));
  await expect.poll(() => oldRequestCount).toBe(6);
  releaseRefresh();
  const results = await pending;
  expect(results.every((items) => items[0].addressLine === "A Sokağı 1")).toBe(true);
  expect(refreshCount).toBe(1);
  expect(meCount).toBe(1);
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session).toEqual({
    accessToken: sessionV2.accessToken,
    refreshToken: sessionV2.refreshToken,
    accessExpiresAt: sessionV2.accessExpiresAt,
    refreshExpiresAt: sessionV2.refreshExpiresAt,
    sessionId: sessionV2.sessionId,
  });
  expect(hasVerifiedCustomerSession()).toBe(true);
  await clearCustomerSession();
});

test("a late pre-refresh 401 cannot clear the newer generation", async () => {
  installMemoryStorage({ [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1) });
  let oldCallStarted = 0;
  let releaseOld401!: () => void;
  const oldGate = new Promise<void>((resolve) => { releaseOld401 = resolve; });
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    const auth = authorization(init);
    if (path === "/api/addresses" && auth === `Bearer ${sessionV1.accessToken}`) {
      ++oldCallStarted;
      await oldGate;
      return new Response(JSON.stringify({ code: "UNAUTHORIZED", error: "late" }), { status: 401 });
    }
    if (path === "/api/users/refresh") return new Response(JSON.stringify(sessionV2), { status: 200 });
    if (path === "/api/users/me") return new Response(JSON.stringify({ user: profile }), { status: 200 });
    if (path === "/api/addresses" && auth === `Bearer ${sessionV2.accessToken}`) {
      return new Response(JSON.stringify([{ id: 101, title: "Ev", city: "İstanbul", district: "Kadıköy", addressLine: "Yeni nesil" }]), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  }});
  const lateRequest = listCustomerAddresses();
  await expect.poll(() => oldCallStarted).toBe(1);
  await refreshCustomerSession();
  releaseOld401();
  expect((await lateRequest)[0].addressLine).toBe("Yeni nesil");
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe(sessionV2.accessToken);
  await clearCustomerSession();
});

for (const operation of [
  {
    label: "PATCH profile",
    path: "/api/users/me",
    method: "PATCH",
    run: () => updateCustomerProfile("Customer A Güncel", "+905551111111"),
  },
  {
    label: "POST address",
    path: "/api/addresses",
    method: "POST",
    run: () => createCustomerAddress({
      title: "Ev",
      fullName: profile.fullName,
      phone: "+905551111111",
      city: "İstanbul",
      district: "Kadıköy",
      addressLine: "A Müşterisi Sokağı 1",
      isDefault: false,
    }),
  },
] as const) {
  test(`a stale 401 ${operation.label} is never replayed under Customer B`, async () => {
    installMemoryStorage({ [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1) });
    markCustomerSessionVerified(profile);
    const aRequestStarted = deferred();
    const releaseARequest = deferred();
    let bReplayCount = 0;
    let refreshCount = 0;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
      const path = String(input);
      const method = String(init.method || "GET");
      const auth = authorization(init);
      if (path === operation.path && method === operation.method && auth === `Bearer ${sessionV1.accessToken}`) {
        aRequestStarted.release();
        await releaseARequest.promise;
        return new Response(JSON.stringify({ code: "UNAUTHORIZED", error: "late Customer A request" }), { status: 401 });
      }
      if (path === operation.path && method === operation.method && auth === `Bearer ${sessionB.accessToken}`) {
        ++bReplayCount;
        return new Response(JSON.stringify({ error: "forbidden replay" }), { status: 500 });
      }
      if (path === "/api/users/refresh") {
        ++refreshCount;
        return new Response(JSON.stringify({ error: "unexpected refresh" }), { status: 500 });
      }
      if (path === "/api/users/login") {
        return new Response(JSON.stringify({
          token: sessionB.accessToken,
          refreshToken: sessionB.refreshToken,
          accessExpiresAt: sessionB.accessExpiresAt,
          refreshExpiresAt: sessionB.refreshExpiresAt,
          sessionId: sessionB.sessionId,
          user: profileB,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    }});

    const staleOperation = operation.run();
    await aRequestStarted.promise;
    const userB = await loginCustomer(profileB.email, "customer-password");
    markCustomerSessionVerified(userB);
    releaseARequest.release();

    await expect(staleOperation).rejects.toMatchObject({ code: "CUSTOMER_SESSION_GENERATION_STALE" });
    expect(bReplayCount).toBe(0);
    expect(refreshCount).toBe(0);
    expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe(sessionB.accessToken);
    expect(hasVerifiedCustomerSession()).toBe(true);
  });
}

test("a delayed refresh-A users/me cannot verify A over a newer Customer B login", async () => {
  installMemoryStorage({ [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1) });
  markCustomerSessionVerified(profile);
  const aMeStarted = deferred();
  const releaseAMe = deferred();
  const ownedPaths: string[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    const auth = authorization(init);
    if (path === "/api/users/refresh") return new Response(JSON.stringify(sessionV2), { status: 200 });
    if (path === "/api/users/me" && auth === `Bearer ${sessionV2.accessToken}`) {
      aMeStarted.release();
      await releaseAMe.promise;
      return new Response(JSON.stringify({ user: profile }), { status: 200 });
    }
    if (path === "/api/users/login") {
      return new Response(JSON.stringify({
        token: sessionB.accessToken,
        refreshToken: sessionB.refreshToken,
        accessExpiresAt: sessionB.accessExpiresAt,
        refreshExpiresAt: sessionB.refreshExpiresAt,
        sessionId: sessionB.sessionId,
        user: profileB,
      }), { status: 200 });
    }
    if (path === "/api/orders/user/18" && auth === `Bearer ${sessionB.accessToken}`) {
      ownedPaths.push(path);
      return new Response(JSON.stringify([{ id: 901 }]), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  }});

  const staleRefresh = refreshCustomerSession();
  await aMeStarted.promise;
  const userB = await loginCustomer(profileB.email, "customer-password");
  markCustomerSessionVerified(userB);
  releaseAMe.release();

  await expect(staleRefresh).rejects.toMatchObject({ code: "CUSTOMER_SESSION_GENERATION_STALE" });
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe(sessionB.accessToken);
  expect(hasVerifiedCustomerSession()).toBe(true);
  await expect(authorizeCustomerNotificationTarget({ entityType: "order", entityId: 901 })).resolves.toEqual({ entityType: "order", entityId: 901 });
  expect(ownedPaths).toEqual(["/api/orders/user/18"]);
});

test("a stale temporary refresh-A failure cannot unverify a newer Customer B", async () => {
  installMemoryStorage({ [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1) });
  markCustomerSessionVerified(profile);
  const refreshStarted = deferred();
  const releaseRefresh = deferred();
  const ownedPaths: string[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    const auth = authorization(init);
    if (path === "/api/users/refresh") {
      refreshStarted.release();
      await releaseRefresh.promise;
      return new Response(JSON.stringify({ code: "AUTH_SESSION_STATE_UNAVAILABLE", error: "temporary" }), { status: 503 });
    }
    if (path === "/api/users/login") {
      return new Response(JSON.stringify({
        token: sessionB.accessToken,
        refreshToken: sessionB.refreshToken,
        accessExpiresAt: sessionB.accessExpiresAt,
        refreshExpiresAt: sessionB.refreshExpiresAt,
        sessionId: sessionB.sessionId,
        user: profileB,
      }), { status: 200 });
    }
    if (path === "/api/orders/user/18" && auth === `Bearer ${sessionB.accessToken}`) {
      ownedPaths.push(path);
      return new Response(JSON.stringify([{ id: 902 }]), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  }});

  const staleRefresh = refreshCustomerSession();
  await refreshStarted.promise;
  const userB = await loginCustomer(profileB.email, "customer-password");
  markCustomerSessionVerified(userB);
  releaseRefresh.release();

  await expect(staleRefresh).rejects.toMatchObject({ status: 503, code: "AUTH_SESSION_STATE_UNAVAILABLE" });
  expect(hasVerifiedCustomerSession()).toBe(true);
  await expect(authorizeCustomerNotificationTarget({ entityType: "order", entityId: 902 })).resolves.toEqual({ entityType: "order", entityId: 902 });
  expect(ownedPaths).toEqual(["/api/orders/user/18"]);
});

test("a late logout-A response cannot clear a newer Customer B session", async () => {
  const { values } = installMemoryStorage({
    [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1),
    [ANDROID_FCM_TOKEN_KEY]: fcmTokenA,
    [ANDROID_INSTALLATION_ID_KEY]: installationIdA,
  });
  markCustomerSessionVerified(profile);
  const logoutStarted = deferred();
  const releaseLogout = deferred();
  const ownedPaths: string[] = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    const auth = authorization(init);
    if (path === "/api/users/logout" && auth === `Bearer ${sessionV1.accessToken}`) {
      logoutStarted.release();
      await releaseLogout.promise;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (path === "/api/users/login") {
      return new Response(JSON.stringify({
        token: sessionB.accessToken,
        refreshToken: sessionB.refreshToken,
        accessExpiresAt: sessionB.accessExpiresAt,
        refreshExpiresAt: sessionB.refreshExpiresAt,
        sessionId: sessionB.sessionId,
        user: profileB,
      }), { status: 200 });
    }
    if (path === "/api/orders/user/18" && auth === `Bearer ${sessionB.accessToken}`) {
      ownedPaths.push(path);
      return new Response(JSON.stringify([{ id: 903 }]), { status: 200 });
    }
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  }});

  const staleLogout = logoutCustomer();
  await logoutStarted.promise;
  const userB = await loginCustomer(profileB.email, "customer-password");
  markCustomerSessionVerified(userB);
  values.set(ANDROID_FCM_TOKEN_KEY, fcmTokenB);
  values.set(ANDROID_INSTALLATION_ID_KEY, installationIdB);
  releaseLogout.release();

  await expect(staleLogout).rejects.toMatchObject({ code: "CUSTOMER_SESSION_GENERATION_STALE" });
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe(sessionB.accessToken);
  expect(hasVerifiedCustomerSession()).toBe(true);
  expect(values.get(ANDROID_FCM_TOKEN_KEY)).toBe(fcmTokenB);
  expect(values.get(ANDROID_INSTALLATION_ID_KEY)).toBe(installationIdB);
  await expect(authorizeCustomerNotificationTarget({ entityType: "order", entityId: 903 })).resolves.toEqual({ entityType: "order", entityId: 903 });
  expect(ownedPaths).toEqual(["/api/orders/user/18"]);
});

for (const operation of [
  {
    label: "auth-verified FCM registration",
    path: "/api/notifications/android-push/tokens",
    method: "POST",
    run: () => registerFcmToken("fcm-customer-a-replacement-token-0002", fcmTokenA),
  },
  {
    label: "FCM token revocation",
    path: "/api/notifications/android-push/tokens",
    method: "DELETE",
    run: () => revokeFcmToken(fcmTokenA),
  },
  {
    label: "logout FCM session revocation",
    path: "/api/notifications/android-push/tokens/session",
    method: "DELETE",
    run: () => revokeFcmSession(currentCustomerSessionGuard()),
  },
] as const) {
  test(`a stale ${operation.label} continuation preserves Customer B metadata and session`, async () => {
    const { values } = installMemoryStorage({
      [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1),
      [ANDROID_FCM_TOKEN_KEY]: fcmTokenA,
      [ANDROID_INSTALLATION_ID_KEY]: installationIdA,
    });
    markCustomerSessionVerified(profile);
    const aRequestStarted = deferred();
    const releaseARequest = deferred();
    let bReplayCount = 0;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
      const path = String(input);
      const method = String(init.method || "GET");
      const auth = authorization(init);
      if (path === operation.path && method === operation.method && auth === `Bearer ${sessionV1.accessToken}`) {
        const payload = JSON.parse(String(init.body || "{}"));
        expect(payload.installationId).toBe(installationIdA);
        aRequestStarted.release();
        await releaseARequest.promise;
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      if (path === operation.path && method === operation.method && auth === `Bearer ${sessionB.accessToken}`) {
        ++bReplayCount;
        return new Response(JSON.stringify({ error: "forbidden replay" }), { status: 500 });
      }
      if (path === "/api/users/login") {
        return new Response(JSON.stringify({
          token: sessionB.accessToken,
          refreshToken: sessionB.refreshToken,
          accessExpiresAt: sessionB.accessExpiresAt,
          refreshExpiresAt: sessionB.refreshExpiresAt,
          sessionId: sessionB.sessionId,
          user: profileB,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
    }});

    const staleContinuation = operation.run();
    await aRequestStarted.promise;
    const userB = await loginCustomer(profileB.email, "customer-password");
    markCustomerSessionVerified(userB);
    values.set(ANDROID_FCM_TOKEN_KEY, fcmTokenB);
    values.set(ANDROID_INSTALLATION_ID_KEY, installationIdB);
    releaseARequest.release();

    await expect(staleContinuation).rejects.toMatchObject({ code: "CUSTOMER_SESSION_GENERATION_STALE" });
    expect(bReplayCount).toBe(0);
    expect(values.get(ANDROID_FCM_TOKEN_KEY)).toBe(fcmTokenB);
    expect(values.get(ANDROID_INSTALLATION_ID_KEY)).toBe(installationIdB);
    expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe(sessionB.accessToken);
    expect(hasVerifiedCustomerSession()).toBe(true);
  });
}

test("FCM revoke finalizes only for the current disable intent and matching token", async () => {
  const { values } = installMemoryStorage({
    [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1),
    [ANDROID_FCM_TOKEN_KEY]: fcmTokenA,
    [ANDROID_INSTALLATION_ID_KEY]: installationIdA,
  });
  markCustomerSessionVerified(profile);
  const firstRevokeStarted = deferred();
  const releaseFirstRevoke = deferred();
  let revokeCount = 0;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    expect(String(input)).toBe("/api/notifications/android-push/tokens");
    expect(String(init.method)).toBe("DELETE");
    expect(authorization(init)).toBe(`Bearer ${sessionV1.accessToken}`);
    const payload = JSON.parse(String(init.body || "{}"));
    expect(payload.installationId).toBe(installationIdA);
    ++revokeCount;
    if (revokeCount === 1) {
      firstRevokeStarted.release();
      await releaseFirstRevoke.promise;
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }});

  const staleFinalize = revokeFcmToken(fcmTokenA, () => false);
  await firstRevokeStarted.promise;
  // The provider may reuse the exact same token for the newer/current intent;
  // token equality alone must not let the stale disable continuation delete it.
  values.set(ANDROID_FCM_TOKEN_KEY, fcmTokenA);
  releaseFirstRevoke.release();
  await staleFinalize;
  expect(values.get(ANDROID_FCM_TOKEN_KEY)).toBe(fcmTokenA);

  values.set(ANDROID_FCM_TOKEN_KEY, fcmTokenB);
  await revokeFcmToken(fcmTokenA, () => true);
  expect(values.get(ANDROID_FCM_TOKEN_KEY)).toBe(fcmTokenB);

  await revokeFcmToken(fcmTokenB, () => true);
  expect(values.has(ANDROID_FCM_TOKEN_KEY)).toBe(false);
  expect(revokeCount).toBe(3);
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe(sessionV1.accessToken);
  expect(hasVerifiedCustomerSession()).toBe(true);
});

test("legacy profile identity is purged with the legacy access session", async () => {
  const { values } = installMemoryStorage({
    nova_user_token: "legacy-customer-access-token-0001",
    nova_user_info: JSON.stringify(profile),
    "novastore.customer.verifiedUserId": String(profile.id),
  });
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session?.accessToken).toBe("legacy-customer-access-token-0001");
  await clearCustomerSession();
  expect(values.has("nova_user_token")).toBe(false);
  expect(values.has("nova_user_info")).toBe(false);
  expect(values.has("novastore.customer.verifiedUserId")).toBe(false);
});

test("successful refresh preserves the R9 installation and FCM binding metadata", async () => {
  const fcmToken = "fcm-customer-binding-token-0001";
  const installationId = "123e4567-e89b-42d3-a456-426614174000";
  const { values } = installMemoryStorage({
    [CUSTOMER_SESSION_KEY]: JSON.stringify(sessionV1),
    [ANDROID_FCM_TOKEN_KEY]: fcmToken,
    [ANDROID_INSTALLATION_ID_KEY]: installationId,
  });
  markCustomerSessionVerified(profile);
  const calls: Array<{ path: string; method: string }> = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    calls.push({ path, method: String(init.method || "GET") });
    if (path === "/api/users/refresh") return new Response(JSON.stringify(sessionV2), { status: 200 });
    if (path === "/api/users/me") return new Response(JSON.stringify({ user: profile }), { status: 200 });
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 500 });
  }});

  await refreshCustomerSession();
  expect(values.get(ANDROID_FCM_TOKEN_KEY)).toBe(fcmToken);
  expect(values.get(ANDROID_INSTALLATION_ID_KEY)).toBe(installationId);
  expect(calls).toEqual([
    { path: "/api/users/refresh", method: "POST" },
    { path: "/api/users/me", method: "GET" },
  ]);
});

test("refresh terminal and temporary failures follow the canonical generation policy", async () => {
  const { values } = installMemoryStorage();
  let status = 400;
  let refreshCalls = 0;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string) => {
    expect(String(input)).toBe("/api/users/refresh");
    ++refreshCalls;
    const code = status === 400 ? "AUTH_REFRESH_REQUEST_INVALID"
      : status === 401 ? "AUTH_REFRESH_REJECTED"
        : status === 403 ? "AUTH_CUSTOMER_ACCOUNT_INACTIVE"
          : status === 503 ? "AUTH_SESSION_STATE_UNAVAILABLE" : "RATE_LIMITED";
    return new Response(JSON.stringify({ code, error: "bounded failure" }), { status });
  }});

  for (const candidate of [400, 401, 403, 503, 429]) {
    status = candidate;
    values.set(CUSTOMER_SESSION_KEY, JSON.stringify(sessionV1));
    markCustomerSessionVerified(profile);
    const before = customerNotificationApiTestUtils.currentCustomerSessionState().generation;
    await expect(refreshCustomerSession()).rejects.toMatchObject({ status: candidate });
    const after = customerNotificationApiTestUtils.currentCustomerSessionState();
    if ([400, 401, 403].includes(candidate)) {
      expect(after.session, String(candidate)).toBeNull();
      expect(after.generation, String(candidate)).toBeGreaterThan(before);
    } else {
      expect(after.session?.refreshToken, String(candidate)).toBe(sessionV1.refreshToken);
      expect(after.generation, String(candidate)).toBe(before);
      expect(hasVerifiedCustomerSession(), String(candidate)).toBe(false);
      await clearCustomerSession();
    }
  }
  expect(refreshCalls).toBe(5);
});

test("an absolutely expired refresh generation clears locally without network", async () => {
  const expired = {
    ...sessionV1,
    accessExpiresAt: "1999-01-01T00:00:00.000Z",
    refreshExpiresAt: "2000-01-01T00:00:00.000Z",
  };
  installMemoryStorage({ [CUSTOMER_SESSION_KEY]: JSON.stringify(expired) });
  let fetchCount = 0;
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async () => { ++fetchCount; return new Response(); } });
  await expect(listCustomerAddresses()).rejects.toMatchObject({ status: 401, code: "AUTH_REFRESH_REJECTED" });
  expect(fetchCount).toBe(0);
  expect(customerNotificationApiTestUtils.currentCustomerSessionState().session).toBeNull();
});

test("cold launch validates through users/me before opening the private notification feed", async ({ page }) => {
  await installPersistedSession(page);
  const calls: string[] = [];
  let releaseMe!: () => void;
  const meGate = new Promise<void>((resolve) => { releaseMe = resolve; });
  await page.route("**/api/**", async (route) => {
    const path = pathOf(route);
    calls.push(path);
    if (path === "/api/users/me") await meGate;
    await fulfillPrivateAuthority(route);
  });
  await page.goto("/tests/account-notification-runtime-fixture.html");
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-account-phase", "loading");
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  expect(calls.filter((path) => path.startsWith("/api/notifications"))).toHaveLength(0);
  releaseMe();
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-account-phase", "authenticated");
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-notification-phase", "ready");
  expect(calls.findIndex((path) => path.startsWith("/api/notifications"))).toBeGreaterThan(calls.indexOf("/api/users/me"));
  expect(await page.evaluate(() => localStorage.getItem("novastore.customer.verifiedUserId"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("nova_user_info"))).toBeNull();
});

test("users/me plus rejected refresh clears all private account and notification state", async ({ page }) => {
  await installPersistedSession(page);
  let invalidSession = false;
  await page.route("**/api/**", async (route) => {
    const path = pathOf(route);
    if (path === "/api/users/me" && invalidSession) {
      await route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", error: "expired" } });
      return;
    }
    if (path === "/api/users/refresh") {
      await route.fulfill({ status: 401, json: { code: "AUTH_REFRESH_REJECTED", error: "rejected" } });
      return;
    }
    await fulfillPrivateAuthority(route);
  });
  await page.goto("/tests/account-notification-runtime-fixture.html");
  const probe = page.getByTestId("runtime-probe");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect(probe).toHaveAttribute("data-notification-phase", "ready");
  invalidSession = true;
  await page.getByRole("button", { name: "Hesabı doğrula" }).click();
  await expect(probe).toHaveAttribute("data-account-phase", "guest");
  await expect(probe).toHaveAttribute("data-notification-phase", "guest");
  await expect(page.getByTestId("customer-id")).toHaveText("guest");
  await expect(page.getByTestId("address-count")).toHaveText("0");
  await expect(page.getByTestId("order-count")).toHaveText("0");
  await expect(page.getByTestId("support-count")).toHaveText("0");
  await expect(page.getByTestId("notification-count")).toHaveText("0");
  expect(await page.evaluate((key) => localStorage.getItem(key), CUSTOMER_SESSION_KEY)).toBeNull();
});

test("a concurrent login-A failure cannot clear a newer authenticated Customer B", async ({ page }) => {
  const aLoginStarted = deferred();
  const releaseALogin = deferred();
  await page.route("**/api/**", async (route) => {
    const path = pathOf(route);
    const auth = String(route.request().headers().authorization || "");
    if (path === "/api/users/login") {
      const body = JSON.parse(route.request().postData() || "{}");
      if (String(body.email).startsWith("customer-a@")) {
        aLoginStarted.release();
        await releaseALogin.promise;
        await route.fulfill({ json: {
          token: sessionV1.accessToken,
          refreshToken: sessionV1.refreshToken,
          accessExpiresAt: sessionV1.accessExpiresAt,
          refreshExpiresAt: sessionV1.refreshExpiresAt,
          sessionId: sessionV1.sessionId,
          user: profile,
        } });
        return;
      }
      await route.fulfill({ json: {
        token: sessionB.accessToken,
        refreshToken: sessionB.refreshToken,
        accessExpiresAt: sessionB.accessExpiresAt,
        refreshExpiresAt: sessionB.refreshExpiresAt,
        sessionId: sessionB.sessionId,
        user: profileB,
      } });
      return;
    }
    if (auth !== `Bearer ${sessionB.accessToken}`) {
      await route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", error: "unauthorized" } });
      return;
    }
    if (path === "/api/users/me") return route.fulfill({ json: { user: profileB } });
    if (path === "/api/addresses") return route.fulfill({ json: [] });
    if (path === "/api/orders/user/18") return route.fulfill({ json: [] });
    if (path === "/api/messages/history/18") return route.fulfill({ json: [] });
    if (path === "/api/users/security-status") return route.fulfill({ json: { email: profileB.email, emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } });
    if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 0 } });
    return route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: "not found" } });
  });

  await page.goto("/tests/account-notification-runtime-fixture.html");
  const probe = page.getByTestId("runtime-probe");
  await expect(probe).toHaveAttribute("data-account-phase", "guest");
  await page.getByRole("button", { name: "Customer A girişi" }).click();
  await aLoginStarted.promise;
  await page.getByRole("button", { name: "Customer B girişi" }).click();
  await expect(page.getByTestId("login-b-result")).toHaveText("success");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect(page.getByTestId("customer-id")).toHaveText("18");

  releaseALogin.release();
  await expect(page.getByTestId("login-a-result")).toHaveText("error");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect(page.getByTestId("customer-id")).toHaveText("18");
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), CUSTOMER_SESSION_KEY);
  expect(stored?.accessToken).toBe(sessionB.accessToken);
  expect(stored?.sessionId).toBe(sessionB.sessionId);
});

test("a stale auth-verified Customer A continuation cannot disturb Customer B runtime or metadata", async ({ page }) => {
  const releaseAFeed = deferred();
  const aNotificationPaths = new Set<string>();
  let aFeedRequestCount = 0;
  let aFeedResponseCount = 0;
  await page.route("**/api/**", async (route) => {
    const path = pathOf(route);
    const auth = String(route.request().headers().authorization || "");
    if (path === "/api/users/login") {
      const body = JSON.parse(route.request().postData() || "{}");
      const customerB = String(body.email).startsWith("customer-b@");
      const selectedSession = customerB ? sessionB : sessionV1;
      const selectedProfile = customerB ? profileB : profile;
      await route.fulfill({ json: {
        token: selectedSession.accessToken,
        refreshToken: selectedSession.refreshToken,
        accessExpiresAt: selectedSession.accessExpiresAt,
        refreshExpiresAt: selectedSession.refreshExpiresAt,
        sessionId: selectedSession.sessionId,
        user: selectedProfile,
      } });
      return;
    }
    const customerB = auth === `Bearer ${sessionB.accessToken}`;
    const customerA = auth === `Bearer ${sessionV1.accessToken}`;
    if (!customerA && !customerB) {
      await route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", error: "unauthorized" } });
      return;
    }
    const selectedProfile = customerB ? profileB : profile;
    if (path === "/api/users/me") return route.fulfill({ json: { user: selectedProfile } });
    if (path.startsWith("/api/notifications") && customerA) {
      ++aFeedRequestCount;
      aNotificationPaths.add(path);
      await releaseAFeed.promise;
      if (path === "/api/notifications?limit=50") {
        await route.fulfill({ json: { items: [notification], page: { limit: 50, hasMore: false, nextCursor: null } } });
      } else {
        await route.fulfill({ json: { unreadCount: 1 } });
      }
      ++aFeedResponseCount;
      return;
    }
    if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 0 } });
    if (path === "/api/addresses") return route.fulfill({ json: [] });
    if (path === `/api/orders/user/${selectedProfile.id}`) return route.fulfill({ json: [] });
    if (path === `/api/messages/history/${selectedProfile.id}`) return route.fulfill({ json: [] });
    if (path === "/api/users/security-status") return route.fulfill({ json: {
      email: selectedProfile.email,
      emailVerified: true,
      phone: null,
      phoneVerified: false,
      twoFactorEnabled: false,
      hasPassword: true,
    } });
    return route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: "not found" } });
  });

  await page.goto("/tests/account-notification-runtime-fixture.html");
  const probe = page.getByTestId("runtime-probe");
  await expect(probe).toHaveAttribute("data-account-phase", "guest");
  await page.getByRole("button", { name: "Customer A girişi" }).click();
  await expect(page.getByTestId("login-a-result")).toHaveText("success");
  await expect(page.getByTestId("customer-id")).toHaveText("17");
  await expect.poll(() => aNotificationPaths.size).toBe(2);

  await page.getByRole("button", { name: "Customer B girişi" }).click();
  await expect(page.getByTestId("login-b-result")).toHaveText("success");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect(probe).toHaveAttribute("data-notification-phase", "empty");
  await expect(page.getByTestId("customer-id")).toHaveText("18");
  await page.evaluate(({ tokenKey, installationKey, token, installation }) => {
    localStorage.setItem(tokenKey, token);
    localStorage.setItem(installationKey, installation);
  }, {
    tokenKey: ANDROID_FCM_TOKEN_KEY,
    installationKey: ANDROID_INSTALLATION_ID_KEY,
    token: fcmTokenB,
    installation: installationIdB,
  });

  const expectedAResponses = aFeedRequestCount;
  releaseAFeed.release();
  await expect.poll(() => aFeedResponseCount).toBe(expectedAResponses);
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect(probe).toHaveAttribute("data-notification-phase", "empty");
  await expect(page.getByTestId("customer-id")).toHaveText("18");
  await expect(page.getByTestId("notification-count")).toHaveText("0");
  const preserved = await page.evaluate(({ sessionKey, tokenKey, installationKey }) => ({
    session: JSON.parse(localStorage.getItem(sessionKey) || "null"),
    token: localStorage.getItem(tokenKey),
    installation: localStorage.getItem(installationKey),
  }), {
    sessionKey: CUSTOMER_SESSION_KEY,
    tokenKey: ANDROID_FCM_TOKEN_KEY,
    installationKey: ANDROID_INSTALLATION_ID_KEY,
  });
  expect(preserved.session?.accessToken).toBe(sessionB.accessToken);
  expect(preserved.session?.sessionId).toBe(sessionB.sessionId);
  expect(preserved.token).toBe(fcmTokenB);
  expect(preserved.installation).toBe(installationIdB);
});

test("terminal refresh 403 clears private state and returns to normal guest login", async ({ page }) => {
  await installPersistedSession(page);
  let rejectCurrentMe = false;
  await page.route("**/api/**", async (route) => {
    const path = pathOf(route);
    if (path === "/api/users/me" && rejectCurrentMe) {
      await route.fulfill({ status: 401, json: { code: "UNAUTHORIZED", error: "expired" } });
      return;
    }
    if (path === "/api/users/refresh") {
      await route.fulfill({ status: 403, json: { code: "AUTH_CUSTOMER_ACCOUNT_INACTIVE", error: "inactive" } });
      return;
    }
    await fulfillPrivateAuthority(route);
  });

  await page.goto("/tests/account-notification-runtime-fixture.html");
  const probe = page.getByTestId("runtime-probe");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect(probe).toHaveAttribute("data-notification-phase", "ready");
  rejectCurrentMe = true;
  await page.getByRole("button", { name: "Hesabı doğrula" }).click();
  await expect(probe).toHaveAttribute("data-account-phase", "guest");
  await expect(probe).toHaveAttribute("data-notification-phase", "guest");
  await expect(page.getByTestId("customer-id")).toHaveText("guest");
  expect(await page.evaluate((key) => localStorage.getItem(key), CUSTOMER_SESSION_KEY)).toBeNull();
});

test("a delayed Customer A feed cannot repopulate after logout", async ({ page }) => {
  await installPersistedSession(page);
  let notificationRequestCount = 0;
  let notificationResponseCount = 0;
  const requestedNotificationPaths = new Set<string>();
  let releaseFeed!: () => void;
  const feedGate = new Promise<void>((resolve) => { releaseFeed = resolve; });
  await page.route("**/api/**", async (route) => {
    const path = pathOf(route);
    if (path.startsWith("/api/notifications")) {
      ++notificationRequestCount;
      requestedNotificationPaths.add(path);
      await feedGate;
      await fulfillPrivateAuthority(route);
      ++notificationResponseCount;
      return;
    }
    await fulfillPrivateAuthority(route);
  });
  await page.goto("/tests/account-notification-runtime-fixture.html");
  const probe = page.getByTestId("runtime-probe");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expect.poll(() => requestedNotificationPaths.size).toBe(2);
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await expect(probe).toHaveAttribute("data-account-phase", "guest");
  await expect(probe).toHaveAttribute("data-notification-phase", "guest");
  const expectedResponseCount = notificationRequestCount;
  releaseFeed();
  await expect.poll(() => notificationResponseCount).toBe(expectedResponseCount);
  await expect(page.getByTestId("notification-count")).toHaveText("0");
  await expect(page.getByText(notification.title)).toHaveCount(0);
});
