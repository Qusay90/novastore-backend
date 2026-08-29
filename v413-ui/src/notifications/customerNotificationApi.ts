import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  normalizeCustomerNotification,
  normalizeCustomerNotificationPage,
  type CustomerNotification,
  type CustomerNotificationPage,
  type CustomerNotificationTarget,
} from "./notificationContract";

export const CUSTOMER_TOKEN_KEY = "nova_user_token";
export const CUSTOMER_USER_KEY = "nova_user_info";
export const CUSTOMER_VERIFIED_USER_KEY = "novastore.customer.verifiedUserId";
export const ANDROID_FCM_TOKEN_KEY = "novastore.android.fcmToken";
export const ANDROID_INSTALLATION_ID_KEY = "novastore.android.installationId";
export const ANDROID_PERMISSION_REQUESTED_KEY = "novastore.android.notificationPermissionRequested";

type NativeApiResponse = Readonly<{ status: number; payload: unknown }>;
type NativeNotificationCapability = Readonly<{
  providerConfigured: boolean;
  notificationsEnabled: boolean;
  sdkInt: number;
}>;

type NovaNotificationApiPlugin = Readonly<{
  request(options: { path: string; method: string; token?: string; body?: Record<string, unknown> }): Promise<NativeApiResponse>;
  getNotificationCapability(): Promise<NativeNotificationCapability>;
  openNotificationSettings(): Promise<void>;
}>;

const NovaNotificationApi = registerPlugin<NovaNotificationApiPlugin>("NovaNotificationApi");
const EXACT_RULES = new Map<string, ReadonlySet<string>>([
  ["/api/users/login", new Set(["POST"])],
  ["/api/users/register", new Set(["POST"])],
  ["/api/users/me", new Set(["GET", "PATCH"])],
  ["/api/users/logout", new Set(["POST"])],
  ["/api/users/security-status", new Set(["GET"])],
  ["/api/users/change-password", new Set(["POST"])],
  ["/api/auth/forgot-password", new Set(["POST"])],
  ["/api/auth/reset-password", new Set(["POST"])],
  ["/api/addresses", new Set(["GET", "POST"])],
  ["/api/messages/send", new Set(["POST"])],
  ["/api/questions/user", new Set(["GET"])],
  ["/api/notifications", new Set(["GET"])],
  ["/api/notifications/unread-count", new Set(["GET"])],
  ["/api/notifications/read-all", new Set(["PATCH"])],
  ["/api/notifications/android-push/tokens", new Set(["POST", "DELETE"])],
  ["/api/notifications/android-push/tokens/session", new Set(["DELETE"])],
]);
const READ_ONE_PATTERN = /^\/api\/notifications\/[1-9]\d*\/read$/u;
const CUSTOMER_ORDER_LIST_PATTERN = /^\/api\/orders\/user\/[1-9]\d*$/u;
const CUSTOMER_RETURN_PATTERN = /^\/api\/returns\/[1-9]\d*$/u;
const CUSTOMER_REVIEW_LIST_PATTERN = /^\/api\/reviews\/user\/[1-9]\d*$/u;
const CUSTOMER_SUPPORT_HISTORY_PATTERN = /^\/api\/messages\/history\/[1-9]\d*$/u;
const CUSTOMER_ADDRESS_PATTERN = /^\/api\/addresses\/[1-9]\d*$/u;
const CUSTOMER_ADDRESS_DEFAULT_PATTERN = /^\/api\/addresses\/[1-9]\d*\/default$/u;
const PUBLIC_PRODUCT_PATTERN = /^\/api\/products\/[1-9]\d*$/u;
const ALLOWED_QUERY_KEYS = new Set(["limit", "cursor"]);
const REQUEST_TIMEOUT_MS = 10_000;

export class CustomerNotificationApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 0, code = "CUSTOMER_NOTIFICATION_REQUEST_FAILED") {
    super(message);
    this.name = "CustomerNotificationApiError";
    this.status = status;
    this.code = code;
  }
}

