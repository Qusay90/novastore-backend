import {
  CustomerNotificationApiError,
  hasVerifiedCustomerSession,
  requestCustomerApi,
} from "../notifications/customerNotificationApi";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_HISTORY_ITEMS = 10;
const MAX_HISTORY_TOTAL_LENGTH = 12_000;
const MAX_REPLY_LENGTH = 8_000;
const MAX_SUGGESTIONS = 8;
const MAX_PRODUCTS = 8;
const MODES = new Set([
  "professional", "friendly", "buddy", "funny", "witty",
  "quick", "detailed", "technical", "sales",
]);

export type CustomerNovaBotHistoryItem = Readonly<{
  role: "user" | "assistant";
  message: string;
}>;

export type CustomerNovaBotInput = Readonly<{
  message: string;
  history?: readonly CustomerNovaBotHistoryItem[];
  selectedMode?: string | null;
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

function normalizeMode(value: unknown) {
  const mode = boundedText(value, 32)?.toLowerCase() ?? null;
  return mode && MODES.has(mode) ? mode : null;
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

function normalizeRequest(input: CustomerNovaBotInput) {
  const source = record(input);
  const message = boundedText(source?.message, MAX_MESSAGE_LENGTH);
  if (!message) throw apiError("NovaBot mesajı geçersiz.", "NOVABOT_MESSAGE_INVALID");
  const history = normalizeHistory(source?.history);
  const selectedMode = source?.selectedMode === undefined || source.selectedMode === null
    ? null
    : normalizeMode(source.selectedMode);
  if (source?.selectedMode !== undefined && source.selectedMode !== null && !selectedMode) {
    throw apiError("NovaBot modu geçersiz.", "NOVABOT_MODE_INVALID");
  }
  return Object.freeze({
    message,
    history,
    context: Object.freeze(selectedMode ? { selectedMode } : {}),
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

function normalizeResponse(value: unknown): CustomerNovaBotReply {
  const source = record(value);
  const reply = boundedText(source?.reply ?? source?.message, MAX_REPLY_LENGTH);
  if (!source || !reply) throw apiError("NovaBot yanıtı doğrulanamadı.", "NOVABOT_RESPONSE_INVALID");
  const mode = source.mode === undefined || source.mode === null ? null : normalizeMode(source.mode);
  if (source.mode !== undefined && source.mode !== null && !mode) {
    throw apiError("NovaBot yanıt modu geçersiz.", "NOVABOT_RESPONSE_INVALID");
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
  return Object.freeze({
    reply,
    mode,
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
  });
}

export async function sendCustomerNovaBotMessage(input: CustomerNovaBotInput): Promise<CustomerNovaBotReply> {
  const body = normalizeRequest(input);
  const payload = await requestCustomerApi(
    "/api/assistant/chat",
    "POST",
    body,
    hasVerifiedCustomerSession(),
  );
  return normalizeResponse(payload);
}

export const customerNovaBotApiTestUtils = Object.freeze({
  normalizeHistory,
  normalizeRequest,
  normalizeResponse,
  safeImageUrl,
});
