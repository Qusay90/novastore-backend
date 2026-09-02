import { expect, test, type Page, type Route } from "@playwright/test";

const SESSION_KEY = "novastore.customer.session.v1";
const sessions = {
  a: {
    schemaVersion: 1,
    accessToken: "follow-fixture-a-access-token-0001",
    refreshToken: "follow-fixture-a-refresh-token-001",
    accessExpiresAt: "2099-01-01T00:00:00.000Z",
    refreshExpiresAt: "2099-02-01T00:00:00.000Z",
    sessionId: 501,
  },
  b: {
    schemaVersion: 1,
    accessToken: "follow-fixture-b-access-token-0001",
    refreshToken: "follow-fixture-b-refresh-token-001",
    accessExpiresAt: "2099-01-01T00:00:00.000Z",
    refreshExpiresAt: "2099-02-01T00:00:00.000Z",
    sessionId: 502,
  },
} as const;

type CustomerKey = keyof typeof sessions;
type FollowState = { following: boolean; followerCount: number };

function requestPath(route: Route) {
  const url = new URL(route.request().url());
  return url.pathname;
}

function customerFor(route: Route): CustomerKey {
  return (route.request().headers().authorization || "").includes("fixture-b-") ? "b" : "a";
}

function customerRecord(customer: CustomerKey) {
  const id = customer === "a" ? 17 : 18;
  return { id, fullName: `Müşteri ${customer.toUpperCase()}`, email: `customer-${customer}@example.test`, role: "customer" };
}

function followPayload(slug: string, state: FollowState) {
  return { store_slug: slug, following: state.following, follower_count: state.followerCount };
}

type FollowAuthority = {
  states: Record<CustomerKey, Record<string, FollowState>>;
  calls: Array<{ customer: CustomerKey; method: string; path: string }>;
  failNextMutation?: { method: "POST" | "DELETE"; status: number } | null;
  delayCustomerAGet?: boolean;
  delayedCustomerAGetRoutes?: Route[];
};

function createAuthority(): FollowAuthority {
  return {
    states: {
      a: {
        "nova-audio": { following: false, followerCount: 40 },
        "nova-teknoloji": { following: false, followerCount: 7 },
      },
      b: {
        "nova-audio": { following: false, followerCount: 9 },
        "nova-teknoloji": { following: false, followerCount: 3 },
      },
    },
    calls: [],
    failNextMutation: null,
    delayCustomerAGet: false,
    delayedCustomerAGetRoutes: [],
  };
}