function requestRule(path: string, method: string) {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/u.test(path)) {
    throw new CustomerNotificationApiError("Bildirim API yolu geçersiz.", 0, "CUSTOMER_NOTIFICATION_PATH_INVALID");
  }
  let parsed: URL;
  try { parsed = new URL(path, "https://novastore.invalid"); } catch {
    throw new CustomerNotificationApiError("Bildirim API yolu çözümlenemedi.", 0, "CUSTOMER_NOTIFICATION_PATH_INVALID");
  }
  if (parsed.origin !== "https://novastore.invalid" || parsed.hash || parsed.username || parsed.password) {
    throw new CustomerNotificationApiError("Cross-origin bildirim yolu reddedildi.", 0, "CUSTOMER_NOTIFICATION_PATH_FORBIDDEN");
  }
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  const exact = EXACT_RULES.get(parsed.pathname);
  const allowed = exact?.has(normalizedMethod)
    || (READ_ONE_PATTERN.test(parsed.pathname) && normalizedMethod === "PATCH")
    || (CUSTOMER_ADDRESS_PATTERN.test(parsed.pathname) && (normalizedMethod === "PUT" || normalizedMethod === "DELETE"))
    || (CUSTOMER_ADDRESS_DEFAULT_PATTERN.test(parsed.pathname) && normalizedMethod === "PATCH")
    || (normalizedMethod === "GET" && (
      CUSTOMER_ORDER_LIST_PATTERN.test(parsed.pathname)
      || CUSTOMER_RETURN_PATTERN.test(parsed.pathname)
      || CUSTOMER_REVIEW_LIST_PATTERN.test(parsed.pathname)
      || CUSTOMER_SUPPORT_HISTORY_PATTERN.test(parsed.pathname)
      || PUBLIC_PRODUCT_PATTERN.test(parsed.pathname)
    ));
  if (!allowed) {
    throw new CustomerNotificationApiError("Bildirim API işlemi allowlist dışında.", 0, "CUSTOMER_NOTIFICATION_PATH_FORBIDDEN");
  }
  if (parsed.pathname === "/api/notifications") {
    const seenKeys = new Set<string>();
    for (const key of parsed.searchParams.keys()) {
      if (!ALLOWED_QUERY_KEYS.has(key) || seenKeys.has(key)) {
        throw new CustomerNotificationApiError("Bildirim sorgu alanı reddedildi.", 0, "CUSTOMER_NOTIFICATION_QUERY_FORBIDDEN");
      }
      seenKeys.add(key);
    }
    const limit = parsed.searchParams.get("limit");
    if (limit !== null && (!/^\d{1,3}$/u.test(limit) || Number(limit) < 1 || Number(limit) > 100)) {
      throw new CustomerNotificationApiError("Bildirim sayfa sınırı geçersiz.", 0, "CUSTOMER_NOTIFICATION_QUERY_FORBIDDEN");
    }
    const cursor = parsed.searchParams.get("cursor");
    if (cursor !== null && !/^[A-Za-z0-9_-]{1,1024}$/u.test(cursor)) {
      throw new CustomerNotificationApiError("Bildirim sayfa imleci geçersiz.", 0, "CUSTOMER_NOTIFICATION_QUERY_FORBIDDEN");
    }
  } else if (parsed.search) {
    throw new CustomerNotificationApiError("Bu bildirim işleminde sorgu alanına izin verilmez.", 0, "CUSTOMER_NOTIFICATION_QUERY_FORBIDDEN");
  }
  return Object.freeze({ path: `${parsed.pathname}${parsed.search}`, method: normalizedMethod });
}

function storageValue(key: string) {
  return String(globalThis.localStorage?.getItem?.(key) || "").trim();
}

function customerToken(required = true) {
  const token = storageValue(CUSTOMER_TOKEN_KEY);
  if (required && !token) {
    throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
  }
  return token;
}

function responseError(status: number, payload: unknown) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  const message = typeof source.error === "string" ? source.error : "Bildirim işlemi tamamlanamadı.";
  const code = typeof source.code === "string" ? source.code : `CUSTOMER_NOTIFICATION_HTTP_${status}`;
  return new CustomerNotificationApiError(message, status, code);
}

async function readResponse(response: Response) {
  const text = await response.text();
  if (text.length > 1_048_576) {
    throw new CustomerNotificationApiError("Bildirim API yanıtı çok büyük.", response.status, "CUSTOMER_NOTIFICATION_RESPONSE_INVALID");
  }
  if (!text) return {};
  try { return JSON.parse(text); } catch {
    throw new CustomerNotificationApiError("Bildirim API yanıtı geçersiz.", response.status, "CUSTOMER_NOTIFICATION_RESPONSE_INVALID");
  }
}

