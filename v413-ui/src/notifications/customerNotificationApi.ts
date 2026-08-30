import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  clearStoredCustomerSession,
  currentCustomerSession,
  currentCustomerSessionState,
  customerRefreshExpired,
  customerSessionCanRefresh,
  customerSessionNeedsRefresh,
  CUSTOMER_SESSION_KEY,
  CUSTOMER_TOKEN_KEY,
  initializeCustomerSession,
  normalizeCustomerCredentialSession,
  replaceCustomerSession,
  type CustomerCredentialSession,
  type CustomerSessionState,
} from "../auth/customerSession";
import {
  normalizeCustomerNotification,
  normalizeCustomerNotificationPage,
  type CustomerNotification,
  type CustomerNotificationPage,
  type CustomerNotificationTarget,
} from "./notificationContract";

export { CUSTOMER_SESSION_KEY, CUSTOMER_TOKEN_KEY };
export const CUSTOMER_VERIFIED_USER_KEY = "novastore.customer.verifiedUserId";
export const ANDROID_FCM_TOKEN_KEY = "novastore.android.fcmToken";
export const ANDROID_INSTALLATION_ID_KEY = "novastore.android.installationId";
export const ANDROID_PERMISSION_REQUESTED_KEY = "novastore.android.notificationPermissionRequested";

type VerifiedCustomer = Readonly<{ id: number; email: string; fullName: string; role: "customer" }>;
type RefreshResult = Readonly<{ session: CustomerCredentialSession; user: VerifiedCustomer }>;
export type CustomerSessionGuard = Readonly<{ generation: number; sessionId: number | null }>;

// Identity is intentionally process-local. Secure credentials may be restored
// only after the current WebView validates them through /api/users/me.
let verifiedCustomer: VerifiedCustomer | null = null;
let verifiedCustomerGeneration = -1;
let refreshFlight: Readonly<{ generation: number; promise: Promise<RefreshResult> }> | null = null;

function clearCustomerVerification() {
  verifiedCustomer = null;
  verifiedCustomerGeneration = -1;
  try { globalThis.localStorage?.removeItem?.(CUSTOMER_VERIFIED_USER_KEY); } catch { /* process-local identity is already cleared */ }
}

function suspendCustomerVerification() {
  clearCustomerVerification();
  if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.Event === "function") {
    globalThis.dispatchEvent(new Event("novastore:auth-unverified"));
  }
}

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
  ["/api/users/refresh", new Set(["POST"])],
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
  const token = currentCustomerSession()?.accessToken || "";
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

type NormalizedRequest = Readonly<{ path: string; method: string }>;
type TransportResult = Readonly<{ status: number; payload: unknown }>;

async function transportCustomerApi(normalized: NormalizedRequest, body: Record<string, unknown> | undefined, token: string): Promise<TransportResult> {
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
  return Object.freeze({ status, payload });
}

function successful(result: TransportResult) {
  return result.status >= 200 && result.status < 300;
}

function refreshResponse(value: unknown): CustomerCredentialSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const expected = ["accessExpiresAt", "accessToken", "refreshExpiresAt", "refreshToken", "sessionId", "tokenType"];
  if (Object.keys(source).sort().join("\u0000") !== expected.sort().join("\u0000") || source.tokenType !== "Bearer") return null;
  return normalizeCustomerCredentialSession({
    accessToken: source.accessToken,
    refreshToken: source.refreshToken,
    accessExpiresAt: source.accessExpiresAt,
    refreshExpiresAt: source.refreshExpiresAt,
    sessionId: source.sessionId,
  });
}

function loginSession(value: Record<string, unknown>) {
  return normalizeCustomerCredentialSession({
    accessToken: value.token,
    refreshToken: value.refreshToken,
    accessExpiresAt: value.accessExpiresAt,
    refreshExpiresAt: value.refreshExpiresAt,
    sessionId: value.sessionId,
  });
}

async function rejectRefresh(result: TransportResult, expectedGeneration: number): Promise<never> {
  const error = responseError(result.status, result.payload);
  if ([400, 401, 403].includes(result.status)) {
    await clearCustomerSession(expectedGeneration);
  } else if (
    (result.status === 429 || result.status === 503 || result.status >= 500)
    && currentCustomerSessionState().generation === expectedGeneration
  ) {
    suspendCustomerVerification();
  }
  throw error;
}

