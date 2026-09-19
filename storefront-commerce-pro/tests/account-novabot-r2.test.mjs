import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createCustomerAccountAdapter } from "../src/adapters/customerAccountAdapter.js";
import {
  createAssistantConversationState,
  scopeAssistantConversationState,
  updateScopedAssistantConversationState,
} from "../src/integration/assistantConversationState.js";
import { CustomerHttpError, normalizeCustomerApiRequest } from "../src/integration/customerHttp.js";

const session = Object.freeze({ status: "authenticated", user: Object.freeze({ id: 42 }) });

test("R2 hesap adapterı yalnız oturum sahibinin kanonik soru, değerlendirme ve takip uçlarını kullanır", async () => {
  const calls = [];
  const http = {
    request: async (path, options = {}) => {
      calls.push({ path, options });
      if (path === "/api/questions/user") return [
        { id: 1, product_id: 101, product_name: "Nova Ürün", product_image: "/uploads/local-products/item.webp", question: "Ölçüsü nedir?", answer: "42 cm", created_at: "2026-08-30T10:00:00Z", answered_at: "2026-08-30T11:00:00Z" },
        { id: 0, product_id: 999, product_name: "Geçersiz", question: "Sızmamalı" },
      ];
      if (path === "/api/reviews/user/42") return [
        { id: 2, product_id: 102, product_name: "Nova Başka Ürün", image_url: "http://unsafe.example/item.png", rating: 5, comment: "Çok iyi", status: "PUBLISHED", created_at: "2026-08-29T10:00:00Z" },
      ];
      if (path === "/api/store-follows") return [
        { store_slug: "nova-teknoloji", store_name: "Nova Teknoloji", following: true, follower_count: 18, followed_at: "2026-08-28T10:00:00Z" },
        { store_slug: "../admin", store_name: "Geçersiz", following: true, follower_count: 99 },
      ];
      if (path === "/api/store-follows/nova-teknoloji" && options.method === "DELETE") return { following: false };
      throw new Error(`Beklenmeyen istek: ${path}`);
    },
  };
  const adapter = createCustomerAccountAdapter({ http, storage: null, eventTarget: null });
  const questions = await adapter.listQuestions(session);
  const reviews = await adapter.listReviews(session);
  const stores = await adapter.listFollowedStores(session);
  await adapter.unfollowStore(session, "nova-teknoloji");

  assert.deepEqual(questions, [{
    id: 1,
    productId: 101,
    productName: "Nova Ürün",
    productImage: "/uploads/local-products/item.webp",
    question: "Ölçüsü nedir?",
    answer: "42 cm",
    status: "answered",
    createdAt: "2026-08-30T10:00:00Z",
    answeredAt: "2026-08-30T11:00:00Z",
  }]);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0].productImage, "", "HTTP medya müşteri geçmişine taşınmamalı");
  assert.equal(reviews[0].status, "PUBLISHED");
  assert.deepEqual(stores, [{
    slug: "nova-teknoloji",
    name: "Nova Teknoloji",
    following: true,
    followerCount: 18,
    followedAt: "2026-08-28T10:00:00Z",
  }]);
  assert.deepEqual(calls.map(({ path, options }) => [path, options.method || "GET"]), [
    ["/api/questions/user", "GET"],
    ["/api/reviews/user/42", "GET"],
    ["/api/store-follows", "GET"],
    ["/api/store-follows/nova-teknoloji", "DELETE"],
  ]);
  await assert.rejects(() => adapter.listQuestions({ status: "guest", user: null }), /oturumu gereklidir/);
  await assert.rejects(() => adapter.unfollowStore(session, "../admin"), /Geçersiz mağaza/);
});

test("R2 müşteri HTTP allowlist'i yalnız exact sahipli geçmiş yollarını kabul eder", () => {
  for (const [path, expected] of [
    ["/api/questions/user", { path: "/api/questions/user", method: "GET", authenticated: true }],
    ["/api/reviews/user/42", { path: "/api/reviews/user/42", method: "GET", authenticated: true }],
    ["/api/store-follows", { path: "/api/store-follows", method: "GET", authenticated: true }],
  ]) assert.deepEqual(normalizeCustomerApiRequest(path, "GET", "https://novastore.tr"), expected);

  for (const path of [
    "/api/questions/user?userId=99",
    "/api/reviews/user/42?userId=99",
    "/api/reviews/user/../99",
    "/api/store-follows?userId=99",
  ]) assert.throws(
    () => normalizeCustomerApiRequest(path, "GET", "https://novastore.tr"),
    CustomerHttpError,
    path,
  );
});

