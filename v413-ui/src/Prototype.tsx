import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArmchairIcon,
  BarbellIcon,
  BasketIcon,
  CheckCircleIcon,
  ContactlessPaymentIcon,
  CreditCardIcon,
  DropIcon,
  HeartIcon as PhosphorHeartIcon,
  MapPinIcon,
  MonitorIcon,
  SealCheckIcon,
  ShoppingCartSimpleIcon,
  SimCardIcon,
  StorefrontIcon,
  TextAaIcon,
  TShirtIcon,
} from "@phosphor-icons/react/ssr";
import {
  ArrowRightIcon,
  BackpackIcon,
  BellIcon,
  CalendarIcon,
  CaretRightIcon,
  ChatBubbleIcon,
  CheckIcon,
  ClockIcon,
  Cross1Icon,
  CubeIcon,
  DashboardIcon,
  DotsVerticalIcon,
  EyeClosedIcon,
  EyeOpenIcon,
  GearIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MinusIcon,
  MixerHorizontalIcon,
  PaperPlaneIcon,
  PersonIcon,
  PinLeftIcon,
  PlusIcon,
  QuestionMarkCircledIcon,
  ReloadIcon,
  Share1Icon,
  StarFilledIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { Amex as AmexLogo, Mastercard as MastercardLogo, Visa as VisaLogo } from "react-payment-logos/dist/logo";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { BottomSheet, Carousel, KeyboardInput, KeyboardTextarea, MobileScroll, useKeyboard } from "./mobile";
import {
  DEFAULT_PUBLIC_STORE_SLUG,
  loadCanonicalPublicStore,
  orderedCustomerCardMedia,
  orderedCustomerOriginalMediaUrls,
  type CustomerCardFraming,
  type CustomerPublicStoreProjection,
  type CustomerStorePresentationMode,
} from "./adapters";
import { hasAppOwnedBackEntry, nativeHistoryDepth } from "./native/nativeNavigation";
import { canonicalNativeRoute, canonicalNativeRouteOrSafeDefault } from "./native/routeContract";
import "./prototype.css";

declare const __NOVASTORE_NATIVE__: boolean;
const NATIVE_SHELL = typeof __NOVASTORE_NATIVE__ !== "undefined" && __NOVASTORE_NATIVE__;

type CalId =
  | "CAL-01" | "CAL-02" | "CAL-03" | "CAL-04" | "CAL-05" | "CAL-06"
  | "CAL-07" | "CAL-08" | "CAL-09" | "CAL-10" | "CAL-11" | "CAL-12";
type TabId = "home" | "categories" | "favorites" | "cart" | "support" | "account";
type ViewId = "" | "login" | "forgot" | "register" | "returns" | "faq" | "history" | "live" | "address" | "addresses" | "notifications" | "success" | "search" | "profile" | "payments" | "coupons" | "reviews" | "questions" | "security" | "settings" | "invoice" | "tracking" | "store";
type RouteContext = {
  storeSlug?: string;
  productId?: string;
  mode?: CustomerStorePresentationMode;
};
type Route = { cal: CalId; tab: TabId; view: ViewId } & RouteContext;
type RefreshSource = "pull" | "reselect";
type RefreshRequest = { id: number; source: RefreshSource };
type RefreshPhase = "idle" | "pulling" | "armed" | "refreshing" | "complete";
type CatalogSelection = { category: string; subcategory: string };

const A = "/calibration-assets";
const LOGO = `${A}/official/app_icon_foreground.png`;
const NOVABOT = `${A}/official/support_novastore.png`;
const PRODUCT_HERO = `${A}/generated/nova-pulse-anc-ivory-v1.png`;
const PRODUCT_GALLERY = [
  PRODUCT_HERO,
  `${A}/generated/nova-pulse-anc-ivory-side-v1.png`,
  `${A}/generated/nova-pulse-anc-ivory-detail-v1.png`,
];

type ProductCardAsset = Readonly<{
  id: string;
  url: string;
  cardFraming: CustomerCardFraming | null;
}>;

type Product = {
  id: string;
  name: string;
  store: string;
  price: string;
  old?: string;
  image: string;
  images?: readonly string[];
  badge?: string;
  rating?: number;
  reviewCount?: number;
  stock?: number;
  amount?: number;
  oldAmount?: number;
  storeSlug?: string;
  storeLogoUrl?: string | null;
  storeRating?: number | null;
  shippingSummary?: string;
  returnSummary?: string;
  cardMedia?: readonly ProductCardAsset[];
  isPurchasable?: boolean;
  isPublicProjection?: boolean;
};

type SavedAddress = {
  id: string;
  label: string;
  recipient: string;
  line: string;
  city: string;
  postalCode: string;
  isDefault: boolean;
};

type PaymentBrand = "visa" | "mastercard" | "amex" | "troy" | "generic";

type SavedPaymentMethod = {
  id: string;
  nickname: string;
  brand: PaymentBrand;
  last4: string;
  expiry: string;
  isDefault: boolean;
};

type ProductReview = {
  id: string;
  productId: string;
  ownerId: string;
  authorMasked: string;
  rating: number;
  copy: string;
  verified: boolean;
};

type ProductQuestion = {
  id: string;
  productId: string;
  ownerId: string;
  authorMasked: string;
  question: string;
  status: "pending" | "answered";
  answer?: string;
};

type NotificationPreference = "orders" | "campaigns" | "questions";

type CartLine = {
  id: string;
  productId: string;
  quantity: number;
};

type CatalogFilters = {
  brands: string[];
  features: string[];
  inStock: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  applied: boolean;
};

type CatalogSortKey = "featured" | "best-selling" | "newest" | "price-asc" | "price-desc" | "rating" | "review-count" | "discount";

type CommerceState = {
  favoriteIds: Set<string>;
  cartCount: number;
  cartLines: CartLine[];
  appliedCoupon: string;
  selectedProductId: string;
  publicProducts: Record<string, Product>;
  addresses: SavedAddress[];
  paymentMethods: SavedPaymentMethod[];
  productReviews: ProductReview[];
  productQuestions: ProductQuestion[];
  readNotificationIds: Set<string>;
  notificationPreferences: Record<NotificationPreference, boolean>;
  catalogSelection: CatalogSelection;
  catalogFilters: CatalogFilters;
  catalogSort: CatalogSortKey;
  toggleFavorite: (id: string) => void;
  addToCart: (productId: string, quantity?: number) => void;
  changeCartQuantity: (lineId: string, delta: number) => void;
  removeCartLine: (lineId: string) => void;
  clearCart: () => void;
  applyCartCoupon: (code: string) => void;
  selectProduct: (id: string) => void;
  registerPublicProducts: (products: readonly Product[]) => void;
  addAddress: (address: Omit<SavedAddress, "id" | "isDefault">) => void;
  updateAddress: (id: string, address: Omit<SavedAddress, "id" | "isDefault">) => void;
  removeAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
  addPaymentMethod: (method: Omit<SavedPaymentMethod, "id" | "isDefault">) => void;
  removePaymentMethod: (id: string) => void;
  setDefaultPaymentMethod: (id: string) => void;
  publishReview: (productId: string, rating: number, copy: string) => void;
  submitProductQuestion: (productId: string, question: string) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleNotificationPreference: (preference: NotificationPreference) => void;
  selectCatalog: (category: string, subcategory?: string) => void;
  applyCatalogFilters: (filters: Omit<CatalogFilters, "applied">) => void;
  setCatalogSort: (sort: CatalogSortKey) => void;
};

const CommerceContext = createContext<CommerceState | null>(null);
const CURRENT_MOCK_USER_ID = "customer-current";

function useCommerce() {
  const value = useContext(CommerceContext);
  if (!value) throw new Error("CommerceContext is missing");
  return value;
}

const CAL_TITLES: Record<CalId, string> = {
  "CAL-01": "Giriş",
  "CAL-02": "Ana Sayfa",
  "CAL-03": "Kategoriler",
  "CAL-04": "Ürün Listeleme",
  "CAL-05": "Filtre",
  "CAL-06": "Ürün Detayı",
  "CAL-07": "Sepet",
  "CAL-08": "Ödeme",
  "CAL-09": "Sipariş Detayı",
  "CAL-10": "Hesabım",
  "CAL-11": "Yardım ve Destek",
  "CAL-12": "NovaBot",
};

const initialTab: Record<CalId, TabId> = {
  "CAL-01": "account", "CAL-02": "home", "CAL-03": "categories", "CAL-04": "home",
  "CAL-05": "home", "CAL-06": "home", "CAL-07": "cart", "CAL-08": "cart",
  "CAL-09": "account", "CAL-10": "account", "CAL-11": "support", "CAL-12": "support",
};

const navItems: Array<{ id: TabId; label: string; asset: string; cal: CalId }> = [
  { id: "home", label: "Ana Sayfa", asset: "house", cal: "CAL-02" },
  { id: "categories", label: "Kategoriler", asset: "circles_four", cal: "CAL-03" },
  { id: "favorites", label: "Favoriler", asset: "heart", cal: "CAL-04" },
  { id: "cart", label: "Sepetim", asset: "handbag_simple", cal: "CAL-07" },
  { id: "support", label: "Destek", asset: "chat_circle", cal: "CAL-11" },
  { id: "account", label: "Hesabım", asset: "user", cal: "CAL-10" },
];

function routeFromCanonicalNativeParams(params: URLSearchParams): Route {
  const route: Route = {
    cal: params.get("cal") as CalId,
    tab: params.get("tab") as TabId,
    view: (params.get("view") ?? "") as ViewId,
  };
  const storeSlug = params.get("storeSlug");
  const productId = params.get("productId");
  const mode = params.get("mode");
  if (storeSlug) route.storeSlug = storeSlug;
  if (productId) route.productId = productId;
  if (mode === "customer" || mode === "preview") route.mode = mode;
  return route;
}

function canonicalizeNativeLocation(params: URLSearchParams, route: Route) {
  if (!NATIVE_SHELL || window.location.search === "") return;
  const canonical = canonicalNativeRoute(params) ?? canonicalNativeRouteOrSafeDefault(params);
  if (params.toString() === canonical.toString()) return;
  const url = new URL(window.location.href);
  url.search = canonical.toString();
  const currentState = window.history.state;
  const state = currentState && typeof currentState === "object"
    ? { ...currentState, ...route }
    : { ...route, novastoreDepth: nativeHistoryDepth(currentState) };
  window.history.replaceState(state, "", url);
}

function readRoute(): Route {
  const params = new URLSearchParams(window.location.search);
  if (NATIVE_SHELL) {
    const route = routeFromCanonicalNativeParams(canonicalNativeRouteOrSafeDefault(params));
    canonicalizeNativeLocation(params, route);
    return route;
  }
  const rawCal = params.get("cal") as CalId | null;
  const cal = rawCal && CAL_TITLES[rawCal] ? rawCal : "CAL-02";
  const rawTab = params.get("tab") as TabId | null;
  const tab = rawTab && navItems.some((item) => item.id === rawTab) ? rawTab : initialTab[cal];
  const rawView = params.get("view") as ViewId | null;
  const allowedViews: ViewId[] = ["", "login", "forgot", "register", "returns", "faq", "history", "live", "address", "addresses", "notifications", "success", "search", "profile", "payments", "coupons", "reviews", "questions", "security", "settings", "invoice", "tracking", "store"];
  const view = rawView && allowedViews.includes(rawView) ? rawView : "";
  const route: Route = { cal, tab, view };
  const contextRoute = (cal === "CAL-04" && view === "store") || cal === "CAL-06";
  const storeSlug = params.get("storeSlug")?.trim().toLocaleLowerCase("en-US");
  const productId = params.get("productId")?.trim();
  const mode = params.get("mode");
  if (contextRoute && storeSlug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(storeSlug) && storeSlug.length <= 160) {
    route.storeSlug = storeSlug;
  }
  if (cal === "CAL-06" && productId && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(productId)) {
    route.productId = productId;
  }
  if (contextRoute && (mode === "customer" || mode === "preview") && (mode !== "preview" || route.storeSlug)) {
    route.mode = mode;
  }
  return route;
}

export default function Prototype() {
  const keyboard = useKeyboard();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const [route, setRoute] = useState<Route>(readRoute);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [cartLines, setCartLines] = useState<CartLine[]>([
    { id: "headphones", productId: "pulse-anc", quantity: 1 },
    { id: "coffee", productId: "barista-pro", quantity: 2 },
  ]);
  const [appliedCoupon, setAppliedCoupon] = useState("NOVAYAZ");
  const [selectedProductId, setSelectedProductId] = useState("pulse-anc");
  const [publicProducts, setPublicProducts] = useState<Record<string, Product>>({});
  const [addresses, setAddresses] = useState<SavedAddress[]>([
    { id: "home", label: "Ev", recipient: "Kullanıcı Adı", line: "Atakum Mah. Cumhuriyet Cad. No: 58 D: 12", city: "Samsun / Atakum", postalCode: "55200", isDefault: true },
  ]);
  const [paymentMethods, setPaymentMethods] = useState<SavedPaymentMethod[]>([
    { id: "nova-card", nickname: "Nova Kart", brand: "visa", last4: "4242", expiry: "09/29", isDefault: true },
  ]);
  const [productReviews, setProductReviews] = useState<ProductReview[]>([
    { id: "review-aylin", productId: "pulse-anc", ownerId: "customer-aylin", authorMasked: "Ay***", rating: 5, copy: "Ses kalitesi çok dengeli, kulak yastıkları uzun kullanımda rahat.", verified: true },
    { id: "review-mert", productId: "pulse-anc", ownerId: "customer-mert", authorMasked: "Me***", rating: 4, copy: "Gürültü engelleme toplu taşımada belirgin fark yaratıyor.", verified: true },
    { id: "review-selin", productId: "pulse-anc", ownerId: "customer-selin", authorMasked: "Se***", rating: 5, copy: "İki cihaza aynı anda bağlanması iş akışımı kolaylaştırdı.", verified: true },
  ]);
  const [productQuestions, setProductQuestions] = useState<ProductQuestion[]>([
    { id: "question-public", productId: "pulse-anc", ownerId: "customer-melisa", authorMasked: "Me***", question: "ANC açıkken pil ömrü yaklaşık kaç saat?", status: "answered", answer: "ANC açık kullanımda yaklaşık 36 saate kadar kullanım sunar." },
    { id: "question-hidden", productId: "pulse-anc", ownerId: "customer-other", authorMasked: "Al***", question: "Bu bekleyen soru başka müşteriye ait.", status: "pending" },
  ]);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => new Set(["welcome"]));
  const [notificationPreferences, setNotificationPreferences] = useState<Record<NotificationPreference, boolean>>({ orders: true, campaigns: false, questions: true });
  const [catalogSelection, setCatalogSelection] = useState<CatalogSelection>({ category: "Elektronik", subcategory: "Kulaklık" });
  const [catalogFilters, setCatalogFilters] = useState<CatalogFilters>({ brands: [], features: [], inStock: false, minPrice: null, maxPrice: null, applied: false });
  const [catalogSort, setCatalogSort] = useState<CatalogSortKey>("featured");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPanelOpen, setSearchPanelOpen] = useState(true);
  const [navigationRevision, setNavigationRevision] = useState(0);
  const [contentRevision, setContentRevision] = useState(0);
  const [refreshRequest, setRefreshRequest] = useState<RefreshRequest>({ id: 0, source: "reselect" });
  const capture = !NATIVE_SHELL && params.get("capture") === "1";
  const nativeShell = NATIVE_SHELL;
  const layout = NATIVE_SHELL ? "phone" : params.get("layout") === "tablet" ? "tablet" : "phone";
  const logicalWidth = Number(params.get("logicalWidth") || (layout === "tablet" ? 800 : 411.428571));
  const logicalHeight = Number(params.get("logicalHeight") || (layout === "tablet" ? 1280 : 914.285714));
  const scale = Number(params.get("scale") || (layout === "tablet" ? 2 : 2.625));
  const segmentOffset = Number(params.get("segmentOffset") || 0);
  const segmentX = Number(params.get("segmentX") || 0);

  useEffect(() => {
    document.documentElement.lang = "tr";
    document.title = NATIVE_SHELL
      ? "NovaStore Android Müşteri · V4.13"
      : "NovaStore Android Müşteri · V4.13 Kalibrasyon";
    const onPopState = () => {
      setRoute(readRoute());
      setNavigationRevision((current) => current + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const style = capture ? ({
    "--capture-width": `${logicalWidth}px`,
    "--capture-height": `${logicalHeight}px`,
    "--capture-scale": scale,
    "--capture-offset": `${segmentOffset}px`,
    "--capture-offset-x": `${segmentX}px`,
  } as CSSProperties) : undefined;

  const requestRefresh = useCallback((source: RefreshSource) => {
    keyboard.hide();
    setRefreshRequest((current) => ({ id: current.id + 1, source }));
  }, [keyboard]);

  const registerPublicProducts = useCallback((incoming: readonly Product[]) => {
    setPublicProducts((current) => {
      let changed = false;
      const next = { ...current };
      for (const product of incoming) {
        if (next[product.id] !== product) changed = true;
        next[product.id] = product;
      }
      return changed ? next : current;
    });
  }, []);

  const go = (next: CalId, tab = initialTab[next], view: ViewId = "", context: RouteContext = {}) => {
    keyboard.hide();
    const nextRoute: Route = { cal: next, tab, view, ...context };
    if (
      route.cal === nextRoute.cal && route.tab === nextRoute.tab && route.view === nextRoute.view &&
      route.storeSlug === nextRoute.storeSlug && route.productId === nextRoute.productId && route.mode === nextRoute.mode
    ) {
      setNavigationRevision((current) => current + 1);
      setContentRevision((current) => current + 1);
      return;
    }
    if (next === "CAL-02" && view === "search") setSearchPanelOpen(true);
    setRoute(nextRoute);
    setNavigationRevision((current) => current + 1);
    if (!capture) {
      const url = new URL(window.location.href);
      url.searchParams.set("cal", next);
      url.searchParams.set("tab", tab);
      if (view) url.searchParams.set("view", view); else url.searchParams.delete("view");
      for (const key of ["storeSlug", "productId", "mode"] as const) {
        const value = nextRoute[key];
        if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
      }
      const currentDepth = typeof window.history.state?.novastoreDepth === "number"
        ? window.history.state.novastoreDepth
        : 0;
      window.history.pushState({ ...nextRoute, novastoreDepth: currentDepth + 1 }, "", url);
    }
  };
  const showNav = !["CAL-01", "CAL-06"].includes(route.cal);
  const hasFixedAppHeader = route.cal !== "CAL-06";
  const routeIdentity = `${route.cal}:${route.tab}:${route.view || "root"}:${route.storeSlug || "local"}:${route.productId || "none"}:${route.mode || "customer"}`;
  const scrollSurfaceIdentity = route.cal === "CAL-08" ? `${route.cal}:${route.tab}` : routeIdentity;
  const scrollSurfaceKey = `${scrollSurfaceIdentity}:${contentRevision}:${refreshRequest.id}`;
  const cartCount = cartLines.reduce((total, line) => total + line.quantity, 0);
  const commerce = useMemo<CommerceState>(() => ({
    favoriteIds,
    cartCount,
    cartLines,
    appliedCoupon,
    selectedProductId,
    publicProducts,
    addresses,
    paymentMethods,
    productReviews,
    productQuestions,
    readNotificationIds,
    notificationPreferences,
    catalogSelection,
    catalogFilters,
    catalogSort,
    toggleFavorite: (id) => setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }),
    addToCart: (productId, quantity = 1) => setCartLines((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) return current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + quantity } : line);
      return [...current, { id: `product-${productId}`, productId, quantity }];
    }),
    changeCartQuantity: (lineId, delta) => setCartLines((current) => current.flatMap((line) => line.id !== lineId ? [line] : line.quantity + delta <= 0 ? [] : [{ ...line, quantity: line.quantity + delta }])),
    removeCartLine: (lineId) => setCartLines((current) => current.filter((line) => line.id !== lineId)),
    clearCart: () => setCartLines([]),
    applyCartCoupon: (code) => setAppliedCoupon(code.trim().toLocaleUpperCase("tr-TR")),
    selectProduct: setSelectedProductId,
    registerPublicProducts,
    addAddress: (address) => setAddresses((current) => [...current, { ...address, id: `address-${Date.now()}`, isDefault: current.length === 0 }]),
    updateAddress: (id, address) => setAddresses((current) => current.map((item) => item.id === id ? { ...item, ...address } : item)),
    removeAddress: (id) => setAddresses((current) => {
      const remaining = current.filter((address) => address.id !== id);
      if (remaining.length && !remaining.some((address) => address.isDefault)) remaining[0] = { ...remaining[0], isDefault: true };
      return remaining;
    }),
    setDefaultAddress: (id) => setAddresses((current) => current.map((address) => ({ ...address, isDefault: address.id === id }))),
    addPaymentMethod: (method) => setPaymentMethods((current) => [...current, { ...method, id: `payment-${Date.now()}`, isDefault: current.length === 0 }]),
    removePaymentMethod: (id) => setPaymentMethods((current) => {
      const remaining = current.filter((method) => method.id !== id);
      if (remaining.length && !remaining.some((method) => method.isDefault)) remaining[0] = { ...remaining[0], isDefault: true };
      return remaining;
    }),
    setDefaultPaymentMethod: (id) => setPaymentMethods((current) => current.map((method) => ({ ...method, isDefault: method.id === id }))),
    publishReview: (productId, rating, copy) => setProductReviews((current) => {
      if (current.some((review) => review.productId === productId && review.ownerId === CURRENT_MOCK_USER_ID)) return current;
      return [{ id: `review-${Date.now()}`, productId, ownerId: CURRENT_MOCK_USER_ID, authorMasked: "Ku***", rating, copy: copy.trim(), verified: true }, ...current];
    }),
    submitProductQuestion: (productId, question) => setProductQuestions((current) => [{ id: `question-${Date.now()}`, productId, ownerId: CURRENT_MOCK_USER_ID, authorMasked: "Ku***", question: question.trim(), status: "pending" }, ...current]),
    markNotificationRead: (id) => setReadNotificationIds((current) => new Set(current).add(id)),
    markAllNotificationsRead: () => setReadNotificationIds(new Set(["order", "campaign", "question", "welcome"])),
    toggleNotificationPreference: (preference) => setNotificationPreferences((current) => ({ ...current, [preference]: !current[preference] })),
    selectCatalog: (category, subcategory = category) => setCatalogSelection({ category, subcategory }),
    applyCatalogFilters: (filters) => setCatalogFilters({ ...filters, applied: true }),
    setCatalogSort,
  }), [favoriteIds, cartCount, cartLines, appliedCoupon, selectedProductId, publicProducts, addresses, paymentMethods, productReviews, productQuestions, readNotificationIds, notificationPreferences, catalogSelection, catalogFilters, catalogSort, registerPublicProducts]);

  return (
    <CommerceContext.Provider value={commerce}>
      <div
        className={`cal-app layout-${layout}${capture ? " capture-mode" : ""}`}
        style={style}
        data-focus-modality="pointer"
        data-cal-id={route.cal}
        data-view={route.view || "root"}
        data-layout={layout}
        data-capture={capture ? "true" : "false"}
        data-shell-contract="v4.4-responsive"
        data-refresh-id={refreshRequest.id}
        data-refresh-source={refreshRequest.id ? refreshRequest.source : "none"}
        data-testid="calibration-app"
        onPointerDownCapture={(event) => { event.currentTarget.dataset.focusModality = "pointer"; }}
        onKeyDownCapture={(event) => { if (event.key === "Tab") event.currentTarget.dataset.focusModality = "keyboard"; }}
      >
        {hasFixedAppHeader && (
          <div className="fixed-app-header" data-testid="fixed-app-header">
            <RouteTopbar key={`${route.cal}:${route.tab}:${route.view}`} route={route} go={go} query={searchQuery} setQuery={setSearchQuery} setSearchPanelOpen={setSearchPanelOpen} />
          </div>
        )}
        <RefreshableRouteStage
          resetKey={`${routeIdentity}:${navigationRevision}`}
          refreshRequest={refreshRequest}
          onRefresh={requestRefresh}
        >
          {route.cal === "CAL-06" ? <ProductDetailScreen key={scrollSurfaceKey} go={go} route={route} /> : (
            <MobileScroll key={scrollSurfaceKey} className={`cal-scroll${showNav ? " with-bottom-nav" : ""}`}>
              <main className={`cal-screen screen-${route.cal.toLowerCase()}${hasFixedAppHeader ? " has-fixed-topbar" : ""}`} aria-label={`${route.cal} ${CAL_TITLES[route.cal]}`}>
                <Screen route={route} go={go} searchQuery={searchQuery} setSearchQuery={setSearchQuery} searchPanelOpen={searchPanelOpen} setSearchPanelOpen={setSearchPanelOpen} />
              </main>
            </MobileScroll>
          )}
        </RefreshableRouteStage>
        {showNav && <BottomNav route={route} go={go} onReselect={() => requestRefresh("reselect")} />}
        {!capture && !nativeShell && <CalibrationSwitcher current={route.cal} go={go} />}
      </div>
    </CommerceContext.Provider>
  );
}

