import { normalizePublicStoreSlug } from "./publicStoreAdapter.js";

const normalizeState = (payload, expectedSlug) => {
  const slug = normalizePublicStoreSlug(payload?.store_slug);
  const followerCount = Number(payload?.follower_count);
  if (
    !slug
    || slug !== expectedSlug
    || typeof payload?.following !== "boolean"
    || !Number.isSafeInteger(followerCount)
    || followerCount < 0
  ) {
    throw new Error("Mağaza takip yanıtı geçerli değil.");
  }
  return Object.freeze({
    slug,
    following: payload.following,
    followerCount,
  });
};

export function createStoreFollowAdapter(http) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("Mağaza takip adapterı için müşteri HTTP istemcisi gereklidir.");
  }

  const request = async (storeSlug, method = "GET", { signal } = {}) => {
    const slug = normalizePublicStoreSlug(storeSlug);
    if (!slug) throw new TypeError("Geçerli bir public mağaza slug değeri gereklidir.");
    const payload = await http.request(`/api/store-follows/${encodeURIComponent(slug)}`, {
      method,
      signal,
    });
    return normalizeState(payload, slug);
  };

  return Object.freeze({
    load: (storeSlug, options = {}) => request(storeSlug, "GET", options),
    set: (storeSlug, shouldFollow, options = {}) => request(
      storeSlug,
      shouldFollow === true ? "POST" : "DELETE",
      options,
    ),
  });
}

export const storeFollowAdapterTestUtils = Object.freeze({ normalizeState });
