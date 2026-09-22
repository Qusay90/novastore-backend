import { cartIdentity, cartLineKey, variantError } from "./variantContract.js";

const CART_PREFIX = "novastore_cart_";
const VARIANT_CART_PREFIX = "novastore_variant_cart_";
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

const readStoredCart = (storage, key) => {
  try {
    const raw = JSON.parse(storage?.getItem?.(key) || "[]");
    if (!Array.isArray(raw)) throw new Error("invalid cart");
    return raw;
  } catch {
    throw variantError("CART_STORAGE_INVALID", "Kayıtlı sepet okunamadı; devam etmeden önce sepeti kontrol edin.");
  }
};

const readLocalCart = (storage) => readStoredCart(storage, `${CART_PREFIX}${readUserId(storage)}`);

const compactCart = (items, allowedProductIds) => {
  const byKey = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const { productId, variantId } = cartIdentity(item);
    if (!productId) {
      if (variantId) throw variantError("PRODUCT_ID_INVALID", "Kayıtlı ürün seçeneğinin ürün kimliği eksik.");
      return;
    }
    if (!variantId && allowedProductIds instanceof Set && !allowedProductIds.has(productId)) return;
    const quantity = item.quantity === undefined ? 1 : Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > (variantId ? 20 : 999)) {
      throw variantError("CART_QUANTITY_INVALID", "Sepetteki ürün adedi geçersiz.");
    }
    const normalized = { productId, ...(variantId ? { variantId } : {}), quantity };
    const key = cartLineKey(normalized);
    const existing = byKey.get(key);
    if (existing) {
      existing.quantity += quantity;
      if (existing.quantity > (variantId ? 20 : 999)) throw variantError("CART_QUANTITY_INVALID", "Sepette aynı ürün seçeneği için adet sınırı aşıldı.");
    } else byKey.set(key, normalized);
  });
  return [...byKey.values()];
};