async function fulfillCustomerAuthority(route: Route, authority: FollowAuthority) {
  const path = requestPath(route);
  const method = route.request().method();
  if (path === "/api/users/login" && method === "POST") {
    const body = route.request().postDataJSON() as { email?: string };
    const customer: CustomerKey = body.email?.startsWith("customer-b") ? "b" : "a";
    return route.fulfill({ json: {
      token: sessions[customer].accessToken,
      refreshToken: sessions[customer].refreshToken,
      accessExpiresAt: sessions[customer].accessExpiresAt,
      refreshExpiresAt: sessions[customer].refreshExpiresAt,
      sessionId: sessions[customer].sessionId,
      user: customerRecord(customer),
    } });
  }
  if (path === "/api/users/logout" && method === "POST") return route.fulfill({ json: { success: true } });

  const customer = customerFor(route);
  const user = customerRecord(customer);
  if (path === "/api/users/me") return route.fulfill({ json: { user } });
  if (path === "/api/addresses") return route.fulfill({ json: [] });
  if (path === `/api/orders/user/${user.id}`) return route.fulfill({ json: [] });
  if (path === "/api/returns/mine") return route.fulfill({ json: [] });
  if (path === `/api/messages/history/${user.id}`) return route.fulfill({ json: [] });
  if (path === "/api/users/security-status") return route.fulfill({ json: { email: user.email, emailVerified: true, phone: null, phoneVerified: false, twoFactorEnabled: false, hasPassword: true } });
  if (path === "/api/campaigns/coupons/active") return route.fulfill({ json: [] });
  if (path === "/api/questions/user") return route.fulfill({ json: [] });
  if (path === `/api/reviews/user/${user.id}`) return route.fulfill({ json: [] });
  if (path === "/api/store-follows" && method === "GET") {
    const followed = Object.entries(authority.states[customer])
      .filter(([, state]) => state.following)
      .map(([slug, state]) => ({ ...followPayload(slug, state), store_name: slug === "nova-audio" ? "Nova Audio" : "Nova Teknoloji", followed_at: "2026-09-02T08:00:00.000Z" }));
    return route.fulfill({ json: followed });
  }
  if (path === "/api/notifications") return route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
  if (path === "/api/notifications/unread-count") return route.fulfill({ json: { unreadCount: 0 } });

  const match = /^\/api\/store-follows\/([a-z0-9-]+)$/u.exec(path);
  if (match) {
    const slug = match[1];
    authority.calls.push({ customer, method, path });
    const state = authority.states[customer][slug] ?? (authority.states[customer][slug] = { following: false, followerCount: 0 });
    if (method === "GET" && customer === "a" && authority.delayCustomerAGet) {
      authority.delayedCustomerAGetRoutes?.push(route);
      return;
    }
    if ((method === "POST" || method === "DELETE") && authority.failNextMutation?.method === method) {
      const status = authority.failNextMutation.status;
      authority.failNextMutation = null;
      return route.fulfill({ status, json: { code: "FOLLOW_FIXTURE_REJECTED", error: "Takip isteği sunucu tarafından reddedildi." } });
    }
    if (method === "POST" && !state.following) {
      state.following = true;
      state.followerCount += 1;
    } else if (method === "DELETE" && state.following) {
      state.following = false;
      state.followerCount -= 1;
    }
    return route.fulfill({ json: followPayload(slug, state) });
  }
  return route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: "not found" } });
}

async function startAuthenticatedFixture(page: Page, authority: FollowAuthority, customer: CustomerKey = "a") {
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: SESSION_KEY,
    session: sessions[customer],
  });
  await page.route("**/api/**", (route) => fulfillCustomerAuthority(route, authority));
  await page.goto("/tests/account-notification-runtime-fixture.html");
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-account-phase", "authenticated");
}

async function mountFollowProbe(page: Page) {
  await page.getByRole("button", { name: "Takip bileşenini aç/kapat" }).click();
  return page.getByTestId("store-follow-probe");
}

test("R11-R5 follow lifecycle refetches route and remount truth and propagates confirmed POST/DELETE", async ({ page }) => {
  const authority = createAuthority();
  await startAuthenticatedFixture(page, authority);
  const probe = await mountFollowProbe(page);

  await expect(probe).toHaveAttribute("data-phase", "ready");
  await expect(probe).toHaveAttribute("data-following", "false");
  await expect(page.getByTestId("store-follow-count")).toHaveText("40");

  await page.getByRole("button", { name: "Mağazayı takip et" }).click();
  await expect(page.getByTestId("store-follow-mutation-result")).toHaveText("confirmed");
  await expect(probe).toHaveAttribute("data-following", "true");
  await expect(page.getByTestId("store-follow-count")).toHaveText("41");
  await expect(page.getByTestId("followed-store-count")).toHaveText("1");
  expect(authority.calls.filter((call) => call.method === "POST" && call.path.endsWith("/nova-audio"))).toHaveLength(1);

  await page.getByRole("button", { name: "Mağaza rotasını değiştir" }).click();
  await expect(page.getByTestId("store-follow-slug")).toHaveText("nova-teknoloji");
  await expect(probe).toHaveAttribute("data-phase", "ready");
  await expect(probe).toHaveAttribute("data-following", "false");
  await expect(page.getByTestId("store-follow-count")).toHaveText("7");

  await page.getByRole("button", { name: "Mağaza rotasını değiştir" }).click();
  await expect(page.getByTestId("store-follow-slug")).toHaveText("nova-audio");
  await expect(probe).toHaveAttribute("data-following", "true");
  await expect(page.getByTestId("store-follow-count")).toHaveText("41");

  const audioGetCountBeforeRemount = authority.calls.filter((call) => call.method === "GET" && call.path.endsWith("/nova-audio")).length;
  await page.getByRole("button", { name: "Takip bileşenini aç/kapat" }).click();
  await expect(page.getByTestId("store-follow-probe")).toHaveCount(0);
  await page.getByRole("button", { name: "Takip bileşenini aç/kapat" }).click();
  await expect(page.getByTestId("store-follow-probe")).toHaveAttribute("data-phase", "ready");
  expect(authority.calls.filter((call) => call.method === "GET" && call.path.endsWith("/nova-audio")).length).toBeGreaterThan(audioGetCountBeforeRemount);

  await page.getByRole("button", { name: "Mağaza takibini bırak" }).click();
  await expect(page.getByTestId("store-follow-mutation-result")).toHaveText("confirmed");
  await expect(page.getByTestId("store-follow-probe")).toHaveAttribute("data-following", "false");
  await expect(page.getByTestId("store-follow-count")).toHaveText("40");
  await expect(page.getByTestId("followed-store-count")).toHaveText("0");
  expect(authority.calls.filter((call) => call.method === "DELETE" && call.path.endsWith("/nova-audio"))).toHaveLength(1);
});

