const CUSTOMER_TOKEN_KEY = "nova_user_token";

const ALLOWED_READ_PATHS = Object.freeze([
  /^\/api\/products(?:\/\d+)?(?:\?.*)?$/,
  /^\/api\/public\/categories(?:\/[^/?#]+(?:\/filters)?)?(?:\?.*)?$/,
  /^\/api\/public\/navigation\/(?:main|mobile|home|footer)(?:\?.*)?$/,
  /^\/api\/public\/collections(?:\/[^/?#]+)?(?:\?.*)?$/,
  /^\/api\/users\/me$/,
]);

export class StorefrontHttpError extends Error {
  constructor(message, { status = 0, code = null, payload = null, path = null } = {}) {
    super(message);
    this.name = "StorefrontHttpError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.path = path;
  }
}

export function normalizeStorefrontApiPath(input, origin = globalThis.location?.origin || "http://localhost") {
  if (
    typeof input !== "string"
    || !input.startsWith("/")
    || input.startsWith("//")
    || /[\\\u0000-\u001f\u007f]/.test(input)
  ) {
    throw new StorefrontHttpError("Yalnızca güvenli aynı-origin API yollarına izin verilir.", {
      code: "STOREFRONT_PATH_INVALID",
    });
  }

  let parsed;
  try {
    parsed = new URL(input, origin);
  } catch {
    throw new StorefrontHttpError("API yolu çözümlenemedi.", { code: "STOREFRONT_PATH_INVALID" });
  }

  if (parsed.origin !== origin || parsed.hash || parsed.username || parsed.password) {
    throw new StorefrontHttpError("Cross-origin veya parçalı API yolu reddedildi.", {
      code: "STOREFRONT_PATH_FORBIDDEN",
    });
  }

  const normalized = `${parsed.pathname}${parsed.search}`;
  if (!ALLOWED_READ_PATHS.some((pattern) => pattern.test(normalized))) {
    throw new StorefrontHttpError("Bu public müşteri API yolu adapter allowlist'inde değil.", {
      code: "STOREFRONT_PATH_FORBIDDEN",
      path: normalized,
    });
  }
  return normalized;
}

const readPayload = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
};

const relayAbort = (source, controller) => {
  if (!source) return () => {};
  if (source.aborted) controller.abort(source.reason);
  const onAbort = () => controller.abort(source.reason);
  source.addEventListener("abort", onAbort, { once: true });
  return () => source.removeEventListener("abort", onAbort);
};

export function createStorefrontHttp({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  origin = globalThis.location?.origin || "http://localhost",
  timeoutMs = 8_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl bir fonksiyon olmalıdır.");

  const clearCustomerSession = () => {
    storage?.removeItem?.(CUSTOMER_TOKEN_KEY);
    storage?.removeItem?.("nova_user_info");
    eventTarget?.dispatchEvent?.(new CustomEvent("novastore:auth-required"));
  };

  const request = async (input, { signal, authenticated = false } = {}) => {
    const path = normalizeStorefrontApiPath(input, origin);
    const controller = new AbortController();
    const detachAbort = relayAbort(signal, controller);
    const timer = globalThis.setTimeout(() => controller.abort("timeout"), timeoutMs);
    const token = authenticated ? String(storage?.getItem?.(CUSTOMER_TOKEN_KEY) || "") : "";

    if (authenticated && !token) {
      globalThis.clearTimeout(timer);
      detachAbort();
      throw new StorefrontHttpError("Müşteri oturumu bulunamadı.", {
        status: 401,
        code: "CUSTOMER_SESSION_MISSING",
        path,
      });
    }

    let response;
    try {
      response = await fetchImpl(path, {
        method: "GET",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        const timedOut = controller.signal.reason === "timeout";
        throw new StorefrontHttpError(
          timedOut ? "İstek zaman aşımına uğradı." : "İstek iptal edildi.",
          { code: timedOut ? "STOREFRONT_TIMEOUT" : "STOREFRONT_ABORTED", path },
        );
      }
      throw new StorefrontHttpError("NovaStore API bağlantısı kurulamadı.", {
        code: "STOREFRONT_NETWORK_ERROR",
        payload: { cause: error?.message || String(error) },
        path,
      });
    } finally {
      globalThis.clearTimeout(timer);
      detachAbort();
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      if (authenticated && response.status === 401) clearCustomerSession();
      throw new StorefrontHttpError(
        payload.error || payload.message || "NovaStore verisi alınamadı.",
        {
          status: response.status,
          code: payload.code || null,
          payload,
          path,
        },
      );
    }
    return payload;
  };

  return Object.freeze({ request, clearCustomerSession });
}

export const STOREFRONT_CUSTOMER_TOKEN_KEY = CUSTOMER_TOKEN_KEY;
