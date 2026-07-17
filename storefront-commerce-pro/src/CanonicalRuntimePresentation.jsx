import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowsLeftRight,
  ArrowsClockwise,
  Baby,
  Bell,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CreditCard,
  DeviceMobile,
  EnvelopeSimple,
  Funnel,
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
  Receipt,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Sparkle,
  Star,
  StarFour,
  Storefront,
  Television,
  Ticket,
  Trash,
  Truck,
  TShirt,
  User,
  Watch,
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

const MOCK_ORDERS = Object.freeze([
  { id: "NS-2026-00856", date: "24 Haziran 2026 · 14:32", status: "Teslim edildi", tone: "success", productIds: ["NS-1004", "NS-1006", "NS-1007"], total: 78997 },
  { id: "NS-2026-00702", date: "15 Haziran 2026 · 09:18", status: "Kargoya verildi", tone: "info", productIds: ["NS-1001", "NS-1002"], total: 90998 },
  { id: "NS-2026-00521", date: "2 Haziran 2026 · 11:05", status: "Hazırlanıyor", tone: "warning", productIds: ["NS-1006"], total: 13999 },
]);

const CHECKOUT_STEPS = ["delivery", "payment", "review"];
const CHECKOUT_PATHS = { delivery: "/odeme/teslimat", payment: "/odeme/odeme", review: "/odeme/onay" };
const HELP_TOPICS = [
  [Package, "Siparişler", "Sipariş durumu, değişiklik ve iptal"],
  [Truck, "Teslimat", "Kargo süresi ve teslimat seçenekleri"],
  [ArrowsClockwise, "İade & değişim", "14 günlük kolay iade süreci"],
  [CreditCard, "Ödeme", "Güvenli ödeme ve taksit seçenekleri"],
];
const HELP_FAQS = ["Siparişimi nasıl takip ederim?", "Bir ürünü nasıl iade ederim?", "Kargo ne zaman ücretsiz?", "Ödeme bilgilerim güvende mi?"];

function cx(...values) {
  return values.filter(Boolean).join(" ");
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
  return IMAGE_MAP[product.imageKey] || phoneImage;
}

function navigate(path) {
  const next = path.startsWith("#") ? path : `#${path}`;
  if (window.location.hash === next) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = next;
}

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, "") || "/";
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
  if (pathname.startsWith("/kategori/")) {
    const path = decode(pathname.slice(10));
    return path === null || /[?#\\]/.test(path) ? { type: "not-found", query } : { type: "category", path, query };
  }
  if (pathname === "/arama") return { type: "search", term: query.get("q") || "", query };
  if (pathname === "/koleksiyon/firsatlar") return { type: "deals", query };
  if (pathname === "/favoriler") return { type: "favorites", query };
  if (pathname === "/sepet") return { type: "cart-page", query };
  if (pathname === "/hesabim") return { type: "account", section: "overview", query };
  if (pathname === "/hesabim/adresler") return { type: "account", section: "addresses", query };
  if (pathname === "/hesabim/kuponlar") return { type: "account", section: "coupons", query };
  if (pathname === "/hesabim/bildirimler") return { type: "account", section: "notifications", query };
  if (pathname === "/hesabim/siparisler") return { type: "account", section: "orders", query };
  if (pathname.startsWith("/hesabim/siparisler/")) {
    const orderId = decode(pathname.slice(20));
    return orderId === null ? { type: "not-found", query } : { type: "account", section: "order-detail", orderId, query };
  }
  if (pathname === "/odeme/teslimat") return { type: "checkout", step: "delivery", query };
  if (pathname === "/odeme/odeme") return { type: "checkout", step: "payment", query };
  if (pathname === "/odeme/onay") return { type: "checkout", step: "review", query };
  if (pathname === "/siparis/tamamlandi") return { type: "order-success", query };
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

function Logo() {
  return (
    <a className="brand" href="#/" aria-label="NovaStore ana sayfa">
      <StarFour className="brand-mark" weight="fill" aria-hidden="true" /><span>Nova</span><strong>Store</strong>
    </a>
  );
}

function TrustBar() {
  return (
    <div className="trust-bar">
      <div className="shell trust-bar__content">
        <span><Truck weight="bold" /> 1.500 TL üzeri ücretsiz kargo</span>
        <span><ArrowsClockwise weight="bold" /> 14 gün içinde kolay iade</span>
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
  const campaignImage = root.slug === "elektronik" ? megaElectronicsImage : (ROOT_IMAGES[root.slug] || heroEditorial);
  const popularProducts = stockFirst(getProductsForCategory(root.id)).slice(0, 4);

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
            const discoveryLinks = (MEGA_DISCOVERY_TERMS[group.id] || [...new Set(getProductsForCategory(group.id).map((product) => product.brand))].map((brand) => [`${brand} seçkisi`, brand]))
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
          <strong>Popüler seçimler</strong>
          {popularProducts.map((product) => (
            <a key={product.id} href={`#/urun/${product.slug}`} onClick={onClose}>
              <img src={productImage(product)} alt="" />
              <span>{product.brand}<small>{product.name}</small></span>
              <CaretRight />
            </a>
          ))}
        </div>
      </div>

      <a className="mega-campaign" href={`#/kategori/${root.canonicalPath}`} onClick={onClose}>
        <img src={campaignImage} alt="" />
        <span className="mega-campaign__shade" aria-hidden="true" />
        <span className="mega-campaign__copy"><small>Nova seçkisi</small><strong>{root.name} fırsatları</strong><span>Keşfet <CaretRight /></span></span>
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
                <a href={`#/kategori/${root.canonicalPath}`}>{root.name}</a>
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
        <a className="deals-link" href="#/koleksiyon/firsatlar"><Sparkle weight="fill" /> Fırsatlar</a>
      </div>
      {open && <div className="shell mega-shell"><MegaMenu root={activeRoot} onRootChange={setActiveRoot} onClose={() => setOpen(false)} /></div>}
    </div>
  );
}

function Header({ cartCount, favoriteCount, onCartOpen, onMobileOpen, cartTriggerRef, mobileMenuTriggerRef }) {
  return (
    <header className="site-header">
      <TrustBar />
      <div className="shell main-header">
        <button ref={mobileMenuTriggerRef} className="mobile-menu-trigger" type="button" onClick={onMobileOpen} aria-label="Kategorileri aç"><List /></button>
        <Logo />
        <SearchBox onSearch={(term) => navigate(`/arama?q=${encodeURIComponent(term)}`)} />
        <div className="header-actions">
          <HeaderAction icon={User} label="Hesabım" detail="Siparişlerim" onClick={() => navigate("/hesabim")} />
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
          {current ? <button type="button" onClick={() => setStack((value) => value.slice(0, -1))}><ArrowLeft /> Geri</button> : <Logo />}
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
        <div className="drawer-footer"><ShieldCheck /><span><strong>NovaStore güvencesi</strong><small>Güvenli ödeme ve kolay iade</small></span></div>
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
  const [compared, setCompared] = useState(false);
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
        <span className="product-brand">{product.brand}</span>
        <h3><a href={`#/urun/${product.slug}`}>{product.name}</a></h3>
        <div className="product-rating" aria-label={`${product.rating} puan, ${product.reviews} değerlendirme`}><Star weight="fill" /><strong>{product.rating.toFixed(1)}</strong><span>({product.reviews})</span></div>
        <div className="delivery-line">{soldOut ? <span className="sold-out-copy">Stok bekleniyor</span> : product.fastDelivery ? <><Truck weight="bold" /> Yarın kapında</> : <><Package /> 2–3 iş gününde</>}</div>
        <div className="product-price-row">
          <div className="price-block">
            {product.oldPrice && <span><del>{money.format(product.oldPrice)}</del>{discount > 0 && <b>%{discount}</b>}</span>}
            <strong>{money.format(product.price)}</strong>
          </div>
        </div>
        <div className="product-card__actions">
          <button className={cx("compare-button", compared && "is-active")} type="button" aria-pressed={compared} onClick={() => setCompared((value) => !value)} aria-label={compared ? `${product.name} ürününü karşılaştırmadan çıkar` : `${product.name} ürününü karşılaştır`}><ArrowsLeftRight /></button>
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
    [Truck, "Ücretsiz kargo", "1.500 TL üzeri siparişlerde"],
    [ShieldCheck, "Güvenli alışveriş", "3D Secure ödeme altyapısı"],
    [ArrowsClockwise, "Kolay iade", "14 gün içinde ücretsiz"],
    [Headphones, "Nova desteği", "Satış öncesi ve sonrası"],
  ];
  return <div className="benefit-strip">{benefits.map(([Icon, title, copy]) => <div key={title}><Icon /><span><strong>{title}</strong><small>{copy}</small></span></div>)}</div>;
}

function HomePage({ favorites, onFavorite, onAdd }) {
  const roots = getVisibleRoots();
  const featured = sortProducts(getVisibleProducts(), "featured").slice(0, 8);
  return (
    <main id="main-content" className="page page-home">
      <section className="home-hero shell">
        <img src={heroEditorial} alt="Modern telefon, dizüstü bilgisayar, kulaklık ve akıllı saat seçkisi" />
        <div className="home-hero__shade" aria-hidden="true" />
        <div className="home-hero__copy">
          <span className="section-kicker"><Sparkle weight="fill" /> Nova seçkisi</span>
          <h1>İyi teknoloji,<br />doğru seçimle başlar.</h1>
          <p>İhtiyacına göre düzenlenmiş kategoriler, karşılaştırılabilir ürünler ve güvenli alışveriş deneyimi.</p>
          <div><a className="primary-button" href="#/kategori/elektronik">Elektroniği keşfet <CaretRight /></a><a className="ghost-button" href="#/koleksiyon/firsatlar">Günün fırsatları</a></div>
        </div>
      </section>
      <div className="shell"><BenefitStrip /></div>
      <section className="section shell">
        <div className="section-heading"><div><span className="section-kicker">Kategoriler</span><h2>Aradığını kolayca bul</h2></div><p>Her kategori, ihtiyacına uygun alt başlıklar ve filtrelerle düzenlendi.</p></div>
        <div className="root-category-grid">
          {roots.map((root) => (
            <a className="root-category-card" key={root.id} href={`#/kategori/${root.canonicalPath}`}>
              <img src={ROOT_IMAGES[root.slug] || homeImage} alt="" />
              <span className="root-category-card__shade" aria-hidden="true" />
              <span><small>{root.descendantVisibleProductCount || getProductsForCategory(root.id).length} ürün</small><strong>{root.name}</strong><b>Keşfet <CaretRight /></b></span>
            </a>
          ))}
        </div>
      </section>
      <section className="section section--soft">
        <div className="shell">
          <div className="section-heading"><div><span className="section-kicker">Öne çıkanlar</span><h2>Bugünün favorileri</h2></div><a className="text-link" href="#/koleksiyon/firsatlar">Tümünü gör <CaretRight /></a></div>
          <ProductGrid items={featured} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} />
        </div>
      </section>
      <section className="section shell category-story">
        <div><span className="section-kicker">Ev & Yaşam</span><h2>Yaşam alanını<br />yeniden keşfet.</h2><p>İşlevi ve tasarımı bir araya getiren ev teknolojileri, küçük ev aletleri ve dekorasyon seçkileri.</p><a className="primary-button" href="#/kategori/ev-yasam">Koleksiyonu incele <CaretRight /></a></div>
        <img src={homeImage} alt="Modern bir oturma odası ve ev ürünleri" />
      </section>
    </main>
  );
}