async function verifyRefreshedCustomer(session: CustomerCredentialSession, generation: number) {
  const result = await transportCustomerApi(requestRule("/api/users/me", "GET"), undefined, session.accessToken);
  const current = currentCustomerSessionState();
  if (current.generation !== generation || current.session?.accessToken !== session.accessToken) {
    throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
  }
  if (!successful(result)) await rejectRefresh(result, generation);
  const source = result.payload && typeof result.payload === "object" && !Array.isArray(result.payload)
    ? result.payload as Record<string, unknown>
    : {};
  const user = validUser(source.user ?? source);
  if (!user) {
    if (currentCustomerSessionState().generation === generation) suspendCustomerVerification();
    throw new CustomerNotificationApiError("Yenilenen müşteri kimliği doğrulanamadı.", 0, "CUSTOMER_REFRESH_ME_INVALID");
  }
  markCustomerSessionVerified(user, generation);
  return user;
}

async function performCanonicalRefresh(expectedGeneration: number): Promise<RefreshResult> {
  const state = currentCustomerSessionState();
  if (state.generation !== expectedGeneration) {
    throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
  }
  const session = state.session;
  if (!session || !customerSessionCanRefresh(session) || customerRefreshExpired(session)) {
    await clearCustomerSession(expectedGeneration);
    throw new CustomerNotificationApiError("Müşteri yenileme oturumu sona erdi.", 401, "AUTH_REFRESH_REJECTED");
  }
  const result = await transportCustomerApi(requestRule("/api/users/refresh", "POST"), {
    refreshToken: session.refreshToken!,
    sessionId: session.sessionId!,
  }, "");
  if (!successful(result)) await rejectRefresh(result, expectedGeneration);
  const replacement = refreshResponse(result.payload);
  if (!replacement || replacement.sessionId !== session.sessionId) {
    await clearCustomerSession(expectedGeneration);
    throw new CustomerNotificationApiError("Müşteri yenileme yanıtı doğrulanamadı.", 0, "CUSTOMER_REFRESH_RESPONSE_INVALID");
  }
  if (currentCustomerSessionState().generation !== expectedGeneration) {
    throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
  }
  // Rotation has invalidated the old server generation. Quarantine its
  // private UI before attempting the durable secure-store replacement so a
  // Keystore persistence failure cannot leave stale private data accepted.
  suspendCustomerVerification();
  const replaced = await replaceCustomerSession(expectedGeneration, replacement);
  const user = await verifyRefreshedCustomer(replacement, replaced.generation);
  return Object.freeze({ session: replacement, user });
}

export async function refreshCustomerSession(expectedGeneration?: number) {
  await initializeCustomerSession();
  const generation = expectedGeneration ?? currentCustomerSessionState().generation;
  if (refreshFlight?.generation === generation) return refreshFlight.promise;
  const promise = performCanonicalRefresh(generation);
  const flight = Object.freeze({ generation, promise });
  refreshFlight = flight;
  try { return await promise; } finally {
    if (refreshFlight === flight) refreshFlight = null;
  }
}

function sessionStateMatchesGuard(state: CustomerSessionState, guard: CustomerSessionGuard) {
  return state.generation === guard.generation
    || Boolean(guard.sessionId && state.session?.sessionId === guard.sessionId);
}

