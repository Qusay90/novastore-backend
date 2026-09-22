import { createAuthAdapter } from "../adapters/authAdapter.js";
import { createAssistantAdapter } from "../adapters/assistantAdapter.js";
import { createCartAdapter } from "../adapters/cartAdapter.js";
import { createBusinessIdentityAdapter } from "../adapters/businessIdentityAdapter.js";
import { createCatalogAdapter } from "../adapters/catalogAdapter.js";
import { createCheckoutAdapter } from "../adapters/checkoutAdapter.js";
import { createCustomerAccountAdapter } from "../adapters/customerAccountAdapter.js";
import { createFavoritesAdapter } from "../adapters/favoritesAdapter.js";
import { createLegalAdapter } from "../adapters/legalAdapter.js";
import { createProductCommunityAdapter } from "../adapters/productCommunityAdapter.js";
import { createPublicStoreAdapter } from "../adapters/publicStoreAdapter.js";
import { createStoreFollowAdapter } from "../adapters/storeFollowAdapter.js";
import {
  configureRuntimeCatalog,
  getVisibleProducts,
} from "./runtimeCatalog.js";
import { createStorefrontHttp } from "./storefrontHttp.js";
import { createCustomerHttp } from "./customerHttp.js";

const READ_ONLY_PREVIEW_SESSION = Object.freeze({ status: "guest", user: null, warning: null });
const READ_ONLY_PREVIEW_IDS = Object.freeze(new Set());
const READ_ONLY_PREVIEW_ITEMS = Object.freeze([]);
const UNAVAILABLE_CATALOG = Object.freeze({
  categories: Object.freeze([]),
  products: Object.freeze([]),
  navigation: Object.freeze({ code: "main", name: "Kategori ağı", source: "unavailable", items: Object.freeze([]) }),
  collections: Object.freeze([]),
  collectionDetails: Object.freeze([]),
  warnings: Object.freeze(["Katalog şu anda alınamıyor; bu sayfa katalogdan bağımsız güvenli modda açıldı."]),
});

const previewMutationBlocked = async () => {
  const error = new Error("Müşteri önizlemesi salt okunur modda çalışır.");
  error.code = "PUBLIC_STORE_PREVIEW_READ_ONLY";
  throw error;
};

