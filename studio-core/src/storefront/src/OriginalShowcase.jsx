import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Layers, Plus, ShoppingBag, SlidersHorizontal } from 'lucide-react';
import { targetHref } from '../../sandbox/store.js';
import { CustomerProductCard } from './CustomerProductCard.jsx';
import { resolveCustomerCardMedia } from './customerProductCardModel.js';

export const ORIGINAL_FAMILIES = ['tech','living','fashion','market','workspace','gallery'];
const formatMoney = value => new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',maximumFractionDigits:2}).format(Number(value)||0);
const productHref = product => `#/urun/${product.slug}`;
const imageOf = product => resolveCustomerCardMedia(product)[0]?.url || product?.imageUrl || '';
const nameOfCategory = category => category?.name || 'Seçki';
const hrefOfCategory = category => `#/kategori/${category.canonicalPath || category.path || category.slug}`;
const categoryProducts = (category,products) => products.filter(p => String(p.categoryId)===String(category.id) || p.categoryIds?.map(String).includes(String(category.id)) || p.categoryPath?.startsWith(category.canonicalPath || category.path || '\0'));
function specificationPairs(product) {
  const values = product?.specs || product?.specifications || {};
  if (Array.isArray(values)) return values.map(item=> typeof item==='string' ? ['',item] : [item.label||item.name||'',item.value||'']).filter(([,v])=>v);
  return Object.entries(values).filter(([,v])=>typeof v==='string'||typeof v==='number');
}
function Heading({ block, tag:Tag='h2', className='' }) {
  return <div className={`original-copy ${className}`}>{block.kicker&&<span className="original-eyebrow">{block.kicker}</span>}{block.title&&<Tag>{String(block.title).split('\n').map((line,index)=><span key={index}>{index>0&&<br/>}{line}</span>)}</Tag>}{block.description&&<p>{block.description}</p>}</div>;
}
function Actions({block,document}) {
  return <div className="original-actions">{block.buttonText&&<a href={targetHref(block.target,document)} className="original-action">{block.buttonText}<ArrowUpRight size={19}/></a>}{block.secondaryText&&<a className="original-secondary-action" href={targetHref(block.secondaryTarget,document)}>{block.secondaryText}<ArrowRight size={16}/></a>}</div>;
}
function Cover({block, fallback, priority=false}) {
  const image=block.image||fallback;
  return image ? <picture><source media="(max-width:620px)" srcSet={block.mobileImage||image}/><img src={image} alt={block.alt||''} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'}/></picture> : null;
}
function ProductLink({product, index, className=''}) {
  return <a className={`original-product-link ${className}`} href={productHref(product)}>{index!==undefined&&<span className="original-product-number">{String(index+1).padStart(2,'0')}</span>}<img src={imageOf(product)} alt="" loading="lazy"/><span><small>{product.brand}</small><strong>{product.name}</strong><b>{formatMoney(product.price)}</b></span><ArrowUpRight size={18}/></a>;
}

