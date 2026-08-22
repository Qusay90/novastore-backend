import { useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CaretRight,
  Heart,
  Package,
  ShieldCheck,
  ShoppingCart,
  Star,
  Storefront,
  Truck,
  WarningCircle,
} from "@phosphor-icons/react";

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const PRODUCT_PLACEHOLDER = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600' viewBox='0 0 800 600'%3E%3Crect width='800' height='600' fill='%23f3f6f8'/%3E%3Cpath d='M300 250h200v140H300z' fill='none' stroke='%2393a4b3' stroke-width='12'/%3E%3Ccircle cx='355' cy='300' r='24' fill='%2393a4b3'/%3E%3Cpath d='m320 365 65-65 55 55 35-35 45 45' fill='none' stroke='%2393a4b3' stroke-width='12' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ctext x='400' y='455' text-anchor='middle' font-family='Arial,sans-serif' font-size='28' fill='%23596b79'%3EG%C3%B6rsel haz%C4%B1rlan%C4%B1yor%3C/text%3E%3C/svg%3E";

const productImage = (product) => product?.imageUrl || PRODUCT_PLACEHOLDER;

function StoreProductCard({ product, previewMode, favorite, onFavorite, onAdd }) {
  const soldOut = product.stock <= 0;
  const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
  const media = <img src={productImage(product)} alt={product.name} />;
  const name = previewMode
    ? <span>{product.name}</span>
    : <a href={`#/urun/${product.slug}`}>{product.name}</a>;
  return (
    <article className={`product-card public-store-product-card${soldOut ? " is-sold-out" : ""}`}>
      <div className="product-card__media">
        {(soldOut || discount > 0) && <span className={`product-badge${soldOut ? " is-muted" : ""}`}>{soldOut ? "Tükendi" : `%${discount} İndirim`}</span>}
        {!previewMode && (
          <button className={`favorite-button${favorite ? " is-active" : ""}`} type="button" onClick={() => onFavorite(product.id)} aria-pressed={favorite} aria-label={favorite ? `${product.name} ürününü favorilerden çıkar` : `${product.name} ürününü favorilere ekle`}>
            <Heart weight={favorite ? "fill" : "regular"} />
          </button>
        )}
        {previewMode ? <div className="public-store-product-media">{media}</div> : <a href={`#/urun/${product.slug}`} aria-label={`${product.name} detayını aç`}>{media}</a>}
      </div>
      <div className="product-card__body">
        <span className="product-brand">NovaStore mağazası</span>
        <h3>{name}</h3>
        {product.reviews > 0 ? (
          <div className="product-rating" role="img" aria-label={`${product.rating} puan, ${product.reviews} değerlendirme`}><Star weight="fill" /><strong>{product.rating.toFixed(1)}</strong><span>({product.reviews})</span></div>
        ) : (
          <div className="product-rating public-store-no-rating" role="img" aria-label="Henüz değerlendirme yok"><Star /><span>Henüz değerlendirme yok</span></div>
        )}
        <div className="delivery-line">{soldOut ? <span className="sold-out-copy">Stok bekleniyor</span> : <><Package /> Satışa hazır</>}</div>
        <div className="product-price-row">
          <div className="price-block">
            {product.oldPrice && <span><del>{money.format(product.oldPrice)}</del>{discount > 0 && <b>%{discount}</b>}</span>}
            <strong>{money.format(product.price)}</strong>
          </div>
        </div>
        {previewMode ? (
          <div className="public-store-readonly-product"><ShieldCheck /> Önizlemede işlem yapılamaz</div>
        ) : (
          <div className="product-card__actions public-store-product-actions">
            <a className="compare-button" href={`#/urun/${product.slug}`} aria-label={`${product.name} ayrıntılarını aç`}><CaretRight /></a>
            <button className="card-add-button" type="button" disabled={soldOut} onClick={() => onAdd(product.id)}>{soldOut ? "Tükendi" : <><ShoppingCart /> Sepete ekle</>}</button>
          </div>
        )}
      </div>
    </article>
  );
}

function StoreState({ phase, onRetry }) {
  if (phase === "loading") {
    return (
      <main id="main-content" className="page public-store-page">
        <div className="shell public-store-loading" role="status" aria-live="polite" aria-busy="true">
          <span>Mağaza hazırlanıyor…</span>
          <div className="skeleton-heading" />
          <div className="skeleton-grid">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
        </div>
      </main>
    );
  }
  return (
    <main id="main-content" className="page public-store-page">
      <div className="shell public-store-error" role="alert">
        <WarningCircle />
        <span className="section-kicker">Mağaza görünümü</span>
        <h1>{phase === "missing" ? "Bu mağaza şu anda görüntülenemiyor" : "Mağaza verisi alınamadı"}</h1>
        <p>{phase === "missing" ? "Mağaza bulunamadı, yayında değil veya müşteri görünümüne kapalı." : "Bağlantını kontrol edip yeniden deneyebilirsin."}</p>
        {phase !== "missing" && <button data-preview-readonly-safe="true" className="primary-button" type="button" onClick={onRetry}>Yeniden dene</button>}
      </div>
    </main>
  );
}

