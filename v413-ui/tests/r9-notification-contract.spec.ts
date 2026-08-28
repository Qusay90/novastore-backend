import { expect, test } from "@playwright/test";
import {
  CUSTOMER_NOTIFICATION_EVENT_TYPES,
  normalizeCustomerNotification,
  normalizeCustomerNotificationPage,
  normalizeCustomerNotificationTarget,
  normalizeCustomerPushPayload,
  resolveCustomerNotificationDestination,
} from "../src/notifications/notificationContract";
import {
  customerNotificationApiTestUtils,
  clearCustomerSession,
  fcmRegistrationPayload,
  fcmRevocationPayload,
  getCustomerUnreadCount,
  listCustomerNotifications,
  loginCustomer,
  markAllCustomerNotificationsRead,
  markCustomerNotificationRead,
  pushRevocationSatisfied,
  authorizeCustomerNotificationTarget,
} from "../src/notifications/customerNotificationApi";

const timestamp = "2026-08-28T12:00:00.000Z";

const eventRules: Record<string, readonly [string, string, string]> = {
  ORDER_CREATED: ["ORDER", "HIGH", "order"], ORDER_CANCEL_REQUESTED: ["ORDER", "HIGH", "order"], CANCELLATION_RESULT: ["ORDER", "HIGH", "order"], ORDER_STATUS_CHANGED: ["ORDER", "NORMAL", "order"],
  PAYMENT_SUCCESS: ["PAYMENT", "HIGH", "order"], PAYMENT_FAILED: ["PAYMENT", "HIGH", "order"], PAYMENT_ACTION_REQUIRED: ["PAYMENT", "HIGH", "order"], REFUND_STATUS_CHANGED: ["PAYMENT", "HIGH", "order"],
  SHIPMENT_CREATED: ["SHIPPING", "HIGH", "order"], TRACKING_UPDATED: ["SHIPPING", "NORMAL", "order"], ORDER_DELIVERED: ["SHIPPING", "HIGH", "order"],
  RETURN_REQUESTED: ["RETURN", "HIGH", "return_request"], RETURN_STATUS_CHANGED: ["RETURN", "HIGH", "return_request"], SUPPORT_REPLY: ["SUPPORT", "HIGH", "support_thread"],
  QUESTION_ANSWERED: ["QUESTION_REVIEW", "NORMAL", "product_question"], REVIEW_MODERATION_RESULT: ["QUESTION_REVIEW", "NORMAL", "review"],
};

function feedItem(type: string, target?: Record<string, unknown>) {
  const [category, priority, entityType] = eventRules[type] || ["ORDER", "HIGH", "order"];
  return {
    id: 7,
    type,
    category,
    priority,
    title: "Sipariş güncellendi",
    message: "Siparişinin yeni durumu hazır.",
    is_read: false,
    read_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    ...(target || { entity_type: entityType, entity_id: 42 }),
  };
}

test("PC1 customer event matrix accepts every supported event and rejects foreign roles", () => {
  for (const type of CUSTOMER_NOTIFICATION_EVENT_TYPES) {
    expect(normalizeCustomerNotification(feedItem(type)), type).not.toBeNull();
  }
  expect(CUSTOMER_NOTIFICATION_EVENT_TYPES).toHaveLength(16);
  expect(normalizeCustomerNotification(feedItem("ORDER_CONFIRMED"))).toBeNull();
  expect(normalizeCustomerNotification({ ...feedItem("PAYMENT_SUCCESS"), category: "ORDER" })).toBeNull();
  expect(normalizeCustomerNotification({ ...feedItem("SUPPORT_REPLY"), entity_type: "order" })).toBeNull();
  const { validUser } = customerNotificationApiTestUtils;
  expect(validUser({ id: 17, email: "customer@example.test", fullName: "Customer A", role: "customer" })).toEqual({
    id: 17, email: "customer@example.test", fullName: "Customer A", role: "customer",
  });
  expect(validUser({ id: 17, email: "seller@example.test", fullName: "Seller A", role: "seller" })).toBeNull();
  expect(validUser({ id: 17, email: "admin@example.test", fullName: "Admin A", role: "admin" })).toBeNull();
  expect(validUser({ id: 17, email: "missing-role@example.test", fullName: "No Role" })).toBeNull();
});