function CategoryLanding({ category, favorites, onFavorite, onAdd }) {
  const children = getVisibleChildren(category.id);
  const categoryProducts = stockFirst(getProductsForCategory(category.id)).slice(0, 8);
  const root = getBreadcrumb(category.id)[0] || category;
  const campaign = root.slug === "ev-yasam" ? homeImage : heroEditorial;

  return (
    <main id="main-content" className="page">
      <div className="shell"><Breadcrumbs category={category} /></div>
      <section className="category-hero shell">
        <div><span className="section-kicker">NovaStore kategorileri</span><h1>{category.name}</h1><p>{category.seoDescription || `${category.name} kategorisinde aradığın ürünleri kolayca karşılaştır ve güvenle seç.`}</p><a className="primary-button" href={`#/kategori/${category.canonicalPath}/${children[0]?.slug || ""}`}>Ürünleri keşfet <CaretRight /></a></div>
        <img src={campaign} alt={`${category.name} seçkisi`} />
      </section>
      <section className="section shell">
        <div className="section-heading"><div><span className="section-kicker">Alt kategoriler</span><h2>{category.name} içinde keşfet</h2></div><span className="result-pill">{categoryProducts.length} görünür ürün</span></div>
        <div className="subcategory-grid">
          {children.map((child, index) => {
            const childProducts = getProductsForCategory(child.id);
            const sample = childProducts[0];
            return <a key={child.id} href={`#/kategori/${child.canonicalPath}`}><img src={sample ? productImage(sample) : [phoneImage, laptopImage, headphonesImage, homeImage][index % 4]} alt="" /><span><small>{childProducts.length} ürün</small><strong>{child.name}</strong><b>Tümünü gör <CaretRight /></b></span></a>;
          })}
        </div>
      </section>
      {categoryProducts.length > 0 && <section className="section section--soft"><div className="shell"><div className="section-heading"><div><span className="section-kicker">Seçili ürünler</span><h2>{category.name} favorileri</h2></div></div><ProductGrid items={categoryProducts} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} /></div></section>}
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
      <FilterSection title="Marka">
        {(facets.brands || []).map(({ value: brand, count }) => <label className="check-option" key={brand}><input type="checkbox" checked={selectedBrands.has(brand)} onChange={() => toggleValue(setSelectedBrands, brand)} /><span><Check />{brand}</span><small>{count}</small></label>)}
      </FilterSection>
      <FilterSection title="Fiyat aralığı">
        <div className="price-inputs"><label><span>En az</span><input aria-label="En düşük fiyat" type="number" value={minPrice ?? priceMin} min={priceMin} max={effectiveMax} step="100" onChange={(event) => setMinPrice(event.target.value === "" ? "" : Number(event.target.value))} onBlur={() => setMinPrice((current) => current === "" || current === null ? null : Math.min(effectiveMax, Math.max(priceMin, Number(current))))} /></label><label><span>En çok</span><input aria-label="En yüksek fiyat alanı" type="number" value={maxPrice ?? priceMax} min={effectiveMin} max={priceMax} step="100" onChange={(event) => setMaxPrice(event.target.value === "" ? "" : Number(event.target.value))} onBlur={() => setMaxPrice((current) => current === "" || current === null ? null : Math.min(priceMax, Math.max(effectiveMin, Number(current))))} /></label></div>
        <input className="price-range" aria-label="En yüksek fiyat" type="range" min={effectiveMin} max={priceMax || 1} step="100" value={effectiveMax} disabled={priceMax <= effectiveMin} onChange={(event) => setMaxPrice(Number(event.target.value))} />
      </FilterSection>
      <FilterSection title="Ürün puanı">
        {[4.8, 4.5, 4].map((rating) => <label className="check-option" key={rating}><input type="checkbox" checked={minRating === rating} onChange={() => setMinRating((current) => current === rating ? null : rating)} /><span className="stars"><Check />{Array.from({ length: 5 }, (_, index) => <Star key={index} weight={index < Math.floor(rating) ? "fill" : "regular"} />)} {rating} ve üzeri</span><small>{facets.rating?.find((item) => item.value === rating)?.count || 0}</small></label>)}
      </FilterSection>
      {(facets.colors || []).length > 1 && <FilterSection title="Renk" defaultOpen={false}>{facets.colors.map(({ value, count }) => <label className="check-option" key={value}><input type="checkbox" checked={selectedColors.has(value)} onChange={() => toggleValue(setSelectedColors, value)} /><span><Check />{value}</span><small>{count}</small></label>)}</FilterSection>}
      {(facets.storage || []).length > 1 && <FilterSection title="Kapasite" defaultOpen={false}>{facets.storage.map(({ value, count }) => <label className="check-option" key={value}><input type="checkbox" checked={selectedStorage.has(value)} onChange={() => toggleValue(setSelectedStorage, value)} /><span><Check />{value}</span><small>{count}</small></label>)}</FilterSection>}
      <FilterSection title="Teslimat">
        <label className="check-option"><input type="checkbox" checked={fastDelivery} onChange={(event) => setFastDelivery(event.target.checked)} /><span><Check />Yarın kapında</span><small>{facets.fastDelivery?.find((item) => item.value === true)?.count || 0}</small></label>
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
  if (fastDelivery) activeFilters.push({ key: "fast", label: "Yarın kapında", remove: () => setFastDelivery(false) });
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

function ProductDetail({ product, favorite, favorites, onFavorite, onAdd }) {
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

  function moveTabFocus(event, currentIndex) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? detailTabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + detailTabs.length) % detailTabs.length;
    const next = detailTabs[nextIndex];
    setActiveTab(next.id);
    document.getElementById(`product-tab-${next.id}`)?.focus();
  }

  function tabContent(tabId) {
    if (tabId === "description") return <><p>{product.description}</p><ul>{product.features.map((feature) => <li key={feature}><Check />{feature}</li>)}</ul></>;
    if (tabId === "features") return <dl><div><dt>Marka</dt><dd>{product.brand}</dd></div><div><dt>Renk</dt><dd>{product.color}</dd></div><div><dt>Garanti</dt><dd>2 yıl</dd></div><div><dt>Stok kodu</dt><dd>{product.id}</dd></div></dl>;
    return <p>Siparişler 24 saat içinde hazırlanır. 1.500 TL üzerindeki siparişlerde kargo ücretsizdir. Teslimden itibaren 14 gün içinde kolay iade talebi oluşturabilirsin.</p>;
  }

  return (
    <main id="main-content" className="page product-page">
      <div className="shell"><Breadcrumbs category={category} productName={product.name} />
        <div className="product-detail-grid">
          <section className="product-gallery" aria-label="Ürün görseli"><span className="product-badge">{soldOut ? "Tükendi" : product.badge}</span><button className={cx("favorite-button", favorite && "is-active")} type="button" onClick={() => onFavorite(product.id)} aria-pressed={favorite} aria-label={favorite ? "Favorilerden çıkar" : "Favorilere ekle"}><Heart weight={favorite ? "fill" : "regular"} /></button><img src={productImage(product)} alt={product.name} /><span className="zoom-note"><span>Görseli büyütmek için üzerine gel</span><b>Dokunarak büyüt</b></span></section>
          <section className="product-summary">
            <span className="product-brand">{product.brand}</span><h1>{product.name}</h1>
            <div className="detail-rating"><span><Star weight="fill" /> {product.rating.toFixed(1)}</span><button type="button" onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth", block: "start" })}>{product.reviews} değerlendirme</button><small>Ürün kodu: {product.id}</small></div>
            <div className="detail-price"><strong>{money.format(product.price)}</strong>{product.oldPrice && <del>{money.format(product.oldPrice)}</del>}</div>
            <p className="installment">Peşin fiyatına <strong>3 taksit</strong> · Aylık {money.format(Math.ceil(product.price / 3))}</p>
            {colorOptions.length > 0 && <div className="variant-group"><div><strong>Renk</strong><span>{colorOptions[0]}</span></div><button className="color-swatch is-active" type="button" aria-label={colorOptions[0]} aria-pressed="true"><i /></button></div>}
            {storageOptions.length > 0 && <div className="variant-group"><div><strong>Kapasite</strong><span>Stokta</span></div><div className="storage-options">{storageOptions.map((storage) => <button key={storage} className={selectedStorage === storage ? "is-active" : ""} type="button" aria-pressed={selectedStorage === storage} onClick={() => setSelectedStorage(storage)}>{storage}</button>)}</div></div>}
            <div className="purchase-row"><div className="quantity-control"><button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))} aria-label="Adedi azalt"><Minus /></button><span>{quantity}</span><button type="button" onClick={() => setQuantity((value) => Math.min(9, value + 1))} aria-label="Adedi artır"><Plus /></button></div><button className="primary-button" type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}><ShoppingCart /> {soldOut ? "Tükendi" : "Sepete ekle"}</button></div>
            <div className="stock-line">{soldOut ? <><X /> Stokta yok</> : <><CheckCircle weight="fill" /> Stokta · 24 saat içinde kargoda</>}</div>
            <div className="detail-benefits"><div><Truck /><span><strong>Ücretsiz teslimat</strong><small>1–2 iş günü</small></span></div><div><ArrowsClockwise /><span><strong>Kolay iade</strong><small>14 gün içinde</small></span></div><div><ShieldCheck /><span><strong>2 yıl garanti</strong><small>NovaStore güvencesi</small></span></div></div>
          </section>
        </div>
        <section className="detail-tabs" id="reviews">
          <div role="tablist" aria-label="Ürün bilgileri">{detailTabs.map((tab, index) => <button id={`product-tab-${tab.id}`} key={tab.id} role="tab" aria-selected={activeTab === tab.id} aria-controls={`product-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => moveTabFocus(event, index)}>{tab.label}</button>)}</div>
          {detailTabs.map((tab) => <div id={`product-panel-${tab.id}`} key={tab.id} role="tabpanel" aria-labelledby={`product-tab-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} hidden={activeTab !== tab.id}>{tabContent(tab.id)}</div>)}
        </section>
        {related.length > 0 && <section className="section"><div className="section-heading"><div><span className="section-kicker">Benzer ürünler</span><h2>Bunları da sevebilirsin</h2></div></div><ProductGrid items={related} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} /></section>}
      </div>
      <div className="mobile-purchase-bar"><div><small>Toplam</small><strong>{money.format(product.price * quantity)}</strong></div><button type="button" disabled={soldOut} onClick={() => onAdd(product.id, quantity)}><ShoppingCart />{soldOut ? "Tükendi" : "Sepete ekle"}</button></div>
    </main>
  );
}

