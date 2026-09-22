import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CategoryHoverMenus from "./CategoryHoverMenus.jsx";
import { normalizeSearchText } from "./searchText.js";
import { SandboxPage, SandboxTheme, SandboxCategoriesPage, SandboxFooter, SandboxTemplate, SandboxSeo, isDraftPreview } from "./SandboxPresentation.jsx";
import useSandbox from "../../sandbox/useSandbox.js";
import { targetHref } from "../../sandbox/store.js";
import { StudioFamilyContext, resolveStudioFamily, useStudioFamily } from "./StudioFamily.jsx";
import "./store-demo-flows.css";

const LOCAL_REVIEW_RUNTIME_ENABLED = __NOVASTORE_LOCAL_REVIEW_RUNTIME__;
import {
  ArrowLeft,
  ArrowsLeftRight,
  ArrowsClockwise,
  BadgePercent,
  Baby,
  Bell,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CreditCard,
  DeviceMobile,
  Funnel,
  Flower,
  GridFour,
  Headphones,
  Heart,
  House,
  Laptop,
  List,
  MagnifyingGlass,
  MapPin,
  Minus,
  Package,
  PersonSimpleRun,
  Plus,
  Question,
  ShieldCheck,
  SignIn,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Storefront,
  Television,
  Trash,
  Truck,
  TShirt,
  User,
  Watch,
  WarningCircle,
  X,
} from "./CustomerIcon.jsx";
import {
  buildFacets,
  categories,
  getBreadcrumb,
  getCategoryById,
  getProductsForCategory,
  getVisibleChildren,
  getVisibleProducts,
  getVisibleRoots,
  products,
  resolveCategoryPath,
  sortProducts,
  stockFirst,
} from "./integration/runtimeCatalog.js";
import { useCommerceRuntime } from "./integration/useCommerceRuntime.js";
import { RuntimeComparisonContext } from "./integration/RuntimeComparisonContext.jsx";
import { installInputModalityTracking } from "./integration/inputModality.js";
import {
  CustomerAccountPage,
  CustomerAuthPage,
  CustomerCheckoutPage,
  CustomerLegalDocumentPage,
  CustomerPasswordPage,
  CustomerPaymentResultPage,
  CustomerPublicContactPage,
  CustomerSupportPage,
  CustomerTrackingPage,
} from "./ConnectedCustomerPages.jsx";
import { ProductCommunity } from "./ProductCommunity.jsx";
import { AssistantWidget } from "./AssistantWidget.jsx";
import {
  assistantConversationOwnerKey,
  createAssistantConversationState,
} from "./integration/assistantConversationState.js";
import { NovaServiceIcon } from "./NovaServiceIcon.jsx";
import { PublicStorePage } from "./PublicStorePage.jsx";
import { CustomerProductCard } from "./CustomerProductCard.jsx";
import { normalizePublicStoreSlug } from "./adapters/publicStoreAdapter.js";
import { reconcileFinalizedCart } from "./adapters/checkoutAdapter.js";
import {
  customerAccountEntryPath,
  getCustomerProfileCompletion,
  NORMAL_LOGIN_DESTINATION,
  PROFILE_COMPLETION_NOTICE_TIMEOUT_MS,
  safeCustomerReturnPath,
  SELLER_RECRUITMENT_URL,
} from "./customerAuthUx.js";
import {
  FavoritesPage as CanonicalFavoritesPage,
  HomePage as CanonicalHomePage,
  LoadingPage as CanonicalLoadingPage,
  Logo as CanonicalLogo,
  NotFound as CanonicalNotFound,
  ProductDetail as CanonicalProductDetail,
  ProductListing as CanonicalProductListing,
  TrustBar as CanonicalTrustBar,
} from "./CanonicalRuntimePresentation.jsx";

import heroEditorial from "./assets/optimized/hero-editorial.webp";
import laptopImage from "./assets/optimized/product-laptop.webp";
import headphonesImage from "./assets/optimized/product-headphones.webp";
import watchImage from "./assets/optimized/product-watch.webp";
import vacuumImage from "./assets/optimized/product-vacuum.webp";
import phoneImage from "./assets/optimized/product-phone.webp";
import homeImage from "./assets/optimized/category-home.webp";
import phoneIphoneImage from "./assets/optimized/phone-iphone.webp";
import phoneSamsungImage from "./assets/optimized/phone-samsung.webp";
import phoneXiaomiImage from "./assets/optimized/phone-xiaomi.webp";
import megaElectronicsImage from "./assets/optimized/mega-electronics.webp";
import fashionImage from "./assets/optimized/product-fashion.webp";
import skincareImage from "./assets/optimized/product-skincare.webp";
import sportsImage from "./assets/optimized/product-sports.webp";
import toyImage from "./assets/optimized/product-toy.webp";
import beddingImage from "./assets/optimized/product-bedding.webp";
import sweatshirtImage from "./assets/optimized/product-sweatshirt.webp";
import kidsCoatImage from "./assets/optimized/product-kids-coat.webp";
import cosmeticsCategoryImage from "./assets/optimized/category-cosmetics.webp";
import sportsCategoryImage from "./assets/optimized/category-sports.webp";
import toysCategoryImage from "./assets/optimized/category-toys.webp";

const IMAGE_MAP = {
  hero: heroEditorial,
  laptop: laptopImage,
  headphones: headphonesImage,
  watch: watchImage,
  vacuum: vacuumImage,
  phone: phoneImage,
  "phone-iphone": phoneIphoneImage,
  "phone-samsung": phoneSamsungImage,
  "phone-xiaomi": phoneXiaomiImage,
  home: homeImage,
  fashion: fashionImage,
  skincare: skincareImage,
  sports: sportsImage,
  toy: toyImage,
  bedding: beddingImage,
  sweatshirt: sweatshirtImage,
  "kids-coat": kidsCoatImage,
};

const ROOT_IMAGES = {
  elektronik: phoneIphoneImage,
  "moda-giyim": fashionImage,
  "ev-yasam": homeImage,
  "kozmetik-kisisel-bakim": cosmeticsCategoryImage,
  "spor-outdoor": sportsCategoryImage,
  "anne-cocuk-oyuncak": toysCategoryImage,
};

const ROOT_ICONS = {
  elektronik: DeviceMobile,
  "moda-giyim": TShirt,
  "ev-yasam": House,
  "kozmetik-kisisel-bakim": Flower,
  "spor-outdoor": PersonSimpleRun,
  "anne-cocuk-oyuncak": Baby,
};

const PRODUCT_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'%3E%3Crect width='800' height='600' fill='%23f3f6f8'/%3E%3Cpath d='M300 250h200v140H300z' fill='none' stroke='%2393a4b3' stroke-width='12'/%3E%3Ccircle cx='355' cy='300' r='24' fill='%2393a4b3'/%3E%3Cpath d='m320 365 65-65 55 55 35-35 45 45' fill='none' stroke='%2393a4b3' stroke-width='12' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ctext x='400' y='455' text-anchor='middle' font-family='Arial,sans-serif' font-size='28' fill='%23596b79'%3EG%C3%B6rsel haz%C4%B1rlan%C4%B1yor%3C/text%3E%3C/svg%3E";

const MEGA_DISCOVERY_TERMS = {
  phones: [["Apple telefonlar", "Apple"], ["Samsung telefonlar", "Samsung"], ["Google Pixel", "Google Pixel"], ["Xiaomi Redmi", "Xiaomi Redmi"]],
  "computers-tablets": [["MacBook Air", "MacBook Air"], ["Lenovo IdeaPad", "Lenovo IdeaPad"], ["M3 işlemcili", "M3"], ["OLED ekranlı", "OLED"]],
  "sound-vision": [["Kablosuz kulaklık", "Kablosuz"], ["Gürültü engelleme", "gürültü engelleme"], ["Sony seçkisi", "Sony"], ["Uzun pil ömrü", "30 saat"]],
  "wearable-tech": [["Apple Watch", "Apple Watch"], ["GPS saatler", "GPS"], ["45 mm modeller", "45 mm"], ["Series 9", "Series 9"]],
};

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const HELP_TOPICS = [
  [Package, "Siparişler", "Sipariş durumu, değişiklik ve iptal"],
  [Truck, "Teslimat", "Kargo süresi ve teslimat seçenekleri"],
  [ArrowsClockwise, "İade & değişim", "Geçerli koşullar ve destek kanalı"],
  [CreditCard, "Ödeme", "Seçenekleri güvenli ödeme adımında görüntüle"],
];
const HELP_FAQS = Object.freeze([
  { question: "Siparişimi nasıl takip ederim?", answer: "Hesabına giriş yaptıktan sonra Sipariş Takibi ekranında yalnız sana ait sipariş numarasıyla güncel durumu görüntüleyebilirsin." },
  { question: "Bir ürün için iade desteğini nasıl alırım?", answer: "Geçerli iade koşulları sipariş durumuna göre doğrulanır. Yeni iade kaydı sunulmadığında destek ekranından sipariş numaranla yardım isteyebilirsin." },
  { question: "Kargo ücreti nasıl belirlenir?", answer: "Kargo ücreti, sepetin güncel toplamıyla ödeme adımındaki NovaStore fiyatlandırma servisi tarafından hesaplanır." },
  { question: "Ödeme bilgilerim güvende mi?", answer: "Kart bilgileri NovaStore sayfasında alınmaz; güvenli ödeme sağlayıcısının kendi alanına girilir." },
]);
const COMPARISON_TRAY_ROUTE_TYPES = new Set([
  "home",
  "category",
  "search",
  "collection",
  "favorites",
]);
const LEGAL_ROUTE_SLUGS = Object.freeze(new Map([
  ["/hakkimizda", "about"],
  ["/gizlilik-politikasi", "privacy"],
  ["/kvkk-aydinlatma-metni", "kvkk"],
  ["/cerez-politikasi", "cookies"],
  ["/kullanim-ve-uyelik-kosullari", "membership-terms"],
  ["/on-bilgilendirme-formu", "pre-information"],
  ["/mesafeli-satis-sozlesmesi", "distance-sale"],
  ["/iptal-iade-cayma-politikasi", "cancellation-return"],
  ["/teslimat-ve-kargo-kosullari", "delivery-shipping"],
  ["/islem-rehberi", "transaction-guide"],
  ["/pazaryeri-bilgilendirmesi", "marketplace-disclosure"],
  ["/satici-sozlesmesi", "seller-agreement"],
]));
function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function normalizeRuntimeProductId(value) {
  if (Number.isInteger(value) && value > 0) return value;
  const text = String(value ?? "").trim();
  return /^[A-Z0-9][A-Z0-9_-]{0,63}$/i.test(text) ? text : null;
}

function isolatePageFromModal() {
  const backgroundNodes = [...document.querySelectorAll("#root > *")];
  const previous = backgroundNodes.map((node) => ({
    node,
    ariaHidden: node.getAttribute("aria-hidden"),
    inert: node.inert,
  }));
  backgroundNodes.forEach((node) => {
    node.setAttribute("aria-hidden", "true");
    node.inert = true;
  });
  return () => previous.forEach(({ node, ariaHidden, inert }) => {
    if (ariaHidden === null) node.removeAttribute("aria-hidden");
    else node.setAttribute("aria-hidden", ariaHidden);
    node.inert = inert;
  });
}

function restoreFocus(ref) {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => ref?.current?.focus()));
}

function keepFocusInDialog(event, dialog) {
  if (event.key !== "Tab" || !dialog) return;
  const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => node.getClientRects().length > 0 && node.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusMainContent(options = { preventScroll: true }) {
  const main = document.getElementById("main-content");
  if (!main) return;
  main.setAttribute("tabindex", "-1");
  main.focus(options);
}

function productImage(product) {
  const runtimeImage = String(product?.imageUrl || "").trim();
  if (runtimeImage.startsWith("/") && !runtimeImage.startsWith("//")) return runtimeImage;
  try {
    const parsed = new URL(runtimeImage);
    if (parsed.protocol === "https:") return parsed.href;
  } catch {}
  return IMAGE_MAP[product?.imageKey] || PRODUCT_PLACEHOLDER;
}

function productEyebrow(product) {
  if (product?.brand) return product.brand;
  return getCategoryById(product?.categoryId)?.name || "Ürün";
}

function categoryImage(category, fallback = homeImage) {
  const runtimeImage = String(category?.imageUrl || category?.bannerUrl || "").trim();
  if (runtimeImage.startsWith("/") && !runtimeImage.startsWith("//")) return runtimeImage;
  try {
    const parsed = new URL(runtimeImage);
    if (parsed.protocol === "https:") return parsed.href;
  } catch {}
  return ROOT_IMAGES[category?.slug] || fallback;
}

function defaultCategoryPath() {
  return getVisibleRoots()[0]?.canonicalPath || null;
}

function discoveryHref() {
  const path = defaultCategoryPath();
  return path ? `#/kategori/${path}` : "#/";
}

function navigate(path, { replace = false } = {}) {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else if (replace) {
    window.history.replaceState(window.history.state, "", next);
    window.setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 0);
  }
  else window.location.hash = next;
}

