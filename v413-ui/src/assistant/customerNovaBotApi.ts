import {
  CustomerNotificationApiError,
  hasVerifiedCustomerSession,
  requestCustomerApi,
  type CustomerSessionGuard,
} from "../notifications/customerNotificationApi";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_TOTAL_LENGTH = 12_000;
const MAX_REPLY_LENGTH = 8_000;
const MAX_SUGGESTIONS = 8;
const MAX_PRODUCTS = 8;
const MAX_AVAILABLE_MODES = 24;
const NOVABOT_MODE_ID_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/u;
export const CUSTOMER_NOVABOT_CONTRACT_VERSION = "novabot-modes-v1" as const;

export type CustomerNovaBotModeId = string;

export type CustomerNovaBotMode = Readonly<{
  id: CustomerNovaBotModeId;
  label: string;
  description: string;
}>;

export type CustomerNovaBotCapability = Readonly<{
  contractVersion: typeof CUSTOMER_NOVABOT_CONTRACT_VERSION;
  available: boolean;
  provider: Readonly<{ configured: boolean; ready: boolean }>;
  advancedModesAvailable: boolean;
  modeSelectionAvailable: boolean;
  defaultModeId: CustomerNovaBotModeId | null;
  modes: readonly CustomerNovaBotMode[];
  unavailableReason: string | null;
}>;

export type CustomerNovaBotHistoryItem = Readonly<{
  role: "user" | "assistant";
  message: string;
}>;

export type CustomerNovaBotInput = Readonly<{
  message: string;
  history?: readonly CustomerNovaBotHistoryItem[];
  modeId?: string | null;
}>;

export type CustomerNovaBotProduct = Readonly<{
  id: number;
  title: string;
  price: number;
  currency: "TRY";
  imageUrl: string | null;
  inStock: boolean | null;
}>;

export type CustomerNovaBotReply = Readonly<{
  reply: string;
  modeId: string | null;
  mode: string | null;
  modeLabel: string | null;
  intent: string | null;
  confidence: number | null;
  suggestions: readonly string[];
  products: readonly CustomerNovaBotProduct[];
  cards: readonly CustomerNovaBotProduct[];
  requiresConfirmation: boolean;
  pendingAction: Readonly<{ type: "live_support"; reason: string }> | null;
  allowEscalation: boolean;
  escalated: boolean;
  availableModes: readonly CustomerNovaBotMode[];
}>;

export type CustomerNovaBotFailure = Readonly<{
  message: string;
  refreshCapability: boolean;
  retryAfterSeconds: number | null;
}>;

function apiError(message: string, code: string) {
  return new CustomerNotificationApiError(message, 0, code);
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maximum ? normalized : null;
}

function normalizeModeId(value: unknown) {
  return typeof value === "string"
    && value === value.trim()
    && NOVABOT_MODE_ID_PATTERN.test(value)
    ? value
    : null;
}

