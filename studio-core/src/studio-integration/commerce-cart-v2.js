import { cartIdentity, cartLineKey, normalizeVariantId, toPurchaseCartItems, variantError } from "./commerce-variant-contract.js";

export const CART_V2_CACHE_PREFIX = "novastore_cart_v2_";
export const MAX_STORED_CART_LINES = 200;
export const MAX_STORED_CART_QUANTITY = 999;
const empty = () => ({ cartSchemaVersion: 2, revision: 0, items: [], migration: { status: "NONE", unresolvedItems: [] } });
const error = (code, message) => variantError(code, message);
const compact = (items) => {
  if (!Array.isArray(items)) throw error("CART_PAYLOAD_INVALID", "Sepet satırları okunamadı.");
  if (items.length > MAX_STORED_CART_LINES) throw error("CART_ITEMS_INVALID", "Kayıtlı sepet en fazla 200 satır içerebilir.");
  const rows = new Map();
  for (const item of items) {
    const { productId, variantId } = cartIdentity(item);
    if (!productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_STORED_CART_QUANTITY) {
      throw error("CART_LINE_INVALID", "Sepetteki ürün veya adet geçersiz.");
    }
    const key = cartLineKey({ productId, variantId });
    const previous = rows.get(key);
    const storeId = item.storeId == null ? previous?.storeId : normalizeVariantId(item.storeId);
    if (item.storeId != null && !storeId) throw error("CART_STORE_INVALID", "Mağaza kimliği geçersiz.");
    if (previous?.storeId && storeId && previous.storeId !== storeId) throw error("CART_STORE_IDENTITY_MISMATCH", "Aynı sepet satırı farklı mağazalara bağlanamaz.");
    const quantity = (previous?.quantity || 0) + item.quantity;
    if (quantity > MAX_STORED_CART_QUANTITY) throw error("CART_QUANTITY_INVALID", "Kayıtlı satır miktarı en fazla 999 olabilir.");
    // Preserve a canonical store identity when available; the server still validates
    // ownership. Display keys, cached prices and names are never commerce authority.
    rows.set(key, { ...(storeId ? { storeId } : {}), productId, variantId, quantity });
  }
  return [...rows.values()];
};
export const normalizeCartV2Response = (response) => {
  if (response?.payload?.cartSchemaVersion !== 2) throw error("CART_SCHEMA_UNSUPPORTED", "Sepet sürümü desteklenmiyor; uygulamayı güncelleyin.");
  if (!Number.isSafeInteger(response.revision) || response.revision < 0 || !Array.isArray(response.payload.items) || response.payload.items.length > MAX_STORED_CART_LINES) {
    throw error("CART_RESPONSE_INVALID", "Sunucunun sepet sürümü doğrulanamadı.");
  }
  const seen = new Set();
  const items = response.payload.items.map((row) => {
    const item = compact([row])[0];
    const storeId = normalizeVariantId(row.storeId);
    if (!storeId) throw error("CART_STORE_INVALID", "Sepetin mağaza kimliği doğrulanamadı.");
    const key = `${storeId}:${cartLineKey(item)}`;
    if (seen.has(key)) throw error("CART_RESPONSE_INVALID", "Sunucu sepetinde yinelenen satır var.");
    seen.add(key);
    return { storeId, ...item };
  });
  const migration = response.migration;
  if (!migration || !["NONE", "REVIEW_REQUIRED"].includes(migration.status) || !Array.isArray(migration.unresolvedItems)) {
    throw error("CART_MIGRATION_INVALID", "Eski sepetin geçiş durumu doğrulanamadı.");
  }
  return { cartSchemaVersion: 2, revision: response.revision, items,
    migration: { status: migration.status, unresolvedItems: migration.unresolvedItems.map((item) => ({
      productId: item.productId, quantity: item.quantity, reason: String(item.reason || "RESELECTION_REQUIRED"),
    })) } };
};

