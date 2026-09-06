import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { customerAccountApiTestUtils } from "../src/account/customerAccountApi";
import { canonicalNativeRoute } from "../src/native/routeContract";
import { resolveCustomerNotificationDestination } from "../src/notifications/notificationContract";

const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);
const runtimeUrl = new URL("../src/account/CustomerAccountRuntime.tsx", import.meta.url);

const sessionA = Object.freeze({
  schemaVersion: 1,
  accessToken: "customer-a-access-token-00000001",
  refreshToken: "customer-a-refresh-token-0000001",
  accessExpiresAt: "2099-01-01T00:00:00.000Z",
  refreshExpiresAt: "2099-02-01T00:00:00.000Z",
  sessionId: 117,
});

const sessionB = Object.freeze({ ...sessionA, accessToken: "customer-b-access-token-00000001", refreshToken: "customer-b-refresh-token-0000001", sessionId: 118 });

function returnRecord(id = 801, overrides: Record<string, unknown> = {}) {
  return {
    id,
    order_id: id === 801 ? 501 : 502,
    reason_code: "DAMAGED",
    note: "Kutu hasarlı geldi.",
    status: "APPROVED",
    refund_amount: 4299,
    revision: 3,
    decision_note: "Ürün depoya ulaştığında sağlayıcı işlemi başlatılacak.",
    decided_at: "2026-09-05T10:00:00.000Z",
    created_at: "2026-09-04T10:00:00.000Z",
    updated_at: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

function requestPath(route: Route) {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

function requestCustomer(route: Route) {
  return (route.request().headers().authorization || "").includes("customer-b-") ? "b" : "a";
}

function profile(customer: "a" | "b") {
  return { id: customer === "a" ? 17 : 18, fullName: `Müşteri ${customer.toUpperCase()}`, email: `customer-${customer}@example.test`, role: "customer" };
}

async function commonAuthority(route: Route, options: {
  failHistory?: () => number | null;
  failPostRefetch?: { value: boolean };
  delayHistory?: { value: boolean; started: number; completed: number; promise: Promise<void> };
  delayPostRefetch?: { value: boolean; started: number; completed: number; promise: Promise<void> };
  cancellation?: { canceled: boolean };
  delayDetailA?: Promise<void>;
} = {}) {
  const path = requestPath(route);
  const method = route.request().method();
  if (path === "/api/users/login" && method === "POST") {
    const body = route.request().postDataJSON() as { email?: string };
    const customer = body.email?.startsWith("customer-b") ? "b" : "a";
    const selected = customer === "a" ? sessionA : sessionB;
    return route.fulfill({ json: { token: selected.accessToken, refreshToken: selected.refreshToken, accessExpiresAt: selected.accessExpiresAt, refreshExpiresAt: selected.refreshExpiresAt, sessionId: selected.sessionId, user: profile(customer) } });
  }
  if (path === "/api/users/refresh" && method === "POST") {
    return route.fulfill({ status: 401, json: { code: "AUTH_REQUIRED" } });
  }
  if (path === "/api/users/logout" && method === "POST") return route.fulfill({ json: { success: true } });
  const customer = requestCustomer(route);
  const user = profile(customer);
  if (path === "/api/users/me") return route.fulfill({ json: { user } });
  if (path === "/api/addresses") return route.fulfill({ json: [] });
  if (path === `/api/orders/user/${user.id}`) {
    if (options.failPostRefetch?.value) return route.fulfill({ status: 503, json: { code: "TEMPORARY_UNAVAILABLE" } });
    if (options.delayPostRefetch?.value) {
      options.delayPostRefetch.started += 1;
      await options.delayPostRefetch.promise;
      options.delayPostRefetch.completed += 1;
    }
    return route.fulfill({ json: customer === "a" ? [{ id: 501, status: options.cancellation ? options.cancellation.canceled ? "İptal Edildi" : "Hazırlanıyor" : "Teslim Edildi", payment_status: "PAID", delivered_at: options.cancellation ? null : "2026-09-03T10:00:00.000Z", total_amount: 4299, return_id: 801, return_status: "APPROVED", return_revision: 3, items: [] }] : [] });
  }
  if (path === "/api/orders/501/cancel" && method === "POST" && options.cancellation) {
    options.cancellation.canceled = true;
    return route.fulfill({ json: { order: { id: 501, status: "İptal Edildi", payment_status: "PAID", total_amount: 4299, items: [] } } });
  }
  if (path === "/api/returns/mine") {
    if (options.delayHistory?.value) {
      options.delayHistory.started += 1;
      await options.delayHistory.promise;
      options.delayHistory.completed += 1;
    }
    const status = options.failHistory?.();
    if (status) return route.fulfill({ status, json: { code: status === 401 ? "AUTH_REQUIRED" : "TEMPORARY_UNAVAILABLE" } });
    if (options.failPostRefetch?.value) return route.fulfill({ status: 503, json: { code: "TEMPORARY_UNAVAILABLE" } });
    if (options.delayPostRefetch?.value) {
      options.delayPostRefetch.started += 1;
      await options.delayPostRefetch.promise;
      options.delayPostRefetch.completed += 1;
    }
    return route.fulfill({ json: customer === "a" ? [returnRecord()] : [returnRecord(802, { order_id: 602, status: "REJECTED", decision_note: "B müşterisinin kaydı" })] });
  }
  if (path === "/api/returns/801" && method === "GET") {
    if (customer === "a" && options.delayDetailA) await options.delayDetailA;
    return route.fulfill({ json: returnRecord(801, { order_status: "Teslim Edildi", payment_status: "PAID", refund_status: "PENDING" }) });
  }
  if (path === "/api/returns" && method === "POST") {
    if (options.failPostRefetch) options.failPostRefetch.value = true;
    if (options.delayPostRefetch) options.delayPostRefetch.value = true;
    return route.fulfill({ status: 201, json: { reused: false, return: returnRecord(901, { order_id: 501, status: "REQUESTED", revision: 1, decision_note: null, decided_at: null, refund_amount: 4299 }) } });
  }
  if (path === `/api/messages/history/${user.id}`) return route.fulfill({ json: [] });
  if (path === "/api/users/security-status") return route.fulfill({ json: { email: user.email, emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } });
  if (["/api/campaigns/coupons/active", "/api/questions/user", "/api/store-follows"].includes(path)) return route.fulfill({ json: [] });
  if (path === `/api/reviews/user/${user.id}`) return route.fulfill({ json: [] });
  if (path === "/api/favorites") return route.fulfill({ json: { productIds: [] } });
  if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
  if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 0 } });
  return route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
}

