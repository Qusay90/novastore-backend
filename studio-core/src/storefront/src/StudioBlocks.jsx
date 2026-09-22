import {assetURL,isStudioHost} from '../../studio-integration/context.js';
import CampaignScene from "../../sandbox/CampaignScene.jsx";
import { useEffect, useState } from "react";
import { Sparkles, ShieldCheck, Truck, Heart, Package, Headphones, Star, Zap, Leaf, Check, Gift, ArrowRight, Search, Layers2, Plus, Quote, ArrowUpRight, ShoppingBag, ChevronRight, Grid2X2 } from "lucide-react";
import { isBlockActive, targetHref } from "../../sandbox/store.js";
import { getVisibleProducts, getVisibleRoots, getVisibleChildren, getProductsForCategory, getCategoryById, sortProducts } from "./integration/runtimeCatalog.js";
import { CustomerProductCard } from "./CustomerProductCard.jsx";
import { resolveStudioFamily } from "./StudioFamily.jsx";
import { getSectorCatalog } from "../../sandbox/sectorCatalog.js";
import { ORIGINAL_FAMILIES, OriginalHero, OriginalCategories, OriginalCollection, OriginalStory } from "./OriginalShowcase.jsx";

import {V6_FAMILIES,V6Hero,V6Categories,V6Collection,V6Story} from "../../sandbox/SectorShowcaseV6.jsx";
const assetFiles = import.meta.glob("./assets/optimized/*.webp", { eager: true, import: "default" });
const asset = name => assetFiles[`./assets/optimized/${name}.webp`] || "";
const productFiles = { "phone-iphone":"phone-iphone", "phone-samsung":"phone-samsung", "phone-xiaomi":"phone-xiaomi", home:"category-home", "kids-coat":"product-kids-coat" };
const iconSet = { sparkles:Sparkles, shield:ShieldCheck, shieldcheck:ShieldCheck, truck:Truck, heart:Heart, package:Package, headphones:Headphones, star:Star, zap:Zap, leaf:Leaf, check:Check, gift:Gift, search:Search, layers:Layers2 };
export const isStudioMode = () => window.document.documentElement.dataset.visualEditing !== undefined ? window.document.documentElement.dataset.visualEditing === "true" : !isStudioHost() && new URLSearchParams(window.location.search).get("studio") === "1";
const clamp = (value,min,max,fallback) => Number.isFinite(Number(value)) ? Math.max(min,Math.min(max,Number(value))) : fallback;

export function studioSelect(event, blockId) {
  if (!isStudioMode()) return;
  event.preventDefault(); event.stopPropagation();
  window.parent.postMessage({ type:"novastore-studio-select", blockId }, window.location.origin);
}

export function Heading({ text, tag: Tag = "h2" }) {
  return <Tag>{String(text || "").split("\n").map((line,index) => <span key={index}>{index > 0 && <br />}{line}</span>)}</Tag>;
}

function Copy({ block, headingTag = "h2" }) {
  return <>{block.kicker && <span className="section-kicker">{block.kicker}</span>}{block.title && <Heading text={block.title} tag={headingTag} />}{block.description && <p className="studio-copy">{block.description}</p>}</>;
}

function Actions({ block, document, primary = true }) {
  if (!block.buttonText && !block.secondaryText) return null;
  return <div className="studio-block-actions">{block.buttonText && <a className={primary ? "primary-button" : "text-link"} href={targetHref(block.target,document)}>{block.buttonText}<ArrowRight size={17} /></a>}{block.secondaryText && <a className="ghost-button" href={targetHref(block.secondaryTarget,document)}>{block.secondaryText}</a>}</div>;
}

function Picture({ block, fallback, priority = false }) {
  return <picture><source media="(max-width: 620px)" srcSet={assetURL(block.mobileImage || block.image || fallback)} /><img src={assetURL(block.image || fallback)} alt={block.alt || ""} fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} /></picture>;
}

