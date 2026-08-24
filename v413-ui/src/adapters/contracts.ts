declare const productIdBrand: unique symbol;

export type ProductId = string & {
  readonly [productIdBrand]: "ProductId";
};

export type ProductIdentitySource = Readonly<{
  productId?: unknown;
  product_id?: unknown;
  id?: unknown;
}>;

export type ProductIdentityFailureReason =
  | "missing-product-id"
  | "invalid-product-id"
  | "conflicting-product-ids"
  | "legacy-id-only";

export type ProductIdentityResolution =
  | Readonly<{
      ok: true;
      productId: ProductId;
      source: "productId" | "product_id" | "both";
    }>
  | Readonly<{
      ok: false;
      reason: ProductIdentityFailureReason;
    }>;

const PRODUCT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function hasOwn(source: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(source, key);
}

function normalizeProductId(value: unknown): ProductId | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0
      ? (String(value) as ProductId)
      : null;
  }

  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (!candidate || !PRODUCT_ID_PATTERN.test(candidate)) return null;

  if (/^\d+$/.test(candidate)) {
    const numericId = BigInt(candidate);
    return numericId > 0n ? (numericId.toString() as ProductId) : null;
  }

  return candidate as ProductId;
}

/**
 * Resolves only explicitly typed product identities. A legacy `id` may be an
 * order-line identifier, so it is deliberately never treated as a product ID.
 */
export function resolveProductIdentity(
  source: ProductIdentitySource | null | undefined,
): ProductIdentityResolution {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return { ok: false, reason: "missing-product-id" };
  }

  const hasCamel = hasOwn(source, "productId");
  const hasSnake = hasOwn(source, "product_id");

  if (!hasCamel && !hasSnake) {
    return hasOwn(source, "id")
      ? { ok: false, reason: "legacy-id-only" }
      : { ok: false, reason: "missing-product-id" };
  }

  const camelId = hasCamel ? normalizeProductId(source.productId) : null;
  const snakeId = hasSnake ? normalizeProductId(source.product_id) : null;

  if ((hasCamel && !camelId) || (hasSnake && !snakeId)) {
    return { ok: false, reason: "invalid-product-id" };
  }

  if (camelId && snakeId && camelId !== snakeId) {
    return { ok: false, reason: "conflicting-product-ids" };
  }

  const productId = camelId ?? snakeId;
  if (!productId) return { ok: false, reason: "invalid-product-id" };

  return {
    ok: true,
    productId,
    source: hasCamel && hasSnake ? "both" : hasCamel ? "productId" : "product_id",
  };
}

export type CustomerTransportErrorCode =
  | "offline"
  | "timeout"
  | "session-expired"
  | "forbidden"
  | "not-found"
  | "rate-limited"
  | "service-unavailable"
  | "unknown";

export type CustomerFacingTransportError = Readonly<{
  code: CustomerTransportErrorCode;
  message: string;
  retryable: boolean;
  requiresAuthentication: boolean;
}>;

const CUSTOMER_TRANSPORT_ERRORS: Readonly<
  Record<CustomerTransportErrorCode, CustomerFacingTransportError>
> = Object.freeze({
  offline: Object.freeze({
    code: "offline",
    message: "Bağlantı kurulamadı. İnternet bağlantını kontrol edip tekrar dene.",
    retryable: true,
    requiresAuthentication: false,
  }),
  timeout: Object.freeze({
    code: "timeout",
    message: "İstek zaman aşımına uğradı. Lütfen tekrar dene.",
    retryable: true,
    requiresAuthentication: false,
  }),
  "session-expired": Object.freeze({
    code: "session-expired",
    message: "Oturumun sona erdi. Devam etmek için yeniden giriş yap.",
    retryable: false,
    requiresAuthentication: true,
  }),
  forbidden: Object.freeze({
    code: "forbidden",
    message: "Bu işlem için yetkin bulunmuyor.",
    retryable: false,
    requiresAuthentication: false,
  }),
  "not-found": Object.freeze({
    code: "not-found",
    message: "İstenen içerik bulunamadı.",
    retryable: false,
    requiresAuthentication: false,
  }),
  "rate-limited": Object.freeze({
    code: "rate-limited",
    message: "Çok fazla istek gönderildi. Lütfen kısa bir süre sonra tekrar dene.",
    retryable: true,
    requiresAuthentication: false,
  }),
  "service-unavailable": Object.freeze({
    code: "service-unavailable",
    message: "Hizmet şu anda kullanılamıyor. Lütfen daha sonra tekrar dene.",
    retryable: true,
    requiresAuthentication: false,
  }),
  unknown: Object.freeze({
    code: "unknown",
    message: "İşlem şu anda tamamlanamıyor. Lütfen tekrar dene.",
    retryable: true,
    requiresAuthentication: false,
  }),
});