test("R11-R5 rejected mutation preserves the last server-confirmed follow state", async ({ page }) => {
  const authority = createAuthority();
  authority.failNextMutation = { method: "POST", status: 409 };
  await startAuthenticatedFixture(page, authority);
  const probe = await mountFollowProbe(page);
  await expect(probe).toHaveAttribute("data-phase", "ready");
  await expect(probe).toHaveAttribute("data-following", "false");

  await page.getByRole("button", { name: "Mağazayı takip et" }).click();
  await expect(page.getByTestId("store-follow-mutation-result")).toHaveText("rejected");
  await expect(probe).toHaveAttribute("data-phase", "ready");
  await expect(probe).toHaveAttribute("data-following", "false");
  await expect(page.getByTestId("store-follow-count")).toHaveText("40");
  await expect(page.getByTestId("store-follow-error")).not.toHaveText("");
  await expect(page.getByTestId("followed-store-count")).toHaveText("0");
});

test("R11-R5 guest and preview modes never emit a follow read or mutation", async ({ page }) => {
  const authority = createAuthority();
  await page.route("**/api/**", (route) => fulfillCustomerAuthority(route, authority));
  await page.goto("/tests/account-notification-runtime-fixture.html");
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-account-phase", "guest");
  const probe = await mountFollowProbe(page);
  await expect(probe).toHaveAttribute("data-phase", "guest");
  await page.getByRole("button", { name: "Mağazayı takip et" }).click();
  await expect(page.getByTestId("store-follow-mutation-result")).toHaveText("rejected");
  expect(authority.calls).toHaveLength(0);

  await page.getByRole("button", { name: "Canlı/önizleme değiştir" }).click();
  await expect(probe).toHaveAttribute("data-phase", "disabled");
  await page.getByRole("button", { name: "Mağazayı takip et" }).click();
  expect(authority.calls).toHaveLength(0);
});

test("R11-R5 delayed Customer A GET cannot overwrite Customer B follow truth", async ({ page }) => {
  const authority = createAuthority();
  authority.states.a["nova-audio"] = { following: true, followerCount: 999 };
  authority.delayCustomerAGet = true;
  await startAuthenticatedFixture(page, authority);
  const probe = await mountFollowProbe(page);
  await expect.poll(() => authority.delayedCustomerAGetRoutes?.length ?? 0).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Customer B girişi" }).click();
  await expect(page.getByTestId("login-b-result")).toHaveText("success");
  await expect(page.getByTestId("customer-id")).toHaveText("18");
  await expect(probe).toHaveAttribute("data-phase", "ready");
  await expect(probe).toHaveAttribute("data-following", "false");
  await expect(page.getByTestId("store-follow-count")).toHaveText("9");

  authority.delayCustomerAGet = false;
  for (const delayedRoute of authority.delayedCustomerAGetRoutes ?? []) {
    await delayedRoute.fulfill({ json: followPayload("nova-audio", authority.states.a["nova-audio"]) }).catch(() => undefined);
  }
  await page.waitForTimeout(100);
  await expect(probe).toHaveAttribute("data-following", "false");
  await expect(page.getByTestId("store-follow-count")).toHaveText("9");
});