function normalizeAvailableModes(value: unknown, allowLegacyTitle = false) {
  if (value === undefined) return Object.freeze([]) as readonly CustomerNovaBotMode[];
  if (!Array.isArray(value) || value.length > MAX_AVAILABLE_MODES) {
    throw apiError("NovaBot mod listesi geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  const seen = new Set<CustomerNovaBotModeId>();
  const modes = value.map((item) => {
    const source = record(item);
    const id = normalizeModeId(source?.id);
    const label = boundedText(source?.label ?? (allowLegacyTitle ? source?.title : undefined), 80);
    const description = boundedText(source?.description, 320);
    if (!source || !id || !label || !description || seen.has(id)) {
      throw apiError("NovaBot mod listesi geçersiz.", "NOVABOT_RESPONSE_INVALID");
    }
    seen.add(id);
    return Object.freeze({ id, label, description });
  });
  return Object.freeze(modes);
}

function normalizeCapability(value: unknown): CustomerNovaBotCapability {
  const source = record(value);
  const provider = record(source?.provider);
  const modes = normalizeAvailableModes(source?.modes);
  const defaultModeId = source?.defaultModeId === null
    ? null
    : normalizeModeId(source?.defaultModeId);
  const unavailableReason = source?.unavailableReason === null
    ? null
    : boundedText(source?.unavailableReason, 96);
  if (
    !source
    || source.contractVersion !== CUSTOMER_NOVABOT_CONTRACT_VERSION
    || typeof source.available !== "boolean"
    || !provider
    || typeof provider.configured !== "boolean"
    || typeof provider.ready !== "boolean"
    || typeof source.advancedModesAvailable !== "boolean"
    || typeof source.modeSelectionAvailable !== "boolean"
    || (source.defaultModeId !== null && !defaultModeId)
    || (source.unavailableReason !== null && !unavailableReason)
    || source.available !== (modes.length > 0)
    || (provider.ready && !provider.configured)
    || (source.advancedModesAvailable && !provider.ready)
    || (source.modeSelectionAvailable && !source.advancedModesAvailable)
    || (source.modeSelectionAvailable && modes.length < 2)
  ) {
    throw apiError("NovaBot yetenek yanıtı doğrulanamadı.", "NOVABOT_CAPABILITY_INVALID");
  }
  return Object.freeze({
    contractVersion: CUSTOMER_NOVABOT_CONTRACT_VERSION,
    available: source.available,
    provider: Object.freeze({ configured: provider.configured, ready: provider.ready }),
    advancedModesAvailable: source.advancedModesAvailable,
    modeSelectionAvailable: source.modeSelectionAvailable,
    defaultModeId,
    modes,
    unavailableReason,
  });
}

export function resolveCustomerNovaBotModeId(capability: CustomerNovaBotCapability, currentModeId?: string | null) {
  if (currentModeId && capability.modes.some((mode) => mode.id === currentModeId)) return currentModeId;
  if (capability.defaultModeId && capability.modes.some((mode) => mode.id === capability.defaultModeId)) {
    return capability.defaultModeId;
  }
  return capability.modes[0]?.id ?? null;
}

function normalizeHistory(value: unknown): readonly CustomerNovaBotHistoryItem[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_HISTORY_ITEMS) {
    throw apiError("NovaBot sohbet geçmişi geçersiz.", "NOVABOT_HISTORY_INVALID");
  }
  let totalLength = 0;
  const history = value.map((item) => {
    const source = record(item);
    const role = source?.role;
    const message = boundedText(source?.message, MAX_MESSAGE_LENGTH);
    if ((role !== "user" && role !== "assistant") || !message) {
      throw apiError("NovaBot sohbet geçmişi geçersiz.", "NOVABOT_HISTORY_INVALID");
    }
    totalLength += message.length;
    return Object.freeze({ role, message });
  });
  if (totalLength > MAX_HISTORY_TOTAL_LENGTH) {
    throw apiError("NovaBot sohbet geçmişi çok uzun.", "NOVABOT_HISTORY_TOO_LARGE");
  }
  return Object.freeze(history);
}

function normalizeRequest(input: CustomerNovaBotInput, allowedModeIds: readonly string[] = []) {
  const source = record(input);
  const message = boundedText(source?.message, MAX_MESSAGE_LENGTH);
  if (!message) throw apiError("NovaBot mesajı geçersiz.", "NOVABOT_MESSAGE_INVALID");
  const history = normalizeHistory(source?.history);
  const modeId = source?.modeId === undefined || source.modeId === null
    ? null
    : normalizeModeId(source.modeId);
  const normalizedAllowedModeIds = allowedModeIds.map(normalizeModeId);
  if (normalizedAllowedModeIds.some((candidate) => !candidate)) {
    throw apiError("NovaBot yetenek modları geçersiz.", "NOVABOT_CAPABILITY_INVALID");
  }
  if (source?.modeId !== undefined && source.modeId !== null && (
    !modeId || !normalizedAllowedModeIds.includes(modeId)
  )) {
    throw apiError("NovaBot modu geçersiz.", "NOVABOT_MODE_INVALID");
  }
  return Object.freeze({
    message,
    history,
    ...(modeId ? { modeId } : {}),
  });
}

function safeImageUrl(value: unknown) {
  const candidate = boundedText(value, 2_048);
  if (!candidate) return null;
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !/[\\\u0000-\u001f\u007f]/u.test(candidate)) return candidate;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.hash) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function normalizeProduct(value: unknown): CustomerNovaBotProduct | null {
  const source = record(value);
  if (!source) return null;
  const id = Number(source.id ?? source.productId);
  const title = boundedText(source.title ?? source.name, 200);
  const price = Number(source.price);
  const currency = boundedText(source.currency ?? "TRY", 8)?.toUpperCase();
  if (!Number.isSafeInteger(id) || id < 1 || !title || !Number.isFinite(price) || price < 0 || currency !== "TRY") return null;
  return Object.freeze({
    id,
    title,
    price,
    currency: "TRY" as const,
    imageUrl: safeImageUrl(source.imageUrl ?? source.image),
    inStock: typeof source.inStock === "boolean" ? source.inStock : null,
  });
}

