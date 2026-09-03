import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import {
  CUSTOMER_NOVABOT_CONTRACT_VERSION,
  customerNovaBotApiTestUtils,
  describeCustomerNovaBotFailure,
  resolveCustomerNovaBotModeId,
} from "../src/assistant/customerNovaBotApi";
import {
  CustomerNotificationApiError,
  customerNotificationApiTestUtils,
} from "../src/notifications/customerNotificationApi";

const expectedModeIds = [
  "professional", "friendly", "buddy", "funny", "witty",
  "quick", "detailed", "technical", "sales",
] as const;

const apiSourceUrl = new URL("../src/assistant/customerNovaBotApi.ts", import.meta.url);
const notificationApiSourceUrl = new URL("../src/notifications/customerNotificationApi.ts", import.meta.url);
const prototypeUrl = new URL("../src/Prototype.tsx", import.meta.url);
const cssUrl = new URL("../src/prototype.css", import.meta.url);
const nativePluginUrl = new URL("../android/app/src/main/java/com/novastore/app/NovaNotificationApiPlugin.java", import.meta.url);

function capability(modeIds: readonly string[], overrides: Record<string, unknown> = {}) {
  return customerNovaBotApiTestUtils.normalizeCapability({
    contractVersion: CUSTOMER_NOVABOT_CONTRACT_VERSION,
    available: modeIds.length > 0,
    provider: { configured: modeIds.length > 1, ready: modeIds.length > 1 },
    advancedModesAvailable: modeIds.length > 1,
    modeSelectionAvailable: modeIds.length > 1,
    defaultModeId: "friendly",
    modes: modeIds.map((id) => ({ id, label: `Sunucu ${id}`, description: `${id} açıklaması` })),
    unavailableReason: modeIds.length > 1 ? null : "RAW_PROVIDER_REASON_MUST_NOT_RENDER",
    providerSecret: "SECRET_MUST_BE_DROPPED",
    ...overrides,
  });
}

test("R11-R6 capability projection is bounded, coherent, and secret-minimal", () => {
  const result = capability(["friendly"]);
  expect(result).toEqual({
    contractVersion: "novabot-modes-v1",
    available: true,
    provider: { configured: false, ready: false },
    advancedModesAvailable: false,
    modeSelectionAvailable: false,
    defaultModeId: "friendly",
    modes: [{ id: "friendly", label: "Sunucu friendly", description: "friendly açıklaması" }],
    unavailableReason: "RAW_PROVIDER_REASON_MUST_NOT_RENDER",
  });
  expect(JSON.stringify(result)).not.toContain("SECRET_MUST_BE_DROPPED");
  expect(() => capability(["friendly"], { contractVersion: "invented-v2" })).toThrow();
  expect(() => capability(["friendly"], { provider: { configured: false, ready: true } })).toThrow();
  expect(() => capability(["friendly", "quick"], {
    provider: { configured: true, ready: false },
    advancedModesAvailable: true,
    modeSelectionAvailable: true,
  })).toThrow();
  expect(() => customerNovaBotApiTestUtils.normalizeCapability({
    contractVersion: CUSTOMER_NOVABOT_CONTRACT_VERSION,
    available: true,
    provider: { configured: false, ready: false },
    advancedModesAvailable: false,
    modeSelectionAvailable: false,
    defaultModeId: "friendly",
    modes: [{ id: "friendly", title: "Legacy başlık", description: "Açıklama" }],
    unavailableReason: "ADVANCED_PROVIDER_NOT_SELECTED",
  })).toThrow();
});

test("R11-R6 provider-absent state keeps only the server base mode and no switch", () => {
  const result = capability(["friendly"]);
  expect(result.provider).toEqual({ configured: false, ready: false });
  expect(result.modeSelectionAvailable).toBe(false);
  expect(result.modes.map((mode) => mode.id)).toEqual(["friendly"]);
  expect(resolveCustomerNovaBotModeId(result)).toBe("friendly");
});

test("R11-R6 configured state consumes exactly the nine server-returned modes", () => {
  const result = capability(expectedModeIds);
  expect(result.modeSelectionAvailable).toBe(true);
  expect(result.modes.map((mode) => mode.id)).toEqual(expectedModeIds);
  expect(result.modes).toHaveLength(9);
  const apiSource = readFileSync(apiSourceUrl, "utf8");
  expect(apiSource).not.toContain("const MODES = new Set");
  expect(apiSource).not.toContain('"professional" | "friendly"');
});

test("R11-R6 selection uses a valid default, otherwise the first returned mode", () => {
  const result = capability(["quick", "technical"], { defaultModeId: "friendly" });
  expect(resolveCustomerNovaBotModeId(result)).toBe("quick");
  expect(resolveCustomerNovaBotModeId(result, "technical")).toBe("technical");
  expect(resolveCustomerNovaBotModeId(result, "client-invented")).toBe("quick");
});

test("R11-R6 chat body uses only top-level server-authorized modeId", () => {
  const body = customerNovaBotApiTestUtils.normalizeRequest({
    message: " Teknik yanıt ver ",
    history: [{ role: "assistant", message: "Nasıl yardımcı olabilirim?" }],
    modeId: "technical",
  }, expectedModeIds);
  expect(body).toEqual({
    message: "Teknik yanıt ver",
    history: [{ role: "assistant", message: "Nasıl yardımcı olabilirim?" }],
    modeId: "technical",
  });
  expect(Object.keys(body).sort()).toEqual(["history", "message", "modeId"]);
  expect(JSON.stringify(body)).not.toMatch(/context|selectedMode|systemPrompt|provider|model|tools|customerId|profileId|conversationOwner/i);
  expect(() => customerNovaBotApiTestUtils.normalizeRequest({ message: "x", modeId: "client-extra" }, expectedModeIds)).toThrow();
});

