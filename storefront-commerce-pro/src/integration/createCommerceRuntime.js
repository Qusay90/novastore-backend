import { createAuthAdapter } from "../adapters/authAdapter.js";
import { createAssistantAdapter } from "../adapters/assistantAdapter.js";
import { createCartAdapter } from "../adapters/cartAdapter.js";
import { createCatalogAdapter } from "../adapters/catalogAdapter.js";
import { createCheckoutAdapter } from "../adapters/checkoutAdapter.js";
import { createCustomerAccountAdapter } from "../adapters/customerAccountAdapter.js";
import { createFavoritesAdapter } from "../adapters/favoritesAdapter.js";
import { createProductCommunityAdapter } from "../adapters/productCommunityAdapter.js";
import {
  configureRuntimeCatalog,
  getVisibleProducts,
} from "./runtimeCatalog.js";
import { createStorefrontHttp } from "./storefrontHttp.js";
import { createCustomerHttp } from "./customerHttp.js";

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

  const initialize = async ({ signal } = {}) => {
    const catalog = await catalogAdapter.load({ signal });
    configureRuntimeCatalog(catalog);
    const visibleProducts = Object.freeze(getVisibleProducts());
    const productById = new Map(visibleProducts.map((product) => [Number(product.id), product]));
    const allowedProductIds = new Set(productById.keys());
    const favoritesAdapter = createFavoritesAdapter({ root });
    const cartAdapter = createCartAdapter({
      root,
      storage,
      location,
      getProduct: (id) => productById.get(Number(id)) || null,
    });
    const assistantAdapter = createAssistantAdapter({
      http: customerHttp,
      getProduct: (id) => productById.get(Number(id)) || null,
    });

    const [favoriteIds, cartItems, session] = await Promise.all([
      favoritesAdapter.load({ allowedProductIds }),
      cartAdapter.load({ allowedProductIds }),
      authAdapter.load({ signal }),
    ]);

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
      const [favoriteIds, refreshedCart] = await Promise.all([
        favoritesAdapter.load({ allowedProductIds }),
        cartAdapter.refreshAfterAuthentication(cartItems, { allowedProductIds }),
      ]);
      return Object.freeze({
        favoriteIds,
        cartItems: refreshedCart,
      });
    };

    return Object.freeze({
      catalog: runtimeCatalog,
      session,
      warnings: Object.freeze([...(catalog.warnings || []), session.warning].filter(Boolean)),
      favorites: Object.freeze({
        initialIds: favoriteIds,
        set: favoritesAdapter.set,
      }),
      cart: Object.freeze({
        initialItems: Object.freeze(cartItems),
        persist: cartAdapter.persist,
        subscribe: cartAdapter.subscribe,
        handoffToCheckout: cartAdapter.handoffToCheckout,
      }),
      auth: Object.freeze({
        openAccount: () => authAdapter.openAccount(session),
      }),
      customer: customerAccountAdapter,
      checkout: checkoutAdapter,
      community: productCommunityAdapter,
      assistant: assistantAdapter,
      refreshCustomerState,
    });
  };

  return Object.freeze({ initialize });
}