function documentRouteRaw() {
  const pathname = window.location.pathname || "/";
  const search = window.location.search || "";
  if (/^\/(?:kategori|urun|koleksiyon|magaza)\//.test(pathname)) return `${pathname}${search}`;
  if (LEGAL_ROUTE_SLUGS.has(pathname) || ["/yardim", "/siparis-takibi", "/iletisim", "/destek"].includes(pathname)) return `${pathname}${search}`;
  if (pathname.endsWith("/login.html")) return `/giris${search}`;
  if (pathname.endsWith("/forgot-password.html")) return `/sifremi-unuttum${search}`;
  if (pathname.endsWith("/reset-password.html")) return `/sifre-sifirla${search}`;
  if (pathname.endsWith("/checkout.html")) return `/odeme/teslimat${search}`;
  if (pathname.endsWith("/payment-result.html")) return `/odeme/sonuc${search}`;
  if (pathname.endsWith("/profile.html")) {
    const tab = new URLSearchParams(search).get("tab");
    if (tab === "orders") return "/hesabim/siparisler";
    if (tab === "addresses") return "/hesabim/adresler";
    if (tab === "favorites") return "/favoriler";
    if (tab === "notifications") return "/hesabim/bildirimler";
    if (tab === "security") return "/hesabim/guvenlik";
    return "/hesabim";
  }
  if (pathname.endsWith("/product.html")) {
    const id = new URLSearchParams(search).get("id");
    return /^\d+$/.test(id || "") ? `/urun-id/${id}` : "/";
  }
  return "/";
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || documentRouteRaw();
  const [pathname, queryString = ""] = raw.split("?");
  const query = new URLSearchParams(queryString);
  if (pathname.startsWith("/sayfa/")) return { type: "sandbox-page", id: pathname.slice(7), query };
  if (pathname === "/hakkimizda") return { type: "sandbox-page", id: "about", query };
  if (pathname === "/kategoriler") return { type: "sandbox-categories", query };
  const decode = (value) => {
    try { return decodeURIComponent(value); }
    catch { return null; }
  };
  if (pathname.startsWith("/urun/")) {
    const slug = decode(pathname.slice(6));
    return slug === null || /[?#\\]/.test(slug) ? { type: "not-found", query } : { type: "product", slug, query };
  }
  if (pathname.startsWith("/urun-id/")) {
    const id = Number(pathname.slice(9));
    return Number.isInteger(id) && id > 0 ? { type: "product-id", id, query } : { type: "not-found", query };
  }
  if (pathname.startsWith("/kategori/")) {
    const path = decode(pathname.slice(10));
    return path === null || /[?#\\]/.test(path) ? { type: "not-found", query } : { type: "category", path, query };
  }
  if (pathname === "/arama") return { type: "search", term: query.get("q") || "", query };
  if (pathname === "/koleksiyon/firsatlar") return { type: "collection", slug: "indirim", title: "Günün fırsatları", query };
  if (pathname.startsWith("/koleksiyon/")) {
    const slug = decode(pathname.slice(12));
    return slug === null || !slug || /[/?#\\]/.test(slug) ? { type: "not-found", query } : { type: "collection", slug, query };
  }
  if (pathname.startsWith("/magaza/")) {
    const decoded = decode(pathname.slice(8));
    const slug = decoded === null || /[/?#\\]/.test(decoded) ? null : normalizePublicStoreSlug(decoded);
    return slug ? { type: "public-store", slug, preview: query.get("mode") === "preview", query } : { type: "not-found", query };
  }
  if (pathname === "/favoriler") return { type: "favorites", query };
  if (pathname === "/sepet") return { type: "cart-page", query };
  if (pathname === "/hesabim") return { type: "account", section: "overview", query };
  if (pathname === "/hesabim/adresler") return { type: "account", section: "addresses", query };
  if (pathname === "/hesabim/kuponlar") return { type: "account", section: "coupons", query };
  if (pathname === "/hesabim/bildirimler") return { type: "account", section: "notifications", query };
  if (pathname === "/hesabim/sorularim") return { type: "account", section: "questions", query };
  if (pathname === "/hesabim/degerlendirmelerim") return { type: "account", section: "reviews", query };
  if (pathname === "/hesabim/takip-ettigim-magazalar") return { type: "account", section: "followed-stores", query };
  if (pathname === "/hesabim/guvenlik") return { type: "account", section: "security", query };
  if (pathname === "/hesabim/siparisler") return { type: "account", section: "orders", query };
  if (pathname.startsWith("/hesabim/siparisler/")) {
    const orderId = decode(pathname.slice(20));
    return orderId === null ? { type: "not-found", query } : { type: "account", section: "order-detail", orderId, query };
  }
  if (pathname === "/odeme/teslimat") return { type: "checkout", step: "delivery", query };
  if (pathname === "/odeme/odeme") return { type: "checkout", step: "payment", query };
  if (pathname === "/odeme/onay") return { type: "checkout", step: "review", query };
  if (pathname === "/odeme/sonuc") return { type: "payment-result", query };
  if (pathname === "/siparis/tamamlandi") return { type: "order-success", query };
  if (pathname === "/giris") return { type: "auth", mode: query.get("mode") === "register" ? "register" : "login", query };
  if (pathname === "/kayit") return { type: "auth", mode: "register", query };
  if (pathname === "/sifremi-unuttum") return { type: "password", mode: "forgot", query };
  if (pathname === "/sifre-sifirla") return { type: "password", mode: "reset", query };
  if (pathname === "/yardim") return { type: "help", query };
  if (pathname === "/iade-degisim") return { type: "return-exchange", query };
  if (pathname === "/siparis-takibi") return { type: "tracking", query };
  if (pathname === "/iletisim") return { type: "public-contact", query };
  if (pathname === "/destek") return { type: "support", query };
  if (LEGAL_ROUTE_SLUGS.has(pathname)) return { type: "legal", slug: LEGAL_ROUTE_SLUGS.get(pathname), query };
  if (pathname === "/") return { type: "home", query };
  return { type: "not-found", query };
}

function useRoute() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onHash = () => {
      const nextRoute = parseRoute();
      setRoute(nextRoute);
      window.scrollTo({ top: 0, behavior: motionBehavior() });
      const profileFocusRequested = nextRoute.type === "account"
        && nextRoute.section === "overview"
        && nextRoute.query.get("focus") === "profile";
      if (!profileFocusRequested) {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => focusMainContent()));
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return { route, loading: false };
}

import {getVisualContent} from "../../sandbox/visualDesign.js";
function Logo({ onClick, surface = "dark" }) {
  const siteDocument = useSandbox("web", isDraftPreview());
  const label = siteDocument.chrome?.header?.logoText || "NovaStore";
  const logoContent=getVisualContent(siteDocument.design,"logoImage");
  return (
    <a className={`brand brand--${surface}-surface`} href="#/" aria-label={`${label} ana sayfa`} onClick={onClick}>
      {logoContent.imageUrl ? <img data-visual-element="logoImage" src={logoContent.imageUrl} alt={logoContent.alt||label} style={{maxWidth:"180px",maxHeight:"60px",objectFit:"contain"}}/> : ["NovaStore","Nova Store"].includes(label) ? <><span>Nova</span>{" "}<strong>Store</strong></> : <span>{label}</span>}
    </a>
  );
}

function motionBehavior() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function TrustBar() {
  const siteDocument = useSandbox("web",isDraftPreview());
  const header = siteDocument.chrome?.header || {};
  if(header.showAnnouncement === false || !header.announcement) return null;
  return <div className="trust-bar studio-header-announcement"><div className="shell trust-bar__content"><span>{header.announcement}</span></div></div>;
}

function LegacyTrustBar() {
  return (
    <div className="trust-bar">
      <div className="shell trust-bar__content">
        <span><Truck weight="bold" /> Teslimat seçenekleri ödeme adımında</span>
        <span><ArrowsClockwise weight="bold" /> İade desteği yardım merkezinde</span>
        <span><ShieldCheck weight="bold" /> Güvenli ödeme</span>
        <a href="#/siparis-takibi">Sipariş takibi</a>
        <a href="#/yardim">Yardım Merkezi</a>
      </div>
    </div>
  );
}

function SearchBox({ onSearch }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef(null);
  const suggestions = useMemo(() => {
    const needle = normalizeSearchText(value);
    if (needle.length < 2) return [];
    return getVisibleProducts()
      .filter((product) => normalizeSearchText(`${product.name} ${product.brand}`).includes(needle))
      .slice(0, 4);
  }, [value]);

  function submit(event) {
    event.preventDefault();
    const term = value.trim();
    if (!term) return;
    setFocused(false);
    onSearch(term);
  }

  return (
    <div className="search-wrap" ref={wrapRef}>
      <form className="search-box" role="search" onSubmit={submit}>
        <label className="sr-only" htmlFor="global-search">Ürün, kategori veya marka ara</label>
        <MagnifyingGlass aria-hidden="true" />
        <input
          id="global-search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={(event) => { if (!wrapRef.current?.contains(event.relatedTarget)) setFocused(false); }}
          placeholder="Ürün, kategori veya marka ara"
          aria-label="Site genelinde ara"
          autoComplete="off"
        />
        <button type="submit" aria-label="Ara"><MagnifyingGlass weight="bold" /></button>
      </form>
      {focused && suggestions.length > 0 && (
        <div className="search-suggestions" id="search-suggestions" role="region" aria-label="Arama önerileri">
          <div className="suggestions-label">Ürün önerileri</div>
          {suggestions.map((product) => (
            <button key={product.id} type="button" onClick={() => { setFocused(false); navigate(`/urun/${product.slug}`); }}>
              <img src={productImage(product)} alt="" />
              <span><strong>{product.name}</strong><small>{product.brand} · {money.format(product.price)}</small></span>
              <CaretRight aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HeaderAction({ icon: Icon, label, detail, badge, onClick, buttonRef, expanded, controls, className, accessibleName }) {
  return (
    <button ref={buttonRef} className={cx("header-action", className)} type="button" onClick={onClick} aria-label={accessibleName || `${label}: ${detail}`} aria-haspopup={controls ? "dialog" : undefined} aria-expanded={controls ? expanded : undefined} aria-controls={controls}>
      <span className="header-action__icon"><Icon size={22} />{badge > 0 && <b>{badge}</b>}</span>
      <span><small>{label}</small><strong>{detail}</strong></span>
    </button>
  );
}

function HeaderLink({ icon: Icon, label, detail, href, className }) {
  return <a className={cx("header-action", "header-action-link", className)} href={href} aria-label={`${label}: ${detail}`}><span className="header-action__icon"><Icon size={22} /></span><span><small>{label}</small><strong>{detail}</strong></span></a>;
}

function MegaMenu({ root, onRootChange, onClose }) {
  const roots = getVisibleRoots();
  const firstLevel = getVisibleChildren(root.id);
  const campaignFallback = root.slug === "elektronik" ? megaElectronicsImage : (ROOT_IMAGES[root.slug] || heroEditorial);
  const campaignImage = categoryImage({ ...root, imageUrl: root.bannerUrl || root.imageUrl }, campaignFallback);
  const featuredProducts = stockFirst(getProductsForCategory(root.id)).slice(0, 4);

  return (
    <div className="mega-panel" id="mega-navigation" aria-label={`${root.name} alt kategorileri`}>
      <div className="mega-panel__roots">
        <span className="mega-eyebrow">Kategoriler</span>
        {roots.map((item) => {
          const Icon = ROOT_ICONS[item.slug] || Storefront;
          return (
            <button
              key={item.id}
              className={cx("mega-root", item.id === root.id && "is-active")}
              type="button"
              onMouseEnter={() => onRootChange(item)}
              onFocus={() => onRootChange(item)}
              onClick={() => navigate(`/kategori/${item.canonicalPath}`)}
            >
              <Icon size={20} />
              <span data-visual-category-part="text">{item.name}</span>
              <CaretRight size={15} />
            </button>
          );
        })}
      </div>

      <div className="mega-panel__content">
        <div className="mega-title-row">
          <div><span className="mega-eyebrow">{root.name}</span><h2>Öne çıkan kategoriler</h2></div>
          <a href={`#/kategori/${root.canonicalPath}`} onClick={onClose}>Tüm {root.name} ürünlerini gör <CaretRight /></a>
        </div>
        <div className="mega-columns">
          {firstLevel.slice(0, 4).map((group) => {
            const leaves = getVisibleChildren(group.id);
            const discoveryLinks = (MEGA_DISCOVERY_TERMS[group.id] || [...new Set(getProductsForCategory(group.id).map((product) => product.brand).filter(Boolean))].map((brand) => [`${brand} seçkisi`, brand]))
              .slice(0, Math.max(0, 5 - (leaves.length || 1)));
            return (
              <section key={group.id}>
                <a className="mega-group-title" href={`#/kategori/${group.canonicalPath}`} onClick={onClose}>{group.name}<CaretRight /></a>
                <ul>
                  {(leaves.length ? leaves : [group]).slice(0, 6).map((leaf) => (
                    <li key={leaf.id}><a href={`#/kategori/${leaf.canonicalPath}`} onClick={onClose}>{leaf.name}</a></li>
                  ))}
                  {discoveryLinks.map(([label, term]) => <li key={`${group.id}-${label}`}><a href={`#/arama?q=${encodeURIComponent(term)}`} onClick={onClose}>{label}</a></li>)}
                </ul>
                {leaves.length > 6 && <a className="mega-more" href={`#/kategori/${group.canonicalPath}`} onClick={onClose}>Tümünü gör</a>}
              </section>
            );
          })}
        </div>
        <div className="mega-popular">
          <strong>Öne çıkan seçimler</strong>
          {featuredProducts.map((product) => (
            <a key={product.id} href={`#/urun/${product.slug}`} onClick={onClose}>
              <img src={productImage(product)} alt="" />
              <span>{productEyebrow(product)}<small>{product.name}</small></span>
              <CaretRight />
            </a>
          ))}
        </div>
      </div>

      <a className="mega-campaign" href={`#/kategori/${root.canonicalPath}`} onClick={onClose}>
        <img src={campaignImage} alt="" />
        <span className="mega-campaign__shade" aria-hidden="true" />
        <span className="mega-campaign__copy"><small>Nova seçkisi</small><strong>{root.name} seçkisi</strong><span>Keşfet <CaretRight /></span></span>
      </a>
    </div>
  );
}

function CategoryNavigation({ onMobileOpen, drawerOpen }) {
  const roots = getVisibleRoots();
  const siteDocument = useSandbox("web", isDraftPreview());
  const navigationItems = (siteDocument.menus || []).filter(item => item.enabled !== false).map(item => {
    const category = String(item.target).startsWith("category:") ? getCategoryById(String(item.target).slice(9)) : null;
    return { ...item, category, label:getVisualContent(siteDocument.design,`category:${category?.id}:text`).text ?? item.label };
  });
  const [open, setOpen] = useState(false);
  const [activeRoot, setActiveRoot] = useState(roots[0]);
  const [railState, setRailState] = useState({ overflow: false, canStart: false, canEnd: false });
  const closeTimer = useRef(null);
  const containerRef = useRef(null);
  const railRef = useRef(null);
  const suppressFocusOpen = useRef(false);

  const syncRailState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
    const next = {
      overflow: maxScroll > 2,
      canStart: rail.scrollLeft > 2,
      canEnd: rail.scrollLeft < maxScroll - 2,
    };
    setRailState((current) => current.overflow === next.overflow && current.canStart === next.canStart && current.canEnd === next.canEnd ? current : next);
  }, []);

  const scrollCategoryRail = (direction) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(180, rail.clientWidth * .62), behavior: motionBehavior() });
    window.setTimeout(syncRailState, 280);
  };

  function cancelClose() {
    window.clearTimeout(closeTimer.current);
  }

  function scheduleClose() {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 320);
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && open) {
        suppressFocusOpen.current = true;
        setOpen(false);
        containerRef.current?.querySelector("button[aria-expanded='true']")?.focus();
        window.requestAnimationFrame(() => { suppressFocusOpen.current = false; });
      }
    };
    const onClick = (event) => {
      if (open && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onHashChange = () => setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onClick);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onClick);
      window.removeEventListener("hashchange", onHashChange);
      window.clearTimeout(closeTimer.current);
    };
  }, [open]);

  useEffect(() => {
    syncRailState();
    const rail = railRef.current;
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(syncRailState) : null;
    if (rail) observer?.observe(rail);
    window.addEventListener("resize", syncRailState);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncRailState);
    };
  }, [roots.length, syncRailState]);

  return (
    <div className={cx("category-navigation", open && "is-mega-open")} ref={containerRef} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <div className="shell category-navigation__row">
        <button className="all-categories-button" type="button" onClick={onMobileOpen} aria-haspopup="dialog" aria-expanded={drawerOpen} aria-controls="category-drawer">
          <List size={21} /> <span>Tüm Kategoriler</span>
        </button>
        <div className={cx("category-rail", railState.overflow && "has-overflow", railState.canStart && "can-scroll-start", railState.canEnd && "can-scroll-end")}>
          <button className="category-rail__control is-previous" type="button" aria-label="Önceki kategorileri göster" disabled={!railState.canStart} onClick={() => scrollCategoryRail(-1)}><CaretRight /></button>
          <nav ref={railRef} aria-label="Ürün kategorileri" onScroll={syncRailState}>
            <ul>
              {navigationItems.map((item) => { const root = item.category; if (!root) return <li key={item.id}><a href={targetHref(item.target,siteDocument)} onClick={() => setOpen(false)}>{item.label}</a></li>; return (
                <li key={item.id} data-visual-category-id={root.id} onMouseEnter={() => { cancelClose(); setActiveRoot(root); setOpen(true); }} className={cx(open && activeRoot.id === root.id && "is-active")}>
                  <a data-visual-category-part="text" href={targetHref(item.target,siteDocument)} onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })} onClick={() => setOpen(false)}>{item.label}</a>
                  <button
                    type="button"
                    aria-label={`${root.name} alt kategorilerini aç`}
                    aria-expanded={open && activeRoot.id === root.id}
                    aria-controls="mega-navigation"
                    onMouseEnter={() => { cancelClose(); setActiveRoot(root); setOpen(true); }}
                    onFocus={(event) => {
                      event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" });
                      if (suppressFocusOpen.current) return;
                      setActiveRoot(root);
                      setOpen(true);
                    }}
                    onClick={() => {
                      setActiveRoot(root);
                      setOpen((current) => activeRoot.id === root.id ? !current : true);
                    }}
                  ><CaretDown size={13} /></button>
                </li>
              ); })}
            </ul>
          </nav>
          <button className="category-rail__control is-next" type="button" aria-label="Sonraki kategorileri göster" disabled={!railState.canEnd} onClick={() => scrollCategoryRail(1)}><CaretRight /></button>
        </div>
        <a className="deals-link" href="#/koleksiyon/firsatlar" onClick={() => setOpen(false)}><BadgePercent /> Fırsatlar</a>
      </div>
      {open && <div className="shell mega-shell"><MegaMenu root={activeRoot} onRootChange={setActiveRoot} onClose={() => setOpen(false)} /></div>}
    </div>
  );
}

