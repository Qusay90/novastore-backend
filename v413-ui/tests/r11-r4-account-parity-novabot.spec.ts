import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";
import { customerAccountApiTestUtils } from "../src/account/customerAccountApi";
import { customerNovaBotApiTestUtils } from "../src/assistant/customerNovaBotApi";
import { customerNotificationApiTestUtils } from "../src/notifications/customerNotificationApi";

const assetUrl = new URL("../public/calibration-assets/official/support_novastore.png", import.meta.url);
const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);
const prototypeCssUrl = new URL("../src/prototype.css", import.meta.url);

test("R11-R4 Account parity normalizers preserve only canonical bounded records", () => {
  const { normalizeCustomerCoupon, normalizeCustomerQuestion, normalizeCustomerReview, normalizeCustomerFollowedStore } = customerAccountApiTestUtils;
  expect(normalizeCustomerCoupon({
    id: 1, code: "nova20", discount_type: "percent", discount_value: 20,
    min_order_amount: 500, max_discount_amount: 250, ends_at: "2026-12-31T21:00:00.000Z",
  })).toMatchObject({ code: "NOVA20", discountType: "PERCENT", discountValue: 20, minOrderAmount: 500 });
  expect(normalizeCustomerQuestion({
    id: 2, product_id: 71, product_name: "Gerçek Ürün", question: "Teslimat ne zaman?",
    answer: "Yarın kargoda.", created_at: "2026-09-01T10:00:00.000Z",
  })).toMatchObject({ id: 2, productId: 71, status: "answered" });
  expect(normalizeCustomerReview({
    id: 3, product_id: 71, product_name: "Gerçek Ürün", rating: 5,
    comment: "Başarılı.", status: "published", created_at: "2026-09-01T10:00:00.000Z",
  })).toMatchObject({ id: 3, productId: 71, rating: 5, status: "PUBLISHED" });
  expect(normalizeCustomerFollowedStore({
    store_slug: "nova-audio", store_name: "Nova Audio", following: true,
    follower_count: 42, followed_at: "2026-09-01T10:00:00.000Z",
  })).toMatchObject({ slug: "nova-audio", name: "Nova Audio", following: true });

  expect(normalizeCustomerCoupon({ id: 1, code: "BAD", discount_type: "percent", discount_value: 101, min_order_amount: 0 })).toBeNull();
  expect(normalizeCustomerQuestion({ id: 2, product_id: 0, product_name: "Yabancı", question: "?" })).toBeNull();
  expect(normalizeCustomerReview({ id: 3, product_id: 71, product_name: "Ürün", rating: 6, status: "published" })).toBeNull();
  expect(normalizeCustomerFollowedStore({ store_slug: "../admin", store_name: "Yabancı", following: true })).toBeNull();
  const longestValidCouponCode = `N${"A".repeat(63)}`;
  expect(normalizeCustomerCoupon({ id: 4, code: longestValidCouponCode, discount_type: "fixed", discount_value: 10, min_order_amount: 0 }))
    .toMatchObject({ code: longestValidCouponCode });
});

test("R11-R4 UI hardening preserves safe geometry and truthful failure states", () => {
  const source = readFileSync(prototypeUrl, "utf8");
  const css = readFileSync(prototypeCssUrl, "utf8");

  expect(css).toContain("bottom: calc(var(--shell-content-bottom-reserve) - 1px)");
  expect(css).not.toContain("bottom: calc(var(--shell-safe-bottom) + var(--shell-content-bottom-reserve) + 10px)");
  expect(css).toMatch(/\.has-global-novabot \.cal-scroll\.with-bottom-nav \.mobile-scroll-content\s*\{[^}]*padding-bottom:/u);
  expect(css).toMatch(/\[data-cal-id="CAL-10"\]\[data-view="root"\] \.account-list\s*\{[^}]*margin-top:\s*70px/u);
  expect(css).toMatch(/\.coupon-card button\s*\{[^}]*min-height:\s*48px[^}]*overflow-wrap:\s*anywhere/u);
  expect(css).toMatch(/\.followed-store-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2,minmax\(0,1fr\)\)/u);
  expect(css).toMatch(/\.suggestion-row\s*\{[^}]*overflow-x:\s*auto/u);
  expect(css).toMatch(/\.message p\s*\{[^}]*overflow-wrap:\s*anywhere/u);

  expect(source).toContain('item.delivery !== "pending" && item.delivery !== "failed"');
  expect(source).toContain('time: "Şimdi · Gönderilemedi"');
  expect(source).toContain('setMessage((current) => current.trim() ? current : clean)');
  expect(source).toContain("setNativeSuggestions([])");
  expect(source).toContain('data-testid="novabot-send-error"');
  expect(source).toContain('previousSessionIdentity.current === sessionIdentity');
  expect(source).toContain('!["CAL-01", "CAL-06", "CAL-08", "CAL-12"].includes(route.cal)');
  expect(source).toContain('route.cal !== "CAL-07"');
  expect(source).toContain('route.cal === "CAL-11" && route.view === ""');
  expect(source.match(/<GlobalNovaBotLauncher go=\{go\} \/>/g)).toHaveLength(4);
  expect(source).toContain("Bu alan boş kabul edilmedi; yeniden deneyebilirsin.");
  expect(source).not.toContain("Çevrimiçi · PC1 bağlantılı");
  expect(source).not.toContain("Kopyalandı");
});