const PULL_REFRESH_THRESHOLD = 56;

function RefreshableRouteStage({ resetKey, refreshRequest, onRefresh, children }: { resetKey: string; refreshRequest: RefreshRequest; onRefresh: (source: RefreshSource) => void; children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef({ active: false, captured: false, fallback: false, pointerId: -1, startX: 0, startY: 0, progress: 0 });
  const handledRefresh = useRef(refreshRequest.id);
  const timers = useRef<number[]>([]);
  const fallbackTimer = useRef<number | null>(null);
  const [phase, setPhase] = useState<RefreshPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [fallbackPull, setFallbackPull] = useState(false);
  const [fallbackOffset, setFallbackOffset] = useState(0);

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  const settleFallbackPull = useCallback(() => {
    setFallbackOffset(0);
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
    fallbackTimer.current = window.setTimeout(() => {
      setFallbackPull(false);
      fallbackTimer.current = null;
    }, 180);
  }, []);

  const scrollToTop = useCallback(() => {
    const scroll = stageRef.current?.querySelector<HTMLElement>(".mobile-scroll");
    if (scroll) scroll.scrollTop = 0;
    if (!NATIVE_SHELL) {
      const deviceScreen = stageRef.current?.closest<HTMLElement>(".device-screen");
      if (deviceScreen) deviceScreen.scrollTop = 0;
    }
  }, []);

  useLayoutEffect(() => {
    scrollToTop();
    const frame = window.requestAnimationFrame(scrollToTop);
    const keyboardSettleTimer = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage || stage.querySelector("input:focus, textarea:focus, [contenteditable='true']:focus")) return;
      if (!NATIVE_SHELL) {
        const deviceScreen = stage.closest<HTMLElement>(".device-screen");
        if (deviceScreen) deviceScreen.scrollTop = 0;
      }
    }, 320);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(keyboardSettleTimer);
    };
  }, [resetKey, refreshRequest.id, scrollToTop]);

  useEffect(() => {
    clearTimers();
    gesture.current.active = false;
    gesture.current.progress = 0;
    setFallbackPull(false);
    setFallbackOffset(0);
    setProgress(0);
    setPhase("idle");
  }, [clearTimers, resetKey]);

  useEffect(() => {
    if (refreshRequest.id === handledRefresh.current) return;
    handledRefresh.current = refreshRequest.id;
    clearTimers();
    scrollToTop();
    setProgress(1);
    setPhase("refreshing");
    timers.current.push(window.setTimeout(() => {
      setPhase("complete");
      timers.current.push(window.setTimeout(() => {
        setPhase("idle");
        setProgress(0);
      }, 480));
    }, 660));
  }, [clearTimers, refreshRequest, scrollToTop]);

  useEffect(() => () => {
    clearTimers();
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
  }, [clearTimers]);

  useEffect(() => {
    if (!NATIVE_SHELL) return;
    const onNativePull = (event: Event) => {
      const detail = (event as CustomEvent<{
        phase?: unknown;
        progress?: unknown;
        fallback?: unknown;
      }>).detail;
      const nextProgress = typeof detail?.progress === "number"
        ? Math.max(0, Math.min(1, detail.progress))
        : 0;
      const fallback = detail?.fallback === true;
      if (detail?.phase === "move") {
        setFallbackPull(fallback);
        setFallbackOffset(fallback ? nextProgress : 0);
        setProgress(nextProgress);
        setPhase(nextProgress >= 1 ? "armed" : "pulling");
        return;
      }
      settleFallbackPull();
      if (detail?.phase === "release" && nextProgress >= 1) {
        setProgress(1);
        setPhase("refreshing");
        window.setTimeout(() => onRefresh("pull"), 0);
      } else {
        setProgress(0);
        setPhase("idle");
      }
    };
    window.addEventListener("novastore:native-pull", onNativePull);
    return () => window.removeEventListener("novastore:native-pull", onNativePull);
  }, [onRefresh, settleFallbackPull]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase === "refreshing" || phase === "complete") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true'], [data-scroll-drag='ignore']")) return;
    const scroll = stageRef.current?.querySelector<HTMLElement>(".mobile-scroll");
    if (!scroll || !(event.target instanceof Element) || !event.target.closest(".mobile-scroll") || scroll.scrollTop > 1) return;
    const fallback = scroll.scrollHeight <= scroll.clientHeight + 2;
    if (fallbackTimer.current !== null) window.clearTimeout(fallbackTimer.current);
    setFallbackPull(fallback);
    setFallbackOffset(0);
    gesture.current = { active: true, captured: false, fallback, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, progress: 0 };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (Math.abs(deltaX) > Math.abs(deltaY) + 6 || deltaY < -8) {
      if (current.captured) {
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture already ended */ }
      }
      current.active = false;
      current.progress = 0;
      settleFallbackPull();
      setProgress(0);
      setPhase("idle");
      return;
    }
    if (deltaY <= 4) {
      current.progress = 0;
      if (current.fallback) setFallbackOffset(0);
      setProgress(0);
      setPhase("idle");
      return;
    }
    if (current.fallback && !current.captured) {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
        current.captured = true;
      } catch {
        // A browser can cancel the pointer before fallback capture begins.
      }
    }
    const scroll = stageRef.current?.querySelector<HTMLElement>(".mobile-scroll");
    const runtimeOverscroll = Number(scroll?.dataset.overscroll || 0);
    const pullDistance = Math.max(runtimeOverscroll, (deltaY - 4) * 0.5);
    const nextProgress = Math.min(1, pullDistance / PULL_REFRESH_THRESHOLD);
    current.progress = nextProgress;
    if (current.fallback) setFallbackOffset(nextProgress);
    setProgress(nextProgress);
    setPhase(nextProgress >= 1 ? "armed" : "pulling");
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>, canceled = false) => {
    const current = gesture.current;
    if (!current.active || current.pointerId !== event.pointerId) return;
    const shouldRefresh = !canceled && current.progress >= 1;
    if (current.captured) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* capture already ended */ }
    }
    current.active = false;
    current.progress = 0;
    settleFallbackPull();
    if (shouldRefresh) {
      setProgress(1);
      setPhase("refreshing");
      window.setTimeout(() => onRefresh("pull"), 0);
    } else {
      setProgress(0);
      setPhase("idle");
    }
  };

  const status = phase === "armed" ? "Yenilemek için bırak" : phase === "refreshing" ? "Yenileniyor" : phase === "complete" ? "Sayfa yenilendi" : "";
  const indicatorLabel = phase === "armed" ? "Bırakınca yenile" : phase === "refreshing" ? "Yenileniyor" : phase === "complete" ? "Güncel" : "Yenilemek için çek";

  return (
    <div
      ref={stageRef}
      className="route-scroll-stage"
      data-testid="refreshable-route-stage"
      data-refresh-state={phase}
      data-refresh-progress={progress.toFixed(2)}
      data-fallback-pull={fallbackPull ? "true" : "false"}
      aria-busy={phase === "refreshing" ? "true" : undefined}
      onPointerDown={NATIVE_SHELL ? undefined : handlePointerDown}
      onPointerMove={NATIVE_SHELL ? undefined : handlePointerMove}
      onPointerUp={NATIVE_SHELL ? undefined : (event) => finishGesture(event)}
      onPointerCancel={NATIVE_SHELL ? undefined : (event) => finishGesture(event, true)}
      style={{ "--pull-progress": progress, "--fallback-pull-progress": fallbackOffset } as CSSProperties}
    >
      {children}
      <div className="pull-refresh-indicator" data-testid="pull-refresh-indicator" data-state={phase} aria-hidden="true">
        <span className="pull-refresh-arrow" data-testid="pull-refresh-arrow">{phase === "complete" ? <CheckIcon /> : <ReloadIcon />}</span>
        <b>{indicatorLabel}</b>
      </div>
      {status && <span className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{status}</span>}
    </div>
  );
}

type Go = (next: CalId, tab?: TabId, view?: ViewId, context?: RouteContext) => void;

function RouteTopbar({ route, go, query, setQuery, setSearchPanelOpen }: { route: Route; go: Go; query: string; setQuery: (value: string) => void; setSearchPanelOpen: (open: boolean) => void }) {
  const commerceActions = {
    onLocation: () => go("CAL-10", "account", "addresses"),
    onNotifications: () => go("CAL-10", "account", "notifications"),
  };

  if (route.cal === "CAL-01") {
    const authView = route.view === "forgot" || route.view === "register" ? route.view : "login";
    return <TopActions title={authView === "forgot" ? "Şifreyi Sıfırla" : authView === "register" ? "Kayıt Ol" : "Giriş Yap"} back={authView === "login" ? () => go("CAL-10", "account") : () => go("CAL-01", "account", "login")} compact plainEnd />;
  }
  if (route.cal === "CAL-02" && route.view === "search") {
    return <SearchTopbar query={query} setQuery={setQuery} onBack={() => go("CAL-02", "home")} onActivate={() => setSearchPanelOpen(true)} />;
  }
  const openSearch = () => { setSearchPanelOpen(true); go("CAL-02", "home", "search"); };
  if (route.cal === "CAL-02") return <TopActions {...commerceActions} onSearch={openSearch} />;
  if (route.cal === "CAL-03") return <TopActions {...commerceActions} onSearch={openSearch} />;
  if (route.cal === "CAL-04" && route.view === "store") return <TopActions title="Mağaza" back={() => goBackOr(() => go("CAL-06", "home", "", { storeSlug: route.storeSlug, mode: route.mode }))} plainEnd />;
  if (route.cal === "CAL-04") return <TopActions {...commerceActions} title={route.tab === "favorites" ? "Favorilerim" : "Kablosuz Kulaklık"} back={() => route.tab === "favorites" ? go("CAL-02", "home") : go("CAL-03")} />;
  if (route.cal === "CAL-05") return <TopActions {...commerceActions} title="Kulaklıklar" back={() => go("CAL-04")} />;
  if (route.cal === "CAL-07") return <TopActions {...commerceActions} onSearch={openSearch} />;
  if (route.cal === "CAL-08") return route.view === "success" ? <TopActions title="Ödeme Tamamlandı" plainStart plainEnd /> : <TopActions {...commerceActions} onSearch={openSearch} />;
  if (route.cal === "CAL-09") {
    const title = route.view === "invoice" ? "E-Arşiv Fatura" : route.view === "tracking" ? "Kargo Takibi" : "Sipariş Detayı";
    return <TopActions title={title} back={() => route.view ? goBackOr(() => go("CAL-09", "account")) : go("CAL-10", "account")} overflow={!route.view} onOverflow={() => go("CAL-09", "account", "tracking")} />;
  }
  if (route.cal === "CAL-10") {
    if (route.view === "returns") return <TopActions title="İade ve Değişim" back={() => goBackOr(() => go("CAL-10", "account"))} plainEnd />;
    if (route.view === "faq" || route.view === "history") return <TopActions title={route.view === "faq" ? "Sıkça Sorulan Sorular" : "Geçmiş İşlemler"} back={() => goBackOr(() => go("CAL-10", "account"))} plainEnd />;
    if (route.view === "addresses") return <TopActions title="Adreslerim" back={() => goBackOr(() => go("CAL-10", "account"))} plainEnd />;
    if (route.view === "notifications") return <TopActions title="Bildirimler" back={() => goBackOr(() => go("CAL-10", "account"))} plainEnd />;
    const accountTitles: Partial<Record<ViewId, string>> = { profile: "Profil Bilgileri", payments: "Ödeme Yöntemlerim", coupons: "Kuponlarım", reviews: "Değerlendirmelerim", questions: "Sorularım", security: "Gizlilik ve Güvenlik", settings: "Ayarlar" };
    if (route.view && accountTitles[route.view]) return <TopActions title={accountTitles[route.view]} back={() => goBackOr(() => go("CAL-10", "account"))} plainEnd />;
    return <TopActions title="Hesabım" settings onSettings={() => go("CAL-10", "account", "settings")} plainStart />;
  }
  if (route.cal === "CAL-11") {
    if (route.view === "faq" || route.view === "history" || route.view === "live") {
      const title = route.view === "faq" ? "Sıkça Sorulan Sorular" : route.view === "history" ? "Geçmiş Destek Kayıtları" : "Canlı Destek";
      return <TopActions title={title} back={() => goBackOr(() => go("CAL-11", "support"))} plainEnd />;
    }
    return <TopActions {...commerceActions} onSearch={() => document.querySelector<HTMLInputElement>(".support-search input")?.focus()} />;
  }
  return <TopActions {...commerceActions} onSearch={() => document.querySelector<HTMLInputElement>(".composer input")?.focus()} />;
}

function Screen({ route, go, searchQuery, setSearchQuery, searchPanelOpen, setSearchPanelOpen }: { route: Route; go: Go; searchQuery: string; setSearchQuery: (value: string) => void; searchPanelOpen: boolean; setSearchPanelOpen: (open: boolean) => void }) {
  switch (route.cal) {
    case "CAL-01": return <LoginScreen go={go} view={route.view} />;
    case "CAL-02": return route.view === "search" ? <SearchScreen go={go} query={searchQuery} setQuery={setSearchQuery} panelOpen={searchPanelOpen} setPanelOpen={setSearchPanelOpen} /> : <HomeScreen go={go} />;
    case "CAL-03": return <CategoriesScreen go={go} />;
    case "CAL-04": return route.view === "store" ? <StorefrontScreen go={go} route={route} /> : <PlpScreen go={go} favoritesOnly={route.tab === "favorites"} />;
    case "CAL-05": return <FilterScreen go={go} />;
    case "CAL-06": return <ProductDetailScreen go={go} route={route} />;
    case "CAL-07": return <CartScreen go={go} />;
    case "CAL-08": return <CheckoutScreen go={go} view={route.view} />;
    case "CAL-09": return <OrderDetailScreen go={go} view={route.view} />;
    case "CAL-10": return <AccountScreen go={go} view={route.view} />;
    case "CAL-11": return <SupportHubScreen go={go} view={route.view} />;
    case "CAL-12": return <NovaBotScreen go={go} />;
  }
}

function CalibrationSwitcher({ current, go }: { current: CalId; go: Go }) {
  return createPortal((
    <label className="cal-switcher" aria-label="Kalibrasyon ekranı seç">
      <span>{current}</span>
      <select value={current} onChange={(e) => go(e.target.value as CalId)}>
        {Object.entries(CAL_TITLES).map(([id, title]) => <option key={id} value={id}>{id} · {title}</option>)}
      </select>
    </label>
  ), document.body);
}

function TopActions({ title, back, settings, overflow, compact = false, plainStart = false, plainEnd = false, onSearch, onLocation, onNotifications, onSettings, onOverflow }: { title?: string; back?: () => void; settings?: boolean; overflow?: boolean; compact?: boolean; plainStart?: boolean; plainEnd?: boolean; onSearch?: () => void; onLocation?: () => void; onNotifications?: () => void; onSettings?: () => void; onOverflow?: () => void }) {
  const [activeAction, setActiveAction] = useState("");
  return (
    <header className={`glass-topbar${compact ? " compact" : ""}`} data-testid="app-topbar">
      {back ? <IconButton label="Geri" onClick={back}><img className="repo-icon" src={`${A}/official/nav/ic_customer_caret_left.svg`} alt="" /></IconButton> : plainStart ? <span aria-hidden="true" /> : <IconButton label="Konum seç" pressed={activeAction === "Konum"} onClick={onLocation || (() => setActiveAction("Konum"))}><MapPinIcon data-icon="location-pin" weight="regular" /></IconButton>}
      {title ? <h1>{title}</h1> : <IconButton label="Ara" pressed={activeAction === "Ara"} onClick={onSearch || (() => setActiveAction("Ara"))}><MagnifyingGlassIcon /></IconButton>}
      {plainEnd ? <span aria-hidden="true" /> : settings ? <IconButton label="Ayarlar" pressed={activeAction === "Ayarlar"} onClick={onSettings || (() => setActiveAction("Ayarlar"))}><GearIcon /></IconButton> : overflow ? <IconButton label="Diğer işlemler" pressed={activeAction === "Diğer"} onClick={onOverflow || (() => setActiveAction("Diğer"))}><DotsVerticalIcon /></IconButton> : <IconButton label="Bildirimler" pressed={activeAction === "Bildirimler"} onClick={onNotifications || (() => setActiveAction("Bildirimler"))}><BellIcon /></IconButton>}
      {activeAction && <span className="top-action-status" role="status">{activeAction} açıldı</span>}
    </header>
  );
}

function SearchTopbar({ query, setQuery, onBack, onActivate }: { query: string; setQuery: (value: string) => void; onBack: () => void; onActivate: () => void }) {
  return (
    <header className="search-topbar" data-testid="app-topbar">
      <IconButton label="Aramayı kapat" onClick={onBack}><img className="repo-icon" src={`${A}/official/nav/ic_customer_caret_left.svg`} alt="" /></IconButton>
      <label className="search-field" onPointerDown={onActivate}><MagnifyingGlassIcon /><KeyboardInput autoFocus aria-label="Ürün ara" placeholder="Ürün, kategori veya marka ara" value={query} onFocus={onActivate} onClick={onActivate} onChange={(event) => setQuery(event.target.value)} /></label>
      {query ? <IconButton label="Aramayı temizle" onClick={() => { setQuery(""); onActivate(); }}><Cross1Icon /></IconButton> : <span aria-hidden="true" />}
    </header>
  );
}

function IconButton({ label, onClick, children, className = "", pressed, disabled = false }: { label: string; onClick?: () => void; children: ReactNode; className?: string; pressed?: boolean; disabled?: boolean }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>{children}</button>;
}

function goBackOr(fallback: () => void) {
  if (hasAppOwnedBackEntry(NATIVE_SHELL, window.history.state, window.history.length)) window.history.back();
  else fallback();
}

function smoothMinimum(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k * 0.25);
}

function smoothMaximum(a: number, b: number, k: number) {
  return -smoothMinimum(-a, -b, k);
}

function standardCustomerEasing(fraction: number) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const sample = (t: number, a1: number, a2: number) =>
    ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + (3 * a1 * t);
  const slope = (t: number, a1: number, a2: number) =>
    3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + (3 * a1);
  let t = clamped;
  for (let index = 0; index < 8; index += 1) {
    const currentSlope = slope(t, 0.2, 0);
    if (Math.abs(currentSlope) < 1e-6) break;
    t -= (sample(t, 0.2, 0) - clamped) / currentSlope;
  }
  return sample(Math.min(1, Math.max(0, t)), 0, 1);
}

function buildUnifiedBarPath(width: number, selectedIndex: number, progress: number) {
  const surfaceWidth = width + 12;
  const cy = 42;
  const capsuleLeft = 6;
  const capsuleRight = width + 6;
  const capsuleRadius = 29.25;
  const contentWidth = Math.max(1, width - 16);
  const cx = 6 + 8 + contentWidth * (selectedIndex + 0.5) / 6;
  const circleRadius = capsuleRadius + (37 - capsuleRadius) * progress;
  const blend = 7 * progress;
  const top: Array<[number, number]> = [];
  const bottom: Array<[number, number]> = [];
  for (let x = 0; x <= surfaceWidth; x += 0.75) {
    let capsuleHalf = -1;
    if (x >= capsuleLeft && x <= capsuleRight) {
      if (x < capsuleLeft + capsuleRadius) capsuleHalf = Math.sqrt(Math.max(0, capsuleRadius ** 2 - (x - capsuleLeft - capsuleRadius) ** 2));
      else if (x > capsuleRight - capsuleRadius) capsuleHalf = Math.sqrt(Math.max(0, capsuleRadius ** 2 - (x - capsuleRight + capsuleRadius) ** 2));
      else capsuleHalf = capsuleRadius;
    }
    const dx = x - cx;
    const circleHalf = Math.abs(dx) <= circleRadius ? Math.sqrt(Math.max(0, circleRadius ** 2 - dx ** 2)) : -1;
    if (capsuleHalf < 0 && circleHalf < 0) continue;
    const capTop = capsuleHalf >= 0 ? cy - capsuleHalf : Number.POSITIVE_INFINITY;
    const capBottom = capsuleHalf >= 0 ? cy + capsuleHalf : Number.NEGATIVE_INFINITY;
    const circleTop = circleHalf >= 0 ? cy - circleHalf : Number.POSITIVE_INFINITY;
    const circleBottom = circleHalf >= 0 ? cy + circleHalf : Number.NEGATIVE_INFINITY;
    top.push([x, circleHalf >= 0 && capsuleHalf >= 0 ? smoothMinimum(capTop, circleTop, blend) : Math.min(capTop, circleTop)]);
    bottom.push([x, circleHalf >= 0 && capsuleHalf >= 0 ? smoothMaximum(capBottom, circleBottom, blend) : Math.max(capBottom, circleBottom)]);
  }
  const points = [...top, ...bottom.reverse()];
  return points.length ? `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z` : "";
}