function Header({ route, authenticated, cartCount, favoriteCount, notificationUnreadCount, onCartOpen, onMobileOpen, onAccountOpen, accountDetail, cartTriggerRef, mobileMenuOpen, cartOpen }) {
  const [pocketSearchOpen, setPocketSearchOpen] = useState(false);
  useEffect(() => { if (pocketSearchOpen) { const frame = window.requestAnimationFrame(() => document.getElementById("global-search")?.focus()); return () => window.cancelAnimationFrame(frame); } }, [pocketSearchOpen]);
  const AccountIcon = authenticated ? User : SignIn;
  const siteDocument = useSandbox("web",isDraftPreview());
  const header = siteDocument.chrome?.header || {};
  const family = resolveStudioFamily(siteDocument.theme?.family);
  if (family !== "nova-commerce") {
    const brand = <div className="demo-brand"><Logo surface="dark" />{header.tagline && family !== "pocket" && <small>{header.tagline}</small>}</div>;
    const menuButton = <button className="demo-category-trigger" type="button" onClick={onMobileOpen} aria-label="Tüm kategorileri aç" aria-haspopup="dialog" aria-expanded={mobileMenuOpen} aria-controls="category-drawer"><GridFour /><span>Kategoriler</span></button>;
    const search = header.showSearch !== false && <div className="demo-header-search"><SearchBox onSearch={term => { setPocketSearchOpen(false); navigate(`/arama?q=${encodeURIComponent(term)}`); }} /></div>;
    const actions = <nav className="demo-header-actions" aria-label="Hesap ve alışveriş"><button type="button" className="demo-notifications" aria-label={`Bildirimler${notificationUnreadCount ? `, ${notificationUnreadCount} okunmamış` : ""}`} onClick={() => navigate("/hesabim/bildirimler")}><Bell />{notificationUnreadCount > 0 && <b>{notificationUnreadCount}</b>}</button><button type="button" className="demo-account-entry" aria-label={authenticated ? `Hesabım: ${accountDetail}` : "Giriş yap"} onClick={onAccountOpen}><AccountIcon /><span>{authenticated ? "Hesabım" : "Giriş yap"}</span></button><a href="#/favoriler" aria-label={`Favorilerim, ${favoriteCount} ürün`}><Heart />{favoriteCount > 0 && <b>{favoriteCount}</b>}</a><button ref={cartTriggerRef} type="button" className="demo-cart-entry" onClick={onCartOpen} aria-label={`Sepetim, ${cartCount} ürün`} aria-expanded={cartOpen} aria-controls="cart-drawer" aria-haspopup="dialog"><ShoppingBag /><span>Sepetim</span>{cartCount > 0 && <b>{cartCount}</b>}</button></nav>;
    const links = <nav className="demo-header-links" aria-label="Mağaza menüsü">{(siteDocument.menus || []).filter(item => item.enabled !== false).map(item => <a key={item.id} data-visual-category-id={item.target?.startsWith('category:')?item.target.slice(9):undefined} data-visual-category-part="text" href={targetHref(item.target,siteDocument)}>{getVisualContent(siteDocument.design,`category:${item.target?.slice(9)}:text`).text ?? item.label}</a>)}</nav>;
    let layout;
    if (family === "pocket") layout = <div className="shell demo-pocket-header"><nav className="demo-pocket-mobilebar" aria-label="Uygulama araçları"><button type="button" onClick={() => navigate("/hesabim/adresler")} aria-label="Teslimat adreslerim"><MapPin /></button>{header.showSearch !== false && <button type="button" onClick={() => setPocketSearchOpen(value => !value)} aria-label={pocketSearchOpen ? "Aramayı kapat" : "Ürün ara"} aria-expanded={pocketSearchOpen} aria-controls="demo-pocket-discovery"><MagnifyingGlass /></button>}<button type="button" onClick={() => navigate("/hesabim/bildirimler")} aria-label={`Bildirimler${notificationUnreadCount ? `, ${notificationUnreadCount} okunmamış` : ""}`}><Bell />{notificationUnreadCount > 0 && <b>{notificationUnreadCount}</b>}</button></nav><div className="demo-pocket-identity">{brand}<span className="demo-pocket-greeting">Bugün ne keşfetmek istersin?</span><PocketBottomNav route={route} document={siteDocument} cartCount={cartCount} favoriteCount={favoriteCount} onCategoriesOpen={onMobileOpen} categoriesOpen={mobileMenuOpen}/></div><div id="demo-pocket-discovery" className="demo-pocket-discovery">{search}{menuButton}</div>{links}</div>;
    else if (family === "workspace" || family === "tech") layout = <><div className="shell demo-console-toolbar">{menuButton}{brand}{search}{actions}</div><div className="demo-console-navigation"><div className="shell">{links}<a className="demo-header-service" href={family === "tech" ? "#/koleksiyon/firsatlar" : "#/yardim"}>{family === "tech" ? <BadgePercent /> : <Question />}{family === "tech" ? "Teknoloji fırsatları" : "Yardım merkezi"}</a></div></div></>;
    else if (family === "market") layout = <><div className="shell demo-market-header">{brand}{search}{actions}</div><div className="shell demo-market-navigation">{menuButton}{links}<a className="demo-market-list" href="#/favoriler"><Heart /> Alışveriş listem</a></div></>;
    else if (family === "fashion") layout = <><div className="shell demo-fashion-header">{menuButton}{brand}{actions}</div><div className="shell demo-fashion-navigation">{links}{search}</div></>;
    else layout = <><div className="shell demo-editorial-masthead">{menuButton}{brand}{actions}</div><div className="shell demo-editorial-navigation">{links}{search}</div></>;
    return <header className={cx("site-header demo-site-header", `demo-header-${family}`, header.showSearch === false && "studio-search-hidden")} data-header-family={family} data-search-open={pocketSearchOpen}><TrustBar />{layout}</header>;
  }
  return (
    <header className={cx("site-header", header.showSearch === false && "studio-search-hidden")}>
      <TrustBar />
      <div className="shell main-header">
        <button className="mobile-menu-trigger" type="button" onClick={onMobileOpen} aria-label="Menüyü aç" aria-haspopup="dialog" aria-expanded={mobileMenuOpen} aria-controls="category-drawer"><List /></button>
        <div className="studio-brand-lockup"><Logo surface="dark" />{header.tagline && <small>{header.tagline}</small>}</div>
        {header.showSearch !== false && <SearchBox onSearch={(term) => navigate(`/arama?q=${encodeURIComponent(term)}`)} />}
        <div className="header-actions">
          <HeaderAction icon={Bell} label="Bildirimler" detail={notificationUnreadCount ? `${notificationUnreadCount} okunmamış` : "Güncellemelerim"} badge={notificationUnreadCount} onClick={() => navigate("/hesabim/bildirimler")} />
          <HeaderAction className={!authenticated && "is-login-entry"} icon={AccountIcon} label={authenticated ? "Hesabım" : "Hesap"} detail={accountDetail} accessibleName={authenticated ? `Hesabım: ${accountDetail}` : "Giriş yap"} onClick={onAccountOpen} />
          <HeaderAction icon={Heart} label="Listem" detail="Favorilerim" badge={favoriteCount} onClick={() => navigate("/favoriler")} />
          <HeaderAction className="cart-header-action" icon={ShoppingCart} label="Sepetim" detail={cartCount ? `${cartCount} ürün` : "0 ürün"} badge={cartCount} onClick={onCartOpen} buttonRef={cartTriggerRef} expanded={cartOpen} controls="cart-drawer" />
          <HeaderLink className="seller-recruitment-action" icon={Storefront} label="Ortağımız Ol" detail="NovaStore'da sat" href={SELLER_RECRUITMENT_URL} />
        </div>
      </div>
      <CategoryNavigation onMobileOpen={onMobileOpen} drawerOpen={mobileMenuOpen} />
    </header>
  );
}

function MobileCategoryDrawer({ open, onClose, returnFocusRef, authenticated, cartCount, favoriteCount, notificationUnreadCount }) {
  const roots = getVisibleRoots();
  const siteDocument = useSandbox("web",isDraftPreview());
  const AccountIcon = authenticated ? User : SignIn;
  const [stack, setStack] = useState([]);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  const current = stack.length ? getCategoryById(stack[stack.length - 1]) : null;
  const items = current ? getVisibleChildren(current.id) : (siteDocument.menus || []).filter(menu=>menu.enabled!==false).map(menu=>{
    const category = String(menu.target).startsWith("category:") ? getCategoryById(String(menu.target).slice(9)) : null;
    return {...(category || {id:menu.id,slug:"",canonicalPath:""}),menuId:menu.id,name:menu.label,studioTarget:menu.target};
  });

  const closeDrawer = () => {
    onClose();
    restoreFocus(returnFocusRef);
  };

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("is-locked");
    const restorePage = isolatePageFromModal();
    window.setTimeout(() => closeRef.current?.focus(), 20);
    const onKey = (event) => {
      if (event.key === "Escape") closeDrawer();
      else keepFocusInDialog(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKey);
      restorePage();
    };
  }, [open, onClose, returnFocusRef]);

  useEffect(() => { if (!open) setStack([]); }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="overlay-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDrawer()}>
      <div id="category-drawer" ref={dialogRef} className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Müşteri menüsü" tabIndex="-1">
        <div className="drawer-head">
          {current ? <button type="button" onClick={() => setStack((value) => value.slice(0, -1))}><ArrowLeft /> Geri</button> : <Logo surface="light" onClick={closeDrawer} />}
          <button ref={closeRef} className="icon-button" type="button" onClick={closeDrawer} aria-label="Menüyü kapat"><X /></button>
        </div>
        <div className="mobile-drawer__body">
          <span className="drawer-kicker">{current ? "Kategori" : "Tüm kategoriler"}</span>
          <h2>{current?.name || "Ne arıyorsun?"}</h2>
          {!current && <nav className="mobile-customer-shortcuts" aria-label="Müşteri bağlantıları">
            <a href="#/" onClick={closeDrawer}><House /><span>Ana Sayfa</span></a>
            <a href="#/favoriler" onClick={closeDrawer}><Heart /><span>Favoriler</span>{favoriteCount > 0 && <b>{favoriteCount}</b>}</a>
            <a className={cx(!authenticated && "is-login-entry")} href={`#${customerAccountEntryPath(authenticated)}`} onClick={closeDrawer}><AccountIcon /><span>{authenticated ? "Hesabım" : "Giriş yap"}</span></a>
            <a href="#/sepet" onClick={closeDrawer}><ShoppingCart /><span>Sepet</span>{cartCount > 0 && <b>{cartCount}</b>}</a>
            {authenticated && <a href="#/hesabim/bildirimler" onClick={closeDrawer}><Bell /><span>Bildirimler</span>{notificationUnreadCount > 0 && <b>{notificationUnreadCount}</b>}</a>}
          </nav>}
          {current && <a className="drawer-view-all" href={`#/kategori/${current.canonicalPath}`} onClick={closeDrawer}>Tüm {current.name} ürünlerini gör <CaretRight /></a>}
          <div className="mobile-category-list">
            {items.map((item) => {
              const children = getVisibleChildren(item.id);
              const Icon = ROOT_ICONS[item.slug] || Storefront;
              return (
                <div key={item.menuId || item.id} className="mobile-category-row">
                  <a href={item.studioTarget ? targetHref(item.studioTarget,siteDocument) : `#/kategori/${item.canonicalPath}`} onClick={closeDrawer}><Icon /><span>{item.name}</span></a>
                  {children.length > 0 && <button type="button" aria-label={`${item.name} alt kategorilerine git`} onClick={() => setStack((value) => [...value, item.id])}><CaretRight /></button>}
                </div>
              );
            })}
          </div>
          {!current && <a className="mobile-seller-recruitment" href={SELLER_RECRUITMENT_URL}><Storefront /><span><strong>Ortağımız Ol</strong><small>NovaStore’da satış yap ve müşterilere ulaş</small></span><CaretRight /></a>}
        </div>
        <div className="drawer-footer"><ShieldCheck /><span><strong>NovaStore güvencesi</strong><small>Güvenli ödeme ve hesap destekli işlemler</small></span></div>
      </div>
    </div>, document.body
  );
}

function Breadcrumbs({ category, productName }) {
  const trail = category ? getBreadcrumb(category.id) : [];
  return (
    <nav className="breadcrumbs" aria-label="İçerik yolu">
      <ol>
        <li><a href="#/">Ana Sayfa</a></li>
        {trail.map((item, index) => {
          const last = index === trail.length - 1 && !productName;
          return <li key={item.id}>{last ? <span aria-current="page">{item.name}</span> : <a href={`#/kategori/${item.canonicalPath}`}>{item.name}</a>}</li>;
        })}
        {productName && <li><span aria-current="page">{productName}</span></li>}
      </ol>
    </nav>
  );
}

function ProductCard({ product, favorite, onFavorite, onAdd }) {
  return <CustomerProductCard product={product} brand={productEyebrow(product)} favorite={favorite} onFavorite={onFavorite} onAdd={onAdd} mediaFallback={productImage(product)} />;
}

function ProductGrid({ items, favorites, onFavorite, onAdd, compact = false }) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <MagnifyingGlass size={38} />
        <h3>Bu seçimde ürün bulamadık</h3>
        <p>Filtrelerden birini kaldırarak daha fazla sonuç görebilirsin.</p>
      </div>
    );
  }
  return (
    <div className={cx("product-grid", compact && "is-compact")}>
      {items.map((product) => <ProductCard key={product.id} product={product} favorite={favorites.has(product.id)} onFavorite={onFavorite} onAdd={onAdd} />)}
    </div>
  );
}

function BenefitStrip() {
  const benefits = [
    [Truck, "Teslimat seçenekleri", "Ödeme adımında doğrulanır"],
    [ShieldCheck, "Güvenli ödeme", "Güvenli sağlayıcıya yönlendirilir"],
    [ArrowsClockwise, "İade desteği", "Yardım merkezinden erişilir"],
    [Headphones, "Nova desteği", "Mevcut destek kanalına erişim"],
  ];
  return <div className="benefit-strip">{benefits.map(([Icon, title, copy]) => <div key={title}><Icon /><span><strong>{title}</strong><small>{copy}</small></span></div>)}</div>;
}

function ProfileCompletionNotice({ missingFields, onDismiss, onOpen }) {
  const missingCopy = missingFields.length ? `${missingFields.join(" ve ")} bilgini tamamla.` : "Profil bilgilerini tamamla.";
  return <div className="profile-completion-notice" role="status" aria-live="polite"><button className="profile-completion-notice__body" type="button" onClick={onOpen} aria-label="Eksik hesap bilgilerini tamamla"><span className="profile-completion-notice__icon"><User /></span><span><small>Hesap hatırlatması</small><strong>Hesap bilgilerini tamamla</strong><p>{missingCopy} Teslimat ve hesap işlemlerini daha rahat yönet.</p><b>Bilgilerimi tamamla <CaretRight /></b></span></button><button className="profile-completion-notice__close" type="button" onClick={onDismiss} aria-label="Hesap bilgileri hatırlatmasını kapat"><X /></button></div>;
}

function HomePage({ favorites, onFavorite, onAdd }) {
  const roots = getVisibleRoots();
  const featured = sortProducts(getVisibleProducts(), "featured").slice(0, 8);
  const primaryRoot = roots[0] || null;
  const homeRoot = roots.find((root) => root.slug === "ev-yasam") || null;
  return (
    <main id="main-content" className="page page-home">
      <section className="home-hero shell">
        <img src={heroEditorial} alt="Modern telefon, dizüstü bilgisayar, kulaklık ve akıllı saat seçkisi" />
        <div className="home-hero__shade" aria-hidden="true" />
        <div className="home-hero__copy">
          <span className="section-kicker">Nova seçkisi</span>
          <h1>İyi teknoloji,<br />doğru seçimle başlar.</h1>
          <p>İhtiyacına göre düzenlenmiş kategoriler, karşılaştırılabilir ürünler ve güvenli alışveriş deneyimi.</p>
          <div><a className="primary-button" href={primaryRoot ? `#/kategori/${primaryRoot.canonicalPath}` : "#/"}>{primaryRoot ? `${primaryRoot.name} kategorisini keşfet` : "Ürünleri keşfet"} <CaretRight /></a><a className="ghost-button" href="#/koleksiyon/firsatlar">Günün fırsatları</a></div>
        </div>
      </section>
      <div className="shell"><BenefitStrip /></div>
      <section className="section shell">
        <div className="section-heading"><div><span className="section-kicker">Kategoriler</span><h2>Aradığını kolayca bul</h2></div><p>Her kategori, ihtiyacına uygun alt başlıklar ve filtrelerle düzenlendi.</p></div>
        <div className="root-category-grid">
          {roots.map((root) => (
            <a className="root-category-card" key={root.id} data-visual-category-id={root.id} href={`#/kategori/${root.canonicalPath}`}>
              <img data-visual-category-part="image" src={categoryImage(root)} alt="" />
              <span className="root-category-card__shade" aria-hidden="true" />
              <span><small>{root.descendantVisibleProductCount || getProductsForCategory(root.id).length} ürün</small><strong data-visual-category-part="text">{root.name}</strong><b>Keşfet <CaretRight /></b></span>
            </a>
          ))}
        </div>
      </section>
      <section className="section section--soft">
        <div className="shell">
          <div className="section-heading"><div><span className="section-kicker">Öne çıkanlar</span><h2>Öne çıkan ürünler</h2></div><a className="text-link" href="#/koleksiyon/firsatlar">Tümünü gör <CaretRight /></a></div>
          <ProductGrid items={featured} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} />
        </div>
      </section>
      {homeRoot && <section className="section shell category-story">
        <div><span className="section-kicker">Ev & Yaşam</span><h2>Yaşam alanını<br />yeniden keşfet.</h2><p>İşlevi ve tasarımı bir araya getiren ev teknolojileri, küçük ev aletleri ve dekorasyon seçkileri.</p><a className="primary-button" href={`#/kategori/${homeRoot.canonicalPath}`}>Koleksiyonu incele <CaretRight /></a></div>
        <img src={categoryImage(homeRoot, homeImage)} alt="Modern bir oturma odası ve ev ürünleri" />
      </section>}
    </main>
  );
}

