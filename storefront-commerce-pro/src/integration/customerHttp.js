const CUSTOMER_TOKEN_KEY = "nova_user_token";

const RULES = Object.freeze([
  { methods: ["POST"], pattern: /^\/api\/users\/(?:login|register)$/, authenticated: false },
  { methods: ["POST"], pattern: /^\/api\/auth\/(?:forgot-password|reset-password)$/, authenticated: false },
  { methods: ["GET", "PATCH"], pattern: /^\/api\/users\/me$/, authenticated: true },
  { methods: ["GET"], pattern: /^\/api\/users\/security-status$/, authenticated: true },
  { methods: ["POST"], pattern: /^\/api\/users\/change-password$/, authenticated: true },
  { methods: ["GET", "POST"], pattern: /^\/api\/addresses$/, authenticated: true },
  { methods: ["PUT", "DELETE"], pattern: /^\/api\/addresses\/\d+$/, authenticated: true },
  { methods: ["PATCH", "POST"], pattern: /^\/api\/addresses\/\d+\/default$/, authenticated: true },
  { methods: ["GET"], pattern: /^\/api\/orders\/user\/\d+$/, authenticated: true },
  { methods: ["POST"], pattern: /^\/api\/orders\/\d+\/cancel$/, authenticated: true },
  { methods: ["GET"], pattern: /^\/api\/campaigns\/coupons\/active$/, authenticated: true },
  { methods: ["POST"], pattern: /^\/api\/campaigns\/quote$/, authenticated: false },
  { methods: ["GET"], pattern: /^\/api\/notifications\/user\/\d+$/, authenticated: true },
  { methods: ["PATCH"], pattern: /^\/api\/notifications\/\d+\/read$/, authenticated: true },
  { methods: ["PATCH"], pattern: /^\/api\/notifications\/read-all\/\d+$/, authenticated: true },
  { methods: ["GET"], pattern: /^\/api\/messages\/history\/\d+$/, authenticated: true },
  { methods: ["POST"], pattern: /^\/api\/messages\/send$/, authenticated: true },
  { methods: ["GET"], pattern: /^\/api\/reviews\/product\/\d+$/, authenticated: "optional" },
  { methods: ["POST"], pattern: /^\/api\/reviews$/, authenticated: true },
  { methods: ["GET"], pattern: /^\/api\/questions\/product\/\d+$/, authenticated: false },
  { methods: ["POST"], pattern: /^\/api\/questions\/ask$/, authenticated: true },
  { methods: ["POST"], pattern: /^\/api\/assistant\/chat$/, authenticated: "optional" },
  { methods: ["POST"], pattern: /^\/api\/assistant\/escalate$/, authenticated: true },
  { methods: ["POST"], pattern: /^\/api\/payments\/initialize$/, authenticated: true },
  {
    methods: ["GET"],
    pattern: /^\/api\/payments\/status$/,
    authenticated: true,
    queryKeys: ["paymentRef", "orderId"],
  },
]);

export class CustomerHttpError extends Error {
  constructor(message, { status = 0, code = null, payload = null, path = null } = {}) {
    super(message);
    this.name = "CustomerHttpError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.path = path;
  }
}

function findRule(pathname, method) {
  return RULES.find((rule) => rule.methods.includes(method) && rule.pattern.test(pathname)) || null;
}

