export const ADMIN_TOKEN_KEY = "nova_admin_token";
export const ADMIN_LOGIN_URL = "admin-login.html?reason=session-expired&next=admin-commerce-pro-live.html";

export class AdminHttpError extends Error {
  constructor(message, { status = 0, code = "ADMIN_HTTP_ERROR", requestId = "", cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AdminHttpError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function decodeAdminTokenPayload(token, decodeBase64 = globalThis.atob) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3 || typeof decodeBase64 !== "function") return null;
    const base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(decodeBase64(padded));
  } catch (_error) {
    return null;
  }
}

export function isValidAdminToken(token, nowMs = Date.now(), decodeBase64) {
  const payload = decodeAdminTokenPayload(token, decodeBase64);
  const expiresAt = Number(payload?.exp);
  return Boolean(
    payload
    && Number.isInteger(Number(payload.id))
    && payload.role === "admin"
    && Number.isFinite(expiresAt)
    && expiresAt * 1000 > nowMs
  );
}

export function assertRelativeApiPath(input) {
  if (typeof input !== "string" || /[\u0000-\u001f\u007f\\]/.test(input) || !/^\/api(?:\/|$)/.test(input)) {
    throw new AdminHttpError("Yalnızca aynı origin üzerindeki /api yollarına izin verilir.", {
      code: "INVALID_API_PATH",
    });
  }
  const parsed = new URL(input, "https://novastore.invalid");
  if (!/^\/api(?:\/|$)/.test(parsed.pathname) || parsed.hash) {
    throw new AdminHttpError("Yalnızca canonical /api yollarına izin verilir.", {
      code: "INVALID_API_PATH",
    });
  }
  return input;
}

const readJsonPayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new AdminHttpError("Sunucu geçerli bir JSON yanıtı döndürmedi.", {
      status: response.status,
      code: "INVALID_JSON_RESPONSE",
      requestId: response.headers?.get?.("x-request-id") || "",
    });
  }
};

export function createAdminHttp({
  fetchImpl = globalThis.fetch?.bind(globalThis),
  storage = globalThis.localStorage,
  location = globalThis.location,
  now = () => Date.now(),
  decodeBase64,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl bir fonksiyon olmalıdır.");
  let redirectStarted = false;

  const beginReauthentication = () => {
    storage?.removeItem?.(ADMIN_TOKEN_KEY);
    if (redirectStarted) return;
    redirectStarted = true;
    if (location) location.href = ADMIN_LOGIN_URL;
  };

  const request = async (input, init = {}) => {
    const path = assertRelativeApiPath(input);
    const token = storage?.getItem?.(ADMIN_TOKEN_KEY) || "";
    if (!isValidAdminToken(token, now(), decodeBase64)) {
      beginReauthentication();
      throw new AdminHttpError("Yönetici oturumunuz sona erdi. Lütfen tekrar giriş yapın.", {
        status: 401,
        code: "ADMIN_SESSION_EXPIRED",
      });
    }

    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const formDataBody = typeof FormData === "function" && init.body instanceof FormData;
    if (init.body && !headers.has("Content-Type") && !formDataBody) {
      headers.set("Content-Type", "application/json");
    }

    let response;
    try {
      response = await fetchImpl(path, {
        ...init,
        credentials: "same-origin",
        headers,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new AdminHttpError("Sunucuya ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.", {
        code: "NETWORK_ERROR",
        cause: error,
      });
    }

    const requestId = response.headers?.get?.("x-request-id") || "";
    if (response.status === 401) {
      beginReauthentication();
      throw new AdminHttpError("Yönetici oturumunuz sona erdi. Lütfen tekrar giriş yapın.", {
        status: 401,
        code: "ADMIN_SESSION_EXPIRED",
        requestId,
      });
    }

    const payload = await readJsonPayload(response);
    if (!response.ok) {
      const message = payload?.error || payload?.message || payload?.mesaj
        || (response.status === 403
          ? "Bu işlem için yönetici yetkiniz yok."
          : "İstek tamamlanamadı.");
      throw new AdminHttpError(message, {
        status: response.status,
        code: response.status === 403 ? "ADMIN_FORBIDDEN" : "ADMIN_API_ERROR",
        requestId,
      });
    }

    return payload;
  };

  return { request };
}