function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="filter-section">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}><span>{title}</span><CaretDown className={open ? "is-rotated" : ""} /></button>
      {open && <div className="filter-section__body">{children}</div>}
    </section>
  );
}

function Filters({ facets, selectedBrands, setSelectedBrands, selectedColors, setSelectedColors, selectedStorage, setSelectedStorage, inStock, setInStock, fastDelivery, setFastDelivery, minRating, setMinRating, minPrice, setMinPrice, maxPrice, setMaxPrice, onClear }) {
  function toggleValue(setter, value) {
    setter((current) => {
      const next = new Set(current);
      next.has(value) ? next.delete(value) : next.add(value);
      return next;
    });
  }
  const priceMin = Math.max(0, Math.floor(facets.price?.min || 0));
  const priceMax = Math.max(priceMin, Math.ceil(facets.price?.max || priceMin));
  const numericMin = typeof minPrice === "number" && Number.isFinite(minPrice) ? minPrice : priceMin;
  const numericMax = typeof maxPrice === "number" && Number.isFinite(maxPrice) ? maxPrice : priceMax;
  const effectiveMin = Math.min(priceMax, Math.max(priceMin, numericMin));
  const effectiveMax = Math.max(effectiveMin, Math.min(priceMax, numericMax));
  return (
    <div className="filters-panel">
      <div className="filters-title"><span><Funnel /> Filtreler</span><button type="button" onClick={onClear}>Temizle</button></div>
      {(facets.brands || []).length > 0 && <FilterSection title="Marka">
        {(facets.brands || []).map(({ value: brand, count }) => <label className="check-option" key={brand}><input type="checkbox" checked={selectedBrands.has(brand)} onChange={() => toggleValue(setSelectedBrands, brand)} /><span><Check />{brand}</span><small>{count}</small></label>)}
      </FilterSection>}
      <FilterSection title="Fiyat aralığı">
        <div className="price-inputs"><label><span>En az</span><input aria-label="En düşük fiyat" type="number" value={minPrice ?? priceMin} min={priceMin} max={effectiveMax} step="100" onChange={(event) => setMinPrice(event.target.value === "" ? "" : Number(event.target.value))} onBlur={() => setMinPrice((current) => current === "" || current === null ? null : Math.min(effectiveMax, Math.max(priceMin, Number(current))))} /></label><label><span>En çok</span><input aria-label="En yüksek fiyat alanı" type="number" value={maxPrice ?? priceMax} min={effectiveMin} max={priceMax} step="100" onChange={(event) => setMaxPrice(event.target.value === "" ? "" : Number(event.target.value))} onBlur={() => setMaxPrice((current) => current === "" || current === null ? null : Math.min(priceMax, Math.max(effectiveMin, Number(current))))} /></label></div>
        <input className="price-range" aria-label="En yüksek fiyat" type="range" min={effectiveMin} max={priceMax || 1} step="100" value={effectiveMax} disabled={priceMax <= effectiveMin} onChange={(event) => setMaxPrice(Number(event.target.value))} />
      </FilterSection>
      {(facets.rating || []).some((item) => item.count > 0) && <FilterSection title="Ürün puanı">
        {[4.8, 4.5, 4].map((rating) => <label className="check-option" key={rating}><input type="checkbox" checked={minRating === rating} onChange={() => setMinRating((current) => current === rating ? null : rating)} /><span className="stars"><Check />{Array.from({ length: 5 }, (_, index) => <Star key={index} weight={index < Math.floor(rating) ? "fill" : "regular"} />)} {rating} ve üzeri</span><small>{facets.rating?.find((item) => item.value === rating)?.count || 0}</small></label>)}
      </FilterSection>}
      {(facets.colors || []).length > 1 && <FilterSection title="Renk" defaultOpen={false}>{facets.colors.map(({ value, count }) => <label className="check-option" key={value}><input type="checkbox" checked={selectedColors.has(value)} onChange={() => toggleValue(setSelectedColors, value)} /><span><Check />{value}</span><small>{count}</small></label>)}</FilterSection>}
      {(facets.storage || []).length > 1 && <FilterSection title="Kapasite" defaultOpen={false}>{facets.storage.map(({ value, count }) => <label className="check-option" key={value}><input type="checkbox" checked={selectedStorage.has(value)} onChange={() => toggleValue(setSelectedStorage, value)} /><span><Check />{value}</span><small>{count}</small></label>)}</FilterSection>}
      <FilterSection title="Teslimat">
        {(facets.fastDelivery?.find((item) => item.value === true)?.count || 0) > 0 && <label className="check-option"><input type="checkbox" checked={fastDelivery} onChange={(event) => setFastDelivery(event.target.checked)} /><span><Check />Hızlı teslimat</span><small>{facets.fastDelivery?.find((item) => item.value === true)?.count || 0}</small></label>}
        <label className="check-option"><input type="checkbox" checked={inStock} onChange={(event) => setInStock(event.target.checked)} /><span><Check />Stokta</span><small>{facets.availability?.find((item) => item.value === "in-stock")?.count || 0}</small></label>
      </FilterSection>
    </div>
  );
}

function ProductListing({ category, initialItems, title, favorites, onFavorite, onAdd }) {
  const [selectedBrands, setSelectedBrands] = useState(new Set());
  const [selectedColors, setSelectedColors] = useState(new Set());
  const [selectedStorage, setSelectedStorage] = useState(new Set());
  const [inStock, setInStock] = useState(false);
  const [fastDelivery, setFastDelivery] = useState(false);
  const [minRating, setMinRating] = useState(null);
  const [minPrice, setMinPrice] = useState(null);
  const [maxPrice, setMaxPrice] = useState(null);
  const [sort, setSort] = useState("featured");
  const [mobileFilters, setMobileFilters] = useState(false);
  const [compact, setCompact] = useState(false);
  const mobileFilterTriggerRef = useRef(null);
  const mobileFilterCloseRef = useRef(null);
  const mobileFilterDialogRef = useRef(null);

  const closeMobileFilters = () => {
    setMobileFilters(false);
    restoreFocus(mobileFilterTriggerRef);
  };

  useEffect(() => {
    if (!mobileFilters) return;
    document.body.classList.add("is-locked");
    const restorePage = isolatePageFromModal();
    window.setTimeout(() => mobileFilterCloseRef.current?.focus(), 20);
    const onKey = (event) => {
      if (event.key === "Escape") closeMobileFilters();
      else keepFocusInDialog(event, mobileFilterDialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKey);
      restorePage();
    };
  }, [mobileFilters]);

  useEffect(() => {
    setSelectedBrands(new Set());
    setSelectedColors(new Set());
    setSelectedStorage(new Set());
    setInStock(false);
    setFastDelivery(false);
    setMinRating(null);
    setMinPrice(null);
    setMaxPrice(null);
    setSort("featured");
    setMobileFilters(false);
  }, [category?.id, title]);

  const facets = useMemo(() => buildFacets(initialItems), [initialItems]);
  const filtered = useMemo(() => {
    let result = initialItems.filter((product) => {
      if (selectedBrands.size && !selectedBrands.has(product.brand)) return false;
      if (selectedColors.size && !selectedColors.has(product.color)) return false;
      if (selectedStorage.size && !selectedStorage.has(product.storage)) return false;
      if (inStock && product.stock <= 0) return false;
      if (fastDelivery && !product.fastDelivery) return false;
      if (minRating && product.rating < minRating) return false;
      if (typeof minPrice === "number" && Number.isFinite(minPrice) && product.price < minPrice) return false;
      if (typeof maxPrice === "number" && Number.isFinite(maxPrice) && product.price > maxPrice) return false;
      return true;
    });
    return sortProducts(result, sort);
  }, [initialItems, selectedBrands, selectedColors, selectedStorage, inStock, fastDelivery, minRating, minPrice, maxPrice, sort]);

  const activeFilters = [...selectedBrands].map((brand) => ({ key: `brand-${brand}`, label: brand, remove: () => setSelectedBrands((current) => { const next = new Set(current); next.delete(brand); return next; }) }));
  activeFilters.push(...[...selectedColors].map((color) => ({ key: `color-${color}`, label: color, remove: () => setSelectedColors((current) => { const next = new Set(current); next.delete(color); return next; }) })));
  activeFilters.push(...[...selectedStorage].map((storage) => ({ key: `storage-${storage}`, label: storage, remove: () => setSelectedStorage((current) => { const next = new Set(current); next.delete(storage); return next; }) })));
  if (inStock) activeFilters.push({ key: "stock", label: "Stokta", remove: () => setInStock(false) });
  if (fastDelivery) activeFilters.push({ key: "fast", label: "Hızlı teslimat", remove: () => setFastDelivery(false) });
  if (minRating) activeFilters.push({ key: "rating", label: `${minRating}+ puan`, remove: () => setMinRating(null) });
  if (typeof minPrice === "number" && minPrice > facets.price.min) activeFilters.push({ key: "min-price", label: `En az ${money.format(minPrice)}`, remove: () => setMinPrice(null) });
  if (typeof maxPrice === "number" && maxPrice < facets.price.max) activeFilters.push({ key: "price", label: `En çok ${money.format(maxPrice)}`, remove: () => setMaxPrice(null) });

  const clear = () => { setSelectedBrands(new Set()); setSelectedColors(new Set()); setSelectedStorage(new Set()); setInStock(false); setFastDelivery(false); setMinRating(null); setMinPrice(null); setMaxPrice(null); };
  const filterProps = { facets, selectedBrands, setSelectedBrands, selectedColors, setSelectedColors, selectedStorage, setSelectedStorage, inStock, setInStock, fastDelivery, setFastDelivery, minRating, setMinRating, minPrice, setMinPrice, maxPrice, setMaxPrice, onClear: clear };

  return (
    <main id="main-content" className="page plp-page">
      <div className="shell">
        {category ? <Breadcrumbs category={category} /> : <Breadcrumbs />}
        <div className="plp-heading"><div><span className="section-kicker">{category ? "Kategori" : "NovaStore seçkisi"}</span><h1>{title}</h1><p>{filtered.length} ürün listeleniyor</p></div></div>
        {category && getVisibleChildren(category.id).length > 0 && <nav className="quick-subcategories" aria-label={`${category.name} alt kategorileri`}><a className="is-active" aria-current="page" href={`#/kategori/${category.canonicalPath}`}>Tümü</a>{getVisibleChildren(category.id).map((item) => <a key={item.id} href={`#/kategori/${item.canonicalPath}`}>{item.name}<small>{getProductsForCategory(item.id).length}</small></a>)}</nav>}
        <div className="mobile-toolbar"><button ref={mobileFilterTriggerRef} type="button" onClick={() => setMobileFilters(true)}><SlidersHorizontal /> Filtrele {activeFilters.length > 0 && <b>{activeFilters.length}</b>}</button><label><span className="sr-only">Sırala</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Önerilen</option><option value="price-low">En düşük fiyat</option><option value="price-high">En yüksek fiyat</option><option value="rating">En yüksek puan</option></select></label></div>
        {activeFilters.length > 0 && <div className="active-filters" aria-label="Seçili filtreler">{activeFilters.map((filter) => <button key={filter.key} type="button" onClick={filter.remove}>{filter.label}<X /></button>)}<button className="clear-all" type="button" onClick={clear}>Tümünü temizle</button></div>}
        <div className="plp-layout">
          <aside className="desktop-filters" aria-label="Ürün filtreleri"><Filters {...filterProps} /></aside>
          <section className="plp-results" aria-live="polite">
            <h2 className="sr-only">Ürün sonuçları</h2>
            <div className="results-toolbar"><span><strong>{filtered.length}</strong> sonuç</span><div className="view-buttons" aria-label="Görünüm"><button className={!compact ? "is-active" : ""} type="button" aria-pressed={!compact} onClick={() => setCompact(false)} aria-label="Geniş kart görünümü"><GridFour /></button><button className={compact ? "is-active" : ""} type="button" aria-pressed={compact} onClick={() => setCompact(true)} aria-label="Sıkışık kart görünümü"><List /></button></div><label><span>Sırala:</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Önerilen sıralama</option><option value="price-low">Fiyat: düşükten yükseğe</option><option value="price-high">Fiyat: yüksekten düşüğe</option><option value="rating">En yüksek puan</option><option value="new">Yeni eklenenler</option></select></label></div>
            <ProductGrid items={filtered} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} compact={compact} />
          </section>
        </div>
      </div>
      {mobileFilters && createPortal(<div className="overlay-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeMobileFilters()}><div ref={mobileFilterDialogRef} className="mobile-filter-drawer" role="dialog" aria-modal="true" aria-label="Filtreler" tabIndex="-1"><div className="drawer-head"><h2>Filtrele</h2><button ref={mobileFilterCloseRef} className="icon-button" type="button" onClick={closeMobileFilters} aria-label="Filtreleri kapat"><X /></button></div><Filters {...filterProps} /><div className="mobile-filter-apply"><button type="button" onClick={closeMobileFilters}>{filtered.length} ürünü göster</button></div></div></div>, document.body)}
    </main>
  );
}

function ProductDetail({ product, favorite, favorites, onFavorite, onAdd, session, community, detailPhase = "ready" }) {
  const category = getCategoryById(product.categoryId);
  const [quantity, setQuantity] = useState(1);
  const storageOptions = product.storage ? [product.storage] : [];
  const colorOptions = product.color ? [product.color] : [];
  const [selectedStorage, setSelectedStorage] = useState(storageOptions[0] || "Standart");
  const [activeTab, setActiveTab] = useState("description");
  const detailTabs = [
    { id: "description", label: "Ürün açıklaması" },
    { id: "features", label: "Teknik özellikler" },
    { id: "delivery", label: "Teslimat & iade" },
  ];
  const related = stockFirst(getProductsForCategory(category.id).filter((item) => item.id !== product.id)).slice(0, 4);
  const soldOut = product.stock <= 0;

  useEffect(() => {
    setQuantity((current) => soldOut ? 1 : Math.min(product.stock, Math.max(1, current)));
  }, [product.stock, soldOut]);

  function moveTabFocus(event, currentIndex) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? detailTabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + detailTabs.length) % detailTabs.length;
    const next = detailTabs[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`product-tab-${next.id}`)?.focus();
  }

  function tabContent(tabId) {
    if (tabId === "description") return <><p>{product.description || "Bu ürün için açıklama henüz eklenmemiş."}</p>{product.features.length > 0 && <ul>{product.features.map((feature) => <li key={feature}><Check />{feature}</li>)}</ul>}</>;
    if (tabId === "features") {
      const facts = [
        product.brand ? ["Marka", product.brand] : null,
        product.color ? ["Renk", product.color] : null,
        product.storage ? ["Kapasite", product.storage] : null,
        ["Ürün kodu", product.id],
      ].filter(Boolean);
      return <dl>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
    }
    return <p>Teslimat yöntemi, kargo ücreti ve geçerli iade koşulları güvenli ödeme ve müşteri hesabı adımlarında doğrulanır.</p>;
  }

  return (
    <main id="main-content" className="page product-page">
      <div className="shell"><Breadcrumbs category={category} productName={product.name} />
        {detailPhase !== "ready" && <div className="integration-product-detail-status" role="status">{detailPhase === "loading" ? "Ürün ayrıntıları doğrulanıyor…" : "Ek ürün ayrıntıları alınamadı; güncel liste bilgileri gösteriliyor."}</div>}
        <div className="product-detail-grid">
          <section className="product-gallery" aria-label="Ürün görseli">{(soldOut || product.badge) && <span className="product-badge">{soldOut ? "Tükendi" : product.badge}</span>}<button className={cx("favorite-button", favorite && "is-active")} type="button" onClick={() => onFavorite(product.id)} aria-pressed={favorite} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}><Heart weight={favorite ? "fill" : "regular"} /></button><img src={productImage(product)} alt={product.name} /><span className="zoom-note"><span>Görseli büyütmek için üzerine gel</span><b>Ürün görseli</b></span></section>
          <section className="product-summary">
            <span className="product-brand">{productEyebrow(product)}</span><h1>{product.name}</h1>
            <div className="detail-rating">{product.reviews > 0 ? <><span><Star weight="fill" /> {product.rating.toFixed(1)}</span><button type="button" onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{product.reviews} değerlendirme</button></> : <span><Star /> Henüz değerlendirme yok</span>}<small>Ürün kodu: {product.id}</small></div>
            <div className="detail-price"><strong>{money.format(product.price)}</strong>{product.oldPrice && <del>{money.format(product.oldPrice)}</del>}</div>
            <p className="installment">Teslimat, indirim ve ödeme seçenekleri <strong>ödeme adımında</strong> doğrulanır.</p>
            {colorOptions.length > 0 && <div className="variant-group"><div><strong>Renk</strong><span>{colorOptions[0]}</span></div><button className="color-swatch is-active" type="button" aria-label={colorOptions[0]} aria-pressed="true"><i /></button></div>}
            {storageOptions.length > 0 && <div className="variant-group"><div><strong>Kapasite</strong><span>Stokta</span></div><div className="storage-options">{storageOptions.map((storage) => <button key={storage} className={selectedStorage === storage ? "is-active" : ""} type="button" aria-pressed={selectedStorage === storage} onClick={() => setSelectedStorage(storage)}>{storage}</button>)}</div></div>}
            <div className="purchase-row"><div className="quantity-control"><button type="button" disabled={soldOut || quantity <= 1} onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" disabled={soldOut || quantity >= product.stock} onClick={() => setQuantity((value) => Math.min(product.stock, value + 1))} aria-label="Adedi artır"><Plus /></button></div><button className="primary-button" type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}><ShoppingCart /> {soldOut ? "Tükendi" : "Sepete ekle"}</button></div>
            <div className="stock-line">{soldOut ? <><X /> Stokta yok</> : <><CheckCircle weight="fill" /> Stokta · {product.stock} adet</>}</div>
            <div className="detail-benefits"><div><Truck /><span><strong>Teslimat seçenekleri</strong><small>Ödeme adımında hesaplanır</small></span></div><div><ArrowsClockwise /><span><strong>İade desteği</strong><small>Yardım merkezinden erişilir</small></span></div><div><ShieldCheck /><span><strong>Güvenli ödeme</strong><small>Sağlayıcı ekranında tamamlanır</small></span></div></div>
          </section>
        </div>
        <section className="detail-tabs" id="product-information">
          <div role="tablist" aria-label="Ürün bilgileri">{detailTabs.map((tab, index) => <button id={`product-tab-${tab.id}`} key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`product-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => moveTabFocus(event, index)}>{tab.label}</button>)}</div>
          {detailTabs.map((tab) => <div id={`product-panel-${tab.id}`} key={tab.id} role="tabpanel" aria-labelledby={`product-tab-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} hidden={activeTab !== tab.id}>{tabContent(tab.id)}</div>)}
        </section>
        <ProductCommunity productId={product.id} productName={product.name} session={session} community={community} />
        {related.length > 0 && <section className="section"><div className="section-heading"><div><span className="section-kicker">Benzer ürünler</span><h2>Bunları da sevebilirsin</h2></div></div><ProductGrid items={related} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} /></section>}
      </div>
      <div className="mobile-purchase-bar"><div><small>Toplam</small><strong>{money.format(product.price * quantity)}</strong></div><button type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}><ShoppingCart />{soldOut ? "Tükendi" : "Sepete ekle"}</button></div>
    </main>
  );
}

