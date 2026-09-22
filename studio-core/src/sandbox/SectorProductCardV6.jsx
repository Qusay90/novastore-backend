import {useContext,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Check,ChevronLeft,ChevronRight,GitCompareArrows,Image,LoaderCircle,Minus,Plus,ShoppingBag} from 'lucide-react';
import {RuntimeComparisonContext} from '../storefront/src/integration/RuntimeComparisonContext.jsx';
import {CustomerFavoriteButton} from '../storefront/src/CustomerFavoriteButton.jsx';
import {resolveCustomerCardMedia} from '../storefront/src/customerProductCardModel.js';
import productCardFraming from '../shared/productCardFraming.js';

const moneyFormat=new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2,maximumFractionDigits:2});
export const v6Money=value=>moneyFormat.format(Number(value)||0);
export const v6ProductImage=product=>resolveCustomerCardMedia(product)[0]?.url||'';
export const v6ProductHref=product=>`#/urun/${product.slug}`;
export function v6Specs(product){const source=product?.specs||product?.specifications||[];return Array.isArray(source)?source.map(item=>typeof item==='string'?{label:'',value:item}:{label:item.label||item.name||'',value:item.value}).filter(item=>item.value):Object.entries(source).map(([label,value])=>({label,value}));}
export function v6SpecValue(product,labels){const match=v6Specs(product).find(item=>labels.some(label=>String(item.label).toLocaleLowerCase('tr-TR').includes(label)));return match?.value||'';}
export function v6ProductGroup(product,family){
  if(family==='beauty')return product.routineStep||product.department||'Bakım';
  if(family==='sport')return product.activity||product.department||'Açık hava';
  return product.ageGroup||product.ageRange||v6SpecValue(product,['yaş'])||product.department||'Oyun ve keşif';
}

