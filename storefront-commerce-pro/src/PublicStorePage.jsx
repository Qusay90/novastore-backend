import { useCursorPage } from "./integration/useCursorPage.js";
import { PageContinuation } from "./integration/PageContinuation.jsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  CaretRight,
  Package,
  ShieldCheck,
  ShoppingBagOpen,
  Star,
  Storefront,
  Truck,
  UserMinus,
  UserPlus,
  Users,
  WarningCircle,
} from "./CustomerIcon.jsx";
import { CustomerProductCard } from "./CustomerProductCard.jsx";

const integer = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const isAuthenticatedSession = (session) => (
  session?.status === "authenticated" || session?.status === "unverified"
);

function StoreState({ phase, onRetry }) {
  if (phase === "loading") {
    return (
      <main id="main-content" className="page public-store-page">
        <div className="public-store-loading" role="status" aria-live="polite" aria-busy="true">
          <div className="shell">
            <span>Mağaza hazırlanıyor…</span>
            <div className="public-store-loading__hero"><i /><div><b /><b /><b /></div></div>
            <div className="skeleton-grid">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</div>
          </div>
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

function FollowAction({ slug, previewMode, authenticated, followState, onToggle, onRetry }) {
  if (previewMode) {
    return <button className="public-store-follow-button is-preview" type="button" disabled><ShieldCheck /> Önizlemede takip kapalı</button>;
  }
  if (!authenticated) {
    const returnPath = encodeURIComponent(`/magaza/${slug}`);
    return (
      <div className="public-store-follow-gate">
        <a className="public-store-follow-button" href={`#/giris?return=${returnPath}`}><UserPlus /> Mağazayı takip et</a>
        <small>Takip etmek için giriş yap</small>
      </div>
    );
  }
  if (followState.phase === "error") {
    return (
      <div className="public-store-follow-gate" role="alert">
        <button className="public-store-follow-button is-error" type="button" onClick={onRetry}><ArrowsClockwise /> Takip durumunu yenile</button>
        <small>Takip durumu alınamadı</small>
      </div>
    );
  }
  const following = followState.following === true;
  const busy = followState.phase === "loading" || followState.phase === "saving";
  return (
    <button
      className={`public-store-follow-button${following ? " is-following" : ""}`}
      type="button"
      disabled={busy}
      aria-pressed={following}
      onClick={onToggle}
    >
      {following ? <UserMinus /> : <UserPlus />}
      {busy ? "Takip durumu yükleniyor…" : following ? "Takibi bırak" : "Mağazayı takip et"}
    </button>
  );
}

export function PublicStorePage({ slug, previewMode = false, loadStore, followStore, session, favorites, onFavorite, onAdd }) {
  const [followAttempt, setFollowAttempt] = useState(0);
  const load = useCallback(async (options) => {
    const detail = await loadStore(slug, options);
    return { ...detail, items: detail.products, pagination: detail.pagination || { limit: 20, hasMore: false, nextCursor: null } };
  }, [loadStore, slug]);
  const page = useCursorPage(load, slug);
  const state = { phase: page.data ? "ready" : page.phase === "error" ? page.error?.status === 404 ? "missing" : "error" : "loading", detail: page.data };
  const [followState, setFollowState] = useState({ phase: "idle", following: false, followerCount: null });
  const authenticated = isAuthenticatedSession(session);

  useEffect(() => {
    if (previewMode || !authenticated || state.phase !== "ready") {
      setFollowState({ phase: "idle", following: false, followerCount: null });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setFollowState((current) => ({ ...current, phase: "loading" }));
    followStore.load(slug, { signal: controller.signal })
      .then((result) => {
        if (active) setFollowState({ phase: "ready", following: result.following, followerCount: result.followerCount });
      })
      .catch((error) => {
        if (!active || error?.code === "CUSTOMER_ABORTED") return;
        setFollowState((current) => ({ ...current, phase: "error" }));
      });
    return () => { active = false; controller.abort("public-store-follow-change"); };
  }, [authenticated, followAttempt, followStore, previewMode, slug, state.phase]);

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

  const products = page.items;
  if (state.phase !== "ready") return <StoreState phase={state.phase} onRetry={page.refresh} />;
  const store = state.detail.store;
  const followerCount = followState.followerCount ?? store.followerCount;
  const toggleFollow = async () => {
    if (followState.phase !== "ready") return;
    const previous = followState;
    setFollowState({ ...followState, phase: "saving" });
    try {
      const result = await followStore.set(slug, !followState.following);
      setFollowState({ phase: "ready", following: result.following, followerCount: result.followerCount });
    } catch {
      setFollowState({ ...previous, phase: "error" });
    }
  };
  const metrics = [
    { key: "followers", icon: Users, value: integer.format(followerCount), label: "takipçi" },
    { key: "sold", icon: ShoppingBagOpen, value: integer.format(store.totalUnitsSold), label: "ürün satıldı" },
    { key: "products", icon: Package, value: integer.format(store.productCount), label: "yayında ürün" },
    store.reviewCount > 0
      ? { key: "rating", icon: Star, value: store.rating.toFixed(1), label: `${integer.format(store.reviewCount)} değerlendirme` }
      : { key: "rating", icon: Star, value: "Yeni", label: "henüz değerlendirme yok" },
  ];

  return (
    <main id="main-content" className="page public-store-page" data-preview-mode={previewMode ? "true" : "false"}>
      {previewMode && <div className="public-store-preview-banner" role="status"><ShieldCheck weight="fill" /><span><strong>Müşteri görünümü · Salt okunur</strong><small>Bu önizleme takip, sepet, favori, sipariş, yorum, soru veya analiz işlemi oluşturmaz.</small></span></div>}
      <section className="public-store-hero" aria-labelledby="public-store-title">
        <div className="shell public-store-hero__content">
          <div className="public-store-emblem" aria-hidden="true"><Storefront weight="duotone" /></div>
          <div className="public-store-hero__copy">
            <span className="section-kicker">NovaStore doğrulanmış mağaza vitrini</span>
            <div className="public-store-title-row">
              <h1 id="public-store-title">{store.name}</h1>
              <span className="public-store-status"><i /> Açık</span>
            </div>
            <p>{store.description || "Bu mağazanın seçkisini, teslimat ve iade bilgilerini tek vitrinde inceleyebilirsin."}</p>
            <FollowAction
              slug={slug}
              previewMode={previewMode}
              authenticated={authenticated}
              followState={followState}
              onToggle={toggleFollow}
              onRetry={() => setFollowAttempt((value) => value + 1)}
            />
          </div>
          <ul className="public-store-metrics" aria-label="Mağaza özeti">
            {metrics.map(({ key, icon: Icon, value, label }) => (
              <li key={key}><Icon weight={key === "rating" && store.reviewCount > 0 ? "fill" : "duotone"} aria-hidden="true" /><span><strong>{value}</strong><small>{label}</small></span></li>
            ))}
          </ul>
        </div>
      </section>
      <nav className="shell public-store-breadcrumbs" aria-label="İçerik yolu"><a href={previewMode ? undefined : "#/"} aria-disabled={previewMode || undefined}>Ana Sayfa</a><CaretRight /><span aria-current="page">{store.name}</span></nav>
      <section className="section shell public-store-products" aria-labelledby="public-store-products-title">
        <div className="section-heading public-store-section-heading">
          <div><span className="section-kicker">Mağaza vitrini</span><h2 id="public-store-products-title">{store.name} ürünleri</h2><p>Yalnız yayında ve müşteriye açık ürünler gösterilir.</p></div>
          <span className="result-pill">{products.length} / {store.productCount} ürün yüklendi</span>
        </div>
        {products.length ? (
          <div className="product-grid public-store-product-grid">
            {products.map((product) => <CustomerProductCard key={product.id} product={product} brand={store.name} previewMode={previewMode} favorite={favorites.has(product.id)} onFavorite={onFavorite} onAdd={onAdd} className="public-store-product-card" />)}
          </div>
        ) : (
          <div className="empty-state public-store-empty" role="status">
            <span className="public-store-empty__icon"><Storefront weight="duotone" /></span>
            <span className="public-store-empty__status"><i /> Mağaza açık</span>
            <h3>Vitrin yeni ürünler için hazırlanıyor</h3>
            <p>Bu mağazada şu anda yayında ürün yok. Mağaza bilgileri ve alışveriş politikaları aşağıda güncel biçimde yer alıyor.</p>
          </div>
        )}
        <PageContinuation page={page} />
      </section>
      <section className="section section--soft public-store-information" aria-labelledby="public-store-information-title">
        <div className="shell">
          <div className="section-heading public-store-section-heading"><div><span className="section-kicker">Mağaza bilgileri</span><h2 id="public-store-information-title">Alışveriş öncesi bilmen gerekenler</h2><p>Koşullar sipariş adımında ürün ve teslimat adresine göre yeniden doğrulanır.</p></div></div>
          <div className="public-store-policy-grid">
            <article><Truck weight="duotone" /><div><span>TESLİMAT</span><h3>Kargo ve teslimat</h3><p>{store.shippingSummary || "Teslimat ayrıntıları ürün ve ödeme adımlarında gösterilir."}</p></div></article>
            <article><ArrowsClockwise weight="duotone" /><div><span>İADE GÜVENCESİ</span><h3>İade politikası</h3><p>{store.returnSummary || "İade koşulları sipariş durumuna göre NovaStore destek akışında doğrulanır."}</p></div></article>
          </div>
        </div>
      </section>
    </main>
  );
}

export const publicStorePageTestUtils = Object.freeze({ isAuthenticatedSession });