function ProductRoute({ summary, loadProduct, favorite, favorites, onFavorite, onAdd, onBuyNow, buyNowPending, session, community }) {
  const [state, setState] = useState({ product: summary, phase: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ product: summary, phase: "loading" });
    loadProduct(summary.id, { signal: controller.signal }).then((product) => {
      if (active) setState({ product, phase: "ready" });
    }).catch((error) => {
      if (active && error?.code !== "STOREFRONT_ABORTED") {
        setState({ product: summary, phase: "error" });
      }
    });
    return () => {
      active = false;
      controller.abort("product-route-change");
    };
  }, [loadProduct, summary]);

  return <>
    <CanonicalProductDetail key={state.product.id} product={state.product} favorite={favorite} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} onBuyNow={onBuyNow} buyNowPending={buyNowPending} />
    <PdpStoreAttribution product={state.product} />
    <div className="shell integration-community-shell"><ProductCommunity productId={state.product.id} productName={state.product.name} session={session} community={community} sectionId="community-reviews" /></div>
  </>;
}

function PdpStoreAttribution({ product }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    setTarget(document.querySelector(".product-page .product-summary"));
  }, [product?.id]);
  const store = product?.store;
  if (!target || !store?.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(store.slug || ""))) return null;
  return createPortal(
    <aside className="pdp-store-attribution" aria-label="Satıcı mağaza">
      <span className="pdp-store-attribution__icon" aria-hidden="true"><Storefront /></span>
      <span><small>Satıcı mağaza</small><strong>{store.name}</strong></span>
      <a href={`#/magaza/${store.slug}`}>Mağazaya Git <CaretRight /></a>
    </aside>,
    target,
  );
}

function CollectionRoute({ slug, title: titleOverride, loadCollection, favorites, onFavorite, onAdd }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: "loading", detail: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ phase: "loading", detail: null, error: null });
    loadCollection(slug, { signal: controller.signal }).then((detail) => {
      if (active) setState({ phase: "ready", detail, error: null });
    }).catch((error) => {
      if (active && error?.code !== "STOREFRONT_ABORTED") setState({ phase: "error", detail: null, error });
    });
    return () => { active = false; controller.abort("collection-route-change"); };
  }, [attempt, loadCollection, slug]);
  if (state.phase === "loading") return <LoadingPage />;
  if (state.phase === "error") {
    if (state.error?.status === 404) return <NotFound />;
    return <main id="main-content" className="page commerce-page"><div className="shell integration-state-card" role="alert"><Question /><span className="section-kicker">Koleksiyon</span><h1>Koleksiyon alınamadı</h1><p>{state.error?.message || "Koleksiyon verisi şu anda yüklenemiyor."}</p><button className="primary-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Yeniden dene</button></div></main>;
  }
  const title = String(titleOverride || state.detail?.collection?.name || slug).trim();
  return <CanonicalProductListing title={title} initialItems={state.detail.products} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} />;
}

function FavoritesPage({ favorites, onFavorite, onAdd, onAddAll }) {
  const items = stockFirst(getVisibleProducts().filter((product) => favorites.has(product.id)));
  const sellableItems = items.filter((item) => item.stock > 0);
  return (
    <main id="main-content" className="page commerce-page favorites-page">
      <div className="shell"><Breadcrumbs />
        <div className="commerce-heading"><div><span className="section-kicker">Listem</span><h1>Favorilerim</h1><p>{items.length} ürün daha sonra değerlendirmek için kaydedildi.</p></div>{sellableItems.length > 0 && <button className="primary-button" type="button" onClick={() => onAddAll(sellableItems.map((item) => item.id))}><ShoppingCart /> Stoktaki ürünleri sepete ekle</button>}</div>
        {items.length > 0 ? <><h2 className="sr-only">Favori ürünler</h2><ProductGrid items={items} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} /></> : <div className="large-empty"><Heart /><h2>Favori listen henüz boş</h2><p>Beğendiğin ürünleri kalp simgesine dokunarak burada toplayabilirsin.</p><a className="primary-button" href={discoveryHref()}>Ürünleri keşfet</a></div>}
        <div className="commerce-benefits"><BenefitStrip /></div>
      </div>
    </main>
  );
}

function CartPage({ items, onQuantity, onRemove, onCheckout }) {
  const family = useStudioFamily();
  const cartLayout = family === "pocket" ? "pocket" : ["gallery", "living", "fashion"].includes(family) ? "editorial" : ["workspace", "tech", "market"].includes(family) ? "console" : "classic";
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal;
  const stockIssueItems = items.filter(({ product, quantity }) => product.stock <= 0 || quantity > product.stock);
  const hasStockIssue = stockIssueItems.length > 0;
  return (
    <main id="main-content" className={`page commerce-page demo-cart-page demo-cart-${cartLayout}`} data-flow-family={family}>
      <div className="shell"><Breadcrumbs />
        <div className="commerce-heading demo-cart-heading"><div><span className="section-kicker">{cartLayout === "editorial" ? "SENİN SEÇKİN" : "Alışveriş"}</span><h1>{family === "fashion" ? "Alışveriş çantam" : family === "living" ? "Evin için seçtiklerin" : "Sepetim"}</h1><p aria-live="polite">{items.reduce((sum, item) => sum + item.quantity, 0)} ürün · {items.length} farklı seçim</p></div><a className="demo-continue-shopping" href={discoveryHref()}><ArrowLeft /> Alışverişe devam et</a></div>
        {cartLayout === "editorial" && <ol className="demo-cart-steps" aria-label="Alışveriş adımları"><li aria-current="step"><span>01</span> Çantam</li><li><span>02</span> Teslimat</li><li><span>03</span> Ödeme</li></ol>}
        {items.length ? (
          <div className="cart-page-grid">
            <section className="cart-page-lines" aria-label="Sepetteki ürünler">
              {cartLayout === "console" && <div className="demo-cart-columns" aria-hidden="true"><span>Ürün / stok durumu</span><span>Miktar ve toplam</span></div>}
              {items.map(({ product, quantity }) => (
                <article className="cart-page-line" key={product.id}>
                  <img src={productImage(product)} alt={product.name} />
                  <div className="cart-page-line__copy">
                    <span>{productEyebrow(product)}</span>
                    <h2><a href={`#/urun/${product.parentSlug || product.slug}`}>{product.name}</a></h2>
                    {product.stock <= 0
                      ? <small className="cart-stock-status is-unavailable"><WarningCircle weight="fill" /> Bu ürün şu anda stokta değil</small>
                      : quantity > product.stock
                        ? <small className="cart-stock-status is-unavailable"><WarningCircle weight="fill" /> Yalnız {product.stock} adet stokta; miktarı azalt</small>
                        : product.deliveryLabel ? <small><CheckCircle weight="fill" /> {product.deliveryLabel}</small> : null}
                    <button type="button" onClick={() => onRemove(product.id)}><Trash /> Kaldır</button>
                  </div>
                  <div className="cart-page-line__end">
                    <strong>{money.format(product.price * quantity)}</strong>
                    {cartLayout === "console" && <small className="demo-unit-price">{money.format(product.price)} / adet</small>}
                    <div className="quantity-control">
                      <button type="button" disabled={quantity <= 1} onClick={() => onQuantity(product.id, quantity - 1)} aria-label={`${product.name} adedini azalt`}><Minus /></button>
                      <span>{quantity}</span>
                      <button type="button" disabled={product.stock <= 0 || quantity >= product.stock} onClick={() => onQuantity(product.id, quantity + 1)} aria-label={`${product.name} adedini artır`}><Plus /></button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <aside className="order-summary">
              <h2>{cartLayout === "pocket" ? "Bir sonraki adım" : "Sipariş özeti"}</h2>
              <dl>
                <div><dt>Ara toplam</dt><dd>{money.format(subtotal)}</dd></div>
                <div><dt>Kargo ve indirimler</dt><dd>Ödeme adımında</dd></div>
                <div className="order-total"><dt>Ürün toplamı</dt><dd>{money.format(total)}</dd></div>
              </dl>
              {hasStockIssue && <div className="cart-stock-warning" role="alert"><WarningCircle weight="fill" /><span><strong>Stok kontrolü gerekli</strong><small>{stockIssueItems.length} üründe sepet miktarı güncel stokla uyuşmuyor. Miktarı azalt veya ürünü kaldır.</small></span></div>}
              <p className="summary-security">Kupon, teslimat ve ödeme seçenekleri güvenli ödeme sayfasında doğrulanır.</p>
              <button
                type="button"
                className="primary-button checkout-button"
                disabled={hasStockIssue}
                onClick={onCheckout}
              ><ShieldCheck /> {hasStockIssue ? "Stok sorununu düzelt" : "Güvenli ödemeye geç"}</button>
              <small className="summary-security"><ShieldCheck /> Ödeme bilgileriniz güvenle korunur</small>
            </aside>
          </div>
        ) : (
          <div className="large-empty"><ShoppingBag /><h2>Sepetin henüz boş</h2><p>İhtiyacına uygun ürünleri kategorilerden keşfedebilirsin.</p><a className="primary-button" href={discoveryHref()}>Alışverişe başla</a></div>
        )}
      </div>
      {cartLayout === "pocket" && items.length > 0 && <div className="demo-pocket-checkout"><div><small>Ürün toplamı</small><strong>{money.format(total)}</strong></div><button className="primary-button" type="button" disabled={hasStockIssue} onClick={onCheckout}>{hasStockIssue ? "Stok sorununu düzelt" : "Devam et"}<CaretRight /></button></div>}
    </main>
  );
}

function HelpPage() {
  const [helpQuery, setHelpQuery] = useState("");
  const helpNeedle = helpQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleTopics = HELP_TOPICS.filter(([, title, copy]) => `${title} ${copy}`.toLocaleLowerCase("tr-TR").includes(helpNeedle));
  const visibleFaqs = HELP_FAQS.filter(({ question, answer }) => `${question} ${answer}`.toLocaleLowerCase("tr-TR").includes(helpNeedle));
  const topicQuery = (title) => title === "Siparişler" ? "sipariş" : title === "Teslimat" ? "kargo" : title === "Ödeme" ? "ödeme" : "iade";
  const selectTopic = (title) => {
    setHelpQuery(topicQuery(title));
    window.requestAnimationFrame(() => document.getElementById("help-faqs")?.scrollIntoView({ behavior: motionBehavior(), block: "start" }));
  };
  return <main id="main-content" className="page help-page"><div className="shell"><Breadcrumbs /><div className="help-hero"><NovaServiceIcon kind="help" /><span className="section-kicker">Yardım merkezi</span><h1>Nasıl yardımcı olabiliriz?</h1><p>Sipariş, teslimat, iade ve ödeme konularındaki işlem noktalarını keşfet.</p><form role="search" onSubmit={(event) => event.preventDefault()}><MagnifyingGlass /><input aria-label="Yardım konularında ara" placeholder="Bir konu ara" value={helpQuery} onChange={(event) => setHelpQuery(event.target.value)} /><button type="submit">Ara</button></form></div><div className="help-grid" aria-live="polite">{visibleTopics.map(([,title,copy]) => <button type="button" onClick={() => selectTopic(title)} key={title}><NovaServiceIcon kind={title === "Siparişler" ? "orders" : title === "Teslimat" ? "delivery" : title === "Ödeme" ? "payment" : "returns"} /><strong>{title}</strong><span>{copy}</span><CaretRight /></button>)}</div><section className="faq-list" id="help-faqs"><h2>Sık sorulan sorular</h2>{visibleFaqs.length ? visibleFaqs.map(({ question, answer }) => <details key={question}><summary>{question}<CaretDown /></summary><p>{answer}</p></details>) : <p role="status">Bu aramayla eşleşen yardım konusu bulunamadı.</p>}</section></div></main>;
}

function ReturnExchangePage() {
  return <main id="main-content" className="page return-exchange-page"><div className="shell"><Breadcrumbs /><section className="return-exchange-hero"><NovaServiceIcon kind="returns" /><span className="section-kicker">İade & değişim</span><h1>İade veya değişim sürecini netleştir</h1><p>Uygunluk, ürünün teslimat bilgisi ve sipariş durumu üzerinden doğrulanır. Bu bilgi sayfası yeni bir iade ya da stok işlemi oluşturmaz.</p></section><div className="return-exchange-grid"><section className="return-exchange-steps" aria-labelledby="return-exchange-steps-title"><h2 id="return-exchange-steps-title">Başlamadan önce</h2><ol><li><span>1</span><div><strong>Siparişini kontrol et</strong><p>İade veya değişim için ilgili siparişin teslimat ve ürün koşulları doğrulanır.</p></div></li><li><span>2</span><div><strong>Uygunluk bilgisini gör</strong><p>Ürün, teslimat ve sipariş durumu mevcut müşteri hesabında gösterilen bilgilere göre değerlendirilir.</p></div></li><li><span>3</span><div><strong>Güvenli kanalı kullan</strong><p>İade talebi kaydı sunulduğunda yalnız hesabına ait sipariş üzerinden başlatılır; bu yerel bilgi rotası işlem oluşturmaz.</p></div></li></ol></section><aside className="return-exchange-cta"><span className="section-kicker">Siparişin hazırsa</span><h2>Hesabındaki siparişe git</h2><p>İade/geri ödeme ve stok işlemlerinin tam backend akışı bu bilgilendirme sayfasının kapsamı dışındadır.</p><a className="primary-button" href="#/hesabim/siparisler">Siparişlerime git <CaretRight /></a><a className="return-exchange-support" href="#/iletisim">Destek ekibinden yardım al</a></aside></div></div></main>;
}

// These capsule/bubble calculations are reused from the isolated Android Prototype.
function pocketDockMinimum(a, b, blend) {
  if (blend <= 0) return Math.min(a, b);
  const h = Math.max(blend - Math.abs(a - b), 0) / blend;
  return Math.min(a, b) - h * h * blend * .25;
}
function pocketDockPath(width, selectedIndex, progress, tabCount) {
  const surfaceWidth = width + 12, cy = 42, capsuleLeft = 6, capsuleRight = width + 6, capsuleRadius = 29.25;
  const contentWidth = Math.max(1, width - 16), cx = 14 + contentWidth * (selectedIndex + .5) / tabCount;
  const circleRadius = capsuleRadius + (37 - capsuleRadius) * progress, blend = 7 * progress;
  const top = [], bottom = [];
  for (let x = 0; x <= surfaceWidth; x += .75) {
    let capsuleHalf = -1;
    if (x >= capsuleLeft && x <= capsuleRight) {
      if (x < capsuleLeft + capsuleRadius) capsuleHalf = Math.sqrt(Math.max(0, capsuleRadius ** 2 - (x - capsuleLeft - capsuleRadius) ** 2));
      else if (x > capsuleRight - capsuleRadius) capsuleHalf = Math.sqrt(Math.max(0, capsuleRadius ** 2 - (x - capsuleRight + capsuleRadius) ** 2));
      else capsuleHalf = capsuleRadius;
    }
    const dx = x - cx, circleHalf = Math.abs(dx) <= circleRadius ? Math.sqrt(Math.max(0, circleRadius ** 2 - dx ** 2)) : -1;
    if (capsuleHalf < 0 && circleHalf < 0) continue;
    const capTop = capsuleHalf >= 0 ? cy - capsuleHalf : Infinity, capBottom = capsuleHalf >= 0 ? cy + capsuleHalf : -Infinity;
    const circleTop = circleHalf >= 0 ? cy - circleHalf : Infinity, circleBottom = circleHalf >= 0 ? cy + circleHalf : -Infinity;
    top.push([x, circleHalf >= 0 && capsuleHalf >= 0 ? pocketDockMinimum(capTop, circleTop, blend) : Math.min(capTop, circleTop)]);
    bottom.push([x, circleHalf >= 0 && capsuleHalf >= 0 ? -pocketDockMinimum(-capBottom, -circleBottom, blend) : Math.max(capBottom, circleBottom)]);
  }
  return `M ${[...top, ...bottom.reverse()].map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ")} Z`;
}
function PocketBottomNav({ route, document: siteDocument, cartCount, favoriteCount, onCategoriesOpen, categoriesOpen }) {
  const options = {
    home: { label:"Ana Sayfa", href:"#/", asset:"house" },
    categories: { label:"Kategoriler", href:"#/kategoriler", asset:"circles_four" },
    favorites: { label:"Favoriler", href:"#/favoriler", asset:"heart" },
    cart: { label:"Sepetim", href:"#/sepet", asset:"handbag_simple" },
    account: { label:"Hesabım", href:"#/hesabim", asset:"user" },
    support: { label:"Destek", href:"#/yardim", asset:"chat_circle" },
  };
  const configured = [...new Set(siteDocument.app?.bottomTabs || ["home", "categories", "favorites", "cart", "account"])].filter(id => options[id]);
  const tabs = configured.length ? configured : ["home", "categories", "favorites", "cart", "account"];
  const active = categoriesOpen || ["category", "sandbox-categories"].includes(route.type) ? "categories" : route.type === "cart-page" ? "cart" : ["support", "help"].includes(route.type) ? "support" : route.type;
  const activeIndex = Math.max(0, tabs.indexOf(active));
  const navRef = useRef(null), visualRef = useRef({index:activeIndex,progress:1});
  const [width, setWidth] = useState(375.43), [visual, setVisual] = useState(visualRef.current);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true);
  const reduced = systemReduced || siteDocument.theme.motion === false;
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)"), update = () => setSystemReduced(query.matches);
    query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const element = navRef.current;
    if (!element) return;
    const update = () => { if (element.clientWidth > 0) setWidth(element.clientWidth); };
    update(); const observer = new ResizeObserver(update); observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let frame;
    const update = next => { visualRef.current = next; setVisual(next); };
    if (reduced) { update({index:activeIndex,progress:1}); return; }
    if (visualRef.current.index === activeIndex && visualRef.current.progress === 1) return;
    const outgoing = visualRef.current, start = performance.now(), exitMs = 95, enterMs = 190;
    const ease = value => 1 - (1 - Math.min(1, Math.max(0, value))) ** 3;
    const tick = now => {
      const elapsed = now - start;
      if (elapsed < exitMs) update({index:outgoing.index,progress:outgoing.progress * (1 - ease(elapsed / exitMs))});
      else if (elapsed < exitMs + enterMs) update({index:activeIndex,progress:ease((elapsed - exitMs) / enterMs)});
      else { update({index:activeIndex,progress:1}); return; }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick); return () => window.cancelAnimationFrame(frame);
  }, [activeIndex, reduced]);
  const coreX = 8 + Math.max(1, width - 16) * (visual.index + .5) / tabs.length;
  return <nav ref={navRef} className="demo-pocket-dock" aria-label="Site gezinmesi" data-surface-model="web-header-bubble" style={{gridTemplateColumns:`repeat(${tabs.length},minmax(0,1fr))`,"--pocket-core-x":`${coreX}px`,"--pocket-core-progress":visual.progress}}>
    <span className="demo-pocket-dock-core" aria-hidden="true"/>
    {tabs.map((id, index) => { const item = options[id], selected = visual.index === index && visual.progress > .02, count = id === "cart" ? cartCount : id === "favorites" ? favoriteCount : 0;
      const contents = <><span className="demo-pocket-dock-icon"><img src={`/calibration-assets/official/nav/ic_customer_${item.asset}${selected ? "_filled" : ""}.svg`} alt=""/>{count > 0 && <b>{count}</b>}</span><small>{item.label}</small></>;
      const props = { className: selected ? "is-selected" : "", "aria-current":active === id ? "page" : undefined, "aria-label":`${item.label}${count > 0 ? `, ${count} ürün` : ""}` };
      return id === "categories" ? <button key={id} {...props} type="button" onClick={onCategoriesOpen} aria-haspopup="dialog" aria-expanded={categoriesOpen} aria-controls="category-drawer">{contents}</button> : <a key={id} {...props} href={item.href} onClick={event => { if (active === id && location.hash === item.href) { event.preventDefault(); window.scrollTo({top:0,behavior:reduced ? "auto" : "smooth"}); } }}>{contents}</a>;
    })}
  </nav>;
}