export async function requestCustomerApi(path: string, method = "GET", body?: Record<string, unknown>, authenticated = true) {
  const normalized = requestRule(path, method);
  const token = customerToken(authenticated);
  let status: number;
  let payload: unknown;
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await NovaNotificationApi.request({
        path: normalized.path,
        method: normalized.method,
        ...(token ? { token } : {}),
        ...(body === undefined ? {} : { body }),
      });
      status = Number(result.status);
      payload = result.payload;
    } catch {
      throw new CustomerNotificationApiError("NovaStore bildirim sunucusuna bağlanılamadı.", 0, "CUSTOMER_NOTIFICATION_NETWORK_ERROR");
    }
  } else {
    let response: Response;
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      response = await fetch(normalized.path, {
        method: normalized.method,
        credentials: "same-origin",
        redirect: "error",
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new CustomerNotificationApiError("NovaStore bildirim sunucusuna bağlanılamadı.", 0, "CUSTOMER_NOTIFICATION_NETWORK_ERROR");
    } finally {
      globalThis.clearTimeout(timeout);
    }
    status = response.status;
    payload = await readResponse(response);
  }
  if (!Number.isSafeInteger(status) || status < 100 || status > 599) {
    throw new CustomerNotificationApiError("Bildirim API durum kodu geçersiz.", 0, "CUSTOMER_NOTIFICATION_RESPONSE_INVALID");
  }
  if (status < 200 || status >= 300) {
    if (status === 401) clearCustomerSession();
    throw responseError(status, payload);
  }
  return payload;
}

const request = requestCustomerApi;

function validUser(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const id = Number(source.id);
  const email = typeof source.email === "string" ? source.email.trim() : "";
  const fullName = typeof source.fullName === "string" ? source.fullName.trim() : "";
  const role = typeof source.role === "string" ? source.role.trim().toLowerCase() : "";
  if (!Number.isSafeInteger(id) || id < 1 || !email || !fullName || role !== "customer") return null;
  return Object.freeze({ id, email, fullName, role: "customer" as const });
}

function currentCustomerUserId() {
  try {
    const source = JSON.parse(storageValue(CUSTOMER_USER_KEY)) as Record<string, unknown> | null;
    const id = Number(source?.id);
    if (Number.isSafeInteger(id) && id > 0) return id;
  } catch { /* malformed local session is rejected below */ }
  throw new CustomerNotificationApiError("Müşteri oturumu doğrulanamadı.", 401, "CUSTOMER_SESSION_INVALID");
}

function containsEntityId(payload: unknown, id: number, field = "id") {
  return Array.isArray(payload) && payload.some((item) => item && typeof item === "object" && Number((item as Record<string, unknown>)[field]) === id);
}

export async function authorizeCustomerNotificationTarget(target: CustomerNotificationTarget | null): Promise<CustomerNotificationTarget | null> {
  if (!target || !hasVerifiedCustomerSession()) return null;
  const userId = currentCustomerUserId();
  try {
    if (target.entityType === "order") {
      return containsEntityId(await request(`/api/orders/user/${userId}`), target.entityId!) ? target : null;
    }
    if (target.entityType === "return_request") {
      const payload = await request(`/api/returns/${target.entityId}`);
      return payload && typeof payload === "object" && Number((payload as Record<string, unknown>).id) === target.entityId ? target : null;
    }
    if (target.entityType === "product_question") {
      return containsEntityId(await request("/api/questions/user"), target.entityId!) ? target : null;
    }
    if (target.entityType === "review") {
      return containsEntityId(await request(`/api/reviews/user/${userId}`), target.entityId!) ? target : null;
    }
    if (target.entityType === "support_thread") {
      return containsEntityId(await request(`/api/messages/history/${userId}`), target.entityId!, "support_thread_id") ? target : null;
    }
    if (target.entityType === "product") {
      const payload = await request(`/api/products/${target.entityId}`);
      return payload && typeof payload === "object" && Number((payload as Record<string, unknown>).id) === target.entityId ? target : null;
    }
    return null;
  } catch (error) {
    if (error instanceof CustomerNotificationApiError && [403, 404].includes(error.status)) return null;
    throw error;
  }
}