function SelectionSet({products,onAdd,title='Seçkini oluştur',compact=false}) {
  const eligible=products.filter(p=>Number(p.stock)>0).slice(0,4);
  const signature=eligible.map(p=>p.id).join('|');
  const [selected,setSelected]=useState(()=>eligible.slice(0,2).map(p=>p.id));
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  useEffect(()=>{setSelected(eligible.slice(0,2).map(p=>p.id));setStatus('');},[signature]);
  const chosen=eligible.filter(p=>selected.includes(p.id));
  const total=chosen.reduce((sum,p)=>sum+Number(p.price||0),0);
  async function addSelection(){
    if(busy||!chosen.length||!onAdd)return;
    setBusy(true);setStatus('');let added=0;
    try { for(const product of chosen) { if(await onAdd(product.id,1)===false)break;added++; } setStatus(added===chosen.length?`${added} ürün sepete eklendi.`:`${added} ürün eklendi. Kalan ürünlerin stok durumunu kontrol et.`); }
    catch {setStatus(`${added} ürün eklendi. İşlem tamamlanamadı; sepetini kontrol et.`);}
    finally{setBusy(false);}
  }
  if(!eligible.length)return null;
  return <div className={`original-selection-set${compact?' is-compact':''}`}><div className="original-selection-title"><Layers size={19}/><h3>{title}</h3></div><div className="original-selection-items">{eligible.map(product=><div className="original-selection-item" key={product.id}><label><input type="checkbox" checked={selected.includes(product.id)} disabled={busy} onChange={e=>{setStatus('');setSelected(ids=>e.target.checked?[...ids,product.id]:ids.filter(id=>id!==product.id));}}/><span className="original-selection-check" aria-hidden="true">{selected.includes(product.id)&&<Check size={13}/>}</span><img src={imageOf(product)} alt="" loading="lazy"/><span>{product.name}<strong>{formatMoney(product.price)}</strong></span></label><a href={productHref(product)} aria-label={`${product.name} detayını incele`}><ArrowUpRight size={16}/></a></div>)}</div><div className="original-selection-total"><span>{chosen.length} ürün<strong>{formatMoney(total)}</strong></span><button type="button" onClick={addSelection} disabled={busy||!chosen.length||!onAdd}>{busy?'Ekleniyor…':'Seçtiklerimi ekle'}<Plus size={18}/></button></div><p className="original-operation-status" role="status">{status}</p></div>;
}