test("R2 soru ve değerlendirme geçmişi server tarafında oturum sahibine kapanır", async () => {
  const [questionRoutes, questionController, reviewRoutes, authMiddleware] = await Promise.all([
    readFile(new URL("../../routes/questionRoutes.js", import.meta.url), "utf8"),
    readFile(new URL("../../controllers/questionController.js", import.meta.url), "utf8"),
    readFile(new URL("../../routes/reviewRoutes.js", import.meta.url), "utf8"),
    readFile(new URL("../../middlewares/authMiddleware.js", import.meta.url), "utf8"),
  ]);

  assert.match(
    questionRoutes,
    /router\.get\('\/user',\s*privateNoStore,\s*authenticateCustomer,\s*questionController\.getUserQuestions\)/s,
  );
  assert.match(questionController, /exports\.getUserQuestions[\s\S]*?const user_id = req\.user\.id;/);
  assert.match(questionController, /WHERE pq\.user_id = \$1[\s\S]*?\[user_id\]/);
  assert.doesNotMatch(questionController, /getUserQuestions[\s\S]*?req\.(?:params|query|body)\.user/i);

  assert.match(
    reviewRoutes,
    /router\.get\('\/user\/:userId',\s*privateNoStore,\s*authenticate,\s*requireSelfOrAdmin\('userId'\),\s*getUserReviews\)/s,
  );
  assert.match(authMiddleware, /if \(paramId !== req\.user\.id\) return res\.status\(403\)/);
});

test("R2 NovaBot konuşması rota boyunca korunur, müşteri sınırında sıfırlanır", () => {
  const customerA = { status: "authenticated", user: { id: 41 } };
  const customerB = { status: "authenticated", user: { id: 42 } };
  const guest = { status: "guest", user: null };
  const initialCustomerAState = createAssistantConversationState(customerA);
  const customerAState = updateScopedAssistantConversationState(
    initialCustomerAState,
    customerA,
    initialCustomerAState.instanceId,
    (current) => ({
      ...current,
      nextId: 4,
      messages: [...current.messages, { id: 2, role: "user", message: "Siparişim nerede?" }, { id: 3, role: "assistant", message: "Takip no: A-PRIVATE-41" }],
    }),
  );
  assert.equal(scopeAssistantConversationState(customerAState, customerA), customerAState, "aynı müşteri rota geçişinde konuşmayı korumalı");

  const customerBState = scopeAssistantConversationState(customerAState, customerB);
  assert.equal(customerBState.ownerKey, "customer:42");
  assert.equal(customerBState.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(customerBState), /A-PRIVATE-41/);

  const customerBWithMessage = updateScopedAssistantConversationState(customerBState, customerB, customerBState.instanceId, (current) => ({
    ...current,
    nextId: 3,
    messages: [...current.messages, { id: 2, role: "user", text: "B-PRIVATE-42" }],
  }));
  const customerBBytes = JSON.stringify(customerBWithMessage);
  const staleCustomerAUpdate = updateScopedAssistantConversationState(customerBWithMessage, customerA, customerAState.instanceId, (current) => ({
    ...current,
    messages: [...current.messages, { id: 99, role: "assistant", text: "A-LATE-RESPONSE" }],
  }));
  assert.equal(staleCustomerAUpdate, customerBWithMessage, "eski müşteri callback'i yeni müşteride tam no-op olmalı");
  assert.equal(JSON.stringify(staleCustomerAUpdate), customerBBytes, "yeni müşteri konuşması byte-for-byte korunmalı");

  const guestState = scopeAssistantConversationState(customerAState, guest);
  assert.equal(guestState.ownerKey, "guest");
  assert.equal(guestState.messages.length, 1);
  assert.doesNotMatch(JSON.stringify(guestState), /A-PRIVATE-41/);

  const guestPending = updateScopedAssistantConversationState(guestState, guest, guestState.instanceId, (current) => ({
    ...current,
    nextOperationId: 8,
    pendingChatId: 7,
    messages: [...current.messages, { id: current.nextId, role: "user", text: "GUEST-PENDING" }],
    nextId: current.nextId + 1,
  }));
  const authenticatedFromGuest = scopeAssistantConversationState(guestPending, customerB);
  const authenticatedAfterGuest = updateScopedAssistantConversationState(
    authenticatedFromGuest,
    customerB,
    authenticatedFromGuest.instanceId,
    (current) => ({
      ...current,
      nextId: 3,
      messages: [...current.messages, { id: 2, role: "user", text: "AUTHENTICATED-B" }],
    }),
  );
  const staleGuestCompletion = updateScopedAssistantConversationState(authenticatedAfterGuest, guest, guestPending.instanceId, (current) => ({
    ...current,
    pendingChatId: null,
    messages: [...current.messages, { id: 100, role: "assistant", text: "GUEST-LATE" }],
  }));
  assert.equal(staleGuestCompletion, authenticatedAfterGuest);
  assert.doesNotMatch(JSON.stringify(staleGuestCompletion), /GUEST-(?:PENDING|LATE)/);

  const secondGuestState = scopeAssistantConversationState(authenticatedAfterGuest, guest);
  const secondGuestPending = updateScopedAssistantConversationState(
    secondGuestState,
    guest,
    secondGuestState.instanceId,
    (current) => ({
      ...current,
      pendingChatId: 7,
      nextOperationId: 8,
      messages: [...current.messages, { id: current.nextId, role: "user", text: "GUEST-SECOND-EPOCH" }],
      nextId: current.nextId + 1,
    }),
  );
  assert.notEqual(secondGuestPending.instanceId, guestPending.instanceId, "her misafir dönemi benzersiz instance taşımalı");
  assert.equal(secondGuestPending.pendingChatId, guestPending.pendingChatId, "regresyon aynı işlem kimliği çakışmasını üretmeli");
  const lateFirstGuestResponse = updateScopedAssistantConversationState(
    secondGuestPending,
    guest,
    guestPending.instanceId,
    (current) => ({
      ...current,
      pendingChatId: null,
      messages: [...current.messages, { id: 101, role: "assistant", text: "GUEST-FIRST-EPOCH-LATE" }],
    }),
  );
  assert.equal(lateFirstGuestResponse, secondGuestPending, "ilk misafir instance'ı ikinci misafire yazamamalı");
  assert.doesNotMatch(JSON.stringify(lateFirstGuestResponse), /GUEST-FIRST-EPOCH-LATE/);

  const customerAPending = updateScopedAssistantConversationState(customerAState, customerA, customerAState.instanceId, (current) => ({
    ...current,
    pendingChatId: 12,
    nextOperationId: 13,
  }));
  assert.equal(scopeAssistantConversationState(customerAPending, customerA), customerAPending, "bekleyen işlem rota remount'unda korunmalı");
  const duplicateBegin = updateScopedAssistantConversationState(customerAPending, customerA, customerAPending.instanceId, (current) => {
    if (current.pendingChatId !== null) return current;
    return { ...current, pendingChatId: current.nextOperationId };
  });
  assert.equal(duplicateBegin, customerAPending, "bekleyen sohbet sürerken ikinci başlangıç reddedilmeli");
  const failedAfterRemount = updateScopedAssistantConversationState(customerAPending, customerA, customerAPending.instanceId, (current) => ({
    ...current,
    pendingChatId: null,
    error: "NovaBot isteği başarısız oldu; yeniden dene.",
  }));
  assert.equal(scopeAssistantConversationState(failedAfterRemount, customerA), failedAfterRemount);
  assert.match(failedAfterRemount.error, /başarısız/);
});

