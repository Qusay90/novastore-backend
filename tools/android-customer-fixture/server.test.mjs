import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startFixtureServer } from "./server.mjs";

let server;
let origin;
const authHeaders = { authorization: "Bearer fixture.debug.token.not-a-credential" };

before(async () => {
  server = await startFixtureServer({ scenario: "filled", port: 0, delayMs: 0 });
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((resolveClose) => server.close(resolveClose)));

test("fixture is loopback-only and identifies itself as hermetic", async () => {
  const response = await fetch(`${origin}/__fixture/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    fixture: "novastore-android-customer",
    scenario: "filled",
    hermetic: true,
    remoteCalls: false
  });
  assert.equal(server.address().address, "127.0.0.1");
});

test("filled catalog, session and state endpoints are deterministic", async () => {
  const products = await fetch(`${origin}/api/products`).then((response) => response.json());
  const categories = await fetch(`${origin}/api/public/categories?format=tree`).then((response) => response.json());
  const login = await fetch(`${origin}/api/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "fixture", password: "fixture" })
  }).then((response) => response.json());
  const cart = await fetch(`${origin}/api/shared-state/cart`, { headers: authHeaders }).then((response) => response.json());

  assert.equal(products.length, 8);
  assert.equal(categories.length, 6);
  assert.equal(login.user.role, "customer");
  assert.equal(login.token, "fixture.debug.token.not-a-credential");
  assert.equal(cart.exists, true);
  assert.equal(cart.payload.items.length, 2);
});

test("Main-6S contracts expose typed targets, state matrices and ordered image media", async () => {
  const notifications = await fetch(`${origin}/api/notifications/user/7001`, { headers: authHeaders }).then((response) => response.json());
  const reviews = await fetch(`${origin}/api/reviews/user/7001`, { headers: authHeaders }).then((response) => response.json());
  const questions = await fetch(`${origin}/api/questions/product/201`).then((response) => response.json());
  const product = await fetch(`${origin}/api/products/201`).then((response) => response.json());
  const support = await fetch(`${origin}/api/messages/history/7001`, { headers: authHeaders }).then((response) => response.json());

  assert.deepEqual(new Set(notifications.map((item) => item.entity_type)), new Set([
    "order", "product", "product_question", "return_request", "review", "support_thread"
  ]));
  assert.deepEqual(new Set(reviews.map((item) => item.status)), new Set(["PENDING", "PUBLISHED", "HIDDEN"]));
  assert.equal("user_id" in questions[0], false);
  assert.equal("product_id" in questions[0], false);
  assert.equal(product.media.every((item) => item.media_type === "image"), true);
  assert.equal(support.every((item) => item.support_thread_id === 8801), true);
});

test("private customer routes enforce authentication and owner parity", async () => {
  const anonymous = await fetch(`${origin}/api/notifications/user/7001`);
  const foreign = await fetch(`${origin}/api/notifications/user/7002`, { headers: authHeaders });
  const owned = await fetch(`${origin}/api/notifications/user/7001`, { headers: authHeaders });
  const missingReturn = await fetch(`${origin}/api/returns/999999`, { headers: authHeaders });

  assert.equal(anonymous.status, 401);
  assert.equal(foreign.status, 403);
  assert.equal(owned.status, 200);
  assert.equal(missingReturn.status, 404);
});

test("return writes and optional-auth assistant match the binding PC1 contract", async () => {
  const returnResponse = await fetch(`${origin}/api/returns`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ order_id: 1234401 })
  });
  const returnPayload = await returnResponse.json();
  const assistantResponse = await fetch(`${origin}/api/assistant/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Siparişim nerede?", history: [], context: {} })
  });
  const assistantPayload = await assistantResponse.json();

  assert.equal(returnResponse.status, 503);
  assert.equal(returnPayload.code, "RETURN_WRITES_DISABLED");
  assert.equal(assistantResponse.status, 200);
  assert.equal(assistantPayload.reply, assistantPayload.message);
  assert.equal("answer" in assistantPayload, false);
  assert.equal("response" in assistantPayload, false);
});

test("review eligibility and submission stay server-authoritative", async () => {
  const anonymousPermission = await fetch(`${origin}/api/reviews/product/204`).then((response) => response.json());
  const ownedPermission = await fetch(`${origin}/api/reviews/product/204`, { headers: authHeaders }).then((response) => response.json());
  const createdResponse = await fetch(`${origin}/api/reviews`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ product_id: 204, rating: 5, comment: "Hermetik Android değerlendirmesi" })
  });
  const duplicateResponse = await fetch(`${origin}/api/reviews`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ product_id: 204, rating: 5, comment: "Tekrar" })
  });
  const unknownResponse = await fetch(`${origin}/api/reviews`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ product_id: 999999, rating: 5, comment: "Bilinmeyen" })
  });
  const undeliveredResponse = await fetch(`${origin}/api/reviews`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ product_id: 202, rating: 5, comment: "Teslim edilmedi" })
  });
  const invalidRatingResponse = await fetch(`${origin}/api/reviews`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ product_id: 204, rating: 6 })
  });

  assert.equal(anonymousPermission.reviewPermission.code, "AUTH_REQUIRED");
  assert.equal(ownedPermission.reviewPermission.code, "ELIGIBLE");
  assert.equal(createdResponse.status, 201);
  assert.equal((await createdResponse.json()).status, "PENDING");
  assert.equal(duplicateResponse.status, 409);
  assert.equal(unknownResponse.status, 404);
  assert.equal(undeliveredResponse.status, 403);
  assert.equal(invalidRatingResponse.status, 400);
});

test("fixture never falls through to a remote service", async () => {
  const response = await fetch(`${origin}/api/not-a-real-route`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { message: "Hermetik fixture rotası bulunamadı." });
});

test("fixture media cannot escape its allowlisted directory", async () => {
  const product = await fetch(`${origin}/api/products/201`).then((response) => response.json());
  const valid = await fetch(product.image_url);
  assert.equal(valid.status, 200);
  assert.match(valid.headers.get("content-type"), /^image\//);

  const response = await fetch(`${origin}/fixture-media/%2e%2e%2fpackage.json`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
});

test("empty, error and loading scenarios are explicit and deterministic", async () => {
  for (const scenario of ["empty", "error", "loading"]) {
    const scenarioServer = await startFixtureServer({ scenario, port: 0, delayMs: 30 });
    try {
      const address = scenarioServer.address();
      const scenarioOrigin = `http://127.0.0.1:${address.port}`;
      const startedAt = performance.now();
      const response = await fetch(`${scenarioOrigin}/api/products`);
      const elapsedMs = performance.now() - startedAt;

      if (scenario === "error") {
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { message: "Hermetik hata senaryosu." });
      } else {
        assert.equal(response.status, 200);
        const payload = await response.json();
        assert.equal(Array.isArray(payload), true);
        assert.equal(payload.length, scenario === "empty" ? 0 : 8);
      }

      if (scenario === "loading") assert.ok(elapsedMs >= 20, `loading response arrived in ${elapsedMs} ms`);
    } finally {
      await new Promise((resolveClose) => scenarioServer.close(resolveClose));
    }
  }
});
