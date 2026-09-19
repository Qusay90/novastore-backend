import { MAX_CART_QUANTITY, MAX_LINE_QUANTITY, variantError } from "../adapters/variantContract.js";

export function cartIncreaseQuantity({ currentQuantity, totalQuantity, requestedQuantity, availableStock }) {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1) throw variantError("CART_QUANTITY_INVALID", "Geçerli bir ürün adedi gir.");
  const capacity = Math.max(0, Math.min(MAX_LINE_QUANTITY - currentQuantity, MAX_CART_QUANTITY - totalQuantity, availableStock - currentQuantity));
  return currentQuantity + Math.min(requestedQuantity, capacity);
}

export function cartEditedQuantity({ currentQuantity, totalQuantity, requestedQuantity, availableStock }) {
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 0 || requestedQuantity > 999) throw variantError("CART_QUANTITY_INVALID", "Geçerli bir ürün adedi gir.");
  // An existing over-limit/unavailable row must remain reducible without changing
  // unrelated rows or forcing it directly down to the current purchase limit.
  if (requestedQuantity <= currentQuantity) return requestedQuantity;
  const increase = requestedQuantity - currentQuantity;
  if (cartIncreaseQuantity({ currentQuantity, totalQuantity, requestedQuantity: increase, availableStock }) !== requestedQuantity) {
    throw variantError("CART_PURCHASE_LIMIT", "Artırmadan önce sepeti kontrol et: bir seçenekten en fazla 20, toplamda 50 ürün satın alınabilir; güncel stok da yeterli olmalı.");
  }
  return requestedQuantity;
}