async function authenticatedRequest(
  normalized: NormalizedRequest,
  body: Record<string, unknown> | undefined,
  allowRefresh: boolean,
  retryCount = 0,
  guard?: CustomerSessionGuard,
): Promise<unknown> {
  const initial = currentCustomerSessionState();
  if (guard && !sessionStateMatchesGuard(initial, guard)) {
    throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
  }
  if (!initial.session) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
  if (customerRefreshExpired(initial.session)) {
    await clearCustomerSession(initial.generation);
    throw new CustomerNotificationApiError("Müşteri yenileme oturumu sona erdi.", 401, "AUTH_REFRESH_REJECTED");
  }
  if (allowRefresh && retryCount === 0 && customerSessionNeedsRefresh(initial.session)) {
    await refreshCustomerSession(initial.generation);
  }
  const used = currentCustomerSessionState();
  if (guard && !sessionStateMatchesGuard(used, guard)) {
    throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
  }
  if (!used.session) throw new CustomerNotificationApiError("Müşteri oturumu gerekli.", 401, "CUSTOMER_SESSION_MISSING");
  const result = await transportCustomerApi(normalized, body, used.session.accessToken);
  if (successful(result)) {
    if (currentCustomerSessionState().generation !== used.generation) {
      throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
    }
    return result.payload;
  }
  if (result.status !== 401) throw responseError(result.status, result.payload);

  const current = currentCustomerSessionState();
  if (current.generation !== used.generation) {
    if (guard && !sessionStateMatchesGuard(current, guard)) {
      throw new CustomerNotificationApiError("Müşteri oturumu bu sırada değişti.", 0, "CUSTOMER_SESSION_GENERATION_STALE");
    }
    if (retryCount < 1 && current.session) return authenticatedRequest(normalized, body, false, retryCount + 1, guard);
    throw responseError(result.status, result.payload);
  }
  if (allowRefresh && retryCount === 0 && customerSessionCanRefresh(used.session)) {
    await refreshCustomerSession(used.generation);
    return authenticatedRequest(normalized, body, false, retryCount + 1, guard);
  }
  await clearCustomerSession(used.generation);
  throw responseError(result.status, result.payload);
}

async function requestCustomerApiInternal(
  path: string,
  method = "GET",
  body?: Record<string, unknown>,
  authenticated = true,
  allowRefresh = true,
  guard?: CustomerSessionGuard,
) {
  await initializeCustomerSession();
  const normalized = requestRule(path, method);
  if (normalized.path === "/api/users/refresh") {
    throw new CustomerNotificationApiError("Yenileme işlemi yalnız oturum yöneticisi tarafından çağrılabilir.", 0, "CUSTOMER_REFRESH_DIRECT_CALL_FORBIDDEN");
  }
  if (authenticated) {
    // Every operation is bound to the session family that initiated it. A
    // stale A-side 401 may retry after A's token rotation, but never under a
    // newly logged-in Customer B.
    const operationGuard = guard ?? currentCustomerSessionGuard();
    return authenticatedRequest(normalized, body, allowRefresh, 0, operationGuard);
  }
  const result = await transportCustomerApi(normalized, body, "");
  if (!successful(result)) throw responseError(result.status, result.payload);
  return result.payload;
}

export async function requestCustomerApi(path: string, method = "GET", body?: Record<string, unknown>, authenticated = true) {
  return requestCustomerApiInternal(path, method, body, authenticated, true);
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
  if (!hasVerifiedCustomerSession()) {
    throw new CustomerNotificationApiError("Müşteri oturumu doğrulanamadı.", 401, "CUSTOMER_SESSION_INVALID");
  }
  const id = verifiedCustomer?.id;
  if (Number.isSafeInteger(id) && Number(id) > 0) return Number(id);
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

export async function clearCustomerSession(expectedGeneration?: number) {
  const current = currentCustomerSessionState();
  if (expectedGeneration !== undefined && current.generation !== expectedGeneration) return false;
  // Quarantine private state before durable clearing. If Keystore or
  // SharedPreferences fails, the caller receives that failure but no cached
  // Customer identity remains accepted in this process.
  clearCustomerVerification();
  if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.Event === "function") {
    globalThis.dispatchEvent(new Event("novastore:auth-required"));
  }
  const cleared = await clearStoredCustomerSession(expectedGeneration);
  if (!cleared) return false;
  return true;
}

export function currentCustomerSessionGuard(): CustomerSessionGuard {
  const current = currentCustomerSessionState();
  return Object.freeze({ generation: current.generation, sessionId: current.session?.sessionId ?? null });
}

export function customerSessionMatchesGuard(guard: CustomerSessionGuard) {
  return sessionStateMatchesGuard(currentCustomerSessionState(), guard);
}

