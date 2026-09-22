const MAX_PURCHASE_ID = 2147483647;
export const MAX_LINE_QUANTITY = 20;
export const MAX_CART_QUANTITY = 50;

export const normalizeVariantId = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= MAX_PURCHASE_ID ? id : null;
};

export const variantError = (code, message) => Object.assign(new Error(message), { code });

const VARIANT_ERROR_MESSAGES = Object.freeze({
  VARIANT_REQUIRED: "Bu ürün için bir seçenek seçmelisin.",
  VARIANT_ID_INVALID: "Ürün seçeneği kimliği geçersiz. Yeniden seçim yap.",
  VARIANT_NOT_ALLOWED: "Bu ürün için seçenek kullanılamaz.",
  VARIANT_NOT_PURCHASABLE: "Seçilen seçenek artık satın alınamıyor. Yeniden seçim yapmalısın.",
  VARIANT_STOCK_UNAVAILABLE: "Seçilen seçeneğin güncel stoğu yeterli değil.",
  VARIANT_PRICE_CHANGED: "Seçenek fiyatı değişti. Güncel fiyatı yeniden onaylamalısın.",
});
export const variantErrorMessage = (error) => VARIANT_ERROR_MESSAGES[error?.code || error?.payload?.code || error?.message] || null;

const resolveAliases = (values, code) => {
  const provided = values.filter((value) => value !== null && value !== undefined);
  if (!provided.length) return null;
  const ids = provided.map(normalizeVariantId);
  if (ids.some((id) => !id) || new Set(ids).size !== 1) {
    throw variantError(code, "Ürün veya varyant kimliği geçersiz; seçimi yeniden yapın.");
  }
  return ids[0];
};

export const cartIdentity = (entry) => ({
  productId: resolveAliases([entry?.productId, entry?.product_id, entry?.product?.id,
    ...(entry?.product ? [] : [entry?.id])], "PRODUCT_ID_INVALID"),
  variantId: resolveAliases([entry?.variantId, entry?.variant_id], "VARIANT_ID_INVALID"),
});

export const cartLineKey = (itemOrProductId, variantId = null) => {
  const identity = typeof itemOrProductId === "object"
    ? cartIdentity(itemOrProductId)
    : cartIdentity({ productId: itemOrProductId, variantId });
  return identity.variantId ? `${identity.productId}:${identity.variantId}` : String(identity.productId);
};

export const normalizeVariantSelections = (value) => Object.freeze((Array.isArray(value) ? value : [])
  .filter((selection) => selection && typeof selection.group === "string" && typeof selection.value === "string"
    && selection.group.trim() && selection.value.trim())
  .map((selection) => Object.freeze({ group: selection.group.trim(), value: selection.value.trim() })));

export const formatVariantSelections = (selections) => normalizeVariantSelections(selections)
  .map((selection) => `${selection.group}: ${selection.value}`).join(" · ");

export const normalizePurchasableVariants = (value) => {
  const rows = Array.isArray(value) ? value : [];
  const counts = new Map();
  rows.forEach((row) => {
    const id = normalizeVariantId(row?.id);
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return Object.freeze(rows.map((row) => {
    const id = normalizeVariantId(row?.id);
    const price = row?.price;
    const availableStock = row?.availableStock;
    const selections = normalizeVariantSelections(row?.selections);
    if (!id || counts.get(id) !== 1 || typeof price !== "number" || !Number.isFinite(price) || price < 0
      || !Number.isSafeInteger(availableStock) || availableStock < 0 || typeof row?.purchasable !== "boolean"
      || !Array.isArray(row.selections) || !selections.length || selections.length !== row.selections.length) return null;
    return Object.freeze({
      id,
      sku: typeof row.sku === "string" ? row.sku.trim() : "",
      selections,
      price,
      availableStock,
      purchasable: row.purchasable,
      commerceRevision: Number.isSafeInteger(row.commerce_revision) && row.commerce_revision >= 0
        ? row.commerce_revision : null,
    });
  }).filter(Boolean));
};

export const getProductVariant = (product, variantId) => {
  const id = normalizeVariantId(variantId);
  return id ? (product?.variants || []).find((variant) => variant.id === id) || null : null;
};

export const assertProductVariant = (product, variantId) => {
  const required = product?.variantSelectionRequired === true || product?.variant_selection_required === true;
  if (variantId === null || variantId === undefined) {
    if (required) throw variantError("VARIANT_REQUIRED", "Devam etmek için bir ürün seçeneği seçin.");
    return null;
  }
  if (!normalizeVariantId(variantId)) throw variantError("VARIANT_ID_INVALID", "Ürün seçeneği kimliği geçersiz.");
  if (!required) throw variantError("VARIANT_NOT_ALLOWED", "Bu ürün için varyant seçimi kullanılamaz.");
  const variant = getProductVariant(product, variantId);
  if (!variant) throw variantError("VARIANT_NOT_PURCHASABLE", "Seçilen ürün seçeneği artık satışta değil; yeniden seçim yapın.");
  if (!variant.purchasable || variant.availableStock <= 0) {
    throw variantError("VARIANT_STOCK_UNAVAILABLE", "Seçilen ürün seçeneği şu anda stokta yok.");
  }
  return variant;
};

// Only identity and requested quantity cross the purchase API boundary. Cached display data
// is deliberately excluded; quote and initialize remain responsible for current eligibility.
export const toPurchaseCartItems = (items) => {
  const result = (Array.isArray(items) ? items : []).map((entry) => {
    const { productId, variantId } = cartIdentity(entry);
    if (!productId) throw variantError("PRODUCT_ID_INVALID", "Geçerli bir ürün kimliği gereklidir.");
    const product = entry?.product || entry;
    if ((product?.variantSelectionRequired === true || product?.variant_selection_required === true) && !variantId) {
      throw variantError("VARIANT_REQUIRED", "Devam etmek için bir ürün seçeneği seçin.");
    }
    const quantity = entry?.quantity === undefined ? 1 : entry.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LINE_QUANTITY) {
      throw variantError("CART_QUANTITY_INVALID", "Ürün adedi 1 ile 20 arasında bir tam sayı olmalıdır.");
    }
    return { product_id: productId, ...(variantId ? { variant_id: variantId } : {}), quantity };
  });
  if (result.reduce((total, item) => total + item.quantity, 0) > MAX_CART_QUANTITY) {
    throw variantError("CART_QUANTITY_INVALID", "Sepette en fazla 50 ürün olabilir.");
  }
  const quantities = new Map();
  result.forEach((item) => {
    const key = cartLineKey(item);
    const quantity = (quantities.get(key) || 0) + item.quantity;
    if (quantity > MAX_LINE_QUANTITY) throw variantError("CART_QUANTITY_INVALID", "Aynı ürün seçeneğinden en fazla 20 adet alınabilir.");
    quantities.set(key, quantity);
  });
  return result;
};