test("feed contract is strict, cursor-aware and fail-closed", () => {
  const page = normalizeCustomerNotificationPage({
    items: [feedItem("ORDER_STATUS_CHANGED")],
    page: { limit: 50, hasMore: true, nextCursor: "safe_cursor-1" },
  });
  expect(page.items).toHaveLength(1);
  expect(page.items[0].target).toEqual({ entityType: "order", entityId: 42 });
  expect(page.page.nextCursor).toBe("safe_cursor-1");
  expect(() => normalizeCustomerNotificationPage({ items: [{ ...feedItem("ORDER_CREATED"), url: "https://evil.invalid" }], page: { limit: 50, hasMore: false, nextCursor: null } })).toThrow();
  expect(() => normalizeCustomerNotificationPage({ notifications: [], page: {} })).toThrow();
});

test("typed targets route only to the bounded customer surfaces", () => {
  const cases = [
    [{ entityType: "order", entityId: 1 }, { cal: "CAL-09", view: "" }],
    [{ entityType: "payment", entityId: 2 }, { cal: "CAL-09", view: "" }],
    [{ entityType: "shipment", entityId: 3 }, { cal: "CAL-09", view: "" }],
    [{ entityType: "product", entityId: 4 }, { cal: "CAL-06", view: "", productId: "4" }],
    [{ entityType: "return_request", entityId: 5 }, { cal: "CAL-10", view: "returns" }],
    [{ entityType: "product_question", entityId: 6 }, { cal: "CAL-10", view: "questions" }],
    [{ entityType: "review", entityId: 7 }, { cal: "CAL-10", view: "reviews" }],
    [{ entityType: "support_thread", entityId: 8 }, { cal: "CAL-11", view: "history" }],
  ] as const;
  for (const [raw, expected] of cases) {
    const target = normalizeCustomerNotificationTarget(raw);
    expect(target).not.toBeNull();
    expect(resolveCustomerNotificationDestination(target)).toMatchObject(expected);
  }
  expect(resolveCustomerNotificationDestination(normalizeCustomerNotificationTarget({ entityType: "store", entityId: 9 }))).toMatchObject({ cal: "CAL-10", view: "notifications" });
  expect(resolveCustomerNotificationDestination(null)).toMatchObject({ cal: "CAL-10", view: "notifications" });
});

test("malformed and URL-bearing push targets fall back instead of navigating", () => {
  const valid = {
    notificationId: "9",
    type: "SUPPORT_REPLY",
    category: "SUPPORT",
    priority: "HIGH",
    title: "Destek yanıtı",
    body: "Destek ekibi yanıt verdi.",
    target: JSON.stringify({ entityType: "support_thread", entityId: 11 }),
  };
  expect(normalizeCustomerPushPayload(valid)?.target).toEqual({ entityType: "support_thread", entityId: 11 });
  expect(normalizeCustomerPushPayload({ ...valid, url: "https://evil.invalid" })).toBeNull();
  expect(normalizeCustomerPushPayload({ ...valid, target: JSON.stringify({ entityType: "support_thread", entityId: 11, url: "https://evil.invalid" }) })).toBeNull();
  expect(normalizeCustomerPushPayload({ ...valid, notificationId: "0" })).toBeNull();
});