function FavoritesPage({ favorites, onFavorite, onAdd }) {
  const items = stockFirst(getVisibleProducts().filter((product) => favorites.has(product.id)));
  return (
    <main id="main-content" className="page commerce-page favorites-page">
      <div className="shell"><Breadcrumbs />
        <div className="commerce-heading"><div><span className="section-kicker">Listem</span><h1>Favorilerim</h1><p>{items.length} ürün daha sonra değerlendirmek için kaydedildi.</p></div>{items.length > 0 && <button className="primary-button" type="button" onClick={() => items.filter((item) => item.stock > 0).forEach((item) => onAdd(item.id))}><ShoppingCart /> Tümünü sepete ekle</button>}</div>
        {items.length > 0 ? <><h2 className="sr-only">Favori ürünler</h2><ProductGrid items={items} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} /></> : <div className="large-empty"><Heart /><h2>Favori listen henüz boş</h2><p>Beğendiğin ürünleri kalp simgesine dokunarak burada toplayabilirsin.</p><a className="primary-button" href="#/kategori/elektronik">Ürünleri keşfet</a></div>}
        <div className="commerce-benefits"><BenefitStrip /></div>
      </div>
    </main>
  );
}

function CartPage({ items, onQuantity, onRemove, appliedCoupon, onApplyCoupon }) {
  const [coupon, setCoupon] = useState(appliedCoupon || "");
  const couponApplied = appliedCoupon === "NOVA5";
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shipping = subtotal >= 1500 ? 0 : 79.9;
  const discount = couponApplied ? Math.min(500, subtotal * 0.05) : 0;
  const total = subtotal + shipping - discount;
  return (
    <main id="main-content" className="page commerce-page">
      <div className="shell"><Breadcrumbs />
        <div className="commerce-heading"><div><span className="section-kicker">Alışveriş</span><h1>Sepetim</h1><p>{items.reduce((sum, item) => sum + item.quantity, 0)} ürün siparişe hazırlanıyor.</p></div></div>
        {items.length ? <div className="cart-page-grid"><section className="cart-page-lines" aria-label="Sepetteki ürünler">{items.map(({ product, quantity }) => <article className="cart-page-line" key={product.id}><img src={productImage(product)} alt={product.name} /><div className="cart-page-line__copy"><span>{product.brand}</span><h2><a href={`#/urun/${product.slug}`}>{product.name}</a></h2><small><CheckCircle weight="fill" /> Stokta · 24 saat içinde kargoda</small><button type="button" onClick={() => onRemove(product.id)}><Trash /> Kaldır</button></div><div className="cart-page-line__end"><strong>{money.format(product.price * quantity)}</strong><div className="quantity-control"><button type="button" onClick={() => onQuantity(product.id, quantity - 1)} aria-label={`${product.name} adedini azalt`}><Minus /></button><span>{quantity}</span><button type="button" onClick={() => onQuantity(product.id, quantity + 1)} aria-label={`${product.name} adedini artır`}><Plus /></button></div></div></article>)}</section><aside className="order-summary"><h2>Sipariş Özeti</h2><dl><div><dt>Ara toplam</dt><dd>{money.format(subtotal)}</dd></div><div><dt>Kargo</dt><dd>{shipping ? money.format(shipping) : "Ücretsiz"}</dd></div>{discount > 0 && <div className="discount-row"><dt>İndirim</dt><dd>−{money.format(discount)}</dd></div>}<div className="order-total"><dt>Toplam</dt><dd>{money.format(total)}</dd></div></dl><div className="shipping-progress"><span style={{ width: `${Math.min(100, subtotal / 15)}%` }} /><p>{shipping ? `Ücretsiz kargo için ${money.format(1500 - subtotal)} kaldı` : "Ücretsiz kargo kazandın"}</p></div><form className="coupon-form" onSubmit={(event) => { event.preventDefault(); const normalized = coupon.trim().toLocaleUpperCase("tr-TR"); onApplyCoupon(normalized === "NOVA5" ? "NOVA5" : ""); }}><label htmlFor="coupon">İndirim kodu</label><div><input id="coupon" value={coupon} onChange={(event) => { const next = event.target.value; setCoupon(next); if (couponApplied && next.trim().toLocaleUpperCase("tr-TR") !== "NOVA5") onApplyCoupon(""); }} placeholder="NOVA5" /><button type="submit">Uygula</button></div>{coupon && <small className={couponApplied ? "is-success" : ""}>{couponApplied ? "NOVA5 indirimi uygulandı" : "Demo kodu: NOVA5"}</small>}</form><a className="primary-button checkout-button" href="#/odeme/teslimat"><ShieldCheck /> Güvenli ödemeye geç</a><small className="summary-security"><ShieldCheck /> Ödeme bilgileriniz güvenle korunur</small></aside></div> : <div className="large-empty"><ShoppingBag /><h2>Sepetin henüz boş</h2><p>İhtiyacına uygun ürünleri kategorilerden keşfedebilirsin.</p><a className="primary-button" href="#/kategori/elektronik">Alışverişe başla</a></div>}
      </div>
    </main>
  );
}

