import { expect, test, type Page, type Route } from "@playwright/test";

type CustomerKey = "a" | "b";

type RecordedCall = Readonly<{
  customer: CustomerKey;
  method: string;
  path: string;
  body: unknown;
}>;

type DeferredRoute = Readonly<{
  route: Route;
  resolve(): void;
}>;

type Authority = {
  favoriteIds: Record<CustomerKey, number[]>;
  questions: Record<CustomerKey, Array<Record<string, unknown>>>;
  reviews: Record<CustomerKey, Array<Record<string, unknown>>>;
  calls: RecordedCall[];
  failNextFavoriteMutation: boolean;
  failNextQuestion: boolean;
  failNextReview: boolean;
  delayNextCustomerAFavoriteMutation: boolean;
  deferredFavoriteMutation: DeferredRoute | null;
};

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

function createAuthority(): Authority {
  return {
    favoriteIds: { a: [70], b: [72] },
    questions: { a: [], b: [] },
    reviews: { a: [], b: [] },
    calls: [],
    failNextFavoriteMutation: false,
    failNextQuestion: false,
    failNextReview: false,
    delayNextCustomerAFavoriteMutation: false,
    deferredFavoriteMutation: null,
  };
}

function requestPath(route: Route) {
  const url = new URL(route.request().url());
  return `${url.pathname}${url.search}`;
}

function customerFor(route: Route): CustomerKey {
  return (route.request().headers().authorization || "").includes("customer-b-") ? "b" : "a";
}

function profile(customer: CustomerKey) {
  const id = customer === "a" ? 17 : 18;
  return { id, fullName: `Müşteri ${customer.toUpperCase()}`, email: `customer-${customer}@example.test`, role: "customer" };
}

function recordCall(route: Route, authority: Authority, customer: CustomerKey, path: string, method: string) {
  let body: unknown = null;
  try { body = route.request().postDataJSON(); } catch { body = null; }
  authority.calls.push(Object.freeze({ customer, method, path, body }));
}

async function fulfillAuthority(route: Route, authority: Authority): Promise<void> {
  const path = requestPath(route);
  const method = route.request().method();
  if (path === "/api/users/login" && method === "POST") {
    const body = route.request().postDataJSON() as { email?: string };
    const customer: CustomerKey = body.email?.startsWith("customer-b") ? "b" : "a";
    recordCall(route, authority, customer, path, method);
    await route.fulfill({ json: {
      token: sessions[customer].accessToken,
      refreshToken: sessions[customer].refreshToken,
      accessExpiresAt: sessions[customer].accessExpiresAt,
      refreshExpiresAt: sessions[customer].refreshExpiresAt,
      sessionId: sessions[customer].sessionId,
      user: profile(customer),
    } });
    return;
  }

  const customer = customerFor(route);
  const customerProfile = profile(customer);
  recordCall(route, authority, customer, path, method);

  if (path === "/api/users/logout" && method === "POST") return void await route.fulfill({ json: { success: true } });
  if (path === "/api/users/me" && method === "GET") return void await route.fulfill({ json: { user: customerProfile } });
  if (path === "/api/addresses" && method === "GET") return void await route.fulfill({ json: [] });
  if (path === `/api/orders/user/${customerProfile.id}` && method === "GET") return void await route.fulfill({ json: [] });
  if (path === "/api/returns/mine" && method === "GET") return void await route.fulfill({ json: [] });
  if (path === `/api/messages/history/${customerProfile.id}` && method === "GET") return void await route.fulfill({ json: [] });
  if (path === "/api/users/security-status" && method === "GET") {
    return void await route.fulfill({ json: {
      email: customerProfile.email,
      emailVerified: false,
      phone: null,
      phoneVerified: false,
      twoFactorEnabled: false,
      hasPassword: true,
    } });
  }
  if (path === "/api/campaigns/coupons/active" && method === "GET") return void await route.fulfill({ json: [] });
  if (path === "/api/store-follows" && method === "GET") return void await route.fulfill({ json: [] });
  if (path === "/api/questions/user" && method === "GET") return void await route.fulfill({ json: authority.questions[customer] });
  if (path === `/api/reviews/user/${customerProfile.id}` && method === "GET") return void await route.fulfill({ json: authority.reviews[customer] });
  if (path === "/api/favorites" && method === "GET") return void await route.fulfill({ json: { productIds: authority.favoriteIds[customer] } });
  if (path === "/api/notifications?limit=50" && method === "GET") {
    return void await route.fulfill({ json: { items: [], page: { limit: 50, hasMore: false, nextCursor: null } } });
  }
  if (path === "/api/notifications/unread-count" && method === "GET") return void await route.fulfill({ json: { unreadCount: 0 } });

  if (path === "/api/favorites/71" && (method === "POST" || method === "DELETE")) {
    if (customer === "a" && authority.delayNextCustomerAFavoriteMutation) {
      authority.delayNextCustomerAFavoriteMutation = false;
      await new Promise<void>((resolve) => { authority.deferredFavoriteMutation = Object.freeze({ route, resolve }); });
      return;
    }
    if (authority.failNextFavoriteMutation) {
      authority.failNextFavoriteMutation = false;
      return void await route.fulfill({ status: 409, json: { code: "FAVORITE_CONFLICT", error: "Favori işlemi reddedildi." } });
    }
    const favorited = method === "POST";
    authority.favoriteIds[customer] = favorited
      ? [...new Set([...authority.favoriteIds[customer], 71])]
      : authority.favoriteIds[customer].filter((id) => id !== 71);
    return void await route.fulfill({ json: { productId: 71, favorited, ...(favorited ? { created: true } : { removed: true }) } });
  }

  if (path === "/api/users/change-password" && method === "POST") {
    return void await route.fulfill({ json: { message: "Şifreniz güncellendi." } });
  }

  if (path === "/api/questions/ask" && method === "POST") {
    if (authority.failNextQuestion) {
      authority.failNextQuestion = false;
      return void await route.fulfill({ status: 409, json: { code: "QUESTION_REJECTED", error: "Soru kabul edilmedi." } });
    }
    const body = route.request().postDataJSON() as { product_id: number; question: string };
    const created = {
      id: customer === "a" ? 801 : 802,
      product_id: body.product_id,
      product_name: "Nova Pulse",
      question: body.question,
      answer: null,
      status: "pending",
      is_answered: false,
    };
    authority.questions[customer] = [created];
    return void await route.fulfill({ json: { mesaj: "Sorunuz alındı.", question: created } });
  }

  if (path === "/api/reviews" && method === "POST") {
    if (authority.failNextReview) {
      authority.failNextReview = false;
      return void await route.fulfill({ status: 403, json: { code: "REVIEW_NOT_ELIGIBLE", error: "Değerlendirme hakkı bulunamadı." } });
    }
    const body = route.request().postDataJSON() as { productId: number; rating: number; comment: string };
    const reviewId = customer === "a" ? 901 : 902;
    authority.reviews[customer] = [{
      id: reviewId,
      product_id: body.productId,
      product_name: "Nova Pulse",
      rating: body.rating,
      comment: body.comment,
      status: "PENDING",
    }];
    return void await route.fulfill({ json: { mesaj: "Değerlendirmeniz alındı.", reviewId, status: "PENDING" } });
  }

  await route.fulfill({ status: 404, json: { code: "NOT_FOUND", error: `Unhandled ${method} ${path}` } });
}

