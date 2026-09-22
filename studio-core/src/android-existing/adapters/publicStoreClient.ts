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
  getPublicStore(options: { storeSlug: string }): Promise<NativePublicStoreResponse>;
}>;

const NovaPublicStore = registerPlugin<NovaPublicStorePlugin>("NovaPublicStore");

export type PublicStoreLoadOptions = Readonly<{
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

export async function loadCanonicalPublicStore(
  requestedSlug: string,
  options: PublicStoreLoadOptions = {},
): Promise<CustomerPublicStoreProjection> {
  const storeSlug = canonicalPublicStoreSlug(requestedSlug);
  if (Capacitor.isNativePlatform()) {
    const response = await NovaPublicStore.getPublicStore({ storeSlug });
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
    const response = await fetchImpl(`/api/public/stores/${encodeURIComponent(storeSlug)}`, {
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