function CheckoutStepper({ step }) {
  const steps = [{ id: "delivery", label: "Teslimat" }, { id: "payment", label: "Ödeme" }, { id: "review", label: "Sipariş Onayı" }];
  const active = Math.max(0, steps.findIndex((item) => item.id === step));
  return <ol className="checkout-stepper">{steps.map((item, index) => <li key={item.id} className={cx(index <= active && "is-active", index < active && "is-complete")} aria-current={index === active ? "step" : undefined}><span>{index < active ? <Check /> : index + 1}</span><strong>{item.label}</strong></li>)}</ol>;
}

function CheckoutPage({ step, items, appliedCoupon, consent, onConsentChange, onStepChange, onComplete }) {
  const [address, setAddress] = useState("home");
  const [shipping, setShipping] = useState("standard");
  const [cardName, setCardName] = useState("Ahmet Yılmaz");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [customAddress, setCustomAddress] = useState(null);
  const subtotal = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const standardShippingCost = subtotal >= 1500 ? 0 : 79.9;
  const shippingCost = shipping === "express" ? 59.9 : standardShippingCost;
  const discount = appliedCoupon === "NOVA5" ? Math.min(500, subtotal * 0.05) : 0;
  const total = subtotal + shippingCost - discount;
  const addressLabel = address === "work" ? "İş Adresim" : address === "new" ? customAddress?.title || "Yeni Adres" : "Ev Adresim";
  const addressCity = address === "work" ? "Sarıyer / İstanbul" : address === "new" ? customAddress?.city || "İstanbul" : "Kadıköy / İstanbul";
  if (!items.length) return <main id="main-content" className="page commerce-page"><div className="shell"><div className="large-empty"><ShoppingBag /><h1>Ödemeye devam etmek için sepetine ürün ekle</h1><a className="primary-button" href="#/kategori/elektronik">Ürünleri keşfet</a></div></div></main>;
  return (
    <main id="main-content" className="page checkout-page"><div className="shell"><Breadcrumbs />
      <div className="checkout-title"><span className="section-kicker">NovaStore güvencesi</span><h1>Güvenli Ödeme</h1></div><CheckoutStepper step={step} />
      <div className="checkout-layout"><section className="checkout-panel">{step === "delivery" && <><div className="checkout-panel__head"><div><MapPin /><span><strong>Teslimat Bilgileri</strong><small>Kayıtlı adresini ve kargo hızını seç</small></span></div><button type="button" aria-expanded={showAddressForm} onClick={() => setShowAddressForm((value) => !value)}>Adres ekle</button></div>{showAddressForm && <form className="inline-address-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); setCustomAddress({ title: String(data.get("title") || "Yeni Adres"), city: String(data.get("city") || "İstanbul") }); setAddress("new"); setShowAddressForm(false); }}><label>Adres başlığı<input name="title" required defaultValue="Yeni Adres" /></label><label>İlçe / şehir<input name="city" required defaultValue="Beşiktaş / İstanbul" /></label><button className="primary-button" type="submit">Adresi kullan</button></form>}<div className="address-grid"><label className={address === "home" ? "is-selected" : ""}><input type="radio" name="address" checked={address === "home"} onChange={() => setAddress("home")} /><strong>Ev Adresim</strong><span>Ahmet Yılmaz</span><p>Atatürk Mah. 1234. Sok. No:5 D:7<br />34700 Kadıköy / İstanbul</p></label><label className={address === "work" ? "is-selected" : ""}><input type="radio" name="address" checked={address === "work"} onChange={() => setAddress("work")} /><strong>İş Adresim</strong><span>Ahmet Yılmaz</span><p>Maslak Mah. Büyükdere Cad. No:245<br />Sarıyer / İstanbul</p></label>{customAddress && <label className={address === "new" ? "is-selected" : ""}><input type="radio" name="address" checked={address === "new"} onChange={() => setAddress("new")} /><strong>{customAddress.title}</strong><span>Ahmet Yılmaz</span><p>{customAddress.city}</p></label>}</div><h2>Kargo seçenekleri</h2><div className="choice-list"><label className={shipping === "standard" ? "is-selected" : ""}><input type="radio" name="shipping" checked={shipping === "standard"} onChange={() => setShipping("standard")} /><span><strong>Standart Kargo</strong><small>2–3 iş günü</small></span><b>{standardShippingCost ? money.format(standardShippingCost) : "Ücretsiz"}</b></label><label className={shipping === "express" ? "is-selected" : ""}><input type="radio" name="shipping" checked={shipping === "express"} onChange={() => setShipping("express")} /><span><strong>Hızlı Kargo</strong><small>1 iş günü</small></span><b>{money.format(59.9)}</b></label></div><button className="primary-button checkout-next" type="button" onClick={() => onStepChange("payment")}>Ödemeye devam et <CaretRight /></button></>}
      {step === "payment" && <><div className="checkout-panel__head"><div><CreditCard /><span><strong>Ödeme Yöntemi</strong><small>Bu prototip gerçek ödeme veya kart kaydı yapmaz</small></span></div></div><div className="payment-method is-selected"><CreditCard /><span><strong>Kredi / Banka Kartı</strong><small>3D Secure ile güvenli ödeme</small></span><b>VISA · Mastercard</b></div><div className="card-form"><label>Kart üzerindeki ad<input value={cardName} onChange={(event) => setCardName(event.target.value)} /></label><label>Kart numarası<input inputMode="numeric" value="•••• •••• •••• 4242" readOnly /></label><div><label>Son kullanma<input value="12/29" readOnly /></label><label>CVV<input value="•••" readOnly /></label></div></div><label className="secure-consent"><input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} /> <span>Ön bilgilendirme formunu ve mesafeli satış sözleşmesini okudum.</span></label><div className="checkout-navigation"><button type="button" onClick={() => onStepChange("delivery")}><ArrowLeft /> Geri</button><button className="primary-button" type="button" disabled={!consent} onClick={() => onStepChange("review")}>Siparişi kontrol et <CaretRight /></button></div></>}
      {step === "review" && <><div className="checkout-panel__head"><div><Receipt /><span><strong>Siparişini Kontrol Et</strong><small>Onaylamadan önce teslimat ve ürün bilgilerini incele</small></span></div></div><div className="review-box"><span>Teslimat</span><strong>{addressLabel}</strong><p>Ahmet Yılmaz · {addressCity}</p></div><div className="review-products">{items.map(({ product, quantity }) => <div key={product.id}><img src={productImage(product)} alt="" /><span><strong>{product.name}</strong><small>{quantity} adet</small></span><b>{money.format(product.price * quantity)}</b></div>)}</div><div className="checkout-navigation"><button type="button" onClick={() => onStepChange("payment")}><ArrowLeft /> Geri</button><button className="primary-button" type="button" onClick={() => onComplete(total)}><ShieldCheck /> Siparişi onayla</button></div></>}</section>
      <aside className="order-summary checkout-summary"><h2>Sipariş Özeti</h2><div className="summary-products">{items.map(({ product, quantity }) => <div key={product.id}><img src={productImage(product)} alt="" /><span>{product.name}<small>{quantity} adet</small></span><b>{money.format(product.price * quantity)}</b></div>)}</div><dl><div><dt>Ara toplam</dt><dd>{money.format(subtotal)}</dd></div><div><dt>Kargo</dt><dd>{shippingCost ? money.format(shippingCost) : "Ücretsiz"}</dd></div>{discount > 0 && <div className="discount-row"><dt>NOVA5 indirimi</dt><dd>−{money.format(discount)}</dd></div>}<div className="order-total"><dt>Toplam</dt><dd>{money.format(total)}</dd></div></dl><small className="summary-security"><ShieldCheck /> KDV dahil · Güvenli prototip ödeme akışı</small></aside></div>
      <div className="mobile-checkout-bar"><div><small>Toplam</small><strong>{money.format(total)}</strong></div><button type="button" disabled={step === "payment" && !consent} onClick={() => step === "delivery" ? onStepChange("payment") : step === "payment" ? onStepChange("review") : onComplete(total)}>{step === "delivery" ? "Devam et" : step === "payment" ? "Kontrol et" : "Siparişi onayla"}<CaretRight /></button></div>
    </div></main>
  );
}

function OrderSuccessPage({ total }) {
  return <main id="main-content" className="page success-page"><div className="shell"><div className="success-card"><span className="success-icon"><Check /></span><span className="section-kicker">Sipariş onayı</span><h1>Siparişiniz Alındı</h1><p>Teşekkür ederiz. Sipariş detayları ve teslimat adımları aşağıda hazır.</p><div className="success-meta"><div><small>Sipariş No</small><strong>NS-2026-00923</strong></div><div><small>Sipariş Tarihi</small><strong>11 Temmuz 2026 · 23:45</strong></div><div><small>Toplam Tutar</small><strong>{money.format(total || 24997)}</strong></div></div><div className="order-timeline">{["Sipariş alındı", "Hazırlanıyor", "Kargoya verilecek", "Yolda", "Teslim edilecek"].map((label, index) => <div key={label} className={index === 0 ? "is-active" : ""}><span>{index === 0 ? <Check /> : index + 1}</span><strong>{label}</strong><small>{index === 0 ? "11 Temmuz" : `${12 + index} Temmuz`}</small></div>)}</div><div className="success-actions"><a href="#/hesabim/siparisler"><Receipt /> Siparişlerimi görüntüle</a><a href="#/siparis-takibi"><Truck /> Kargo takibi yap</a><a className="primary-button" href="#/">Alışverişe devam et</a></div></div><BenefitStrip /></div></main>;
}

function AccountSidebar({ section }) {
  const items = [[User, "Hesap özetim", "#/hesabim", "overview"], [MapPin, "Adreslerim", "#/hesabim/adresler", "addresses"], [Receipt, "Siparişlerim", "#/hesabim/siparisler", "orders"], [Heart, "Favorilerim", "#/favoriler", "favorites"], [Ticket, "Kuponlarım", "#/hesabim/kuponlar", "coupons"], [Bell, "Bildirimlerim", "#/hesabim/bildirimler", "notifications"]];
  return <aside className="account-sidebar"><h2>Hesabım</h2>{items.map(([Icon, label, href, id]) => <a key={id} className={section === id ? "is-active" : ""} aria-current={section === id ? "page" : undefined} href={href}><Icon />{label}<CaretRight /></a>)}</aside>;
}

function AccountUtilityContent({ section }) {
  if (section === "addresses") return <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Adreslerim</h1><p>Teslimat sırasında kullanacağın kayıtlı adresler.</p></div><button className="primary-button" type="button">Yeni adres ekle</button></div><div className="account-utility-grid"><article><MapPin /><h2>Ev Adresim</h2><p>Atatürk Mah. 1234. Sok. No:5 D:7<br />Kadıköy / İstanbul</p><button type="button">Düzenle</button></article><article><MapPin /><h2>İş Adresim</h2><p>Maslak Mah. Büyükdere Cad. No:245<br />Sarıyer / İstanbul</p><button type="button">Düzenle</button></article></div></>;
  if (section === "coupons") return <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Kuponlarım</h1><p>Kullanıma hazır iki NovaStore avantajı.</p></div></div><div className="account-utility-grid"><article><Ticket /><h2>NOVA5</h2><p>Sepette %5 indirim · En fazla 500 TL</p><a href="#/sepet">Sepette kullan</a></article><article><Ticket /><h2>ÜCRETSİZKARGO</h2><p>750 TL üzeri siparişlerde ücretsiz standart kargo</p><a href="#/kategori/elektronik">Ürünleri keşfet</a></article></div></>;
  return <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Bildirimlerim</h1><p>Sipariş ve kampanya güncellemelerin.</p></div></div><div className="notification-list"><article><Truck /><span><strong>NS-2026-00702 kargoya verildi</strong><small>Bugün · 10:18</small></span></article><article><Sparkle /><span><strong>Favori ürününde fiyat avantajı var</strong><small>Dün · 18:40</small></span></article><article><Ticket /><span><strong>NOVA5 kuponun kullanıma hazır</strong><small>9 Temmuz · 09:15</small></span></article></div></>;
}

function AccountPage({ section = "overview", orderId, favoriteCount = 0 }) {
  const [orderSort, setOrderSort] = useState("date");
  const selectedOrder = MOCK_ORDERS.find((order) => order.id === orderId) || (section === "order-detail" ? null : MOCK_ORDERS[0]);
  const displayedOrders = orderSort === "status" ? [...MOCK_ORDERS].sort((left, right) => left.status.localeCompare(right.status, "tr")) : MOCK_ORDERS;
  if (section === "order-detail" && !selectedOrder) return <NotFound />;
  if (["addresses", "coupons", "notifications"].includes(section)) return <main id="main-content" className="page commerce-page"><div className="shell"><Breadcrumbs /><div className="account-layout"><AccountSidebar section={section} /><section className="account-content"><AccountUtilityContent section={section} /></section></div></div></main>;
  return <main id="main-content" className="page commerce-page"><div className="shell"><Breadcrumbs /><div className="account-layout"><AccountSidebar section={section === "order-detail" ? "orders" : section} /><section className="account-content">{section === "overview" && <><div className="commerce-heading"><div><span className="section-kicker">Hoş geldin</span><h1>Ahmet, hesabın hazır.</h1><p>Siparişlerini, adreslerini ve favorilerini tek yerden yönet.</p></div></div><div className="account-stats"><a href="#/hesabim/siparisler"><Receipt /><span><strong>3</strong><small>Aktif sipariş</small></span></a><a href="#/favoriler"><Heart /><span><strong>{favoriteCount}</strong><small>Favori ürün</small></span></a><a href="#/hesabim"><Ticket /><span><strong>2</strong><small>Kullanılabilir kupon</small></span></a></div><h2>Son siparişlerin</h2><div className="order-list">{MOCK_ORDERS.slice(0, 2).map((order) => <OrderCard key={order.id} order={order} />)}</div></>}{section === "orders" && <><div className="commerce-heading"><div><span className="section-kicker">Hesabım</span><h1>Siparişlerim</h1><p>{MOCK_ORDERS.length} sipariş bulundu.</p></div><select aria-label="Siparişleri sırala" value={orderSort} onChange={(event) => setOrderSort(event.target.value)}><option value="date">Tarihe göre: yeni → eski</option><option value="status">Duruma göre</option></select></div><div className="order-list">{displayedOrders.map((order) => <OrderCard key={order.id} order={order} />)}</div></>}{section === "order-detail" && <><a className="back-link" href="#/hesabim/siparisler"><ArrowLeft /> Siparişlerime dön</a><div className="commerce-heading"><div><span className="section-kicker">Sipariş detayı</span><h1>{selectedOrder.id}</h1><p>{selectedOrder.date}</p></div><span className={`status-pill is-${selectedOrder.tone}`}>{selectedOrder.status}</span></div><div className="order-detail-products">{selectedOrder.productIds.map((id) => { const product = products.find((item) => item.id === id); return product ? <div key={id}><img src={productImage(product)} alt="" /><span><strong>{product.name}</strong><small>1 adet · {product.color}</small></span><b>{money.format(product.price)}</b></div> : null; })}</div><div className="order-detail-grid"><div><MapPin /><span><strong>Teslimat adresi</strong><p>Atatürk Mah. 1234. Sok. No:5 D:7<br />Kadıköy / İstanbul</p></span></div><div><CreditCard /><span><strong>Ödeme</strong><p>Kredi kartı · •••• 4242</p></span></div></div></>}</section></div></div></main>;
}

function OrderCard({ order }) {
  const orderProducts = order.productIds.map((id) => products.find((item) => item.id === id)).filter(Boolean);
  return <article className="order-card"><div className="order-card__head"><span><strong>Sipariş No: {order.id}</strong><small>{order.date}</small></span><span className={`status-pill is-${order.tone}`}>{order.status}</span><b>{money.format(order.total)}</b></div><div className="order-card__body"><div>{orderProducts.map((product) => <img key={product.id} src={productImage(product)} alt={product.name} />)}<span>{orderProducts.length} ürün</span></div><a href={`#/hesabim/siparisler/${order.id}`}>Siparişi detaylandır <CaretRight /></a></div></article>;
}

function HelpPage({ mode = "help" }) {
  const [submitted, setSubmitted] = useState(false);
  const [helpQuery, setHelpQuery] = useState("");
  const helpNeedle = helpQuery.trim().toLocaleLowerCase("tr-TR");
  const visibleTopics = HELP_TOPICS.filter(([, title, copy]) => `${title} ${copy}`.toLocaleLowerCase("tr-TR").includes(helpNeedle));
  const visibleFaqs = HELP_FAQS.filter((question) => question.toLocaleLowerCase("tr-TR").includes(helpNeedle));
  if (mode === "tracking") return <TrackingPage />;
  if (mode === "contact") return <main id="main-content" className="page help-page"><div className="shell"><Breadcrumbs /><div className="help-hero"><EnvelopeSimple /><span className="section-kicker">Nova destek</span><h1>Bize ulaş</h1><p>Sorunu kısa ve açık biçimde yaz; bu prototip mesajı yalnızca yerel başarı durumuna taşır.</p></div>{submitted ? <div className="form-success" role="status" aria-live="polite"><CheckCircle /><h2>Mesajın hazırlandı</h2><p>Gerçek bir gönderim yapılmadı. Demo destek akışı başarıyla tamamlandı.</p><button className="primary-button" type="button" onClick={() => setSubmitted(false)}>Yeni mesaj</button></div> : <form className="contact-form" onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}><label>Ad soyad<input required defaultValue="Ahmet Yılmaz" /></label><label>E-posta<input required type="email" defaultValue="ahmet@example.com" /></label><label>Konu<select><option>Sipariş hakkında</option><option>Ürün hakkında</option><option>İade ve değişim</option></select></label><label>Mesaj<textarea required rows="5" placeholder="Nasıl yardımcı olabiliriz?" /></label><button className="primary-button" type="submit">Mesajı hazırla</button></form>}</div></main>;
  return <main id="main-content" className="page help-page"><div className="shell"><Breadcrumbs /><div className="help-hero"><Question /><span className="section-kicker">Yardım merkezi</span><h1>Nasıl yardımcı olabiliriz?</h1><p>Sipariş, teslimat, iade ve ödeme konularında hızlı yanıtları keşfet.</p><form role="search" onSubmit={(event) => event.preventDefault()}><MagnifyingGlass /><input aria-label="Yardım konularında ara" placeholder="Bir konu ara" value={helpQuery} onChange={(event) => setHelpQuery(event.target.value)} /><button type="submit">Ara</button></form></div><div className="help-grid" aria-live="polite">{visibleTopics.map(([Icon,title,copy]) => <a href={title === "Siparişler" ? "#/siparis-takibi" : "#/yardim"} key={title}><Icon /><strong>{title}</strong><span>{copy}</span><CaretRight /></a>)}</div><section className="faq-list"><h2>Sık sorulan sorular</h2>{visibleFaqs.length ? visibleFaqs.map((question) => <details key={question}><summary>{question}<CaretDown /></summary><p>{question.startsWith("Siparişimi") ? "Sipariş numaran ve e-posta adresinle Sipariş Takibi ekranından güncel durumu görebilirsin." : "NovaStore Commerce Pro prototipinde ilgili adımlar açık ve anlaşılır durumlarla gösterilir."}</p></details>) : <p role="status">Bu aramayla eşleşen yardım konusu bulunamadı.</p>}</section></div></main>;
}

