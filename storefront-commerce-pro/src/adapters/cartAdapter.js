const CART_PREFIX = "novastore_cart_";
const requiredMethods = [
  "isAuthenticated",
  "hydrateCart",
  "saveCart",
  "saveCheckout",
  "writeCartLocal",
  "normalizeCartItems",
  "reportError",
];

const requireSharedStateOwner = (root) => {
  const owner = root?.NovaStoreSharedState;
  const missing = requiredMethods.filter((method) => typeof owner?.[method] !== "function");
  if (missing.length) {
    throw new Error(`NovaStoreSharedState sözleşmesi hazır değil: ${missing.join(", ")}`);
  }
  return owner;
};

const readUserId = (storage) => {
  try {
    const user = JSON.parse(storage?.getItem?.("nova_user_info") || "null");
    return user?.id ? String(user.id) : "guest";
  } catch {
    return "guest";
  }
};

const readLocalCart = (storage, owner) => {
  try {
    const raw = JSON.parse(storage?.getItem?.(`${CART_PREFIX}${readUserId(storage)}`) || "[]");
    return owner.normalizeCartItems(raw);
  } catch {
    return [];
  }
};

const compactCart = (items, allowedProductIds) => (Array.isArray(items) ? items : [])
  .map((item) => ({
    productId: Number(item.productId ?? item.product_id ?? item.id),
    quantity: Math.max(1, Math.min(999, Number(item.quantity || 1))),
  }))
  .filter((item) => (
    Number.isInteger(item.productId)
    && item.productId > 0
    && (!(allowedProductIds instanceof Set) || allowedProductIds.has(item.productId))
  ));

export function createCartAdapter({
  root = globalThis,
  storage = root.localStorage,
  location = root.location,
  getProduct,
  checkoutPath = "#/odeme/teslimat",
} = {}) {
  const owner = requireSharedStateOwner(root);
  if (typeof getProduct !== "function") throw new TypeError("Cart adapter getProduct fonksiyonu gerektirir.");

  const enrich = (items) => compactCart(items).map((item) => {
    const product = getProduct(item.productId);
    if (!product) return null;
    return {
      id: product.id,
      productId: product.id,
      name: product.name,
      price: product.price,
      oldPrice: product.oldPrice,
      old_price: product.oldPrice,
      image: product.imageUrl || "",
      imageUrl: product.imageUrl || "",
      quantity: Math.min(item.quantity, Math.max(1, Number(product.stock || 1))),
      selected: true,
    };
  }).filter(Boolean);

  const load = async ({ allowedProductIds } = {}) => {
    await owner.hydrateCart();
    return compactCart(readLocalCart(storage, owner), allowedProductIds);
  };

  const persist = async (items) => {
    const enriched = enrich(items);
    const normalized = owner.writeCartLocal(enriched);
    root.dispatchEvent?.(new CustomEvent("novastore:shared-cart-updated", {
      detail: { items: normalized, source: "commerce-pro" },
    }));
    if (!owner.isAuthenticated()) return { localSaved: true, remoteSaved: false, items: normalized };
    try {
      await owner.saveCart(normalized);
      return { localSaved: true, remoteSaved: true, items: normalized };
    } catch (error) {
      owner.reportError(
        "cart",
        error,
        "Sepet sunucuya senkronlanamadı; yerel değişiklikleriniz korunuyor.",
      );
      error.localSaved = true;
      throw error;
    }
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => {};
    const visibleItems = (items) => compactCart(items).filter((item) => getProduct(item.productId));
    const onCart = (event) => listener(visibleItems(event?.detail?.items || readLocalCart(storage, owner)));
    const onStorage = (event) => {
      if (event?.key === `${CART_PREFIX}${readUserId(storage)}` || event?.key === "nova_user_info") {
        listener(visibleItems(readLocalCart(storage, owner)));
      }
    };
    root.addEventListener?.("novastore:shared-cart-updated", onCart);
    root.addEventListener?.("storage", onStorage);
    return () => {
      root.removeEventListener?.("novastore:shared-cart-updated", onCart);
      root.removeEventListener?.("storage", onStorage);
    };
  };

  const handoffToCheckout = async (items) => {
    const requestedItems = compactCart(items);
    const stockIssue = requestedItems.find((item) => {
      const product = getProduct(item.productId);
      const stock = Math.max(0, Number(product?.stock || 0));
      return !product || stock <= 0 || item.quantity > stock;
    });
    if (stockIssue) {
      throw new Error("Sepetteki ürün miktarı güncel stokla uyuşmuyor.");
    }
    const enriched = enrich(items);
    if (!enriched.length) throw new Error("Ödemeye geçmek için sepette görünür bir ürün olmalıdır.");
    await persist(items);
    if (owner.isAuthenticated()) {
      try {
        await owner.saveCheckout({ items: enriched });
      } catch (error) {
        owner.reportError(
          "checkout",
          error,
          "Ödeme özeti hazırlanamadı. Sepetiniz korunuyor; lütfen yeniden deneyin.",
        );
        throw error;
      }
    }
    location?.assign?.(checkoutPath);
  };

  const refreshAfterAuthentication = async (currentItems, { allowedProductIds } = {}) => {
    await owner.hydrateCart();
    const accountItems = compactCart(readLocalCart(storage, owner), allowedProductIds);
    const mergedByProduct = new Map(accountItems.map((item) => [item.productId, item]));
    compactCart(currentItems, allowedProductIds).forEach((item) => {
      const existing = mergedByProduct.get(item.productId);
      mergedByProduct.set(item.productId, existing
        ? { ...existing, quantity: Math.max(existing.quantity, item.quantity) }
        : item);
    });
    const merged = [...mergedByProduct.values()];
    const result = await persist(merged);
    storage?.removeItem?.(`${CART_PREFIX}guest`);
    return Object.freeze(compactCart(result.items, allowedProductIds));
  };

  return Object.freeze({ load, persist, subscribe, handoffToCheckout, refreshAfterAuthentication });
}

export const cartAdapterTestUtils = Object.freeze({
  requireSharedStateOwner,
  readUserId,
  readLocalCart,
  compactCart,
});