export function SectorProductCardV6({product,brand=product?.brand||'NovaStore',family=product?.family||'beauty',favorite=false,onFavorite,onAdd,mediaFallback=null,previewMode=false,className=''}){
  const comparison=useContext(RuntimeComparisonContext);
  const media=useMemo(()=>resolveCustomerCardMedia(product,mediaFallback),[product,mediaFallback]);
  const [mediaIndex,setMediaIndex]=useState(0),[quantity,setQuantity]=useState(1),[variantId,setVariantId]=useState(''),[phase,setPhase]=useState('idle'),[notice,setNotice]=useState('');
  const pending=useRef(false),timeout=useRef(null);
  const variants=Array.isArray(product.variants)?product.variants:[];
  const variant=variants.find(item=>String(item.id)===variantId);
  const needsVariant=variants.length>0&&!variant;
  const stock=Math.max(0,Number(variant?.stock??product.stock)||0),soldOut=stock===0;
  const price=Number(variant?.price??product.price)||0,oldPrice=Number(variant?.oldPrice??product.oldPrice)||0;
  const discount=oldPrice>price?Math.round((1-price/oldPrice)*100):0;
  const specs=v6Specs(product),group=v6ProductGroup(product,family),href=v6ProductHref(product);
  const compared=comparison.ids.has(product.id);
  useEffect(()=>{setMediaIndex(0);setQuantity(1);setVariantId('');setPhase('idle');setNotice('');pending.current=false;window.clearTimeout(timeout.current);},[product.id]);
  useEffect(()=>()=>window.clearTimeout(timeout.current),[]);
  useEffect(()=>setQuantity(value=>Math.min(Math.max(1,stock),value)),[stock]);
  async function add(){
    if(pending.current||soldOut||needsVariant||typeof onAdd!=='function')return;
    window.clearTimeout(timeout.current);pending.current=true;setPhase('pending');setNotice('');
    try{const result=await onAdd(variant?.id??product.id,quantity);if(result===false){setPhase('idle');setNotice('Ürün eklenemedi. Stok durumunu kontrol et.');return;}setPhase('success');setNotice(`${product.name} sepete eklendi.`);timeout.current=window.setTimeout(()=>setPhase('idle'),1300);}
    catch{setPhase('idle');setNotice('Ürün eklenemedi. Yeniden deneyebilirsin.');}
    finally{pending.current=false;}
  }
  async function compare(){if(!comparison.available)return;try{await comparison.toggle(product.id);}catch{setNotice('Karşılaştırma güncellenemedi.');}}
  const main=media[Math.min(mediaIndex,Math.max(0,media.length-1))];
  const image=main?<img className="os-product-image" src={main.url} alt={product.name} loading="lazy" decoding="async" style={{...productCardFraming.cardFramingPresentation(main.cardFraming),objectFit:'contain'}}/>:<span className="v6-card-media-empty"><Image size={30}/><small>Görsel hazırlanıyor</small></span>;
  const mediaBlock=<div className="v6-product-media">{previewMode?<span className="v6-product-photo">{image}</span>:<a className="v6-product-photo" href={href} aria-label={`${product.name} detayını aç`}>{image}</a>}{(soldOut||discount>0)&&<span className="v6-product-badge">{soldOut?'Tükendi':`%${discount}`}</span>}{!previewMode&&typeof onFavorite==='function'&&<CustomerFavoriteButton {...{favorite,onFavorite}} productId={product.id} productName={product.name} className="v6-favorite"/>}{media.length>1&&<div className="v6-card-media-controls"><button type="button" aria-label={`${product.name} önceki görsel`} disabled={mediaIndex===0} onClick={()=>setMediaIndex(index=>Math.max(0,index-1))}><ChevronLeft size={15}/></button><span aria-live="polite">{mediaIndex+1} / {media.length}</span><button type="button" aria-label={`${product.name} sonraki görsel`} disabled={mediaIndex===media.length-1} onClick={()=>setMediaIndex(index=>Math.min(media.length-1,index+1))}><ChevronRight size={15}/></button></div>}</div>;
  const title=<h3 className="os-product-title">{previewMode?product.name:<a href={href}>{product.name}</a>}</h3>;
  const priceBlock=<div className="v6-product-price"><strong className="os-product-price">{v6Money(price)}</strong>{oldPrice>price&&<del>{v6Money(oldPrice)}</del>}</div>;
  const variantControls=!previewMode&&variants.length>0&&<fieldset className="v6-card-variants"><legend>{variants.some(item=>item.size)?'Beden seçimi':'Ürün seçeneği'}</legend>{variants.map(item=><button type="button" key={item.id} aria-pressed={variantId===String(item.id)} disabled={Number(item.stock)<=0||phase==='pending'} onClick={()=>{setVariantId(String(item.id));setNotice('');}}>{item.size||item.label||item.name||item.value}</button>)}</fieldset>;
  const quantityControl=!previewMode&&family==='sport'&&<div className="v6-quantity"><button type="button" aria-label={`${product.name} adedini azalt`} disabled={quantity<=1||phase==='pending'||soldOut} onClick={()=>setQuantity(value=>Math.max(1,value-1))}><Minus size={14}/></button><span aria-live="polite">{quantity}</span><button type="button" aria-label={`${product.name} adedini artır`} disabled={quantity>=stock||phase==='pending'||soldOut} onClick={()=>setQuantity(value=>Math.min(stock,value+1))}><Plus size={14}/></button></div>;
  const controls=previewMode?<p className="v6-card-preview-note">Ürün önizlemesi</p>:<div className="v6-product-controls"><button type="button" className="v6-compare" aria-label={`${product.name} ürününü ${compared?'karşılaştırmadan çıkar':'karşılaştır'}`} aria-pressed={compared} disabled={!comparison.available} onClick={compare}><GitCompareArrows size={17}/></button><button type="button" className={`v6-card-add os-product-add is-${phase}`} disabled={soldOut||needsVariant||phase==='pending'||typeof onAdd!=='function'} onClick={add} aria-label={`${product.name}${variant?.size?` ${variant.size} beden`:''}: ${soldOut?'stokta yok':needsVariant?'önce seçenek belirle':'sepete ekle'}`} aria-busy={phase==='pending'||undefined}>{phase==='pending'?<LoaderCircle size={16}/>:phase==='success'?<Check size={17}/>:family==='beauty'?<Plus size={17}/>:family==='sport'?<ShoppingBag size={16}/>:<ArrowRight size={17}/>}<span>{soldOut?'Tükendi':needsVariant?'Seçenek seç':phase==='pending'?'Ekleniyor':phase==='success'?'Eklendi':'Sepete ekle'}</span></button></div>;
  const specList=<dl className="v6-card-specs">{specs.slice(0,family==='sport'?3:2).map(item=><div key={`${item.label}:${item.value}`}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>;
  let content;
  if(family==='beauty')content=<><div className="v6-beauty-card-top"><span>{group}</span><small>{product.unit&&product.unit!=='adet'?product.unit:v6SpecValue(product,['hacim','miktar'])}</small></div>{mediaBlock}<div className="v6-card-body"><span className="v6-product-brand">{brand}</span>{title}<p className="v6-card-description">{product.features?.[0]||''}</p>{specList}{variantControls}<div className="v6-card-buy">{priceBlock}{controls}</div></div></>;
  else if(family==='sport')content=<>{mediaBlock}<div className="v6-card-body"><div className="v6-sport-card-heading"><span>{group}</span><small>{soldOut?'Stokta yok':'Stokta'}</small></div>{title}{specList}{variantControls}<div className="v6-sport-card-bottom">{priceBlock}{quantityControl}{controls}</div></div></>;
  else content=<><div className="v6-kids-card-photo">{mediaBlock}<span className="v6-kids-age">{group}</span></div><div className="v6-card-body"><span className="v6-product-brand">{product.learningArea||v6SpecValue(product,['beceri','öğrenme','alan'])||brand}</span>{title}<p className="v6-card-description">{product.features?.[0]||''}</p>{specList}{variantControls}<div className="v6-card-buy">{priceBlock}{controls}</div></div></>;
  return <article className={`product-card customer-product-card os-product-card v6-product-card v6-product-card--${family}${className?` ${className}`:''}${soldOut?' is-sold-out':''}`} data-product-id={product.id} data-card-family={family}>{content}<span className="v6-sr-only" role="status">{notice}</span></article>;
}

export default SectorProductCardV6;