function TrackingPage() {
  const [result, setResult] = useState(false);
  return <main id="main-content" className="page help-page"><div className="shell"><Breadcrumbs /><div className="help-hero compact"><Truck /><span className="section-kicker">Teslimat</span><h1>Siparişini takip et</h1><p>Sipariş numaran ve e-posta adresinle güncel teslimat adımlarını görüntüle.</p></div><form className="tracking-form" onSubmit={(event) => { event.preventDefault(); setResult(true); }}><label>Sipariş numarası<input required defaultValue="NS-2026-00702" /></label><label>E-posta<input required type="email" defaultValue="ahmet@example.com" /></label><button className="primary-button" type="submit">Siparişi bul</button></form>{result && <div className="tracking-result" role="status" aria-live="polite"><div><span className="status-pill is-info">Kargoya verildi</span><h2>NS-2026-00702</h2><p>Tahmini teslimat: 13 Temmuz 2026</p></div><div className="order-timeline">{["Sipariş alındı","Hazırlandı","Kargoya verildi","Yolda","Teslim"].map((label,index) => <div key={label} className={index <= 2 ? "is-active" : ""}><span>{index <= 2 ? <Check /> : index + 1}</span><strong>{label}</strong></div>)}</div></div>}</div></main>;
}

function MobileBottomNav({ route, cartCount, favoriteCount }) {
  if (["product", "checkout", "order-success"].includes(route.type)) return null;
  const items = [[House,"Ana Sayfa","#/","home"],[GridFour,"Kategoriler","#/kategori/elektronik","category"],[Heart,"Favoriler","#/favoriler","favorites"],[User,"Hesabım","#/hesabim","account"],[ShoppingCart,"Sepet","#/sepet","cart-page"]];
  return <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">{items.map(([Icon,label,href,type]) => <a key={type} className={route.type === type ? "is-active" : ""} aria-current={route.type === type ? "page" : undefined} href={href}><span><Icon />{type === "favorites" && favoriteCount > 0 && <b>{favoriteCount}</b>}{type === "cart-page" && cartCount > 0 && <b>{cartCount}</b>}</span><small>{label}</small></a>)}</nav>;
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
        <div className="cart-drawer__body">{items.length ? items.map(({ product, quantity }) => <article className="cart-line" key={product.id}><img src={productImage(product)} alt="" /><div><strong>{product.name}</strong><span>{product.color || product.colors?.[0]} · {quantity} adet</span><b>{money.format(product.price * quantity)}</b></div><button type="button" onClick={() => onRemove(product.id)} aria-label={`${product.name} ürününü sepetten çıkar`}><Trash /></button></article>) : <div className="cart-empty"><ShoppingBag /><h3>Sepetin henüz boş</h3><p>İhtiyacına uygun ürünleri kategorilerden keşfedebilirsin.</p><button className="primary-button" type="button" onClick={() => { closeDrawer(); navigate("/kategori/elektronik"); }}>Alışverişe başla</button></div>}</div>
        {items.length > 0 && <div className="cart-drawer__footer"><div><span>Toplam</span><strong>{money.format(total)}</strong></div><button className="primary-button" type="button" onClick={() => { closeDrawer(); navigate("/sepet"); }}>Sepete git <CaretRight /></button><small><ShieldCheck /> Ödeme bilgileriniz güvenle korunur</small></div>}
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
  return <footer className="site-footer"><div className="shell footer-grid"><div><Logo /><p>Doğru ürünü bulmanın daha kolay yolu.</p></div><div><strong>NovaStore</strong><a href="#/">Hakkımızda</a><a href="#/hesabim">Hesabım</a><a href="#/iletisim">İletişim</a></div><div><strong>Destek</strong><a href="#/siparis-takibi">Sipariş takibi</a><a href="#/yardim">İade & değişim</a><a href="#/yardim">Yardım merkezi</a></div><div><strong>Güvenli alışveriş</strong><p>3D Secure ödeme, kolay iade ve NovaStore desteği.</p></div></div><div className="shell footer-bottom"><span>© 2026 NovaStore. Etkileşimli tema prototipi.</span><span>Gizlilik · Kullanım Koşulları · Çerezler</span></div></footer>;
}