function MobileBottomNav({ route, cartCount, favoriteCount, onCategoriesOpen, categoriesOpen }) {
  const siteDocument = useSandbox("web", isDraftPreview());
  if (["product", "product-id", "checkout", "payment-result", "order-success", "auth", "password"].includes(route.type)) return null;
  if (siteDocument.theme.family === "pocket") return null;
  const items = [[House,"Ana Sayfa","#/","home"],[GridFour,"Kategoriler",discoveryHref(),"category"],[Heart,"Favoriler","#/favoriler","favorites"],[User,"Hesabım","#/hesabim","account"],[ShoppingCart,"Sepet","#/sepet","cart-page"]];
  return <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">{items.map(([Icon,label,href,type]) => type === "category" ? <button key={type} className={route.type === type ? "is-active" : ""} type="button" onClick={onCategoriesOpen} aria-haspopup="dialog" aria-controls="category-drawer"><span><Icon /></span><small>{label}</small></button> : <a key={type} className={route.type === type ? "is-active" : ""} aria-current={route.type === type ? "page" : undefined} href={href}><span><Icon />{type === "favorites" && favoriteCount > 0 && <b>{favoriteCount}</b>}{type === "cart-page" && cartCount > 0 && <b>{cartCount}</b>}</span><small>{label}</small></a>)}</nav>;
}

function ComparisonDialog({ open, products: selectedProducts, onClose, onRemove, onAdd, returnFocusRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const closeAndRestore = useCallback(() => {
    onClose();
    restoreFocus(returnFocusRef);
  }, [onClose, returnFocusRef]);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("is-locked");
    document.body.classList.add("is-comparison-dialog-open");
    const restorePage = isolatePageFromModal();
    window.setTimeout(() => closeRef.current?.focus(), 20);
    const onKey = (event) => {
      if (event.key === "Escape") closeAndRestore();
      else keepFocusInDialog(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("is-locked");
      document.body.classList.remove("is-comparison-dialog-open");
      document.removeEventListener("keydown", onKey);
      restorePage();
    };
  }, [closeAndRestore, open]);

  if (!open) return null;
  const rows = [
    ["Fiyat", (product) => money.format(product.price)],
    ["Marka", (product) => product.brand || "Belirtilmemiş"],
    ["Puan", (product) => product.reviews > 0 ? `${product.rating.toFixed(1)} · ${product.reviews} değerlendirme` : "Henüz değerlendirme yok"],
    ["Stok", (product) => product.stock > 0 ? `${product.stock} adet` : "Tükendi"],
    ["Renk", (product) => product.color || "Belirtilmemiş"],
    ["Kapasite", (product) => product.storage || "Belirtilmemiş"],
  ];
  return createPortal(<div className="overlay-layer comparison-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAndRestore()}><section ref={dialogRef} className="comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="comparison-title" tabIndex="-1"><header><div><span className="section-kicker">Canlı katalog</span><h2 id="comparison-title">Ürünleri karşılaştır</h2><p>Fiyat, stok ve ürün bilgileri güncel NovaStore kataloğundan alınır.</p></div><button ref={closeRef} className="icon-button" type="button" onClick={closeAndRestore} aria-label="Karşılaştırmayı kapat"><X /></button></header><div className="comparison-scroll"><div className="comparison-table" style={{ "--comparison-columns": selectedProducts.length }} role="table" aria-label="Seçili ürünlerin karşılaştırması"><div className="comparison-product-row" role="row"><strong role="rowheader">Ürün</strong>{selectedProducts.map((product) => <article role="cell" key={product.id}><button type="button" onClick={() => onRemove(product.id)} aria-label={`${product.name} ürününü karşılaştırmadan çıkar`}><X /></button><a href={`#/urun/${product.slug}`} onClick={closeAndRestore}><img src={productImage(product)} alt="" /><span>{productEyebrow(product)}</span><b>{product.name}</b></a><button className="primary-button" type="button" disabled={product.stock <= 0} onClick={() => onAdd(product.id)}><ShoppingCart />{product.stock > 0 ? "Sepete ekle" : "Tükendi"}</button></article>)}</div>{rows.map(([label, render]) => <div className="comparison-fact-row" role="row" key={label}><strong role="rowheader">{label}</strong>{selectedProducts.map((product) => <span role="cell" key={product.id}>{render(product)}</span>)}</div>)}</div></div></section></div>, document.body);
}

