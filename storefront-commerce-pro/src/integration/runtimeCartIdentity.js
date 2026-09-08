import { cartLineKey as purchaseCartLineKey } from "../adapters/variantContract.js";

export function cartLineKey(entry, variantId = null) {
  if (__NOVASTORE_LOCAL_REVIEW_RUNTIME__) {
    const id = typeof entry === "object" ? entry.productId ?? entry.product?.id ?? entry.id : entry;
    const selected = typeof entry === "object" ? entry.variantId ?? entry.variant_id : variantId;
    if (!selected && typeof id === "string" && /^NS-[0-9]+$/.test(id)) return id;
  }
  return purchaseCartLineKey(entry, variantId);
}
