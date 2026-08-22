import { useContext, useEffect, useMemo, useState } from "react";
import { RuntimeComparisonContext } from "./integration/RuntimeComparisonContext.jsx";
import {
  ArrowsLeftRight,
  Heart,
  ImageSquare,
  Package,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from "./CustomerIcon.jsx";
import { productCardMediaIndex, resolveCustomerCardImages } from "./customerProductCardModel.js";

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
  const images = useMemo(
    () => resolveCustomerCardImages(product, mediaFallback),
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
    setActiveMedia(0);
    setPreviewing(false);
    setGalleryPrimed(false);
  }, [product?.id]);

  useEffect(() => {
    if (!galleryPrimed || typeof Image === "undefined") return undefined;
    const preloads = images.slice(1).map((url) => {
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      return image;
    });
    return () => preloads.forEach((image) => { image.src = ""; });
  }, [galleryPrimed, images]);

  const handlePointerEnter = (event) => {
    if (!isFineHover() || images.length <= 1 || event.pointerType === "touch") return;
    setGalleryPrimed(true);
    setPreviewing(true);
  };
  const handlePointerMove = (event) => {
    if (!isFineHover() || images.length <= 1 || event.pointerType === "touch") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setPreviewing(true);
    setActiveMedia(productCardMediaIndex(event.clientX, bounds.left, bounds.width, images.length));
  };
  const resetMedia = () => {
    setPreviewing(false);
    setActiveMedia(0);
  };

  const mediaStage = (
    <span
      className="customer-card-media-stage"
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetMedia}
      data-active-media={activeMedia}
    >
      {images.length ? images.filter((url, index) => index === 0 || index === activeMedia).map((url) => {
        const index = images.indexOf(url);
        return (
          <img
            key={url}
            className={index === activeMedia ? "is-active" : ""}
            src={url}
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
      {images.length > 1 && (
        <>
          <span className="customer-card-media-cue" aria-hidden="true">{images.length} görsel</span>
          <span className="customer-card-media-zones" aria-hidden="true">
            {images.map((url, index) => <i key={url} className={index === activeMedia ? "is-active" : ""} />)}
          </span>
        </>
      )}
    </span>
  );

  const rating = Math.min(5, Math.max(0, Number(product?.rating) || 0));
  const reviews = Math.max(0, Number(product?.reviews) || 0);
  const delivery = soldOut
    ? "Stok bekleniyor"
    : product?.fastDelivery
      ? "Yarın kapında"
      : String(product?.deliveryLabel || "Teslimat bilgisi ürün detayında");

  return (
    <article className={`product-card customer-product-card${className ? ` ${className}` : ""}${soldOut ? " is-sold-out" : ""}${previewing ? " is-media-previewing" : ""}`}>
      <div className="product-card__media">
        {(soldOut || discount > 0 || product?.badge) && (
          <span className={`product-badge${soldOut ? " is-muted" : discount > 0 ? " is-discount" : ""}`}>
            {soldOut ? "Tükendi" : discount > 0 ? `%${discount} İndirim` : product.badge}
          </span>
        )}
        {!previewMode && typeof onFavorite === "function" && (
          <button className={`favorite-button${favorite ? " is-active" : ""}`} type="button" onClick={() => onFavorite(product.id)} aria-pressed={favorite} aria-label={favorite ? `${product.name} ürününü favorilerden çıkar` : `${product.name} ürününü favorilere ekle`}>
            <Heart weight={favorite ? "fill" : "regular"} />
          </button>
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
        <div className="delivery-line">{soldOut ? <Package /> : product?.fastDelivery ? <Truck /> : <Package />}<span className={soldOut ? "sold-out-copy" : ""}>{delivery}</span></div>
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
            <button className={`compare-button${compared ? " is-active" : ""}`} type="button" aria-pressed={compared} disabled={!comparison.available} onClick={() => comparison.toggle(product.id)} aria-label={compared ? `${product.name} ürününü karşılaştırmadan çıkar` : `${product.name} ürününü karşılaştır`}><ArrowsLeftRight /></button>
            <button className="card-add-button" type="button" disabled={soldOut || typeof onAdd !== "function"} onClick={() => onAdd?.(product.id)}>{soldOut ? "Tükendi" : <><ShoppingCart /> Sepete ekle</>}</button>
          </div>
        )}
      </div>
    </article>
  );
}