function ComparisonTray({ ids, onToggle, onClear, onAdd, onVisibilityChange }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const launcherRef = useRef(null);
  const previousSelectionCountRef = useRef(ids.size);
  const selectedProducts = [...ids].map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const closeTray = useCallback(() => {
    setCollapsed(true);
    onVisibilityChange(false);
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  }, [onVisibilityChange]);
  const openTray = useCallback(() => {
    setCollapsed(false);
    onVisibilityChange(true);
    window.requestAnimationFrame(() => closeRef.current?.focus());
  }, [onVisibilityChange]);

  useEffect(() => {
    if (!selectedProducts.length) {
      setOpen(false);
      onVisibilityChange(false);
      return;
    }
    const selectionChanged = previousSelectionCountRef.current !== selectedProducts.length;
    previousSelectionCountRef.current = selectedProducts.length;
    if (selectionChanged) {
      setCollapsed(false);
      onVisibilityChange(true);
      return;
    }
    onVisibilityChange(!collapsed);
  }, [collapsed, onVisibilityChange, selectedProducts.length]);

  useEffect(() => () => onVisibilityChange(false), [onVisibilityChange]);

  useEffect(() => {
    if (collapsed || open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") closeTray();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeTray, collapsed, open]);

  if (!selectedProducts.length) return null;
  if (collapsed) return <button ref={launcherRef} className="comparison-launcher" type="button" onClick={openTray} aria-label={`Karşılaştırma listesini aç. ${selectedProducts.length} ürün seçildi`}><ArrowsLeftRight /><span><strong>Karşılaştırma</strong><small>{selectedProducts.length}/3 ürün</small></span></button>;
  return <><aside className="comparison-tray" role="region" aria-labelledby="comparison-tray-title"><span><ArrowsLeftRight /><span><strong id="comparison-tray-title">Karşılaştır</strong><small aria-live="polite">{selectedProducts.length}/3 ürün seçildi</small></span></span><div className="comparison-tray__products">{selectedProducts.map((product) => <span key={product.id}><img src={productImage(product)} alt="" /><button type="button" onClick={() => onToggle(product.id)} aria-label={`${product.name} ürününü karşılaştırmadan çıkar`}><X /></button></span>)}</div><button ref={triggerRef} className="comparison-open" type="button" disabled={selectedProducts.length < 2} onClick={() => setOpen(true)}>{selectedProducts.length < 2 ? "Bir ürün daha seç" : "Karşılaştır"}</button><button className="comparison-clear" type="button" onClick={onClear} aria-label="Karşılaştırma listesini temizle"><Trash /></button><button ref={closeRef} className="comparison-tray__close" type="button" onClick={closeTray} aria-label="Karşılaştırma listesini kapat"><X /></button></aside><ComparisonDialog open={open} products={selectedProducts} onClose={() => setOpen(false)} onRemove={onToggle} onAdd={onAdd} returnFocusRef={triggerRef} /></>;
}

function WorkspaceCategoryRail() {
  return <aside className="workspace-category-rail" aria-label="Katalog kategorileri"><div><GridFour /><strong>Kategoriler</strong></div><a className="workspace-category-all" href="#/kategoriler">Tüm kategoriler <CaretRight /></a>{getVisibleRoots().map(root => <a key={root.id} data-visual-category-id={root.id} href={`#/kategori/${root.canonicalPath}`}><span data-visual-category-part="text">{root.name}</span><small>{getProductsForCategory(root.id).length}</small></a>)}<a className="workspace-help-link" href="#/yardim"><Question /> Yardım merkezi</a></aside>;
}

function WorkspaceCartSummary({ items, onQuantity, onRemove, onOpen }) {
  const total = items.reduce((sum,item) => sum + item.product.price * item.quantity,0);
  const count = items.reduce((sum,item) => sum + item.quantity,0);
  return <aside className="workspace-cart-summary" aria-label="Sepet özeti"><div className="workspace-summary-heading"><ShoppingCart /><strong>Sepetim</strong><span>{count}</span></div>{items.length ? <><div className="workspace-summary-lines">{items.slice(0,4).map(({product,quantity}) => <article key={product.id}><a className="workspace-summary-product" href={`#/urun/${product.slug}`}><img src={productImage(product)} alt="" /><strong>{product.name}</strong></a><div className="workspace-summary-controls"><div className="quantity-control"><button type="button" onClick={() => onQuantity(product.id,quantity-1)} disabled={quantity <= 1} aria-label={`${product.name} adedini azalt`}><Minus /></button><span>{quantity}</span><button type="button" onClick={() => onQuantity(product.id,quantity+1)} disabled={quantity >= product.stock} aria-label={`${product.name} adedini artır`}><Plus /></button></div><b>{money.format(product.price*quantity)}</b><button className="workspace-remove" type="button" onClick={() => onRemove(product.id)} aria-label={`${product.name} ürününü sepetten çıkar`}><Trash /></button></div></article>)}</div>{items.length > 4 && <button className="workspace-view-cart" type="button" onClick={onOpen}>Diğer {items.length-4} ürünü göster <CaretRight /></button>}<div className="workspace-summary-total"><span>Ürün toplamı</span><strong>{money.format(total)}</strong></div><a className="primary-button" href="#/sepet">Sepete git <CaretRight /></a></> : <div className="workspace-summary-empty"><ShoppingBag /><p>Sepetin henüz boş.</p><small>Beğendiğin ürünleri buradan takip edebilirsin.</small></div>}</aside>;
}

function CartDrawer({ open, items, onClose, onRemove, onQuantity, returnFocusRef }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const closeDrawer = useCallback(() => {
    onClose();
    restoreFocus(returnFocusRef);
  }, [onClose, returnFocusRef]);
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("is-locked");
    const restorePage = isolatePageFromModal();
    window.setTimeout(() => closeRef.current?.focus(), 20);
    const onKey = (event) => {
      if (event.key === "Escape") closeDrawer();
      else keepFocusInDialog(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("is-locked"); document.removeEventListener("keydown", onKey); restorePage(); };
  }, [closeDrawer, open]);
  if (!open) return null;
  return createPortal(
    <div className="overlay-layer cart-drawer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDrawer()}>
      <div id="cart-drawer" ref={dialogRef} className="cart-drawer" role="dialog" aria-modal="true" aria-label="Sepetim" tabIndex="-1">
        <div className="drawer-head"><div><h2>Sepetim</h2><span>{items.reduce((sum, item) => sum + item.quantity, 0)} ürün</span></div><button ref={closeRef} className="icon-button" type="button" onClick={closeDrawer} aria-label="Sepeti kapat"><X /></button></div>
        <div className="cart-drawer__body">{items.length ? items.map(({ product, quantity }) => <article className="cart-line" key={product.id}><a href={`#/urun/${product.parentSlug || product.slug}`} onClick={closeDrawer}><img src={productImage(product)} alt="" /></a><div><a className="cart-line__product-link" href={`#/urun/${product.parentSlug || product.slug}`} onClick={closeDrawer}><strong>{product.name}</strong></a><span>{product.color ? `${product.color} · ` : ""}{quantity} adet</span><div className="cart-line__actions"><div className="quantity-control" aria-label={`${product.name} adedi`}><button type="button" disabled={quantity <= 1} onClick={() => onQuantity(product.id, quantity - 1)} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" disabled={quantity >= product.stock} onClick={() => onQuantity(product.id, quantity + 1)} aria-label="Adedi artır"><Plus /></button></div><b>{money.format(product.price * quantity)}</b></div></div><button type="button" onClick={() => onRemove(product.id)} aria-label={`${product.name} ürününü sepetten çıkar`}><Trash /></button></article>) : <div className="cart-empty"><ShoppingBag /><h3>Sepetin henüz boş</h3><p>İhtiyacına uygun ürünleri kategorilerden keşfedebilirsin.</p><button className="primary-button" type="button" onClick={() => { closeDrawer(); navigate(defaultCategoryPath() ? `/kategori/${defaultCategoryPath()}` : "/"); }}>Alışverişe başla</button></div>}</div>
        {items.length > 0 && <div className="cart-drawer__footer"><div><span>Ürün toplamı</span><strong>{money.format(total)}</strong></div><button className="primary-button" type="button" onClick={() => { closeDrawer(); navigate("/sepet"); }}>Sepete git <CaretRight /></button><small><ShieldCheck /> Ödeme bilgileriniz güvenle korunur</small></div>}
      </div>
    </div>, document.body
  );
}

function LoadingPage() {
  return <main id="main-content" className="page"><div className="shell loading-page" aria-live="polite" aria-busy="true"><span>Ürünler hazırlanıyor…</span><div className="skeleton-heading" /><div className="skeleton-grid">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div></div></main>;
}

function NotFound() {
  return <main id="main-content" className="page"><div className="shell not-found"><span>404</span><h1>Bu sayfayı bulamadık</h1><p>Kategori taşınmış, gizlenmiş veya artık yayında olmayabilir.</p><a className="primary-button" href="#/">Ana sayfaya dön</a></div></main>;
}

function SearchEmpty({ term }) {
  const hasTerm = Boolean(String(term || "").trim());
  return <main id="main-content" className="page"><div className="shell not-found"><MagnifyingGlass /><h1>{hasTerm ? "Aramana uygun ürün bulamadık" : "Aramak istediğin ürünü yaz"}</h1><p>{hasTerm ? "Yazımı kontrol edebilir veya daha kısa bir ürün, marka ya da kategori adı deneyebilirsin." : "Ürün, marka veya kategori adıyla arama yapabilirsin."}</p><a className="primary-button" href="#/">Ana sayfaya dön</a></div></main>;
}

function LocalReviewPaymentBoundary() {
  return <main id="main-content" className="page success-page"><div className="shell"><section className="success-card connected-payment-result is-info"><div className="success-icon"><ShieldCheck /></div><span className="section-kicker">Yerel inceleme sınırı</span><h1>Bu oturumda ödeme oluşturulmadı</h1><p>Gerçek ödeme sağlayıcısı, sipariş oluşturma ve ödeme durumu sorgusu yerel incelemede devre dışıdır.</p><div className="success-actions"><a className="primary-button" href="#/sepet">Sepete dön</a><a href="#/hesabim/siparisler">Siparişlerime git <CaretRight /></a></div></section></div></main>;
}

function Footer({ businessIdentity = null }) {
  return <SandboxFooter Logo={Logo} businessIdentity={businessIdentity}/>;
}

function LegacyFooter({ businessIdentity = null }) {
  const identity = businessIdentity?.status === "configured" ? businessIdentity.identity : null;
  return <footer className="site-footer"><div className="shell footer-grid"><div><Logo /><p>Doğru ürünü bulmanın daha kolay yolu.</p></div><div><strong>NovaStore</strong><a href="#/hakkimizda">Hakkımızda</a><a href="#/iletisim">İletişim</a><a href="#/pazaryeri-bilgilendirmesi">Pazaryeri bilgilendirmesi</a><a href="#/satici-sozlesmesi">Satıcı sözleşmesi</a></div><div><strong>Yasal</strong><a href="#/gizlilik-politikasi">Gizlilik politikası</a><a href="#/kvkk-aydinlatma-metni">KVKK aydınlatma metni</a><a href="#/cerez-politikasi">Çerez politikası</a><a href="#/kullanim-ve-uyelik-kosullari">Kullanım ve üyelik koşulları</a></div><div><strong>Alışveriş koşulları</strong><a href="#/on-bilgilendirme-formu">Ön bilgilendirme formu</a><a href="#/mesafeli-satis-sozlesmesi">Mesafeli satış sözleşmesi</a><a href="#/iptal-iade-cayma-politikasi">İptal, iade ve cayma</a><a href="#/teslimat-ve-kargo-kosullari">Teslimat ve kargo</a><a href="#/islem-rehberi">İşlem rehberi</a></div><div><strong>Destek</strong><a href="#/siparis-takibi">Sipariş takibi</a><a href="#/destek">Güvenli müşteri desteği</a><a href="#/yardim">Yardım merkezi</a><p>Ödeme bilgileri NovaStore sayfasında toplanmaz.</p></div>{identity && <address className="footer-business-identity"><strong>{identity.legalCompanyName}</strong><span>Ticari unvan: {identity.tradeName}</span><span>VKN: {identity.taxNumber}{identity.taxOffice ? ` · Vergi dairesi: ${identity.taxOffice}` : ""} · MERSİS: {identity.mersisNumber}</span><span>{identity.registeredAddress}</span><a href={`mailto:${identity.kepAddress}`}>KEP: {identity.kepAddress}</a><a href={`tel:${identity.phone}`}>{identity.phone}</a><a href={`mailto:${identity.email}`}>{identity.email}</a></address>}</div><div className="shell footer-bottom"><span>© 2026 NovaStore.</span><span>{identity ? "İşletme kimliği yapılandırılmış public sözleşmeden yayımlanır." : "Şirket kimliği ve onaylı yasal metinler tamamlandığında burada yayımlanacaktır."}</span></div></footer>;
}

export function CommerceProRuntimeApp({
  runtime,
  assistantConversationState = null,
  onAssistantConversationStateChange = null,
  sharedProfileCompletionNotice,
  onProfileCompletionNoticeChange = null,
}) {
  const { route, loading } = useRoute();
  const siteDocument = useSandbox("web",isDraftPreview());
  const family = resolveStudioFamily(siteDocument.theme?.family);
  const workspaceCatalog = family === "workspace" && ["home","category","search","collection","favorites"].includes(route.type);
  const [localAssistantConversationState, setLocalAssistantConversationState] = useState(createAssistantConversationState);
  const activeAssistantConversationState = assistantConversationState || localAssistantConversationState;
  const updateAssistantConversationState = onAssistantConversationStateChange || setLocalAssistantConversationState;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(() => [...runtime.cart.initialItems]);
  const cartRef = useRef(cart);
  const [favorites, setFavorites] = useState(() => new Set(runtime.favorites.initialIds));
  const favoritesRef = useRef(favorites);
  const [comparisonIds, setComparisonIds] = useState(() => new Set());
  const [comparisonSurfaceVisible, setComparisonSurfaceVisible] = useState(false);
  const [session, setSession] = useState(runtime.session);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [toast, setToast] = useState("");
  const [toastKind, setToastKind] = useState('');
  const [localProfileCompletionNotice, setLocalProfileCompletionNotice] = useState(null);
  const profileCompletionManagedExternally = typeof onProfileCompletionNoticeChange === "function";
  const profileCompletionNotice = sharedProfileCompletionNotice === undefined
    ? localProfileCompletionNotice
    : sharedProfileCompletionNotice;
  const setProfileCompletionNotice = onProfileCompletionNoticeChange || setLocalProfileCompletionNotice;
  const [assistantOpen, setAssistantOpen] = useState(false);
  const toastTimer = useRef(null);
  const profileCompletionTimer = useRef(null);
  const profileNoticeSessionRef = useRef(null);
  const buyNowPendingRef = useRef(false);
  const [buyNowPending, setBuyNowPending] = useState(false);
  const categoryDrawerTriggerRef = useRef(null);
  const cartTriggerRef = useRef(null);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => setCartOpen(false), []);
  const openCategoryDrawer = useCallback((event) => {
    categoryDrawerTriggerRef.current = event?.currentTarget || null;
    setMobileMenuOpen(true);
  }, []);

  useEffect(() => installInputModalityTracking(), []);

  function notify(message,kind='') {
    setToastKind(kind);
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), kind==='cart' ? 6000 : 2600);
  }

  const dismissProfileCompletionNotice = useCallback(() => {
    window.clearTimeout(profileCompletionTimer.current);
    setProfileCompletionNotice(null);
  }, [setProfileCompletionNotice]);

  const showProfileCompletionNotice = useCallback((activeSession, completion) => {
    const sessionKey = String(activeSession?.sessionId || `customer:${activeSession?.user?.id || "unknown"}`);
    if (profileNoticeSessionRef.current === sessionKey) return;
    profileNoticeSessionRef.current = sessionKey;
    window.clearTimeout(profileCompletionTimer.current);
    setProfileCompletionNotice(completion);
    if (!profileCompletionManagedExternally) {
      profileCompletionTimer.current = window.setTimeout(
        () => setProfileCompletionNotice(null),
        PROFILE_COMPLETION_NOTICE_TIMEOUT_MS,
      );
    }
  }, [profileCompletionManagedExternally, setProfileCompletionNotice]);

  function replaceCart(next, { persist = true } = {}) {
    const normalized = next.map((item) => ({
      productId: normalizeRuntimeProductId(item.productId),
      quantity: Math.max(1, Math.min(999, Number(item.quantity || 1))),
    })).filter((item) => item.productId !== null);
    cartRef.current = normalized;
    setCart(normalized);
    if (persist) {
      return runtime.cart.persist(normalized).then(() => true).catch(() => {
        notify("Sepet sunucuya aktarılamadı; yerel değişikliğin korunuyor.");
        return { appliedLocally: true, persisted: false };
      });
    }
    return Promise.resolve(true);
  }

  async function toggleFavorite(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return false;
    const next = new Set(favoritesRef.current);
    const shouldFavorite = !next.has(productId);
    if (shouldFavorite) next.add(productId);
    else next.delete(productId);
    try {
      await runtime.favorites.set(productId, shouldFavorite);
      favoritesRef.current = next;
      setFavorites(next);
      notify(`${product.name} ${shouldFavorite ? "favorilere eklendi" : "favorilerden çıkarıldı"}`);
      return true;
    } catch {
      notify("Favori işlemi tamamlanamadı; seçimin değiştirilmedi.");
      return false;
    }
  }

  async function addToCart(productId, quantity = 1) {
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) { notify("Bu ürün şu anda stokta değil"); return false; }
    if (product.variants?.length) { notify(`${product.name} için ürün kartından veya detayından beden seç.`); return false; }
    const current = cartRef.current;
    const existing = current.find((item) => item.productId === productId);
    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    const currentQuantity = existing?.quantity || 0;
    const nextQuantity = Math.min(product.stock, currentQuantity + requestedQuantity);
    if (nextQuantity === currentQuantity) {
      notify(`${product.name} için sepetindeki adet mevcut stoğa ulaştı.`);
      return false;
    }
    const next = existing
      ? current.map((item) => item.productId === productId
        ? { ...item, quantity: nextQuantity }
        : item)
      : [...current, { productId, quantity: nextQuantity }];
    const mutationResult = await replaceCart(next);
    if (mutationResult !== true) return mutationResult;
    notify(nextQuantity - currentQuantity < requestedQuantity
      ? `${product.name} mevcut stok sınırına göre sepete eklendi.`
      : `${product.name} sepete eklendi`,'cart');
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      document.querySelectorAll('.site-header a[href="#/sepet"] svg,.site-header button[aria-label*="Sepet"] svg').forEach(icon=>{
        icon.getAnimations().forEach(animation=>animation.cancel());
        icon.animate([{transform:'scale(1)'},{transform:'scale(1.22)'},{transform:'scale(1)'}],{duration:420,easing:'ease-out'});
      });
    }
    return true;
  }

  async function buyNow(productId, quantity = 1) {
    if (buyNowPendingRef.current) return;
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) {
      notify("Bu ürün şu anda stokta değil");
      return;
    }
    if (product.variants?.length) { notify(`${product.name} için beden seç.`); return; }
    const requestedQuantity = Math.min(product.stock, Math.max(1, Number(quantity) || 1));
    const current = cartRef.current;
    const existing = current.find((item) => item.productId === productId);
    const nextQuantity = Math.min(product.stock, (existing?.quantity || 0) + requestedQuantity);
    const next = existing
      ? current.map((item) => item.productId === productId ? { ...item, quantity: nextQuantity } : item)
      : [...current, { productId, quantity: nextQuantity }];
    buyNowPendingRef.current = true;
    setBuyNowPending(true);
    replaceCart(next, { persist: false });
    try {
      await runtime.cart.handoffToCheckout(next);
    } catch {
      notify("Güvenli ödeme özeti hazırlanamadı. Ürün sepetinde korunuyor; lütfen yeniden dene.");
    } finally {
      buyNowPendingRef.current = false;
      setBuyNowPending(false);
    }
  }

  function updateCartQuantity(productId, quantity) {
    const product = products.find((item) => item.id === productId);
    const current = cartRef.current;
    const next = quantity <= 0
      ? current.filter((item) => item.productId !== productId)
      : current.map((item) => item.productId === productId
        ? { ...item, quantity: Math.min(Math.max(1, Number(product?.stock || 1)), quantity) }
        : item);
    replaceCart(next);
  }

  async function removeFromCart(productId) {
    const current = cartRef.current;
    const next = current.filter((item) => item.productId !== productId);
    if (next.length === current.length) return false;
    return replaceCart(next);
  }

  function toggleComparison(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return false;
    const next = new Set(comparisonIds);
    if (next.has(productId)) next.delete(productId);
    else if (next.size >= 3) {
      notify("Aynı anda en fazla 3 ürünü karşılaştırabilirsin.");
      return false;
    } else next.add(productId);
    setComparisonIds(next);
    if (!next.size) setComparisonSurfaceVisible(false);
    return true;
  }

  async function handoffToCheckout() {
    try {
      await runtime.cart.handoffToCheckout(cartRef.current);
    } catch {
      notify("Güvenli ödeme özeti hazırlanamadı. Lütfen yeniden dene.");
    }
  }

  const cartItems = useMemo(
    () => cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) })).filter((item) => item.product),
    [cart],
  );
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const unsubscribe = runtime.cart.subscribe((next) => replaceCart(next, { persist: false }));
    return unsubscribe;
  }, [runtime]);

  useEffect(() => {
    const handleAuthRequired = () => {
      setSession(Object.freeze({ status: "guest", user: null, warning: null }));
      profileNoticeSessionRef.current = null;
      dismissProfileCompletionNotice();
      notify("Oturumunun süresi doldu. Devam etmek için yeniden giriş yap.");
    };
    window.addEventListener("novastore:auth-required", handleAuthRequired);
    return () => window.removeEventListener("novastore:auth-required", handleAuthRequired);
  }, [dismissProfileCompletionNotice]);

  useEffect(() => () => {
    window.clearTimeout(toastTimer.current);
    window.clearTimeout(profileCompletionTimer.current);
  }, []);

  const authenticated = session?.status === "authenticated" || session?.status === "unverified";
  const refreshNotificationUnreadCount = useCallback(async () => {
    if (!authenticated) { setNotificationUnreadCount(0); return; }
    try { setNotificationUnreadCount(await runtime.customer.getNotificationUnreadCount()); }
    catch { setNotificationUnreadCount(0); }
  }, [authenticated, runtime]);
  useEffect(() => {
    if (!authenticated) { setNotificationUnreadCount(0); return undefined; }
    refreshNotificationUnreadCount();
    const refresh = () => refreshNotificationUnreadCount();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("novastore:notification-state-changed", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      window.removeEventListener("novastore:notification-state-changed", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [authenticated, refreshNotificationUnreadCount]);
  const localReviewSurface = LOCAL_REVIEW_RUNTIME_ENABLED
    && window.location.protocol === "http:"
    && ["127.0.0.1", "localhost"].includes(window.location.hostname)
    && window.location.port === "5273";
  const localReviewSession = LOCAL_REVIEW_RUNTIME_ENABLED
    && authenticated
    && String(session?.user?.email || "").endsWith("@local.invalid");
  const localReviewSurfaceProps = LOCAL_REVIEW_RUNTIME_ENABLED ? { reviewOnly: localReviewSurface } : {};
  const localReviewSessionProps = LOCAL_REVIEW_RUNTIME_ENABLED ? { reviewOnly: localReviewSession } : {};
  const comparisonAvailable = comparisonIds.size > 0 && COMPARISON_TRAY_ROUTE_TYPES.has(route.type);
  useEffect(() => {
    if (!comparisonAvailable) setComparisonSurfaceVisible(false);
  }, [comparisonAvailable]);
  const comparisonContext = { available: true, ids: comparisonIds, toggle: toggleComparison };
  const handleAuthenticated = async (nextSession, returnPath) => {
    let authoritativeSession = nextSession;
    let profileCompletion = null;
    try {
      const authoritativeProfile = await runtime.customer.getProfile();
      authoritativeSession = Object.freeze({ ...nextSession, status: "authenticated", user: authoritativeProfile, warning: null });
      profileCompletion = getCustomerProfileCompletion(authoritativeProfile);
    } catch (error) {
      if (error?.status === 401) throw error;
      authoritativeSession = Object.freeze({ ...nextSession, status: "unverified", warning: error });
    }
    setSession(authoritativeSession);
    try {
      const refreshed = await runtime.refreshCustomerState({ cartItems: cartRef.current });
      replaceCart(refreshed.cartItems, { persist: false });
      const nextFavorites = new Set(refreshed.favoriteIds);
      favoritesRef.current = nextFavorites;
      setFavorites(nextFavorites);
    } catch {
      notify("Hesabın açıldı; sepet veya favori eşitlemesi geçici olarak tamamlanamadı.");
    }
    const destination = safeCustomerReturnPath(returnPath, NORMAL_LOGIN_DESTINATION);
    navigate(destination);
    if (destination === NORMAL_LOGIN_DESTINATION && profileCompletion && !profileCompletion.complete) {
      showProfileCompletionNotice(authoritativeSession, profileCompletion);
    } else {
      dismissProfileCompletionNotice();
    }
  };
  const authReturn = (path) => <CustomerAuthPage account={runtime.customer} returnPath={path} onAuthenticated={handleAuthenticated} {...localReviewSurfaceProps} />;
  const handleSessionUpdated = (user) => setSession((current) => Object.freeze({ ...current, status: "authenticated", user, warning: null }));
  const handleLogout = async () => {
    dismissProfileCompletionNotice();
    profileNoticeSessionRef.current = null;
    const result = await runtime.customer.logout();
    if (!result.serverRevocationVerified) window.alert?.(result.warning);
    window.location.hash = "#/";
    window.location.reload();
  };
  const handlePaymentFinalized = useCallback((purchasedItems) => {
    const next = reconcileFinalizedCart(cartRef.current, purchasedItems);
    cartRef.current = next;
    setCart(next);
    runtime.cart.persist(next).catch(() => {});
  }, [runtime]);
  const handleCheckoutStepChange = useCallback((step, options) => {
    const segment = step === "delivery" ? "teslimat" : step === "payment" ? "odeme" : "onay";
    navigate(`/odeme/${segment}`, options);
  }, []);

  let content;
  if (loading) content = <CanonicalLoadingPage />;
  else if (route.type === "sandbox-page") content = <SandboxPage id={route.id} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "sandbox-categories") content = <SandboxCategoriesPage />;
  else if (route.type === "home") content = <CanonicalHomePage favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "public-store") content = <PublicStorePage slug={route.slug} previewMode={route.preview} loadStore={runtime.publicStore.load} followStore={runtime.publicStore.follow} session={session} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "product" || route.type === "product-id") {
    const product = route.type === "product"
      ? getVisibleProducts().find((item) => item.slug === route.slug)
      : getVisibleProducts().find((item) => item.id === route.id);
    content = product ? <ProductRoute summary={product} loadProduct={runtime.catalog.loadProduct} favorite={favorites.has(product.id)} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} onBuyNow={buyNow} buyNowPending={buyNowPending} session={session} community={runtime.community} /> : <CanonicalNotFound />;
  } else if (route.type === "category") {
    const category = resolveCategoryPath(route.path);
    if (!category || category.active === false || category.archived === true || category.customerVisible === false || category.descendantVisibleProductCount === 0) content = <CanonicalNotFound />;
    else content = <CanonicalProductListing category={category} title={category.name} initialItems={getProductsForCategory(category.id)} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  } else if (route.type === "search") {
    const needle = normalizeSearchText(route.term);
    const results = getVisibleProducts().filter((product) => normalizeSearchText(`${product.name} ${product.brand} ${product.color || ""} ${product.storage || ""} ${product.description || ""} ${(product.features || []).join(" ")} ${getBreadcrumb(product.categoryId).map((item) => item.name).join(" ")}`).includes(needle));
    content = results.length && route.term.trim() ? <CanonicalProductListing title={`“${route.term}” arama sonuçları`} initialItems={results} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} /> : <SearchEmpty term={route.term} />;
  } else if (route.type === "collection") content = <CollectionRoute slug={route.slug} title={route.title} loadCollection={runtime.catalog.loadCollection} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "favorites") content = <CanonicalFavoritesPage favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "cart-page") content = <CartPage items={cartItems} onQuantity={updateCartQuantity} onRemove={removeFromCart} onCheckout={handoffToCheckout} />;
  else if (route.type === "auth") content = authenticated
    ? <CustomerAccountPage session={session} account={runtime.customer} favoriteCount={favorites.size} products={getVisibleProducts()} getProductImage={productImage} onSessionUpdated={handleSessionUpdated} onLogout={handleLogout} onNotice={notify} {...localReviewSessionProps} />
    : <CustomerAuthPage account={runtime.customer} initialMode={route.mode} returnPath={safeCustomerReturnPath(route.query.get("return"), NORMAL_LOGIN_DESTINATION)} onAuthenticated={handleAuthenticated} {...localReviewSurfaceProps} />;
  else if (route.type === "password") content = <CustomerPasswordPage account={runtime.customer} mode={route.mode} token={route.query.get("token") || ""} {...localReviewSurfaceProps} />;
  else if (route.type === "account") content = authenticated
    ? <CustomerAccountPage session={session} account={runtime.customer} section={route.section} orderId={route.orderId} favoriteCount={favorites.size} products={getVisibleProducts()} getProductImage={productImage} onSessionUpdated={handleSessionUpdated} onLogout={handleLogout} onNotice={notify} focusProfile={route.query.get("focus") === "profile"} {...localReviewSessionProps} />
    : authReturn(route.section === "order-detail"
      ? `/hesabim/siparisler/${route.orderId}`
      : `/hesabim${route.section === "orders" ? "/siparisler" : route.section === "addresses" ? "/adresler" : route.section === "coupons" ? "/kuponlar" : route.section === "notifications" ? "/bildirimler" : route.section === "questions" ? "/sorularim" : route.section === "reviews" ? "/degerlendirmelerim" : route.section === "followed-stores" ? "/takip-ettigim-magazalar" : route.section === "security" ? "/guvenlik" : ""}`);
  else if (route.type === "checkout") content = authenticated
    ? <CustomerCheckoutPage step={route.step} session={session} account={runtime.customer} checkout={runtime.checkout} items={cartItems} getProductImage={productImage} onStepChange={handleCheckoutStepChange} onNotice={notify} {...localReviewSessionProps} />
    : authReturn(`/odeme/${route.step === "delivery" ? "teslimat" : route.step === "payment" ? "odeme" : "onay"}`);
  else if (route.type === "payment-result") content = authenticated
    ? localReviewSession ? <LocalReviewPaymentBoundary /> : <CustomerPaymentResultPage checkout={runtime.checkout} paymentRef={route.query.get("paymentRef") || ""} orderId={route.query.get("orderId") || ""} onFinalized={handlePaymentFinalized} />
    : authReturn(`/odeme/sonuc?${route.query.toString()}`);
  else if (route.type === "tracking") content = authenticated
    ? <CustomerTrackingPage session={session} account={runtime.customer} products={getVisibleProducts()} getProductImage={productImage} />
    : authReturn("/siparis-takibi");
  else if (route.type === "order-success") content = <CanonicalNotFound />;
  else if (route.type === "help") content = <HelpPage />;
  else if (route.type === "return-exchange") content = <ReturnExchangePage />;
  else if (route.type === "public-contact") content = <CustomerPublicContactPage businessIdentity={runtime.businessIdentity} />;
  else if (route.type === "legal") content = <CustomerLegalDocumentPage slug={route.slug} legal={runtime.legal} />;
  else if (route.type === "support") content = authenticated
    ? <CustomerSupportPage session={session} account={runtime.customer} onNotice={notify} />
    : authReturn("/destek");
  else content = <CanonicalNotFound />;

  return (
    <StudioFamilyContext.Provider value={family}><RuntimeComparisonContext.Provider value={comparisonContext}>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); focusMainContent({ preventScroll: false }); }}>Ana içeriğe geç</a>
      <CategoryHoverMenus imageForProduct={productImage}/><Header route={route} authenticated={authenticated} cartCount={cartCount} favoriteCount={favorites.size} notificationUnreadCount={notificationUnreadCount} onCartOpen={openCart} onMobileOpen={openCategoryDrawer} onAccountOpen={() => navigate(customerAccountEntryPath(authenticated))} accountDetail={authenticated ? session.user.fullName || "Hesabım" : "Giriş yap"} cartTriggerRef={cartTriggerRef} mobileMenuOpen={mobileMenuOpen} cartOpen={cartOpen} />
      {runtime.warnings.length > 0 && <div className="integration-session-warning" role="status">Bazı ikincil mağaza veya oturum verileri geçici olarak alınamadı; erişilebilen gerçek katalog gösteriliyor.</div>}
      {comparisonAvailable && <ComparisonTray ids={comparisonIds} onToggle={toggleComparison} onClear={() => { setComparisonIds(new Set()); setComparisonSurfaceVisible(false); }} onAdd={addToCart} onVisibilityChange={setComparisonSurfaceVisible} />}
      <div className={cx("family-route-layout",workspaceCatalog && "workspace-catalog-layout",workspaceCatalog && route.type === "home" && "has-category-rail")}>
        {workspaceCatalog && route.type === "home" && <WorkspaceCategoryRail key="categories" />}
        <div className="family-route-content" key="content"><SandboxTemplate route={route} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />{content}</div>
        {workspaceCatalog && <WorkspaceCartSummary key="cart-summary" items={cartItems} onQuantity={updateCartQuantity} onRemove={removeFromCart} onOpen={openCart} />}
      </div>
      <Footer businessIdentity={runtime.businessIdentity} />
      <MobileCategoryDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} returnFocusRef={categoryDrawerTriggerRef} authenticated={authenticated} cartCount={cartCount} favoriteCount={favorites.size} notificationUnreadCount={notificationUnreadCount} />
      <CartDrawer open={cartOpen} items={cartItems} onClose={closeCart} onRemove={removeFromCart} onQuantity={updateCartQuantity} returnFocusRef={cartTriggerRef} />
      <MobileBottomNav route={route} cartCount={cartCount} favoriteCount={favorites.size} onCategoriesOpen={openCategoryDrawer} categoriesOpen={mobileMenuOpen} />
      <SandboxTheme />
      <SandboxSeo route={route} />
      {route.type === "home" && profileCompletionNotice && !assistantOpen && <ProfileCompletionNotice missingFields={profileCompletionNotice.missingFields} onDismiss={dismissProfileCompletionNotice} onOpen={() => { dismissProfileCompletionNotice(); navigate("/hesabim?focus=profile"); }} />}
      <AssistantWidget key={assistantConversationOwnerKey(session)} disabled={runtime.readOnlyPreview === true} route={route} assistant={runtime.assistant} session={session} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} onRemove={removeFromCart} getProductImage={productImage} raised={comparisonAvailable && comparisonSurfaceVisible} onOpenChange={setAssistantOpen} conversationState={activeAssistantConversationState} onConversationStateChange={updateAssistantConversationState} />
      <div className={cx("toast", toast && "is-visible",toastKind==='cart'&&'is-cart-feedback')} role="status" aria-live="polite"><CheckCircle weight="regular" /><span>{toastKind==='cart'&&<strong>Sepete eklendi</strong>}{toast}</span>{toastKind==='cart'&&toast&&<a href="#/sepet" onClick={()=>setToast('')}>Sepeti gör</a>}</div>
    </RuntimeComparisonContext.Provider></StudioFamilyContext.Provider>
  );
}