function useSequentialSelection(activeIndex: number) {
  const currentIndex = useRef(activeIndex);
  const frame = useRef<number | null>(null);
  const [visual, setVisual] = useState({ index: activeIndex, progress: 1, entering: true });
  useEffect(() => {
    if (activeIndex === currentIndex.current) return;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const outgoing = currentIndex.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const exitMs = reduced ? 45 : 110;
    const enterMs = reduced ? 75 : 240;
    const started = performance.now();
    const tick = (now: number) => {
      const elapsed = now - started;
      if (elapsed < exitMs) {
        setVisual({ index: outgoing, progress: 1 - standardCustomerEasing(elapsed / exitMs), entering: false });
        frame.current = requestAnimationFrame(tick);
      } else if (elapsed < exitMs + enterMs) {
        setVisual({ index: activeIndex, progress: standardCustomerEasing((elapsed - exitMs) / enterMs), entering: true });
        frame.current = requestAnimationFrame(tick);
      } else {
        currentIndex.current = activeIndex;
        setVisual({ index: activeIndex, progress: 1, entering: true });
        frame.current = null;
      }
    };
    frame.current = requestAnimationFrame(tick);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [activeIndex]);
  return visual;
}

function BottomNav({ route, go, onReselect }: { route: Route; go: Go; onReselect: () => void }) {
  const { cartCount } = useCommerce();
  const active = route.tab;
  const navRef = useRef<HTMLElement | null>(null);
  const [width, setWidth] = useState(375.43);
  const activeIndex = navItems.findIndex((item) => item.id === active);
  const visual = useSequentialSelection(activeIndex);
  useEffect(() => {
    const element = navRef.current;
    if (!element) return;
    const update = () => setWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const path = useMemo(() => buildUnifiedBarPath(width, visual.index, visual.progress), [width, visual.index, visual.progress]);
  const contentWidth = Math.max(1, width - 16);
  const coreX = 8 + contentWidth * (visual.index + 0.5) / 6;
  return (
    <nav ref={navRef} className="bottom-nav" aria-label="Müşteri alt navigasyonu" data-testid="customer-bottom-nav" data-surface-model="single-svg-path" style={{ "--core-x": `${coreX}px`, "--bubble-progress": visual.progress, "--bubble-min-scale": visual.entering ? 0.78 : 0.82 } as CSSProperties}>
      <svg className="bottom-nav-surface" viewBox={`0 0 ${width + 12} 84`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="v4-nav-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity=".96" />
            <stop offset=".48" stopColor="#f8fafc" stopOpacity=".98" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="v4-nav-tone" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#e8f0f7" stopOpacity=".30" />
            <stop offset=".52" stopColor="#ffffff" stopOpacity=".08" />
            <stop offset="1" stopColor="#fff0e6" stopOpacity=".24" />
          </linearGradient>
          <filter id="v4-nav-shadow" x="-20%" y="-35%" width="140%" height="190%">
            <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0f2c4e" floodOpacity=".13" />
          </filter>
        </defs>
        <path className="nav-surface-shadow" d={path} />
        <path className="nav-surface-fill" d={path} />
        <path className="nav-surface-tone" d={path} />
        <path className="nav-surface-stroke" d={path} />
      </svg>
      <span className="selection-core" aria-hidden="true" />
      {navItems.map((item, index) => (
        <button
          key={item.id}
          className={`nav-item${visual.index === index && visual.progress > 0.02 ? " selected" : ""}`}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => route.cal === item.cal && route.tab === item.id && route.view === "" ? onReselect() : go(item.cal, item.id)}
        >
          <span className="nav-icon"><img src={`${A}/official/nav/ic_customer_${item.asset}${visual.index === index && visual.progress > 0.02 ? "_filled" : ""}.svg`} alt="" />{item.id === "cart" && cartCount > 0 && <b className="cart-badge">{cartCount}</b>}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function BrandLockup() {
  return <div className="brand-lockup"><img src={LOGO} alt="NovaStore resmi logosu" /><strong>NovaStore</strong></div>;
}

function LoginScreen({ go, view }: { go: Go; view: ViewId }) {
  const [remember, setRemember] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(true);
  const authView = view === "forgot" || view === "register" ? view : "login";
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (authView === "register" && !termsAccepted) return;
    setSubmitted(true);
    if (authView === "login") window.setTimeout(() => go("CAL-10", "account"), 180);
  };
  return (
    <form className="login-layout" data-auth-view={authView} onSubmit={submit}>
      <section className="login-intro"><BrandLockup /><h2>{authView === "forgot" ? "Hesabına yeniden eriş." : authView === "register" ? "NovaStore’a katıl." : "NovaStore hesabına giriş yap."}</h2></section>
      <section className="auth-card">
        {authView === "register" && <label>Ad Soyad<KeyboardInput name="name" placeholder="Adını ve soyadını yaz" required /></label>}
        <label>E-posta veya telefon numarası<KeyboardInput name="identifier" placeholder="ornek@eposta.com veya +90 5..." required /></label>
        {authView !== "forgot" && <label>Şifre<span className="password-field"><KeyboardInput name="password" type={passwordVisible ? "text" : "password"} placeholder="Şifreni gir" required /><button type="button" className="password-toggle" aria-label={passwordVisible ? "Şifreyi gizle" : "Şifreyi göster"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible(!passwordVisible)}><EyeOpenIcon /></button></span></label>}
        {authView === "login" && <div className="auth-options">
          <button type="button" className={`check-control${remember ? " checked" : ""}`} onClick={() => setRemember(!remember)} aria-pressed={remember}><span>{remember && <CheckIcon />}</span>Beni hatırla</button>
          <button type="button" className="text-action" onClick={() => go("CAL-01", "account", "forgot")}>Şifremi unuttum</button>
        </div>}
        {authView === "register" && <button type="button" className={`check-control${termsAccepted ? " checked" : ""}`} aria-pressed={termsAccepted} onClick={() => setTermsAccepted(!termsAccepted)}><span>{termsAccepted && <CheckIcon />}</span>Kullanım koşullarını kabul ediyorum</button>}
      </section>
      <button className="primary orange" type="submit" disabled={authView === "register" && !termsAccepted}>{authView === "forgot" ? "Sıfırlama Bağlantısı Gönder" : authView === "register" ? "Hesap Oluştur" : "Giriş Yap"}</button>
      {submitted && authView !== "login" && <p role="status" className="auth-status">İşlemin alındı. Sonraki adımlar güvenli kanaldan iletilecek.</p>}
      <p className="center-copy">{authView === "register" ? <>Zaten hesabın var mı? <button type="button" onClick={() => go("CAL-01", "account", "login")}>Giriş Yap</button></> : <>Hesabın yok mu? <button type="button" onClick={() => go("CAL-01", "account", "register")}>Kayıt Ol</button></>}</p>
      <footer className="legal-links">Gizlilik Politikası <b>•</b> Kullanım Koşulları</footer>
    </form>
  );
}

const categoryCards = [
  ["Elektronik", "cat-electronics.png"], ["Moda", "cat-fashion.png"], ["Ev & Yaşam", "cat-living.png"],
  ["Kozmetik", "cat-beauty.png"], ["Spor", "cat-sport.png"], ["Süpermarket", "cat-market.png"],
];

type CategoryId = "electronics" | "fashion" | "living" | "beauty" | "sport" | "market";
type CategoryItem = { id: string; label: string; image: string; embeddedCopy?: boolean };
type CategoryDefinition = { id: CategoryId; label: string; items: CategoryItem[] };

const CATEGORY_CATALOG: CategoryDefinition[] = [
  { id: "electronics", label: "Elektronik", items: [
    { id: "technology", label: "Teknoloji Dünyası", image: "sub-tech.png", embeddedCopy: true },
    { id: "computer", label: "Bilgisayar & Tablet", image: "sub-laptop.png", embeddedCopy: true },
    { id: "phone", label: "Telefon", image: "sub-phone.png", embeddedCopy: true },
    { id: "tv-sound", label: "TV & Ses", image: "sub-tv.png", embeddedCopy: true },
    { id: "wearable", label: "Giyilebilir Teknoloji", image: "sub-wearable.png", embeddedCopy: true },
    { id: "gaming", label: "Oyun & Konsol", image: "sub-game.png", embeddedCopy: true },
    { id: "appliances", label: "Küçük Ev Aletleri", image: "sub-appliance.png", embeddedCopy: true },
  ] },
  { id: "fashion", label: "Moda", items: [
    { id: "new-season", label: "Yeni Sezon", image: "cat-fashion.png" },
    { id: "women", label: "Kadın Giyim", image: "cat-fashion.png" },
    { id: "men", label: "Erkek Giyim", image: "cat-fashion.png" },
    { id: "shoes", label: "Ayakkabı", image: "cat-fashion.png" },
    { id: "bags", label: "Çanta & Aksesuar", image: "product-luggage-clean.png" },
    { id: "travel", label: "Valiz & Seyahat", image: "product-luggage-clean.png" },
  ] },
  { id: "living", label: "Ev & Yaşam", items: [
    { id: "renew-home", label: "Evini Yenile", image: "cat-living.png" },
    { id: "furniture", label: "Mobilya", image: "cat-living.png" },
    { id: "decoration", label: "Dekorasyon", image: "home-hero.png" },
    { id: "kitchen", label: "Mutfak", image: "product-coffee-clean.png" },
    { id: "home-textile", label: "Ev Tekstili", image: "cat-living.png" },
    { id: "small-appliance", label: "Küçük Ev Aletleri", image: "product-coffee-clean.png" },
  ] },
  { id: "beauty", label: "Kozmetik", items: [
    { id: "beauty-world", label: "Güzellik Dünyası", image: "cat-beauty.png" },
    { id: "skin-care", label: "Cilt Bakımı", image: "cat-beauty.png" },
    { id: "makeup", label: "Makyaj", image: "cat-beauty.png" },
    { id: "perfume", label: "Parfüm", image: "cat-beauty.png" },
    { id: "hair-care", label: "Saç Bakımı", image: "cat-beauty.png" },
    { id: "personal-care", label: "Kişisel Bakım", image: "cat-beauty.png" },
  ] },
  { id: "sport", label: "Spor", items: [
    { id: "active-life", label: "Aktif Yaşam", image: "cat-sport.png" },
    { id: "fitness", label: "Fitness", image: "cat-sport.png" },
    { id: "outdoor", label: "Outdoor", image: "cat-sport.png" },
    { id: "team-sports", label: "Takım Sporları", image: "cat-sport.png" },
    { id: "sportswear", label: "Spor Giyim", image: "cat-fashion.png" },
    { id: "nutrition", label: "Sporcu Besinleri", image: "cat-market.png" },
  ] },
  { id: "market", label: "Süpermarket", items: [
    { id: "weekly", label: "Haftanın Fırsatları", image: "cat-market.png" },
    { id: "food", label: "Gıda", image: "cat-market.png" },
    { id: "beverage", label: "İçecek", image: "cat-market.png" },
    { id: "breakfast", label: "Kahvaltılık", image: "cat-market.png" },
    { id: "cleaning", label: "Temizlik", image: "cat-market.png" },
    { id: "pet", label: "Evcil Hayvan", image: "cat-market.png" },
  ] },
];

function CategoryIcon({ id }: { id: CategoryId }) {
  if (id === "electronics") return <MonitorIcon weight="regular" />;
  if (id === "fashion") return <TShirtIcon weight="regular" />;
  if (id === "living") return <ArmchairIcon weight="regular" />;
  if (id === "beauty") return <DropIcon weight="regular" />;
  if (id === "sport") return <BarbellIcon weight="regular" />;
  return <BasketIcon weight="regular" />;
}

function HomeScreen({ go }: { go: Go }) {
  const { selectCatalog } = useCommerce();
  return (
    <div className="root-layout home-layout">
      <section className="home-hero"><img src={`${A}/extracts/home-hero.png`} alt="Ev yaşam koleksiyonu" /><div className="carousel-dots"><i /><i /><i /></div></section>
      <section className="category-mosaic" aria-label="Kategoriler">
        {categoryCards.map(([name, image], index) => (
          <button key={name} className={`category-tile tile-${index + 1}`} onClick={() => { selectCatalog(name); go("CAL-03"); }}>
            <img src={`${A}/extracts/${image}`} alt="" /><span>{name}{index === 0 && <small>En yeni teknoloji ürünleri</small>}</span><b><ArrowRightIcon /></b>
          </button>
        ))}
      </section>
      <SectionTitle title="Bugünün Seçimleri" action="Tümünü Gör" onClick={() => go("CAL-04")} />
      <div className="product-grid home-products">
        {products.map((product, index) => <ProductCard key={`home-${product.id}`} {...product} testId={`home-product-card-${index}`} onClick={() => go("CAL-06")} />)}
      </div>
    </div>
  );
}

function SearchScreen({ go, query, setQuery, panelOpen, setPanelOpen }: { go: Go; query: string; setQuery: (value: string) => void; panelOpen: boolean; setPanelOpen: (open: boolean) => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [history, setHistory] = useState(["kablosuz kulaklık", "kahve makinesi", "kabin boy valiz"]);
  const normalized = query.trim().toLocaleLowerCase("tr-TR");
  const results = normalized ? products.filter((product) => `${product.name} ${product.store}`.toLocaleLowerCase("tr-TR").includes(normalized)) : [];
  const choose = (value: string) => {
    setQuery(value);
    setHistory((current) => [value, ...current.filter((item) => item !== value)].slice(0, 6));
    setPanelOpen(false);
  };
  useEffect(() => {
    const scroll = rootRef.current?.closest<HTMLElement>(".mobile-scroll");
    if (!scroll) return;
    const onScroll = () => { if (scroll.scrollTop >= 8) setPanelOpen(false); };
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => scroll.removeEventListener("scroll", onScroll);
  }, [setPanelOpen]);
  return (
    <div className="root-layout search-layout" data-testid="search-screen" ref={rootRef}>
      <div className="search-panel-anchor" aria-live="polite">
        {panelOpen && <section className="search-suggestion-panel" data-testid="search-suggestion-panel" aria-label="Arama önerileri ve geçmişi">
          <header><h1>Son aramalar</h1><button type="button" onClick={() => setHistory([])}>Tümünü temizle</button></header>
          <div className="search-history-list">
            {history.length ? history.map((item) => <div key={item}><button type="button" className="search-history-choice" onClick={() => choose(item)}><ClockIcon /><span>{item}</span></button><button type="button" className="search-history-delete" aria-label={`${item} aramasını sil`} onClick={() => setHistory((current) => current.filter((value) => value !== item))}><Cross1Icon /></button></div>) : <p>Henüz arama geçmişin yok.</p>}
          </div>
          <div className="search-suggestions"><h2>Önerilen aramalar</h2><div>{["Bluetooth kulaklık", "Akıllı saat", "Kahve makinesi", "Valiz"].map((item) => <button type="button" key={item} onClick={() => choose(item)}>{item}</button>)}</div></div>
        </section>}
      </div>
      {normalized ? (
        <section className="search-results">
          <div className="search-summary"><div><h1>Arama sonuçları</h1><p>“{query}” için {results.length} ürün</p></div><button type="button" onClick={() => go("CAL-05", "home")}>Filtrele <MixerHorizontalIcon /></button></div>
          {results.length ? <div className="product-grid">{results.map((product) => <ProductCard key={`search-${product.id}`} {...product} onClick={() => go("CAL-06")} />)}</div> : <div className="empty-state"><MagnifyingGlassIcon /><h2>Sonuç bulunamadı</h2><p>Başka bir ürün, kategori veya marka deneyebilirsin.</p></div>}
        </section>
      ) : <section className="search-discovery"><h2>Senin için seçtiklerimiz</h2><div className="product-grid">{products.slice(0, 6).map((product) => <ProductCard key={`discover-${product.id}`} {...product} onClick={() => go("CAL-06")} />)}</div></section>}
    </div>
  );
}

function SectionTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{action && <button onClick={onClick}>{action} <ArrowRightIcon /></button>}</div>;
}

function CategoriesScreen({ go }: { go: Go }) {
  const { catalogSelection, selectCatalog } = useCommerce();
  const selected = CATEGORY_CATALOG.find((category) => category.label === catalogSelection.category) ?? CATEGORY_CATALOG[0];
  const chooseCategory = (category: CategoryDefinition) => selectCatalog(category.label);
  const openCategory = (subcategory = selected.label) => {
    selectCatalog(selected.label, subcategory);
    go("CAL-04");
  };
  return (
    <div className="root-layout categories-layout">
      <div className="page-heading"><h1>Kategoriler</h1><p>Aradığını kolayca bul</p></div>
      <div className="category-browser">
        <aside className="category-rail" role="tablist" aria-label="Ana kategoriler">
          {CATEGORY_CATALOG.map((category) => <button role="tab" className={selected.id === category.id ? "active" : ""} aria-selected={selected.id === category.id} aria-controls="subcategory-panel" data-category-id={category.id} onClick={() => chooseCategory(category)} key={category.id}><CategoryIcon id={category.id} /><span>{category.label}</span></button>)}
        </aside>
        <section className="subcategory-panel" id="subcategory-panel" role="tabpanel" data-category-id={selected.id} data-changing="true" key={selected.id}>
          <div className="subcategory-heading"><h2>{selected.label}</h2><button onClick={() => openCategory()}>Tümünü Gör <ArrowRightIcon /></button></div>
          <div className="subcategory-grid">
            {selected.items.map((item, index) => <button key={item.id} className={index === 0 ? "featured" : ""} aria-label={item.label} data-category-id={selected.id} data-subcategory-id={item.id} data-embedded-copy={item.embeddedCopy ? "true" : "false"} onClick={() => openCategory(item.label)}><img src={`${A}/extracts/${item.image}`} alt="" />{!item.embeddedCopy && <><span>{item.label}</span><b><ArrowRightIcon /></b></>}</button>)}
          </div>
        </section>
      </div>
    </div>
  );
}

const products: Product[] = [
  { id: "pulse-anc", name: "Nova Pulse ANC Kulaklık", store: "Nova Audio Mağazası", price: "₺4.299", old: "₺5.199", image: PRODUCT_HERO, images: PRODUCT_GALLERY, badge: "%17" },
  { id: "sound-n1", name: "NovaSound N1 Kulaklık", store: "NovaSound", price: "₺1.299", old: "₺1.499", image: `${A}/extracts/order-headphones.png`, badge: "%13" },
  { id: "travel-case", name: "Nova Seyahat Valizi", store: "Nova Travel", price: "₺3.249", old: "₺3.799", image: `${A}/extracts/product-luggage-clean.png`, badge: "%14" },
  { id: "barista-pro", name: "Nova Barista Pro", store: "Brewista Store", price: "₺7.899", old: "₺8.499", image: `${A}/extracts/product-coffee-clean.png`, badge: "%7" },
  { id: "pulse-studio", name: "Nova Pulse Studio", store: "Nova Audio Mağazası", price: "₺3.699", old: "₺4.299", image: PRODUCT_HERO, badge: "%14" },
  { id: "sound-air-2", name: "NovaSound Air 2", store: "NovaSound", price: "₺2.149", old: "₺2.499", image: `${A}/extracts/order-headphones.png`, badge: "%14" },
  { id: "cabin-light", name: "Nova Cabin Light", store: "Nova Travel", price: "₺2.849", old: "₺3.299", image: `${A}/extracts/product-luggage-clean.png`, badge: "%13" },
  { id: "barista-mini", name: "Nova Barista Mini", store: "Brewista Store", price: "₺5.499", old: "₺5.999", image: `${A}/extracts/product-coffee-clean.png`, badge: "%8" },
  { id: "pulse-office", name: "Nova Pulse Office", store: "Nova Audio Mağazası", price: "₺3.999", old: "₺4.699", image: PRODUCT_HERO, badge: "%15" },
  { id: "sound-move", name: "NovaSound Move", store: "NovaSound", price: "₺1.899", old: "₺2.199", image: `${A}/extracts/order-headphones.png`, badge: "%14" },
  { id: "travel-pro", name: "Nova Travel Pro", store: "Nova Travel", price: "₺4.149", old: "₺4.699", image: `${A}/extracts/product-luggage-clean.png`, badge: "%12" },
  { id: "barista-touch", name: "Nova Barista Touch", store: "Brewista Store", price: "₺8.299", old: "₺8.999", image: `${A}/extracts/product-coffee-clean.png`, badge: "%8" },
];

function formatCatalogPrice(value: number) {
  return `₺${value.toLocaleString("tr-TR", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

type ProductCardPriceFit = "regular" | "compact" | "tight";

function productCardPriceFit(formattedPrice: string): ProductCardPriceFit {
  const digitCount = formattedPrice.replace(/\D/g, "").length;
  if (digitCount >= 10) return "tight";
  if (digitCount >= 8) return "compact";
  return "regular";
}

function productsFromPublicProjection(projection: CustomerPublicStoreProjection): Product[] {
  return projection.products.map((source) => {
    const originals = orderedCustomerOriginalMediaUrls(source);
    const cardMedia = orderedCustomerCardMedia(source);
    const image = originals[0] ?? source.imageUrl ?? LOGO;
    const discount = source.oldPrice && source.oldPrice > source.price
      ? Math.max(1, Math.round((1 - source.price / source.oldPrice) * 100))
      : 0;
    return {
      id: source.id,
      name: source.name,
      store: projection.store.name,
      price: formatCatalogPrice(source.price),
      old: source.oldPrice === null ? undefined : formatCatalogPrice(source.oldPrice),
      image,
      images: originals.length ? originals : [image],
      badge: discount ? `%${discount}` : undefined,
      rating: source.averageRating,
      reviewCount: source.reviewCount,
      stock: source.stock,
      amount: source.price,
      oldAmount: source.oldPrice ?? undefined,
      storeSlug: projection.store.slug,
      storeLogoUrl: projection.store.logoUrl,
      storeRating: projection.store.rating,
      shippingSummary: projection.store.shippingSummary,
      returnSummary: projection.store.returnSummary,
      cardMedia,
      isPurchasable: projection.store.status === "open" && source.isPurchasable,
      isPublicProjection: true,
    };
  });
}

const CATEGORY_PRODUCT_IDS: Record<string, string[]> = {
  "Elektronik": ["pulse-anc", "sound-n1", "travel-case", "barista-pro", "pulse-studio", "sound-air-2", "cabin-light", "barista-mini", "pulse-office", "sound-move", "travel-pro", "barista-touch"],
  "Moda": ["travel-case", "cabin-light", "travel-pro", "pulse-office"],
  "Ev & Yaşam": ["barista-pro", "barista-mini", "barista-touch", "travel-case"],
  "Kozmetik": ["barista-mini", "pulse-studio", "cabin-light", "sound-air-2"],
  "Spor": ["sound-move", "pulse-office", "travel-pro", "cabin-light"],
  "Süpermarket": ["barista-pro", "barista-mini", "barista-touch", "travel-case"],
};

function productAmount(product: Product) {
  return product.amount ?? Number(product.price.replace(/\D/g, ""));
}

function productBrand(product: Product) {
  if (product.id.startsWith("pulse")) return "Nova Audio";
  if (product.id.startsWith("sound")) return "SoundLab";
  return "TeknoBeat";
}

function productFeatures(product: Product) {
  const features = new Set<string>();
  if (product.id.startsWith("pulse")) features.add("Aktif Gürültü Engelleme");
  if (/^(pulse|sound)/.test(product.id)) features.add("Bluetooth 5.3");
  if (/pulse|travel-pro|barista-touch/.test(product.id)) features.add("40+ saat pil");
  return features;
}

function catalogProducts(category: string) {
  const ids = CATEGORY_PRODUCT_IDS[category] ?? CATEGORY_PRODUCT_IDS.Elektronik;
  return products.filter((product) => ids.includes(product.id));
}

function filteredProducts(source: Product[], filters: Omit<CatalogFilters, "applied"> | CatalogFilters) {
  return source.filter((product) => {
    if (filters.brands.length && !filters.brands.includes(productBrand(product))) return false;
    if (filters.features.length && !filters.features.every((feature) => productFeatures(product).has(feature))) return false;
    if (filters.inStock && product.id === "sound-move") return false;
    const amount = productAmount(product);
    if (filters.minPrice !== null && amount < filters.minPrice) return false;
    if (filters.maxPrice !== null && amount > filters.maxPrice) return false;
    return true;
  });
}

const PRODUCT_SORT_META: Record<string, { bestSelling: number; newest: number; rating: number; reviews: number }> = {
  "pulse-anc": { bestSelling: 98, newest: 91, rating: 4.8, reviews: 326 },
  "sound-n1": { bestSelling: 93, newest: 74, rating: 4.8, reviews: 326 },
  "travel-case": { bestSelling: 89, newest: 80, rating: 4.7, reviews: 212 },
  "barista-pro": { bestSelling: 95, newest: 84, rating: 4.9, reviews: 418 },
  "pulse-studio": { bestSelling: 86, newest: 96, rating: 4.6, reviews: 189 },
  "sound-air-2": { bestSelling: 82, newest: 93, rating: 4.7, reviews: 154 },
  "cabin-light": { bestSelling: 78, newest: 88, rating: 4.5, reviews: 97 },
  "barista-mini": { bestSelling: 91, newest: 77, rating: 4.8, reviews: 278 },
  "pulse-office": { bestSelling: 83, newest: 99, rating: 4.9, reviews: 133 },
  "sound-move": { bestSelling: 74, newest: 69, rating: 4.4, reviews: 81 },
  "travel-pro": { bestSelling: 80, newest: 90, rating: 4.6, reviews: 122 },
  "barista-touch": { bestSelling: 88, newest: 97, rating: 4.9, reviews: 301 },
};

const SORT_OPTIONS: Array<{ key: CatalogSortKey; label: string }> = [
  { key: "featured", label: "Önerilen / Öne çıkan" },
  { key: "best-selling", label: "Çok satanlar" },
  { key: "newest", label: "En yeniler" },
  { key: "price-asc", label: "Fiyat: düşükten yükseğe" },
  { key: "price-desc", label: "Fiyat: yüksekten düşüğe" },
  { key: "rating", label: "En yüksek puan" },
  { key: "review-count", label: "En çok değerlendirilen" },
  { key: "discount", label: "İndirim oranı" },
];

function sortProducts(source: Product[], sort: CatalogSortKey) {
  if (sort === "featured") return source;
  return [...source].sort((a, b) => {
    const metaA = PRODUCT_SORT_META[a.id] ?? { bestSelling: a.reviewCount ?? 0, newest: 0, rating: a.rating ?? 0, reviews: a.reviewCount ?? 0 };
    const metaB = PRODUCT_SORT_META[b.id] ?? { bestSelling: b.reviewCount ?? 0, newest: 0, rating: b.rating ?? 0, reviews: b.reviewCount ?? 0 };
    const primary = sort === "price-asc" ? productAmount(a) - productAmount(b)
      : sort === "price-desc" ? productAmount(b) - productAmount(a)
        : sort === "best-selling" ? metaB.bestSelling - metaA.bestSelling
          : sort === "newest" ? metaB.newest - metaA.newest
            : sort === "rating" ? metaB.rating - metaA.rating
              : sort === "review-count" ? metaB.reviews - metaA.reviews
                : Number(b.badge?.replace("%", "") || 0) - Number(a.badge?.replace("%", "") || 0);
    return primary || a.id.localeCompare(b.id, "tr-TR");
  });
}

function formatMoney(value: number) {
  return `₺${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PlpScreen({ go, favoritesOnly = false }: { go: Go; favoritesOnly?: boolean }) {
  const keyboard = useKeyboard();
  const { favoriteIds, catalogSelection, catalogFilters, catalogSort, setCatalogSort } = useCommerce();
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedChip, setSelectedChip] = useState("Tümü");
  const scoped = catalogProducts(catalogSelection.category);
  const applied = catalogFilters.applied ? filteredProducts(scoped, catalogFilters) : scoped;
  const chipFiltered = selectedChip === "Tümü" ? applied : selectedChip === "ANC" ? applied.filter((product) => productFeatures(product).has("Aktif Gürültü Engelleme")) : applied.filter((product) => productFeatures(product).has("Bluetooth 5.3"));
  const sorted = sortProducts(chipFiltered, catalogSort);
  const visibleProducts = favoritesOnly ? products.filter((product) => favoriteIds.has(product.id)) : sorted;
  const listingTitle = catalogSelection.subcategory || catalogSelection.category;
  const activeFilterCount = catalogFilters.applied ? catalogFilters.brands.length + catalogFilters.features.length + Number(catalogFilters.inStock) + Number(catalogFilters.minPrice !== null || catalogFilters.maxPrice !== null) : 0;
  const sortLabel = SORT_OPTIONS.find((option) => option.key === catalogSort)?.label ?? SORT_OPTIONS[0].label;
  return (
    <>
      <div className="root-layout plp-layout">
        {!favoritesOnly && <><div className="breadcrumb">{catalogSelection.category}{catalogSelection.subcategory && catalogSelection.subcategory !== catalogSelection.category && <><CaretRightIcon /> {catalogSelection.subcategory}</>}</div><div className="plp-heading"><div><h1>{listingTitle}</h1><p>{visibleProducts.length} örnek ürün</p></div><div className="plp-actions"><button type="button" aria-haspopup="dialog" onClick={() => { keyboard.hide(); setSortOpen(true); }}><PinLeftIcon /> Sırala: {sortLabel}</button><button onClick={() => go("CAL-05")}><MixerHorizontalIcon /> Filtrele {activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button></div></div><div className="chip-row">{["Tümü", "ANC", "Bluetooth 5.3"].map((chip) => <button className={selectedChip === chip ? "active" : ""} aria-pressed={selectedChip === chip} onClick={() => setSelectedChip(chip)} key={chip}>{chip}</button>)}</div></>}
        {favoritesOnly && <div className="favorites-heading"><h1>Favorilerim</h1><p>{visibleProducts.length} ürün kaydedildi</p></div>}
        {visibleProducts.length ? <div className="product-grid plp-products">{visibleProducts.map((product, index) => <ProductCard key={product.id} {...product} testId={`product-card-${index}`} onClick={() => go("CAL-06")} />)}</div> : <div className="empty-state favorites-empty"><PhosphorHeartIcon weight="regular" /><h2>{favoritesOnly ? "Favorilerin henüz boş" : "Bu seçimde ürün bulunamadı"}</h2><p>{favoritesOnly ? "Beğendiğin ürünlerdeki kalbe dokunarak buraya ekleyebilirsin." : "Filtreleri temizleyerek daha fazla ürün görebilirsin."}</p><button className="primary navy" type="button" onClick={() => favoritesOnly ? go("CAL-02", "home") : go("CAL-05", "home")}>{favoritesOnly ? "Ürünleri Keşfet" : "Filtreleri Düzenle"}</button></div>}
      </div>
      {!favoritesOnly && <BottomSheet open={sortOpen} onOpenChange={setSortOpen} title="Sırala" description="Ürünlerin gösterim sırasını seç">
        <div className="sort-options" role="radiogroup" aria-label="Ürün sıralaması">
          {SORT_OPTIONS.map((option) => <button type="button" role="radio" aria-checked={catalogSort === option.key} className={catalogSort === option.key ? "selected" : ""} onClick={() => { setCatalogSort(option.key); setSortOpen(false); }} key={option.key}><span>{option.label}</span><i>{catalogSort === option.key && <CheckIcon />}</i></button>)}
        </div>
      </BottomSheet>}
    </>
  );
}

const STORE_SORT_OPTIONS = SORT_OPTIONS.filter((option) => ["featured", "best-selling", "newest", "price-asc", "price-desc", "rating"].includes(option.key));

function StorefrontScreen({ go, route }: { go: Go; route: Route }) {
  const keyboard = useKeyboard();
  const { registerPublicProducts, selectProduct } = useCommerce();
  const [following, setFollowing] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"products" | "deals" | "profile">("products");
  const [sort, setSort] = useState<CatalogSortKey>("featured");
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [discountOnly, setDiscountOnly] = useState(false);
  const [highRatedOnly, setHighRatedOnly] = useState(false);
  const [projection, setProjection] = useState<CustomerPublicStoreProjection | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadRevision, setLoadRevision] = useState(0);
  const mode = route.mode ?? "customer";
  const readOnlyPreview = mode === "preview";
  const liveStore = NATIVE_SHELL || readOnlyPreview || new URLSearchParams(window.location.search).get("publicStore") === "1";
  const requestedSlug = route.storeSlug ?? DEFAULT_PUBLIC_STORE_SLUG;

  useEffect(() => {
    if (!liveStore) {
      setProjection(null);
      setLoadState("idle");
      return;
    }
    let active = true;
    setLoadState("loading");
    loadCanonicalPublicStore(requestedSlug)
      .then((value) => {
        if (!active) return;
        setProjection(value);
        setLoadState("ready");
      })
      .catch(() => {
        if (!active) return;
        setProjection(null);
        setLoadState("error");
      });
    return () => { active = false; };
  }, [liveStore, loadRevision, requestedSlug]);

  const projectedProducts = useMemo(
    () => projection ? productsFromPublicProjection(projection) : [],
    [projection],
  );
  useEffect(() => {
    if (projectedProducts.length) registerPublicProducts(projectedProducts);
  }, [projectedProducts, registerPublicProducts]);

  const storeProducts = liveStore
    ? projectedProducts
    : products.filter((product) => product.store === productDetailData.seller.name);
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const queryFiltered = storeProducts.filter((product) => !normalizedQuery || product.name.toLocaleLowerCase("tr-TR").includes(normalizedQuery));
  const filterSource = tab === "deals" || discountOnly ? queryFiltered.filter((product) => Number(product.badge?.replace("%", "") || 0) >= 15) : queryFiltered;
  const ratingFiltered = highRatedOnly ? filterSource.filter((product) => (product.rating ?? PRODUCT_SORT_META[product.id]?.rating ?? 0) >= 4.8) : filterSource;
  const visibleProducts = sortProducts(ratingFiltered, sort);
  const activeFilterCount = Number(discountOnly) + Number(highRatedOnly);
  const sortLabel = STORE_SORT_OPTIONS.find((option) => option.key === sort)?.label ?? STORE_SORT_OPTIONS[0].label;
  const tabs = [
    { id: "products" as const, label: "Tüm Ürünler" },
    { id: "deals" as const, label: "Fırsatlar" },
    { id: "profile" as const, label: "Satıcı Hakkında" },
  ];
  const storeName = projection?.store.name ?? (liveStore ? "NovaStore Mağaza" : "Nova Audio Mağazası");
  const storeDescription = projection?.store.description || (liveStore ? "Güncel public mağaza kaydı" : "Güvenilir satıcı · Hızlı gönderici");
  const storeRating = projection
    ? projection.store.rating === null ? "—" : `${(projection.store.rating * 2).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} / 10`
    : liveStore ? "—" : "9,6 / 10";
  const storeFollowers = projection
    ? projection.store.followerCount.toLocaleString("tr-TR")
    : liveStore ? "—" : following ? "18,5 bin" : "18,4 bin";
  const storeProductCount = projection?.store.productCount ?? (liveStore ? 0 : storeProducts.length);
  const storeLogo = projection?.store.logoUrl ?? LOGO;
  const storeCover = projection?.store.bannerUrl ?? (liveStore ? LOGO : PRODUCT_HERO);
  const storeSearchPrompt = projection
    ? `${storeName} içinde ara`
    : liveStore ? "Mağazada ara" : "Nova Audio mağazasında ara";
  const openProduct = (product: Product) => {
    selectProduct(product.id);
    if (product.isPublicProjection) {
      go("CAL-06", "home", "", {
        storeSlug: product.storeSlug ?? requestedSlug,
        productId: product.id,
        mode,
      });
    } else {
      go("CAL-06", "home");
    }
  };

  return (
    <>
      <div className="root-layout store-layout" data-testid="storefront-screen">
        {readOnlyPreview && <p className="preview-readonly-disclosure" data-testid="store-preview-read-only" role="status"><LockClosedIcon /> Satıcı önizlemesi · alışveriş işlemleri kapalıdır</p>}
        <section className="store-hero" aria-labelledby="store-name">
          <div className="store-cover"><img src={storeCover} alt="" /></div>
          <div className="store-profile-row">
            <img className="store-logo" src={storeLogo} alt={`${storeName} mağaza logosu`} />
            <div className="store-profile-copy"><h1 id="store-name"><span>{storeName}</span>{!projection && <SealCheckIcon weight="fill" aria-label="Doğrulanmış mağaza" />}</h1><p>{storeDescription}</p></div>
            <button type="button" className={following ? "following" : ""} aria-pressed={following} disabled={readOnlyPreview} aria-label={readOnlyPreview ? "Takip et · önizlemede kapalı" : undefined} onClick={() => setFollowing(!following)}>{following ? <><CheckIcon /> Takip ediliyor</> : <><PlusIcon /> Takip et</>}</button>
          </div>
          <dl className="store-stats"><div><dt>Mağaza puanı</dt><dd>{storeRating}</dd></div><div><dt>Takipçi</dt><dd>{storeFollowers}</dd></div><div><dt>Ürün</dt><dd>{storeProductCount}</dd></div></dl>
        </section>

        <label className="store-search-field"><MagnifyingGlassIcon /><KeyboardInput aria-label={storeSearchPrompt} placeholder={storeSearchPrompt} value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Mağaza aramasını temizle" onClick={() => setQuery("")}><Cross1Icon /></button>}</label>

        <nav className="store-tabs" role="tablist" aria-label="Mağaza bölümleri">
          {tabs.map((item) => <button type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} key={item.id}>{item.label}</button>)}
        </nav>

        {tab === "profile" ? <section className="store-about" aria-labelledby="store-about-title"><StorefrontIcon weight="duotone" /><div><h2 id="store-about-title">{storeName} hakkında</h2><p>{storeDescription}</p></div><dl><div><dt>Mağaza durumu</dt><dd>{projection?.store.status === "closed" ? "Kapalı" : "Açık"}</dd></div><div><dt>Teslimat</dt><dd>{projection?.store.shippingSummary || "Adres ve hazırlık süresine göre hesaplanır"}</dd></div><div><dt>İade</dt><dd>{projection?.store.returnSummary || "Koşullar ürün sayfasında gösterilir"}</dd></div></dl></section> : <section className="store-catalog" aria-labelledby="store-products-title">
          <header className="store-results-heading"><div><h2 id="store-products-title">{tab === "deals" ? "Fırsatlar" : "Tüm ürünler"}</h2><p>{visibleProducts.length} ürün gösteriliyor</p></div><div className="store-catalog-controls" aria-label="Mağaza liste araçları">
            <button type="button" aria-label="Filtrele" title={activeFilterCount > 0 ? `Filtrele · ${activeFilterCount} etkin` : "Filtrele"} aria-haspopup="dialog" onClick={() => { keyboard.hide(); setFilterOpen(true); }}><MixerHorizontalIcon /><span className="visually-hidden">Filtrele</span>{activeFilterCount > 0 && <b>{activeFilterCount}</b>}</button>
            <button type="button" aria-label="Sırala" title={`Sırala · ${sortLabel}`} aria-haspopup="dialog" onClick={() => { keyboard.hide(); setSortOpen(true); }}><PinLeftIcon /><span className="visually-hidden">Sırala</span></button>
          </div></header>
          <div className="store-quick-filters" aria-label="Hızlı filtreler">
            <button type="button" className={discountOnly ? "selected" : ""} aria-pressed={discountOnly} onClick={() => setDiscountOnly(!discountOnly)}>{discountOnly && <CheckIcon />} İndirimli</button>
            <button type="button" className={highRatedOnly ? "selected" : ""} aria-pressed={highRatedOnly} onClick={() => setHighRatedOnly(!highRatedOnly)}>{highRatedOnly && <CheckIcon />} 4,8★ ve üzeri</button>
            <span aria-live="polite">{sortLabel}</span>
          </div>
          {liveStore && loadState === "loading" ? <div className="store-load-state" data-testid="public-store-loading" role="status"><ReloadIcon /><h2>Mağaza yükleniyor</h2><p>Güncel public mağaza bilgileri hazırlanıyor.</p></div> : liveStore && loadState === "error" ? <div className="store-load-state error" data-testid="public-store-error" role="alert"><StorefrontIcon /><h2>Mağaza şu anda yüklenemedi</h2><p>Bağlantını kontrol edip güvenli biçimde yeniden deneyebilirsin.</p><button type="button" className="primary navy" onClick={() => setLoadRevision((value) => value + 1)}>Yeniden Dene</button></div> : visibleProducts.length ? <div className="product-grid plp-products store-products-grid">{visibleProducts.map((product, index) => <ProductCard key={product.id} {...product} readOnlyPreview={readOnlyPreview} testId={`store-product-${index}`} onClick={() => openProduct(product)} />)}</div> : <div className="store-empty"><MagnifyingGlassIcon /><h2>Bu seçimde ürün bulunamadı</h2><p>Aramayı veya filtreleri temizleyerek tüm mağaza ürünlerine dönebilirsin.</p><button type="button" className="primary navy" onClick={() => { setQuery(""); setDiscountOnly(false); setHighRatedOnly(false); setTab("products"); }}>Tüm ürünleri göster</button></div>}
        </section>}
      </div>

      <BottomSheet open={sortOpen} onOpenChange={setSortOpen} title="Mağazada sırala" description={`${storeName} ürünlerinin sırasını seç`}>
        <div className="sort-options" role="radiogroup" aria-label="Mağaza ürün sıralaması">
          {STORE_SORT_OPTIONS.map((option) => <button type="button" role="radio" aria-checked={sort === option.key} className={sort === option.key ? "selected" : ""} onClick={() => { setSort(option.key); setSortOpen(false); }} key={option.key}><span>{option.label}</span><i>{sort === option.key && <CheckIcon />}</i></button>)}
        </div>
      </BottomSheet>

      <BottomSheet open={filterOpen} onOpenChange={setFilterOpen} title="Mağazada filtrele" description="Sonuçları hızlıca daralt">
        <div className="store-filter-options" role="group" aria-label="Mağaza ürün filtreleri">
          <button type="button" role="checkbox" aria-checked={discountOnly} className={discountOnly ? "selected" : ""} onClick={() => setDiscountOnly(!discountOnly)}><span><b>İndirimli ürünler</b><small>Yüzde 15 ve üzeri indirim</small></span><i>{discountOnly && <CheckIcon />}</i></button>
          <button type="button" role="checkbox" aria-checked={highRatedOnly} className={highRatedOnly ? "selected" : ""} onClick={() => setHighRatedOnly(!highRatedOnly)}><span><b>4,8 yıldız ve üzeri</b><small>Yüksek puanlı ürünler</small></span><i>{highRatedOnly && <CheckIcon />}</i></button>
          <footer><button type="button" className="secondary" onClick={() => { setDiscountOnly(false); setHighRatedOnly(false); }}>Temizle</button><button type="button" className="primary navy" onClick={() => setFilterOpen(false)}>{visibleProducts.length} ürünü göster</button></footer>
        </div>
      </BottomSheet>
    </>
  );
}

function ProductCard({ id, name, store, price, old, image, images, badge, rating = 4.8, reviewCount = 326, cardMedia, isPurchasable = true, readOnlyPreview = false, onClick, testId }: Product & { onClick: () => void; testId?: string; readOnlyPreview?: boolean }) {
  const { favoriteIds, toggleFavorite, addToCart, selectProduct } = useCommerce();
  const favorite = favoriteIds.has(id);
  const [added, setAdded] = useState(false);
  const [cartAnnouncement, setCartAnnouncement] = useState("");
  const [activeImage, setActiveImage] = useState(0);
  const [favoriteMotion, setFavoriteMotion] = useState<"add" | "remove" | null>(null);
  const priceFit = productCardPriceFit(price);
  const oldPriceFit = old ? productCardPriceFit(old) : undefined;
  const resetTimer = useRef<number | null>(null);
  const announcementTimer = useRef<number | null>(null);
  const favoriteTimer = useRef<number | null>(null);
  const mediaAssets: readonly ProductCardAsset[] = cardMedia?.length
    ? cardMedia
    : (images?.length ? images : [image]).map((url, index) => ({ id: `${id}-local-${index}`, url, cardFraming: null }));
  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    if (announcementTimer.current !== null) window.clearTimeout(announcementTimer.current);
    if (favoriteTimer.current !== null) window.clearTimeout(favoriteTimer.current);
  }, []);
  useEffect(() => setActiveImage(0), [id]);
  const handleAdd = () => {
    if (added || readOnlyPreview || !isPurchasable) return;
    addToCart(id);
    setAdded(true);
    setCartAnnouncement(`${name} sepete eklendi`);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    if (announcementTimer.current !== null) window.clearTimeout(announcementTimer.current);
    resetTimer.current = window.setTimeout(() => setAdded(false), 950);
    announcementTimer.current = window.setTimeout(() => setCartAnnouncement(""), 2_000);
  };
  const handleFavorite = () => {
    if (readOnlyPreview) return;
    if (favoriteTimer.current !== null) window.clearTimeout(favoriteTimer.current);
    if (favorite) {
      setFavoriteMotion("remove");
      favoriteTimer.current = window.setTimeout(() => {
        toggleFavorite(id);
        setFavoriteMotion(null);
      }, 380);
      return;
    }
    setFavoriteMotion("add");
    toggleFavorite(id);
    favoriteTimer.current = window.setTimeout(() => setFavoriteMotion(null), 520);
  };
  const showMediaImage = (index: number) => setActiveImage(Math.max(0, Math.min(mediaAssets.length - 1, index)));
  const openProduct = () => {
    selectProduct(id);
    onClick();
  };
  return (
    <article className="product-card" data-testid={testId} data-product-id={id} data-card-wave="css" data-card-cutout="gray-recess" data-card-cutout-fit="equal-top-left">
      <div className="product-media">
        <Carousel paged page={activeImage} onPageChange={setActiveImage} className="product-media-carousel" contentClassName="product-media-track" ariaLabel={`${name} ürün fotoğrafları`}>
          {mediaAssets.map((asset, index) => (
            <button
              type="button"
              className="product-open-media product-media-slide"
              onClick={openProduct}
              aria-label={index === activeImage ? `${name} detayını aç` : `${name} ${index + 1}. ürün fotoğrafı`}
              tabIndex={index === activeImage ? 0 : -1}
              key={`${id}-media-${asset.id}`}
            >
              <img
                src={asset.url}
                alt={index === 0 ? name : `${name} · Görsel ${index + 1}`}
                draggable="false"
                data-card-framing={asset.cardFraming ? "applied" : "none"}
                data-card-focal-x={asset.cardFraming?.focalX}
                data-card-focal-y={asset.cardFraming?.focalY}
                data-card-zoom={asset.cardFraming?.zoom}
                style={asset.cardFraming ? {
                  objectPosition: `${asset.cardFraming.focalX * 100}% ${asset.cardFraming.focalY * 100}%`,
                  transform: `scale(${asset.cardFraming.zoom})`,
                  transformOrigin: `${asset.cardFraming.focalX * 100}% ${asset.cardFraming.focalY * 100}%`,
                } : undefined}
              />
            </button>
          ))}
        </Carousel>
        {mediaAssets.length > 1 && (
          <>
            <div className="product-gallery-arrows" role="group" aria-label={`${name} görsel geçişleri`}>
              <button type="button" className="previous" aria-label="Önceki ürün görseli" disabled={activeImage === 0} onClick={() => showMediaImage(Math.max(0, activeImage - 1))}><CaretRightIcon /></button>
              <button type="button" className="next" aria-label="Sonraki ürün görseli" disabled={activeImage === mediaAssets.length - 1} onClick={() => showMediaImage(Math.min(mediaAssets.length - 1, activeImage + 1))}><CaretRightIcon /></button>
            </div>
            <div className="product-media-position" role="group" aria-label={`${name} görsel seçici`}>
              {mediaAssets.map((asset, index) => <button type="button" className={index === activeImage ? "active" : ""} aria-label={`${index + 1}. görseli göster`} aria-pressed={index === activeImage} onClick={() => showMediaImage(index)} key={`${id}-position-${asset.id}`} />)}
            </div>
          </>
        )}
        <span className="visually-hidden" role="status" aria-live="polite">Görsel {activeImage + 1} / {mediaAssets.length}</span>
        {badge && <b className="discount-badge"><span>{badge}</span></b>}
        <IconButton
          label={favorite ? "Favoriden çıkar" : "Favoriye ekle"}
          pressed={favorite}
          disabled={readOnlyPreview}
          onClick={handleFavorite}
          className={`${favorite ? "favorite-active " : ""}${favoriteMotion ? `favorite-motion-${favoriteMotion}` : ""}`.trim()}
        >
          <PhosphorHeartIcon weight={favorite ? "fill" : "regular"} />
        </IconButton>
      </div>
      <div className="product-copy"><span className="cart-cutout-shadow" aria-hidden="true"><i /></span><span className="bestseller"><img src={`${A}/extracts/bestseller-flame-source.png`} alt="" />Çok Satan</span><small>{store}</small><button type="button" className="product-title-action" onClick={openProduct}>{name}</button><div className="rating"><span className="rating-stars"><StarFilledIcon /><StarFilledIcon /><StarFilledIcon /><StarFilledIcon /><StarFilledIcon /></span><b>{rating.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</b><span>({reviewCount})</span></div><hr /><div className="price" data-price-fit={priceFit} data-old-price-fit={oldPriceFit}><strong>{price}</strong>{old && <del>{old}</del>}</div><button type="button" className={`add-cart${added ? " feedback" : ""}`} data-state={added ? "confirmed" : "idle"} aria-label={readOnlyPreview ? `${name} sepete ekle · önizlemede kapalı` : added ? `${name} sepete eklendi` : !isPurchasable ? `${name} şu anda satın alınamaz` : `${name} sepete ekle`} aria-pressed={added} disabled={readOnlyPreview || !isPurchasable || added} aria-disabled={readOnlyPreview || !isPurchasable || added} onClick={handleAdd}><span className="add-cart-visual"><span className="cart-idle-glyph"><ShoppingCartSimpleIcon className="cart-resting-icon" weight="regular" /><PlusIcon className="cart-state-mark" /></span><CheckIcon className="cart-confirm-check" /></span></button><span className="visually-hidden" role="status" aria-live="polite">{cartAnnouncement}</span></div>
    </article>
  );
}

function FilterScreen({ go }: { go: Go }) {
  const { catalogSelection, catalogFilters, applyCatalogFilters } = useCommerce();
  const initialDraft = catalogFilters;
  const [brands, setBrands] = useState(initialDraft.brands);
  const [stock, setStock] = useState(initialDraft.inStock);
  const [minPriceDraft, setMinPriceDraft] = useState(initialDraft.minPrice?.toString() ?? "");
  const [maxPriceDraft, setMaxPriceDraft] = useState(initialDraft.maxPrice?.toString() ?? "");
  const [features, setFeatures] = useState(initialDraft.features);
  const toggle = (name: string) => setBrands((items) => items.includes(name) ? items.filter((x) => x !== name) : [...items, name]);
  const toggleFeature = (name: string) => setFeatures((items) => items.includes(name) ? items.filter((x) => x !== name) : [...items, name]);
  const cleanPrice = (value: string) => value.replace(/\D/g, "").slice(0, 7);
  const minPrice = minPriceDraft ? Number(minPriceDraft) : null;
  const maxPrice = maxPriceDraft ? Number(maxPriceDraft) : null;
  const priceError = minPrice !== null && maxPrice !== null && minPrice > maxPrice;
  const clearAll = () => { setBrands([]); setStock(false); setMinPriceDraft(""); setMaxPriceDraft(""); setFeatures([]); };
  const draftFilters = { brands, features, inStock: stock, minPrice, maxPrice };
  const previewCount = priceError ? 0 : filteredProducts(catalogProducts(catalogSelection.category), draftFilters).length;
  const apply = () => {
    if (priceError) return;
    applyCatalogFilters(draftFilters);
    go("CAL-04", "home");
  };
  return (
    <div className="filter-stage">
      <div className="filter-backdrop" aria-hidden="true" inert><div className="ghost-products"><ProductCard {...products[0]} onClick={() => {}} /><ProductCard {...products[1]} onClick={() => {}} /><ProductCard {...products[2]} onClick={() => {}} /><ProductCard {...products[3]} onClick={() => {}} /></div></div>
      <section className="filter-sheet" role="dialog" aria-modal="true" aria-label="Ürün filtreleri">
        <div className="sheet-handle" />
        <header><div><h1>Filtrele</h1><p>{catalogProducts(catalogSelection.category).length} ürün arasından seçim yap</p></div><IconButton label="Kapat" onClick={() => go("CAL-04")}><Cross1Icon /></IconButton></header>
        <div className="filter-columns">
          <div className="filter-group"><h2>Kategori</h2><button className="select-row" type="button" onClick={() => go("CAL-03", "categories")}>{catalogSelection.category} / {catalogSelection.subcategory} <CaretRightIcon /></button></div>
          <div className="filter-group"><h2>Fiyat aralığı</h2><div className="price-inputs"><label>En az <span><b>₺</b><KeyboardInput aria-label="En düşük fiyat" inputMode="numeric" value={minPriceDraft} aria-invalid={priceError} onChange={(event) => setMinPriceDraft(cleanPrice(event.target.value))} placeholder="0" /></span></label><label>En çok <span><b>₺</b><KeyboardInput aria-label="En yüksek fiyat" inputMode="numeric" value={maxPriceDraft} aria-invalid={priceError} onChange={(event) => setMaxPriceDraft(cleanPrice(event.target.value))} placeholder="Sınır yok" /></span></label></div>{priceError && <p className="filter-error" role="alert">En düşük fiyat, en yüksek fiyattan büyük olamaz.</p>}</div>
          <div className="filter-group"><h2>Marka</h2>{["Nova Audio", "SoundLab", "TeknoBeat"].map((name) => <button className={`check-control${brands.includes(name) ? " checked" : ""}`} aria-pressed={brands.includes(name)} key={name} onClick={() => toggle(name)}><span>{brands.includes(name) && <CheckIcon />}</span>{name}<small>{name === "Nova Audio" ? 68 : name === "SoundLab" ? 42 : 31}</small></button>)}</div>
          <div className="filter-group"><h2>Ürün özellikleri</h2><div className="chip-row wrap">{["Aktif Gürültü Engelleme", "Bluetooth 5.3", "40+ saat pil"].map((name) => <button type="button" className={features.includes(name) ? "active" : ""} aria-pressed={features.includes(name)} onClick={() => toggleFeature(name)} key={name}>{name}</button>)}</div></div>
          <div className="filter-group"><button type="button" className={`switch-row${stock ? " on" : ""}`} aria-label="Stoktakiler" aria-pressed={stock} onClick={() => setStock(!stock)}><span><strong>Yalnız stoktakiler</strong><small>Tükenen ürünleri gizle</small></span><i /></button></div>
        </div>
        <footer><button type="button" className="secondary" onClick={clearAll}>Temizle</button><button type="button" className="primary navy" disabled={priceError} onClick={apply}>{previewCount} Ürünü Göster</button></footer>
      </section>
    </div>
  );
}

const productDetailData = {
  id: "pulse-anc",
  category: "Ses & Teknoloji",
  name: "Nova Pulse ANC Kulaklık",
  price: "₺4.299",
  oldPrice: "₺5.199",
  discount: "%17",
  rating: "4,8",
  reviewCount: 326,
  gallery: PRODUCT_GALLERY,
  seller: { name: "Nova Audio Mağazası", score: "9,6", followers: "18,4 bin", invoice: "E-arşiv fatura" },
  stock: "Stokta · Son 7 ürün",
  description: "Adaptif aktif gürültü engelleme, şeffaf mod ve dengeli ses profiliyle iş, yolculuk ve günlük kullanım için tasarlanmış premium kablosuz kulaklık. Altı mikrofonlu ENC sistemi görüşmelerde çevresel gürültüyü azaltırken yumuşak kulak yastıkları uzun dinleme seanslarında konfor sağlar. Çoklu cihaz bağlantısı sayesinde bilgisayar ve telefon arasında hızlıca geçiş yapılabilir; uygulama içinden ekolayzır, dokunmatik kontrol ve ortam sesi seviyesi kişiselleştirilebilir.",
  specs: [
    ["Marka", "Nova Audio"], ["Model", "Pulse ANC"], ["Bağlantı", "Bluetooth 5.3"], ["Pil", "48 saate kadar"],
    ["Şarj", "USB-C hızlı şarj"], ["Ağırlık", "268 g"], ["Mikrofon", "6 mikrofonlu ENC"], ["Garanti", "2 yıl"],
  ],
  policies: [
    ["Garanti", "Yetkili distribütör garantili"], ["İade", "Teslimden sonra 14 gün içinde koşullara uygun iade"], ["Kutu içeriği", "Kulaklık, taşıma kılıfı, USB-C kablo ve kullanım kılavuzu"], ["Ürün kodu", "NS-PA-ANC-IVORY"],
  ],
  campaign: "Sepette ek %5 indirim — kampanya koşulları ödeme adımında gösterilir.",
};

function ProductDetailScreen({ go, route }: { go: Go; route: Route }) {
  const keyboard = useKeyboard();
  const { favoriteIds, toggleFavorite, addToCart, selectedProductId, selectProduct, publicProducts, registerPublicProducts, productReviews, productQuestions, publishReview, submitProductQuestion } = useCommerce();
  const readOnlyPreview = route.mode === "preview";
  const routedProduct = route.productId ? publicProducts[route.productId] : undefined;
  const catalogProduct = routedProduct || publicProducts[selectedProductId] || products.find((product) => product.id === selectedProductId) || products[0];
  const [remoteLoadState, setRemoteLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [remoteLoadRevision, setRemoteLoadRevision] = useState(0);

  useEffect(() => {
    if (!route.storeSlug || !route.productId || publicProducts[route.productId]) {
      setRemoteLoadState("idle");
      return;
    }
    let active = true;
    setRemoteLoadState("loading");
    loadCanonicalPublicStore(route.storeSlug)
      .then((projection) => {
        if (!active) return;
        const incoming = productsFromPublicProjection(projection);
        const target = incoming.find((product) => product.id === route.productId);
        if (!target) throw new Error("PUBLIC_PRODUCT_NOT_FOUND");
        registerPublicProducts(incoming);
        selectProduct(target.id);
        setRemoteLoadState("ready");
      })
      .catch(() => {
        if (active) setRemoteLoadState("error");
      });
    return () => { active = false; };
  }, [publicProducts, registerPublicProducts, remoteLoadRevision, route.productId, route.storeSlug, selectProduct]);

  const detail = useMemo(() => ({
    ...productDetailData,
    id: catalogProduct.id,
    category: catalogProduct.isPublicProjection ? "Ürün" : productDetailData.category,
    name: catalogProduct.name,
    price: catalogProduct.price,
    oldPrice: catalogProduct.old,
    discount: catalogProduct.badge ?? "",
    rating: (catalogProduct.rating ?? 4.8).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    reviewCount: catalogProduct.reviewCount ?? productDetailData.reviewCount,
    gallery: catalogProduct.images ?? [catalogProduct.image],
    seller: {
      ...productDetailData.seller,
      name: catalogProduct.store,
      score: catalogProduct.storeRating === null || catalogProduct.storeRating === undefined
        ? productDetailData.seller.score
        : (catalogProduct.storeRating * 2).toLocaleString("tr-TR", { maximumFractionDigits: 1 }),
    },
    stock: catalogProduct.stock === undefined
      ? productDetailData.stock
      : catalogProduct.stock > 0 ? `Stokta · ${catalogProduct.stock} ürün` : "Stokta yok",
    description: catalogProduct.isPublicProjection
      ? "Bu ürünün güncel fiyat, stok ve medya bilgileri satıcının public mağaza kaydından gösteriliyor."
      : productDetailData.description,
    specs: catalogProduct.isPublicProjection
      ? [["Ürün kodu", catalogProduct.id], ["Stok", String(catalogProduct.stock ?? 0)]]
      : productDetailData.specs,
    policies: catalogProduct.isPublicProjection
      ? [["Teslimat", catalogProduct.shippingSummary || "Adres ve hazırlık süresine göre hesaplanır"], ["İade", catalogProduct.returnSummary || "Koşullar ödeme öncesinde gösterilir"]]
      : productDetailData.policies,
    campaign: catalogProduct.isPublicProjection ? "" : productDetailData.campaign,
  }), [catalogProduct]);
  const [color, setColor] = useState("Kırık Beyaz");
  const [qty, setQty] = useState(1);
  const [gallery, setGallery] = useState(0);
  const [galleryBoundaryRevision, setGalleryBoundaryRevision] = useState(0);
  const [added, setAdded] = useState(false);
  const [shared, setShared] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [readableText, setReadableText] = useState(false);
  const [reviewsExpanded, setReviewsExpanded] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewDraft, setReviewDraft] = useState("");
  const [questionOpen, setQuestionOpen] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerZoomed, setViewerZoomed] = useState(false);
  const resetTimer = useRef<number | null>(null);
  const reviewSection = useRef<HTMLElement | null>(null);
  const questionSection = useRef<HTMLElement | null>(null);
  const favorite = favoriteIds.has(detail.id);
  const reviewsForProduct = productReviews.filter((review) => review.productId === detail.id);
  const ownReview = reviewsForProduct.find((review) => review.ownerId === CURRENT_MOCK_USER_ID);
  const canReview = !readOnlyPreview && detail.id === "pulse-anc" && !ownReview;
  const visibleQuestions = catalogProduct.isPublicProjection
    ? []
    : productQuestions.filter((question) => question.productId === detail.id && (question.status === "answered" || question.ownerId === CURRENT_MOCK_USER_ID));
  const displayedReviewCount = detail.reviewCount + reviewsForProduct.filter((review) => review.ownerId === CURRENT_MOCK_USER_ID).length;
  const recommendationProducts = catalogProduct.isPublicProjection
    ? Object.values(publicProducts).filter((product) => product.storeSlug === catalogProduct.storeSlug && product.id !== detail.id)
    : products.filter((product) => product.id !== detail.id);
  const openRecommendation = (product: Product) => {
    selectProduct(product.id);
    if (product.isPublicProjection) {
      go("CAL-06", "home", "", { storeSlug: product.storeSlug, productId: product.id, mode: route.mode });
      return;
    }
    go("CAL-06", "home");
  };

  useEffect(() => () => { if (resetTimer.current !== null) window.clearTimeout(resetTimer.current); }, []);
  useEffect(() => {
    if (!viewerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setViewerOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerOpen]);
  useEffect(() => {
    setGallery(0);
    setGalleryBoundaryRevision(0);
    setDescriptionExpanded(false);
    setReviewsExpanded(false);
    setReviewOpen(false);
    setQuestionOpen(false);
    setViewerOpen(false);
    setViewerZoomed(false);
  }, [detail.id]);

  const setBoundedGalleryPage = (page: number) => {
    const boundedPage = Math.max(0, Math.min(detail.gallery.length - 1, Math.round(page)));
    setGallery(boundedPage);
    if (page !== boundedPage) setGalleryBoundaryRevision((revision) => revision + 1);
  };
  const handleAdd = () => {
    if (readOnlyPreview || catalogProduct.isPurchasable === false) return;
    addToCart(detail.id, qty);
    setAdded(true);
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setAdded(false), 950);
  };
  const handleBuyNow = () => {
    if (readOnlyPreview || catalogProduct.isPurchasable === false) return;
    addToCart(detail.id, qty);
    go("CAL-08", "cart");
  };
  const submitReview = (event: FormEvent) => {
    event.preventDefault();
    if (readOnlyPreview || !reviewDraft.trim()) return;
    keyboard.hide();
    publishReview(detail.id, reviewRating, reviewDraft);
    setReviewDraft("");
    setReviewsExpanded(true);
    setReviewOpen(false);
  };
  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    if (readOnlyPreview) return;
    const clean = questionDraft.trim();
    if (!clean) return;
    keyboard.hide();
    submitProductQuestion(detail.id, clean);
    setQuestionDraft("");
    setQuestionOpen(false);
  };
  const openSellerQuestion = () => {
    if (readOnlyPreview) return;
    setQuestionOpen(true);
    window.requestAnimationFrame(() => questionSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  if (route.storeSlug && route.productId && !publicProducts[route.productId] && remoteLoadState === "loading") {
    return <div className="pdp-contract-load-state" data-testid="public-product-loading" role="status"><ReloadIcon /><h1>Ürün yükleniyor</h1><p>Güncel public ürün bilgileri hazırlanıyor.</p></div>;
  }
  if (route.storeSlug && route.productId && !publicProducts[route.productId] && remoteLoadState === "error") {
    return <div className="pdp-contract-load-state error" data-testid="public-product-error" role="alert"><StorefrontIcon /><h1>Ürün şu anda yüklenemedi</h1><p>Güvenli bağlantıyı yeniden deneyebilirsin.</p><button type="button" className="primary navy" onClick={() => setRemoteLoadRevision((value) => value + 1)}>Yeniden Dene</button></div>;
  }

  return (
    <>
      <header className="pdp-topbar" data-testid="app-topbar">
        <IconButton label="Geri" onClick={() => goBackOr(() => go("CAL-04", "home", "store", { storeSlug: route.storeSlug, mode: route.mode }))}><img className="repo-icon" src={`${A}/official/nav/ic_customer_caret_left.svg`} alt="" /></IconButton>
        <h1>NovaStore</h1>
        <div>
          <IconButton label="Paylaş" pressed={shared} onClick={() => {
            if (NATIVE_SHELL) {
              window.dispatchEvent(new CustomEvent("novastore:share-product", { detail: { title: detail.name } }));
            }
            setShared(true);
          }}><Share1Icon /></IconButton>
          <IconButton label={readOnlyPreview ? "Favoriye ekle · önizlemede kapalı" : favorite ? "Favoriden çıkar" : "Favoriye ekle"} pressed={favorite} disabled={readOnlyPreview} onClick={() => toggleFavorite(detail.id)} className={favorite ? "favorite-active" : ""}><PhosphorHeartIcon weight={favorite ? "fill" : "regular"} /></IconButton>
        </div>
        {shared && <span className="pdp-action-status" role="status">Paylaşım hazır</span>}
      </header>
      <MobileScroll className="cal-scroll pdp-scroll">
        <main className="cal-screen screen-cal-06 has-fixed-pdp-topbar" aria-label="CAL-06 Ürün Detayı">
          <div className="detail-layout product-detail-layout" data-testid="product-detail-screen" data-product-id={detail.id} data-product-source={catalogProduct.isPublicProjection ? "public-store" : "local-calibration"}>
            {readOnlyPreview && <p className="preview-readonly-disclosure pdp-preview-disclosure" data-testid="pdp-preview-read-only"><LockClosedIcon /> Satıcı önizlemesi · favori, sepet, ödeme, değerlendirme ve soru işlemleri kapalıdır</p>}
            <div className="pdp-grid">
              <section className="pdp-gallery">
                <div className="pdp-media-shell">
                  <Carousel key={`pdp-gallery-${detail.id}-${galleryBoundaryRevision}`} paged page={gallery} onPageChange={setBoundedGalleryPage} className="pdp-media-carousel" contentClassName="pdp-media-track" ariaLabel={`${detail.name} ürün görselleri`}>
                    {detail.gallery.map((source, index) => <button type="button" className="pdp-main-media" aria-label={`${index + 1}. görseli tam ekran aç`} onClick={() => { keyboard.hide(); setGallery(index); setViewerOpen(true); }} key={`${detail.id}-gallery-${index}`}><img src={source} alt={`${detail.name} görsel ${index + 1}`} draggable="false" /></button>)}
                  </Carousel>
                  {detail.gallery.length > 1 && <div className="pdp-gallery-arrows" role="group" aria-label="Ürün görseli geçişleri"><button type="button" aria-label="Önceki görsel" disabled={gallery === 0} onClick={() => setGallery(Math.max(0, gallery - 1))}><CaretRightIcon /></button><button type="button" aria-label="Sonraki görsel" disabled={gallery === detail.gallery.length - 1} onClick={() => setGallery(Math.min(detail.gallery.length - 1, gallery + 1))}><CaretRightIcon /></button></div>}
                  <div className="pdp-gallery-meta"><div className="gallery-dots" role="group" aria-label={`Görsel ${gallery + 1} / ${detail.gallery.length}`}>{detail.gallery.map((_, index) => <button type="button" className={gallery === index ? "active" : ""} aria-label={`${index + 1}. görseli göster`} aria-pressed={gallery === index} onClick={() => setGallery(index)} key={index} />)}</div><b>{gallery + 1} / {detail.gallery.length}</b></div>
                </div>
              </section>
              <section className="pdp-info">
                <small>{detail.category}</small><h1>{detail.name}</h1>
                <div className="rating large"><StarFilledIcon /><b>{detail.rating}</b><i /><button type="button" onClick={() => reviewSection.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>{displayedReviewCount} değerlendirme</button></div>
                <div className="price large"><strong>{detail.price}</strong>{detail.oldPrice && <del>{detail.oldPrice}</del>}{detail.discount && <span>{detail.discount}</span>}</div>
                <div className="variant"><h2>Renk</h2><div>{[{ label: "Kırık Beyaz", className: "cream" }, { label: "Gece Mavisi", className: "navy" }].map((item) => <button type="button" aria-label={item.label} aria-pressed={color === item.label} className={`${item.className}${color === item.label ? " active" : ""}`} onClick={() => setColor(item.label)} key={item.label}><i /><span>{item.label}</span></button>)}</div><small className="variant-selection">Seçim: {color} · {color === "Kırık Beyaz" ? "NS-PA-IV" : "NS-PA-NV"}</small></div>
                <section className="pdp-seller-panel" aria-labelledby="pdp-seller-title"><h2 id="pdp-seller-title"><StorefrontIcon weight="duotone" /> Satıcı Bilgisi</h2><div className="pdp-seller-identity"><img src={catalogProduct.storeLogoUrl ?? LOGO} alt="" /><div><strong>{detail.seller.name} {!catalogProduct.isPublicProjection && <SealCheckIcon weight="fill" aria-label="Doğrulanmış satıcı" />}</strong><span>{catalogProduct.isPublicProjection ? "Public mağaza kaydı" : "Güvenilir satıcı · Hızlı gönderici"}</span></div><b>{detail.seller.score}</b></div><div className="pdp-seller-actions"><button type="button" onClick={() => go("CAL-04", "home", "store", { storeSlug: catalogProduct.storeSlug ?? route.storeSlug, mode: route.mode })}>Mağazaya Git</button><button type="button" disabled={readOnlyPreview} onClick={openSellerQuestion}>Satıcıya Sor</button></div></section>
                <div className="pdp-stock"><CheckCircleIcon weight="fill" /><div><strong>{detail.stock}</strong><span>{detail.seller.invoice}</span></div></div>
                {detail.campaign && <p className="campaign-note"><b>Kampanya</b>{detail.campaign}</p>}
                <section className={`pdp-description-section${readableText ? " is-readable" : ""}`} aria-labelledby="pdp-description-title">
                  <div className="pdp-description-heading"><h2 id="pdp-description-title">Ürün açıklaması ve özellikleri</h2><button type="button" className="pdp-text-size-toggle" aria-pressed={readableText} onClick={() => setReadableText(!readableText)}><TextAaIcon /> {readableText ? "Yazıları küçült" : "Yazıları büyüt"}</button></div>
                  <button type="button" className="pdp-description-toggle" aria-expanded={descriptionExpanded} aria-controls="pdp-description-copy" onClick={() => setDescriptionExpanded(!descriptionExpanded)}>
                    <span id="pdp-description-copy" className={`pdp-description-copy${descriptionExpanded ? " expanded" : " collapsed"}`}>{detail.description}</span>
                    <strong>{descriptionExpanded ? "Daha az göster" : "Devamını gör"}</strong>
                  </button>
                  <div className="spec-grid">{detail.specs.map(([label, value]) => <span key={label}><b>{label}</b>{value}</span>)}</div>
                </section>
              </section>
            </div>
            <section className="pdp-extra-sections">
              <article className="pdp-policy-card"><h2>Ürün ve satış bilgileri</h2>{detail.policies.map(([label, value]) => <div key={label}><b>{label}</b><span>{value}</span></div>)}</article>
              <article className="pdp-review-card" ref={reviewSection}>
                <div className="pdp-review-summary"><div><h2>Değerlendirmeler</h2><strong>{detail.rating}<StarFilledIcon /></strong><span>{displayedReviewCount} doğrulanmış değerlendirme</span></div><div className="pdp-review-actions"><button type="button" onClick={() => setReviewsExpanded(!reviewsExpanded)}>{reviewsExpanded ? "Kapat" : "Tümünü Gör"} <ArrowRightIcon /></button>{canReview && <button type="button" className="secondary" onClick={() => setReviewOpen(!reviewOpen)}>Değerlendir</button>}</div></div>
                {detail.id !== "pulse-anc" && <p className="review-eligibility-note">Bu ürünü satın aldıktan sonra değerlendirebilirsin.</p>}
                <div className="review-list">{reviewsForProduct.slice(0, reviewsExpanded ? reviewsForProduct.length : 2).map((review) => <article className="review-preview" key={review.id}><span className="review-avatar" aria-hidden="true"><PersonIcon /></span><div><header><b>{review.authorMasked}</b>{review.verified && <em><CheckIcon /> Doğrulanmış alışveriş</em>}</header><span>{review.copy}</span></div></article>)}</div>
                {reviewOpen && <form className="pdp-inline-form review-form" onSubmit={submitReview}><h3>Ürünü değerlendir</h3><div className="review-stars" aria-label="Puan seç">{[1, 2, 3, 4, 5].map((value) => <button type="button" key={value} aria-label={`${value} yıldız`} aria-pressed={reviewRating === value} onClick={() => setReviewRating(value)}><StarFilledIcon /></button>)}</div><KeyboardTextarea aria-label="Değerlendirmen" value={reviewDraft} onChange={(event) => setReviewDraft(event.target.value)} placeholder="Deneyimini paylaş" /><div><button type="button" className="secondary" onClick={() => { keyboard.hide(); setReviewOpen(false); }}>Vazgeç</button><button type="submit" className="primary navy" disabled={!reviewDraft.trim()}>Gönder</button></div></form>}
              </article>
              <article className="pdp-question-card" ref={questionSection}><div className="pdp-question-summary"><div><h2>Ürün soruları</h2><p>{readOnlyPreview ? "Satıcı önizlemesinde soru gönderimi kapalıdır." : "Ürünle ilgili merak ettiğini satıcıya sor."}</p></div><button type="button" className="secondary" disabled={readOnlyPreview} onClick={() => setQuestionOpen(!questionOpen)}>Soru Sor</button></div>{questionOpen && !readOnlyPreview && <form className="pdp-inline-form" onSubmit={submitQuestion}><KeyboardTextarea aria-label="Ürün hakkında sorun" maxLength={300} value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} placeholder="Sorunu yaz" /><small>{questionDraft.length}/300</small><div><button type="button" className="secondary" onClick={() => { keyboard.hide(); setQuestionOpen(false); }}>Vazgeç</button><button type="submit" className="primary navy" disabled={!questionDraft.trim()}>Satıcıya Gönder</button></div></form>}<div className="question-thread-list">{visibleQuestions.map((question) => <article className="question-thread" data-status={question.status} key={question.id}><div className="question-block"><b>Soru · {question.authorMasked}</b><p>{question.question}</p></div>{question.status === "answered" ? <div className="answer-block"><b>Satıcı yanıtı</b><p>{question.answer}</p></div> : <small role="status"><ClockIcon /> Satıcı yanıtı bekleniyor · yalnızca sen görebilirsin</small>}</article>)}</div></article>
              <section className="recommendations"><div className="section-title"><h2>Benzer ürünler</h2><button type="button" onClick={() => go("CAL-04", "home", catalogProduct.isPublicProjection ? "store" : "", { storeSlug: catalogProduct.storeSlug, mode: route.mode })}>Tümünü Gör <ArrowRightIcon /></button></div><Carousel ariaLabel="Benzer ürünler" className="recommendation-carousel" contentClassName="recommendation-track">{recommendationProducts.slice(0, 5).map((product) => <ProductCard key={`recommend-${product.id}`} {...product} readOnlyPreview={readOnlyPreview} onClick={() => openRecommendation(product)} />)}</Carousel></section>
            </section>
          </div>
        </main>
      </MobileScroll>
      <footer className={`pdp-footer${readOnlyPreview ? " preview-readonly-footer" : ""}`} data-testid="pdp-sticky-footer">
        {readOnlyPreview ? <p data-testid="pdp-preview-read-only-bar"><LockClosedIcon /> Salt okunur satıcı önizlemesi</p> : <><div className="quantity"><button aria-label="Adedi azalt" disabled={catalogProduct.isPurchasable === false} onClick={() => setQty(Math.max(1, qty - 1))}><MinusIcon /></button><b>{qty}</b><button aria-label="Adedi artır" disabled={catalogProduct.isPurchasable === false} onClick={() => setQty(qty + 1)}><PlusIcon /></button></div>
        <button className={`pdp-add-to-cart${added ? " feedback" : ""}`} aria-label={added ? "Sepete eklendi" : catalogProduct.isPurchasable === false ? "Ürün şu anda satın alınamaz" : "Sepete Ekle"} aria-pressed={added} disabled={added || catalogProduct.isPurchasable === false} onClick={handleAdd}>{added ? <CheckIcon className="pdp-confirm-check" /> : <ShoppingCartSimpleIcon weight="bold" />}<span>Sepete Ekle</span></button>
        <button className="pdp-buy-now" disabled={catalogProduct.isPurchasable === false} onClick={handleBuyNow}>Hemen Al</button></>}
      </footer>
      {viewerOpen && <section className="pdp-image-viewer" role="dialog" aria-modal="true" aria-label={`${detail.name} görsel görüntüleyici`} data-viewer-zoomed={viewerZoomed}>
        <header><button type="button" aria-label="Görsel görüntüleyiciyi kapat" onClick={() => setViewerOpen(false)}><Cross1Icon /></button><b>{gallery + 1} / {detail.gallery.length}</b><span>1×–4× yakınlaştır</span></header>
        <Carousel key={`pdp-viewer-${detail.id}-${galleryBoundaryRevision}`} paged page={gallery} onPageChange={(page) => { setBoundedGalleryPage(page); setViewerZoomed(false); }} draggingEnabled={!viewerZoomed} className="viewer-carousel" contentClassName="viewer-track" ariaLabel="Tam ekran ürün görselleri">
          {detail.gallery.map((source, index) => <div className="viewer-slide" key={`${detail.id}-viewer-${index}`}>
            <TransformWrapper key={`${detail.id}-viewer-transform-${index}-${gallery}`} minScale={1} maxScale={4} centerOnInit centerZoomedOut disablePadding limitToBounds smooth panning={{ velocityDisabled: true }} onPanningStop={(ref: ReactZoomPanPinchRef) => { if (ref.state.scale <= 1.01) { ref.resetTransform(180, "easeOut"); setViewerZoomed(false); } }} onTransform={(ref: ReactZoomPanPinchRef) => { if (index === gallery) setViewerZoomed(ref.state.scale > 1.01); }} doubleClick={{ mode: "toggle", step: 1.8 }}>
              {({ zoomIn, zoomOut, resetTransform }) => <><div className="viewer-zoom-controls" role="group" aria-label="Yakınlaştırma kontrolleri"><button type="button" aria-label="Uzaklaştır" onClick={() => zoomOut()}><MinusIcon /></button><button type="button" aria-label="Görseli sıfırla" onClick={() => { resetTransform(180, "easeOut"); setViewerZoomed(false); }}>1×</button><button type="button" aria-label="Yakınlaştır" onClick={() => { setViewerZoomed(true); zoomIn(); }}><PlusIcon /></button></div><TransformComponent wrapperClass="viewer-transform-wrapper" contentClass="viewer-transform-content"><img src={source} alt={`${detail.name} tam ekran görsel ${index + 1}`} draggable="false" /></TransformComponent></>}
            </TransformWrapper>
          </div>)}
        </Carousel>
        {detail.gallery.length > 1 && <div className="viewer-arrows"><button type="button" aria-label="Önceki ürün görseli" disabled={gallery === 0} onClick={() => { setViewerZoomed(false); setGallery(Math.max(0, gallery - 1)); }}><CaretRightIcon /></button><button type="button" aria-label="Sonraki ürün görseli" disabled={gallery === detail.gallery.length - 1} onClick={() => { setViewerZoomed(false); setGallery(Math.min(detail.gallery.length - 1, gallery + 1)); }}><CaretRightIcon /></button></div>}
        <div className="viewer-dots">{detail.gallery.map((_, index) => <button type="button" className={gallery === index ? "active" : ""} aria-label={`${index + 1}. görsel`} aria-pressed={gallery === index} onClick={() => { setViewerZoomed(false); setGallery(index); }} key={index} />)}</div>
      </section>}
    </>
  );
}

function RecommendationCard({ product, go }: { product: (typeof products)[number]; go: Go }) {
  const { favoriteIds, toggleFavorite, addToCart, selectProduct } = useCommerce();
  const [added, setAdded] = useState(false);
  const timer = useRef<number | null>(null);
  const favorite = favoriteIds.has(product.id);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const open = () => {
    selectProduct(product.id);
    go("CAL-06", "home");
  };
  const add = () => {
    addToCart(product.id);
    setAdded(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setAdded(false), 950);
  };
  return (
    <article className="recommendation-card" data-product-id={product.id}>
      <button type="button" className="recommendation-open" onClick={open}><img src={product.image} alt={product.name} /><span>{product.store}</span><b>{product.name}</b><strong>{product.price}</strong></button>
      <div className="recommendation-actions"><button type="button" aria-label={favorite ? `${product.name} favoriden çıkar` : `${product.name} favoriye ekle`} aria-pressed={favorite} className={favorite ? "favorite-active" : ""} onClick={() => toggleFavorite(product.id)}><PhosphorHeartIcon weight={favorite ? "fill" : "regular"} /></button><button type="button" aria-label={added ? `${product.name} sepete eklendi` : `${product.name} sepete ekle`} aria-pressed={added} disabled={added} onClick={add}>{added ? <CheckIcon className="recommendation-check" /> : <ShoppingCartSimpleIcon weight="bold" />}</button></div>
    </article>
  );
}

function CartScreen({ go }: { go: Go }) {
  const { cartLines, cartCount, appliedCoupon, applyCartCoupon, changeCartQuantity, removeCartLine, publicProducts } = useCommerce();
  const [coupon, setCoupon] = useState(appliedCoupon);
  const items = cartLines.flatMap((line) => {
    const product = publicProducts[line.productId] ?? products.find((candidate) => candidate.id === line.productId);
    return product ? [{ ...line, product }] : [];
  });
  const subtotal = items.reduce((total, item) => total + productAmount(item.product) * item.quantity, 0);
  const discount = appliedCoupon ? Math.min(1500, Math.round(subtotal * .15)) : 0;
  const total = subtotal - discount;
  const couponApplied = Boolean(appliedCoupon) && coupon.trim().toLocaleUpperCase("tr-TR") === appliedCoupon;
  return (
    <div className="root-layout cart-layout">
      <div className="cart-grid">
        <section className="cart-main"><div className="cart-title"><h1>Sepetim</h1><span>{cartCount} ürün</span></div>{items.map((item) => <article className="cart-item" data-testid={`cart-item-${item.id}`} data-product-id={item.product.id} key={item.id}><img src={item.product.image} alt={item.product.name} /><div><small>{item.product.store}</small><h2>{item.product.name}</h2><p>Krem · Stokta</p><strong>{item.product.price}</strong></div><div className="cart-item-actions"><IconButton label={`${item.product.name} Sil`} onClick={() => removeCartLine(item.id)}><TrashIcon /></IconButton><div className="quantity"><button aria-label={`${item.product.name} adedini azalt`} onClick={() => changeCartQuantity(item.id, -1)}><MinusIcon /></button><b>{item.quantity}</b><button aria-label={`${item.product.name} adedini artır`} onClick={() => changeCartQuantity(item.id, 1)}><PlusIcon /></button></div></div></article>)}{items.length === 0 ? <div className="empty-state" role="status"><BackpackIcon /><h2>Sepetin boş</h2><button className="primary navy" onClick={() => go("CAL-02", "home")}>Alışverişe Dön</button></div> : <div className="delivery-note"><CubeIcon /><span><strong>Teslimat ödeme adımında netleşir</strong>Ücret ve tarih, adres ile satıcının hazırlık süresine göre hesaplanır.</span></div>}</section>
        <aside className="order-summary"><h2>Sipariş Özeti</h2><label>Kupon kodu<div><KeyboardInput value={coupon} onChange={(e) => setCoupon(e.target.value)} /><button onClick={() => applyCartCoupon(coupon)}>Uygula</button></div></label>{couponApplied && <p className="coupon-success" role="status"><CheckIcon /> {appliedCoupon} indirimi uygulandı</p>}<SummaryRows subtotal={subtotal} discount={discount} total={total} /><button className="primary navy" disabled={!items.length} onClick={() => go("CAL-08", "cart")}>{formatMoney(total)} · Ödemeye Geç <ArrowRightIcon /></button><small className="secure-copy"><LockClosedIcon /> Güvenli ödeme</small></aside>
      </div>
    </div>
  );
}

function SummaryRows({ subtotal, discount, total }: { subtotal: number; discount: number; total: number }) {
  return <div className="summary-rows"><p><span>Ara toplam</span><b>{formatMoney(subtotal)}</b></p><p className="discount"><span>İndirim</span><b>−{formatMoney(discount)}</b></p><p><span>Kargo</span><b>Hesaplanacak</b></p><hr /><p className="total"><span>Toplam</span><b>{formatMoney(total)}</b></p></div>;
}

function CheckoutScreen({ go, view }: { go: Go; view: ViewId }) {
  const { addresses, cartLines, cartCount, appliedCoupon, clearCart, publicProducts } = useCommerce();
  const [paid, setPaid] = useState(view === "success");
  const [cardholder, setCardholder] = useState("EBU ABDULLAH");
  const [cardNumber, setCardNumber] = useState("••••  ••••  ••••  4242");
  const [expiry, setExpiry] = useState("09/29");
  const [cvv, setCvv] = useState("123");
  const [cvvVisible, setCvvVisible] = useState(false);
  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0];
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? "custom");
  const [customAddress, setCustomAddress] = useState(defaultAddress?.line ?? "Atakum Mah. Cumhuriyet Cad. No: 58 D: 12");
  const [draftAddress, setDraftAddress] = useState(customAddress);
  const selectedAddress = addresses.find((address) => address.id === selectedAddressId);
  const checkoutItems = cartLines.flatMap((line) => {
    const product = publicProducts[line.productId] ?? products.find((candidate) => candidate.id === line.productId);
    return product ? [{ ...line, product }] : [];
  });
  const subtotal = checkoutItems.reduce((sum, item) => sum + productAmount(item.product) * item.quantity, 0);
  const discount = appliedCoupon ? Math.min(1500, Math.round(subtotal * .15)) : 0;
  const total = subtotal - discount;
  if (paid) {
    return <div className="detail-layout checkout-layout"><section className="checkout-success" role="status"><CheckIcon /><h1>Siparişin alındı</h1><p>#NS1234567 numaralı siparişini Hesabım bölümünden takip edebilirsin.</p><button className="primary navy" onClick={() => go("CAL-09", "account")}>Siparişi Gör</button></section></div>;
  }
  return (
    <div className="detail-layout checkout-layout">
      <div className="checkout-heading"><h1>Ödeme</h1></div>
      <div className="checkout-steps"><span className="done"><CheckIcon /> Sepet</span><i /><span className="done"><CheckIcon /> Teslimat</span><i /><span className="active">3</span><b>Ödeme</b></div>
      <div className="checkout-grid">
        <section className="checkout-main"><article className="address-card"><span><MapPinIcon data-icon="location-pin" weight="regular" /></span><div><h2>Teslimat Adresi</h2><strong>{selectedAddress?.label ?? "Özel adres"}</strong><p>{selectedAddress?.line ?? customAddress}<br />{selectedAddress ? `${selectedAddress.postalCode} ${selectedAddress.city}` : "55000 Samsun / Türkiye"}</p></div><button onClick={() => go("CAL-08", "cart", "address")}>Adresi değiştir</button></article>{view === "address" && <section className="address-editor" data-testid="checkout-address-editor" role="dialog" aria-label="Teslimat adresini düzenle"><h2>Teslimat adresi</h2><div className="checkout-address-options" role="radiogroup" aria-label="Kayıtlı adresler">{addresses.map((address) => <button type="button" role="radio" aria-checked={selectedAddressId === address.id} className={selectedAddressId === address.id ? "active" : ""} onClick={() => setSelectedAddressId(address.id)} key={address.id}><b>{address.label}</b><span>{address.line}</span></button>)}</div><KeyboardInput aria-label="Adres" value={draftAddress} onChange={(event) => { setDraftAddress(event.target.value); setSelectedAddressId("custom"); }} /><div><button className="secondary" onClick={() => go("CAL-08", "cart")}>Vazgeç</button><button className="primary navy" onClick={() => { if (selectedAddressId === "custom" && draftAddress.trim()) setCustomAddress(draftAddress.trim()); go("CAL-08", "cart"); }}>Adresi Kaydet</button></div></section>}<article className="delivery-card"><CheckIcon /><div><h2>Standart Teslimat</h2><p>Adres ve hazırlık süresine göre hesaplanır</p></div><strong>Hesaplanacak</strong></article><section className="payment-methods"><h2>Ödeme Yöntemi</h2><div><button type="button" className="active" aria-pressed="true"><CreditCardIcon data-icon="payment-card" weight="regular" />Kartla ödeme <CheckIcon className="payment-selected-check" /></button></div></section><article className="card-form"><label>Kart Üzerindeki İsim<KeyboardInput value={cardholder} onChange={(event) => setCardholder(event.target.value)} /></label><label>Kart Numarası<span className="input-icon"><KeyboardInput inputMode="numeric" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} /><CreditCardIcon data-icon="payment-card" weight="regular" aria-hidden="true" /></span></label><div><label>Son Kullanma<span className="input-icon"><KeyboardInput inputMode="numeric" value={expiry} onChange={(event) => setExpiry(event.target.value)} /><CalendarIcon data-icon="expiry-calendar" aria-hidden="true" /></span></label><label>CVV<span className="input-icon"><KeyboardInput inputMode="numeric" type={cvvVisible ? "text" : "password"} value={cvv} onChange={(event) => setCvv(event.target.value.replace(/\D/g, "").slice(0, 4))} /><button type="button" className="card-field-action" aria-label={cvvVisible ? "CVV'yi gizle" : "CVV'yi göster"} aria-pressed={cvvVisible} onClick={() => setCvvVisible(!cvvVisible)}>{cvvVisible ? <EyeClosedIcon /> : <EyeOpenIcon />}</button></span></label></div><p><CheckIcon /> 3D Secure ile güvenli ödeme</p><small><LockClosedIcon /> Kart bilgileriniz güvenle korunur</small></article></section>
        <aside className="checkout-summary"><section className="checkout-summary-card"><h2>Sipariş Özeti</h2><p className="muted">{cartCount} ürün</p><div className="summary-products">{checkoutItems.map((item) => <div className="summary-product" data-product-id={item.product.id} key={item.id}><img src={item.product.image} alt="" /><span>{item.product.name}<br /><b>{item.quantity} × {item.product.price}</b></span></div>)}</div><SummaryRows subtotal={subtotal} discount={discount} total={total} /></section><button className="primary navy" disabled={!checkoutItems.length} onClick={() => { setPaid(true); clearCart(); go("CAL-08", "cart", "success"); }}>{formatMoney(total)} · Güvenle Öde <ArrowRightIcon /></button><small className="secure-copy"><LockClosedIcon /> 256-bit SSL ile güvenli ödeme</small></aside>
      </div>
    </div>
  );
}

function OrderDetailScreen({ go, view }: { go: Go; view: ViewId }) {
  const { selectProduct } = useCommerce();
  if (view === "invoice") return <div className="root-layout order-utility-layout"><section className="invoice-preview"><header><BrandLockup /><span>E-Arşiv Fatura</span></header><h1>NovaStore Satış Faturası</h1><p><b>Fatura No</b> NS-2026-001234</p><p><b>Düzenleme</b> 18 Temmuz 2026</p><article><span>NovaSound N1 Kulaklık · 1 adet</span><b>₺1.299,00</b></article><article><span>İndirim</span><b>−₺150,00</b></article><footer><strong>Genel Toplam</strong><strong>₺1.149,00</strong></footer><button className="primary navy" type="button" onClick={() => {
    if (NATIVE_SHELL) window.dispatchEvent(new Event("novastore:print-invoice"));
    else window.print();
  }}>Faturayı Yazdır</button></section></div>;
  if (view === "tracking") return <div className="root-layout order-utility-layout"><section className="tracking-preview"><CubeIcon /><h1>Kargon yolda</h1><p>Takip kodu: <b>NOVA482190</b></p><div><span className="done"><CheckIcon /> Samsun aktarma merkezinden çıktı</span><small>Bugün · 14:20</small><span className="done"><CheckIcon /> Taşıyıcıya teslim edildi</span><small>Bugün · 09:10</small><span><ClockIcon /> Dağıtım şubesine ulaşıyor</span><small>Tahmini yarın</small></div><button className="primary navy" type="button" onClick={() => go("CAL-11", "support", "live")}>Kargo Desteği</button></section></div>;
  const stages = [["Sipariş Alındı", true], ["Hazırlanıyor", true], ["Kargoda", true], ["Teslim Edildi", false]] as const;
  return (
    <div className="root-layout order-layout">
      <div className="order-grid"><section><article className="order-card"><header><div><h1>Sipariş #NS1234567</h1><p>18 Temmuz 2026 · 10:24</p></div><span><CubeIcon /> Kargoda</span></header><div className="timeline">{stages.map(([name, done], i) => <div className={done ? `done${i === 2 ? " current" : ""}` : ""} key={name}><i>{done && (i < 2 ? <CheckIcon /> : <span />)}</i><b>{name}</b><small>{i < 2 ? "18 Temmuz 2026" : i === 2 ? "19 Temmuz 2026" : "—"}</small></div>)}</div><div className="order-product"><img src={`${A}/extracts/order-headphones.png`} alt="NovaSound N1 Kulaklık" /><div><h2>NovaSound N1 Kulaklık</h2><p>Satıcı: <b>Nova Teknoloji</b></p><p>Adet: 1</p><strong>₺1.299,00</strong></div><button onClick={() => { selectProduct("sound-n1"); go("CAL-06", "home"); }}>Ürüne Git <ArrowRightIcon /></button></div></article><div className="order-actions"><button className="primary orange" onClick={() => go("CAL-09", "account", "tracking")}><CubeIcon /> Kargo Takibi</button><button className="secondary" onClick={() => go("CAL-11", "support")}><ChatBubbleIcon /> Yardım Al</button></div></section><aside><article className="info-list"><InfoRow icon={<MapPinIcon data-icon="location-pin" weight="regular" />} title="Teslimat Adresi" copy="Ev · M**** S**** · Kadıköy / İstanbul" action="Görüntüle" onAction={() => go("CAL-10", "account", "addresses")} /><InfoRow icon={<CreditCardIcon data-icon="payment-card" weight="regular" />} title="Ödeme" copy="Banka Kartım ···· 4821" action="Görüntüle" onAction={() => go("CAL-10", "account", "payments")} /><InfoRow icon={<CubeIcon />} title="Fatura" copy="E-Arşiv Fatura" action="Faturayı Gör" onAction={() => go("CAL-09", "account", "invoice")} /></article><article className="order-total"><p><span>Ürünler</span><b>₺1.299,00</b></p><p><span>Kargo</span><b>₺0,00</b></p><p className="discount"><span>İndirim</span><b>−₺150,00</b></p><hr /><p><strong>Toplam</strong><strong>₺1.149,00</strong></p></article></aside></div>
    </div>
  );
}

function InfoRow({ icon, title, copy, action, onAction }: { icon: ReactNode; title: string; copy: string; action?: string; onAction?: () => void }) {
  return <div className="info-row"><i>{icon}</i><span><b>{title}</b><small>{copy}</small></span>{action ? <button onClick={onAction}>{action} <ArrowRightIcon /></button> : <CaretRightIcon />}</div>;
}

function AccountScreen({ go, view }: { go: Go; view: ViewId }) {
  if (view === "returns") return <ReturnsScreen go={go} />;
  if (view === "faq" || view === "history") return <AccountUtilityScreen go={go} view={view} />;
  if (view === "addresses") return <AddressBookScreen go={go} />;
  if (view === "notifications") return <NotificationCenterScreen go={go} />;
  if (["profile", "payments", "coupons", "reviews", "questions", "security", "settings"].includes(view)) return <AccountFeatureScreen go={go} view={view as "profile" | "payments" | "coupons" | "reviews" | "questions" | "security" | "settings"} />;
  const tiles: Array<[string, ReactNode, ViewId]> = [
    ["Adreslerim", <MapPinIcon data-icon="location-pin" weight="regular" />, "addresses"],
    ["Ödeme Yöntemlerim", <CreditCardIcon data-icon="payment-card" weight="regular" />, "payments"],
    ["Kuponlarım", <CubeIcon />, "coupons"],
    ["Değerlendirmelerim", <StarFilledIcon />, "reviews"],
    ["Sorularım", <QuestionMarkCircledIcon />, "questions"],
  ];
  return (
    <div className="root-layout account-layout">
      <article className="profile-card"><div className="avatar"><PersonIcon /></div><div><h1>Kullanıcı Adı</h1><p>Profil bilgilerini görüntüle</p></div><CaretRightIcon /><button onClick={() => go("CAL-10", "account", "profile")}>Profili Düzenle</button></article>
      <button className="orders-link" onClick={() => go("CAL-09")}><CubeIcon /><span><b>Siparişlerim</b><small>Tüm siparişlerini görüntüle</small></span><CaretRightIcon /></button>
      <SectionTitle title="Hesap ve Alışveriş" />
      <div className="account-tiles">{tiles.map(([name, icon, target]) => <button key={name} onClick={() => go("CAL-10", "account", target)}>{icon}<span>{name}</span></button>)}</div>
      <div className="account-list"><button onClick={() => go("CAL-10", "account", "notifications")}><BellIcon /> Bildirimler ve Tercihler <CaretRightIcon /></button><button onClick={() => go("CAL-10", "account", "security")}><LockClosedIcon /> Gizlilik ve Güvenlik <CaretRightIcon /></button><button onClick={() => go("CAL-11", "support")}><QuestionMarkCircledIcon /> Yardım ve Destek <CaretRightIcon /></button><button onClick={() => go("CAL-10", "account", "faq")}><ChatBubbleIcon /> Sıkça Sorulan Sorular <CaretRightIcon /></button></div>
      <button className="logout" onClick={() => go("CAL-01", "account", "login")}><ArrowRightIcon /> Çıkış Yap</button>
    </div>
  );
}

function AccountFeatureScreen({ go, view }: { go: Go; view: "profile" | "payments" | "coupons" | "reviews" | "questions" | "security" | "settings" }) {
  const keyboard = useKeyboard();
  const { selectProduct } = useCommerce();
  const [profile, setProfile] = useState({ name: "Kullanıcı Adı", email: "kullanici@novastore.test", phone: "+90 555 000 00 00" });
  const [saved, setSaved] = useState(false);
  const [couponCopied, setCouponCopied] = useState("");
  const [preferences, setPreferences] = useState({ twoFactor: true, loginAlerts: true, personalized: false, compact: false });
  const openProduct = () => { selectProduct("pulse-anc"); go("CAL-06", "home"); };

  if (view === "payments") return <PaymentsScreen />;

  if (view === "profile") return <form className="root-layout account-feature-layout account-profile-form" onSubmit={(event) => { event.preventDefault(); keyboard.hide(); setSaved(true); }}><section className="account-feature-card"><PersonIcon /><h1>Profil bilgileri</h1><label>Ad Soyad<KeyboardInput aria-label="Profil adı" value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label>E-posta<KeyboardInput aria-label="Profil e-posta" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label><label>Telefon<KeyboardInput aria-label="Profil telefonu" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label><button className="primary navy" type="submit">Değişiklikleri Kaydet</button>{saved && <p className="inline-success" role="status"><CheckIcon /> Profil bilgilerin güncellendi.</p>}</section></form>;

  if (view === "coupons") return <div className="root-layout account-feature-layout"><section className="account-feature-card"><CubeIcon /><h1>Kullanılabilir kuponlar</h1>{[["NOVA250", "₺250 indirim", "₺2.000 üzeri"], ["HOSGELDIN", "%10 indirim", "İlk sipariş"]].map(([code, value, condition]) => <article className="coupon-card" key={code}><div><b>{value}</b><span>{condition}</span></div><button type="button" onClick={() => setCouponCopied(code)}>{couponCopied === code ? "Kopyalandı" : code}</button></article>)}{couponCopied && <p className="inline-success" role="status"><CheckIcon /> {couponCopied} kuponu kopyalandı.</p>}</section></div>;

  if (view === "reviews" || view === "questions") return <div className="root-layout account-feature-layout"><section className="account-feature-card">{view === "reviews" ? <StarFilledIcon /> : <QuestionMarkCircledIcon />}<h1>{view === "reviews" ? "Değerlendirmelerim" : "Ürün sorularım"}</h1><article className="account-activity-card"><img src={PRODUCT_HERO} alt="Nova Pulse ANC Kulaklık" /><div><b>Nova Pulse ANC Kulaklık</b><p>{view === "reviews" ? "5 yıldız · Ses kalitesi ve konfor çok iyi." : "Pil ömrü ANC açıkken kaç saat?"}</p><small>{view === "reviews" ? "Yayınlandı" : "Satıcı yanıtladı: 36 saate kadar."}</small></div><button type="button" onClick={openProduct}>Ürüne Git</button></article></section></div>;

  const settingsMode = view === "settings";
  const rows: Array<[keyof typeof preferences, string, string]> = settingsMode
    ? [["personalized", "Kişiselleştirilmiş öneriler", "Yerel oturum tercihlerini kullan"], ["compact", "Kompakt görünüm", "Liste yoğunluğunu artır"]]
    : [["twoFactor", "İki adımlı doğrulama", "Hesap girişlerini güçlendir"], ["loginAlerts", "Giriş uyarıları", "Yeni cihazlarda bildirim al"]];
  return <div className="root-layout account-feature-layout"><section className="account-feature-card">{settingsMode ? <GearIcon /> : <LockClosedIcon />}<h1>{settingsMode ? "Uygulama ayarları" : "Gizlilik ve güvenlik"}</h1>{rows.map(([key, label, copy]) => <button className="feature-switch" type="button" role="switch" aria-checked={preferences[key]} onClick={() => setPreferences({ ...preferences, [key]: !preferences[key] })} key={key}><span><b>{label}</b><small>{copy}</small></span><i className={preferences[key] ? "on" : ""}><b /></i></button>)}</section></div>;
}

type PaymentDraft = { nickname: string; cardholder: string; number: string; expiry: string; cvv: string };
const EMPTY_PAYMENT_DRAFT: PaymentDraft = { nickname: "", cardholder: "", number: "", expiry: "", cvv: "" };

function detectPaymentBrand(value: string): PaymentBrand {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("9792")) return "troy";
  if (digits.startsWith("4")) return "visa";
  if (/^3[47]/.test(digits)) return "amex";
  const firstSix = Number(digits.slice(0, 6));
  if (/^5[1-5]/.test(digits) || (firstSix >= 222100 && firstSix <= 272099)) return "mastercard";
  return "generic";
}

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
}

function luhnValid(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 15) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function PaymentBrandMark({ brand }: { brand: PaymentBrand }) {
  if (brand === "visa") return <span className="payment-brand-logo" role="img" aria-label="Visa"><VisaLogo /></span>;
  if (brand === "mastercard") return <span className="payment-brand-logo" role="img" aria-label="Mastercard"><MastercardLogo /></span>;
  if (brand === "amex") return <span className="payment-brand-logo" role="img" aria-label="American Express"><AmexLogo /></span>;
  if (brand === "troy") return <img className="troy-brand-mark" src={`${A}/official/troy-logo-white.png`} alt="TROY" aria-label="TROY" />;
  return <ContactlessPaymentIcon className="payment-brand-generic" aria-label="Kart ağı" />;
}

function PaymentCardSurface({ method, previewCvv }: { method: Omit<SavedPaymentMethod, "id" | "isDefault"> & { isDefault?: boolean }; previewCvv?: string }) {
  return <article className={`saved-payment-card brand-${method.brand}`} data-testid="saved-payment-card">
    <header><strong>{method.nickname || "Nova Kartım"}</strong><PaymentBrandMark brand={method.brand} /></header>
    <div className="payment-chip-row"><SimCardIcon className="payment-chip" aria-label="Kart çipi" /><ContactlessPaymentIcon aria-label="Temassız ödeme" /></div>
    <b className="payment-pan">•••• &nbsp;•••• &nbsp;•••• &nbsp;{method.last4 || "••••"}</b>
    <footer><span><small>Son kullanma</small>{method.expiry || "AA/YY"}</span>{previewCvv !== undefined && <span><small>CVV</small>{previewCvv ? "•".repeat(previewCvv.length) : "•••"}</span>}{method.isDefault && <em>Varsayılan</em>}</footer>
  </article>;
}

function PaymentsScreen() {
  const keyboard = useKeyboard();
  const { paymentMethods, addPaymentMethod, removePaymentMethod, setDefaultPaymentMethod } = useCommerce();
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);
  const digits = draft.number.replace(/\D/g, "");
  const brand = detectPaymentBrand(digits);
  const expiryMonth = Number(draft.expiry.slice(0, 2));
  const expiryValid = /^\d{2}\/\d{2}$/.test(draft.expiry) && expiryMonth >= 1 && expiryMonth <= 12;
  const cvvValid = draft.cvv.length === (brand === "amex" ? 4 : 3);
  const numberValid = brand === "troy" ? digits.length === 16 : luhnValid(digits);
  const formValid = Boolean(draft.nickname.trim() && draft.cardholder.trim() && numberValid && expiryValid && cvvValid);
  const close = () => { keyboard.hide(); setDraft(EMPTY_PAYMENT_DRAFT); setFormOpen(false); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!formValid) return;
    addPaymentMethod({ nickname: draft.nickname.trim(), brand, last4: digits.slice(-4), expiry: draft.expiry });
    close();
  };
  const previewMethod = { nickname: draft.nickname || "Nova Kartım", brand, last4: digits.slice(-4).padStart(4, "•"), expiry: draft.expiry };
  return <>
    <div className="root-layout account-feature-layout payments-layout"><section className="account-feature-card payments-card"><CreditCardIcon weight="regular" /><h1>Kayıtlı ödeme yöntemleri</h1><p className="account-feature-intro">Kartlarını adlandır, varsayılan kartını seç ve güvenle yönet.</p><div className="saved-payment-list">{paymentMethods.map((method) => <div className="saved-payment-item" key={method.id}><PaymentCardSurface method={method} /><div className="saved-payment-actions">{!method.isDefault && <button type="button" onClick={() => setDefaultPaymentMethod(method.id)}>Varsayılan yap</button>}<button type="button" className="danger-text" aria-label={`${method.nickname} kartını sil`} onClick={() => removePaymentMethod(method.id)}>Sil</button></div></div>)}</div><button className="primary navy" type="button" onClick={() => setFormOpen(true)}><PlusIcon /> Yeni kart ekle</button></section></div>
    <BottomSheet open={formOpen} onOpenChange={(open) => open ? setFormOpen(true) : close()} title="Yeni kart ekle" description="Kartın yalnız güvenli yerel önizleme için kullanılır; CVV kaydedilmez." snap={0.86}>
      <form className="payment-add-form" onSubmit={save}>
        <PaymentCardSurface method={previewMethod} previewCvv={draft.cvv} />
        <label>Kart adı<KeyboardInput aria-label="Kart adı" value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} placeholder="Nova Kartım" /></label>
        <label>Kart üzerindeki isim<KeyboardInput aria-label="Kart üzerindeki isim" value={draft.cardholder} onChange={(event) => setDraft({ ...draft, cardholder: event.target.value })} /></label>
        <label>Kart numarası<KeyboardInput aria-label="Kart numarası" inputMode="numeric" value={draft.number} aria-invalid={Boolean(digits) && !numberValid} onChange={(event) => setDraft({ ...draft, number: formatCardNumber(event.target.value) })} placeholder="0000 0000 0000 0000" /></label>
        <div><label>Son kullanma<KeyboardInput aria-label="Son kullanma tarihi" inputMode="numeric" value={draft.expiry} aria-invalid={draft.expiry.length === 5 && !expiryValid} onChange={(event) => setDraft({ ...draft, expiry: formatExpiry(event.target.value) })} placeholder="AA/YY" /></label><label>CVV<KeyboardInput aria-label="CVV" inputMode="numeric" value={draft.cvv} aria-invalid={Boolean(draft.cvv) && !cvvValid} onChange={(event) => setDraft({ ...draft, cvv: event.target.value.replace(/\D/g, "").slice(0, brand === "amex" ? 4 : 3) })} placeholder={brand === "amex" ? "••••" : "•••"} /></label></div>
        <p className="payment-security-note"><LockClosedIcon /> Tam kart numarası ve CVV, form kapandığında temizlenir.</p>
        <footer><button type="button" className="secondary" onClick={close}>Vazgeç</button><button type="submit" className="primary navy" disabled={!formValid}>Kartı Kaydet</button></footer>
      </form>
    </BottomSheet>
  </>;
}

