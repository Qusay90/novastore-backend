const asString = (value) => String(value ?? "").trim();

const readUserId = (storage) => {
  try {
    const user = JSON.parse(storage?.getItem?.("nova_user_info") || "null");
    const id = Number(user?.id);
    return Number.isInteger(id) && id > 0 ? String(id) : "guest";
  } catch {
    return "guest";
  }
};

const scopedKey = (storage, prefix) => `${prefix}${readUserId(storage)}`;

const safeJsonRead = (storage, key, fallback = null) => {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

export const toCheckoutCartItems = (items) => (Array.isArray(items) ? items : [])
  .map((entry) => {
    const product = entry?.product || entry;
    const id = Number(product?.id ?? entry?.productId ?? entry?.product_id);
    const quantity = Math.max(1, Number.parseInt(entry?.quantity || 1, 10) || 1);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      id,
      productId: id,
      quantity,
      name: asString(product?.name),
      image: asString(product?.imageUrl || product?.image || product?.image_url),
    };
  })
  .filter(Boolean);

export const reconcileFinalizedCart = (cartItems, purchasedItems) => {
  const purchasedByProduct = new Map();
  toCheckoutCartItems(purchasedItems).forEach((item) => {
    purchasedByProduct.set(item.productId, (purchasedByProduct.get(item.productId) || 0) + item.quantity);
  });
  return Object.freeze((Array.isArray(cartItems) ? cartItems : []).map((item) => {
    const productId = Number(item?.productId ?? item?.product_id ?? item?.id);
    const currentQuantity = Math.max(1, Number.parseInt(item?.quantity || 1, 10) || 1);
    const remainingQuantity = currentQuantity - (purchasedByProduct.get(productId) || 0);
    if (!Number.isInteger(productId) || productId <= 0 || remainingQuantity <= 0) return null;
    return Object.freeze({ ...item, productId, quantity: remainingQuantity });
  }).filter(Boolean));
};