function readProperty(source: unknown, key: string): unknown {
  if ((typeof source !== "object" || source === null) && typeof source !== "function") {
    return undefined;
  }

  try {
    return (source as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function readStatus(source: unknown): number | null {
  const direct = readProperty(source, "status");
  const nested = readProperty(readProperty(source, "response"), "status");
  const candidate = direct ?? nested;

  if (typeof candidate === "number" && Number.isInteger(candidate)) return candidate;
  if (typeof candidate === "string" && /^\d{3}$/.test(candidate)) return Number(candidate);
  return null;
}

function readSignal(source: unknown, key: "name" | "code"): string {
  const value = readProperty(source, key);
  return typeof value === "string" ? value.toLocaleUpperCase("en-US") : "";
}

/**
 * Maps transport failures to a closed set of customer-safe messages. The raw
 * error message, URL, response body, stack, tokens, and request data are never
 * copied into the returned value.
 */
export function mapCustomerFacingTransportError(
  failure: unknown,
): CustomerFacingTransportError {
  const status = readStatus(failure);
  const name = readSignal(failure, "name");
  const code = readSignal(failure, "code");

  if (status === 401) return CUSTOMER_TRANSPORT_ERRORS["session-expired"];
  if (status === 403) return CUSTOMER_TRANSPORT_ERRORS.forbidden;
  if (status === 404) return CUSTOMER_TRANSPORT_ERRORS["not-found"];
  if (status === 408 || status === 504) return CUSTOMER_TRANSPORT_ERRORS.timeout;
  if (status === 429) return CUSTOMER_TRANSPORT_ERRORS["rate-limited"];
  if (status !== null && status >= 500 && status <= 599) {
    return CUSTOMER_TRANSPORT_ERRORS["service-unavailable"];
  }

  if (
    name === "ABORTERROR" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    code === "ERR_REQUEST_TIMEOUT"
  ) {
    return CUSTOMER_TRANSPORT_ERRORS.timeout;
  }

  if (
    code === "ERR_NETWORK" ||
    code === "NETWORK_ERROR" ||
    code === "ENETUNREACH" ||
    code === "EHOSTUNREACH" ||
    code === "ECONNREFUSED"
  ) {
    return CUSTOMER_TRANSPORT_ERRORS.offline;
  }

  return CUSTOMER_TRANSPORT_ERRORS.unknown;
}

export type ProductDetailRoute = Readonly<{
  cal: "CAL-06";
  tab: "home";
  view: "";
}>;

export type SecurityRoute = Readonly<{
  cal: "CAL-10";
  tab: "account";
  view: "security";
}>;

export type ProductDetailIntent = Readonly<{
  kind: "open-product-detail";
  source: "order" | "repeat-order";
  productId: ProductId;
  route: ProductDetailRoute;
}>;

export type ProductDetailIntentResolution =
  | Readonly<{ ok: true; intent: ProductDetailIntent }>
  | Readonly<{ ok: false; reason: ProductIdentityFailureReason }>;

export type HelpSecurityIntent = Readonly<{
  kind: "open-security";
  source: "help";
  route: SecurityRoute;
}>;

const PRODUCT_DETAIL_ROUTE: ProductDetailRoute = Object.freeze({
  cal: "CAL-06",
  tab: "home",
  view: "",
});

const SECURITY_ROUTE: SecurityRoute = Object.freeze({
  cal: "CAL-10",
  tab: "account",
  view: "security",
});

function resolveProductDetailIntent(
  source: ProductIdentitySource | null | undefined,
  intentSource: ProductDetailIntent["source"],
): ProductDetailIntentResolution {
  const identity = resolveProductIdentity(source);
  if (!identity.ok) return identity;

  return {
    ok: true,
    intent: Object.freeze({
      kind: "open-product-detail",
      source: intentSource,
      productId: identity.productId,
      route: PRODUCT_DETAIL_ROUTE,
    }),
  };
}

export function resolveOrderProductDetailIntent(
  item: ProductIdentitySource | null | undefined,
): ProductDetailIntentResolution {
  return resolveProductDetailIntent(item, "order");
}

export function resolveRepeatOrderProductDetailIntent(
  item: ProductIdentitySource | null | undefined,
): ProductDetailIntentResolution {
  return resolveProductDetailIntent(item, "repeat-order");
}

export function createHelpSecurityIntent(): HelpSecurityIntent {
  return Object.freeze({
    kind: "open-security",
    source: "help",
    route: SECURITY_ROUTE,
  });
}