export function OriginalHero({family,block,document,products=[],onAdd,headingTag='h1',priority=false}) {
  const first=products[0];
  const second=family==='tech' ? products.find(product=>product.id!==first?.id&&product.department!==first?.department)||products[1] : products[1];
  const third=family==='tech' ? products.find(product=>![first?.id,second?.id].includes(product.id)&&![first?.department,second?.department].includes(product.department))||products.find(product=>![first?.id,second?.id].includes(product.id)) : products[2];
  const heading=<><Heading block={block} tag={headingTag}/><Actions {...{block,document}}/></>;
  if(family==='living')return <div className="shell original-showcase original-showcase--living"><div className="original-living-room"><Cover block={block} fallback={imageOf(first)} priority={priority}/><div className="original-living-caption">{heading}</div></div><aside className="original-living-companions"><span className="original-eyebrow">BU ODAYA EŞLİK EDENLER</span><SelectionSet products={products.slice(0,3)} onAdd={onAdd} title="Birlikte güzel." compact/></aside></div>;
  if(family==='fashion')return <div className="shell original-showcase original-showcase--fashion"><div className="original-fashion-cover"><Cover block={block} fallback={imageOf(first)} priority={priority}/><span className="original-fashion-side-note">NOVASTORE / STÜDYO SEÇKİSİ</span></div><div className="original-fashion-edit"><div>{heading}</div>{second&&<a className="original-fashion-feature" href={productHref(second)}><img src={imageOf(second)} alt={second.name} loading="lazy"/><span><small>SEÇKİDEN BİR PARÇA</small><strong>{second.name}</strong><b>{formatMoney(second.price)}</b></span><ArrowUpRight size={25}/></a>}</div></div>;
  if(family==='tech')return <div className="shell original-showcase original-showcase--tech"><div className="original-tech-intro">{heading}<a href={targetHref(block.target,document)} className="original-tech-explore"><SlidersHorizontal size={18}/><span>Özelliklerine göre keşfet</span></a></div>{first&&<a className="original-tech-main-product" href={productHref(first)}><span className="original-tech-label">{first.brand}<ArrowUpRight size={23}/></span><img src={imageOf(first)} alt={first.name} fetchPriority={priority?'high':'auto'}/><div><h3>{first.name}</h3><strong>{formatMoney(first.price)}</strong><dl>{specificationPairs(first).slice(0,3).map(([label,value])=><div key={label+value}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div></a>}<div className="original-tech-side-products">{[second,third].filter(Boolean).map((product,index)=><a key={product.id} href={productHref(product)}><span className="original-tech-label">0{index+2}<ArrowUpRight size={19}/></span><img src={imageOf(product)} alt={product.name} loading="lazy"/><h3>{product.name}</h3><strong>{formatMoney(product.price)}</strong></a>)}</div></div>;
  if(family==='market')return <div className="shell original-showcase original-showcase--market"><div className="original-market-intro">{heading}</div><div className="original-market-basket"><Cover block={block} fallback={imageOf(first)} priority={priority}/><a href={targetHref(block.target,document)}><ShoppingBag size={21}/>{block.buttonText||'Alışverişe başla'}<ArrowUpRight size={20}/></a></div><div className="original-market-finds"><span className="original-eyebrow">LİSTENE EKLEYEBİLİRSİN</span>{products.slice(0,3).map((product,index)=><ProductLink key={product.id} product={product} index={index}/>)}</div></div>;
  if(family==='workspace')return <div className="shell original-showcase original-showcase--workspace"><div className="original-workspace-intro"><div>{heading}</div><div className="original-workspace-meta"><span>{products.length} ürünlük seçki</span><span>Kurulumunu kendin oluştur</span></div></div><div className="original-workbench"><div className="original-workbench-products">{products.slice(0,3).map((product,index)=><a key={product.id} href={productHref(product)} className={`original-workbench-product original-workbench-slot-${index}`}><span>{String(index+1).padStart(2,'0')}<ArrowUpRight size={17}/></span><img src={imageOf(product)} alt={product.name} loading={priority&&index===0?'eager':'lazy'}/><strong>{product.name}</strong><small>{formatMoney(product.price)}</small></a>)}</div><SelectionSet products={products.slice(0,4)} onAdd={onAdd} title="Masana ne lazım?"/></div></div>;
  return <div className="shell original-showcase original-showcase--gallery"><div className="original-gallery-title">{heading}<span className="original-gallery-edition">SEÇKİ<br/>/ 01</span></div>{first&&<div className="original-gallery-object"><a href={productHref(first)} className="original-gallery-object-photo"><img src={imageOf(first)} alt={first.name} loading={priority?'eager':'lazy'}/><span>01<ArrowUpRight size={30}/></span></a><div className="original-gallery-object-copy"><span className="original-eyebrow">{first.brand}</span><h3>{first.name}</h3><p>{first.description||first.features?.[0]}</p><strong>{formatMoney(first.price)}</strong><a href={productHref(first)}>Objeyi incele<ArrowRight size={18}/></a></div></div>}</div>;
}

export function OriginalCategories({family,block,document,categories=[],products=[]}) {
  const hasHeading=block.title||block.kicker||block.description||block.buttonText||block.secondaryText;
  return <div className={`shell original-category-section original-category-section--${family}`}>{hasHeading&&<div className="original-section-heading"><Heading block={block}/><Actions {...{block,document}}/></div>}<div className={`original-category-system original-category-system--${family}`}>{categories.map((category,index)=>{
    const items=categoryProducts(category,products);const product=items[0];const image=category.imageUrl||category.bannerUrl||imageOf(product);
    return <a key={category.id} data-visual-category-id={category.id} href={hrefOfCategory(category)}><span className="original-category-index">{String(index+1).padStart(2,'0')}</span>{image&&<img data-visual-category-part="image" src={image} alt="" loading="lazy"/>}<span className="original-category-name"><strong data-visual-category-part="text">{nameOfCategory(category)}</strong><small>{items.length || category.descendantVisibleProductCount || 0} ürün</small></span><ArrowUpRight size={family==='gallery'?29:21}/></a>;
  })}</div></div>;
}

export function OriginalCollection({family,block,document,products=[],favorites=new Set(),onFavorite,onAdd}) {
  const [selected,setSelected]=useState('all');
  const categoryKey=p=>String(p.department || p.categoryName || p.categoryId || 'Seçki');
  const categories=[...new Set(products.map(categoryKey))];
  const showTabs=['market','workspace'].includes(family)&&categories.length>1;
  useEffect(()=>setSelected('all'),[block.id,products.map(p=>p.id).join('|')]);
  const visible=selected==='all'?products:products.filter(p=>categoryKey(p)===selected);
  return <div className={`shell original-collection original-collection--${family}`}><div className="original-section-heading"><Heading block={block}/><Actions {...{block,document}}/></div>{showTabs&&<div className="original-department-tabs" role="group" aria-label="Ürün seçkisini filtrele">{['all',...categories].map(category=><button type="button" key={category} aria-pressed={selected===category} onClick={()=>setSelected(category)}>{category==='all'?'Tüm seçki':category}<span>{category==='all'?products.length:products.filter(p=>categoryKey(p)===category).length}</span></button>)}</div>}<div className={`original-product-grid original-product-grid--${family}`} data-product-count={visible.length}>{visible.map((product,index)=><div className="original-product-slot" key={product.id}>{family==='gallery'&&<span className="original-slot-number">SEÇKİ / {String(index+1).padStart(2,'0')}</span>}<CustomerProductCard {...{product,family,onFavorite,onAdd}} favorite={favorites.has(product.id)}/></div>)}</div>{!visible.length&&<p className="original-empty">Bu seçkide henüz ürün yok.</p>}</div>;
}

export function OriginalStory({family,block,document,products=[],onAdd}) {
  if(family==='living')return <div className="shell original-story original-story--living"><div className="original-story-cover"><Cover block={block} fallback={imageOf(products[0])}/></div><div><Heading block={block}/><Actions {...{block,document}}/><div className="original-story-linked-products">{products.slice(0,2).map(product=><ProductLink key={product.id} product={product}/>)}</div></div></div>;
  if(family==='workspace')return <div className="shell original-story original-story--workspace"><div><Heading block={block}/><Actions {...{block,document}}/></div><SelectionSet products={products.slice(0,4)} onAdd={onAdd} title="Kurulum seçkini tamamla"/></div>;
  if(family==='fashion')return <div className="shell original-story original-story--fashion"><div className="original-story-title"><Heading block={block}/><Actions {...{block,document}}/></div><div className="original-story-fashion-products">{products.slice(0,2).map((product,index)=><a href={productHref(product)} key={product.id}><img src={imageOf(product)} alt={product.name} loading="lazy"/><span><small>{String(index+1).padStart(2,'0')}</small><strong>{product.name}</strong><ArrowUpRight size={22}/></span></a>)}</div></div>;
  if(family==='market')return <div className="shell original-story original-story--market"><div><Heading block={block}/><Actions {...{block,document}}/></div><div className="original-market-story-products">{products.slice(0,3).map(product=><ProductLink key={product.id} product={product}/>)}</div></div>;
  if(family==='tech')return <div className="shell original-story original-story--tech"><div><Heading block={block}/><Actions {...{block,document}}/></div><div className="original-tech-comparison-list">{products.slice(0,3).map(product=><a href={productHref(product)} key={product.id}><img src={imageOf(product)} alt="" loading="lazy"/><h3>{product.name}</h3><dl>{specificationPairs(product).slice(0,3).map(([label,value])=><div key={label+value}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><strong>{formatMoney(product.price)}</strong><span>İncele<ArrowUpRight size={17}/></span></a>)}</div></div>;
  return <div className="shell original-story original-story--gallery"><div className="original-story-cover"><Cover block={block} fallback={imageOf(products[0])}/></div><div><span className="original-gallery-story-number">02</span><Heading block={block}/><Actions {...{block,document}}/>{products[0]&&<ProductLink product={products[0]}/>}</div></div>;
}