function AddressBookScreen({ go }: { go: Go }) {
  const keyboard = useKeyboard();
  const { addresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useCommerce();
  const [editor, setEditor] = useState<"create" | string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", recipient: "", line: "", city: "", postalCode: "" });
  const openCreate = () => { setDraft({ label: "", recipient: "", line: "", city: "", postalCode: "" }); setEditor("create"); };
  const openEdit = (address: SavedAddress) => { setDraft({ label: address.label, recipient: address.recipient, line: address.line, city: address.city, postalCode: address.postalCode }); setEditor(address.id); };
  const closeEditor = () => { keyboard.hide(); setEditor(null); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (Object.values(draft).some((value) => !value.trim())) return;
    if (editor && editor !== "create") updateAddress(editor, draft); else addAddress(draft);
    keyboard.hide();
    setDraft({ label: "", recipient: "", line: "", city: "", postalCode: "" });
    setEditor(null);
  };
  const pendingDelete = deleteId ? addresses.find((address) => address.id === deleteId) : undefined;
  return (
    <>
      <div className="root-layout address-book-layout" data-testid="address-book-screen">
        <header className="utility-heading"><div><h1>Teslimat adresleri</h1><p>Ödeme sırasında kullanacağın adresleri yönet.</p></div><button type="button" className="primary navy" onClick={openCreate}><PlusIcon /> Yeni adres ekle</button></header>
        {addresses.length ? <section className="saved-addresses" role="radiogroup" aria-label="Varsayılan teslimat adresi">{addresses.map((address) => <article className="saved-address" data-testid={`saved-address-${address.id}`} key={address.id}><button type="button" className="address-default-selector" role="radio" aria-checked={address.isDefault} aria-label={`${address.label} adresini varsayılan yap`} onClick={() => setDefaultAddress(address.id)}><MapPinIcon data-icon="location-pin" weight={address.isDefault ? "fill" : "regular"} /></button><div><h2>{address.label}{address.isDefault && <b>Varsayılan</b>}</h2><strong>{address.recipient}</strong><p>{address.line}<br />{address.postalCode} {address.city}</p></div><div><button type="button" onClick={() => openEdit(address)}>Düzenle</button><button type="button" className="danger-text" onClick={() => setDeleteId(address.id)}>Sil</button></div></article>)}</section> : <div className="empty-state address-empty"><MapPinIcon weight="regular" /><h2>Kayıtlı adresin yok</h2><p>Ödeme adımında kullanmak için ilk adresini ekleyebilirsin.</p><button type="button" className="primary navy" onClick={openCreate}>Adres Ekle</button></div>}
        {editor && <form className="address-create-form" data-testid="address-create-form" onSubmit={save}><h2>{editor === "create" ? "Yeni adres" : "Adresi düzenle"}</h2><label>Adres adı<KeyboardInput aria-label="Adres adı" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Ev, İş..." /></label><label>Ad soyad<KeyboardInput aria-label="Adres alıcısı" value={draft.recipient} onChange={(event) => setDraft({ ...draft, recipient: event.target.value })} /></label><label>Açık adres<KeyboardInput aria-label="Açık adres" value={draft.line} onChange={(event) => setDraft({ ...draft, line: event.target.value })} /></label><div><label>İl / İlçe<KeyboardInput aria-label="İl ve ilçe" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label><label>Posta kodu<KeyboardInput aria-label="Posta kodu" inputMode="numeric" value={draft.postalCode} onChange={(event) => setDraft({ ...draft, postalCode: event.target.value.replace(/\D/g, "").slice(0, 5) })} /></label></div><footer><button type="button" className="secondary" onClick={closeEditor}>Vazgeç</button><button type="submit" className="primary navy" disabled={Object.values(draft).some((value) => !value.trim())}>{editor === "create" ? "Adresi Kaydet" : "Değişiklikleri Kaydet"}</button></footer></form>}
      </div>
      <BottomSheet open={Boolean(deleteId)} onOpenChange={(open) => { if (!open) setDeleteId(null); }} title="Adresi sil?" description={`${pendingDelete?.label || "Bu adres"} kalıcı prototip listesinden kaldırılacak.`} snap={0.34}>
        <div className="delete-confirmation"><p>Bu işlem yalnızca mevcut prototip oturumunu etkiler.</p><div><button type="button" className="secondary" onClick={() => setDeleteId(null)}>Vazgeç</button><button type="button" className="danger-button" onClick={() => { if (deleteId) removeAddress(deleteId); setDeleteId(null); }}>Adresi Sil</button></div></div>
      </BottomSheet>
    </>
  );
}

const notificationItems = [
  { id: "order", title: "Siparişin hazırlanıyor", copy: "#NS1234567 numaralı siparişin satıcı tarafından hazırlanıyor.", time: "8 dk önce", icon: <CubeIcon /> },
  { id: "campaign", title: "Favorindeki üründe fiyat düştü", copy: "Nova Pulse Studio için yeni fiyatı inceleyebilirsin.", time: "2 saat önce", icon: <PhosphorHeartIcon weight="fill" /> },
  { id: "question", title: "Satıcı sorunu yanıtladı", copy: "Nova Audio Mağazası ürün sorun için yeni bir yanıt gönderdi.", time: "Dün", icon: <ChatBubbleIcon /> },
  { id: "welcome", title: "NovaStore’a hoş geldin", copy: "Hesabın ve alışveriş tercihlerin hazır.", time: "3 gün önce", icon: <BellIcon /> },
];

function NotificationCenterScreen({ go }: { go: Go }) {
  const { readNotificationIds, notificationPreferences, markNotificationRead, markAllNotificationsRead, toggleNotificationPreference, selectProduct } = useCommerce();
  const openNotification = (id: string) => {
    markNotificationRead(id);
    if (id === "order") go("CAL-09", "account");
    else if (id === "campaign") { selectProduct("pulse-studio"); go("CAL-06", "home"); }
    else if (id === "question") go("CAL-10", "account", "questions");
  };
  return (
    <div className="root-layout notification-center-layout" data-testid="notification-center-screen">
      <header className="notification-heading"><div><h1>Son bildirimler</h1><p>{notificationItems.filter((item) => !readNotificationIds.has(item.id)).length} okunmamış bildirim</p></div><button type="button" onClick={markAllNotificationsRead}>Tümünü okundu işaretle</button></header>
      <section className="notification-list">{notificationItems.map((item) => { const unread = !readNotificationIds.has(item.id); return <button type="button" className={unread ? "unread" : ""} aria-label={`${item.title}${unread ? " okunmadı" : " okundu"}`} onClick={() => openNotification(item.id)} key={item.id}><span>{item.icon}</span><div><h2>{item.title}</h2><p>{item.copy}</p><small>{item.time}</small></div>{unread && <i aria-hidden="true" />}</button>; })}</section>
      <section className="notification-preferences"><h2>Bildirim tercihleri</h2>{([['orders', 'Sipariş güncellemeleri'], ['campaigns', 'Kampanya ve fiyat fırsatları'], ['questions', 'Soru ve değerlendirme yanıtları']] as Array<[NotificationPreference, string]>).map(([key, label]) => <button type="button" role="switch" aria-checked={notificationPreferences[key]} onClick={() => toggleNotificationPreference(key)} key={key}><span>{label}</span><i className={notificationPreferences[key] ? "on" : ""}><b /></i></button>)}</section>
    </div>
  );
}

function ReturnsScreen({ go }: { go: Go }) {
  const [reason, setReason] = useState("Beden / renk değişimi");
  const [created, setCreated] = useState(false);
  return <div className="root-layout returns-layout" data-testid="returns-view"><section className="returns-hero"><ReloadIcon /><div><h1>Kolay iade ve değişim</h1><p>Uygun siparişini seç, ücretsiz gönderi kodunu hemen oluştur.</p></div></section><article className="return-order"><img src={`${A}/extracts/order-headphones.png`} alt="NovaSound N1 Kulaklık" /><div><small>#NS1234567 · Teslim edildi</small><h2>NovaSound N1 Kulaklık</h2><p>İade süresi: 9 gün kaldı</p></div><CheckIcon /></article><section className="return-reasons"><h2>İşlem nedeni</h2>{["Beden / renk değişimi", "Ürün beklentimi karşılamadı", "Hasarlı veya eksik ürün"].map((item) => <button className={reason === item ? "active" : ""} aria-pressed={reason === item} onClick={() => setReason(item)} key={item}><span>{reason === item && <CheckIcon />}</span>{item}</button>)}</section><button className="primary navy return-cta" onClick={() => setCreated(true)}>İade Talebi Oluştur</button>{created && <p role="status" className="return-status"><CheckIcon /> Talebin hazırlandı. Ücretsiz gönderi kodun: NS-4821</p>}<button className="text-action return-support" onClick={() => go("CAL-11", "support")}>Yardım Merkezine Git</button></div>;
}

type LocalDetailItem = {
  id: string;
  title: string;
  detail: string;
  meta?: string;
  searchTerms?: string[];
};

const supportArticles: LocalDetailItem[] = [
  { id: "track-order", title: "Siparişimi nasıl takip ederim?", detail: "Hesabım bölümündeki Siparişlerim satırını aç. Sipariş detayında hazırlık, kargo ve teslimat adımlarının güncel yerel önizlemesini görebilirsin.", meta: "Sipariş ve teslimat", searchTerms: ["kargo", "takip", "teslimat", "sipariş nerede"] },
  { id: "return-window", title: "İade ve değişim nasıl yapılır?", detail: "Hesabım > İade ve Değişim yolundan uygun siparişi seç, işlem nedenini belirle ve yerel demo talebini oluştur. Bu prototip gerçek bir kargo kodu üretmez.", meta: "İade ve değişim", searchTerms: ["iade", "değişim", "vazgeçme", "ürünü gönder"] },
  { id: "payment-options", title: "Ödeme seçenekleri nelerdir?", detail: "Ödeme önizlemesinde yalnız kartla ödeme kullanılabilir. Kart numarası ve CVV gibi hassas bilgiler bu yerel prototipte gerçek bir tahsilat için gönderilmez.", meta: "Ödeme", searchTerms: ["kart", "kredi kartı", "banka kartı", "ödeme"] },
  { id: "invoice", title: "Faturamı nasıl görüntülerim?", detail: "Sipariş detayındaki Fatura satırı, e-arşiv fatura önizlemesine açılır. Bu kalibrasyon paketinde belge yalnızca yerel örnek içeriktir.", meta: "Fatura", searchTerms: ["e-arşiv", "belge", "fiş"] },
  { id: "address", title: "Teslimat adresimi nasıl değiştiririm?", detail: "Hesabım > Adreslerim ekranından yeni adres ekleyebilir ve varsayılan adresi değiştirebilirsin. Değişiklikler yalnızca mevcut prototip oturumunda saklanır.", meta: "Hesap", searchTerms: ["adres", "konum", "varsayılan adres"] },
  { id: "account-security", title: "Hesabımı nasıl güvende tutarım?", detail: "Benzersiz bir parola kullan, doğrulama kodunu kimseyle paylaşma ve tanımadığın oturumları kapat. NovaStore destek ekibi senden parolanı istemez.", meta: "Hesap ve güvenlik", searchTerms: ["şifre", "parola", "gizlilik", "güvenlik"] },
];

const accountHistoryItems: LocalDetailItem[] = [
  { id: "address-update", title: "Teslimat adresi güncellendi", detail: "Ev adresi mevcut prototip oturumunda varsayılan teslimat adresi olarak işaretlendi.", meta: "Bugün · Tamamlandı" },
  { id: "notification-update", title: "Bildirim tercihleri değiştirildi", detail: "Sipariş güncellemeleri açık, kampanya bildirimleri kapalı olarak kaydedildi.", meta: "Dün · Tamamlandı" },
  { id: "password-request", title: "Şifre sıfırlama bağlantısı istendi", detail: "Yerel demo isteği kaydedildi; gerçek e-posta veya SMS gönderilmedi.", meta: "3 gün önce · Demo" },
];

const supportHistoryItems: LocalDetailItem[] = [
  { id: "order-case", title: "Sipariş #NS1234567", detail: "Kargo hareketleri açıklandı ve sipariş takip ekranına yönlendirme paylaşıldı.", meta: "Çözüldü · 18 Temmuz 2026" },
  { id: "payment-case", title: "Ödeme bildirimi", detail: "Yinelenen bildirim kontrol edildi; prototipte gerçek bir tahsilat veya iade işlemi yapılmadı.", meta: "Çözüldü · 12 Temmuz 2026" },
];

function ExpandableLocalList({ items, idPrefix, className = "" }: { items: LocalDetailItem[]; idPrefix: string; className?: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  return (
    <div className={`expandable-local-list ${className}`.trim()}>
      {items.map((item) => {
        const expanded = expandedId === item.id;
        const detailId = `${idPrefix}-${item.id}-detail`;
        return (
          <article className={expanded ? "expanded" : ""} key={item.id}>
            <button type="button" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpandedId(expanded ? null : item.id)}>
              <span><b>{item.title}</b>{item.meta && <small>{item.meta}</small>}</span><CaretRightIcon />
            </button>
            {expanded && <div id={detailId} className="expandable-local-detail" role="region" aria-label={`${item.title} ayrıntısı`}><p>{item.detail}</p></div>}
          </article>
        );
      })}
    </div>
  );
}

function AccountUtilityScreen({ go, view }: { go: Go; view: "faq" | "history" }) {
  const title = view === "faq" ? "Sıkça Sorulan Sorular" : "Geçmiş İşlemler";
  const items = view === "faq" ? supportArticles.slice(0, 3) : accountHistoryItems;
  return <div className="root-layout utility-layout"><section className="utility-card">{view === "faq" ? <QuestionMarkCircledIcon /> : <ClockIcon />}<h1>{title}</h1><p>{view === "faq" ? "Sipariş, ödeme, teslimat ve hesap konularındaki sık sorulan yanıtları incele." : "Destek ve hesap işlemlerinin son durumunu güvenle görüntüle."}</p><ExpandableLocalList items={items} idPrefix={`account-${view}`} /></section><button className="primary navy" onClick={() => go("CAL-11", "support")}>Yardım Merkezine Git</button></div>;
}

function SupportHubScreen({ go, view }: { go: Go; view: ViewId }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const matchingArticles = useMemo(() => normalizedQuery ? supportArticles.filter((article) => [article.title, article.detail, ...(article.searchTerms || [])].join(" ").toLocaleLowerCase("tr-TR").includes(normalizedQuery)) : [], [normalizedQuery]);
  if (view === "faq" || view === "history" || view === "live") return <SupportSubpage go={go} view={view} />;
  return (
    <div className="root-layout support-layout">
      <div className="support-heading"><div><h1>Yardım ve Destek</h1></div><button onClick={() => go("CAL-11", "support", "history")}><ClockIcon /><span>Geçmiş</span></button></div>
      <label className="support-search"><MagnifyingGlassIcon /><KeyboardInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nasıl yardımcı olabiliriz?" aria-label="Destekte ara" /></label>
      <section className="quick-help"><h2>Hızlı Yardım</h2><div><button onClick={() => go("CAL-09", "account")}><CubeIcon />Sipariş ve Teslimat<CaretRightIcon /></button><button onClick={() => go("CAL-10", "account", "returns")}><ReloadIcon />İade ve değişim<CaretRightIcon /></button><button onClick={() => go("CAL-11", "support", "faq")}><CreditCardIcon data-icon="payment-card" weight="regular" />Ödeme Sorunları<CaretRightIcon /></button><button onClick={() => go("CAL-10", "account", "security")}><LockClosedIcon />Hesap ve Güvenlik<CaretRightIcon /></button></div></section>
      <section className="novabot-card"><span className="novabot-art"><img src={NOVABOT} alt="NovaBot resmi simgesi" /></span><div><h2>NovaBot</h2><p><i /> Çevrimiçi</p><span>Sorunu anlat, NovaBot anında yardımcı olsun.</span></div><button className="primary navy" onClick={() => go("CAL-12", "support")}><PersonIcon /> NovaBot’u Başlat <ArrowRightIcon /></button></section>
      <button className="live-support" onClick={() => go("CAL-11", "support", "live")}><PersonIcon /><span><b>Canlı Desteğe Bağlan</b><small><i /> Genellikle hemen yanıtlar</small></span><ArrowRightIcon /></button>
      <div className="support-links"><button onClick={() => go("CAL-11", "support", "faq")}><QuestionMarkCircledIcon />Sıkça Sorulan Sorular<CaretRightIcon /></button><button onClick={() => go("CAL-11", "support", "history")}><ChatBubbleIcon />Geçmiş Sohbetler<CaretRightIcon /></button></div>
      {normalizedQuery && <section className="support-search-results" data-testid="support-search-results" aria-label="Destek arama sonuçları"><header><h2>Arama sonuçları</h2><span>{matchingArticles.length} sonuç</span></header>{matchingArticles.length ? <ExpandableLocalList items={matchingArticles} idPrefix="support-search" /> : <div className="support-search-empty" data-testid="support-search-empty" role="status"><MagnifyingGlassIcon /><h3>Sonuç bulunamadı</h3><p>Başka bir sipariş, ödeme veya hesap ifadesi deneyebilirsin.</p></div>}</section>}
    </div>
  );
}

function SupportSubpage({ go, view }: { go: Go; view: "faq" | "history" | "live" }) {
  const [liveState, setLiveState] = useState<"queued" | "ready" | "connected">("queued");
  const copy = view === "faq" ? "Sıkça Sorulan Sorular" : view === "history" ? "Geçmiş Destek Kayıtları" : "Canlı Destek";
  const items = view === "history" ? supportHistoryItems : supportArticles.slice(0, 3);
  const liveCopy = liveState === "queued" ? { title: "Yerel destek sırası hazır", detail: "Durumu yenileyerek uzman eşleşmesini bu prototip içinde simüle edebilirsin." } : liveState === "ready" ? { title: "Destek uzmanı eşleşti", detail: "Demo görüşmesini başlatmaya hazırsın; henüz gerçek bir temsilciye bağlanılmadı." } : { title: "Demo görüşme başladı", detail: "Bu yalnızca yerel bağlantı önizlemesidir; gerçek bir temsilciye bağlanılmaz ve dışarıya mesaj veya destek talebi gönderilmez." };
  return <div className="root-layout support-subpage"><section className="support-detail-card">{view === "live" ? <PersonIcon /> : view === "history" ? <ClockIcon /> : <QuestionMarkCircledIcon />}<h1>{copy}</h1><p>{view === "live" ? "Canlı destek bağlantısının yerel demo adımlarını güvenle incele." : view === "history" ? "Son destek görüşmelerin ve çözüm durumları." : "En çok sorulan konulardaki kısa ve güvenilir yanıtlar."}</p>{view === "live" ? <><div className="live-support-state" data-testid="live-support-state" data-state={liveState} role="status"><i /><span><b>{liveCopy.title}</b><small>{liveCopy.detail}</small></span></div><div className="live-support-controls"><button type="button" disabled={liveState !== "queued"} onClick={() => setLiveState("ready")}>Bağlantı durumunu yenile <ReloadIcon /></button><button type="button" disabled={liveState !== "ready"} onClick={() => setLiveState("connected")}>Görüşmeyi başlat <ArrowRightIcon /></button></div></> : <ExpandableLocalList items={items} idPrefix={`support-${view}`} />}</section><button className="primary navy" onClick={() => go("CAL-12", "support")}>NovaBot ile Devam Et</button></div>;
}

type ChatMessage = { id: number; from: "bot" | "user"; text: string; time: string };

function NovaBotScreen({ go }: { go: Go }) {
  const [message, setMessage] = useState("");
  const [liveRequested, setLiveRequested] = useState(false);
  const [attachment, setAttachment] = useState<{ name: string; size: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, from: "bot", text: "Merhaba! Sana nasıl yardımcı olabilirim?", time: "12:04 · İletildi" },
  ]);
  const sendMessage = (text: string) => {
    const clean = text.trim();
    if (!clean) return;
    const now = Date.now();
    setMessages((current) => [...current, { id: now, from: "user", text: clean, time: "Şimdi · Gönderildi" }, { id: now + 1, from: "bot", text: "Talebini anladım. İlgili sipariş ve yardım seçeneklerini aşağıda hazırladım.", time: "Şimdi · İletildi" }]);
    setMessage("");
  };
  const sendComposerMessage = () => {
    const clean = message.trim();
    if (!clean && !attachment) return;
    sendMessage([clean, attachment ? `Ek: ${attachment.name}` : ""].filter(Boolean).join(" · "));
    setAttachment(null);
  };
  return (
    <div className="root-layout novabot-layout">
      <div className="support-heading novabot-heading"><div><h1>Destek</h1></div><button onClick={() => go("CAL-11", "support", "history")}><ClockIcon /><span>Geçmiş</span></button></div>
      <section className={`chat-card${messages.length > 1 || liveRequested ? " active-conversation" : ""}${attachment ? " has-attachment" : ""}`}><header><span className="novabot-art"><img src={NOVABOT} alt="NovaBot resmi simgesi" /></span><div><h1>NovaBot</h1><p><i /> Çevrimiçi · Anında yanıt</p></div></header><div className="messages" aria-live="polite">{messages.map((item) => <div className={`message ${item.from}`} key={item.id}>{item.from === "bot" && <span className="novabot-art small"><img src={NOVABOT} alt="" /></span>}<div><p>{item.text}</p><small>{item.time}</small></div></div>)}{liveRequested && <div className="message bot" role="status"><span className="novabot-art small"><img src={NOVABOT} alt="" /></span><div><p>Seni canlı destek sırasına aldım. Görüşme özeti güvenli biçimde aktarılacak.</p><small>Şimdi · İletildi</small></div></div>}</div><div className="suggestion-row"><button onClick={() => sendMessage("Siparişimi takip et")}>Siparişimi takip et</button><button onClick={() => go("CAL-10", "account", "returns")}>İade ve değişim</button><button onClick={() => sendMessage("Ödeme sorunu")}>Ödeme sorunu</button></div><button className="escalate" onClick={() => setLiveRequested(true)}><PersonIcon /> Canlı desteğe bağlan <ArrowRightIcon /></button><p className="handoff-copy">NovaBot, görüşmeni destek ekibine aktarır.</p><form className="composer" onSubmit={(event) => { event.preventDefault(); sendComposerMessage(); }}>{attachment && <div className="composer-attachment" data-testid="composer-attachment" role="status"><CubeIcon /><span><b>{attachment.name}</b><small>Yerel ek · {attachment.size}</small></span><button type="button" aria-label={`${attachment.name} ekini kaldır`} onClick={() => setAttachment(null)}><Cross1Icon /></button></div>}<button type="button" className="composer-attach" aria-label="Dosya ekle" aria-pressed={Boolean(attachment)} onClick={() => setAttachment({ name: "siparis-ekrani.png", size: "1,2 MB" })}><PlusIcon /></button><KeyboardInput aria-label="NovaBot mesajı" placeholder="Mesajını yaz..." value={message} onChange={(event) => setMessage(event.target.value)} /><button type="submit" aria-label="Mesajı gönder"><PaperPlaneIcon /></button></form></section><p className="privacy-note"><LockClosedIcon /> Görüşmelerin gizli ve güvenli şekilde korunur.</p>
    </div>
  );
}