test("R11-R6 response mode binding and canonical alias conflicts fail closed", () => {
  expect(customerNovaBotApiTestUtils.normalizeResponse({
    reply: "Teknik yanıt",
    modeId: "technical",
    mode: "technical",
  }, "technical").modeId).toBe("technical");
  expect(() => customerNovaBotApiTestUtils.normalizeResponse({ reply: "x", modeId: "quick" }, "technical")).toThrow();
  expect(() => customerNovaBotApiTestUtils.normalizeResponse({ reply: "x", modeId: "quick", mode: "sales" }, "quick")).toThrow();
});

test("R11-R6 errors expose safe policy and retain bounded Retry-After", () => {
  const cases = [
    new CustomerNotificationApiError("RAW_INPUT_INTERNAL", 400, "ASSISTANT_INPUT_INVALID"),
    new CustomerNotificationApiError("RAW_MODE_INTERNAL", 400, "NOVABOT_MODE_INVALID"),
    new CustomerNotificationApiError("RAW_UNSUPPORTED_INTERNAL", 400, "NOVABOT_MODE_UNSUPPORTED"),
    new CustomerNotificationApiError("RAW_AUTH_INTERNAL", 401, "AUTH_TOKEN_INVALID"),
    new CustomerNotificationApiError("RAW_RATE_INTERNAL", 429, "NOVABOT_RATE_LIMITED", 37),
    new CustomerNotificationApiError("RAW_PROVIDER_INTERNAL", 503, "NOVABOT_MODE_PROVIDER_UNAVAILABLE"),
    new CustomerNotificationApiError("RAW_CHAT_INTERNAL", 500, "NOVABOT_CHAT_UNAVAILABLE"),
  ];
  const policies = cases.map(describeCustomerNovaBotFailure);
  expect(policies[1].refreshCapability).toBe(true);
  expect(policies[2].refreshCapability).toBe(true);
  expect(policies[4].retryAfterSeconds).toBe(37);
  expect(policies[5].refreshCapability).toBe(true);
  expect(JSON.stringify(policies)).not.toMatch(/RAW_|GEMINI|API_KEY|billing/i);
});

test("R11-R6 public capability and Retry-After transports stay exact", () => {
  expect(customerNotificationApiTestUtils.requestRule("/api/assistant/capability", "GET")).toEqual({
    path: "/api/assistant/capability",
    method: "GET",
  });
  expect(customerNotificationApiTestUtils.normalizeRetryAfterSeconds("300")).toBe(300);
  expect(customerNotificationApiTestUtils.normalizeRetryAfterSeconds(" 300 ")).toBeNull();
  expect(customerNotificationApiTestUtils.normalizeRetryAfterSeconds("86401")).toBeNull();
  const apiSource = readFileSync(apiSourceUrl, "utf8");
  const notificationSource = readFileSync(notificationApiSourceUrl, "utf8");
  const nativeSource = readFileSync(nativePluginUrl, "utf8");
  expect(apiSource).toContain('requestCustomerApi("/api/assistant/capability", "GET", undefined, false)');
  expect(nativeSource).toContain('"/api/assistant/capability"');
  expect(nativeSource).toContain("String requestToken = publicGet ? null : token;");
  expect(apiSource).toContain("sessionGuard: CustomerSessionGuard");
  expect(apiSource).toContain("sessionGuard,");
  expect(notificationSource).toContain("guard && !sessionStateMatchesGuard(currentCustomerSessionState(), guard)");
});

test("R11-R6 session epochs, mode header, scroll chain, and composer remain guarded", () => {
  const source = readFileSync(prototypeUrl, "utf8");
  const css = readFileSync(cssUrl, "utf8");
  const screenStart = source.indexOf("function NovaBotScreen");
  const nativeStart = source.indexOf("if (NATIVE_SHELL) {", screenStart);
  const nativeEnd = source.indexOf("const sendMessage =", nativeStart);
  const nativeScreen = source.slice(nativeStart, nativeEnd);
  expect(source).toContain("currentCustomerSessionGuard()");
  expect(source).toContain("customerSessionMatchesGuard(operationSession)");
  expect(source).toContain("++conversationGeneration.current");
  expect(source).toContain('"novastore:auth-required", "novastore:auth-unverified"');
  expect(nativeScreen).toContain("allowedModeIds, operationSession");
  expect(source).toContain("void refreshCapability(nextGeneration)");
  expect(nativeScreen).toContain('data-testid="novabot-conversation-reset"');
  expect(source).toContain("let runtimeNovaBotRetryUntil = 0");
  expect(source).toContain("runtimeNovaBotRetryUntil = Math.max(runtimeNovaBotRetryUntil");
  const resetStart = source.indexOf("const resetConversation = useCallback");
  const resetEnd = source.indexOf("}, [refreshCapability]);", resetStart);
  expect(source.slice(resetStart, resetEnd)).not.toContain("setRetryUntil(0)");
  expect(source).toContain('role="listbox" aria-label="NovaBot sohbet modları"');
  expect(source).toContain("capability.modes.map");
  expect(nativeScreen.indexOf("<header>")).toBeLessThan(nativeScreen.indexOf('className="messages"'));
  expect(nativeScreen.indexOf('className="messages"')).toBeLessThan(nativeScreen.indexOf('className="composer native-composer"'));
  expect(css).toContain(".novabot-mode-menu { max-height:");
  expect(css).toContain("overscroll-behavior: contain");
  expect(css).toContain(".composer.native-composer");
  expect(source).not.toContain("RAW_PROVIDER_REASON_MUST_NOT_RENDER");
});
