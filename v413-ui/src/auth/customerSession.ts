import { Capacitor, registerPlugin } from "@capacitor/core";

export const CUSTOMER_TOKEN_KEY = "nova_user_token";
export const CUSTOMER_SESSION_KEY = "novastore.customer.session.v1";
const LEGACY_CUSTOMER_USER_KEY = "nova_user_info";
const LEGACY_VERIFIED_USER_KEY = "novastore.customer.verifiedUserId";

export type CustomerCredentialSession = Readonly<{
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  sessionId: number | null;
}>;

export type CustomerSessionState = Readonly<{
  generation: number;
  session: CustomerCredentialSession | null;
}>;

type NativeSessionResult = Readonly<{
  generation: number;
  session?: unknown;
}>;

type NovaCustomerSessionPlugin = Readonly<{
  load(): Promise<NativeSessionResult>;
  replace(options: { expectedGeneration: number; session: CustomerCredentialSession }): Promise<NativeSessionResult>;
  clear(options: { expectedGeneration: number }): Promise<NativeSessionResult>;
}>;

const NovaCustomerSession = registerPlugin<NovaCustomerSessionPlugin>("NovaCustomerSession");
const MAX_CREDENTIAL_LENGTH = 8_192;
const ACCESS_REFRESH_WINDOW_MS = 60_000;

let nativeState: CustomerSessionState = Object.freeze({ generation: 0, session: null });
let nativeInitialization: Promise<void> | null = null;
let nativeInitialized = false;
let webGeneration = 0;
let observedWebFingerprint: string | null = null;

export class CustomerSessionStorageError extends Error {
  readonly code: string;

  constructor(message: string, code = "CUSTOMER_SESSION_STORAGE_FAILED") {
    super(message);
    this.name = "CustomerSessionStorageError";
    this.code = code;
  }
}

function webValue(key: string) {
  try { return String(globalThis.localStorage?.getItem?.(key) || "").trim(); } catch { return ""; }
}

function webFingerprint() {
  return `${webValue(CUSTOMER_SESSION_KEY)}\u0000${webValue(CUSTOMER_TOKEN_KEY)}`;
}

function observeWebGeneration() {
  const fingerprint = webFingerprint();
  if (observedWebFingerprint !== fingerprint) {
    observedWebFingerprint = fingerprint;
    ++webGeneration;
  }
}

function bumpWebGeneration() {
  observedWebFingerprint = webFingerprint();
  ++webGeneration;
}

function canonicalCredential(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length < 16 || normalized.length > MAX_CREDENTIAL_LENGTH || /\s/u.test(normalized)) return null;
  return normalized;
}

function canonicalTimestamp(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const milliseconds = Date.parse(normalized);
  return normalized && normalized.length <= 64 && Number.isFinite(milliseconds) ? normalized : null;
}

function canonicalSessionId(value: unknown) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeCustomerCredentialSession(value: unknown): CustomerCredentialSession | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const accessToken = canonicalCredential(source.accessToken);
  if (!accessToken) return null;

  const refreshToken = canonicalCredential(source.refreshToken);
  const accessExpiresAt = canonicalTimestamp(source.accessExpiresAt);
  const refreshExpiresAt = canonicalTimestamp(source.refreshExpiresAt);
  const sessionId = canonicalSessionId(source.sessionId);
  const hasRefreshField = source.refreshToken !== undefined && source.refreshToken !== null && source.refreshToken !== "";
  const hasAccessExpiry = source.accessExpiresAt !== undefined && source.accessExpiresAt !== null && source.accessExpiresAt !== "";
  const hasRefreshExpiry = source.refreshExpiresAt !== undefined && source.refreshExpiresAt !== null && source.refreshExpiresAt !== "";
  const hasSessionId = source.sessionId !== undefined && source.sessionId !== null && source.sessionId !== "";
  const hasAnyRefreshMetadata = hasRefreshField || hasAccessExpiry || hasRefreshExpiry || hasSessionId;

  if (!hasAnyRefreshMetadata) {
    return Object.freeze({ accessToken, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, sessionId: null });
  }
  if (!refreshToken || !accessExpiresAt || !refreshExpiresAt || !sessionId) return null;
  if (Date.parse(accessExpiresAt) > Date.parse(refreshExpiresAt)) return null;
  return Object.freeze({ accessToken, refreshToken, accessExpiresAt, refreshExpiresAt, sessionId });
}

