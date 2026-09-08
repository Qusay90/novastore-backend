import { useEffect, useMemo, useState } from "react";
import { formatVariantSelections, getProductVariant } from "../adapters/variantContract.js";
import { cartLineKey } from "./runtimeCartIdentity.js";

// Display data is refreshed from detail; persisted cart data owns only IDs and quantity.
export function useCartProducts(cart, products, loadProduct, navigationKey) {
  const fingerprint = cart.map((item) => `${cartLineKey(item)}:${item.quantity}`).join("|");
  const requestKey = `${navigationKey}|${fingerprint}`;
  const [state, setState] = useState({ key: "", products: new Map() });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const ids = [...new Set(cart.map((item) => item.productId))];
    Promise.all(ids.map(async (id) => {
      try { return [id, { product: await loadProduct(id, { signal: controller.signal }) }]; }
      catch (error) { return [id, { error }]; }
    })).then((rows) => { if (active) setState({ key: requestKey, products: new Map(rows) }); });
    return () => { active = false; controller.abort("cart-detail-refresh"); };
  }, [requestKey, loadProduct]);
  return useMemo(() => cart.map((item) => {
    const summary = products.find((product) => product.id === item.productId);
    const result = state.key === requestKey ? state.products.get(item.productId) : null;
    const product = result?.product || summary || {
      id: item.productId, slug: String(item.productId), name: `Ürün #${item.productId}`,
      price: 0, stock: 0, pricePending: true, variantSelectionRequired: true,
    };
    const isVariant = item.variantId != null || product.variantSelectionRequired;
    let variantError = "";
    let display = product;
    if (isVariant) {
      const variant = result?.product && getProductVariant(result.product, item.variantId);
      variantError = !result ? "Seçenek bilgileri güncelleniyor."
        : result.error ? "Seçenek doğrulanamadı. Ürünü açıp yeniden dene."
          : !item.variantId ? "Bu ürün için bir seçenek seçmelisin."
            : !variant ? "Bu seçenek artık satışta değil. Üründen yeniden seçim yap."
              : !variant.purchasable || variant.availableStock <= 0 ? "Bu seçenek şu anda stokta değil."
                : item.quantity > variant.availableStock ? `Bu seçenekten yalnız ${variant.availableStock} adet stokta.` : "";
      display = { ...product, price: variant?.price ?? 0, oldPrice: null,
        stock: variant?.availableStock ?? 0,
        variantLabel: variant ? formatVariantSelections(variant.selections) || variant.sku : `Seçenek #${item.variantId || "—"}`,
        sku: variant?.sku || "", variantError, pricePending: !variant };
    }
    return { ...item, cartKey: cartLineKey(item), variantError, product: display };
  }).filter(Boolean), [cart, products, state, requestKey]);
}