export function clearCustomerSession() {
  globalThis.localStorage?.removeItem?.(CUSTOMER_TOKEN_KEY);
  globalThis.localStorage?.removeItem?.(CUSTOMER_USER_KEY);
  globalThis.localStorage?.removeItem?.(CUSTOMER_VERIFIED_USER_KEY);
  if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.Event === "function") {
    globalThis.dispatchEvent(new Event("novastore:auth-required"));
  }
}

export async function loginCustomer(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) throw new CustomerNotificationApiError("E-posta ve şifre gerekli.", 0, "CUSTOMER_LOGIN_INPUT_INVALID");
  const payload = await request("/api/users/login", "POST", { email: normalizedEmail, password }, false);
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const token = typeof source.token === "string" ? source.token.trim() : "";
  const user = validUser(source.user);
  if (!token || token.length > 8_192 || !user) {
    throw new CustomerNotificationApiError("Müşteri giriş yanıtı doğrulanamadı.", 0, "CUSTOMER_LOGIN_RESPONSE_INVALID");
  }
  globalThis.localStorage?.setItem?.(CUSTOMER_TOKEN_KEY, token);
  globalThis.localStorage?.setItem?.(CUSTOMER_USER_KEY, JSON.stringify(user));
  globalThis.localStorage?.removeItem?.(CUSTOMER_VERIFIED_USER_KEY);
  return user;
}

export async function logoutCustomer() {
  try { await request("/api/users/logout", "POST"); } finally { clearCustomerSession(); }
}

function requireVerifiedCustomerSession() {
  if (!hasVerifiedCustomerSession()) {
    throw new CustomerNotificationApiError("Doğrulanmış müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_NOT_VERIFIED");
  }
}

export async function listCustomerNotifications(cursor?: string): Promise<CustomerNotificationPage> {
  requireVerifiedCustomerSession();
  const params = new URLSearchParams({ limit: "50" });
  if (cursor) params.set("cursor", cursor);
  return normalizeCustomerNotificationPage(await request(`/api/notifications?${params.toString()}`));
}

export async function getCustomerUnreadCount() {
  requireVerifiedCustomerSession();
  const payload = await request("/api/notifications/unread-count");
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const unreadCount = Number(source.unreadCount);
  if (!Number.isSafeInteger(unreadCount) || unreadCount < 0) {
    throw new CustomerNotificationApiError("Okunmamış bildirim sayısı doğrulanamadı.", 0, "CUSTOMER_NOTIFICATION_RESPONSE_INVALID");
  }
  return unreadCount;
}

export async function markCustomerNotificationRead(id: number): Promise<CustomerNotification> {
  requireVerifiedCustomerSession();
  if (!Number.isSafeInteger(id) || id < 1) throw new CustomerNotificationApiError("Bildirim kimliği geçersiz.", 0, "CUSTOMER_NOTIFICATION_ID_INVALID");
  const payload = await request(`/api/notifications/${id}/read`, "PATCH");
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const notification = normalizeCustomerNotification(source.notification);
  if (!notification) throw new CustomerNotificationApiError("Okundu yanıtı doğrulanamadı.", 0, "CUSTOMER_NOTIFICATION_RESPONSE_INVALID");
  return notification;
}

export async function markAllCustomerNotificationsRead() {
  requireVerifiedCustomerSession();
  const payload = await request("/api/notifications/read-all", "PATCH");
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const updatedCount = Number(source.updatedCount);
  if (!Number.isSafeInteger(updatedCount) || updatedCount < 0) {
    throw new CustomerNotificationApiError("Tümünü okundu yanıtı doğrulanamadı.", 0, "CUSTOMER_NOTIFICATION_RESPONSE_INVALID");
  }
  return updatedCount;
}

export function currentFcmToken() { return storageValue(ANDROID_FCM_TOKEN_KEY); }

export function pushRevocationSatisfied(tokenPresent: boolean, serverRevoked: boolean, providerRevoked: boolean) {
  return !tokenPresent || serverRevoked || providerRevoked;
}

