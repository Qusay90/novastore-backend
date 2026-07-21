const asArray = (value) => Array.isArray(value) ? value : [];

const cleanText = (value, maxLength = 2000) => String(value || "")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  .trim()
  .slice(0, maxLength);

export const normalizeAssistantHistory = (history) => asArray(history)
  .map((item) => {
    const message = cleanText(item?.message, 2000);
    if (!message) return null;
    return Object.freeze({
      role: item?.role === "user" ? "user" : "assistant",
      message,
    });
  })
  .filter(Boolean)
  .slice(-10);

const normalizePendingAction = (value, getProduct) => {
  const type = String(value?.type || "").trim();
  if (type === "live_support") {
    return Object.freeze({ type, reason: cleanText(value.reason, 500) });
  }
  if (!["add_to_cart", "remove_from_cart"].includes(type)) return null;
  const productId = Number(value?.productId);
  const product = Number.isInteger(productId) && productId > 0 ? getProduct(productId) : null;
  if (!product) return null;
  if (type === "add_to_cart" && Number(product.stock) <= 0) return null;
  return Object.freeze({
    type,
    productId,
    quantity: type === "add_to_cart"
      ? Math.max(1, Math.min(Number(product.stock || 1), Number.parseInt(value?.quantity || 1, 10) || 1))
      : 1,
  });
};

const normalizeProducts = (payload, getProduct) => {
  const seen = new Set();
  return [...asArray(payload?.cards), ...asArray(payload?.products)].map((item) => {
    const id = Number(item?.productId ?? item?.id);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return null;
    const product = getProduct(id);
    if (!product) return null;
    seen.add(id);
    return product;
  }).filter(Boolean).slice(0, 4);
};

const normalizeComparison = (value, getProduct) => {
  const rows = asArray(value?.rows).map((row) => {
    const product = getProduct(Number(row?.productId));
    return product ? Object.freeze({
      product,
      bestFor: cleanText(row?.bestFor, 180),
    }) : null;
  }).filter(Boolean).slice(0, 3);
  return rows.length >= 2 ? Object.freeze({ rows: Object.freeze(rows) }) : null;
};

export const normalizeAssistantResponse = (payload, getProduct) => {
  const reply = cleanText(payload?.reply || payload?.message || payload?.text, 5000)
    || "NovaBot şu anda yanıt oluşturamadı. Lütfen yeniden dene.";
  return Object.freeze({
    reply,
    mode: cleanText(payload?.mode, 32) || "friendly",
    modeLabel: cleanText(payload?.modeLabel, 80) || "NovaBot",
    suggestions: Object.freeze([...new Set(asArray(payload?.suggestions)
      .map((item) => cleanText(item, 80))
      .filter(Boolean))].slice(0, 6)),
    products: Object.freeze(normalizeProducts(payload, getProduct)),
    comparison: normalizeComparison(payload?.comparison, getProduct),
    requiresConfirmation: payload?.requiresConfirmation === true,
    pendingAction: normalizePendingAction(payload?.pendingAction, getProduct),
    allowEscalation: payload?.allowEscalation === true,
  });
};

export function createAssistantAdapter({ http, getProduct } = {}) {
  if (!http || typeof http.request !== "function") {
    throw new TypeError("NovaBot adapterı müşteri HTTP istemcisi gerektirir.");
  }
  if (typeof getProduct !== "function") {
    throw new TypeError("NovaBot adapterı doğrulanmış ürün çözücüsü gerektirir.");
  }

  const chat = async ({ message, history = [], mode = "friendly" }, options = {}) => {
    const normalizedMessage = cleanText(message, 2000);
    if (!normalizedMessage) throw new TypeError("NovaBot mesajı boş olamaz.");
    const payload = await http.request("/api/assistant/chat", {
      method: "POST",
      body: {
        message: normalizedMessage,
        history: normalizeAssistantHistory(history),
        context: { selectedMode: cleanText(mode, 32) || "friendly" },
      },
      signal: options.signal,
    });
    return normalizeAssistantResponse(payload, getProduct);
  };

  const escalate = async (summary, options = {}) => {
    const normalizedSummary = cleanText(summary, 4000);
    if (normalizedSummary.length < 10) {
      throw new TypeError("Canlı destek özeti için biraz daha ayrıntı gereklidir.");
    }
    return http.request("/api/assistant/escalate", {
      method: "POST",
      body: { summary: normalizedSummary },
      signal: options.signal,
    });
  };

  return Object.freeze({ chat, escalate });
}

export const assistantAdapterTestUtils = Object.freeze({
  cleanText,
  normalizeComparison,
  normalizePendingAction,
  normalizeProducts,
});
