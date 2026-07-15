export class StorefrontApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 0, code = "STOREFRONT_API_ERROR") {
    super(message);
    this.name = "StorefrontApiError";
    this.status = status;
    this.code = code;
  }
}

function assertPublicApiPath(path: string): string {
  if (!/^\/api\//.test(path) || path.includes("\\") || path.includes("#")) {
    throw new StorefrontApiError("Geçersiz NovaStore API yolu.", 0, "INVALID_API_PATH");
  }
  if (/^\/api\/admin(?:\/|$)/.test(path)) {
    throw new StorefrontApiError("Storefront admin API yollarını kullanamaz.", 0, "ADMIN_API_FORBIDDEN");
  }
  return path;
}

export async function storefrontGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(assertPublicApiPath(path), {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new StorefrontApiError(
      String(payload?.error || payload?.message || "NovaStore verisi alınamadı."),
      response.status,
      String(payload?.code || "STOREFRONT_API_ERROR"),
    );
  }
  return payload as T;
}