function readWebSession() {
  const serialized = webValue(CUSTOMER_SESSION_KEY);
  if (serialized) {
    try {
      const parsed = normalizeCustomerCredentialSession(JSON.parse(serialized));
      if (parsed) return parsed;
    } catch { /* fall through to the one-time legacy access candidate */ }
  }
  return readLegacyAccessSession();
}

function readLegacyAccessSession() {
  const legacyAccessToken = canonicalCredential(webValue(CUSTOMER_TOKEN_KEY));
  return legacyAccessToken
    ? Object.freeze({ accessToken: legacyAccessToken, refreshToken: null, accessExpiresAt: null, refreshExpiresAt: null, sessionId: null })
    : null;
}

function readWebState(): CustomerSessionState {
  observeWebGeneration();
  return Object.freeze({ generation: webGeneration, session: readWebSession() });
}

function parseNativeResult(value: NativeSessionResult): CustomerSessionState {
  const generation = Number(value?.generation);
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new CustomerSessionStorageError("Güvenli müşteri oturumu nesli doğrulanamadı.", "CUSTOMER_SESSION_STORAGE_RESPONSE_INVALID");
  }
  const session = value.session === undefined || value.session === null
    ? null
    : normalizeCustomerCredentialSession(value.session);
  if (value.session !== undefined && value.session !== null && !session) {
    throw new CustomerSessionStorageError("Güvenli müşteri oturumu doğrulanamadı.", "CUSTOMER_SESSION_STORAGE_RESPONSE_INVALID");
  }
  return Object.freeze({ generation, session });
}

function scrubBrowserCredentials() {
  try {
    globalThis.localStorage?.removeItem?.(CUSTOMER_SESSION_KEY);
    globalThis.localStorage?.removeItem?.(CUSTOMER_TOKEN_KEY);
    globalThis.localStorage?.removeItem?.(LEGACY_CUSTOMER_USER_KEY);
    globalThis.localStorage?.removeItem?.(LEGACY_VERIFIED_USER_KEY);
  } catch { /* native secure authority remains the source of truth */ }
}

async function initializeNativeSession() {
  const loaded = parseNativeResult(await NovaCustomerSession.load());
  nativeState = loaded;
  // A persisted generation greater than zero is an explicit secure-store
  // history/tombstone. Never resurrect browser credentials after logout.
  const migrationCandidate = !loaded.session && loaded.generation === 0
    ? readLegacyAccessSession()
    : null;
  if (migrationCandidate) {
    nativeState = parseNativeResult(await NovaCustomerSession.replace({
      expectedGeneration: loaded.generation,
      session: migrationCandidate,
    }));
  }
  scrubBrowserCredentials();
  nativeInitialized = true;
}

export async function initializeCustomerSession() {
  if (!Capacitor.isNativePlatform()) {
    observeWebGeneration();
    return;
  }
  if (nativeInitialized) return;
  if (!nativeInitialization) {
    nativeInitialization = initializeNativeSession().catch((error) => {
      nativeState = Object.freeze({ generation: 0, session: null });
      nativeInitialized = false;
      throw error instanceof CustomerSessionStorageError
        ? error
        : new CustomerSessionStorageError("Güvenli müşteri oturumu açılamadı.");
    }).finally(() => { nativeInitialization = null; });
  }
  await nativeInitialization;
}

export function currentCustomerSessionState(): CustomerSessionState {
  return Capacitor.isNativePlatform() ? nativeState : readWebState();
}

export function currentCustomerSession() {
  return currentCustomerSessionState().session;
}