async function openRuntime(page: Page) {
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: "novastore.customer.session.v1", session: sessionA });
  await page.goto("/tests/account-notification-runtime-fixture.html");
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-account-phase", "authenticated");
}

test("R12 return and refund contracts normalize canonical truth and future states safely", () => {
  const { normalizeCustomerReturn } = customerAccountApiTestUtils;
  expect(normalizeCustomerReturn(returnRecord(801, { order_status: "Teslim Edildi", payment_status: "PAID", refund_status: "PENDING" }))).toMatchObject({
    id: 801, orderId: 501, status: "APPROVED", refundStatus: "PENDING", orderStatus: "Teslim Edildi", paymentStatus: "PAID",
  });
  expect(normalizeCustomerReturn(returnRecord(801, { status: "PROVIDER_FUTURE_STATE", refund_status: "FUTURE_REFUND_STATE" }))).toMatchObject({ status: "UNKNOWN", refundStatus: "UNKNOWN" });
  expect(normalizeCustomerReturn(returnRecord(801, { status: "FAILED" }))).toMatchObject({ status: "UNKNOWN" });
  expect(normalizeCustomerReturn(returnRecord(801, { revision: 0 }))).toBeNull();
});

test("R12 exact return route and notification destination retain only one positive canonical ID", () => {
  expect(resolveCustomerNotificationDestination({ entityType: "return_request", entityId: 801 })).toEqual({ cal: "CAL-10", tab: "account", view: "returns", returnId: "801" });
  expect(canonicalNativeRoute(new URLSearchParams("cal=CAL-10&tab=account&view=returns&returnId=801"))?.get("returnId")).toBe("801");
  expect(canonicalNativeRoute(new URLSearchParams("cal=CAL-10&tab=account&view=returns&returnAction=new"))?.get("returnAction")).toBe("new");
});

