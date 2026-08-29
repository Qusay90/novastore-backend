import { expect, test, type Page } from "@playwright/test";

const timestamp = "2026-08-28T12:00:00.000Z";
const notification = {
  id: 7,
  type: "ORDER_STATUS_CHANGED",
  category: "ORDER",
  priority: "NORMAL",
  title: "Sipariş durumu güncellendi",
  message: "Siparişin kargoya hazırlanıyor.",
  is_read: false,
  read_at: null,
  entity_type: "order",
  entity_id: 42,
  entity_key: null,
  created_at: timestamp,
  updated_at: timestamp,
};

async function installSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("nova_user_token", "customer-session-token");
    localStorage.setItem("nova_user_info", JSON.stringify({ id: 17, fullName: "Test Müşteri", email: "test@example.invalid", role: "customer" }));
    localStorage.setItem("novastore.customer.verifiedUserId", "17");
  });
}

async function mockNotificationAuthority(page: Page, options: { deletedOrder?: boolean } = {}) {
  let read = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname + new URL(request.url()).search;
    expect(request.headers().authorization).toBe("Bearer customer-session-token");
    if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [{ ...notification, is_read: read, read_at: read ? timestamp : null }], page: { limit: 50, hasMore: false, nextCursor: null } } });
    if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: read ? 0 : 1 } });
    if (path === "/api/notifications/7/read") { read = true; return route.fulfill({ json: { notification: { ...notification, is_read: true, read_at: timestamp } } }); }
    if (path === "/api/notifications/read-all") { read = true; return route.fulfill({ json: { updatedCount: 1 } }); }
    if (path === "/api/orders/user/17") return route.fulfill({ json: options.deletedOrder ? [] : [{ id: 42 }] });
    return route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: "not found" } });
  });
}

test("authenticated notification center renders unread semantics and opens only an owned order", async ({ page }) => {
  await installSession(page);
  await mockNotificationAuthority(page);
  await page.goto("/tests/notification-runtime-fixture.html?cal=CAL-10&tab=account&view=notifications");
  await expect(page.getByTestId("notification-center-screen")).toHaveAttribute("data-feed-state", "ready");
  await expect(page.getByText("1 okunmamış bildirim")).toBeVisible();
  const item = page.getByRole("button", { name: "Sipariş durumu güncellendi okunmadı" });
  await expect(item).toContainText("Okunmadı");
  await expect(item).toHaveCSS("min-height", "82px");
  await item.click();
  await expect(page.getByTestId("notification-order-target")).toHaveAttribute("data-order-id", "42");
  await expect(page.getByRole("heading", { name: "Sipariş #42" })).toBeVisible();
});

test("deleted or unauthorized target stays in the safe notification center", async ({ page }) => {
  await installSession(page);
  await mockNotificationAuthority(page, { deletedOrder: true });
  await page.goto("/tests/notification-runtime-fixture.html?cal=CAL-10&tab=account&view=notifications");
  await page.getByRole("button", { name: "Sipariş durumu güncellendi okunmadı" }).click();
  await expect(page.getByRole("alert")).toContainText("artık kullanılamıyor veya hesabına ait değil");
  await expect(page.getByTestId("notification-center-screen")).toBeVisible();
  await expect(page.getByTestId("notification-order-target")).toHaveCount(0);
});

test("logged-out and offline states are explicit and never expose a private feed", async ({ page }) => {
  await page.goto("/tests/notification-runtime-fixture.html?cal=CAL-10&tab=account&view=notifications");
  await expect(page.getByTestId("notification-login-required")).toBeVisible();
  await expect(page.getByText("0 okunmamış bildirim")).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem("nova_user_token", "customer-session-token");
    localStorage.setItem("nova_user_info", JSON.stringify({ id: 17, fullName: "Test Müşteri", email: "test@example.invalid", role: "customer" }));
    localStorage.setItem("novastore.customer.verifiedUserId", "17");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    dispatchEvent(new Event("offline"));
  });
  await expect(page.getByTestId("notification-offline")).toBeVisible();
  await expect(page.getByText("Çevrimdışısın", { exact: false })).toBeVisible();
});
