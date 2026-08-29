import { expect, test } from "@playwright/test";
import {
  createCustomerAddress,
  customerAccountApiTestUtils,
  getCurrentCustomer,
  listCustomerAddresses,
  listCustomerOrders,
  listCustomerSupportMessages,
  updateCustomerProfile,
} from "../src/account/customerAccountApi";
import {
  clearCustomerSession,
  customerNotificationApiTestUtils,
  hasVerifiedCustomerSession,
  loginCustomer,
  markCustomerSessionVerified,
} from "../src/notifications/customerNotificationApi";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      removeItem: (key: string) => values.delete(key),
    },
  };
}

test("R10 account normalizers reject foreign roles, incomplete addresses and unsafe media", () => {
  const { normalizeCustomerProfile, normalizeCustomerAddress, normalizeCustomerOrder } = customerAccountApiTestUtils;
  expect(normalizeCustomerProfile({ id: 7, fullName: "Müşteri A", email: "A@example.test", role: "customer" })).toEqual({
    id: 7, fullName: "Müşteri A", email: "a@example.test", phone: null, role: "customer",
  });
  expect(normalizeCustomerProfile({ id: 7, email: "seller@example.test", role: "seller" })).toBeNull();
  expect(normalizeCustomerProfile({ id: 7, email: "admin@example.test", role: "admin" })).toBeNull();
  expect(normalizeCustomerAddress({ id: 3, city: "İstanbul", district: "Kadıköy" })).toBeNull();
  expect(normalizeCustomerOrder({
    id: 12,
    total_amount: "1499.90",
    items: JSON.stringify([{ id: 9, name: "Gerçek Ürün", quantity: 2, price: 749.95, image: "http://unsafe.invalid/item.png" }]),
  })?.items[0].image).toBe("");
});

test("R10 native account transport is allowlisted narrowly", () => {
  const { requestRule } = customerNotificationApiTestUtils;
  for (const [path, method] of [
    ["/api/users/me", "GET"], ["/api/users/me", "PATCH"], ["/api/users/register", "POST"],
    ["/api/users/refresh", "POST"],
    ["/api/users/security-status", "GET"], ["/api/addresses", "GET"], ["/api/addresses", "POST"],
    ["/api/addresses/7", "PUT"], ["/api/addresses/7/default", "PATCH"], ["/api/addresses/7", "DELETE"],
    ["/api/orders/user/7", "GET"], ["/api/messages/history/7", "GET"], ["/api/messages/send", "POST"],
  ]) expect(requestRule(path, method)).toEqual({ path, method });
  for (const [path, method] of [
    ["/api/users/7", "GET"], ["/api/orders/user/8", "DELETE"], ["/api/addresses/0", "DELETE"],
    ["/api/admin/users", "GET"], ["https://evil.invalid/api/users/me", "GET"],
  ]) expect(() => requestRule(path, method)).toThrow();
});

