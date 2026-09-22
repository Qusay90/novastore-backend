import {
  categories as canonicalCategories,
  products as canonicalProducts,
} from "../catalog.js";
import {
  configureRuntimeCatalog,
  getVisibleProducts,
} from "./runtimeCatalog.js";
import fixtureIphoneAngle from "../assets/optimized/phone-iphone.webp";
import fixtureIphonePair from "../assets/optimized/product-phone.webp";
import fixtureWatch from "../assets/optimized/product-watch.webp";

const cloneCart = (items) => items.map((item) => ({ ...item }));

export function createCanonicalFixtureRuntime({ root = globalThis } = {}) {
  configureRuntimeCatalog({
    categories: canonicalCategories,
    products: canonicalProducts,
  });

  const visibleProducts = getVisibleProducts().map((product) => product.id === "NS-1001"
    ? Object.freeze({
      ...product,
      media: Object.freeze([
        Object.freeze({ id: "fixture-iphone-angle", url: fixtureIphoneAngle, type: "image", isMain: true, sortOrder: 0 }),
        Object.freeze({ id: "fixture-iphone-pair", url: fixtureIphonePair, type: "image", isMain: false, sortOrder: 1 }),
        Object.freeze({ id: "fixture-iphone-watch", url: fixtureWatch, type: "image", isMain: false, sortOrder: 2 }),
      ]),
    })
    : product);
  const favoriteIds = new Set(["NS-1001", "NS-1004", "NS-1006", "NS-1007"]);
  let cartItems = [];
  let session = Object.freeze({ status: "guest", user: null, warning: null });
  let addresses = [{
    id: 1,
    title: "Test Adresi",
    fullName: "Test Müşteri",
    phone: "05555555555",
    city: "İstanbul",
    district: "Kadıköy",
    addressLine: "Yerel Fixture Mahallesi No: 1",
    isDefault: true,
  }];
  let notifications = [{
    id: 1,
    type: "welcome",
    message: "Yerel Commerce Pro fixture oturumu hazır.",
    createdAt: "2026-07-16T09:00:00.000Z",
    isRead: false,
  }];
  const questions = Object.freeze([
    Object.freeze({
      id: 701,
      productId: "NS-1001",
      productName: "iPhone 15 Pro",
      productImage: "",
      question: "Bu ürünün garanti süresi nedir?",
      answer: "Ürün, satıcı mağaza tarafından sağlanan 2 yıl garanti kapsamındadır.",
      status: "answered",
      createdAt: "2026-08-28T10:30:00.000Z",
      answeredAt: "2026-08-28T13:15:00.000Z",
    }),
    Object.freeze({
      id: 702,
      productId: "NS-1004",
      productName: "Nova Akıllı Saat",
      productImage: "",
      question: "Kordon ölçüsü ayarlanabiliyor mu?",
      answer: "",
      status: "pending",
      createdAt: "2026-08-31T09:00:00.000Z",
      answeredAt: "",
    }),
  ]);
  const reviews = Object.freeze([
    Object.freeze({
      id: 801,
      productId: "NS-1001",
      productName: "iPhone 15 Pro",
      productImage: "",
      rating: 5,
      comment: "Paketleme özenliydi ve ürün beklediğim gibi geldi.",
      status: "PUBLISHED",
      createdAt: "2026-08-27T16:45:00.000Z",
    }),
    Object.freeze({
      id: 802,
      productId: "NS-1006",
      productName: "Nova Kablosuz Kulaklık",
      productImage: "",
      rating: 4,
      comment: "Ses kalitesi iyi; değerlendirmem yayın kontrolünde.",
      status: "PENDING",
      createdAt: "2026-08-30T14:20:00.000Z",
    }),
  ]);
  let followedStores = [Object.freeze({
    slug: "nova-teknoloji",
    name: "Nova Teknoloji",
    following: true,
    followerCount: 1284,
    followedAt: "2026-08-20T12:00:00.000Z",
  })];
  let supportMessages = [];
  let pendingPurchase = [];

  const incompleteFixtureProfile = new URLSearchParams(root.location?.search || "").get("profile") === "incomplete";
  const fixtureUser = (email = "fixture@novastore.test") => Object.freeze({
    id: 9001,
    fullName: "Test Müşteri",
    email,
    phone: incompleteFixtureProfile ? null : "05555555555",
  });

  const customer = Object.freeze({
    login: async ({ email, password }) => {
      if (!String(email || "").trim() || !String(password || "")) throw new Error("Fixture giriş bilgileri eksik.");
      session = Object.freeze({ status: "authenticated", sessionId: "fixture-session-1", user: fixtureUser(), warning: null });
      return session;
    },
    register: async ({ fullName, email }) => ({ id: 9001, fullName, email }),
    getProfile: async () => session.user,
    forgotPassword: async () => ({ message: "Yerel fixture sıfırlama isteğini kabul etti." }),
    resetPassword: async () => ({ ok: true }),
    logout: () => { session = Object.freeze({ status: "guest", user: null, warning: null }); },
    updateProfile: async ({ fullName, phone }) => Object.freeze({ ...session.user, fullName, phone }),
    loadDashboard: async () => Object.freeze({ orders: [], addresses, coupons: [], warnings: [] }),
    listOrders: async () => [],
    cancelOrder: async () => ({ ok: true }),
    createReturnRequest: async () => ({ reused: false, return: { id: 1, status: "REQUESTED" } }),
    listAddresses: async () => addresses.map((address) => ({ ...address })),
    createAddress: async (value) => {
      const created = { id: Math.max(0, ...addresses.map((item) => Number(item.id) || 0)) + 1, ...value };
      if (created.isDefault) addresses = addresses.map((item) => ({ ...item, isDefault: false }));
      addresses = [...addresses, created];
      return { ...created };
    },
    updateAddress: async (id, value) => {
      addresses = addresses.map((item) => String(item.id) === String(id) ? { ...item, ...value } : item);
      return addresses.find((item) => String(item.id) === String(id));
    },
    deleteAddress: async (id) => { addresses = addresses.filter((item) => String(item.id) !== String(id)); },
    setDefaultAddress: async (id) => {
      addresses = addresses.map((item) => ({ ...item, isDefault: String(item.id) === String(id) }));
    },
    listCoupons: async () => [],
    listQuestions: async () => questions.map((question) => ({ ...question })),
    listReviews: async () => reviews.map((review) => ({ ...review })),
    listFollowedStores: async () => followedStores.map((store) => ({ ...store })),
    unfollowStore: async (_activeSession, slug) => {
      const before = followedStores.length;
      followedStores = followedStores.filter((store) => store.slug !== slug);
      if (followedStores.length === before) throw new Error("Fixture mağazası bulunamadı.");
      return Object.freeze({ following: false });
    },
    listNotifications: async () => notifications.map((item) => ({ ...item })),
    markNotificationRead: async (id) => {
      notifications = notifications.map((item) => String(item.id) === String(id) ? { ...item, isRead: true } : item);
    },
    markAllNotificationsRead: async () => { notifications = notifications.map((item) => ({ ...item, isRead: true })); },
    changePassword: async () => ({ ok: true }),
    listSupportMessages: async () => supportMessages.map((item) => ({ ...item })),
    sendSupportMessage: async (_activeSession, message) => {
      supportMessages = [...supportMessages, {
        id: supportMessages.length + 1,
        message,
        createdAt: new Date().toISOString(),
        sentByCustomer: true,
        isSystem: false,
      }];
    },
  });

  const checkout = Object.freeze({
    getCapability: async () => Object.freeze({
      provider: "paytr",
      ready: false,
      state: "credentials_required",
      message: "Yerel fixture gerçek ödeme sağlayıcısı açmaz.",
      agreements: Object.freeze([
        Object.freeze({ slug: "pre-information", path: "/on-bilgilendirme-formu", title: "Ön Bilgilendirme Formu", status: "owner_external_required", version: null }),
        Object.freeze({ slug: "distance-sale", path: "/mesafeli-satis-sozlesmesi", title: "Mesafeli Satış Sözleşmesi", status: "owner_external_required", version: null }),
      ]),
    }),
    quote: async (items, couponCode = null) => {
      const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
      const couponApplied = String(couponCode || "").toLocaleUpperCase("tr-TR") === "FIXTURE100";
      const couponDiscount = couponApplied ? Math.min(100, subtotal) : 0;
      const shippingFee = subtotal >= 1_500 ? 0 : 79.9;
      return Object.freeze({
        totals: Object.freeze({
          currency: "TRY",
          subtotal,
          bundleDiscount: 0,
          couponDiscount,
          shippingFee,
          total: subtotal - couponDiscount + shippingFee,
        }),
        coupon: Object.freeze({ applied: couponApplied, code: couponApplied ? "FIXTURE100" : null, discountAmount: couponDiscount }),
        campaigns: Object.freeze({ freeShippingApplied: shippingFee === 0 }),
        items: Object.freeze([]),
      });
    },
    initialize: async ({ items }) => {
      pendingPurchase = items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));
      return Object.freeze({ orderId: 99001, paymentRef: "FIXTURE-PAYMENT-99001" });
    },
    handoff: (result) => {
      root.location.hash = `#/odeme/sonuc?paymentRef=${encodeURIComponent(result.paymentRef)}&orderId=${encodeURIComponent(result.orderId)}`;
      return root.location.hash;
    },
    getPaymentStatus: async ({ paymentRef, orderId }) => Object.freeze({
      paymentRef,
      orderId,
      paymentStatus: "PAID",
      providerFinalized: true,
      commerceFinalized: true,
      nextAction: "NONE",
      message: "Yerel fixture ödeme sonucu; gerçek ödeme başlatılmadı.",
    }),
    consumeFinalizedCheckout: () => {
      const purchased = pendingPurchase;
      pendingPurchase = [];
      return purchased;
    },
  });

  const community = Object.freeze({
    load: async () => Object.freeze({
      average: 0,
      totalReviews: 0,
      reviews: Object.freeze([]),
      questions: Object.freeze([]),
      permission: Object.freeze({ canReview: false, message: "Yerel fixture satın alma kaydı içermez." }),
      warnings: Object.freeze([]),
    }),
    addReview: async () => ({ mesaj: "Yerel fixture değerlendirmeyi kabul etti." }),
    askQuestion: async () => ({ mesaj: "Yerel fixture soruyu kabul etti." }),
  });

  const assistant = Object.freeze({
    getCapability: async () => Object.freeze({
      contractVersion: "novabot-modes-v1",
      available: true,
      provider: Object.freeze({ configured: false, ready: false }),
      advancedModesAvailable: false,
      modeSelectionAvailable: false,
      defaultModeId: "friendly",
      modes: Object.freeze([Object.freeze({
        id: "friendly",
        label: "Samimi Mod",
        description: "Sıcak, günlük ve anlaşılır bir dille yardımcı olur.",
      })]),
      unavailableReason: "ADVANCED_PROVIDER_NOT_SELECTED",
    }),
    chat: async ({ message, modeId }) => Object.freeze({
      reply: `Yerel NovaBot fixture yanıtı: ${String(message || "").trim()}`,
      modeId: modeId || "friendly",
      mode: modeId || "friendly",
      modeLabel: "Samimi Mod",
      products: Object.freeze([]),
      suggestions: Object.freeze(["Kategorileri göster"]),
      pendingAction: null,
      requiresConfirmation: false,
    }),
    escalate: async () => ({ message: "Yerel fixture destek devrini kaydetti." }),
  });
  const legal = Object.freeze({
    list: async () => Object.freeze([]),
    load: async (slug) => Object.freeze({
      slug,
      path: `/${slug}`,
      title: "Yasal bilgilendirme",
      status: "owner_external_required",
      requiredForCheckout: ["pre-information", "distance-sale"].includes(slug),
      version: null,
      text: null,
    }),
  });

  return Object.freeze({
    businessIdentity: Object.freeze({
      status: "pending_owner_company_formation",
      identity: null,
    }),
    legal,
    catalog: Object.freeze({
      loadPage: async ({ q = "" } = {}) => ({ items: visibleProducts.filter((product) => product.name.toLocaleLowerCase("tr-TR").includes(q.toLocaleLowerCase("tr-TR"))), pagination: { limit: 20, hasMore: false, nextCursor: null } }),
      categories: canonicalCategories,
      products: visibleProducts,
      loadProduct: async (productId) => visibleProducts.find((product) => String(product.id) === String(productId)),
      loadCollection: async (slug) => Object.freeze({
        collection: Object.freeze({ slug, name: slug === "indirim" ? "Günün fırsatları" : slug }),
        products: Object.freeze(visibleProducts.filter((product) => product.oldPrice && product.oldPrice > product.price)),
      }),
    }),
    session,
    warnings: Object.freeze([]),
    favorites: Object.freeze({
      initialIds: Object.freeze([...favoriteIds]),
      set: async (productId, favorite) => { if (favorite) favoriteIds.add(productId); else favoriteIds.delete(productId); },
    }),
    cart: Object.freeze({
      initialItems: Object.freeze(cloneCart(cartItems)),
      persist: async (items) => { cartItems = cloneCart(items); },
      subscribe: () => () => {},
      handoffToCheckout: async (items) => {
        cartItems = cloneCart(items);
        root.location.hash = "#/odeme/teslimat";
      },
    }),
    auth: Object.freeze({ openAccount: () => { root.location.hash = "#/hesabim"; } }),
    customer,
    checkout,
    community,
    assistant,
    refreshCustomerState: async () => Object.freeze({
      favoriteIds: Object.freeze([...favoriteIds]),
      cartItems: Object.freeze(cloneCart(cartItems)),
    }),
  });
}
