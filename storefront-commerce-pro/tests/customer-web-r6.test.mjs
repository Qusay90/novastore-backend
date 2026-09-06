import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCustomerAccountAdapter } from "../src/adapters/customerAccountAdapter.js";
import {
  customerAccountEntryPath,
  getCustomerProfileCompletion,
  NORMAL_LOGIN_DESTINATION,
  PROFILE_COMPLETION_NOTICE_TIMEOUT_MS,
  safeCustomerReturnPath,
  SELLER_RECRUITMENT_URL,
} from "../src/customerAuthUx.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("R6 Seller recruitment destination is fixed and native to desktop/mobile navigation", async () => {
  assert.equal(SELLER_RECRUITMENT_URL, "https://novastore-stage.com");
  const [app, css] = await Promise.all([
    read("../src/IntegratedApp.jsx"),
    read("../src/integrated.css"),
  ]);
  const cart = app.indexOf('className="cart-header-action"');
  const seller = app.indexOf('className="seller-recruitment-action"');
  assert.ok(cart >= 0 && seller > cart, "Seller entry must follow Sepetim in desktop DOM order.");
  assert.match(app, /label="Ortağımız Ol"[^>]+href=\{SELLER_RECRUITMENT_URL\}/u);
  assert.match(app, /className="mobile-seller-recruitment" href=\{SELLER_RECRUITMENT_URL\}/u);
  assert.match(css, /\.header-actions \.cart-header-action\s*\{\s*display: flex;/u);
  assert.match(css, /\.header-actions \.header-action\s*\{\s*display: none;/u);
  assert.match(css, /\.seller-recruitment-action strong\s*\{\s*color: #ffffff;/u);
});

test("R6 login return intent accepts only explicit internal Customer routes", () => {
  const valid = [
    "/",
    "/urun-id/42",
    "/magaza/nova-teknoloji",
    "/hesabim",
    "/hesabim/siparisler/NS-2026-41",
    "/odeme/onay",
    "/odeme/sonuc?paymentRef=pay_41&orderId=41",
    "/siparis-takibi",
    "/destek",
  ];
  for (const path of valid) assert.equal(safeCustomerReturnPath(path), path, path);

  const maliciousOrUnsupported = [
    "https://attacker.invalid",
    "//attacker.invalid",
    "/\\attacker.invalid",
    "/%2F%2Fattacker.invalid",
    "/admin",
    "/hesabim?next=https://attacker.invalid",
    "/odeme/sonuc?next=https://attacker.invalid",
    "/destek#https://attacker.invalid",
  ];
  for (const path of maliciousOrUnsupported) {
    assert.equal(safeCustomerReturnPath(path), NORMAL_LOGIN_DESTINATION, path);
  }
});

test("Customer return parsing normalizes routes without a network origin", () => {
  for (const [input, expected] of [
    ["/hesabim/../sepet", "/sepet"],
    ["/hesabim/%2e%2e/favoriler", "/favoriler"],
    ["/./destek", "/destek"],
    ["/odeme/sonuc?paymentRef=a+b&orderId=41", "/odeme/sonuc?paymentRef=a+b&orderId=41"],
    ["https://customer.novastore.invalid/sepet", "/"],
    ["customer-return:/sepet", "/"],
    ["//attacker.invalid/sepet", "/"],
    ["///attacker.invalid/sepet", "/"],
    ["/%2f%2fattacker.invalid/sepet", "/"],
    ["/destek\\@attacker.invalid", "/"],
    ["/odeme/sonuc?paymentRef=", "/"],
    ["/odeme/sonuc?orderId=41&next=/sepet", "/"],
    ["/odeme/sonuc?paymentRef=%00", "/"],
  ]) assert.equal(safeCustomerReturnPath(input), expected, input);
});

test("R6 account header sends guests through normal login and keeps authenticated account access", async () => {
  assert.equal(customerAccountEntryPath(false), "/giris");
  assert.equal(customerAccountEntryPath(true), "/hesabim");

  const app = await read("../src/IntegratedApp.jsx");
  assert.match(app, /onAccountOpen=\{\(\) => navigate\(customerAccountEntryPath\(authenticated\)\)\}/u);
  assert.doesNotMatch(app, /onAccountOpen=\{\(\) => navigate\("\/hesabim"\)\}/u);
});

test("R6 profile completion is derived deterministically from editable authoritative fields", () => {
  assert.deepEqual(
    getCustomerProfileCompletion({ fullName: "Nova Müşteri", phone: "05551234567" }),
    { complete: true, missingFields: [] },
  );
  assert.deepEqual(
    getCustomerProfileCompletion({ fullName: "Nova Müşteri", phone: null }),
    { complete: false, missingFields: ["Telefon"] },
  );
  assert.deepEqual(
    getCustomerProfileCompletion({ fullName: "", phone: "5551234567" }),
    { complete: false, missingFields: ["Ad soyad", "Telefon"] },
  );
  assert.equal(PROFILE_COMPLETION_NOTICE_TIMEOUT_MS, 9_000);
});

test("R6 authoritative profile read is same-origin, authenticated and storage-scoped", async () => {
  const calls = [];
  const storageValues = new Map();
  const adapter = createCustomerAccountAdapter({
    http: {
      request: async (path, options) => {
        calls.push({ path, options });
        return { user: { id: 71, fullName: "Doğrulanmış Müşteri", email: "musteri@example.test", phone: "05551234567", role: "customer" } };
      },
    },
    storage: {
      getItem: (key) => storageValues.get(key) ?? null,
      setItem: (key, value) => storageValues.set(key, value),
      removeItem: (key) => storageValues.delete(key),
    },
    eventTarget: {},
  });
  const profile = await adapter.getProfile();
  assert.equal(profile.id, 71);
  assert.deepEqual(calls, [{ path: "/api/users/me", options: { signal: undefined } }]);
  assert.equal(JSON.parse(storageValues.get("nova_user_info")).id, 71);
});

test("R6 normal login lands home and guidance stays non-blocking with NovaBot coordination", async () => {
  const [app, pages, assistant, adapter] = await Promise.all([
    read("../src/IntegratedApp.jsx"),
    read("../src/ConnectedCustomerPages.jsx"),
    read("../src/AssistantWidget.jsx"),
    read("../src/adapters/customerAccountAdapter.js"),
  ]);
  assert.match(pages, /returnPath = NORMAL_LOGIN_DESTINATION/u);
  assert.match(pages, /safeCustomerReturnPath\(returnPath\)/u);
  assert.doesNotMatch(app, /safeDecodeReturn/u);
  assert.match(app, /runtime\.customer\.getProfile\(\)/u);
  assert.match(app, /destination === NORMAL_LOGIN_DESTINATION && profileCompletion && !profileCompletion\.complete/u);
  assert.match(app, /sharedProfileCompletionNotice=\{profileCompletionNotice\}/u);
  assert.match(app, /onProfileCompletionNoticeChange=\{setProfileCompletionNotice\}/u);
  assert.match(app, /if \(!profileCompletionNotice\) return undefined;[\s\S]+PROFILE_COMPLETION_NOTICE_TIMEOUT_MS/u);
  assert.match(app, /navigate\("\/hesabim\?focus=profile"\)/u);
  assert.match(app, /profileCompletionNotice && !assistantOpen/u);
  assert.match(app, /<div className="profile-completion-notice" role="status" aria-live="polite">/u);
  assert.doesNotMatch(app, /<aside className="profile-completion-notice" role="status"/u);
  assert.match(app, /profileFocusRequested[\s\S]+if \(!profileFocusRequested\)/u);
  assert.match(pages, /querySelector\('input\[name="fullName"\]'\)\?\.focus/u);
  assert.match(assistant, /onOpenChange\?\.\(open\)/u);
  assert.match(adapter, /status: "authenticated", sessionId, user/u);
});