export function App() {
  const { route, loading } = useRoute();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [appliedCoupon, setAppliedCoupon] = useState("");
  const [checkoutProgress, setCheckoutProgress] = useState("delivery");
  const [checkoutConsent, setCheckoutConsent] = useState(true);
  const [favorites, setFavorites] = useState(new Set(["NS-1001", "NS-1004", "NS-1006", "NS-1007"]));
  const [lastOrderTotal, setLastOrderTotal] = useState(0);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const mobileMenuTriggerRef = useRef(null);
  const cartTriggerRef = useRef(null);

  function notify(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }

  function toggleFavorite(productId) {
    setFavorites((current) => {
      const next = new Set(current);
      const product = products.find((item) => item.id === productId);
      if (next.has(productId)) { next.delete(productId); notify(`${product.name} favorilerden çıkarıldı`); }
      else { next.add(productId); notify(`${product.name} favorilere eklendi`); }
      return next;
    });
  }

  function addToCart(productId, quantity = 1) {
    const product = products.find((item) => item.id === productId);
    if (!product || product.stock <= 0) { notify("Bu ürün şu anda stokta değil"); return; }
    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (existing) return current.map((item) => item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item);
      return [...current, { productId, quantity }];
    });
    setLastOrderTotal(0);
    setCheckoutProgress("delivery");
    setCheckoutConsent(true);
    notify(`${product.name} sepete eklendi`);
  }

  function updateCartQuantity(productId, quantity) {
    setCart((current) => quantity <= 0 ? current.filter((item) => item.productId !== productId) : current.map((item) => item.productId === productId ? { ...item, quantity: Math.min(9, quantity) } : item));
  }

  function completeOrder(total) {
    if (!checkoutConsent) return;
    setLastOrderTotal(total);
    setCart([]);
    setAppliedCoupon("");
    navigate("/siparis/tamamlandi");
  }

  function changeCheckoutStep(nextStep) {
    if (nextStep === "review" && !checkoutConsent) return;
    const nextIndex = CHECKOUT_STEPS.indexOf(nextStep);
    const progressIndex = CHECKOUT_STEPS.indexOf(checkoutProgress);
    if (nextIndex > progressIndex) setCheckoutProgress(nextStep);
    navigate(CHECKOUT_PATHS[nextStep] || CHECKOUT_PATHS.delivery);
  }

  function changeCheckoutConsent(checked) {
    setCheckoutConsent(checked);
    if (!checked) setCheckoutProgress("payment");
  }

  const cartItems = cart.map((item) => ({ ...item, product: products.find((product) => product.id === item.productId) })).filter((item) => item.product);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    if (route.type !== "checkout") return;
    const requested = CHECKOUT_STEPS.indexOf(route.step);
    const allowed = CHECKOUT_STEPS.indexOf(checkoutProgress);
    if (requested > allowed || (route.step === "review" && !checkoutConsent)) navigate(CHECKOUT_PATHS[route.step === "review" && !checkoutConsent ? "payment" : checkoutProgress]);
  }, [route.type, route.step, checkoutProgress, checkoutConsent]);

  let content;
  if (loading) content = <LoadingPage />;
  else if (route.type === "home") content = <HomePage favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "product") {
    const product = getVisibleProducts().find((item) => item.slug === route.slug);
    content = product ? <ProductDetail product={product} favorite={favorites.has(product.id)} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} /> : <NotFound />;
  } else if (route.type === "category") {
    const category = resolveCategoryPath(route.path);
    if (!category || category.active === false || category.archived === true || category.customerVisible === false || category.descendantVisibleProductCount === 0) content = <NotFound />;
    else content = <ProductListing category={category} title={category.name} initialItems={getProductsForCategory(category.id)} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  } else if (route.type === "search") {
    const needle = route.term.toLocaleLowerCase("tr-TR");
    const results = getVisibleProducts().filter((product) => `${product.name} ${product.brand} ${product.color || ""} ${product.storage || ""} ${product.description || ""} ${(product.features || []).join(" ")} ${getBreadcrumb(product.categoryId).map((item) => item.name).join(" ")}`.toLocaleLowerCase("tr-TR").includes(needle));
    content = <ProductListing title={`“${route.term}” arama sonuçları`} initialItems={results} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  } else if (route.type === "deals") {
    const deals = getVisibleProducts().filter((product) => product.oldPrice && product.oldPrice > product.price);
    content = <ProductListing title="Günün fırsatları" initialItems={deals} favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  } else if (route.type === "favorites") content = <FavoritesPage favorites={favorites} onFavorite={toggleFavorite} onAdd={addToCart} />;
  else if (route.type === "cart-page") content = <CartPage items={cartItems} onQuantity={updateCartQuantity} onRemove={(id) => setCart((current) => current.filter((item) => item.productId !== id))} appliedCoupon={appliedCoupon} onApplyCoupon={setAppliedCoupon} />;
  else if (route.type === "checkout") {
    const requestedIndex = CHECKOUT_STEPS.indexOf(route.step);
    const allowedIndex = CHECKOUT_STEPS.indexOf(checkoutProgress);
    const safeStep = route.step === "review" && !checkoutConsent ? "payment" : requestedIndex <= allowedIndex && requestedIndex >= 0 ? route.step : checkoutProgress;
    content = <CheckoutPage step={safeStep} items={cartItems} appliedCoupon={appliedCoupon} consent={checkoutConsent} onConsentChange={changeCheckoutConsent} onStepChange={changeCheckoutStep} onComplete={completeOrder} />;
  }
  else if (route.type === "order-success") content = lastOrderTotal > 0 ? <OrderSuccessPage total={lastOrderTotal} /> : <NotFound />;
  else if (route.type === "account") content = <AccountPage section={route.section} orderId={route.orderId} favoriteCount={favorites.size} />;
  else if (route.type === "help") content = <HelpPage />;
  else if (route.type === "tracking") content = <HelpPage mode="tracking" />;
  else if (route.type === "contact") content = <HelpPage mode="contact" />;
  else content = <NotFound />;

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => { event.preventDefault(); focusMainContent({ preventScroll: false }); }}>Ana içeriğe geç</a>
      <Header cartCount={cartCount} favoriteCount={favorites.size} onCartOpen={() => setCartOpen(true)} onMobileOpen={() => setMobileMenuOpen(true)} cartTriggerRef={cartTriggerRef} mobileMenuTriggerRef={mobileMenuTriggerRef} />
      {content}
      <Footer />
      <MobileCategoryDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} returnFocusRef={mobileMenuTriggerRef} />
      <CartDrawer open={cartOpen} items={cartItems} onClose={() => setCartOpen(false)} onRemove={(id) => setCart((current) => current.filter((item) => item.productId !== id))} returnFocusRef={cartTriggerRef} />
      <MobileBottomNav route={route} cartCount={cartCount} favoriteCount={favorites.size} />
      <div className={cx("toast", toast && "is-visible")} role="status" aria-live="polite"><CheckCircle weight="fill" /><span>{toast}</span></div>
    </>
  );
}

export {
  BenefitStrip,
  Breadcrumbs,
  CartDrawer,
  CategoryLanding,
  FavoritesPage,
  Footer,
  Header,
  HomePage,
  LoadingPage,
  Logo,
  MobileBottomNav,
  MobileCategoryDrawer,
  NotFound,
  ProductDetail,
  ProductListing,
  TrustBar,
};