export function createCartV2Adapter({ http, root = globalThis, storage = root.localStorage, location = root.location,
  getProduct = () => null, checkoutPath = "#/odeme/teslimat" } = {}) {
  if (typeof http?.request !== "function") throw new TypeError("Cart V2 müşteri HTTP istemcisi gerektirir.");
  let currentPrincipal = null;
  let state = empty();
  let loaded = false;
  let queue = Promise.resolve();
  let conflictGeneration = 0;
  const listeners = new Set();
  const statusListeners = new Set();
  const syncListeners = new Set();
  let syncStatus = { phase: "loading", code: null, message: "Sepet eşitleniyor." };
  const setSyncStatus = (next) => { syncStatus = next; syncListeners.forEach((fn) => fn(next)); };
  const assertWritable = () => {
    if (syncStatus.phase === "blocked") {
      emit();
      throw error("CART_SYNC_BLOCKED", "Sepet eşitlemesi tamamlanmadan değişiklik yapılamaz. Yeniden eşitle veya hesabına giriş yap.");
    }
  };
  const readJson = (key, fallback) => {
    const raw = storage?.getItem?.(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch { throw error("CART_STORAGE_INVALID", "Kayıtlı sepet okunamadı; kayıt korunuyor."); }
  };
  const principal = () => {
    const info = readJson("nova_user_info", null);
    const token = storage?.getItem?.("nova_user_token") || "";
    return { userId: info?.id && token ? String(info.id) : "guest", token };
  };
  const capture = () => {
    const next = principal();
    if (!currentPrincipal || currentPrincipal.userId !== next.userId || currentPrincipal.token !== next.token) {
      currentPrincipal = next; state = empty(); loaded = false; conflictGeneration += 1;
      // Hide the preceding account immediately, before the next network response.
      listeners.forEach((fn) => fn([]));
      statusListeners.forEach((fn) => fn(state.migration));
      setSyncStatus({ phase: "loading", code: null, message: "Sepet eşitleniyor." });
    }
    return currentPrincipal;
  };
  const assertCurrent = (captured) => {
    const now = principal();
    if (captured !== currentPrincipal || captured.userId !== now.userId || captured.token !== now.token) {
      throw error("SHARED_STATE_PRINCIPAL_CHANGED", "Müşteri oturumu değişti; sepeti yeniden yükleyin.");
    }
  };
  const emit = () => { listeners.forEach((fn) => fn(state.items)); statusListeners.forEach((fn) => fn(state.migration)); };
  const accept = (next, captured) => {
    assertCurrent(captured);
    const cached = readJson(`${CART_V2_CACHE_PREFIX}${captured.userId}`, null);
    const newerAccountCache = captured.userId !== "guest" && cached?.cartSchemaVersion === 2 && cached.revision > next.revision;
    if ((loaded && next.revision < state.revision) || newerAccountCache) throw error("CART_STALE_RESPONSE", "Eski sepet yanıtı uygulanmadı.");
    state = next; loaded = true;
    storage?.setItem?.(`${CART_V2_CACHE_PREFIX}${captured.userId}`, JSON.stringify(next));
    emit();
    setSyncStatus({ phase: "ready", code: null, message: "" });
    return state.items;
  };
  const serialized = (captured, fn) => {
    const pending = queue.catch(() => undefined).then(() => { assertCurrent(captured); return fn(); });
    queue = pending;
    return pending;
  };
  const request = async (path, options, captured) => {
    assertCurrent(captured);
    const result = await http.request(path, { ...options, cartCapability: true });
    assertCurrent(captured);
    return result;
  };
  const fetchState = async (captured) => {
    const response = await request("/api/shared-state/cart", {}, captured);
    accept(normalizeCartV2Response(response), captured);
    return state.items;
  };
  const localLegacy = (userId) => {
    const variants = compact(readJson(`novastore_variant_cart_${userId}`, []));
    const legacy = compact(readJson(`novastore_cart_${userId}`, []));
    const result = new Map(variants.map((row) => [cartLineKey(row), row]));
    for (const row of legacy) {
      if (!row.variantId && variants.some((other) => other.productId === row.productId && other.variantId)) continue;
      const key = cartLineKey(row), previous = result.get(key);
      result.set(key, previous ? { ...row, quantity: Math.max(row.quantity, previous.quantity) } : row);
    }
    return [...result.values()];
  };
  const guestState = () => {
    const cached = readJson(`${CART_V2_CACHE_PREFIX}guest`, null);
    if (cached && cached.cartSchemaVersion !== 2) throw error("CART_SCHEMA_UNSUPPORTED", "Kayıtlı sepet sürümü desteklenmiyor.");
    return { ...empty(), items: compact(cached?.items || localLegacy("guest")) };
  };
  const replaceRemote = async (items, captured, resolveLegacyProductIds = []) => {
    if (!loaded) await fetchState(captured);
    try {
      const response = await request("/api/shared-state/cart", { method: "PUT", body: {
        expectedRevision: state.revision, payload: { cartSchemaVersion: 2, items: compact(items) },
        ...(resolveLegacyProductIds.length ? { resolveLegacyProductIds } : {}),
      } }, captured);
      return accept(normalizeCartV2Response(response), captured);
    } catch (cause) {
      assertCurrent(captured);
      conflictGeneration += 1;
      if (cause.code === "CART_REVISION_CONFLICT") {
        await fetchState(captured);
        cause.message = "Sepet başka bir cihazda değişti. Güncel sepet yüklendi; işlemini yeniden seç.";
      } else emit();
      throw cause;
    }
  };
  const load = () => {
    const captured = capture();
    const pending = serialized(captured, async () => {
      setSyncStatus({ phase: "loading", code: null, message: "Sepet eşitleniyor." });
      const cached = readJson(`${CART_V2_CACHE_PREFIX}${captured.userId}`, null);
      if (cached && cached.cartSchemaVersion !== 2) throw error("CART_SCHEMA_UNSUPPORTED", "Kayıtlı sepet sürümü desteklenmiyor; kayıt korunuyor.");
      if (captured.userId === "guest") return accept(guestState(), captured);
      await fetchState(captured);
      // R24's account-local variant rows migrate once, with an explicit durable marker.
      // Never merge stale v2 caches back into the authoritative server cart.
      const marker = `novastore_cart_v2_imported_${captured.userId}`;
      if (storage?.getItem?.(marker) !== "1") {
        const legacy = localLegacy(captured.userId);
        const valid = legacy.filter((row) => row.variantId || getProduct(row.productId)?.variantSelectionRequired === false);
        let unresolved = legacy.filter((row) => !valid.includes(row));
        const merged = new Map(state.items.map((row) => [cartLineKey(row), row]));
        for (const row of valid) { const key = cartLineKey(row), prior = merged.get(key); merged.set(key, prior ? { ...prior, ...row, quantity: Math.max(prior.quantity, row.quantity) } : row); }
        if (valid.length) {
          try { await replaceRemote([...merged.values()], captured); }
          catch (cause) {
            // A removed/foreign historical tuple is a manual migration decision.
            // Only canonical validation failures qualify; auth, network and CAS
            // failures still fail closed and never pretend that migration worked.
            if (!["CART_PRODUCT_UNAVAILABLE", "VARIANT_NOT_PURCHASABLE", "VARIANT_REQUIRED", "VARIANT_NOT_ALLOWED", "CART_STORE_IDENTITY_MISMATCH"].includes(cause.code)) throw cause;
            unresolved = [...unresolved, ...valid.map((row) => ({ ...row, reason: cause.code }))];
          }
        }
        if (unresolved.length) {
          const reviewKey = `novastore_cart_v2_local_review_${captured.userId}`;
          const pendingReview = new Map(readJson(reviewKey, []).map((row) => [cartLineKey(row), row]));
          unresolved.forEach((row) => pendingReview.set(cartLineKey(row), row));
          storage?.setItem?.(reviewKey, JSON.stringify([...pendingReview.values()]));
        }
        assertCurrent(captured); storage?.setItem?.(marker, "1");
      }
      emit(); return state.items;
    });
    return pending.catch((cause) => {
      if (captured === currentPrincipal) {
        setSyncStatus({ phase: "blocked", code: cause.code || "CART_SYNC_UNAVAILABLE",
          message: cause.status === 401 ? "Oturumun sona erdi. Hesap sepetin korunuyor; yeniden giriş yap."
            : cause.code === "CART_STALE_RESPONSE" ? "Sepet sürümü doğrulanamadı. Kayıtların korunuyor; yeniden eşitle veya hesabından çıkış yap."
              : "Sepet şu anda doğrulanamıyor. Kayıtların korunuyor; yeniden eşitle." });
      }
      throw cause;
    });
  };
  const persist = (items) => {
    const captured = capture(), generation = conflictGeneration, next = compact(items);
    return serialized(captured, async () => {
      assertWritable();
      if (generation !== conflictGeneration) throw error("CART_REVISION_CONFLICT", "Sepet güncellendi; işlemini yeniden seç.");
      const result = captured.userId === "guest" ? accept({ ...empty(), items: next }, captured) : await replaceRemote(next, captured);
      return { localSaved: true, remoteSaved: captured.userId !== "guest", variantPersistence: "cart-v2", items: result };
    });
  };
  const refreshAfterAuthentication = async () => {
    // Only the guest storage bucket may cross the login boundary, never previous-account UI state.
    const captured = capture();
    const guest = guestState().items;
    await load();
    assertCurrent(captured);
    if (captured.userId === "guest" || !guest.length) return state.items;
    const merged = new Map(state.items.map((item) => [cartLineKey(item), item]));
    guest.forEach((item) => { const key = cartLineKey(item), prior = merged.get(key); merged.set(key, prior ? { ...prior, ...item, quantity: Math.max(item.quantity, prior.quantity) } : item); });
    const saved = await persist([...merged.values()]);
    assertCurrent(captured);
    [CART_V2_CACHE_PREFIX, "novastore_cart_", "novastore_variant_cart_"].forEach((prefix) => storage?.removeItem?.(`${prefix}guest`));
    return saved.items;
  };
  const handoffToCheckout = async (items) => {
    const captured = capture();
    assertWritable();
    if (!items.length) throw error("CART_EMPTY", "Ödemeye geçmek için sepete ürün ekleyin.");
    // Storage allows historical/cross-device carts to be repaired without truncation.
    // Purchase limits remain the canonical 20 per line / 50 total contract.
    toPurchaseCartItems(items);
    const saved = await persist(items);
    assertCurrent(captured);
    if (captured.userId !== "guest") {
      const checkout = await request("/api/shared-state/checkout", {}, captured);
      const snapshot = normalizeCartV2Response(checkout);
      await request("/api/shared-state/checkout", { method: "PUT", body: {
        expectedRevision: snapshot.revision, payload: { cartSchemaVersion: 2, items: compact(saved.items) },
      } }, captured);
    }
    assertCurrent(captured); location?.assign?.(checkoutPath);
  };
  const finalize = (_purchasedItems, receipt) => {
    const captured = capture();
    if (captured.userId === "guest" || !normalizeVariantId(receipt?.orderId)) return Promise.reject(error("CART_FINALIZATION_INVALID", "Sipariş doğrulanamadı."));
    return serialized(captured, async () => {
      assertWritable();
      if (!loaded) await fetchState(captured);
      try {
        const response = await request("/api/shared-state/cart/finalize", { method: "POST", body: { expectedRevision: state.revision, orderId: Number(receipt.orderId) } }, captured);
        return accept(normalizeCartV2Response(response), captured);
      } catch (cause) {
        if (cause.code === "CART_REVISION_CONFLICT") { conflictGeneration += 1; await fetchState(captured); }
        throw cause;
      }
    });
  };
  const getMigration = () => {
    const captured = capture();
    const local = readJson(`novastore_cart_v2_local_review_${captured.userId}`, []);
    return { ...state.migration, localItems: local };
  };
  const resolveLegacy = (productId, localOnly = false, variantId = null) => {
    const captured = capture();
    return serialized(captured, async () => {
      assertWritable();
      if (!normalizeVariantId(productId)) throw error("PRODUCT_ID_INVALID", "Ürün kimliği geçersiz.");
      if (variantId != null && !normalizeVariantId(variantId)) throw error("VARIANT_ID_INVALID", "Seçenek kimliği geçersiz.");
      if (!localOnly) await replaceRemote(state.items, captured, [productId]);
      assertCurrent(captured);
      const key = `novastore_cart_v2_local_review_${captured.userId}`;
      storage?.setItem?.(key, JSON.stringify(readJson(key, []).filter((row) => localOnly
        ? cartLineKey(row) !== cartLineKey(productId, variantId)
        : row.productId !== productId)));
      emit();
    });
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    const refresh = () => { load().catch(() => undefined); };
    const onStorage = (event) => { if (["nova_user_info", "nova_user_token", `${CART_V2_CACHE_PREFIX}${principal().userId}`].includes(event.key)) refresh(); };
    root.addEventListener?.("focus", refresh); root.addEventListener?.("storage", onStorage); root.addEventListener?.("novastore:auth-required", refresh);
    return () => { listeners.delete(listener); root.removeEventListener?.("focus", refresh); root.removeEventListener?.("storage", onStorage); root.removeEventListener?.("novastore:auth-required", refresh); };
  };
  return Object.freeze({ load, persist, subscribe, handoffToCheckout, refreshAfterAuthentication, finalize, getMigration, resolveLegacy,
    getSyncStatus: () => syncStatus, subscribeSync: (fn) => { syncListeners.add(fn); return () => syncListeners.delete(fn); },
    subscribeMigration: (fn) => { statusListeners.add(fn); return () => statusListeners.delete(fn); } });
}