export function categoryImage(category) {
  if (category.imageUrl || category.bannerUrl) return category.imageUrl || category.bannerUrl;
  const slug = category.slug || "";
  const file = slug.includes("moda") ? "product-fashion" : slug.includes("elektronik") ? "phone-iphone" : slug.includes("kozmetik") ? "category-cosmetics" : slug.includes("spor") ? "category-sports" : slug.includes("anne") || slug.includes("oyuncak") ? "category-toys" : "category-home";
  return asset(file);
}

const categoryHref = category => `#/kategori/${category.canonicalPath}`;
const categoryCount = category => category.descendantVisibleProductCount || getProductsForCategory(category.id).length;
function pocketCategoryImage(category) {
  const key = `${category.id} ${category.slug} ${category.name}`.toLocaleLowerCase("tr-TR");
  const file = /elektronik|electronic/.test(key) ? "cat-electronics" : /moda|fashion/.test(key) ? "cat-fashion" : /kozmetik|beauty/.test(key) ? "cat-beauty" : /spor|sport/.test(key) ? "cat-sport" : /ev|home|living/.test(key) ? "cat-living" : /market|gıda/.test(key) ? "cat-market" : null;
  return {src:file ? `/calibration-assets/extracts/${file}.png` : categoryImage(category),embeddedCopy:Boolean(file)};
}