export function fcmRegistrationPayload(token: string, predecessor = "") {
  const normalized = token.trim();
  const previous = predecessor.trim();
  if (normalized.length < 16 || normalized.length > 8_192 || previous.length > 8_192 || /\s/u.test(normalized) || /\s/u.test(previous)) {
    throw new CustomerNotificationApiError("FCM token geçersiz.", 0, "ANDROID_FCM_TOKEN_INVALID");
  }
  return Object.freeze({
    token: normalized,
    platform: "android" as const,
    installationId: installationId(),
    ...(previous && previous !== normalized ? { rotationPredecessor: previous } : {}),
  });
}

export function fcmRevocationPayload(token?: string) {
  const normalized = String(token || "").trim();
  if ((normalized && normalized.length < 16) || normalized.length > 8_192 || /\s/u.test(normalized)) {
    throw new CustomerNotificationApiError("FCM token geçersiz.", 0, "ANDROID_FCM_TOKEN_INVALID");
  }
  return Object.freeze({
    ...(normalized ? { token: normalized } : {}),
    installationId: installationId(),
  });
}

export function installationId() {
  const current = storageValue(ANDROID_INSTALLATION_ID_KEY);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(current)) return current;
  const created = globalThis.crypto?.randomUUID?.();
  if (!created) throw new CustomerNotificationApiError("Kurulum kimliği oluşturulamadı.", 0, "ANDROID_INSTALLATION_ID_UNAVAILABLE");
  globalThis.localStorage?.setItem?.(ANDROID_INSTALLATION_ID_KEY, created);
  return created;
}

export async function registerFcmToken(token: string, predecessor = "") {
  requireVerifiedCustomerSession();
  const payload = fcmRegistrationPayload(token, predecessor);
  await request("/api/notifications/android-push/tokens", "POST", payload);
  globalThis.localStorage?.setItem?.(ANDROID_FCM_TOKEN_KEY, payload.token);
}

export async function revokeFcmToken(token = currentFcmToken()) {
  requireVerifiedCustomerSession();
  if (!token) return;
  await request("/api/notifications/android-push/tokens", "DELETE", fcmRevocationPayload(token));
  globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
}

export async function revokeFcmSession() {
  requireVerifiedCustomerSession();
  await request("/api/notifications/android-push/tokens/session", "DELETE", fcmRevocationPayload());
}

export async function getNativeNotificationCapability() {
  if (!Capacitor.isNativePlatform()) return Object.freeze({ providerConfigured: false, notificationsEnabled: false, sdkInt: 0 });
  return NovaNotificationApi.getNotificationCapability();
}

export async function openNativeNotificationSettings() {
  if (Capacitor.isNativePlatform()) await NovaNotificationApi.openNotificationSettings();
}

export function hasCustomerSession() { return Boolean(storageValue(CUSTOMER_TOKEN_KEY)); }

export function markCustomerSessionVerified(userId: number) {
  const expectedId = Number(userId);
  let storedUser: ReturnType<typeof validUser> = null;
  try { storedUser = validUser(JSON.parse(storageValue(CUSTOMER_USER_KEY))); } catch { /* rejected below */ }
  if (!Number.isSafeInteger(expectedId) || expectedId < 1 || storedUser?.id !== expectedId || !hasCustomerSession()) {
    throw new CustomerNotificationApiError("Doğrulanmış müşteri oturumu mühürlenemedi.", 401, "CUSTOMER_SESSION_VERIFICATION_INVALID");
  }
  globalThis.localStorage?.setItem?.(CUSTOMER_VERIFIED_USER_KEY, String(expectedId));
  if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.Event === "function") {
    globalThis.dispatchEvent(new Event("novastore:auth-verified"));
  }
}

export function hasVerifiedCustomerSession() {
  if (!hasCustomerSession()) return false;
  const verifiedId = Number(storageValue(CUSTOMER_VERIFIED_USER_KEY));
  if (!Number.isSafeInteger(verifiedId) || verifiedId < 1) return false;
  try { return validUser(JSON.parse(storageValue(CUSTOMER_USER_KEY)))?.id === verifiedId; } catch { return false; }
}

export const customerNotificationApiTestUtils = Object.freeze({ requestRule, validUser });