const nonNegativeMoney = (value, label) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Fiyatlandırma yanıtındaki ${label} alanı geçersiz.`);
  }
  return numeric;
};

const normalizeTotals = (value = {}) => {
  const currency = (asString(value.currency || "TRY") || "TRY").toUpperCase();
  if (currency !== "TRY") throw new Error("Fiyatlandırma para birimi TRY olmalıdır.");
  return Object.freeze({
    currency,
    subtotal: nonNegativeMoney(value.subtotal, "ara toplam"),
    bundleDiscount: nonNegativeMoney(value.bundleDiscount, "sepet indirimi"),
    couponDiscount: nonNegativeMoney(value.couponDiscount, "kupon indirimi"),
    shippingFee: nonNegativeMoney(value.shippingFee, "kargo"),
    total: nonNegativeMoney(value.total, "toplam"),
  });
};

export const normalizeQuote = (payload = {}) => Object.freeze({
  totals: normalizeTotals(payload.totals),
  campaigns: Object.freeze({ ...(payload.campaigns || {}) }),
  coupon: Object.freeze({ ...(payload.coupon || {}) }),
  items: Object.freeze(Array.isArray(payload.items) ? payload.items : []),
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const normalizeAgreementPreview = (payload = {}) => {
  const snapshotSha256 = asString(payload.snapshotSha256).toLowerCase();
  const contextSha256 = asString(payload.contextSha256).toLowerCase();
  const documents = Array.isArray(payload.documents) ? payload.documents.map((document) => ({
    slug: asString(document?.slug),
    path: asString(document?.path),
    title: asString(document?.title),
    version: asString(document?.version),
    text: asString(document?.text),
    sourceContentSha256: asString(document?.sourceContentSha256).toLowerCase(),
    contentSha256: asString(document?.contentSha256).toLowerCase(),
  })) : [];
  const valid = payload.schemaVersion === "checkout-agreements-v2"
    && SHA256_PATTERN.test(snapshotSha256)
    && SHA256_PATTERN.test(contextSha256)
    && documents.length > 0
    && documents.every((document) => (
      document.slug
      && document.path.startsWith("/")
      && document.title
      && document.version
      && document.text
      && SHA256_PATTERN.test(document.sourceContentSha256)
      && SHA256_PATTERN.test(document.contentSha256)
    ));
  if (!valid) throw new Error("Sunucu sözleşme özeti doğrulanamadı.");
  const quote = normalizeQuote(payload.quote);
  const contextTotals = normalizeTotals(payload.context?.totals || {});
  if (JSON.stringify(quote.totals) !== JSON.stringify(contextTotals)) {
    throw new Error("Sözleşme ve ödeme toplamları eşleşmiyor.");
  }
  return Object.freeze({
    schemaVersion: payload.schemaVersion,
    snapshotSha256,
    contextSha256,
    quote,
    documents: Object.freeze(documents.map(Object.freeze)),
  });
};

export const isSafePaytrIframeUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "www.paytr.com"
      && url.pathname.startsWith("/odeme/guvenli/");
  } catch {
    return false;
  }
};

const safeSameOriginLocation = (value, origin) => {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || !["http:", "https:"].includes(url.protocol)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

const resolveStorefrontEntry = (location) => {
  const candidate = asString(location?.pathname);
  if (
    !candidate.startsWith("/")
    || candidate.startsWith("//")
    || /[?#\\\u0000-\u001f\u007f]/.test(candidate)
    || ["/paytr-checkout.html", "/payment-result.html"].includes(candidate)
  ) return "/index.html";
  return candidate;
};

export function createCheckoutAdapter({
  http,
  root = globalThis,
  storage = root.localStorage,
  sessionStorage = root.sessionStorage,
  location = root.location,
} = {}) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("Checkout adapter HTTP istemcisi gerektirir.");
  }

  const quote = async (items, couponCode = null, options = {}) => {
    const cartItems = toCheckoutCartItems(items);
    if (!cartItems.length) throw new Error("Fiyatlandırma için sepet boş olamaz.");
    const payload = await http.request("/api/campaigns/quote", {
      method: "POST",
      body: { cartItems, couponCode: asString(couponCode) || null },
      signal: options.signal,
    });
    return normalizeQuote(payload);
  };

  const getCapability = async (options = {}) => http.request('/api/payments/capability', { signal: options.signal });

  const previewAgreements = async ({ session, address, items, couponCode = null }, options = {}) => {
    const user = session?.user;
    if (!["authenticated", "unverified"].includes(session?.status) || !user?.id) {
      throw new Error("Sözleşme özeti için müşteri oturumu gereklidir.");
    }
    const cartItems = toCheckoutCartItems(items);
    if (!cartItems.length) throw new Error("Sözleşme özeti için sepet boş olamaz.");
    const addressId = Number(address?.id);
    if (!Number.isInteger(addressId) || addressId <= 0) throw new Error("Teslimat adresi seçilmelidir.");
    const payload = await http.request("/api/payments/agreements/preview", {
      method: "POST",
      body: {
        addressId,
        cartItems,
        couponCode: asString(couponCode) || null,
      },
      signal: options.signal,
    });
    return normalizeAgreementPreview(payload);
  };

  const initialize = async ({
    session,
    address,
    items,
    couponCode = null,
    agreementAcceptances = [],
    agreementSnapshotSha256 = "",
  }, options = {}) => {
    const user = session?.user;
    if (!["authenticated", "unverified"].includes(session?.status) || !user?.id) {
      throw new Error("Ödemeyi başlatmak için müşteri oturumu gereklidir.");
    }
    const cartItems = toCheckoutCartItems(items);
    if (!cartItems.length) throw new Error("Ödemeyi başlatmak için sepet boş olamaz.");
    const addressId = Number(address?.id);
    if (!Number.isInteger(addressId) || addressId <= 0) throw new Error("Teslimat adresi seçilmelidir.");

    return http.request("/api/payments/initialize", {
      method: "POST",
      body: {
        addressId,
        cartItems,
        couponCode: asString(couponCode) || null,
        paymentMethod: "card",
        agreementSnapshotSha256: asString(agreementSnapshotSha256).toLowerCase(),
        agreementAcceptances: Array.isArray(agreementAcceptances) ? agreementAcceptances.map((agreement) => ({
          slug: asString(agreement?.slug),
          version: asString(agreement?.version),
          accepted: agreement?.accepted === true,
        })) : [],
        analyticsSessionKey: typeof root?.NovaAnalytics?.getSessionId === "function"
          ? root.NovaAnalytics.getSessionId()
          : null,
      },
      signal: options.signal,
    });
  };

  const rememberPending = (result, items) => {
    const orderId = Number(result?.orderId);
    const paymentRef = asString(result?.paymentRef);
    if (!Number.isInteger(orderId) || orderId <= 0 || !paymentRef) {
      throw new Error("Ödeme başlangıç yanıtında sipariş veya ödeme referansı eksik.");
    }
    storage?.setItem?.(scopedKey(storage, "novastore_pending_checkout_"), JSON.stringify({
      orderId,
      paymentRef,
      items: toCheckoutCartItems(items),
      createdAt: Date.now(),
    }));
    return { orderId, paymentRef };
  };

  const handoff = (result, items) => {
    const action = result?.paymentAction || null;
    const iframeUrl = action?.type === "iframe" ? asString(action.iframeUrl) : "";
    if (result?.provider !== "paytr" || !iframeUrl || !isSafePaytrIframeUrl(iframeUrl) || !asString(action?.token)) {
      const error = new Error("Güvenli ödeme hizmeti aktivasyon sürecindedir.");
      error.code = "PAYMENT_PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    const { orderId, paymentRef } = rememberPending(result, items);
    const storefrontEntry = resolveStorefrontEntry(location);
    const bridgeKey = `novastore.paytrCheckout.${paymentRef}`;
    const bridgeSession = {
      paymentRef,
      orderId: String(orderId),
      storefrontEntry,
      createdAt: Date.now(),
    };
    sessionStorage?.setItem?.(bridgeKey, JSON.stringify({
      ...bridgeSession,
      iframeUrl,
      token: asString(action.token),
      successUrl: asString(action.successUrl),
      failUrl: asString(action.failUrl),
    }));
    const params = new URLSearchParams({ paymentRef, orderId: String(orderId) });
    const path = `/paytr-checkout.html?${params.toString()}`;
    location?.assign?.(path);
    return path;
  };

  const getPaymentStatus = async ({ paymentRef, orderId }, options = {}) => {
    const normalizedRef = asString(paymentRef);
    const suppliedOrderId = asString(orderId);
    const normalizedOrderId = suppliedOrderId ? Number(suppliedOrderId) : null;
    if (!normalizedRef) throw new Error("Ödeme durumu için geçerli ödeme referansı gereklidir.");
    if (suppliedOrderId && (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0)) {
      throw new Error("Sipariş kimliği sağlanırsa pozitif tamsayı olmalıdır.");
    }
    const params = new URLSearchParams({ paymentRef: normalizedRef });
    if (normalizedOrderId) params.set("orderId", String(normalizedOrderId));
    return http.request(`/api/payments/status?${params.toString()}`, { signal: options.signal });
  };

  const consumeFinalizedCheckout = ({ paymentRef, orderId }) => {
    const pendingKey = scopedKey(storage, "novastore_pending_checkout_");
    const checkoutKey = scopedKey(storage, "novastore_checkout_");
    const pending = safeJsonRead(storage, pendingKey, null);
    if (
      !pending
      || String(pending.paymentRef) !== asString(paymentRef)
      || String(pending.orderId) !== String(orderId)
    ) {
      return Object.freeze([]);
    }
    const purchasedItems = Object.freeze(toCheckoutCartItems(pending.items).map((item) => Object.freeze({
      productId: item.id,
      quantity: item.quantity,
    })));
    storage?.removeItem?.(pendingKey);
    storage?.removeItem?.(checkoutKey);
    sessionStorage?.removeItem?.(`novastore.paytrCheckout.${asString(paymentRef)}`);
    return purchasedItems;
  };

  return Object.freeze({
    quote,
    getCapability,
    previewAgreements,
    initialize,
    handoff,
    getPaymentStatus,
    consumeFinalizedCheckout,
  });
}

export const checkoutAdapterTestUtils = Object.freeze({
  nonNegativeMoney,
  normalizeTotals,
  readUserId,
  safeJsonRead,
  safeSameOriginLocation,
  resolveStorefrontEntry,
  scopedKey,
});