test("R12 runtime loads exact authoritative detail and keeps APPROVED separate from refund PENDING", async ({ page }) => {
  await page.route("**/api/**", (route) => commonAuthority(route));
  await openRuntime(page);
  await expect(page.getByTestId("return-history-phase")).toHaveText("ready");
  await expect(page.getByTestId("return-ids")).toHaveText("801");
  await page.getByRole("button", { name: "İade 801 ayrıntısını yükle" }).click();
  await expect(page.getByTestId("return-mutation-result")).toHaveText("detail:801");
  await expect(page.getByTestId("return-detail-status")).toHaveText("APPROVED");
  await expect(page.getByTestId("return-detail-order-status")).toHaveText("Teslim Edildi");
  await expect(page.getByTestId("return-detail-payment-status")).toHaveText("PAID");
  await expect(page.getByTestId("return-detail-refund-status")).toHaveText("PENDING");
});

test("R12 return history sequencing preserves the existing server-confirmed cancellation flow", async ({ page }) => {
  const cancellation = { canceled: false };
  await page.route("**/api/**", (route) => commonAuthority(route, { cancellation }));
  await openRuntime(page);
  await expect(page.getByTestId("order-status")).toHaveText("Hazırlanıyor");
  await page.getByRole("button", { name: "Sipariş 501 iptal et" }).click();
  await expect(page.getByTestId("order-mutation-result")).toHaveText("success");
  await expect(page.getByTestId("order-status")).toHaveText("İptal Edildi");
  await expect(page.getByTestId("return-ids")).toContainText("801");
});

test("R12 return list failure is never collapsed into a truthful empty state", async ({ page }) => {
  let failureStatus: number | null = null;
  await page.route("**/api/**", (route) => commonAuthority(route, { failHistory: () => failureStatus }));
  await openRuntime(page);
  failureStatus = 503;
  await page.getByRole("button", { name: "İadeleri yenile" }).click();
  await expect(page.getByTestId("return-history-phase")).toHaveText("error");
  await expect(page.getByTestId("return-history-error")).toContainText("boş geçmiş olarak kabul edilmedi");
  failureStatus = 401;
  await page.getByRole("button", { name: "İadeleri yenile" }).click();
  await expect(page.getByTestId("return-history-phase")).toHaveText("session-expired");
  await expect(page.getByTestId("return-count")).toHaveText("0");
});

test("R12 successful create retains returned ID even when both subsequent refetches fail", async ({ page }) => {
  const failPostRefetch = { value: false };
  await page.route("**/api/**", (route) => commonAuthority(route, { failPostRefetch }));
  await openRuntime(page);
  await page.getByRole("button", { name: "İade talebi oluştur" }).click();
  await expect(page.getByTestId("return-mutation-result")).toHaveText("created:901");
  await expect(page.getByTestId("return-ids")).toContainText("901");
  await expect(page.getByTestId("return-history-error")).toContainText("Talebiniz oluşturuldu");
});

test("R12 successful POST exposes its canonical ID before delayed follow-up refetches settle", async ({ page }) => {
  let releaseRefetch!: () => void;
  const delayPostRefetch = {
    value: false,
    started: 0,
    completed: 0,
    promise: new Promise<void>((resolve) => { releaseRefetch = resolve; }),
  };
  await page.route("**/api/**", (route) => commonAuthority(route, { delayPostRefetch }));
  await openRuntime(page);
  try {
    await page.getByRole("button", { name: "İade talebi oluştur" }).click();
    await expect(page.getByTestId("return-mutation-result")).toHaveText("created:901", { timeout: 2_000 });
    await expect(page.getByTestId("return-ids")).toContainText("901");
    await expect.poll(() => delayPostRefetch.started).toBe(2);
    expect(delayPostRefetch.completed).toBe(0);
  } finally {
    releaseRefetch();
  }
  await expect.poll(() => delayPostRefetch.completed).toBe(2);
});

test("R12 a history request started before POST cannot overwrite the preserved created ID", async ({ page }) => {
  let releaseHistory!: () => void;
  const delayHistory = {
    value: false,
    started: 0,
    completed: 0,
    promise: new Promise<void>((resolve) => { releaseHistory = resolve; }),
  };
  await page.route("**/api/**", (route) => commonAuthority(route, { delayHistory }));
  await openRuntime(page);
  delayHistory.value = true;
  await page.getByRole("button", { name: "İadeleri yenile" }).click();
  await expect.poll(() => delayHistory.started).toBe(1);
  await page.getByRole("button", { name: "İade talebi oluştur" }).click();
  await expect(page.getByTestId("return-mutation-result")).toHaveText("created:901", { timeout: 2_000 });
  await expect(page.getByTestId("return-ids")).toContainText("901");
  await expect.poll(() => delayHistory.started).toBe(2);
  releaseHistory();
  await expect.poll(() => delayHistory.completed).toBe(2);
  await expect(page.getByTestId("return-ids")).toContainText("901");
});