export function normalizeCustomerApiRequest(
  input,
  method = "GET",
  origin = globalThis.location?.origin || "http://localhost",
) {
  const normalizedMethod = String(method || "GET").trim().toUpperCase();
  if (
    typeof input !== "string"
    || !input.startsWith("/")
    || input.startsWith("//")
    || /[\\\u0000-\u001f\u007f]/.test(input)
  ) {
    throw new CustomerHttpError("Yalnızca güvenli aynı-origin müşteri API yollarına izin verilir.", {
      code: "CUSTOMER_PATH_INVALID",
    });
  }

  let parsed;
  try {
    parsed = new URL(input, origin);
  } catch {
    throw new CustomerHttpError("Müşteri API yolu çözümlenemedi.", { code: "CUSTOMER_PATH_INVALID" });
  }

  if (parsed.origin !== origin || parsed.hash || parsed.username || parsed.password) {
    throw new CustomerHttpError("Cross-origin veya parçalı müşteri API yolu reddedildi.", {
      code: "CUSTOMER_PATH_FORBIDDEN",
    });
  }

  const rule = findRule(parsed.pathname, normalizedMethod);
  if (!rule) {
    throw new CustomerHttpError("Bu müşteri API işlemi adapter allowlist'inde değil.", {
      code: "CUSTOMER_PATH_FORBIDDEN",
      path: `${parsed.pathname}${parsed.search}`,
    });
  }

  const allowedQueryKeys = new Set(rule.queryKeys || []);
  for (const key of parsed.searchParams.keys()) {
    if (!allowedQueryKeys.has(key)) {
      throw new CustomerHttpError("Müşteri API yolunda izin verilmeyen sorgu alanı bulundu.", {
        code: "CUSTOMER_QUERY_FORBIDDEN",
        path: `${parsed.pathname}${parsed.search}`,
      });
    }
  }
  if (!rule.queryKeys && parsed.search) {
    throw new CustomerHttpError("Bu müşteri API işleminde sorgu parametresine izin verilmez.", {
      code: "CUSTOMER_QUERY_FORBIDDEN",
      path: `${parsed.pathname}${parsed.search}`,
    });
  }

  return Object.freeze({
    path: `${parsed.pathname}${parsed.search}`,
    method: normalizedMethod,
    authenticated: rule.authenticated,
  });
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

export function createCustomerHttp({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  eventTarget = globalThis,
  origin = globalThis.location?.origin || "http://localhost",
  timeoutMs = 10_000,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Customer HTTP fetch fonksiyonu gerektirir.");

  const clearCustomerSession = () => {
    storage?.removeItem?.(CUSTOMER_TOKEN_KEY);
    storage?.removeItem?.("nova_user_info");
    if (typeof CustomEvent === "function") {
      eventTarget?.dispatchEvent?.(new CustomEvent("novastore:auth-required"));
    }
  };

  const request = async (input, {
    method = "GET",
    body,
    signal,
    idempotencyKey = null,
  } = {}) => {
    const normalized = normalizeCustomerApiRequest(input, method, origin);
    const controller = new AbortController();
    const detachAbort = relayAbort(signal, controller);
    const timer = globalThis.setTimeout(() => controller.abort("timeout"), timeoutMs);
    const token = normalized.authenticated !== false
      ? String(storage?.getItem?.(CUSTOMER_TOKEN_KEY) || "")
      : "";

    if (normalized.authenticated === true && !token) {
      globalThis.clearTimeout(timer);
      detachAbort();
      throw new CustomerHttpError("Müşteri oturumu bulunamadı.", {
        status: 401,
        code: "CUSTOMER_SESSION_MISSING",
        path: normalized.path,
      });
    }

    let response;
    try {
      response = await fetchImpl(normalized.path, {
        method: normalized.method,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(idempotencyKey ? { "Idempotency-Key": String(idempotencyKey) } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        const timedOut = controller.signal.reason === "timeout";
        throw new CustomerHttpError(
          timedOut ? "İstek zaman aşımına uğradı." : "İstek iptal edildi.",
          {
            code: timedOut ? "CUSTOMER_TIMEOUT" : "CUSTOMER_ABORTED",
            path: normalized.path,
          },
        );
      }
      throw new CustomerHttpError("NovaStore müşteri API bağlantısı kurulamadı.", {
        code: "CUSTOMER_NETWORK_ERROR",
        payload: { cause: error?.message || String(error) },
        path: normalized.path,
      });
    } finally {
      globalThis.clearTimeout(timer);
      detachAbort();
    }

    const payload = await readPayload(response);
    if (!response.ok) {
      if (token && response.status === 401) clearCustomerSession();
      throw new CustomerHttpError(
        payload.error || payload.message || "Müşteri işlemi tamamlanamadı.",
        {
          status: response.status,
          code: payload.code || null,
          payload,
          path: normalized.path,
        },
      );
    }
    return payload;
  };

  return Object.freeze({ request, clearCustomerSession });
}

export const CUSTOMER_HTTP_TOKEN_KEY = CUSTOMER_TOKEN_KEY;
export const customerHttpTestUtils = Object.freeze({ RULES, findRule });