export function StudioCategoryCollection({ family: familyValue, expanded = false }) {
  const family = resolveStudioFamily(familyValue);
  const roots = getVisibleRoots();
  if(V6_FAMILIES.includes(family))return <V6Categories family={family} block={{}} categories={roots} products={getVisibleProducts()}/>;
  if (ORIGINAL_FAMILIES.includes(family)) return <OriginalCategories family={family} block={{}} categories={roots} products={getVisibleProducts()} />;
  if (family === "pocket") return <nav className={`pocket-web-directory${expanded?" is-expanded":""}`} aria-label="Ürün kategorileri">{roots.map(root=><a key={root.id} data-visual-category-id={root.id} href={categoryHref(root)} data-category-id={root.id}><span className="pocket-web-category-image" data-visual-category-part="box"><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy"/></span><span><strong data-visual-category-part="text">{root.name}</strong><small>{categoryCount(root)} ürün · Keşfet</small></span><ArrowUpRight size={19}/></a>)}</nav>;
  if (family === "market") return <nav className={`demo-category-rail${expanded ? " is-expanded" : ""}`} aria-label="Ürün kategorileri">{roots.map(root => <a href={categoryHref(root)} key={root.id} data-visual-category-id={root.id}><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy" /><span><strong data-visual-category-part="text">{root.name}</strong><small>{categoryCount(root)} ürün</small></span><ChevronRight size={18} /></a>)}</nav>;
  if (family === "tech" || (family === "workspace" && expanded)) return <div className={`demo-category-departments demo-category-departments--${family}`}>{roots.map((root,index) => <article key={root.id} data-visual-category-id={root.id}><a className="demo-department-heading" href={categoryHref(root)}><span className="demo-department-number">{String(index+1).padStart(2,"0")}</span><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy" /><h3>{root.name}</h3><ArrowUpRight size={20} /></a><div className="demo-department-links">{getVisibleChildren(root.id).slice(0,expanded ? 8 : 3).map(child => <a key={child.id} href={categoryHref(child)}>{child.name}<ChevronRight size={14} /></a>)}<a href={categoryHref(root)}>Tümünü incele <span>{categoryCount(root)}</span></a></div></article>)}</div>;
  if (family === "living" || family === "fashion") return <div className={`demo-category-mosaic demo-category-mosaic--${family}`}>{roots.map((root,index) => <a key={root.id} data-visual-category-id={root.id} href={categoryHref(root)}><div className="demo-category-mosaic-image"><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy" />{family === "fashion" && <span className="demo-category-mosaic-index">{String(index+1).padStart(2,"0")}</span>}</div><div className="demo-category-mosaic-label"><span><small>{categoryCount(root)} ürün</small><strong data-visual-category-part="text">{root.name}</strong></span><ArrowUpRight size={24} /></div></a>)}</div>;
  return <div className={`family-categories family-categories--${family}`}>{roots.map((root,index) => <a className="family-category" key={root.id} data-visual-category-id={root.id} href={categoryHref(root)}><span className="family-category-image"><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy" /></span><span className="family-category-copy"><small>{family === "gallery" ? String(index+1).padStart(2,"0") : `${categoryCount(root)} ürün`}</small><strong data-visual-category-part="text">{root.name}</strong></span><ArrowRight className="family-category-arrow" size={19} /></a>)}</div>;
}

function DemoHero({ block, document, family, headingTag, priority }) {
  const copy = <div className="demo-hero-copy"><Copy block={block} headingTag={headingTag} /><Actions block={block} document={document} /></div>;
  const picture = <Picture block={block} fallback={asset(family === "tech" ? "product-laptop" : family === "fashion" ? "product-fashion" : "hero-editorial")} priority={priority} />;
  if (family === "pocket") return <div className="shell demo-hero demo-hero--pocket"><a href={targetHref(block.target,document)} className="demo-pocket-cover" aria-label={block.buttonText || block.title || "Kampanyayı keşfet"}>{picture}</a><div className="demo-pocket-campaign">{copy}<a href="#/kategoriler" className="demo-pocket-shortcut"><Grid2X2 size={22} /><span>Tüm kategoriler<small>Aradığını kolayca bul</small></span><ChevronRight size={20} /></a></div></div>;
  if (family === "tech") {
    const selections = selectProducts(block).slice(0,3);
    return <div className="shell demo-hero demo-hero--tech"><div className="demo-tech-stage">{copy}<div className="demo-tech-device">{picture}</div></div>{selections.length>0 && <div className="demo-tech-shortlist">{selections.map((product,index) => <a key={product.id} href={`#/urun/${product.slug}`}><span className="demo-tech-index">0{index+1}</span><span><small>{product.brand || "NovaStore"}</small><strong>{product.name}</strong></span><ArrowUpRight size={24} /></a>)}</div>}</div>;
  }
  if (family === "living") return <div className="shell demo-hero demo-hero--living"><div className="demo-living-copy">{copy}<span className="demo-edition-mark"><Leaf size={18} /> Yaşamına yer aç.</span></div><figure className="demo-living-room">{picture}{block.alt && <figcaption>{block.alt}</figcaption>}</figure><a className="demo-living-discover" href={targetHref(block.target,document)}><ArrowUpRight size={26}/><span>{block.buttonText || "Koleksiyonu keşfet"}</span></a></div>;
  if (family === "fashion") return <div className="shell demo-hero demo-hero--fashion"><div className="demo-fashion-heading">{block.kicker && <span>{block.kicker}</span>}<span>NovaStore / Koleksiyon</span></div><div className="demo-fashion-cover">{picture}</div><div className="demo-fashion-caption">{copy}<span className="demo-fashion-seal" aria-hidden="true"><ArrowUpRight size={46} /></span></div></div>;
  if (family === "market") return <div className="shell demo-hero demo-hero--market"><aside className="demo-market-departments"><strong><Grid2X2 size={18}/> Kategoriler</strong>{getVisibleRoots().map(root => <a key={root.id} data-visual-category-id={root.id} href={categoryHref(root)}><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy"/><span data-visual-category-part="text">{root.name}</span><ChevronRight size={15}/></a>)}</aside><div className="demo-market-offer"><div className="demo-market-offer-image">{picture}</div>{copy}</div></div>;
  if (family === "gallery") return <div className="shell demo-hero demo-hero--gallery"><div className="demo-gallery-intro">{copy}<a href={targetHref(block.target,document)} className="demo-gallery-scroll"><span>Seçkileri keşfet</span><ArrowRight size={30}/></a></div><figure className="demo-gallery-cover">{picture}<figcaption><span>{block.alt || "NovaStore seçkisi"}</span><span>01 / Keşif</span></figcaption></figure></div>;
  return <div className="shell family-hero family-hero--workspace"><div className="family-hero-copy"><Copy block={block} headingTag={headingTag}/><Actions block={block} document={document}/></div><div className="family-hero-media">{picture}</div></div>;
}

function DemoStory({ block, document, family }) {
  const copy = <div className="demo-story-copy"><Copy block={block}/><Actions block={block} document={document}/></div>;
  const media = <Picture block={block} fallback={asset(family === "fashion" ? "product-fashion" : "category-home")}/>;
  if (family === "living" || family === "gallery") return <div className={`shell demo-story demo-story--${family}`}><figure>{media}{block.alt && <figcaption>{block.alt}</figcaption>}</figure><div className="demo-story-editorial"><span className="demo-story-section-number" aria-hidden="true">02</span>{copy}</div></div>;
  if (family === "fashion") return <div className="shell demo-story demo-story--fashion"><div className="demo-story-fashion-image">{media}</div>{copy}<a className="demo-story-fashion-link" href={targetHref(block.target,document)}><ArrowUpRight size={30}/><span>{block.buttonText || "Keşfet"}</span></a></div>;
  if (family === "tech") return <div className="shell demo-story demo-story--tech"><div className="demo-story-tech-image">{media}</div><div><span className="demo-tech-detail-icon"><Zap size={25}/></span>{copy}</div></div>;
  if (family === "market") return <div className="shell demo-story demo-story--market"><div className="demo-story-market-icon"><ShoppingBag size={32}/></div>{copy}<div className="demo-story-market-image">{media}</div></div>;
  if (family === "pocket") return <div className="shell demo-story demo-story--pocket"><div className="demo-story-pocket-image">{media}</div>{copy}</div>;
  return <div className="shell family-story family-story--workspace"><div className="family-story-copy"><Copy block={block}/><Actions block={block} document={document}/></div><div className="family-story-media">{media}</div></div>;
}

export function selectProducts(block) {
  const all = getVisibleProducts();
  const limit = Math.round(clamp(block.productLimit,1,24,8));
  const source = block.productSource;
  if (source?.mode === "selected") {
    const byId = new Map(all.map(product => [String(product.id),product]));
    return [...new Set((source.productIds || []).map(String))].map(id => byId.get(id)).filter(Boolean).slice(0,limit);
  }
  if (source?.mode === "category") {
    const category = getCategoryById(source.categoryId);
    return category ? sortProducts(getProductsForCategory(category.id),"featured").slice(0,limit) : [];
  }
  if (source?.mode === "all") return sortProducts(all,"featured").slice(0,limit);
  const [kind,id] = String(block.target || "").split(":");
  let items = all;
  if (kind === "category") { const category = getCategoryById(id); items = category ? getProductsForCategory(category.id) : []; }
  else if (kind === "product") items = all.filter(product => String(product.id) === id);
  else if (kind === "collection") items = ["firsatlar","indirim"].includes(id) ? all.filter(product => Number(product.oldPrice) > Number(product.price)) : all.filter(product => product.collectionSlugs?.includes(id));
  return sortProducts(items,"featured").slice(0,limit);
}

export function StudioProductGrid({ block, document, favorites = new Set(), onFavorite, onAdd }) {
  const items = selectProducts(block);
  if (!items.length) return <div className="studio-empty-selection"><Package size={26} /><p>{block.productSource?.mode === "selected" ? "Bu ürün seçkisi henüz hazırlanmadı." : block.productSource?.mode === "category" ? "Bu kategoride henüz gösterilecek ürün yok." : "Bu seçkide henüz ürün yok."}</p></div>;
  return <div className="product-grid studio-product-grid" data-product-count={items.length}>{items.map(product => <CustomerProductCard key={product.id} family={resolveStudioFamily(document?.theme?.family)} product={product} brand={product.brand} favorite={favorites.has(product.id)} onFavorite={onFavorite} onAdd={onAdd} mediaFallback={asset(productFiles[product.imageKey] || `product-${product.imageKey}`)} />)}</div>;
}

function ItemIcon({ name }) { const Icon = iconSet[String(name || "sparkles").toLowerCase().replace(/[^a-z]/g,"")] || Sparkles; return <Icon size={24} strokeWidth={1.7} aria-hidden="true" />; }

function Block({ block, document, firstHeroId, primaryHeading, favorites, onFavorite, onAdd, BenefitStrip }) {
  const family = resolveStudioFamily(document?.theme?.family);
  const blockStyle = block.style || {};
  const presentation = {
    "--block-padding": `${clamp(blockStyle.padding,0,160,48)}px`,
    "--block-align": ["left","center","right"].includes(blockStyle.align) ? blockStyle.align : "left",
    ...(blockStyle.background ? { background:blockStyle.background,"--block-background":blockStyle.background } : {}),
    ...(blockStyle.textColor ? { color:blockStyle.textColor,"--block-color":blockStyle.textColor } : {}),
  };
  const classes = ["studio-block", `studio-block--${block.type}`,`studio-align-${["left","center","right"].includes(blockStyle.align)?blockStyle.align:"left"}`, block.visibility?.desktop === false && "studio-hide-desktop", block.visibility?.mobile === false && "studio-hide-mobile", blockStyle.imagePosition === "left" && "studio-image-left", blockStyle.textColor && "has-custom-ink", blockStyle.background && "has-custom-background"].filter(Boolean).join(" ");
  const props = { className:classes, style:presentation,"data-module-id":block.id,"data-module-type":block.type,"data-block-family":family,onClickCapture:event => studioSelect(event,block.id) };
  const items = Array.isArray(block.items) ? block.items : [];

  if(block.campaignCanvas)return <section {...props}><div className="shell"><CampaignScene canvas={block.campaignCanvas} theme={document.theme}/>{block.buttonText&&<div className="studio-campaign-actions"><a className="button button-primary" href={targetHref(block.target,document)}>{block.buttonText}<ArrowRight size={16}/></a></div>}</div></section>;
  if (V6_FAMILIES.includes(family)) {
    const shared={family,block,document,products:selectProducts(block),categories:getVisibleRoots(),favorites,onFavorite,onAdd};
    if(block.type==="hero")return <section {...props}><V6Hero {...shared} headingTag={primaryHeading && block.id===firstHeroId?"h1":"h2"} priority={block.id===firstHeroId}/></section>;
    if(block.type==="categories")return <section {...props}><V6Categories {...shared} products={getVisibleProducts()}/></section>;
    if(block.type==="products")return <section {...props}><V6Collection {...shared}/></section>;
    if(["editorial","banner"].includes(block.type))return <section {...props}><V6Story {...shared}/></section>;
  }
  if (ORIGINAL_FAMILIES.includes(family)) {
    const products = selectProducts(block);
    const sector = {products:getVisibleProducts()};
    const shared = { family, block, document, products, onAdd };
    if (block.type === "hero") return <section {...props}><OriginalHero {...shared} headingTag={primaryHeading && block.id === firstHeroId ? "h1" : "h2"} priority={block.id === firstHeroId} /></section>;
    if (block.type === "categories") return <section {...props}><OriginalCategories {...shared} categories={getVisibleRoots()} products={sector?.products || getVisibleProducts()} /></section>;
    if (block.type === "products") return <section {...props}><OriginalCollection {...shared} favorites={favorites} onFavorite={onFavorite} /></section>;
    if (block.type === "editorial" || block.type === "banner") return <section {...props}><OriginalStory {...shared} /></section>;
  }

  if (block.type === "hero" && family !== "nova-commerce") return <section {...props}><DemoHero {...{block,document,family}} headingTag={primaryHeading && block.id === firstHeroId ? "h1" : "h2"} priority={block.id === firstHeroId}/></section>;
  if (block.type === "hero") return <section {...props}><div className="home-hero shell"><Picture block={block} fallback={asset("hero-editorial")} priority={block.id === firstHeroId} /><div className="home-hero__shade" aria-hidden="true" /><div className="home-hero__copy"><Copy block={block} headingTag={primaryHeading && block.id === firstHeroId ? "h1" : "h2"} /><Actions block={block} document={document} /></div></div>{block.id === firstHeroId && BenefitStrip && <div className="shell"><BenefitStrip /></div>}</section>;
  if (block.type === "categories" && family !== "nova-commerce") return <section {...props}><div className="shell"><div className="section-heading"><div><Copy block={block} /></div><Actions block={block} document={document} primary={false} /></div><StudioCategoryCollection family={family}/></div></section>;
  if (block.type === "categories") return <section {...props}><div className="shell"><div className="section-heading"><div><Copy block={block} /></div><Actions block={block} document={document} primary={false} /></div><div className="root-category-grid">{getVisibleRoots().map(root => <a className="root-category-card" key={root.id} data-visual-category-id={root.id} href={`#/kategori/${root.canonicalPath}`}><img data-visual-category-part="image" src={categoryImage(root)} alt="" loading="lazy" /><span className="root-category-card__shade" aria-hidden="true" /><span><small>{root.descendantVisibleProductCount || getProductsForCategory(root.id).length} ürün</small><strong data-visual-category-part="text">{root.name}</strong><b>Keşfet <ArrowRight size={16} /></b></span></a>)}</div></div></section>;
  if (block.type === "products") return <section {...props}><div className="shell"><div className="section-heading"><div><Copy block={block} /></div><Actions block={block} document={document} primary={false} /></div><StudioProductGrid block={block} document={document} favorites={favorites} onFavorite={onFavorite} onAdd={onAdd} /></div></section>;
  if ((block.type === "editorial" || block.type === "banner") && family !== "nova-commerce") return <section {...props}><DemoStory {...{block,document,family}}/></section>;
  if (block.type === "editorial" || block.type === "banner") return <section {...props}><div className="shell category-story"><div><Copy block={block} /><Actions block={block} document={document} /></div><Picture block={block} fallback={asset("category-home")} /></div></section>;
  if (block.type === "announcement") return <section {...props}><div className="shell studio-announcement-inner"><div><Copy block={block} /></div><Actions block={block} document={document} /></div></section>;
  if (block.type === "text") return <section {...props}><div className="shell studio-text-inner"><Copy block={block} /><Actions block={block} document={document} /></div></section>;
  if (block.type === "features") return <section {...props}><div className="shell"><div className="studio-section-intro"><Copy block={block} /></div><div className="studio-feature-grid">{items.map((item,index) => <article key={item.id || index}><span className="studio-feature-icon"><ItemIcon name={item.icon} /></span><h3>{item.title}</h3><p>{item.body}</p></article>)}</div><Actions block={block} document={document} /></div></section>;
  if (block.type === "faq") return <section {...props}><div className="shell studio-faq-layout"><div className="studio-section-intro"><Copy block={block} /><Actions block={block} document={document} /></div><div className="studio-faq-list">{items.map((item,index) => <details key={item.id || index}><summary>{item.title}<Plus className="studio-faq-toggle" size={22} strokeWidth={1.6} aria-hidden="true" /></summary><p>{item.body}</p></details>)}</div></div></section>;
  if (block.type === "stats") return <section {...props}><div className="shell"><div className="studio-section-intro"><Copy block={block} /></div><div className="studio-stats-grid">{items.map((item,index) => <article key={item.id || index}><strong>{item.value}</strong><h3>{item.title}</h3><p>{item.body}</p></article>)}</div><Actions block={block} document={document} /></div></section>;
  if (block.type === "testimonials") return <section {...props}><div className="shell"><div className="studio-section-intro"><Copy block={block} /></div><div className="studio-testimonial-grid">{items.map((item,index) => <figure key={item.id || index}><Quote className="studio-quote-mark" size={34} strokeWidth={1.4} aria-hidden="true" /><blockquote>{item.body}</blockquote><figcaption><strong>{item.title}</strong>{item.value && <span>{item.value}</span>}</figcaption></figure>)}</div><Actions block={block} document={document} /></div></section>;
  if (block.type === "divider") return <section {...props}><div className="shell studio-divider"><hr />{block.title && <span>{block.title}</span>}<hr /></div></section>;
  if (block.type === "spacer") return <div {...props} aria-hidden="true" />;
  return null;
}

export function StudioBlocks({ blocks = [], document, favorites, onFavorite, onAdd, BenefitStrip, primaryHeading = false }) {
  const [now,setNow] = useState(() => new Date());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date()),15000); return () => window.clearInterval(timer); },[]);
  const visible = blocks.filter(block => isBlockActive(block,now));
  const firstHeroId = visible.find(block => block.type === "hero")?.id;
  return <>{visible.map(block => <Block key={block.id} {...{block,document,firstHeroId,primaryHeading,favorites,onFavorite,onAdd,BenefitStrip}} />)}</>;
}