function normalizeProductList(value: unknown, field: string) {
  if (value === undefined) return Object.freeze([]) as readonly CustomerNovaBotProduct[];
  if (!Array.isArray(value) || value.length > MAX_PRODUCTS) {
    throw apiError(`NovaBot ${field} yanıtı geçersiz.`, "NOVABOT_RESPONSE_INVALID");
  }
  const products = value.map(normalizeProduct);
  if (products.some((product) => product === null)) {
    throw apiError(`NovaBot ${field} yanıtı geçersiz.`, "NOVABOT_RESPONSE_INVALID");
  }
  return Object.freeze(products as CustomerNovaBotProduct[]);
}

function normalizeSuggestions(value: unknown) {
  if (value === undefined) return Object.freeze([]) as readonly string[];
  if (!Array.isArray(value) || value.length > MAX_SUGGESTIONS) {
    throw apiError("NovaBot öneri yanıtı geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  const suggestions = value.map((suggestion) => boundedText(suggestion, 160));
  if (suggestions.some((suggestion) => suggestion === null)) {
    throw apiError("NovaBot öneri yanıtı geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  return Object.freeze(suggestions as string[]);
}

function normalizePendingAction(value: unknown) {
  if (value === undefined || value === null) return null;
  const source = record(value);
  const reason = boundedText(source?.reason, MAX_MESSAGE_LENGTH);
  if (source?.type !== "live_support" || !reason) {
    throw apiError("NovaBot işlem yanıtı geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  return Object.freeze({ type: "live_support" as const, reason });
}

function normalizeResponse(value: unknown, expectedModeId: string | null = null): CustomerNovaBotReply {
  const source = record(value);
  const reply = boundedText(source?.reply ?? source?.message, MAX_REPLY_LENGTH);
  if (!source || !reply) throw apiError("NovaBot yanıtı doğrulanamadı.", "NOVABOT_RESPONSE_INVALID");
  const canonicalMode = source.modeId === undefined || source.modeId === null ? null : normalizeModeId(source.modeId);
  const legacyMode = source.mode === undefined || source.mode === null ? null : normalizeModeId(source.mode);
  if ((source.modeId !== undefined && source.modeId !== null && !canonicalMode)
    || (source.mode !== undefined && source.mode !== null && !legacyMode)
    || (canonicalMode && legacyMode && canonicalMode !== legacyMode)) {
    throw apiError("NovaBot yanıt modu geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  const modeId = canonicalMode ?? legacyMode;
  if (expectedModeId && modeId !== expectedModeId) {
    throw apiError("NovaBot yanıt modu istekle eşleşmiyor.", "NOVABOT_MODE_RESPONSE_MISMATCH");
  }
  const confidenceValue = source.confidence === undefined || source.confidence === null
    ? null
    : Number(source.confidence);
  if (confidenceValue !== null && (!Number.isFinite(confidenceValue) || confidenceValue < 0 || confidenceValue > 1)) {
    throw apiError("NovaBot güven değeri geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  const modeLabel = source.modeLabel === undefined || source.modeLabel === null ? null : boundedText(source.modeLabel, 80);
  const intent = source.intent === undefined || source.intent === null ? null : boundedText(source.intent, 80);
  if ((source.modeLabel !== undefined && source.modeLabel !== null && !modeLabel)
    || (source.intent !== undefined && source.intent !== null && !intent)) {
    throw apiError("NovaBot yanıt metadatası geçersiz.", "NOVABOT_RESPONSE_INVALID");
  }
  const availableModes = normalizeAvailableModes(source.availableModes, true);
  return Object.freeze({
    reply,
    modeId,
    mode: modeId,
    modeLabel,
    intent,
    confidence: confidenceValue,
    suggestions: normalizeSuggestions(source.suggestions),
    products: normalizeProductList(source.products, "ürün"),
    cards: normalizeProductList(source.cards, "kart"),
    requiresConfirmation: source.requiresConfirmation === true,
    pendingAction: normalizePendingAction(source.pendingAction),
    allowEscalation: source.allowEscalation === true,
    escalated: source.escalated === true,
    availableModes,
  });
}

export async function fetchCustomerNovaBotCapability(): Promise<CustomerNovaBotCapability> {
  const payload = await requestCustomerApi("/api/assistant/capability", "GET", undefined, false);
  return normalizeCapability(payload);
}

export async function sendCustomerNovaBotMessage(
  input: CustomerNovaBotInput,
  allowedModeIds: readonly string[] = [],
  sessionGuard: CustomerSessionGuard,
): Promise<CustomerNovaBotReply> {
  const body = normalizeRequest(input, allowedModeIds);
  const payload = await requestCustomerApi(
    "/api/assistant/chat",
    "POST",
    body,
    hasVerifiedCustomerSession(),
    sessionGuard,
  );
  return normalizeResponse(payload, "modeId" in body ? body.modeId : null);
}

export function describeCustomerNovaBotFailure(error: unknown): CustomerNovaBotFailure {
  if (!(error instanceof CustomerNotificationApiError)) {
    return Object.freeze({
      message: "NovaBot şu anda yanıt veremiyor. Mesajın korundu; lütfen yeniden dene.",
      refreshCapability: false,
      retryAfterSeconds: null,
    });
  }
  if (error.code === "NOVABOT_RATE_LIMITED" || error.status === 429) {
    const wait = error.retryAfterSeconds;
    return Object.freeze({
      message: wait
        ? `Çok kısa sürede fazla mesaj gönderildi. Mesajın korundu; ${wait} saniye sonra yeniden dene.`
        : "Çok kısa sürede fazla mesaj gönderildi. Mesajın korundu; kısa süre sonra yeniden dene.",
      refreshCapability: false,
      retryAfterSeconds: wait,
    });
  }
  if (error.code === "NOVABOT_MODE_INVALID" || error.code === "NOVABOT_MODE_UNSUPPORTED") {
    return Object.freeze({
      message: "Sohbet modları güncellendi. Mesajın korundu; bir sunucu modu seçip yeniden dene.",
      refreshCapability: true,
      retryAfterSeconds: null,
    });
  }
  if (error.code === "NOVABOT_MODE_PROVIDER_UNAVAILABLE") {
    return Object.freeze({
      message: "Seçili sohbet modu şu anda kullanılamıyor. Mesajın korundu; kullanılabilir modlar yenilendi.",
      refreshCapability: true,
      retryAfterSeconds: null,
    });
  }
  if (error.status === 401 || error.code.includes("SESSION") || error.code.startsWith("AUTH_")) {
    return Object.freeze({
      message: "Oturum doğrulanamadı. Mesajın korundu; girişini yenileyebilir veya misafir olarak yeniden deneyebilirsin.",
      refreshCapability: true,
      retryAfterSeconds: null,
    });
  }
  if (error.code === "ASSISTANT_INPUT_INVALID") {
    return Object.freeze({
      message: "Mesaj isteği doğrulanamadı. Metni kontrol edip yeniden dene.",
      refreshCapability: false,
      retryAfterSeconds: null,
    });
  }
  if (error.code === "NOVABOT_CHAT_UNAVAILABLE" || error.status >= 500) {
    return Object.freeze({
      message: "NovaBot şu anda yanıt veremiyor. Mesajın korundu; lütfen yeniden dene.",
      refreshCapability: error.status === 503,
      retryAfterSeconds: null,
    });
  }
  return Object.freeze({
    message: "Mesaj gönderilemedi. Mesajın korundu; bağlantını kontrol edip yeniden dene.",
    refreshCapability: false,
    retryAfterSeconds: null,
  });
}

export const customerNovaBotApiTestUtils = Object.freeze({
  normalizeCapability,
  normalizeHistory,
  normalizeModeId,
  normalizeAvailableModes,
  normalizeRequest,
  normalizeResponse,
  resolveSelectedModeId: resolveCustomerNovaBotModeId,
  safeImageUrl,
});