export async function clearGuardedCustomerSession(guard: CustomerSessionGuard) {
  const current = currentCustomerSessionState();
  if (
    current.generation !== guard.generation
    && (!guard.sessionId || current.session?.sessionId !== guard.sessionId)
  ) return false;
  return clearCustomerSession(current.generation);
}

export async function loginCustomer(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) throw new CustomerNotificationApiError("E-posta ve şifre gerekli.", 0, "CUSTOMER_LOGIN_INPUT_INVALID");
  await clearCustomerSession();
  const expectedGeneration = currentCustomerSessionState().generation;
  const payload = await request("/api/users/login", "POST", { email: normalizedEmail, password }, false);
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const session = loginSession(source);
  const user = validUser(source.user);
  if (!session || !user) {
    throw new CustomerNotificationApiError("Müşteri giriş yanıtı doğrulanamadı.", 0, "CUSTOMER_LOGIN_RESPONSE_INVALID");
  }
  clearCustomerVerification();
  try {
    await replaceCustomerSession(expectedGeneration, session);
  } catch {
    clearCustomerVerification();
    throw new CustomerNotificationApiError(
      "Giriş doğrulandı ancak güvenli oturum bu cihazda saklanamadı.",
      0,
      "CUSTOMER_LOGIN_SESSION_PERSIST_FAILED",
    );
  }
  return user;
}

export async function logoutCustomer(guard = currentCustomerSessionGuard()) {
  try {
    await requestCustomerApiInternal("/api/users/logout", "POST", undefined, true, true, guard);
  } finally {
    await clearGuardedCustomerSession(guard);
  }
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

export async function revokeFcmToken(token = currentFcmToken(), canFinalize: () => boolean = () => true) {
  requireVerifiedCustomerSession();
  if (!token) return;
  await request("/api/notifications/android-push/tokens", "DELETE", fcmRevocationPayload(token));
  if (canFinalize() && currentFcmToken() === token) {
    globalThis.localStorage?.removeItem?.(ANDROID_FCM_TOKEN_KEY);
  }
}

export async function revokeFcmSession(guard = currentCustomerSessionGuard()) {
  requireVerifiedCustomerSession();
  await requestCustomerApiInternal(
    "/api/notifications/android-push/tokens/session",
    "DELETE",
    fcmRevocationPayload(),
    true,
    true,
    guard,
  );
}

export async function getNativeNotificationCapability() {
  if (!Capacitor.isNativePlatform()) return Object.freeze({ providerConfigured: false, notificationsEnabled: false, sdkInt: 0 });
  return NovaNotificationApi.getNotificationCapability();
}

export async function openNativeNotificationSettings() {
  if (Capacitor.isNativePlatform()) await NovaNotificationApi.openNotificationSettings();
}

export function hasCustomerSession() { return Boolean(currentCustomerSession()); }

export function markCustomerSessionVerified(value: unknown, expectedGeneration = currentCustomerSessionState().generation) {
  const user = validUser(value);
  const current = currentCustomerSessionState();
  if (!user || !current.session || current.generation !== expectedGeneration) {
    throw new CustomerNotificationApiError("Doğrulanmış müşteri oturumu mühürlenemedi.", 401, "CUSTOMER_SESSION_VERIFICATION_INVALID");
  }
  verifiedCustomer = user;
  verifiedCustomerGeneration = expectedGeneration;
  try { globalThis.localStorage?.removeItem?.(CUSTOMER_VERIFIED_USER_KEY); } catch { /* process-local verification remains authoritative */ }
  if (typeof globalThis.dispatchEvent === "function" && typeof globalThis.Event === "function") {
    globalThis.dispatchEvent(new Event("novastore:auth-verified"));
  }
}

export function hasVerifiedCustomerSession() {
  const current = currentCustomerSessionState();
  if (!current.session || current.generation !== verifiedCustomerGeneration) return false;
  return Boolean(verifiedCustomer && Number.isSafeInteger(verifiedCustomer.id) && verifiedCustomer.id > 0);
}

export const customerNotificationApiTestUtils = Object.freeze({
  currentCustomerSessionState,
  loginSession,
  refreshResponse,
  requestRule,
  validUser,
});