export function customerSessionCanRefresh(session = currentCustomerSession()) {
  return Boolean(session?.refreshToken && session.accessExpiresAt && session.refreshExpiresAt && session.sessionId);
}

export function customerSessionNeedsRefresh(session = currentCustomerSession(), now = Date.now()) {
  if (!session || !customerSessionCanRefresh(session)) return false;
  const accessExpiry = Date.parse(session.accessExpiresAt!);
  const refreshExpiry = Date.parse(session.refreshExpiresAt!);
  return refreshExpiry > now && accessExpiry <= now + ACCESS_REFRESH_WINDOW_MS;
}

export function customerRefreshExpired(session = currentCustomerSession(), now = Date.now()) {
  return Boolean(session?.refreshExpiresAt && Date.parse(session.refreshExpiresAt) <= now);
}

export async function replaceCustomerSession(expectedGeneration: number, value: CustomerCredentialSession) {
  await initializeCustomerSession();
  const session = normalizeCustomerCredentialSession(value);
  if (!session) throw new CustomerSessionStorageError("Müşteri oturum nesli eksik veya geçersiz.", "CUSTOMER_SESSION_STORAGE_INPUT_INVALID");
  const current = currentCustomerSessionState();
  if (current.generation !== expectedGeneration) {
    throw new CustomerSessionStorageError("Müşteri oturumu bu sırada değişti.", "CUSTOMER_SESSION_GENERATION_STALE");
  }
  if (Capacitor.isNativePlatform()) {
    const replaced = parseNativeResult(await NovaCustomerSession.replace({ expectedGeneration, session }));
    if (replaced.generation <= expectedGeneration || !replaced.session) {
      throw new CustomerSessionStorageError("Güvenli müşteri oturumu atomik değiştirilemedi.", "CUSTOMER_SESSION_STORAGE_RESPONSE_INVALID");
    }
    nativeState = replaced;
    scrubBrowserCredentials();
    return nativeState;
  }
  try {
    globalThis.localStorage?.setItem?.(CUSTOMER_SESSION_KEY, JSON.stringify(session));
    globalThis.localStorage?.removeItem?.(CUSTOMER_TOKEN_KEY);
    globalThis.localStorage?.removeItem?.(LEGACY_CUSTOMER_USER_KEY);
    globalThis.localStorage?.removeItem?.(LEGACY_VERIFIED_USER_KEY);
  } catch {
    throw new CustomerSessionStorageError("Müşteri oturumu kaydedilemedi.");
  }
  bumpWebGeneration();
  return readWebState();
}

export async function clearStoredCustomerSession(expectedGeneration?: number) {
  await initializeCustomerSession();
  const current = currentCustomerSessionState();
  if (expectedGeneration !== undefined && current.generation !== expectedGeneration) return false;
  if (Capacitor.isNativePlatform()) {
    const cleared = parseNativeResult(await NovaCustomerSession.clear({ expectedGeneration: current.generation }));
    if (cleared.generation <= current.generation || cleared.session) {
      throw new CustomerSessionStorageError("Güvenli müşteri oturumu temizlenemedi.", "CUSTOMER_SESSION_STORAGE_RESPONSE_INVALID");
    }
    nativeState = cleared;
    scrubBrowserCredentials();
    return true;
  }
  try {
    globalThis.localStorage?.removeItem?.(CUSTOMER_SESSION_KEY);
    globalThis.localStorage?.removeItem?.(CUSTOMER_TOKEN_KEY);
    globalThis.localStorage?.removeItem?.(LEGACY_CUSTOMER_USER_KEY);
    globalThis.localStorage?.removeItem?.(LEGACY_VERIFIED_USER_KEY);
  } catch {
    throw new CustomerSessionStorageError("Müşteri oturumu temizlenemedi.");
  }
  bumpWebGeneration();
  return true;
}

export const customerSessionTestUtils = Object.freeze({
  canonicalCredential,
  canonicalSessionId,
  canonicalTimestamp,
  normalizeCustomerCredentialSession,
});