test("R2 hesap rotaları erişilebilir, NovaBot tek shell örneği ve exact owner asset'i kullanır", async () => {
  const [integrated, pages, assistant, conversationState, fixture, css, asset] = await Promise.all([
    readFile(new URL("../src/IntegratedApp.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/ConnectedCustomerPages.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/AssistantWidget.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/integration/assistantConversationState.js", import.meta.url), "utf8"),
    readFile(new URL("../src/integration/createCanonicalFixtureRuntime.js", import.meta.url), "utf8"),
    readFile(new URL("../src/integrated.css", import.meta.url), "utf8"),
    readFile(new URL("../src/assets/NovaBot.png", import.meta.url)),
  ]);
  for (const path of ["/hesabim/sorularim", "/hesabim/degerlendirmelerim", "/hesabim/takip-ettigim-magazalar"]) {
    assert.ok(integrated.includes(`pathname === "${path}"`), path);
    assert.ok(pages.includes(`"#${path}"`), path);
  }
  assert.equal((integrated.match(/<AssistantWidget\b/g) || []).length, 1, "shell tam olarak bir NovaBot örneği bağlamalı");
  assert.match(integrated, /<AssistantWidget[^>]*disabled=\{runtime\.readOnlyPreview === true\}/);
  assert.match(integrated, /const \[assistantConversationState, setAssistantConversationState\] = useState\(createAssistantConversationState\)/);
  assert.match(integrated, /assistantConversationState=\{assistantConversationState\}/);
  assert.match(integrated, /onAssistantConversationStateChange=\{setAssistantConversationState\}/);
  assert.match(integrated, /<AssistantWidget key=\{assistantConversationOwnerKey\(session\)\}/);
  assert.doesNotMatch(integrated, /\["help", "support"\]\.includes\(route\.type\)/);
  assert.match(assistant, /import novabotArtwork from "\.\/assets\/NovaBot\.png"/);
  assert.match(conversationState, /export const createAssistantConversationState/);
  assert.match(conversationState, /state\?\.ownerKey === ownerKey/);
  assert.match(conversationState, /instanceId: createAssistantConversationInstanceId\(\)/);
  assert.match(conversationState, /state\?\.ownerKey !== ownerKey \|\| state\?\.instanceId !== instanceId/);
  assert.match(assistant, /scopeAssistantConversationState\(rawConversation, session\)/);
  assert.match(assistant, /assistant\.getCapability\(\{ signal: controller\.signal \}\)/);
  assert.match(assistant, /aria-label=\{`NovaBot sohbet modu\. Seçili:/);
  assert.match(assistant, /role="listbox" aria-label="NovaBot sohbet modları"/);
  assert.match(assistant, /capabilityModes\.map\(\(option, index\) =>/);
  assert.doesNotMatch(assistant, /<select\b/);
  assert.match(assistant, /assistant\.chat\(\{ message: text, history, modeId: selectedServerModeId \}\)/);
  assert.doesNotMatch(assistant, /\[\s*\{\s*id:\s*"professional"/s, "Customer Web ayrı mod taksonomisi tanımlamamalı");
  assert.match(assistant, /updateScopedAssistantConversationState\(current, session, conversationInstanceId, update\)/);
  assert.match(assistant, /const phase = pendingChatId === null \? "idle" : "submitting"/);
  assert.match(assistant, /const actionPhase = pendingActionId === null \? "idle" : "submitting"/);
  assert.match(assistant, /if \(pendingChatId !== renderedPendingChatIdRef\.current\)/);
  assert.match(assistant, /if \(pendingActionId !== renderedPendingActionIdRef\.current\)/);
  assert.match(assistant, /if \(current\.pendingChatId !== operationId\) return current/);
  assert.match(assistant, /if \(current\.pendingActionId !== operationId\) return current/);
  assert.match(assistant, /const mutationResult = await onAdd\(pending\.productId, pending\.quantity\)/);
  assert.match(assistant, /const mutationResult = await onRemove\(pending\.productId\)/);
  assert.match(assistant, /mutationResult\?\.appliedLocally === true && mutationResult\?\.persisted === false/g);
  assert.match(assistant, /cihazındaki sepete eklendi ancak hesap sepetine kaydedilemedi/);
  assert.match(assistant, /cihazındaki sepetten çıkarıldı ancak hesap sepeti güncellenemedi/);
  assert.match(assistant, /pendingChatId: null, error: requestMessage/);
  assert.match(assistant, /pendingActionId: null, error: requestMessage/);
  assert.match(integrated, /async function removeFromCart\(productId, variantId = null\)[\s\S]*?cartLineKey\(item\) !== cartLineKey\(productId, variantId\)[\s\S]*?if \(next\.length === current\.length\) return false;[\s\S]*?return replaceCart\(next\);/);
  assert.match(integrated, /return \{ appliedLocally: false, persisted: false \}/, "V2 rejects an unconfirmed mutation and restores canonical state");
  assert.match(integrated, /if \(mutationResult !== true\) return mutationResult/);
  assert.match(fixture, /listQuestions: async \(\) => questions\.map/);
  assert.match(fixture, /listReviews: async \(\) => reviews\.map/);
  assert.match(fixture, /listFollowedStores: async \(\) => followedStores\.map/);
  assert.match(fixture, /unfollowStore: async \(_activeSession, slug\)/);
  assert.match(assistant, /conversationState = null/);
  assert.match(assistant, /document\.querySelector\('\[role="dialog"\]\[aria-modal="true"\]'\)/);
  assert.match(assistant, /const HIDDEN_ROUTES = new Set\(\["payment-result", "auth", "password", "order-success"\]\)/);
  assert.doesNotMatch(assistant, /HIDDEN_ROUTES[^\n]+"checkout"/);
  assert.match(assistant, /aria-controls="novabot-dialog"/);
  assert.match(assistant, /aria-haspopup="dialog"/);
  assert.match(assistant, /return=%2Fdestek/);
  assert.match(css, /bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.assistant-fab:focus-visible/);
  assert.match(css, /max-height: calc\(100vh - 174px\)/);
  assert.match(css, /overflow-y: auto/);
  assert.match(pages, /Artık satışta değil/);
  assert.match(pages, /aria-label=\{`5 üzerinden \$\{review\.rating\} puan`\}/);
  assert.equal(createHash("sha256").update(asset).digest("hex"), "fee08aa17ffe034a2406a5d180d19007ab825cda5c1d31c2bb26cbb5468cb81b");
});
