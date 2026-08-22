import { catalogAdapterTestUtils } from "./catalogAdapter.js";

const asArray = (value) => Array.isArray(value) ? value : [];

export function normalizePublicStoreSlug(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("en-US");
  return normalized.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)
    ? normalized
    : null;
}

const text = (value, maxLength) => String(value ?? "")
  .replace(/[\u0000-\u001f\u007f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maxLength);

const normalizeStore = (value) => {
  const slug = normalizePublicStoreSlug(value?.slug);
  const name = text(value?.name, 160);
  if (!slug || !name) throw new Error("Public mağaza kimliği geçerli değil.");
  return Object.freeze({
    slug,
    name,
    description: text(value?.description, 2000),
    logoUrl: null,
    bannerUrl: null,
    status: value?.status === "open" ? "open" : "open",
    rating: null,
    reviewCount: 0,
    shippingSummary: text(value?.shipping_summary, 2000),
    returnSummary: text(value?.return_summary, 2000),
  });
};

export function createPublicStoreAdapter(http) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("Public mağaza adapterı için storefront HTTP istemcisi gereklidir.");
  }

  const load = async (storeSlug, { catalog, signal } = {}) => {
    const slug = normalizePublicStoreSlug(storeSlug);
    if (!slug) throw new TypeError("Geçerli bir public mağaza slug değeri gereklidir.");
    const payload = await http.request(`/api/public/stores/${encodeURIComponent(slug)}`, { signal });
    const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
    const products = catalogAdapterTestUtils.normalizeProducts(
      asArray(payload?.products),
      categories,
      [],
    );
    return Object.freeze({
      store: normalizeStore(payload?.store),
      products: Object.freeze(products),
    });
  };

  return Object.freeze({ load });
}

export const publicStoreAdapterTestUtils = Object.freeze({ normalizeStore, text });