async function startAuthenticatedFixture(page: Page, authority: Authority, customer: CustomerKey = "a") {
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: "novastore.customer.session.v1",
    session: sessions[customer],
  });
  await page.route("**/api/**", (route) => fulfillAuthority(route, authority));
  await page.goto("/tests/account-notification-runtime-fixture.html");
  await expect(page.getByTestId("runtime-probe")).toHaveAttribute("data-account-phase", "authenticated");
  await expect(page.getByTestId("customer-id")).toHaveText(customer === "a" ? "17" : "18");
}

function callsFor(authority: Authority, path: string, method: string) {
  return authority.calls.filter((call) => call.path === path && call.method === method);
}

test("R11-R5 favorites stay server-confirmed across list, add, delete, refresh, and rejection", async ({ page }) => {
  const authority = createAuthority();
  await startAuthenticatedFixture(page, authority);
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70");

  authority.failNextFavoriteMutation = true;
  await page.getByRole("button", { name: "Ürün 71 favoriye ekle" }).click();
  await expect(page.getByTestId("favorite-mutation-result")).toHaveText("error:FAVORITE_CONFLICT");
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70");

  await page.getByRole("button", { name: "Ürün 71 favoriye ekle" }).click();
  await expect(page.getByTestId("favorite-mutation-result")).toHaveText("success");
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70,71");

  authority.failNextFavoriteMutation = true;
  await page.getByRole("button", { name: "Ürün 71 favoriden çıkar" }).click();
  await expect(page.getByTestId("favorite-mutation-result")).toHaveText("error:FAVORITE_CONFLICT");
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70,71");

  await page.getByRole("button", { name: "Ürün 71 favoriden çıkar" }).click();
  await expect(page.getByTestId("favorite-mutation-result")).toHaveText("success");
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70");

  authority.favoriteIds.a = [70, 73];
  await page.getByRole("button", { name: "Favorileri yenile" }).click();
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70,73");
  expect(callsFor(authority, "/api/favorites/71", "POST")).toHaveLength(2);
  expect(callsFor(authority, "/api/favorites/71", "DELETE")).toHaveLength(2);
});

