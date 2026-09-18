import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  canonicalPublicStoreSlug,
  normalizePublicStoreProjection,
  type CustomerPublicStoreProjection,
} from "./publicStoreContract";

type NativePublicStoreResponse = Readonly<{
  projection: unknown;
  apiOrigin: string;
  allowCleartextAssets: boolean;
}>;

type NovaPublicStorePlugin = Readonly<{
  getPublicStore(options: { storeSlug: string; cursor?: string; limit?: number }): Promise<NativePublicStoreResponse>;
}>;

const NovaPublicStore = registerPlugin<NovaPublicStorePlugin>("NovaPublicStore");

export type PublicStoreLoadOptions = Readonly<{
  cursor?: string;
  limit?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

export async function loadCanonicalPublicStore(
  requestedSlug: string,
  options: PublicStoreLoadOptions = {},
): Promise<CustomerPublicStoreProjection> {
  const storeSlug = canonicalPublicStoreSlug(requestedSlug);
  if (options.cursor !== undefined && !/^[A-Za-z0-9_-]{1,1024}$/u.test(options.cursor)) throw new Error("PUBLIC_CURSOR_INVALID");
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)) throw new Error("PUBLIC_LIMIT_INVALID");
  if (Capacitor.isNativePlatform()) {
    const response = await NovaPublicStore.getPublicStore({ storeSlug, ...(options.cursor ? { cursor: options.cursor } : {}), ...(options.limit ? { limit: options.limit } : {}) });
    return normalizePublicStoreProjection(
      response.projection,
      storeSlug,
      response.apiOrigin,
      response.allowCleartextAssets === true,
    );
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const query = new URLSearchParams();
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.limit) query.set("limit", String(options.limit));
    const response = await fetchImpl(`/api/public/stores/${encodeURIComponent(storeSlug)}${query.size ? "?" + query.toString() : ""}`, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw Object.assign(new Error("PUBLIC_STORE_REQUEST_FAILED"), { status: response.status });
    }
    return normalizePublicStoreProjection(await response.json(), storeSlug, window.location.origin, import.meta.env.DEV);
  } finally {
    window.clearTimeout(timeout);
  }
}