test("R12 logout and A to B switch suppress a delayed A return-detail callback", async ({ page }) => {
  let releaseDetail!: () => void;
  const delayedDetail = new Promise<void>((resolve) => { releaseDetail = resolve; });
  await page.route("**/api/**", (route) => commonAuthority(route, { delayDetailA: delayedDetail }));
  await openRuntime(page);
  await page.getByRole("button", { name: "İade 801 ayrıntısını yükle" }).click();
  await expect(page.getByTestId("return-detail-phase")).toHaveText("loading");
  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await page.getByRole("button", { name: "Customer B girişi" }).click();
  await expect(page.getByTestId("login-b-result")).toHaveText("success");
  releaseDetail();
  await expect(page.getByTestId("customer-id")).toHaveText("18");
  await expect(page.getByTestId("return-ids")).toHaveText("802");
  await expect(page.getByTestId("return-detail-id")).toHaveText("none");
});

test("R12 native UI keeps history permanent, separates create/detail, and gates refund success", () => {
  const source = readFileSync(prototypeUrl, "utf8");
  const runtime = readFileSync(runtimeUrl, "utf8");
  expect(source).toContain('["İade Taleplerim", <ReloadIcon />, "returns"]');
  expect(source).toContain('data-testid="return-history"');
  expect(source).toContain('data-testid="return-detail"');
  expect(source).toContain('data-testid="return-created-success"');
  expect(source).toContain('detail.refundStatus === "COMPLETED"');
  expect(source).toContain("İade onayı, paranın hesaba geçtiği anlamına gelmez.");
  expect(source).toContain('{ returnId: String(selected.returnId) } : { returnAction: "new" }');
  expect(runtime).toContain("Promise.allSettled");
  expect(runtime).toContain("upsertCustomerReturn(current, created.return)");
  expect(runtime).toContain('"CUSTOMER_SESSION_CHANGED"');
});

test("R12 native Account permanently exposes return history and terminal records open exact detail", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: "novastore.customer.session.v1", session: sessionA });
  await page.route("**/api/**", (route) => commonAuthority(route));
  await page.goto("/tests/r12-native-ui-fixture.html?cal=CAL-10&tab=account&shell=native");
  const historyEntry = page.getByRole("button", { name: "İade Taleplerim" });
  await expect(historyEntry).toBeVisible();
  await historyEntry.click();
  await expect(page.getByTestId("return-history")).toHaveAttribute("data-history-state", "ready");
  await expect(page.getByText("İade #801", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Sipariş #501.*İade #801/u }).click();
  await expect(page.getByTestId("return-detail")).toHaveAttribute("data-return-id", "801");
  await expect(page.getByTestId("return-refund-truth")).toHaveAttribute("data-refund-complete", "false");
  await expect(page.getByText("İade onayı, paranın hesaba geçtiği anlamına gelmez.")).toBeVisible();
});

test("R12 direct exact-ID route refetches detail and renders all authoritative truth fields", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: "novastore.customer.session.v1", session: sessionA });
  const detailRequests: string[] = [];
  await page.route("**/api/**", async (route) => {
    if (requestPath(route) === "/api/returns/801") detailRequests.push(requestPath(route));
    await commonAuthority(route);
  });
  await page.goto("/tests/r12-native-ui-fixture.html?cal=CAL-10&tab=account&view=returns&returnId=801&shell=native");
  await expect(page.getByTestId("return-detail")).toBeVisible();
  await expect(page.getByText("Talep detayı", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Teslim Edildi", { exact: true })).toBeVisible();
  await expect(page.getByText("PAID", { exact: true })).toBeVisible();
  await expect(page.getByText("Geri ödeme sağlayıcı işlemi bekliyor", { exact: true })).toBeVisible();
  expect(detailRequests.length).toBeGreaterThanOrEqual(1);
});