export function createCommerceRuntime({
  root = globalThis,
  fetchImpl = root.fetch?.bind(root),
  storage = root.localStorage,
  location = root.location,
} = {}) {
  const http = createStorefrontHttp({
    fetchImpl,
    storage,
    eventTarget: root,
    origin: location?.origin,
  });
  const catalogAdapter = createCatalogAdapter(http);
  const businessIdentityAdapter = createBusinessIdentityAdapter(http);
  const legalAdapter = createLegalAdapter(http);
  const authAdapter = createAuthAdapter({ http, storage, location });
  const customerHttp = createCustomerHttp({
    fetchImpl,
    storage,
    eventTarget: root,
    origin: location?.origin,
  });
  const customerAccountAdapter = createCustomerAccountAdapter({
    http: customerHttp,
    storage,
    eventTarget: root,
  });
  const checkoutAdapter = createCheckoutAdapter({
    http: customerHttp,
    root,
    storage,
    sessionStorage: root.sessionStorage,
    location,
  });
  const productCommunityAdapter = createProductCommunityAdapter({ http: customerHttp });
  const publicStoreAdapter = createPublicStoreAdapter(http);
  const storeFollowAdapter = createStoreFollowAdapter(customerHttp);

  const initialize = async ({ signal, readOnlyPreview = false, allowUnavailableCatalog = false } = {}) => {
    const [catalog, businessIdentity] = await Promise.all([
      catalogAdapter.load({ signal, cursorPagination: true }).catch((error) => {
        if (error?.code === "STOREFRONT_ABORTED" || !allowUnavailableCatalog) throw error;
        return UNAVAILABLE_CATALOG;
      }),
      businessIdentityAdapter.load({ signal }).catch(() => Object.freeze({
        status: "pending_owner_company_formation",
        identity: null,
      })),
    ]);
    configureRuntimeCatalog(catalog);
    const visibleProducts = Object.freeze(getVisibleProducts());
    const productById = new Map(visibleProducts.map((product) => [Number(product.id), product]));
    const listeners = new Set();
    let catalogVersion = 0;
    const register = (items) => {
      items.forEach((product) => productById.set(Number(product.id), product));
      configureRuntimeCatalog({ categories: catalog.categories, products: [...productById.values()] });
      catalogVersion++;
      listeners.forEach((listener) => listener());
      return items;
    };
    const loadProduct = async (productId, options = {}) => {
      const product = await catalogAdapter.loadProduct(productId, { catalog, signal: options.signal });
      if (!options.signal?.aborted) register([product]);
      return product;
    };
    const hydrate = async (ids) => {
      // Account, return and legal routes retain their catalog-outage boundary.
      if (catalog === UNAVAILABLE_CATALOG) return;
      const pending = [...new Set(ids)].filter((id) => !productById.has(Number(id)));
      // Saved IDs are an explicit selection, not a traversal of the marketplace.
      await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
        while (pending.length) {
          const id = pending.shift();
          try { await loadProduct(id, { signal }); }
          catch (error) { if (error?.status !== 404) throw error; }
        }
      }));
    };
    const favoritesAdapter = readOnlyPreview ? null : createFavoritesAdapter({ root });
    const cartAdapter = readOnlyPreview
      ? null
      : createCartAdapter({
        root,
        storage,
        location,
        getProduct: (id) => productById.get(Number(id)) || null,
        hydrateProducts: hydrate,
      });
    const assistantAdapter = createAssistantAdapter({
      http: customerHttp,
      getProduct: (id) => productById.get(Number(id)) || null,
    });

    const [favoriteIds, cartItems, session] = readOnlyPreview
      ? [READ_ONLY_PREVIEW_IDS, READ_ONLY_PREVIEW_ITEMS, READ_ONLY_PREVIEW_SESSION]
      : await Promise.all([
        favoritesAdapter.load(),
        cartAdapter.load(),
        authAdapter.load({ signal }),
      ]);

    await hydrate([...favoriteIds, ...cartItems.map((item) => item.productId)]);
    const runtimeCatalog = Object.freeze({
      ...catalog,
      products: visibleProducts,
      loadProduct,
      subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      version: () => catalogVersion,
      loadPage: async (query) => {
        const page = await catalogAdapter.loadPage({ ...query, catalog });
        if (!query.signal?.aborted) register(page.items);
        return page;
      },
      loadFilters: catalogAdapter.loadFilters,
      loadCollection: async (collectionSlug, options = {}) => {
        const detail = await catalogAdapter.loadCollection(collectionSlug, { catalog, signal: options.signal });
        if (!options.signal?.aborted) register(detail.products);
        return detail;
      },
    });

    const refreshCustomerState = async ({ cartItems = [] } = {}) => {
      if (readOnlyPreview) {
        return Object.freeze({ favoriteIds: READ_ONLY_PREVIEW_IDS, cartItems: READ_ONLY_PREVIEW_ITEMS });
      }
      const [favoriteIds, refreshedCart] = await Promise.all([
        favoritesAdapter.load(),
        cartAdapter.refreshAfterAuthentication(cartItems),
      ]);
      await hydrate([...favoriteIds, ...refreshedCart.map((item) => item.productId)]);
      return Object.freeze({
        favoriteIds,
        cartItems: refreshedCart,
      });
    };

    return Object.freeze({
      catalog: runtimeCatalog,
      businessIdentity,
      legal: legalAdapter,
      session,
      warnings: Object.freeze([...(catalog.warnings || []), session.warning].filter(Boolean)),
      favorites: Object.freeze({
        initialIds: favoriteIds,
        set: readOnlyPreview ? previewMutationBlocked : favoritesAdapter.set,
      }),
      cart: Object.freeze({
        initialItems: Object.freeze(cartItems),
        persist: readOnlyPreview ? previewMutationBlocked : cartAdapter.persist,
        subscribe: readOnlyPreview ? (() => () => {}) : cartAdapter.subscribe,
        handoffToCheckout: readOnlyPreview ? previewMutationBlocked : cartAdapter.handoffToCheckout,
      }),
      auth: Object.freeze({
        openAccount: readOnlyPreview ? (() => undefined) : (() => authAdapter.openAccount(session)),
      }),
      customer: customerAccountAdapter,
      checkout: checkoutAdapter,
      community: productCommunityAdapter,
      publicStore: Object.freeze({
        load: async (storeSlug, options = {}) => {
          const detail = await publicStoreAdapter.load(storeSlug, { ...options, catalog: runtimeCatalog, cursorPagination: true });
          if (!options.signal?.aborted) register(detail.products);
          return detail;
        },
        follow: Object.freeze({
          load: readOnlyPreview ? previewMutationBlocked : storeFollowAdapter.load,
          set: readOnlyPreview ? previewMutationBlocked : storeFollowAdapter.set,
        }),
      }),
      assistant: assistantAdapter,
      refreshCustomerState,
      readOnlyPreview: readOnlyPreview === true,
    });
  };

  return Object.freeze({ initialize });
}
