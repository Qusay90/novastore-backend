import { expect, test } from "@playwright/test";

const profile = Object.freeze({
  id: 17,
  fullName: "Gerçek Müşteri A",
  email: "customer-a@example.test",
  role: "customer",
});

const session = Object.freeze({
  accessToken: "customer-a-access-token",
  refreshToken: "customer-a-refresh-token",
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  refreshExpiresAt: "2099-02-01T00:00:00.000Z",
  sessionId: 71,
});

test("a cold Android push action waits for the same durable Customer session to verify", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(({ customer, storedSession }) => {
    const scope = globalThis as typeof globalThis & {
      androidBridge: Record<string, never>;
      Capacitor: Record<string, unknown>;
      __nativeApiRequests: Array<{ path: string; method: string; token: string }>;
      __notificationOpens: unknown[];
      __pushListeners: Record<string, (payload: unknown) => void>;
      __releaseCustomerMe: () => void;
      __emitPushAction: (payload: unknown) => void;
    };
    let releaseCustomerMe!: () => void;
    const customerMeGate = new Promise<void>((resolve) => { releaseCustomerMe = resolve; });
    scope.__nativeApiRequests = [];
    scope.__notificationOpens = [];
    scope.__pushListeners = {};
    scope.__releaseCustomerMe = releaseCustomerMe;
    scope.__emitPushAction = (payload) => scope.__pushListeners.pushNotificationActionPerformed?.(payload);
    globalThis.addEventListener("novastore:notification-open", (event) => {
      scope.__notificationOpens.push((event as CustomEvent).detail);
    });

    const methods = (names: readonly string[]) => names.map((name) => ({ name, rtype: "promise" }));
    scope.androidBridge = {};
    scope.Capacitor = {
      PluginHeaders: [
        {
          name: "PushNotifications",
          methods: [
            { name: "addListener", rtype: "callback" },
            { name: "removeListener", rtype: "callback" },
            ...methods(["checkPermissions", "requestPermissions", "register", "unregister", "createChannel"]),
          ],
        },
        { name: "NovaCustomerSession", methods: methods(["load", "replace", "clear"]) },
        { name: "NovaNotificationApi", methods: methods(["request", "getNotificationCapability", "openNotificationSettings"]) },
      ],
      nativeCallback(pluginName: string, methodName: string, options: Record<string, unknown>, callback: (payload: unknown) => void) {
        if (pluginName === "PushNotifications" && methodName === "addListener") {
          scope.__pushListeners[String(options.eventName)] = callback;
          return Promise.resolve(`listener-${String(options.eventName)}`);
        }
        if (pluginName === "PushNotifications" && methodName === "removeListener") {
          const eventName = String(options.eventName);
          if (scope.__pushListeners[eventName] === callback) delete scope.__pushListeners[eventName];
          return Promise.resolve(null);
        }
        return Promise.reject(new Error(`UNEXPECTED_NATIVE_CALLBACK:${pluginName}:${methodName}`));
      },
      async nativePromise(pluginName: string, methodName: string, options: Record<string, unknown> = {}) {
        if (pluginName === "NovaCustomerSession" && methodName === "load") {
          return { generation: 5, session: storedSession };
        }
        if (pluginName === "NovaNotificationApi" && methodName === "getNotificationCapability") {
          return { providerConfigured: true, notificationsEnabled: true, sdkInt: 35 };
        }
        if (pluginName === "PushNotifications" && methodName === "checkPermissions") {
          return { receive: "granted" };
        }
        if (pluginName === "NovaNotificationApi" && methodName === "request") {
          const path = String(options.path ?? "");
          const method = String(options.method ?? "GET");
          const token = String(options.token ?? "");
          scope.__nativeApiRequests.push({ path, method, token });
          if (path === "/api/users/me") {
            await customerMeGate;
            return { status: 200, payload: { user: customer } };
          }
          if (path === "/api/notifications/701/read") {
            return {
              status: 200,
              payload: {
                notification: {
                  id: 701,
                  type: "RETURN_REQUESTED",
                  category: "RETURN",
                  priority: "HIGH",
                  title: "İade talebiniz alındı",
                  message: "İade talebiniz incelemeye alındı.",
                  is_read: true,
                  read_at: "2026-08-30T01:00:00.000Z",
                  entity_type: "return_request",
                  entity_id: 801,
                  entity_key: null,
                  created_at: "2026-08-30T01:00:00.000Z",
                  updated_at: "2026-08-30T01:00:00.000Z",
                },
              },
            };
          }
          if (path === "/api/returns/801") return { status: 200, payload: { id: 801 } };
          if (path === "/api/notifications?limit=50") {
            return { status: 200, payload: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } };
          }
          if (path === "/api/notifications/unread-count") return { status: 200, payload: { unreadCount: 0 } };
          if (path === "/api/addresses" || path === `/api/orders/user/${customer.id}` || path === `/api/messages/history/${customer.id}`) {
            return { status: 200, payload: [] };
          }
          if (path === "/api/users/security-status") {
            return { status: 200, payload: { email: customer.email, emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } };
          }
          return { status: 404, payload: { code: "NOT_FOUND", error: "not found" } };
        }
        return Promise.resolve(null);
      },
    };
  }, { customer: profile, storedSession: session });

  await page.goto("/tests/account-notification-runtime-fixture.html");
  await expect(page.getByTestId("runtime-probe")).toBeVisible();
  await expect.poll(async () => ({
    ...(await page.evaluate(() => {
      const scope = globalThis as typeof globalThis & {
        Capacitor?: { getPlatform?: () => string; isNativePlatform?: () => boolean };
        __pushListeners?: Record<string, unknown>;
      };
      return {
        listenerReady: Boolean(scope.__pushListeners?.pushNotificationActionPerformed),
        platform: scope.Capacitor?.getPlatform?.(),
        native: scope.Capacitor?.isNativePlatform?.(),
      };
    })),
    pageErrors,
  })).toEqual({ listenerReady: true, platform: "android", native: true, pageErrors: [] });

  await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & { __emitPushAction: (payload: unknown) => void };
    scope.__emitPushAction({
      notification: {
        title: "İade talebiniz alındı",
        body: "İade talebiniz incelemeye alındı.",
        data: {
          notificationId: 701,
          type: "RETURN_REQUESTED",
          category: "RETURN",
          priority: "HIGH",
          title: "İade talebiniz alındı",
          body: "İade talebiniz incelemeye alındı.",
          target: JSON.stringify({ entityType: "return_request", entityId: 801 }),
        },
      },
    });
    globalThis.dispatchEvent(new Event("offline"));
    globalThis.dispatchEvent(new Event("online"));
  });

  const beforeVerification = await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __nativeApiRequests: Array<{ path: string; method: string }>;
      __notificationOpens: unknown[];
    };
    return {
      openCount: scope.__notificationOpens.length,
      readCount: scope.__nativeApiRequests.filter((request) => request.path === "/api/notifications/701/read").length,
      targetCount: scope.__nativeApiRequests.filter((request) => request.path === "/api/returns/801").length,
    };
  });
  expect(beforeVerification).toEqual({ openCount: 0, readCount: 0, targetCount: 0 });

  await page.evaluate(() => (globalThis as typeof globalThis & { __releaseCustomerMe: () => void }).__releaseCustomerMe());
  await expect(page.getByTestId("customer-id")).toHaveText("17");
  await expect.poll(async () => page.evaluate(() => (globalThis as typeof globalThis & { __notificationOpens: unknown[] }).__notificationOpens.length)).toBe(1);

  const afterVerification = await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __nativeApiRequests: Array<{ path: string; method: string; token: string }>;
      __notificationOpens: unknown[];
    };
    return {
      opens: scope.__notificationOpens,
      readRequests: scope.__nativeApiRequests.filter((request) => request.path === "/api/notifications/701/read"),
      targetRequests: scope.__nativeApiRequests.filter((request) => request.path === "/api/returns/801"),
    };
  });
  expect(afterVerification.opens).toEqual([{
    notificationId: 701,
    target: { entityType: "return_request", entityId: 801 },
  }]);
  expect(afterVerification.readRequests).toEqual([{ path: "/api/notifications/701/read", method: "PATCH", token: session.accessToken }]);
  expect(afterVerification.targetRequests).toEqual([{ path: "/api/returns/801", method: "GET", token: session.accessToken }]);

  await page.evaluate(() => globalThis.dispatchEvent(new Event("novastore:auth-verified")));
  await page.waitForTimeout(50);
  const repeatedVerificationCounts = await page.evaluate(() => {
    const scope = globalThis as typeof globalThis & {
      __nativeApiRequests: Array<{ path: string }>;
      __notificationOpens: unknown[];
    };
    return {
      openCount: scope.__notificationOpens.length,
      readCount: scope.__nativeApiRequests.filter((request) => request.path === "/api/notifications/701/read").length,
      targetCount: scope.__nativeApiRequests.filter((request) => request.path === "/api/returns/801").length,
    };
  });
  expect(repeatedVerificationCounts).toEqual({ openCount: 1, readCount: 1, targetCount: 1 });
});
