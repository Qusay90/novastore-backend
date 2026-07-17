import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowsLeftRight,
  ArrowsClockwise,
  Baby,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CreditCard,
  DeviceMobile,
  Funnel,
  GridFour,
  Headphones,
  Heart,
  House,
  Laptop,
  List,
  MagnifyingGlass,
  Minus,
  Package,
  PersonSimpleRun,
  Plus,
  Question,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkle,
  Star,
  StarFour,
  Storefront,
  Television,
  Trash,
  Truck,
  TShirt,
  User,
  Watch,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
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
import {
  CustomerAccountPage,
  CustomerAuthPage,
  CustomerCheckoutPage,
  CustomerPasswordPage,
  CustomerPaymentResultPage,
  CustomerSupportPage,
  CustomerTrackingPage,
} from "./ConnectedCustomerPages.jsx";
import { ProductCommunity } from "./ProductCommunity.jsx";
import { AssistantWidget } from "./AssistantWidget.jsx";
import { reconcileFinalizedCart } from "./adapters/checkoutAdapter.js";
import {
  CartDrawer as CanonicalCartDrawer,
  FavoritesPage as CanonicalFavoritesPage,
  Footer as CanonicalFooter,
  Header as CanonicalHeader,
  HomePage as CanonicalHomePage,
  LoadingPage as CanonicalLoadingPage,
  Logo as CanonicalLogo,
  MobileBottomNav as CanonicalMobileBottomNav,
  MobileCategoryDrawer as CanonicalMobileCategoryDrawer,
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
  "kozmetik-kisisel-bakim": Sparkle,
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
  maximumFractionDigits: 0,
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
const ComparisonContext = createContext(Object.freeze({ ids: new Set(), toggle: () => {} }));

function cx(...values) {
  return values.filter(Boolean).join(" ");
}

function normalizeRuntimeProductId(value) {
  if (Number.isInteger(value) && value > 0) return value;
  const text = String(value ?? "").trim();
  return /^[A-Z0-9][A-Z0-9_-]{0,63}$/i.test(text) ? text : null;
}

function isolatePageFromModal() {
  const backgroundNodes = [...document.querySelectorAll("#root > .skip-link, #root > .site-header, #root > main, #root > .site-footer, #root > .mobile-bottom-nav")];
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

function navigate(path) {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = next;
}

function safeDecodeReturn(value, fallback = "/hesabim") {
  const path = String(value || "").trim();
  if (!path.startsWith("/") || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  return path;
}

function documentRouteRaw() {
  const pathname = window.location.pathname || "/";
  const search = window.location.search || "";
  if (/^\/(?:kategori|urun|koleksiyon)\//.test(pathname)) return `${pathname}${search}`;
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
  if (pathname === "/favoriler") return { type: "favorites", query };
  if (pathname === "/sepet") return { type: "cart-page", query };
  if (pathname === "/hesabim") return { type: "account", section: "overview", query };
  if (pathname === "/hesabim/adresler") return { type: "account", section: "addresses", query };
  if (pathname === "/hesabim/kuponlar") return { type: "account", section: "coupons", query };
  if (pathname === "/hesabim/bildirimler") return { type: "account", section: "notifications", query };
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
  if (pathname === "/siparis-takibi") return { type: "tracking", query };
  if (pathname === "/iletisim") return { type: "contact", query };
  if (pathname === "/") return { type: "home", query };
  return { type: "not-found", query };
}

function useRoute() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      window.scrollTo({ top: 0, behavior: "smooth" });
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => focusMainContent()));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return { route, loading: false };
}

function Logo({ onClick }) {
  return (
    <a className="brand" href="#/" aria-label="NovaStore ana sayfa" onClick={onClick}>
      <StarFour className="brand-mark" weight="fill" aria-hidden="true" /><span>Nova</span><strong>Store</strong>
    </a>
  );
}

function TrustBar() {
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
    const needle = value.trim().toLocaleLowerCase("tr-TR");
    if (needle.length < 2) return [];
    return getVisibleProducts()
      .filter((product) => `${product.name} ${product.brand}`.toLocaleLowerCase("tr-TR").includes(needle))
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
          autoComplete="off"
          aria-expanded={focused && suggestions.length > 0}
          aria-controls="search-suggestions"
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

function HeaderAction({ icon: Icon, label, detail, badge, onClick, buttonRef }) {
  return (
    <button ref={buttonRef} className="header-action" type="button" onClick={onClick} aria-label={`${label}: ${detail}`}>
      <span className="header-action__icon"><Icon size={22} />{badge > 0 && <b>{badge}</b>}</span>
      <span><small>{label}</small><strong>{detail}</strong></span>
    </button>
  );
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
              <span>{item.name}</span>
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

function CategoryNavigation({ onMobileOpen }) {
  const roots = getVisibleRoots();
  const [open, setOpen] = useState(false);
  const [activeRoot, setActiveRoot] = useState(roots[0]);
  const closeTimer = useRef(null);
  const containerRef = useRef(null);
  const suppressFocusOpen = useRef(false);

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

  return (
    <div className={cx("category-navigation", open && "is-mega-open")} ref={containerRef} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
      <div className="shell category-navigation__row">
        <button className="all-categories-button" type="button" onClick={onMobileOpen}>
          <List size={21} /> <span>Tüm Kategoriler</span>
        </button>
        <nav aria-label="Ürün kategorileri">
          <ul>
            {roots.map((root) => (
              <li key={root.id} className={cx(open && activeRoot.id === root.id && "is-active")}>
                <a href={`#/kategori/${root.canonicalPath}`} onClick={() => setOpen(false)}>{root.name}</a>
                <button
                  type="button"
                  aria-label={`${root.name} alt kategorilerini aç`}
                  aria-expanded={open && activeRoot.id === root.id}
                  aria-controls="mega-navigation"
                  onMouseEnter={() => { cancelClose(); setActiveRoot(root); setOpen(true); }}
                  onFocus={() => {
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
            ))}
          </ul>
        </nav>
        <a className="deals-link" href="#/koleksiyon/firsatlar" onClick={() => setOpen(false)}><Sparkle weight="fill" /> Fırsatlar</a>
      </div>
      {open && <div className="shell mega-shell"><MegaMenu root={activeRoot} onRootChange={setActiveRoot} onClose={() => setOpen(false)} /></div>}
    </div>
  );
}

function Header({ cartCount, favoriteCount, onCartOpen, onMobileOpen, onAccountOpen, accountDetail, cartTriggerRef, mobileMenuTriggerRef }) {
  return (
    <header className="site-header">
      <TrustBar />
      <div className="shell main-header">
        <button ref={mobileMenuTriggerRef} className="mobile-menu-trigger" type="button" onClick={onMobileOpen} aria-label="Kategorileri aç"><List /></button>
        <Logo />
        <SearchBox onSearch={(term) => navigate(`/arama?q=${encodeURIComponent(term)}`)} />
        <div className="header-actions">
          <HeaderAction icon={User} label="Hesabım" detail={accountDetail} onClick={onAccountOpen} />
          <HeaderAction icon={Heart} label="Listem" detail="Favorilerim" badge={favoriteCount} onClick={() => navigate("/favoriler")} />
          <HeaderAction icon={ShoppingCart} label="Sepetim" detail={cartCount ? `${cartCount} ürün` : "0 ürün"} badge={cartCount} onClick={onCartOpen} buttonRef={cartTriggerRef} />
        </div>
      </div>
      <CategoryNavigation onMobileOpen={onMobileOpen} />
    </header>
  );
}

function MobileCategoryDrawer({ open, onClose, returnFocusRef }) {
  const roots = getVisibleRoots();
  const [stack, setStack] = useState([]);
  const closeRef = useRef(null);
  const dialogRef = useRef(null);

  const current = stack.length ? getCategoryById(stack[stack.length - 1]) : null;
  const items = current ? getVisibleChildren(current.id) : roots;

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

  return (
    <div className="overlay-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDrawer()}>
      <div ref={dialogRef} className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Kategori menüsü" tabIndex="-1">
        <div className="drawer-head">
          {current ? <button type="button" onClick={() => setStack((value) => value.slice(0, -1))}><ArrowLeft /> Geri</button> : <Logo onClick={closeDrawer} />}
          <button ref={closeRef} className="icon-button" type="button" onClick={closeDrawer} aria-label="Menüyü kapat"><X /></button>
        </div>
        <div className="mobile-drawer__body">
          <span className="drawer-kicker">{current ? "Kategori" : "Tüm kategoriler"}</span>
          <h2>{current?.name || "Ne arıyorsun?"}</h2>
          {current && <a className="drawer-view-all" href={`#/kategori/${current.canonicalPath}`} onClick={closeDrawer}>Tüm {current.name} ürünlerini gör <CaretRight /></a>}
          <div className="mobile-category-list">
            {items.map((item) => {
              const children = getVisibleChildren(item.id);
              const Icon = ROOT_ICONS[item.slug] || Storefront;
              return (
                <div key={item.id} className="mobile-category-row">
                  <a href={`#/kategori/${item.canonicalPath}`} onClick={closeDrawer}><Icon /><span>{item.name}</span></a>
                  {children.length > 0 && <button type="button" aria-label={`${item.name} alt kategorilerine git`} onClick={() => setStack((value) => [...value, item.id])}><CaretRight /></button>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="drawer-footer"><ShieldCheck /><span><strong>NovaStore güvencesi</strong><small>Güvenli ödeme ve hesap destekli işlemler</small></span></div>
      </div>
    </div>
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
  const soldOut = product.stock <= 0;
  const comparison = useContext(ComparisonContext);
  const compared = comparison.ids.has(product.id);
  const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
  return (
    <article className={cx("product-card", soldOut && "is-sold-out")}>
      <div className="product-card__media">
        {product.badge && <span className={cx("product-badge", soldOut && "is-muted")}>{soldOut ? "Tükendi" : product.badge}</span>}
        <button className={cx("favorite-button", favorite && "is-active")} type="button" onClick={() => onFavorite(product.id)} aria-pressed={favorite} aria-label={favorite ? `${product.name} ürününü favorilerden çıkar` : `${product.name} ürününü favorilere ekle`}>
          <Heart weight={favorite ? "fill" : "regular"} />
        </button>
        <a href={`#/urun/${product.slug}`} aria-label={`${product.name} detayını aç`}><img src={productImage(product)} alt={product.name} /></a>
      </div>
      <div className="product-card__body">
        <span className="product-brand">{productEyebrow(product)}</span>
        <h3><a href={`#/urun/${product.slug}`}>{product.name}</a></h3>
        {product.reviews > 0
          ? <div className="product-rating" aria-label={`${product.rating} puan, ${product.reviews} değerlendirme`}><Star weight="fill" /><strong>{product.rating.toFixed(1)}</strong><span>({product.reviews})</span></div>
          : <div className="product-rating" aria-label="Henüz değerlendirme yok"><Star /><span>Henüz değerlendirme yok</span></div>}
        <div className="delivery-line">{soldOut ? <span className="sold-out-copy">Stok bekleniyor</span> : product.deliveryLabel ? <><Package /> {product.deliveryLabel}</> : product.fastDelivery ? <><Truck weight="bold" /> Hızlı teslimat</> : <><Package /> Teslimat ödeme adımında</>}</div>
        <div className="product-price-row">
          <div className="price-block">
            {product.oldPrice && <span><del>{money.format(product.oldPrice)}</del>{discount > 0 && <b>%{discount}</b>}</span>}
            <strong>{money.format(product.price)}</strong>
          </div>
        </div>
        <div className="product-card__actions">
          <button className={cx("compare-button", compared && "is-active")} type="button" aria-pressed={compared} onClick={() => comparison.toggle(product.id)} aria-label={compared ? `${product.name} ürününü karşılaştırmadan çıkar` : `${product.name} ürününü karşılaştır`}><ArrowsLeftRight /></button>
          <button className="card-add-button" type="button" disabled={soldOut} onClick={() => onAdd(product.id)}>{soldOut ? "Tükendi" : <><ShoppingCart /> Sepete ekle</>}</button>
        </div>
      </div>
    </article>
  );
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
          <span className="section-kicker"><Sparkle weight="fill" /> Nova seçkisi</span>
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
            <a className="root-category-card" key={root.id} href={`#/kategori/${root.canonicalPath}`}>
              <img src={categoryImage(root)} alt="" />
              <span className="root-category-card__shade" aria-hidden="true" />
              <span><small>{root.descendantVisibleProductCount || getProductsForCategory(root.id).length} ürün</small><strong>{root.name}</strong><b>Keşfet <CaretRight /></b></span>
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

function ProductRoute({ summary, loadProduct, favorite, favorites, onFavorite, onAdd, session, community }) {
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
    <CanonicalProductDetail key={state.product.id} product={state.product} favorite={favorite} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} />
    <div className="shell integration-community-shell"><ProductCommunity productId={state.product.id} productName={state.product.name} session={session} community={community} sectionId="community-reviews" /></div>
  </>;
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
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const total = subtotal;
  const stockIssueItems = items.filter(({ product, quantity }) => product.stock <= 0 || quantity > product.stock);
  const hasStockIssue = stockIssueItems.length > 0;
  return (
    <main id="main-content" className="page commerce-page">
      <div className="shell"><Breadcrumbs />
        <div className="commerce-heading"><div><span className="section-kicker">Alışveriş</span><h1>Sepetim</h1><p>{items.reduce((sum, item) => sum + item.quantity, 0)} ürün siparişe hazırlanıyor.</p></div></div>
        {items.length ? (
          <div className="cart-page-grid">
            <section className="cart-page-lines" aria-label="Sepetteki ürünler">
              {items.map(({ product, quantity }) => (
                <article className="cart-page-line" key={product.id}>
                  <img src={productImage(product)} alt={product.name} />
                  <div className="cart-page-line__copy">
                    <span>{productEyebrow(product)}</span>
                    <h2><a href={`#/urun/${product.slug}`}>{product.name}</a></h2>
                    {product.stock <= 0
                      ? <small className="cart-stock-status is-unavailable"><WarningCircle weight="fill" /> Bu ürün şu anda stokta değil</small>
                      : quantity > product.stock
                        ? <small className="cart-stock-status is-unavailable"><WarningCircle weight="fill" /> Yalnız {product.stock} adet stokta; miktarı azalt</small>
                        : <small><CheckCircle weight="fill" /> {product.deliveryLabel || "Teslimat bilgisi ürün detayında"}</small>}
                    <button type="button" onClick={() => onRemove(product.id)}><Trash /> Kaldır</button>
                  </div>
                  <div className="cart-page-line__end">
                    <strong>{money.format(product.price * quantity)}</strong>
                    <div className="quantity-control">
                      <button type="button" onClick={() => onQuantity(product.id, quantity - 1)} aria-label={`${product.name} adedini azalt`}><Minus /></button>
                      <span>{quantity}</span>
                      <button type="button" disabled={product.stock <= 0 || quantity >= product.stock} onClick={() => onQuantity(product.id, quantity + 1)} aria-label={`${product.name} adedini artır`}><Plus /></button>
                    </div>
                  </div>
                </article>
              ))}
            </section>
            <aside className="order-summary">
              <h2>Sipariş Özeti</h2>
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
    window.requestAnimationFrame(() => document.getElementById("help-faqs")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  return <main id="main-content" className="page help-page"><div className="shell"><Breadcrumbs /><div className="help-hero"><Question /><span className="section-kicker">Yardım merkezi</span><h1>Nasıl yardımcı olabiliriz?</h1><p>Sipariş, teslimat, iade ve ödeme konularındaki işlem noktalarını keşfet.</p><form role="search" onSubmit={(event) => event.preventDefault()}><MagnifyingGlass /><input aria-label="Yardım konularında ara" placeholder="Bir konu ara" value={helpQuery} onChange={(event) => setHelpQuery(event.target.value)} /><button type="submit">Ara</button></form></div><div className="help-grid" aria-live="polite">{visibleTopics.map(([Icon,title,copy]) => <button type="button" onClick={() => selectTopic(title)} key={title}><Icon /><strong>{title}</strong><span>{copy}</span><CaretRight /></button>)}</div><section className="faq-list" id="help-faqs"><h2>Sık sorulan sorular</h2>{visibleFaqs.length ? visibleFaqs.map(({ question, answer }) => <details key={question}><summary>{question}<CaretDown /></summary><p>{answer}</p></details>) : <p role="status">Bu aramayla eşleşen yardım konusu bulunamadı.</p>}</section></div></main>;
}

function MobileBottomNav({ route, cartCount, favoriteCount }) {
  if (["product", "product-id", "checkout", "payment-result", "order-success", "auth", "password"].includes(route.type)) return null;
  const items = [[House,"Ana Sayfa","#/","home"],[GridFour,"Kategoriler",discoveryHref(),"category"],[Heart,"Favoriler","#/favoriler","favorites"],[User,"Hesabım","#/hesabim","account"],[ShoppingCart,"Sepet","#/sepet","cart-page"]];
  return <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">{items.map(([Icon,label,href,type]) => <a key={type} className={route.type === type ? "is-active" : ""} aria-current={route.type === type ? "page" : undefined} href={href}><span><Icon />{type === "favorites" && favoriteCount > 0 && <b>{favoriteCount}</b>}{type === "cart-page" && cartCount > 0 && <b>{cartCount}</b>}</span><small>{label}</small></a>)}</nav>;
}

function ComparisonDialog({ open, products: selectedProducts, onClose, onRemove, onAdd, returnFocusRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("is-locked");
    const restorePage = isolatePageFromModal();
    window.setTimeout(() => closeRef.current?.focus(), 20);
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
      else keepFocusInDialog(event, dialogRef.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("is-locked");
      document.removeEventListener("keydown", onKey);
      restorePage();
    };
  }, [open, onClose]);

  if (!open) return null;
  const rows = [
    ["Fiyat", (product) => money.format(product.price)],
    ["Marka", (product) => product.brand || "Belirtilmemiş"],
    ["Puan", (product) => product.reviews > 0 ? `${product.rating.toFixed(1)} · ${product.reviews} değerlendirme` : "Henüz değerlendirme yok"],
    ["Stok", (product) => product.stock > 0 ? `${product.stock} adet` : "Tükendi"],
    ["Renk", (product) => product.color || "Belirtilmemiş"],
    ["Kapasite", (product) => product.storage || "Belirtilmemiş"],
  ];
  const closeAndRestore = () => {
    onClose();
    restoreFocus(returnFocusRef);
  };

  return createPortal(<div className="overlay-layer comparison-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeAndRestore()}><section ref={dialogRef} className="comparison-dialog" role="dialog" aria-modal="true" aria-labelledby="comparison-title" tabIndex="-1"><header><div><span className="section-kicker">Canlı katalog</span><h2 id="comparison-title">Ürünleri karşılaştır</h2><p>Fiyat, stok ve ürün bilgileri güncel NovaStore kataloğundan alınır.</p></div><button ref={closeRef} className="icon-button" type="button" onClick={closeAndRestore} aria-label="Karşılaştırmayı kapat"><X /></button></header><div className="comparison-scroll"><div className="comparison-table" style={{ "--comparison-columns": selectedProducts.length }} role="table" aria-label="Seçili ürünlerin karşılaştırması"><div className="comparison-product-row" role="row"><strong role="rowheader">Ürün</strong>{selectedProducts.map((product) => <article role="cell" key={product.id}><button type="button" onClick={() => onRemove(product.id)} aria-label={`${product.name} ürününü karşılaştırmadan çıkar`}><X /></button><a href={`#/urun/${product.slug}`} onClick={closeAndRestore}><img src={productImage(product)} alt="" /><span>{productEyebrow(product)}</span><b>{product.name}</b></a><button className="primary-button" type="button" disabled={product.stock <= 0} onClick={() => onAdd(product.id)}><ShoppingCart />{product.stock > 0 ? "Sepete ekle" : "Tükendi"}</button></article>)}</div>{rows.map(([label, render]) => <div className="comparison-fact-row" role="row" key={label}><strong role="rowheader">{label}</strong>{selectedProducts.map((product) => <span role="cell" key={product.id}>{render(product)}</span>)}</div>)}</div></div></section></div>, document.body);
}

function ComparisonTray({ ids, onToggle, onClear, onAdd }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const selectedProducts = [...ids].map((id) => products.find((product) => product.id === id)).filter(Boolean);

  useEffect(() => {
    if (!selectedProducts.length) setOpen(false);
  }, [selectedProducts.length]);

  if (!selectedProducts.length) return null;
  return <><aside className="comparison-tray" aria-label="Karşılaştırma listesi"><span><ArrowsLeftRight /><span><strong>Karşılaştır</strong><small>{selectedProducts.length}/3 ürün seçildi</small></span></span><div className="comparison-tray__products">{selectedProducts.map((product) => <span key={product.id}><img src={productImage(product)} alt="" /><button type="button" onClick={() => onToggle(product.id)} aria-label={`${product.name} ürününü karşılaştırmadan çıkar`}><X /></button></span>)}</div><button ref={triggerRef} className="comparison-open" type="button" disabled={selectedProducts.length < 2} onClick={() => setOpen(true)}>{selectedProducts.length < 2 ? "Bir ürün daha seç" : "Karşılaştır"}</button><button className="comparison-clear" type="button" onClick={onClear} aria-label="Karşılaştırma listesini temizle"><Trash /></button></aside><ComparisonDialog open={open} products={selectedProducts} onClose={() => setOpen(false)} onRemove={onToggle} onAdd={onAdd} returnFocusRef={triggerRef} /></>;
}

function CartDrawer({ open, items, onClose, onRemove, returnFocusRef }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
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
    return () => { document.body.classList.remove("is-locked"); document.removeEventListener("keydown", onKey); restorePage(); };
  }, [open, onClose, returnFocusRef]);
  if (!open) return null;
  return (
    <div className="overlay-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDrawer()}>
      <div ref={dialogRef} className="cart-drawer" role="dialog" aria-modal="true" aria-label="Sepetim" tabIndex="-1">
        <div className="drawer-head"><div><h2>Sepetim</h2><span>{items.reduce((sum, item) => sum + item.quantity, 0)} ürün</span></div><button ref={closeRef} className="icon-button" type="button" onClick={closeDrawer} aria-label="Sepeti kapat"><X /></button></div>
        <div className="cart-drawer__body">{items.length ? items.map(({ product, quantity }) => <article className="cart-line" key={product.id}><img src={productImage(product)} alt="" /><div><strong>{product.name}</strong><span>{product.color ? `${product.color} · ` : ""}{quantity} adet</span><b>{money.format(product.price * quantity)}</b></div><button type="button" onClick={() => onRemove(product.id)} aria-label={`${product.name} ürününü sepetten çıkar`}><Trash /></button></article>) : <div className="cart-empty"><ShoppingBag /><h3>Sepetin henüz boş</h3><p>İhtiyacına uygun ürünleri kategorilerden keşfedebilirsin.</p><button className="primary-button" type="button" onClick={() => { closeDrawer(); navigate(defaultCategoryPath() ? `/kategori/${defaultCategoryPath()}` : "/"); }}>Alışverişe başla</button></div>}</div>
        {items.length > 0 && <div className="cart-drawer__footer"><div><span>Ürün toplamı</span><strong>{money.format(total)}</strong></div><button className="primary-button" type="button" onClick={() => { closeDrawer(); navigate("/sepet"); }}>Sepete git <CaretRight /></button><small><ShieldCheck /> Ödeme bilgileriniz güvenle korunur</small></div>}
      </div>
    </div>
  );
}

function LoadingPage() {
  return <main id="main-content" className="page"><div className="shell loading-page" aria-live="polite" aria-busy="true"><span>Ürünler hazırlanıyor…</span><div className="skeleton-heading" /><div className="skeleton-grid">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div></div></main>;
}

function NotFound() {
  return <main id="main-content" className="page"><div className="shell not-found"><span>404</span><h1>Bu sayfayı bulamadık</h1><p>Kategori taşınmış, gizlenmiş veya artık yayında olmayabilir.</p><a className="primary-button" href="#/">Ana sayfaya dön</a></div></main>;
}

function Footer() {
  return <footer className="site-footer"><div className="shell footer-grid"><div><Logo /><p>Doğru ürünü bulmanın daha kolay yolu.</p></div><div><strong>NovaStore</strong><a href="#/">Ana sayfa</a><a href="#/hesabim">Hesabım</a><a href="#/iletisim">İletişim</a></div><div><strong>Destek</strong><a href="#/siparis-takibi">Sipariş takibi</a><a href="#/yardim">İade & değişim</a><a href="#/yardim">Yardım merkezi</a></div><div><strong>Güvenli alışveriş</strong><p>Ödeme, teslimat ve iade koşulları ilgili işlem adımında doğrulanır.</p></div></div><div className="shell footer-bottom"><span>© 2026 NovaStore. Commerce Pro müşteri deneyimi.</span><span>Koşullar ilgili işlem adımında görüntülenir.</span></div></footer>;
}

export function CommerceProRuntimeApp({ runtime }) {
  const { route, loading } = useRoute();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState(() => [...runtime.cart.initialItems]);
  const cartRef = useRef(cart);
  const [favorites, setFavorites] = useState(() => new Set(runtime.favorites.initialIds));
  const favoritesRef = useRef(favorites);
  const [comparisonIds, setComparisonIds] = useState(() => new Set());
  const [session, setSession] = useState(runtime.session);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const mobileMenuTriggerRef = useRef(null);
  const cartTriggerRef = useRef(null);

  function notify(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }

  function replaceCart(next, { persist = true } = {}) {
    const normalized = next.map((item) => ({
      productId: normalizeRuntimeProductId(item.productId),
      quantity: Math.max(1, Math.min(999, Number(item.quantity || 1))),
    })).filter((item) => item.productId !== null);
    cartRef.current = normalized;
    setCart(normalized);
    if (persist) {
      runtime.cart.persist(normalized).catch(() => {
        notify("Sepet sunucuya aktarılamadı; yerel değişikliğin korunuyor.");
      });
    }
  }

  async function toggleFavorite(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    const previous = new Set(favoritesRef.current);
    const next = new Set(previous);
    const shouldFavorite = !next.has(productId);
    if (shouldFavorite) next.add(productId);
    else next.delete(productId);
    favoritesRef.current = next;
    setFavorites(next);
    try {
      await runtime.favorites.set(productId, shouldFavorite);
      notify(`${product.name} ${shouldFavorite ? "favorilere eklendi" : "favorilerden çıkarıldı"}`);
    } catch {
      favoritesRef.current = previous;
      setFavorites(previous);
      notify("Favori işlemi tamamlanamadı; seçimin değiştirilmedi.");
    }
  }

  function addToCart(productId, quantity = 1) {
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) { notify("Bu ürün şu anda stokta değil"); return; }
    const current = cartRef.current;
    const existing = current.find((item) => item.productId === productId);
    const requestedQuantity = Math.max(1, Number(quantity) || 1);
    const currentQuantity = existing?.quantity || 0;
    const nextQuantity = Math.min(product.stock, currentQuantity + requestedQuantity);
    if (nextQuantity === currentQuantity) {
      notify(`${product.name} için sepetindeki adet mevcut stoğa ulaştı.`);
      return;
    }
    const next = existing
      ? current.map((item) => item.productId === productId
        ? { ...item, quantity: nextQuantity }
        : item)
      : [...current, { productId, quantity: nextQuantity }];
    replaceCart(next);
    notify(nextQuantity - currentQuantity < requestedQuantity
      ? `${product.name} mevcut stok sınırına göre sepete eklendi.`
      : `${product.name} sepete eklendi`);
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

  function removeFromCart(productId) {
    replaceCart(cartRef.current.filter((item) => item.productId !== productId));
  }

  function toggleComparison(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setComparisonIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) {
        next.delete(productId);
        return next;
      }
      if (next.size >= 3) {
        notify("Aynı anda en fazla 3 ürünü karşılaştırabilirsin.");
        return current;
      }
      next.add(productId);
      return next;
    });
  }

  async function handoffToCheckout() {
    try {
      await runtime.cart.handoffToCheckout(cartRef.current);
    } catch {
      notify("Güvenli ödeme özeti hazırlanamadı. Lütfen yeniden dene.");
    }
  }

  const cartItems = cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) })).filter((item) => item.product);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const unsubscribe = runtime.cart.subscribe((next) => replaceCart(next, { persist: false }));
    return unsubscribe;
  }, [runtime]);

  useEffect(() => {
    const handleAuthRequired = () => {
      setSession(Object.freeze({ status: "guest", user: null, warning: null }));
      notify("Oturumunun süresi doldu. Devam etmek için yeniden giriş yap.");
    };
    window.addEventListener("novastore:auth-required", handleAuthRequired);
    return () => window.removeEventListener("novastore:auth-required", handleAuthRequired);
  }, []);

  useEffect(() => {
    const handleComparisonClick = (event) => {
      const button = event.target instanceof Element
        ? event.target.closest("button.compare-button")
        : null;
      const href = button
        ?.closest("article")
        ?.querySelector('a[href^="#/urun/"]')
        ?.getAttribute("href");
      if (!href) return;
      let slug = "";
      try {
        slug = decodeURIComponent(href.slice("#/urun/".length));
      } catch {
        return;
      }
      const product = products.find((item) => item.slug === slug);
      if (product) toggleComparison(product.id);
    };
    document.addEventListener("click", handleComparisonClick);
    return () => document.removeEventListener("click", handleComparisonClick);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const authenticated = session?.status === "authenticated" || session?.status === "unverified";
  const comparisonVisible = comparisonIds.size > 0 && !["checkout", "payment-result", "auth", "password", "order-success"].includes(route.type);
  const comparisonContext = { ids: comparisonIds, toggle: toggleComparison };
  const handleAuthenticated = async (nextSession, returnPath) => {
    setSession(nextSession);
    try {
      const refreshed = await runtime.refreshCustomerState({ cartItems: cartRef.current });
      replaceCart(refreshed.cartItems, { persist: false });
      const nextFavorites = new Set(refreshed.favoriteIds);
      favoritesRef.current = nextFavorites;
      setFavorites(nextFavorites);
    } catch {
      notify("Hesabın açıldı; sepet veya favori eşitlemesi geçici olarak tamamlanamadı.");
    }
    navigate(returnPath);
  };
  const authReturn = (path) => <CustomerAuthPage account={runtime.customer} returnPath={path} onAuthenticated={handleAuthenticated} />;
  const handleSessionUpdated = (user) => setSession((current) => Object.freeze({ ...current, status: "authenticated", user, warning: null }));
  const handleLogout = () => {
    runtime.customer.logout();
    window.location.hash = "#/";
    window.location.reload();
  };
  const handlePaymentFinalized = useCallback((purchasedItems) => {
    const next = reconcileFinalizedCart(cartRef.current, purchasedItems);
    cartRef.current = next;
    setCart(next);
    runtime.cart.persist(next).catch(() => {});
  }, [runtime]);

  let content;
  if (loading) content = <CanonicalLoadingPage />;
  else if (route.type === "home") content = <CanonicalHomePage favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "product" || route.type === "product-id") {
    const product = route.type === "product"
      ? getVisibleProducts().find((item) => item.slug === route.slug)
      : getVisibleProducts().find((item) => item.id === route.id);
    content = product ? <ProductRoute summary={product} loadProduct={runtime.catalog.loadProduct} favorite={favorites.has(product.id)} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} session={session} community={runtime.community} /> : <CanonicalNotFound />;
  } else if (route.type === "category") {
    const category = resolveCategoryPath(route.path);
    if (!category || category.active === false || category.archived === true || category.customerVisible === false || category.descendantVisibleProductCount === 0) content = <CanonicalNotFound />;
    else content = <CanonicalProductListing category={category} title={category.name} initialItems={getProductsForCategory(category.id)} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  } else if (route.type === "search") {
    const needle = route.term.toLocaleLowerCase("tr-TR");
    const results = getVisibleProducts().filter((product) => `${product.name} ${product.brand} ${product.color || ""} ${product.storage || ""} ${product.description || ""} ${(product.features || []).join(" ")} ${getBreadcrumb(product.categoryId).map((item) => item.name).join(" ")}`.toLocaleLowerCase("tr-TR").includes(needle));
    content = <CanonicalProductListing title={`“${route.term}” arama sonuçları`} initialItems={results} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  } else if (route.type === "collection") content = <CollectionRoute slug={route.slug} title={route.title} loadCollection={runtime.catalog.loadCollection} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "favorites") content = <CanonicalFavoritesPage favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "cart-page") content = <CartPage items={cartItems} onQuantity={updateCartQuantity} onRemove={removeFromCart} onCheckout={handoffToCheckout} />;
  else if (route.type === "auth") content = authenticated
    ? <CustomerAccountPage session={session} account={runtime.customer} favoriteCount={favorites.size} products={getVisibleProducts()} getProductImage={productImage} onSessionUpdated={handleSessionUpdated} onLogout={handleLogout} onNotice={notify} />
    : <CustomerAuthPage account={runtime.customer} initialMode={route.mode} returnPath={safeDecodeReturn(route.query.get("return"), "/hesabim")} onAuthenticated={handleAuthenticated} />;
  else if (route.type === "password") content = <CustomerPasswordPage account={runtime.customer} mode={route.mode} token={route.query.get("token") || ""} />;
  else if (route.type === "account") content = authenticated
    ? <CustomerAccountPage session={session} account={runtime.customer} section={route.section} orderId={route.orderId} favoriteCount={favorites.size} products={getVisibleProducts()} getProductImage={productImage} onSessionUpdated={handleSessionUpdated} onLogout={handleLogout} onNotice={notify} />
    : authReturn(route.section === "order-detail"
      ? `/hesabim/siparisler/${route.orderId}`
      : `/hesabim${route.section === "orders" ? "/siparisler" : route.section === "addresses" ? "/adresler" : route.section === "coupons" ? "/kuponlar" : route.section === "notifications" ? "/bildirimler" : route.section === "security" ? "/guvenlik" : ""}`);
  else if (route.type === "checkout") content = authenticated
    ? <CustomerCheckoutPage step={route.step} session={session} account={runtime.customer} checkout={runtime.checkout} items={cartItems} getProductImage={productImage} onStepChange={(step) => navigate(`/odeme/${step === "delivery" ? "teslimat" : step === "payment" ? "odeme" : "onay"}`)} onNotice={notify} />
    : authReturn(`/odeme/${route.step === "delivery" ? "teslimat" : route.step === "payment" ? "odeme" : "onay"}`);
  else if (route.type === "payment-result") content = authenticated
    ? <CustomerPaymentResultPage checkout={runtime.checkout} paymentRef={route.query.get("paymentRef") || ""} orderId={route.query.get("orderId") || ""} onFinalized={handlePaymentFinalized} />
    : authReturn(`/odeme/sonuc?${route.query.toString()}`);
  else if (route.type === "tracking") content = authenticated
    ? <CustomerTrackingPage session={session} account={runtime.customer} products={getVisibleProducts()} getProductImage={productImage} />
    : authReturn("/siparis-takibi");
  else if (route.type === "order-success") content = <CanonicalNotFound />;
  else if (route.type === "help") content = <HelpPage />;
  else if (route.type === "contact") content = authenticated
    ? <CustomerSupportPage session={session} account={runtime.customer} onNotice={notify} />
    : authReturn("/iletisim");
  else content = <CanonicalNotFound />;

  return (
    <ComparisonContext.Provider value={comparisonContext}>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); focusMainContent({ preventScroll: false }); }}>Ana içeriğe geç</a>
      <CanonicalHeader cartCount={cartCount} favoriteCount={favorites.size} onCartOpen={() => setCartOpen(true)} onMobileOpen={() => setMobileMenuOpen(true)} cartTriggerRef={cartTriggerRef} mobileMenuTriggerRef={mobileMenuTriggerRef} />
      {runtime.warnings.length > 0 && <div className="integration-session-warning" role="status">Bazı ikincil mağaza veya oturum verileri geçici olarak alınamadı; erişilebilen gerçek katalog gösteriliyor.</div>}
      {content}
      <CanonicalFooter />
      <CanonicalMobileCategoryDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} returnFocusRef={mobileMenuTriggerRef} />
      <CanonicalCartDrawer open={cartOpen} items={cartItems} onClose={() => setCartOpen(false)} onRemove={removeFromCart} returnFocusRef={cartTriggerRef} />
      <CanonicalMobileBottomNav route={route} cartCount={cartCount} favoriteCount={favorites.size} />
      {comparisonVisible && <ComparisonTray ids={comparisonIds} onToggle={toggleComparison} onClear={() => setComparisonIds(new Set())} onAdd={addToCart} />}
      {["help", "contact"].includes(route.type) && <AssistantWidget route={route} assistant={runtime.assistant} session={session} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} onRemove={removeFromCart} getProductImage={productImage} raised={comparisonVisible} />}
      <div className={cx("toast", toast && "is-visible")} role="status" aria-live="polite"><CheckCircle weight="fill" /><span>{toast}</span></div>
    </ComparisonContext.Provider>
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
      <CanonicalFooter />
    </>
  );
}

export function IntegratedApp() {
  const resource = useCommerceRuntime();
  if (resource.phase !== "ready") {
    return <IntegrationState phase={resource.phase} error={resource.error} onRetry={resource.retry} />;
  }
  return <CommerceProRuntimeApp runtime={resource.runtime} />;
}