export function PublicStorePage({ slug, previewMode = false, loadStore, favorites, onFavorite, onAdd }) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ phase: "loading", detail: null });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState({ phase: "loading", detail: null });
    loadStore(slug, { signal: controller.signal })
      .then((detail) => { if (active) setState({ phase: "ready", detail }); })
      .catch((error) => {
        if (!active || error?.code === "STOREFRONT_ABORTED") return;
        setState({ phase: error?.status === 404 ? "missing" : "error", detail: null });
      });
    return () => { active = false; controller.abort("public-store-route-change"); };
  }, [attempt, loadStore, slug]);

  useEffect(() => {
    if (!previewMode) return undefined;
    document.body.classList.add("is-public-store-preview");
    const chromeControls = [...document.querySelectorAll(".site-header a, .site-header button, .site-header input, .site-footer a, .mobile-bottom-nav a")];
    const previous = chromeControls.map((node) => ({
      node,
      ariaDisabled: node.getAttribute("aria-disabled"),
      tabIndex: node.getAttribute("tabindex"),
    }));
    chromeControls.forEach((node) => {
      node.setAttribute("aria-disabled", "true");
      node.setAttribute("tabindex", "-1");
    });
    const blockCustomerChrome = (event) => {
      if (event.target?.closest?.("#main-content")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("click", blockCustomerChrome, true);
    document.addEventListener("submit", blockCustomerChrome, true);
    return () => {
      document.body.classList.remove("is-public-store-preview");
      document.removeEventListener("click", blockCustomerChrome, true);
      document.removeEventListener("submit", blockCustomerChrome, true);
      previous.forEach(({ node, ariaDisabled, tabIndex }) => {
        if (ariaDisabled === null) node.removeAttribute("aria-disabled"); else node.setAttribute("aria-disabled", ariaDisabled);
        if (tabIndex === null) node.removeAttribute("tabindex"); else node.setAttribute("tabindex", tabIndex);
      });
    };
  }, [previewMode, state.phase]);

  const products = useMemo(() => state.detail?.products || [], [state.detail]);
  if (state.phase !== "ready") return <StoreState phase={state.phase} onRetry={() => setAttempt((value) => value + 1)} />;
  const store = state.detail.store;
  return (
    <main id="main-content" className="page public-store-page" data-preview-mode={previewMode ? "true" : "false"}>
      {previewMode && <div className="public-store-preview-banner" role="status"><ShieldCheck weight="fill" /><span><strong>Müşteri görünümü · Salt okunur</strong><small>Bu önizleme sepet, favori, sipariş, yorum, soru veya analiz işlemi oluşturmaz.</small></span></div>}
      <section className="public-store-hero">
        <div className="shell public-store-hero__content">
          <div className="public-store-emblem" aria-hidden="true"><Storefront weight="duotone" /></div>
          <div>
            <span className="section-kicker">NovaStore mağazası</span>
            <h1>{store.name}</h1>
            {store.description && <p>{store.description}</p>}
            <span className="public-store-status"><i /> Açık</span>
          </div>
        </div>
      </section>
      <div className="shell public-store-breadcrumbs"><a href={previewMode ? undefined : "#/"} aria-disabled={previewMode || undefined}>Ana Sayfa</a><CaretRight /><span aria-current="page">{store.name}</span></div>
      <section className="section shell public-store-products" aria-labelledby="public-store-products-title">
        <div className="section-heading">
          <div><span className="section-kicker">Mağaza vitrini</span><h2 id="public-store-products-title">{store.name} ürünleri</h2></div>
          <span className="result-pill">{products.length} ürün</span>
        </div>
        {products.length ? (
          <div className="product-grid">
            {products.map((product) => <StoreProductCard key={product.id} product={product} previewMode={previewMode} favorite={favorites.has(product.id)} onFavorite={onFavorite} onAdd={onAdd} />)}
          </div>
        ) : (
          <div className="empty-state public-store-empty" role="status"><Storefront /><h3>Bu mağazada henüz yayında ürün yok</h3><p>Yeni ürünler yayınlandığında burada görünecek.</p></div>
        )}
      </section>
      <section className="section section--soft public-store-information" aria-labelledby="public-store-information-title">
        <div className="shell">
          <div className="section-heading"><div><span className="section-kicker">Mağaza bilgileri</span><h2 id="public-store-information-title">Alışveriş öncesi bilmen gerekenler</h2></div></div>
          <div className="public-store-policy-grid">
            <article><Truck weight="duotone" /><div><h3>Teslimat</h3><p>{store.shippingSummary || "Teslimat ayrıntıları ürün ve ödeme adımlarında gösterilir."}</p></div></article>
            <article><ArrowsClockwise weight="duotone" /><div><h3>İade politikası</h3><p>{store.returnSummary || "İade koşulları sipariş durumuna göre NovaStore destek akışında doğrulanır."}</p></div></article>
          </div>
        </div>
      </section>
    </main>
  );
}

export const publicStorePageTestUtils = Object.freeze({ productImage });
