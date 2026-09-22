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
import { resolveStudioFamily, useStudioFamily } from "./StudioFamily.jsx";
import { Plus, Minus, ArrowUpRight, Ruler } from "lucide-react";

import {SectorProductCardV6} from "../../sandbox/SectorProductCardV6.jsx";
const { CARD_VIEWPORT_ASPECT_RATIO, cardFramingPresentation } = productCardFraming;
export const CUSTOMER_CARD_AUTOPLAY_DWELL_MS = 500;
export const CUSTOMER_CARD_AUTOPLAY_INTERVAL_MS = 1650;

const money = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isFineHover = () => (
  typeof window !== "undefined"
  && window.matchMedia?.("(hover: hover) and (pointer: fine)").matches === true
);

export function CustomerProductCard(props){const inherited=useStudioFamily();const family=resolveStudioFamily(props.family||inherited);return ["beauty","sport","kids"].includes(family)?<SectorProductCardV6 {...props} family={family}/>:<LegacyCustomerProductCard {...props}/>;}
function LegacyCustomerProductCard({
  product,
  brand = product?.brand || "NovaStore",
  favorite = false,
  onFavorite,
  onAdd,
  mediaFallback = null,
  previewMode = false,
  className = "",
  family: familyOverride,
}) {
  const comparison = useContext(RuntimeComparisonContext);
  const inheritedFamily = useStudioFamily();
  const family = resolveStudioFamily(familyOverride || inheritedFamily);
  const [activeMedia, setActiveMedia] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [galleryPrimed, setGalleryPrimed] = useState(false);
  const [cartPhase, setCartPhase] = useState("idle");
  const [compareMotion, setCompareMotion] = useState(false);
  const [selectedSize,setSelectedSize] = useState('');
  const [quantity,setQuantity] = useState(1);
  const dwellTimer = useRef(null);
  const cycleTimer = useRef(null);
  const activeMediaRef = useRef(0);
  const cartTimer = useRef(null);
  const compareTimer = useRef(null);
  const media = useMemo(
    () => resolveCustomerCardMedia(product, mediaFallback),
    [mediaFallback, product],
  );
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  const selectedVariant = variants.find(variant=>variant.size===selectedSize);
  const needsSize = variants.length>0 && !selectedVariant;
  const availableStock = Math.max(0,Number(selectedVariant?.stock ?? product?.stock)||0);
  const soldOut = availableStock <= 0;
  const oldPrice = Number(selectedVariant?.oldPrice ?? product?.oldPrice);
  const currentPrice = Math.max(0, Number(selectedVariant?.price ?? product?.price) || 0);
  const discount = oldPrice > currentPrice
    ? Math.round((1 - currentPrice / oldPrice) * 100)
    : 0;
  const commerceCard = family === "nova-commerce";
  const mediaBadge = soldOut ? "Tükendi" : commerceCard
    ? discount > 0 || /indirim|%/iu.test(product?.badge || "") ? null : product?.badge
    : discount > 0 ? (family === "pocket" ? `%${discount}` : `%${discount} İndirim`) : product?.badge;
  const compared = comparison.ids.has(product.id);
  const detailHref = `#/urun/${product.slug}`;

  useEffect(() => {
    activeMediaRef.current = 0;
    setActiveMedia(0);
    setPreviewing(false);
    setGalleryPrimed(false);
    setCartPhase("idle");
    setSelectedSize('');
    setQuantity(1);
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
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || document.documentElement.dataset.sandboxMotion === "reduced") return;
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
    if (soldOut || needsSize || typeof onAdd !== "function" || cartPhase === "pressed" || (family === "pocket" && cartPhase === "success")) return;
    setCartPhase("pressed");
    const pressedAt = performance.now();
    try {
      const result = await onAdd?.(selectedVariant?.id || product.id, ['market','workspace'].includes(family) ? quantity : 1);
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
            className={`os-product-image${index === activeMedia ? " is-active" : ""}`}
            src={item.url}
            style={{...cardFramingPresentation(item.cardFraming),...(['tech','market','workspace','gallery'].includes(family) ? {objectFit:'contain'} : {})}}
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

  const compareControl = <button className={`compare-button${compared ? " is-active" : ""}${compareMotion ? " is-confirmed" : ""}`} type="button" aria-pressed={compared} disabled={!comparison.available} onClick={handleCompare} aria-label={compared ? `${product.name} ürününü karşılaştırmadan çıkar` : `${product.name} ürününü karşılaştır`}><ArrowsLeftRight /></button>;
  const mediaContent = <div className="product-card__media" style={{ aspectRatio: CARD_VIEWPORT_ASPECT_RATIO }}>
        {mediaBadge && (
          <span className={`product-badge${soldOut ? " is-muted" : !commerceCard && discount > 0 ? " is-discount" : ""}`}>
            {mediaBadge}
          </span>
        )}
        {!previewMode && typeof onFavorite === "function" && (
          <CustomerFavoriteButton productId={product.id} productName={product.name} favorite={favorite} onFavorite={onFavorite} />
        )}
        {!previewMode && family === "pocket" && compareControl}
        {previewMode ? <span className="customer-card-preview-media public-store-product-media">{mediaStage}</span> : <a href={detailHref} aria-label={`${product.name} detayını aç`}>{mediaStage}</a>}
      </div>;
  const brandContent = <span className="product-brand">{brand}</span>;
  const titleContent = <h3 className="os-product-title">{previewMode ? <span>{product.name}</span> : <a href={detailHref}>{product.name}</a>}</h3>;
  const ratingContent = reviews > 0 ? (
          <div className="product-rating" role="img" aria-label={`${rating.toFixed(1)} puan, ${reviews} değerlendirme`}><Star weight="fill" /><strong>{rating.toFixed(1)}</strong><span>({reviews})</span></div>
        ) : (
          <div className="product-rating customer-card-no-rating" role="img" aria-label="Henüz değerlendirme yok"><Star /><span>Henüz değerlendirme yok</span></div>
        );
  const deliveryContent = delivery && <div className="delivery-line"><Truck /><span>{delivery}</span></div>;
  const priceContent = commerceCard ? <div className="product-price-row commerce-card-price-row">
          <div className="price-block commerce-card-price">
            <strong className="os-product-price" aria-label={`Güncel fiyat ${money.format(currentPrice)}`}>{money.format(currentPrice)}</strong>
            <span className="commerce-card-price-history" aria-hidden={oldPrice > currentPrice ? undefined : true}>
              {oldPrice > currentPrice && <><del aria-label={`Önceki fiyat ${money.format(oldPrice)}`}>{money.format(oldPrice)}</del>{discount > 0 && <b className="commerce-card-discount" aria-label={`Yüzde ${discount} indirim`}>%{discount}</b>}</>}
            </span>
          </div>
        </div> : family === "pocket" ? <div className="product-price-row pocket-card-price-row"><div className="price-block"><strong className="os-product-price" aria-label={`Güncel fiyat ${money.format(currentPrice)}`}>{money.format(currentPrice)}</strong>{oldPrice > currentPrice && <del aria-label={`Önceki fiyat ${money.format(oldPrice)}`}>{money.format(oldPrice)}</del>}</div></div> : <div className="product-price-row">
          <div className="price-block">
            {oldPrice > currentPrice && <span><del>{money.format(oldPrice)}</del>{discount > 0 && <b>%{discount}</b>}</span>}
            <strong className="os-product-price">{money.format(currentPrice)}</strong>
          </div>
        </div>;
  const actionsContent = previewMode ? (
          <div className="public-store-readonly-product"><ShieldCheck /> Önizlemede işlem yapılamaz</div>
        ) : (
          <div className="product-card__actions">
            {family !== "pocket" && compareControl}
            <button className={`card-add-button os-product-add is-${cartPhase}`} type="button" aria-label={soldOut ? `${product.name} tükendi` : needsSize ? `${product.name} için beden seç` : cartPhase === "success" ? `${product.name} sepete eklendi` : `${product.name}${selectedSize ? ` ${selectedSize} beden` : ''} ürününü sepete ekle`} disabled={soldOut || needsSize || typeof onAdd !== "function" || cartPhase === "pressed" || (family === "pocket" && cartPhase === "success")} onClick={handleAdd}>{soldOut ? <span className="family-add-label">Tükendi</span> : needsSize ? <><Ruler size={16}/><span className="family-add-label">Beden seç</span></> : cartPhase === "success" ? <><Check /><span className="family-add-label">Eklendi</span></> : <>{family === "pocket" ? <span className="pocket-cart-glyph"><ShoppingCart/><Plus className="pocket-cart-plus" size={11}/></span> : ["workspace","market"].includes(family) ? <Plus size={20} /> : ["gallery","living","fashion"].includes(family) ? <ArrowUpRight size={18} /> : <ShoppingCart />}<span className="family-add-label">{selectedSize ? `${selectedSize} · Sepete ekle` : 'Sepete ekle'}</span></>}</button>
          </div>
        );
  const stockContent = <span className={`demo-card-stock${soldOut ? " is-unavailable" : ""}`}><i aria-hidden="true"/>{soldOut ? "Stokta yok" : "Stokta"}</span>;
  const specificationSource = product?.specs || product?.specifications || {};
  const specifications = Array.isArray(specificationSource) ? specificationSource.map(item=>typeof item==='string'?['',item]:[item.label||item.name,item.value]).filter(([,value])=>value) : Object.entries(specificationSource).filter(([,value])=>typeof value==='string'||typeof value==='number');
  const technicalContent = specifications.length>0 && <dl className="original-card-specs">{specifications.slice(0,family==='tech'?3:2).map(([label,value])=><div key={`${label}-${value}`}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
  const choicesContent = !previewMode && variants.length>0 && <div className="original-card-sizes"><div><span>Beden</span><small>{selectedSize || 'Seçimini yap'}</small></div><div role="group" aria-label={`${product.name} beden seçimi`}>{variants.map(variant=><button type="button" key={variant.id} aria-pressed={selectedSize===variant.size} aria-label={`${variant.size} beden${Number(variant.stock)<=0?' stokta yok':''}`} disabled={Number(variant.stock)<=0||cartPhase==='pressed'} onClick={()=>{setSelectedSize(variant.size);setCartPhase('idle');}}>{variant.size}</button>)}</div></div>;
  const quantityContent = !previewMode && <div className="original-card-quantity"><button type="button" aria-label={`${product.name} eklenecek adedi azalt`} disabled={quantity<=1||cartPhase==='pressed'||soldOut} onClick={()=>setQuantity(value=>Math.max(1,value-1))}><Minus size={14}/></button><span aria-live="polite">{quantity}</span><button type="button" aria-label={`${product.name} eklenecek adedi artır`} disabled={quantity>=availableStock||cartPhase==='pressed'||soldOut} onClick={()=>setQuantity(value=>Math.min(availableStock,value+1))}><Plus size={14}/></button></div>;
  let cardContent;
  if (family === "fashion") cardContent = <><div className="original-fashion-card-photo">{mediaContent}{!previewMode&&<a className="original-card-inspect" href={detailHref}>Yakından incele<ArrowUpRight size={16}/></a>}</div><div className="product-card__body"><div className="original-fashion-card-heading">{brandContent}{priceContent}</div>{titleContent}{choicesContent}{actionsContent}</div></>;
  else if (family === "tech") cardContent = <><div className="original-tech-card-eyebrow">{brandContent}{stockContent}</div>{mediaContent}<div className="product-card__body">{titleContent}{technicalContent}<div className="original-tech-card-bottom">{priceContent}{actionsContent}</div></div></>;
  else if (family === "market") cardContent = <><div className="original-market-card-photo">{mediaContent}{product.unit&&<span className="original-market-unit">{product.unit}</span>}</div><div className="product-card__body">{brandContent}{titleContent}<div className="original-market-card-price">{priceContent}{stockContent}</div><div className="original-market-card-controls">{quantityContent}{actionsContent}</div></div></>;
  else if (family === "living") cardContent = <><div className="original-living-card-photo">{mediaContent}<span className="original-card-photo-caption">{product.unit || specifications[0]?.[1] || brand}</span></div><div className="product-card__body"><div className="original-living-card-heading">{titleContent}{priceContent}</div>{technicalContent}<div className="original-living-card-bottom">{stockContent}{actionsContent}</div></div></>;
  else if (family === "pocket") cardContent = <>{mediaContent}<div className="product-card__body"><span className="pocket-cart-recess" aria-hidden="true"><i/></span>{brandContent}{titleContent}{ratingContent}<hr/><div className="demo-pocket-card-buy">{priceContent}{actionsContent}</div><span className="sp-sr-only" role="status" aria-live="polite">{cartPhase === "success" ? `${product.name} sepete eklendi` : ""}</span></div></>;
  else if (family === "gallery") cardContent = <><div className="original-gallery-card-photo">{mediaContent}</div><div className="product-card__body"><div className="original-gallery-card-title">{brandContent}{titleContent}{priceContent}</div>{product.features?.[0]&&<p className="original-card-description">{product.features[0]}</p>}<div className="original-gallery-card-bottom">{technicalContent}{actionsContent}</div></div></>;
  else if (family === "workspace") cardContent = <>{mediaContent}<div className="product-card__body"><div className="original-workspace-card-title">{brandContent}{stockContent}</div>{titleContent}{technicalContent}<div className="original-workspace-card-bottom">{priceContent}{quantityContent}{actionsContent}</div></div></>;
  else cardContent = <>{mediaContent}<div className="product-card__body">{brandContent}{titleContent}{ratingContent}{deliveryContent}{priceContent}{actionsContent}</div></>;
  return <article data-card-family={family} data-product-id={product.id} className={`product-card customer-product-card os-product-card family-card--${family}${['tech','living','fashion','market','workspace','gallery'].includes(family)?' original-product-card':''}${className ? ` ${className}` : ""}${soldOut ? " is-sold-out" : ""}${previewing ? " is-media-previewing" : ""}`}>{cardContent}{family!=="fashion"&&choicesContent}</article>;
}