test("R10 customer A and B receive only their own profile, addresses, orders and support history", async () => {
  const { values, storage } = memoryStorage();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  let activeCustomer: "a" | "b" = "a";
  const calls: Array<{ path: string; authorization: string }> = [];
  Object.defineProperty(globalThis, "fetch", { configurable: true, value: async (input: string, init: RequestInit = {}) => {
    const path = String(input);
    const authorization = String((init.headers as Record<string, string>)?.authorization || "");
    calls.push({ path, authorization });
    if (path === "/api/users/login") {
      const body = JSON.parse(String(init.body || "{}"));
      activeCustomer = body.email.startsWith("b@") ? "b" : "a";
      const id = activeCustomer === "a" ? 17 : 18;
      return new Response(JSON.stringify({
        token: `customer-${activeCustomer}-session-token`,
        refreshToken: `customer-${activeCustomer}-refresh-token`,
        accessExpiresAt: "2099-01-01T00:00:00.000Z",
        refreshExpiresAt: "2099-02-01T00:00:00.000Z",
        sessionId: id,
        user: { id, fullName: `Müşteri ${activeCustomer.toUpperCase()}`, email: `${activeCustomer}@example.test`, role: "customer" },
      }), { status: 200 });
    }
    const id = activeCustomer === "a" ? 17 : 18;
    if (authorization !== `Bearer customer-${activeCustomer}-session-token`) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    if (path === "/api/users/me" && init.method === "PATCH") return new Response(JSON.stringify({ user: { id, fullName: `Güncel ${activeCustomer.toUpperCase()}`, email: `${activeCustomer}@example.test`, phone: "+905550000001", role: "customer" } }), { status: 200 });
    if (path === "/api/users/me") return new Response(JSON.stringify({ user: { id, fullName: `Müşteri ${activeCustomer.toUpperCase()}`, email: `${activeCustomer}@example.test`, role: "customer" } }), { status: 200 });
    if (path === "/api/addresses" && init.method === "POST") return new Response(JSON.stringify({ id: activeCustomer === "a" ? 101 : 201, title: "Ev", fullName: `Müşteri ${activeCustomer.toUpperCase()}`, phone: "05550000001", city: "İstanbul", district: "Kadıköy", addressLine: `${activeCustomer.toUpperCase()} Sokağı 1`, isDefault: true }), { status: 201 });
    if (path === "/api/addresses") return new Response(JSON.stringify([{ id: activeCustomer === "a" ? 101 : 201, title: "Ev", fullName: `Müşteri ${activeCustomer.toUpperCase()}`, phone: "05550000001", city: "İstanbul", district: "Kadıköy", addressLine: `${activeCustomer.toUpperCase()} Sokağı 1`, isDefault: true }]), { status: 200 });
    if (path === `/api/orders/user/${id}`) return new Response(JSON.stringify([{ id: activeCustomer === "a" ? 301 : 401, status: "Hazırlanıyor", total_amount: 1499.9, items: [] }]), { status: 200 });
    if (path === `/api/messages/history/${id}`) return new Response(JSON.stringify([{ id: activeCustomer === "a" ? 501 : 601, sender_id: id, message: `${activeCustomer.toUpperCase()} destek mesajı` }]), { status: 200 });
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }});

  await loginCustomer("a@example.test", "customer-password");
  expect(hasVerifiedCustomerSession()).toBe(false);
  markCustomerSessionVerified({ id: 17, fullName: "Müşteri A", email: "a@example.test", role: "customer" });
  expect(hasVerifiedCustomerSession()).toBe(true);
  expect((await getCurrentCustomer()).id).toBe(17);
  expect((await listCustomerAddresses())[0].addressLine).toBe("A Sokağı 1");
  expect((await listCustomerOrders(17))[0].id).toBe(301);
  expect((await listCustomerSupportMessages(17))[0].message).toBe("A destek mesajı");
  expect((await createCustomerAddress({ title: "Ev", fullName: "Müşteri A", phone: "05550000001", city: "İstanbul", district: "Kadıköy", addressLine: "A Sokağı 1", isDefault: true })).id).toBe(101);
  expect((await updateCustomerProfile("Güncel A", "+905550000001")).fullName).toBe("Güncel A");

  await clearCustomerSession();
  await loginCustomer("b@example.test", "customer-password");
  expect(hasVerifiedCustomerSession()).toBe(false);
  markCustomerSessionVerified({ id: 18, fullName: "Müşteri B", email: "b@example.test", role: "customer" });
  expect(hasVerifiedCustomerSession()).toBe(true);
  expect((await getCurrentCustomer()).id).toBe(18);
  expect((await listCustomerAddresses())[0].addressLine).toBe("B Sokağı 1");
  expect((await listCustomerOrders(18))[0].id).toBe(401);
  expect((await listCustomerSupportMessages(18))[0].message).toBe("B destek mesajı");
  expect(values.get("novastore.customer.session.v1") ?? "").not.toContain("b@example.test");
  expect(calls.filter((call) => call.path !== "/api/users/login" && call.authorization.includes("customer-a")).length).toBeGreaterThan(0);
  expect(calls.filter((call) => call.path !== "/api/users/login" && call.authorization.includes("customer-b")).length).toBeGreaterThan(0);
  await clearCustomerSession();
});

test("checkout address-change typography is compact without shrinking its control", async ({ page }) => {
  await page.goto("/?cal=CAL-08&tab=cart&capture=1&layout=phone&logicalWidth=411.428571&logicalHeight=914.285714&scale=2.625");
  const button = page.getByRole("button", { name: "Adresi değiştir" });
  await expect(button).toBeVisible();
  await expect(button).toHaveCSS("font-size", "8.5px");
  await expect(button).toHaveCSS("min-height", "34px");
  await expect(button).toHaveCSS("white-space", "nowrap");
});