test("R11-R4 native Account and NovaBot transport allowlists stay exact", () => {
  const { requestRule } = customerNotificationApiTestUtils;
  for (const [path, method] of [
    ["/api/campaigns/coupons/active", "GET"],
    ["/api/questions/user", "GET"],
    ["/api/reviews/user/17", "GET"],
    ["/api/store-follows", "GET"],
    ["/api/store-follows/nova-audio", "DELETE"],
    ["/api/assistant/chat", "POST"],
  ]) expect(requestRule(path, method)).toEqual({ path, method });

  for (const [path, method] of [
    ["/api/campaigns/coupons/active", "POST"],
    ["/api/reviews/user/17", "DELETE"],
    ["/api/store-follows/Nova-Audio", "DELETE"],
    ["/api/store-follows/../admin", "DELETE"],
    ["/api/assistant/chat?debug=1", "POST"],
    ["/api/assistant/escalate", "POST"],
  ]) expect(() => requestRule(path, method)).toThrow();
});

test("R11-R4 NovaBot request and response contracts reject fallback or unbounded truth", () => {
  const request = customerNovaBotApiTestUtils.normalizeRequest({
    message: " Siparişimi takip et ",
    history: [{ role: "assistant", message: "Nasıl yardımcı olabilirim?" }],
    selectedMode: "friendly",
  });
  expect(request).toEqual({
    message: "Siparişimi takip et",
    history: [{ role: "assistant", message: "Nasıl yardımcı olabilirim?" }],
    context: { selectedMode: "friendly" },
  });
  expect(customerNovaBotApiTestUtils.normalizeResponse({
    reply: "Siparişlerim ekranını açabilirsin.", suggestions: ["Siparişlerime git"], products: [], cards: [],
  })).toMatchObject({ reply: "Siparişlerim ekranını açabilirsin.", suggestions: ["Siparişlerime git"] });
  expect(() => customerNovaBotApiTestUtils.normalizeRequest({ message: "x".repeat(2001) })).toThrow();
  expect(() => customerNovaBotApiTestUtils.normalizeResponse({ suggestions: [] })).toThrow();
});

test("R11-R4 uses the exact approved NovaBot bytes and one shell insertion policy", () => {
  const bytes = readFileSync(assetUrl);
  expect(bytes.byteLength).toBe(1_694_739);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe("fee08aa17ffe034a2406a5d180d19007ab825cda5c1d31c2bb26cbb5468cb81b");
  const source = readFileSync(prototypeUrl, "utf8");
  expect(source.match(/data-testid="global-novabot-trigger"/g)).toHaveLength(1);
  expect(source).toContain("![\"CAL-01\", \"CAL-06\", \"CAL-08\", \"CAL-12\"].includes(route.cal)");
  for (const label of ["Kuponlarım", "Değerlendirmelerim", "Sorularım", "Takip Ettiğim Mağazalar"]) {
    expect(source).toContain(label);
  }
});

const sessions = {
  a: {
    schemaVersion: 1,
    accessToken: "customer-a-access-token-00000001",
    refreshToken: "customer-a-refresh-token-0000001",
    accessExpiresAt: "2099-01-01T00:00:00.000Z",
    refreshExpiresAt: "2099-02-01T00:00:00.000Z",
    sessionId: 117,
  },
  b: {
    schemaVersion: 1,
    accessToken: "customer-b-access-token-00000001",
    refreshToken: "customer-b-refresh-token-0000001",
    accessExpiresAt: "2099-01-01T00:00:00.000Z",
    refreshExpiresAt: "2099-02-01T00:00:00.000Z",
    sessionId: 118,
  },
} as const;