function IntegrationState({ phase, error, onRetry }) {
  const empty = phase === "empty";
  const loading = phase === "loading";
  return (
    <>
      <a className="skip-link" href="#main-content">Ana içeriğe geç</a>
      <header className="site-header integration-state-header"><CanonicalTrustBar /><div className="shell main-header"><CanonicalLogo /></div></header>
      <main id="main-content" className="page commerce-page integration-state-page">
        <div className="shell integration-state-card" role={loading ? "status" : "alert"} aria-live="polite" aria-busy={loading ? "true" : undefined}>
          {loading ? <span className="integration-spinner" aria-hidden="true" /> : empty ? <ShoppingBag aria-hidden="true" /> : <Question aria-hidden="true" />}
          <span className="section-kicker">NovaStore Commerce Pro</span>
          <h1>{loading ? "Mağaza hazırlanıyor" : empty ? "Yayında ürün bulunamadı" : "Mağaza verisi alınamadı"}</h1>
          <p>{loading
            ? "Kategori, ürün ve koleksiyonlar aynı-origin NovaStore API'sinden yükleniyor."
            : empty
              ? "Public katalog şu anda boş. Örnek veya sahte ürün gösterilmiyor."
              : error?.message || "Beklenmeyen bir bağlantı hatası oluştu."}</p>
          {!loading && !empty && <button className="primary-button" type="button" onClick={onRetry}>Yeniden dene</button>}
        </div>
      </main>
      <Footer />
    </>
  );
}

export function IntegratedApp() {
  const [runtimeRoute, setRuntimeRoute] = useState(parseRoute);
  const [assistantConversationState, setAssistantConversationState] = useState(createAssistantConversationState);
  const [profileCompletionNotice, setProfileCompletionNotice] = useState(null);
  useEffect(() => {
    const handleRouteChange = () => setRuntimeRoute(parseRoute());
    window.addEventListener("hashchange", handleRouteChange);
    return () => window.removeEventListener("hashchange", handleRouteChange);
  }, []);
  useEffect(() => {
    if (!profileCompletionNotice) return undefined;
    const timer = window.setTimeout(
      () => setProfileCompletionNotice(null),
      PROFILE_COMPLETION_NOTICE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [profileCompletionNotice]);
  const isPublicStoreRoute = runtimeRoute.type === "public-store";
  const catalogOptionalRoute = [
    "auth",
    "password",
    "account",
    "checkout",
    "payment-result",
    "tracking",
    "help",
    "return-exchange",
    "public-contact",
    "legal",
    "support",
  ].includes(runtimeRoute.type);
  const resource = useCommerceRuntime({
    allowEmptyCatalog: isPublicStoreRoute || catalogOptionalRoute,
    allowUnavailableCatalog: catalogOptionalRoute,
    readOnlyPreview: isPublicStoreRoute && runtimeRoute.preview === true,
  });
  if (resource.phase !== "ready") {
    return <IntegrationState phase={resource.phase} error={resource.error} onRetry={resource.retry} />;
  }
  return <CommerceProRuntimeApp runtime={resource.runtime} assistantConversationState={assistantConversationState} onAssistantConversationStateChange={setAssistantConversationState} sharedProfileCompletionNotice={profileCompletionNotice} onProfileCompletionNoticeChange={setProfileCompletionNotice} />;
}
