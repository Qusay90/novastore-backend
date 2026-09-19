import { createAuthAdapter } from "../adapters/authAdapter.js";
import { createAssistantAdapter } from "../adapters/assistantAdapter.js";
import { createCartV2Adapter } from "../adapters/cartV2Adapter.js";
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
    origin: location?.origin || "http://localhost",
  });
  const catalogAdapter = createCatalogAdapter(http);
  const businessIdentityAdapter = createBusinessIdentityAdapter(http);
  const legalAdapter = createLegalAdapter(http);
  const authAdapter = createAuthAdapter({ http, storage, location });
  const customerHttp = createCustomerHttp({
    fetchImpl,
    storage,
    eventTarget: root,
    origin: location?.origin || "http://localhost",
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
      catalogAdapter.load({ signal }).catch((error) => {
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
    const allowedProductIds = new Set(productById.keys());
    const favoritesAdapter = readOnlyPreview ? null : createFavoritesAdapter({ root });
    const cartAdapter = readOnlyPreview
      ? null
      : createCartV2Adapter({
        http: customerHttp,
        root,
        storage,
        location,
        getProduct: (id) => productById.get(Number(id)) || null,
      });
    const assistantAdapter = createAssistantAdapter({
      http: customerHttp,
      getProduct: (id) => productById.get(Number(id)) || null,
    });

    // Establish the customer principal before loading account data. Expired sessions
    // must still reach the ordinary login page, without downgrading the account cart.
    let session = readOnlyPreview ? READ_ONLY_PREVIEW_SESSION : await authAdapter.load({ signal });
    const secondaryWarnings = [];
    let [favoriteIds, cartItems] = readOnlyPreview
      ? [READ_ONLY_PREVIEW_IDS, READ_ONLY_PREVIEW_ITEMS]
      : await Promise.all([
        favoritesAdapter.load({ allowedProductIds }).catch((error) => { secondaryWarnings.push(error); return new Set(); }),
        // This empty display placeholder is paired with a BLOCKED sync status. It is
        // never persisted or treated as a successful empty server cart.
        cartAdapter.load({ allowedProductIds }).catch(() => []),
      ]);
    if (!readOnlyPreview && !storage?.getItem?.("nova_user_token")) {
      if (session.status !== "guest") cartItems = await cartAdapter.load().catch(() => []);
      session = Object.freeze({ status: "guest", user: null, warning: session.warning });
    }

    const runtimeCatalog = Object.freeze({
      ...catalog,
      products: visibleProducts,
      loadProduct: (productId, options = {}) => catalogAdapter.loadProduct(productId, {
        catalog,
        signal: options.signal,
      }),
      loadCollection: (collectionSlug, options = {}) => catalogAdapter.loadCollection(collectionSlug, {
        catalog,
        signal: options.signal,
      }),
    });

    const refreshCustomerState = async ({ cartItems = [] } = {}) => {
      if (readOnlyPreview) {
        return Object.freeze({ favoriteIds: READ_ONLY_PREVIEW_IDS, cartItems: READ_ONLY_PREVIEW_ITEMS });
      }
      const [favoriteIds, refreshedCart] = await Promise.all([
        favoritesAdapter.load({ allowedProductIds }),
        cartAdapter.refreshAfterAuthentication(cartItems, { allowedProductIds }),
      ]);
      return Object.freeze({
        favoriteIds,
        cartItems: refreshedCart,
      });
    };
    const requireVerifiedCart = (operation) => (...args) => {
      if (!readOnlyPreview && cartAdapter.getSyncStatus().phase === "blocked") {
        const error = new Error("Sepet eşitlemesi tamamlanmadan ödeme başlatılamaz.");
        error.code = "CART_SYNC_BLOCKED";
        return Promise.reject(error);
      }
      return operation(...args);
    };

    return Object.freeze({
      catalog: runtimeCatalog,
      businessIdentity,
      legal: legalAdapter,
      session,
      warnings: Object.freeze([...(catalog.warnings || []), session.warning, ...secondaryWarnings].filter(Boolean)),
      favorites: Object.freeze({
        initialIds: favoriteIds,
        set: readOnlyPreview ? previewMutationBlocked : favoritesAdapter.set,
      }),
      cart: Object.freeze({
        initialItems: Object.freeze(cartItems),
        persist: readOnlyPreview ? previewMutationBlocked : cartAdapter.persist,
        subscribe: readOnlyPreview ? (() => () => {}) : cartAdapter.subscribe,
        handoffToCheckout: readOnlyPreview ? previewMutationBlocked : cartAdapter.handoffToCheckout,
        finalize: readOnlyPreview ? previewMutationBlocked : cartAdapter.finalize,
        getMigration: readOnlyPreview ? (() => ({ unresolvedItems: [], localItems: [] })) : cartAdapter.getMigration,
        resolveLegacy: readOnlyPreview ? previewMutationBlocked : cartAdapter.resolveLegacy,
        subscribeMigration: readOnlyPreview ? (() => () => {}) : cartAdapter.subscribeMigration,
        getSyncStatus: readOnlyPreview ? (() => ({ phase: "ready" })) : cartAdapter.getSyncStatus,
        subscribeSync: readOnlyPreview ? (() => () => {}) : cartAdapter.subscribeSync,
        retrySync: readOnlyPreview ? previewMutationBlocked : cartAdapter.load,
      }),
      auth: Object.freeze({
        openAccount: readOnlyPreview ? (() => undefined) : (() => authAdapter.openAccount(session)),
      }),
      customer: customerAccountAdapter,
      checkout: Object.freeze({ ...checkoutAdapter,
        quote: requireVerifiedCart(checkoutAdapter.quote),
        previewAgreements: requireVerifiedCart(checkoutAdapter.previewAgreements),
        initialize: requireVerifiedCart(checkoutAdapter.initialize),
      }),
      community: productCommunityAdapter,
      publicStore: Object.freeze({
        load: (storeSlug, options = {}) => publicStoreAdapter.load(storeSlug, {
          catalog: runtimeCatalog,
          signal: options.signal,
        }),
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