function requestPath(route: Route) {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

function customerFor(route: Route) {
  const authorization = route.request().headers().authorization || "";
  return authorization.includes("customer-b-") ? "b" as const : "a" as const;
}

async function fulfillParityAuthority(route: Route) {
  const path = requestPath(route);
  const method = route.request().method();
  if (path === "/api/users/login" && method === "POST") {
    const body = route.request().postDataJSON() as { email?: string };
    const key = body.email?.startsWith("customer-b") ? "b" : "a";
    const id = key === "a" ? 17 : 18;
    return route.fulfill({ json: { token: sessions[key].accessToken, refreshToken: sessions[key].refreshToken, accessExpiresAt: sessions[key].accessExpiresAt, refreshExpiresAt: sessions[key].refreshExpiresAt, sessionId: sessions[key].sessionId, user: { id, fullName: `Müşteri ${key.toUpperCase()}`, email: `customer-${key}@example.test`, role: "customer" } } });
  }
  if (path === "/api/users/logout" && method === "POST") return route.fulfill({ json: { success: true } });
  const key = customerFor(route);
  const id = key === "a" ? 17 : 18;
  const suffix = key.toUpperCase();
  if (path === "/api/users/me") return route.fulfill({ json: { user: { id, fullName: `Müşteri ${suffix}`, email: `customer-${key}@example.test`, role: "customer" } } });
  if (path === "/api/addresses") return route.fulfill({ json: [] });
  if (path === `/api/orders/user/${id}`) return route.fulfill({ json: [] });
  if (path === "/api/returns/mine") return route.fulfill({ json: [] });
  if (path === `/api/messages/history/${id}`) return route.fulfill({ json: [] });
  if (path === "/api/users/security-status") return route.fulfill({ json: { email: `customer-${key}@example.test`, emailVerified: false, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } });
  if (path === "/api/campaigns/coupons/active") return route.fulfill({ json: [{ id: 701, code: "NOVA20", discount_type: "PERCENT", discount_value: 20, min_order_amount: 500, max_discount_amount: 250 }] });
  if (path === "/api/questions/user") return route.fulfill({ json: [{ id: key === "a" ? 801 : 802, product_id: 71, product_name: `Ürün ${suffix}`, question: `${suffix} özel sorusu`, answer: null }] });
  if (path === `/api/reviews/user/${id}`) return route.fulfill({ json: [{ id: key === "a" ? 901 : 902, product_id: 71, product_name: `Ürün ${suffix}`, rating: 5, comment: `${suffix} özel değerlendirmesi`, status: "PUBLISHED" }] });
  if (path === "/api/store-follows") return route.fulfill({ json: [{ store_slug: `magaza-${key}`, store_name: `Mağaza ${suffix}`, following: true, follower_count: 10 }] });
  if (path === "/api/notifications?limit=50") return route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
  if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 0 } });
  return route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: "not found" } });
}

async function expectParityCounts(page: Page, count: string) {
  for (const id of ["coupon-count", "question-count", "review-count", "followed-store-count"]) {
    await expect(page.getByTestId(id)).toHaveText(count);
  }
}

test("R11-R4 logout and Customer A to B switch clear every new private Account collection", async ({ page }) => {
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: "novastore.customer.session.v1",
    session: sessions.a,
  });
  await page.route("**/api/**", fulfillParityAuthority);
  await page.goto("/tests/account-notification-runtime-fixture.html");
  const probe = page.getByTestId("runtime-probe");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expectParityCounts(page, "1");
  await expect(page.getByTestId("account-parity-data")).toContainText("A özel sorusu");
  await expect(page.getByTestId("account-parity-data")).not.toContainText("B özel sorusu");

  await page.getByRole("button", { name: "Çıkış yap" }).click();
  await expect(probe).toHaveAttribute("data-account-phase", "guest");
  await expectParityCounts(page, "0");
  await expect(page.getByTestId("account-parity-data")).toHaveText("");

  await page.getByRole("button", { name: "Customer B girişi" }).click();
  await expect(page.getByTestId("login-b-result")).toHaveText("success");
  await expect(probe).toHaveAttribute("data-account-phase", "authenticated");
  await expectParityCounts(page, "1");
  await expect(page.getByTestId("account-parity-data")).toContainText("B özel sorusu");
  await expect(page.getByTestId("account-parity-data")).not.toContainText("A özel sorusu");
});