export function createCartAdapter({
  root = globalThis,
  storage = root.localStorage,
  location = root.location,
  getProduct,
  hydrateProducts = async () => {},
  checkoutPath = "#/odeme/teslimat",
} = {}) {
  const owner = requireSharedStateOwner(root);
  if (typeof getProduct !== "function") throw new TypeError("Cart adapter getProduct fonksiyonu gerektirir.");

  const isVariantLine = (item) => item.variantId !== undefined
    || getProduct(item.productId)?.variantSelectionRequired === true;
  const readVariants = () => compactCart(readStoredCart(storage, `${VARIANT_CART_PREFIX}${readUserId(storage)}`));
  const writeVariants = (items) => {
    storage?.setItem?.(`${VARIANT_CART_PREFIX}${readUserId(storage)}`, JSON.stringify(compactCart(items)));
  };
  const principal = () => `${readUserId(storage)}:${storage?.getItem?.("nova_user_token") || ""}`;
  const assertPrincipal = (captured) => {
    if (captured !== principal()) throw variantError("SHARED_STATE_PRINCIPAL_CHANGED", "Müşteri oturumu değişti; sepeti yeniden yükleyin.");
  };
  const combinedLocal = (simpleItems = readLocalCart(storage)) => {
    const local = compactCart(simpleItems);
    const canonical = new Map(readVariants().map((item) => [cartLineKey(item), item]));
    let added = false;
    local.filter(isVariantLine).forEach((item) => {
      // A remote product-only line may predate required selection. Keep it for truthful
      // reselection unless an existing canonical variant already replaces that legacy row.
      if (!item.variantId && [...canonical.values()].some((row) => row.productId === item.productId && row.variantId)) return;
      const key = cartLineKey(item);
      if (!canonical.has(key)) { canonical.set(key, item); added = true; }
    });
    if (added) writeVariants([...canonical.values()]);
    return compactCart([...local.filter((item) => !isVariantLine(item)), ...canonical.values()]);
  };

  // The accepted shared-state v1 schema drops variant identity. Keep canonical variant
  // lines in account-scoped local storage and send only simple products through that bridge.
  // Capture old local variant rows before hydration can collapse them into product-only rows.
  const preserveLegacyVariants = () => {
    const local = compactCart(readLocalCart(storage));
    const legacyVariants = local.filter(isVariantLine);
    if (!legacyVariants.length) return;
    const merged = new Map(readVariants().map((item) => [cartLineKey(item), item]));
    legacyVariants.forEach((item) => {
      const current = merged.get(cartLineKey(item));
      merged.set(cartLineKey(item), current ? { ...current, quantity: Math.max(current.quantity, item.quantity) } : item);
    });
    writeVariants([...merged.values()]);
    owner.writeCartLocal(enrich(local.filter((item) => !isVariantLine(item))));
  };

  const enrich = (items) => compactCart(items).map((item) => {
    const product = getProduct(item.productId);
    if (!product) return item.variantId ? { ...item } : null;
    if (isVariantLine(item)) return { ...item };
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
    const captured = principal();
    await hydrateProducts(compactCart(readLocalCart(storage)).map((item) => item.productId));
    assertPrincipal(captured);
    preserveLegacyVariants();
    await owner.hydrateCart();
    assertPrincipal(captured);
    await hydrateProducts(compactCart(readLocalCart(storage)).map((item) => item.productId));
    assertPrincipal(captured);
    return compactCart(combinedLocal(), allowedProductIds);
  };

  const persistLocal = (items) => {
    const enriched = enrich(items);
    const variants = enriched.filter(isVariantLine);
    writeVariants(variants);
    const simpleItems = owner.writeCartLocal(enriched.filter((item) => !isVariantLine(item)));
    const normalized = [...simpleItems, ...variants];
    root.dispatchEvent?.(new CustomEvent("novastore:shared-cart-updated", {
      detail: { items: normalized, source: "commerce-pro" },
    }));
    return { enriched, normalized, simpleItems, hasVariants: variants.length > 0 };
  };

  const persistRemote = async (normalized) => {
    if (!owner.isAuthenticated()) return false;
    const captured = principal();
    try {
      await owner.saveCart(normalized);
      assertPrincipal(captured);
      return true;
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

  const persist = async (items) => {
    const captured = principal();
    const { normalized, simpleItems, hasVariants } = persistLocal(items);
    const remoteSaved = await persistRemote(simpleItems);
    assertPrincipal(captured);
    return { localSaved: true, remoteSaved: remoteSaved && !hasVariants,
      variantPersistence: hasVariants ? "account-scoped-local" : null, items: normalized };
  };

  const subscribe = (listener) => {
    if (typeof listener !== "function") return () => {};
    const visibleItems = (items) => compactCart(items).filter((item) => item.variantId || getProduct(item.productId));
    const onCart = (event) => listener(visibleItems(combinedLocal(event?.detail?.items || readLocalCart(storage))));
    const onStorage = (event) => {
      if (event?.key === `${CART_PREFIX}${readUserId(storage)}`
        || event?.key === `${VARIANT_CART_PREFIX}${readUserId(storage)}` || event?.key === "nova_user_info") {
        listener(visibleItems(combinedLocal()));
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
    const captured = principal();
    const requestedItems = compactCart(items);
    const { enriched, simpleItems, hasVariants } = persistLocal(items);
    if (!enriched.length) throw new Error("Ödemeye geçmek için sepette görünür bir ürün olmalıdır.");
    if (requestedItems.some((item) => isVariantLine(item) && !item.variantId)) {
      throw variantError("VARIANT_REQUIRED", "Devam etmek için bir ürün seçeneği seçin.");
    }
    const stockIssue = requestedItems.find((item) => {
      const product = getProduct(item.productId);
      if (isVariantLine(item)) return false;
      const stock = Math.max(0, Number(product?.stock || 0));
      return !product || stock <= 0 || item.quantity > stock;
    });
    if (stockIssue) {
      throw new Error("Sepetteki ürün miktarı güncel stokla uyuşmuyor.");
    }
    await persistRemote(simpleItems);
    assertPrincipal(captured);
    if (owner.isAuthenticated() && !hasVariants) {
      try {
        await owner.saveCheckout({ items: enriched });
        assertPrincipal(captured);
      } catch (error) {
        owner.reportError(
          "checkout",
          error,
          "Ödeme özeti hazırlanamadı. Sepetiniz korunuyor; lütfen yeniden deneyin.",
        );
        throw error;
      }
    }
    assertPrincipal(captured);
    location?.assign?.(checkoutPath);
  };

  const refreshAfterAuthentication = async (currentItems, { allowedProductIds } = {}) => {
    const captured = principal();
    await hydrateProducts(compactCart(readLocalCart(storage)).map((item) => item.productId));
    assertPrincipal(captured);
    preserveLegacyVariants();
    await owner.hydrateCart();
    assertPrincipal(captured);
    await hydrateProducts(compactCart(readLocalCart(storage)).map((item) => item.productId));
    assertPrincipal(captured);
    const accountItems = compactCart(combinedLocal(), allowedProductIds);
    const mergedByProduct = new Map(accountItems.map((item) => [cartLineKey(item), item]));
    compactCart(currentItems, allowedProductIds).forEach((item) => {
      const key = cartLineKey(item);
      const existing = mergedByProduct.get(key);
      mergedByProduct.set(key, existing
        ? { ...existing, quantity: Math.max(existing.quantity, item.quantity) }
        : item);
    });
    const merged = [...mergedByProduct.values()];
    await hydrateProducts(merged.map((item) => item.productId));
    assertPrincipal(captured);
    const result = await persist(merged);
    assertPrincipal(captured);
    storage?.removeItem?.(`${CART_PREFIX}guest`);
    storage?.removeItem?.(`${VARIANT_CART_PREFIX}guest`);
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
