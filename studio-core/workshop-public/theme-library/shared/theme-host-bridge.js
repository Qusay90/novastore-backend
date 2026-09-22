/* Nova Store theme host contract v1. No transport, credentials or demo catalog. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NovaThemeHostBridge = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const VERSION = 'novastore-theme-host/1';
  const freeze = Object.freeze;
  const list = (value) => Array.isArray(value) ? value : [];
  const text = (value, max = 2000) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, max);
  const messages = freeze({
    HOST_REQUIRED: 'Mağaza bağlantısı henüz kurulmadı.', HOST_NOT_READY: 'Mağaza verisi henüz hazır değil.',
    HOST_CONTRACT: 'Mağaza bağlantısı beklenen sözleşmeyi sağlamıyor.', INVALID_PRODUCT: 'Bu ürün mağazanın doğrulanmış kataloğunda bulunmuyor.',
    INVALID_AMOUNT: 'Ürün fiyatı doğrulanamadı.', INVALID_QUANTITY: 'Geçerli bir ürün miktarı seç.',
    STOCK_LIMIT: 'İstenen miktar güncel stokla uyuşmuyor.', INVALID_VARIANT: 'Bu ürün seçeneği mağaza tarafından desteklenmiyor.',
    CART_INVALID: 'Mağazadaki sepet bilgisi doğrulanamadı. Sepeti ana mağazada kontrol et.',
    SESSION_REQUIRED: 'Bu işlem için doğrulanmış müşteri oturumu gerekli.', SESSION_CHANGED: 'Müşteri oturumu değişti. Bilgiler yenileniyor.',
    READ_ONLY: 'Bu mağaza önizlemesi salt okunur.', REQUEST_FAILED: 'Mağaza işlemi tamamlanamadı. Yeniden deneyebilirsin.',
    CART_SYNC_PENDING: 'Sepet bu cihazda korundu ancak sunucuya eşitlenemedi. Yenilemeden tekrar ekleme.',
    HOST_DISPOSED: 'Mağaza bağlantısı kapatıldı.', CHECKOUT_EMPTY: 'Ödemeye geçmek için önce ürün ekle.',
    ASSISTANT_UNAVAILABLE: 'NovaBot bağlantısı şu anda kullanılamıyor.', INVALID_MESSAGE: 'NovaBot için bir mesaj yaz.',
    PRODUCT_HANDOFF_UNAVAILABLE: 'Bu ürünün seçeneklerini ana mağazada açma bağlantısı henüz kurulmadı.',
  });
  function failure(code, extra) { const error = new Error(messages[code] || messages.REQUEST_FAILED); error.code = code; if (extra) Object.assign(error, extra); return error; }
  function id(value) {
    if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value))) throw failure('INVALID_PRODUCT');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number <= 0) throw failure('INVALID_PRODUCT');
    return number;
  }
  function amount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw failure('INVALID_AMOUNT');
    const cents = Math.round(value * 100);
    if (!Number.isSafeInteger(cents) || Math.abs(value * 100 - cents) > 0.00001) throw failure('INVALID_AMOUNT');
    return cents;
  }
  function quantity(value, allowZero = false) {
    if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1) || value > 999) throw failure('INVALID_QUANTITY');
    return value;
  }
  function scopeOf(value) {
    const tenantId = text(value?.tenantId, 128), storeId = text(value?.storeId, 128);
    if (!tenantId || !storeId || /[\s<>"']/.test(tenantId + storeId)) throw failure('HOST_CONTRACT');
    return freeze({ tenantId, storeId });
  }
  function sessionOf(raw) {
    if (raw?.status === 'authenticated') {
      return freeze({ status: 'authenticated', user: freeze({ id: String(id(raw.user?.id)), fullName: text(raw.user?.fullName, 200) }) });
    }
    return freeze({ status: raw?.status === 'unverified' ? 'unverified' : 'guest', user: null });
  }
  function safeImage(value, origins) {
    if (!value) return '';
    const url = String(value).trim();
    // Host supplies an explicit allowlist for remote media. Relative same-site paths need no origin setting.
    if (/^\/(?!\/)/.test(url) && !/[\\\u0000-\u0020]/.test(url)) return url;
    try { const parsed = new URL(url); return parsed.protocol === 'https:' && !parsed.username && !parsed.password && origins.has(parsed.origin) ? parsed.href : ''; }
    catch (_) { return ''; }
  }
  function catalogOf(raw, origins, canOpenProduct) {
    if (!raw || !Array.isArray(raw.products) || !Array.isArray(raw.categories)) throw failure('HOST_CONTRACT');
    const byCategory = new Map();
    for (const item of raw.categories) {
      const key = text(item?.id, 128);
      if (!key || !text(item?.name, 200) || byCategory.has(key)) throw failure('HOST_CONTRACT');
      byCategory.set(key, item);
    }
    const publicCategory = (key, visiting = new Set()) => {
      const c = byCategory.get(key);
      if (!c || visiting.has(key) || c.active === false || c.customerVisible === false || c.archived === true) return false;
      if (c.parentId === null || c.parentId === undefined || c.parentId === '') return true;
      visiting.add(key); return publicCategory(String(c.parentId), visiting);
    };
    const categories = [...byCategory.entries()].filter(([key]) => publicCategory(key)).map(([key, item]) => freeze({ id: key, name: text(item.name, 200), parentId: item.parentId == null ? null : String(item.parentId), path: text(item.path, 512) }));
    const allowedCategories = new Set(categories.map((c) => c.id)), seen = new Set(), products = [];
    for (const rawProduct of raw.products) {
      if (!rawProduct || rawProduct.active === false || rawProduct.customerVisible === false || rawProduct.deletedAt) continue;
      const productId = id(rawProduct.id);
      if (seen.has(productId)) throw failure('HOST_CONTRACT');
      seen.add(productId);
      const categoryIds = [...new Set(list(rawProduct.categoryIds || [rawProduct.categoryId]).map(String))].filter((key) => allowedCategories.has(key));
      if (!categoryIds.length) continue;
      if (!text(rawProduct.name, 300) || !Number.isSafeInteger(rawProduct.stock) || rawProduct.stock < 0) throw failure('HOST_CONTRACT');
      // Keep variant parents visible but defer their selection to the canonical product owner.
      // Existing cards select a variant's own product ID; a parent's ID must never be purchased instead.
      const purchaseRequiresHostSelection = list(rawProduct.variants).length > 0 || rawProduct.requiresVariantSelection === true;
      const price = amount(rawProduct.price), old = rawProduct.oldPrice == null ? 0 : amount(rawProduct.oldPrice);
      const categoryId = categoryIds.includes(String(rawProduct.categoryId)) ? String(rawProduct.categoryId) : categoryIds[0];
      products.push(freeze({
        id: String(productId), hostProductId: productId, name: text(rawProduct.name, 300), slug: text(rawProduct.slug, 200),
        price, oldPrice: old > price ? old : null, stock: rawProduct.stock,
        categoryId, categoryIds: freeze(categoryIds), category: text(byCategory.get(categoryId).name, 200),
        variants: freeze(['Standart']), variantLabel: 'Ürün', purchaseRequiresHostSelection, canOpenProduct,
        rating: typeof rawProduct.rating === 'number' && Number.isFinite(rawProduct.rating) ? Math.min(5, Math.max(0, rawProduct.rating)) : 0,
        reviews: Number.isSafeInteger(rawProduct.reviews) && rawProduct.reviews >= 0 ? rawProduct.reviews : 0,
        brand: text(rawProduct.brand, 150), desc: text(rawProduct.description, 6000), description: text(rawProduct.description, 6000),
        image: safeImage(rawProduct.imageUrl, origins), imageUrl: safeImage(rawProduct.imageUrl, origins),
        features: freeze(list(rawProduct.features).map((item) => text(item, 400)).filter(Boolean)),
        badge: rawProduct.stock === 0 ? 'Tükendi' : old > price ? `%${Math.round((1 - price / old) * 100)}` : '',
        kind: 'host-product', color: '', source: 'host',
      }));
    }
    return { products: freeze(products), categories: freeze(categories), map: new Map(products.map((p) => [p.id, p])) };
  }
  function canonicalLines(raw, map) {
    if (!Array.isArray(raw)) throw failure('CART_INVALID');
    const seen = new Set();
    return freeze(raw.map((line) => {
      const productId = String(id(line?.productId ?? line?.id));
      const product = map.get(productId), count = quantity(line?.quantity);
      if (!product || seen.has(productId) || count > product.stock) throw failure('CART_INVALID');
      seen.add(productId);
      return freeze({ productId, variant: 'Standart', qty: count });
    }));
  }
  function canonicalFavorites(raw, map) {
    if (!(raw instanceof Set) && !Array.isArray(raw)) throw failure('HOST_CONTRACT');
    return freeze([...new Set([...raw].map((value) => String(id(value))))].filter((key) => map.has(key)));
  }
  function publicError(error) {
    const code = Object.prototype.hasOwnProperty.call(messages, error?.code) ? error.code : error?.status === 401 || error?.status === 403 ? 'SESSION_REQUIRED' : 'REQUEST_FAILED';
    return freeze({ code, message: messages[code] });
  }
  function create(options) {
    if (options?.mode !== 'host') throw failure('HOST_REQUIRED');
    const runtime = typeof options.runtime === 'function' ? { initialize: options.runtime } : options.runtime;
    if (!runtime || typeof runtime.initialize !== 'function') throw failure('HOST_REQUIRED');
    const scope = scopeOf(options.scope), origins = new Set(list(options.allowedImageOrigins));
    let owner = null, map = new Map(), disposed = false, epoch = 0, queue = Promise.resolve(), unsubscribeCart = null;
    const listeners = new Set();
    const blank = (phase = 'idle') => freeze({ contractVersion: VERSION, mode: 'host', scope, phase, pending: null, products: freeze([]), categories: freeze([]), cart: freeze([]), favorites: freeze([]), session: sessionOf(null), readOnlyPreview: true, error: null, cartSync: 'unknown' });
    let state = blank();
    const publish = (patch) => { state = freeze({ ...state, ...patch }); listeners.forEach((listener) => { try { listener(state); } catch (_) {} }); };
    const ready = () => { if (disposed) throw failure('HOST_DISPOSED'); if (state.phase !== 'ready' || !owner) throw failure('HOST_NOT_READY'); };
    const writable = () => { ready(); if (state.readOnlyPreview) throw failure('READ_ONLY'); if (state.session.status === 'unverified') throw failure('SESSION_REQUIRED'); if (state.cartSync === 'pending') throw failure('CART_SYNC_PENDING'); };
    function authorized(value) { const key = String(id(value)); const product = map.get(key); if (!product) throw failure('INVALID_PRODUCT'); return product; }
    function assertVariant(value) { if (value !== undefined && value !== null && value !== '' && value !== 'Standart') throw failure('INVALID_VARIANT'); }
    const wireCart = (lines) => lines.map((line) => ({ productId: id(line.productId), quantity: line.qty }));
    const clearOwner = () => { if (unsubscribeCart) unsubscribeCart(); unsubscribeCart = null; owner = null; map = new Map(); };
    async function initialize({ signal } = {}) {
      if (disposed) throw failure('HOST_DISPOSED');
      const current = ++epoch;
      clearOwner(); state = blank('loading'); publish({});
      await queue.catch(() => undefined);
      try {
        if (signal?.aborted) throw failure('REQUEST_FAILED');
        const next = await runtime.initialize({ signal, readOnlyPreview: options.readOnlyPreview === true, allowUnavailableCatalog: false });
        if (disposed || current !== epoch) throw failure('SESSION_CHANGED');
        if (signal?.aborted) throw failure('REQUEST_FAILED');
        if (!next?.cart || !next?.favorites || !next?.auth || !next?.catalog) throw failure('HOST_CONTRACT');
        for (const [port, method] of [[next.cart, 'persist'], [next.cart, 'handoffToCheckout'], [next.cart, 'subscribe'], [next.favorites, 'set'], [next.auth, 'openAccount']]) if (typeof port?.[method] !== 'function') throw failure('HOST_CONTRACT');
        const catalog = catalogOf(next.catalog, origins, typeof options.openProduct === 'function'), session = sessionOf(next.session);
        const cart = canonicalLines(next.cart.initialItems, catalog.map), favorites = canonicalFavorites(next.favorites.initialIds, catalog.map);
        owner = next; map = catalog.map;
        publish({ phase: 'ready', products: catalog.products, categories: catalog.categories, cart, favorites, session, readOnlyPreview: next.readOnlyPreview === true || options.readOnlyPreview === true, error: null, cartSync: 'ready' });
        unsubscribeCart = next.cart.subscribe((items) => {
          if (disposed || current !== epoch || state.pending) return;
          try { publish({ cart: canonicalLines(items, map), error: null }); }
          catch (error) { publish({ error: publicError(error), cartSync: 'pending' }); }
        });
        return state;
      } catch (error) {
        if (!disposed && current === epoch) { clearOwner(); state = blank('error'); publish({ error: publicError(error) }); }
        throw failure(publicError(error).code);
      }
    }
    function serial(label, task) {
      const current = epoch;
      const promise = queue.catch(() => undefined).then(async () => {
        if (current !== epoch) throw failure('SESSION_CHANGED');
        writable(); publish({ pending: label, error: null });
        try {
          const result = await task();
          if (disposed || current !== epoch) throw failure('SESSION_CHANGED');
          return result;
        } catch (error) {
          if (!disposed && current === epoch) {
            const localSaved = error?.localSaved === true || error?.code === 'CART_SYNC_PENDING';
            publish({ error: publicError(localSaved ? failure('CART_SYNC_PENDING') : error), ...(localSaved ? { cartSync: 'pending' } : {}) });
            if (error?.status === 401 || error?.status === 403) publish({ session: sessionOf(null), cart: freeze([]), favorites: freeze([]), phase: 'error' });
          }
          throw failure(error?.localSaved === true ? 'CART_SYNC_PENDING' : publicError(error).code);
        } finally { if (!disposed && current === epoch) publish({ pending: null }); }
      });
      queue = promise; return promise;
    }
    async function persistCart(lines, activeOwner, current) {
      // Success depends on the owner's returned state; never publish the optimistic candidate.
      const result = await activeOwner.cart.persist(wireCart(lines));
      if (disposed || current !== epoch) throw failure('SESSION_CHANGED');
      if (!result || result.localSaved !== true || !Array.isArray(result.items)) throw failure('HOST_CONTRACT');
      if (state.session.status === 'authenticated' && result.remoteSaved !== true) throw failure('CART_SYNC_PENDING');
      const cart = canonicalLines(result.items, map);
      publish({ cart, cartSync: result.remoteSaved === true ? 'server' : 'guest-local' }); return state;
    }
    function addToCart(productId, variant = 'Standart', count = 1) {
      return serial('cart-add', async () => {
        const product = authorized(productId); if (product.purchaseRequiresHostSelection) throw failure('INVALID_VARIANT'); assertVariant(variant); quantity(count);
        const line = state.cart.find((entry) => entry.productId === product.id), nextCount = (line?.qty || 0) + count;
        if (nextCount > product.stock || nextCount > 999) throw failure('STOCK_LIMIT');
        const lines = state.cart.filter((entry) => entry.productId !== product.id).concat({ productId: product.id, variant: 'Standart', qty: nextCount });
        return persistCart(lines, owner, epoch);
      });
    }
    function setQuantity(productId, count) {
      return serial('cart-quantity', async () => {
        const product = authorized(productId); quantity(count, true);
        if (product.purchaseRequiresHostSelection && count > 0) throw failure('INVALID_VARIANT');
        if (count > product.stock) throw failure('STOCK_LIMIT');
        if (!state.cart.some((entry) => entry.productId === product.id)) throw failure('INVALID_PRODUCT');
        const lines = state.cart.filter((entry) => entry.productId !== product.id);
        if (count) lines.push({ productId: product.id, variant: 'Standart', qty: count });
        return persistCart(lines, owner, epoch);
      });
    }
    function setFavorite(productId, enabled) {
      return serial('favorite', async () => {
        const product = authorized(productId), activeOwner = owner, current = epoch;
        if (typeof enabled !== 'boolean') throw failure('HOST_CONTRACT');
        await activeOwner.favorites.set(product.hostProductId, enabled);
        if (disposed || current !== epoch) throw failure('SESSION_CHANGED');
        publish({ favorites: freeze(state.favorites.filter((entry) => entry !== product.id).concat(enabled ? [product.id] : [])) }); return state;
      });
    }
    function openCheckout() {
      return serial('checkout', async () => {
        if (!state.cart.length) throw failure('CHECKOUT_EMPTY');
        for (const line of state.cart) { const product = authorized(line.productId); if (product.purchaseRequiresHostSelection) throw failure('INVALID_VARIANT'); if (line.qty > product.stock) throw failure('STOCK_LIMIT'); }
        // The canonical owner does checkout persistence, authenticated handoff and actual route selection.
        return owner.cart.handoffToCheckout(wireCart(state.cart));
      });
    }
    function openAccount() { ready(); return owner.auth.openAccount(); }
    function openProduct(productId) {
      ready(); const product = authorized(productId);
      if (typeof options.openProduct !== 'function') throw failure('PRODUCT_HANDOFF_UNAVAILABLE');
      return options.openProduct(freeze({ productId: product.hostProductId, slug: product.slug }));
    }
    async function assistantCall(method, args) {
      ready(); const current = epoch, port = owner?.assistant;
      if (typeof port?.[method] !== 'function') throw failure('ASSISTANT_UNAVAILABLE');
      try { const result = await port[method](...args); if (disposed || current !== epoch) throw failure('SESSION_CHANGED'); return result; }
      catch (error) { if (error?.code === 'SESSION_CHANGED') throw error; throw failure('ASSISTANT_UNAVAILABLE'); }
    }
    const assistant = freeze({
      getCapability: (requestOptions = {}) => assistantCall('getCapability', [requestOptions]),
      chat: async (request, requestOptions = {}) => {
        const message = text(request?.message, 2000); if (!message) throw failure('INVALID_MESSAGE');
        const history = list(request?.history).slice(-10).map((entry) => ({ role: entry?.role === 'user' ? 'user' : 'assistant', message: text(entry?.message, 2000) })).filter((entry) => entry.message);
        const payload = { message, history }; if (request?.modeId !== undefined) payload.modeId = request.modeId;
        const result = await assistantCall('chat', [payload, requestOptions]);
        const products = list(result?.products).map((product) => { try { return authorized(product.id ?? product.productId); } catch (_) { return null; } }).filter(Boolean).slice(0, 4);
        return freeze({ reply: text(result?.reply, 5000) || messages.ASSISTANT_UNAVAILABLE, suggestions: freeze(list(result?.suggestions).map((item) => text(item, 80)).filter(Boolean).slice(0, 6)), products: freeze(products), requiresConfirmation: result?.requiresConfirmation === true, pendingAction: null, allowEscalation: result?.allowEscalation === true });
      },
    });
    return freeze({
      contractVersion: VERSION, mode: 'host', scope, initialize, refresh: initialize,
      snapshot: () => state,
      subscribe(listener) { if (typeof listener !== 'function') throw failure('HOST_CONTRACT'); listeners.add(listener); return () => listeners.delete(listener); },
      addToCart, setQuantity, removeFromCart: (productId) => setQuantity(productId, 0), setFavorite, openAccount, openProduct, openCheckout, assistant,
      dispose() { disposed = true; ++epoch; clearOwner(); state = blank('closed'); listeners.clear(); },
    });
  }
  function createFromCanonicalRuntime(runtime, options = {}) {
    return create({ ...options, mode: 'host', runtime });
  }
  return freeze({ contractVersion: VERSION, create, createFromCanonicalRuntime, amountToKurus: amount });
});