test("R11-R5 a delayed Customer A favorite mutation cannot leak into Customer B", async ({ page }) => {
  const authority = createAuthority();
  await startAuthenticatedFixture(page, authority);
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("70");

  authority.delayNextCustomerAFavoriteMutation = true;
  await page.getByRole("button", { name: "Ürün 71 favoriye ekle" }).click();
  await expect.poll(() => authority.deferredFavoriteMutation).not.toBeNull();

  await page.getByRole("button", { name: "Customer B girişi" }).click();
  await expect(page.getByTestId("login-b-result")).toHaveText("success");
  await expect(page.getByTestId("customer-id")).toHaveText("18");
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("72");

  const deferred = authority.deferredFavoriteMutation!;
  await deferred.route.fulfill({ json: { productId: 71, favorited: true, created: true } });
  deferred.resolve();
  await page.waitForTimeout(100);
  await expect(page.getByTestId("favorite-product-ids")).toHaveText("72");
  expect(callsFor(authority, "/api/favorites/71", "POST")).toEqual([
    expect.objectContaining({ customer: "a" }),
  ]);
});

test("R11-R5 password change validates before transport and never persists password material", async ({ page }) => {
  const authority = createAuthority();
  await startAuthenticatedFixture(page, authority);

  await page.getByRole("button", { name: "Geçersiz şifre değişikliği" }).click();
  await expect(page.getByTestId("password-mutation-result")).toHaveText("error:CUSTOMER_PASSWORD_INPUT_INVALID");
  expect(callsFor(authority, "/api/users/change-password", "POST")).toHaveLength(0);

  await page.getByRole("button", { name: "Geçerli şifre değişikliği" }).click();
  await expect(page.getByTestId("password-mutation-result")).toHaveText("success");
  expect(callsFor(authority, "/api/users/change-password", "POST")).toEqual([
    expect.objectContaining({
      customer: "a",
      body: { currentPassword: "CurrentPass9", newPassword: "FreshPass10" },
    }),
  ]);
  const persistedValues = await page.evaluate(() => Object.values(localStorage));
  expect(JSON.stringify(persistedValues)).not.toContain("CurrentPass9");
  expect(JSON.stringify(persistedValues)).not.toContain("FreshPass10");
});

test("R11-R5 question submission refreshes private history only after confirmed success", async ({ page }) => {
  const authority = createAuthority();
  await startAuthenticatedFixture(page, authority);
  await expect(page.getByTestId("question-count")).toHaveText("0");

  await page.getByRole("button", { name: "Geçersiz ürün sorusu gönder" }).click();
  await expect(page.getByTestId("question-mutation-result")).toHaveText("error:CUSTOMER_QUESTION_INPUT_INVALID");
  expect(callsFor(authority, "/api/questions/ask", "POST")).toHaveLength(0);

  await page.getByRole("button", { name: "Ürün sorusu gönder", exact: true }).click();
  await expect(page.getByTestId("question-mutation-result")).toHaveText("success");
  await expect(page.getByTestId("question-count")).toHaveText("1");
  await expect(page.getByTestId("account-parity-data")).toContainText("Kargo ne zaman teslim edilir?");
  expect(callsFor(authority, "/api/questions/ask", "POST").at(-1)?.body).toEqual({
    product_id: 71,
    question: "Kargo ne zaman teslim edilir?",
  });

  const questionReadsBeforeFailure = callsFor(authority, "/api/questions/user", "GET").length;
  authority.failNextQuestion = true;
  await page.getByRole("button", { name: "Ürün sorusu gönder", exact: true }).click();
  await expect(page.getByTestId("question-mutation-result")).toHaveText("error:QUESTION_REJECTED");
  await expect(page.getByTestId("question-count")).toHaveText("1");
  expect(callsFor(authority, "/api/questions/user", "GET")).toHaveLength(questionReadsBeforeFailure);
});

test("R11-R5 review submission refreshes private history and preserves truth on eligibility failure", async ({ page }) => {
  const authority = createAuthority();
  await startAuthenticatedFixture(page, authority);
  await expect(page.getByTestId("review-count")).toHaveText("0");

  await page.getByRole("button", { name: "Geçersiz ürün değerlendirmesi gönder" }).click();
  await expect(page.getByTestId("review-mutation-result")).toHaveText("error:CUSTOMER_REVIEW_INPUT_INVALID");
  expect(callsFor(authority, "/api/reviews", "POST")).toHaveLength(0);

  await page.getByRole("button", { name: "Ürün değerlendirmesi gönder", exact: true }).click();
  await expect(page.getByTestId("review-mutation-result")).toHaveText("success");
  await expect(page.getByTestId("review-count")).toHaveText("1");
  await expect(page.getByTestId("account-parity-data")).toContainText("Ürün beklentimi karşıladı.");
  expect(callsFor(authority, "/api/reviews", "POST").at(-1)?.body).toEqual({
    productId: 71,
    rating: 5,
    comment: "Ürün beklentimi karşıladı.",
  });

  const reviewReadsBeforeFailure = callsFor(authority, "/api/reviews/user/17", "GET").length;
  authority.failNextReview = true;
  await page.getByRole("button", { name: "Ürün değerlendirmesi gönder", exact: true }).click();
  await expect(page.getByTestId("review-mutation-result")).toHaveText("error:REVIEW_NOT_ELIGIBLE");
  await expect(page.getByTestId("review-count")).toHaveText("1");
  expect(callsFor(authority, "/api/reviews/user/17", "GET")).toHaveLength(reviewReadsBeforeFailure);
});