test("native API allowlist rejects cross-origin, traversal and invented operations", () => {
  const { requestRule } = customerNotificationApiTestUtils;
  expect(requestRule("/api/notifications?limit=50&cursor=abc_123", "GET")).toEqual({ path: "/api/notifications?limit=50&cursor=abc_123", method: "GET" });
  expect(requestRule("/api/notifications/7/read", "PATCH")).toEqual({ path: "/api/notifications/7/read", method: "PATCH" });
  expect(requestRule("/api/orders/user/17", "GET")).toEqual({ path: "/api/orders/user/17", method: "GET" });
  expect(requestRule("/api/returns/9", "GET")).toEqual({ path: "/api/returns/9", method: "GET" });
  expect(requestRule("/api/questions/user", "GET")).toEqual({ path: "/api/questions/user", method: "GET" });
  expect(() => requestRule("/api/notifications?limit=50&limit=20", "GET")).toThrow();
  expect(() => requestRule("/api/notifications?cursor=abc%2Fdef", "GET")).toThrow();
  for (const [path, method] of [
    ["https://evil.invalid/api/notifications", "GET"],
    ["//evil.invalid/api/notifications", "GET"],
    ["/api/notifications?url=https://evil.invalid", "GET"],
    ["/api/notifications/0/read", "PATCH"],
    ["/api/admin/notifications", "GET"],
  ]) expect(() => requestRule(path, method)).toThrow();
});

test("real adapter flow keeps feed, read state and entity authorization server-owned", async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
  }});
  const calls: Array<{ path: string; method: string; authorization: string }> = [];
  const unread = feedItem("ORDER_STATUS_CHANGED");
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    calls.push({ path, method: String(init.method || "GET"), authorization: String((init.headers as Record<string, string>)?.authorization || "") });
    if (path === "/api/users/login") return new Response(JSON.stringify({ token: "customer-session-token", user: { id: 17, fullName: "Test Müşteri", email: "test@example.invalid", role: "customer" } }), { status: 200 });
    if (path === "/api/notifications?limit=50") return new Response(JSON.stringify({ items: [unread], page: { limit: 50, hasMore: false, nextCursor: null } }), { status: 200 });
    if (path === "/api/notifications/unread-count") return new Response(JSON.stringify({ unreadCount: 1 }), { status: 200 });
    if (path === "/api/notifications/7/read") return new Response(JSON.stringify({ notification: { ...unread, is_read: true, read_at: timestamp } }), { status: 200 });
    if (path === "/api/notifications/read-all") return new Response(JSON.stringify({ updatedCount: 1 }), { status: 200 });
    if (path === "/api/orders/user/17") return new Response(JSON.stringify([{ id: 42 }, { id: 99 }]), { status: 200 });
    return new Response(JSON.stringify({ code: "NOT_FOUND", error: "not found" }), { status: 404 });
  }});
  await loginCustomer("TEST@example.invalid", "secret-password");
  expect((await listCustomerNotifications()).items[0].isRead).toBe(false);
  expect(await getCustomerUnreadCount()).toBe(1);
  expect((await markCustomerNotificationRead(7)).isRead).toBe(true);
  expect(await markAllCustomerNotificationsRead()).toBe(1);
  expect(await authorizeCustomerNotificationTarget({ entityType: "order", entityId: 42 })).toEqual({ entityType: "order", entityId: 42 });
  expect(await authorizeCustomerNotificationTarget({ entityType: "order", entityId: 404 })).toBeNull();
  expect(calls.filter((call) => call.path !== "/api/users/login").every((call) => call.authorization === "Bearer customer-session-token")).toBe(true);
  clearCustomerSession();
});

test("FCM lifecycle payloads bind to installation, support rotation and never carry identity or URL", () => {
  const registered = fcmRegistrationPayload("new-token-0123456789", "old-token-0123456789");
  expect(registered).toMatchObject({ token: "new-token-0123456789", platform: "android", rotationPredecessor: "old-token-0123456789" });
  expect(registered.installationId).toMatch(/^[0-9a-f-]{36}$/iu);
  expect(registered).not.toHaveProperty("userId");
  expect(registered).not.toHaveProperty("url");
  const revoked = fcmRevocationPayload("new-token-0123456789");
  expect(revoked.token).toBe("new-token-0123456789");
  expect(revoked).not.toHaveProperty("authorization");
  expect(pushRevocationSatisfied(true, false, false)).toBe(false);
  expect(pushRevocationSatisfied(true, true, false)).toBe(true);
  expect(pushRevocationSatisfied(true, false, true)).toBe(true);
  expect(pushRevocationSatisfied(false, false, false)).toBe(true);
});
