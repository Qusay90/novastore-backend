import { useContext, useEffect, useMemo, useRef, useState } from "react";
import productCardFraming from "../../shared/productCardFraming.js";
import { RuntimeComparisonContext } from "./integration/RuntimeComparisonContext.jsx";
import {
  ArrowsLeftRight,
  Check,
  ImageSquare,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from "./CustomerIcon.jsx";
import { productCardMediaIndex, resolveCustomerCardMedia } from "./customerProductCardModel.js";
import { CustomerFavoriteButton } from "./CustomerFavoriteButton.jsx";

const { CARD_VIEWPORT_ASPECT_RATIO, cardFramingPresentation } = productCardFraming;
export const CUSTOMER_CARD_AUTOPLAY_DWELL_MS = 500;
export const CUSTOMER_CARD_AUTOPLAY_INTERVAL_MS = 1650;

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const isFineHover = () => (
  typeof window !== "undefined"
  && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true
);

export function CustomerProductCard({
  product,
  brand = product?.brand || "NovaStore",
  favorite = false,
  onFavorite,
  onAdd,
  mediaFallback = null,
  previewMode = false,
  className = "",
}) {
  const comparison = useContext(RuntimeComparisonContext);
  const [activeMedia, setActiveMedia] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [galleryPrimed, setGalleryPrimed] = useState(false);
  const [cartPhase, setCartPhase] = useState("idle");
  const [compareMotion, setCompareMotion] = useState(false);
  const dwellTimer = useRef(null);
  const cycleTimer = useRef(null);
  const activeMediaRef = useRef(0);
  const cartTimer = useRef(null);
  const compareTimer = useRef(null);
  const media = useMemo(
    () => resolveCustomerCardMedia(product, mediaFallback),
    [mediaFallback, product],
  );
  const soldOut = Number(product?.stock) <= 0;
  const oldPrice = Number(product?.oldPrice);
  const currentPrice = Math.max(0, Number(product?.price) || 0);
  const discount = oldPrice > currentPrice
    ? Math.round((1 - currentPrice / oldPrice) * 100)
    : 0;
  const compared = comparison.ids.has(product.id);
  const detailHref = `#/urun/${product.slug}`;

  useEffect(() => {
    activeMediaRef.current = 0;
    setActiveMedia(0);
    setPreviewing(false);
    setGalleryPrimed(false);
    setCartPhase("idle");
  }, [product?.id]);

  useEffect(() => {
    return () => {
      window.clearTimeout(dwellTimer.current);
      window.clearInterval(cycleTimer.current);
      window.clearTimeout(cartTimer.current);
      window.clearTimeout(compareTimer.current);
    };
  }, []);

  const selectActiveMedia = (nextIndex) => {
    if (activeMediaRef.current === nextIndex) return false;
    activeMediaRef.current = nextIndex;
    setActiveMedia(nextIndex);
    return true;
  };

  const scheduleAutoplay = () => {
    window.clearTimeout(dwellTimer.current);
    window.clearInterval(cycleTimer.current);
    dwellTimer.current = window.setTimeout(() => {
      setGalleryPrimed(true);
      selectActiveMedia((activeMediaRef.current + 1) % media.length);
      cycleTimer.current = window.setInterval(() => {
        selectActiveMedia((activeMediaRef.current + 1) % media.length);
      }, CUSTOMER_CARD_AUTOPLAY_INTERVAL_MS);
    }, CUSTOMER_CARD_AUTOPLAY_DWELL_MS);
  };

  const handlePointerEnter = (event) => {
    if (!isFineHover() || media.length <= 1 || event.pointerType === "touch") return;
    setPreviewing(true);
    scheduleAutoplay();
  };

  const handlePointerMove = (event) => {
    if (!previewing || !isFineHover() || media.length <= 1 || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const nextIndex = productCardMediaIndex(event.clientX, bounds.left, bounds.width, media.length);
    if (!selectActiveMedia(nextIndex)) return;
    setGalleryPrimed(true);
    scheduleAutoplay();
  };

  const resetMedia = () => {
    window.clearTimeout(dwellTimer.current);
    window.clearInterval(cycleTimer.current);
    setPreviewing(false);
    setGalleryPrimed(false);
    activeMediaRef.current = 0;
    setActiveMedia(0);
  };

  const playTransient = (timer, setter, value = true, duration = 520) => {
    window.clearTimeout(timer.current);
    setter(value);
    timer.current = window.setTimeout(() => setter(value === true ? false : "idle"), duration);
  };

  const handleCompare = async () => {
    try {
      const result = await comparison.toggle(product.id);
      if (result !== false) playTransient(compareTimer, setCompareMotion, true, 360);
    } catch { /* Runtime owns the visible failure notice. */ }
  };

  const handleAdd = async () => {
    setCartPhase("pressed");
    const pressedAt = performance.now();
    try {
      const result = await onAdd?.(product.id);
      const remainingPress = Math.max(0, 140 - (performance.now() - pressedAt));
      if (remainingPress) await new Promise((resolve) => window.setTimeout(resolve, remainingPress));
      if (result === false) { setCartPhase("idle"); return; }
      playTransient(cartTimer, setCartPhase, "success", 760);
    } catch { setCartPhase("idle"); }
  };

  const mediaStage = (
    <span
      className="customer-card-media-stage"
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetMedia}
      data-active-media={activeMedia}
    >
      {media.length ? media.filter((item, index) => index === 0 || galleryPrimed || index === activeMedia).map((item) => {
        const index = media.indexOf(item);
        return (
          <img
            key={item.id}
            className={index === activeMedia ? "is-active" : ""}
            src={item.url}
            style={cardFramingPresentation(item.cardFraming)}
            alt={index === 0 ? product.name : ""}
            aria-hidden={index === 0 ? undefined : true}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        );
      }) : (
        <span className="customer-card-media-empty" role="img" aria-label={`${product.name} için ürün görseli bulunmuyor`}>
          <ImageSquare />
          <small>Ürün görseli hazırlanıyor</small>
        </span>
      )}
      {media.length > 1 && (
        <span className="customer-card-media-zones" aria-hidden="true">
          {media.map((item, index) => <i key={item.id} className={index === activeMedia ? "is-active" : ""} />)}
        </span>
      )}
    </span>
  );

  const rating = Math.min(5, Math.max(0, Number(product?.rating) || 0));
  const reviews = Math.max(0, Number(product?.reviews) || 0);
  const delivery = typeof product?.deliveryLabel === "string" && product.deliveryLabel.trim()
    ? product.deliveryLabel.trim()
    : null;

  return (
    <article className={`product-card customer-product-card${className ? ` ${className}` : ""}${soldOut ? " is-sold-out" : ""}${previewing ? " is-media-previewing" : ""}`}>
      <div className="product-card__media" style={{ aspectRatio: CARD_VIEWPORT_ASPECT_RATIO }}>
        {(soldOut || discount > 0 || product?.badge) && (
          <span className={`product-badge${soldOut ? " is-muted" : discount > 0 ? " is-discount" : ""}`}>
            {soldOut ? "Tükendi" : discount > 0 ? `%${discount} İndirim` : product.badge}
          </span>
        )}
        {!previewMode && typeof onFavorite === "function" && (
          <CustomerFavoriteButton productId={product.id} productName={product.name} favorite={favorite} onFavorite={onFavorite} />
        )}
        {previewMode ? <span className="customer-card-preview-media public-store-product-media">{mediaStage}</span> : <a href={detailHref} aria-label={`${product.name} detayını aç`}>{mediaStage}</a>}
      </div>
      <div className="product-card__body">
        <span className="product-brand">{brand}</span>
        <h3>{previewMode ? <span>{product.name}</span> : <a href={detailHref}>{product.name}</a>}</h3>
        {reviews > 0 ? (
          <div className="product-rating" role="img" aria-label={`${rating.toFixed(1)} puan, ${reviews} değerlendirme`}><Star weight="fill" /><strong>{rating.toFixed(1)}</strong><span>({reviews})</span></div>
        ) : (
          <div className="product-rating customer-card-no-rating" role="img" aria-label="Henüz değerlendirme yok"><Star /><span>Henüz değerlendirme yok</span></div>
        )}
        {delivery && <div className="delivery-line"><Truck /><span>{delivery}</span></div>}
        <div className="product-price-row">
          <div className="price-block">
            {oldPrice > currentPrice && <span><del>{money.format(oldPrice)}</del>{discount > 0 && <b>%{discount}</b>}</span>}
            <strong>{money.format(currentPrice)}</strong>
          </div>
        </div>
        {previewMode ? (
          <div className="public-store-readonly-product"><ShieldCheck /> Önizlemede işlem yapılamaz</div>
        ) : (
          <div className="product-card__actions">
            <button className={`compare-button${compared ? " is-active" : ""}${compareMotion ? " is-confirmed" : ""}`} type="button" aria-pressed={compared} disabled={!comparison.available} onClick={handleCompare} aria-label={compared ? `${product.name} ürününü karşılaştırmadan çıkar` : `${product.name} ürününü karşılaştır`}><ArrowsLeftRight /></button>
            <button className={`card-add-button is-${cartPhase}`} type="button" disabled={soldOut || typeof onAdd !== "function"} onClick={handleAdd}>{soldOut ? "Tükendi" : cartPhase === "success" ? <><Check /> Eklendi</> : <><ShoppingCart /> Sepete ekle</>}</button>
          </div>
        )}
      </div>
    </article>
  );
}
