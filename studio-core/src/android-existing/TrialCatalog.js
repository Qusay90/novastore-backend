// Local V4.13 fixtures, shared with the design editor; this is not a live catalog.
import {resolveVisualCategory} from '../sandbox/visualDesign.js';
import {getCurrentMerchant,isUnknownMerchant} from '../sandbox/merchantWorkspaces.js';
import {resolveCatalogFamily} from '../sandbox/merchantDesign.js';
import {getSectorCatalog} from '../sandbox/sectorCatalog.js';

const sectorFamilies=['tech','living','fashion','market','workspace','gallery','beauty','sport','kids'];
function toAndroidProduct(product,catalog,parent) {
  const source=parent?{...parent,...product}:product;
  const category=catalog.categories.find(category=>category.id===source.categoryId);
  const amount=Number(source.price)||0,oldAmount=Number(source.oldPrice)||0;
  const specs=(source.specs||[]).map(item=>Array.isArray(item)?item:[item.label,String(item.value)]);
  for(const [label,value] of [['Rutin adımı',source.routineStep],['Cilt tipi',source.skinType],['Aktivite',source.activity],['Yaş grubu',source.ageGroup],['Oyun alanı',source.learningArea]]) {
    if(value&&!specs.some(([name])=>name===label))specs.push([label,String(value)]);
  }
  const sizes=parent?[]:source.choices?.sizes||[];
  return {id:String(source.id),slug:source.slug,name:source.name,store:source.brand||catalog.name||'NovaStore',brand:source.brand||'NovaStore',price:`₺${amount.toLocaleString('tr-TR',{minimumFractionDigits:Number.isInteger(amount)?0:2,maximumFractionDigits:2})}`,old:oldAmount>amount?`₺${oldAmount.toLocaleString('tr-TR',{minimumFractionDigits:Number.isInteger(oldAmount)?0:2,maximumFractionDigits:2})}`:undefined,amount,oldAmount:oldAmount>amount?oldAmount:undefined,image:source.imageUrl,images:[...new Set([source.imageUrl,...(source.media||[]).map(item=>typeof item==='string'?item:item.url)].filter(Boolean))],stock:Number(source.stock)||0,isPurchasable:Number(source.stock)>0,rating:0,reviewCount:0,badge:oldAmount>amount?`%${Math.round((1-amount/oldAmount)*100)}`:undefined,sectorFamily:catalog.family,categoryId:source.categoryId,categoryName:category?.name||source.categoryId,features:source.features||[],specs,description:source.description||`${source.name}. ${specs.map(([label,value])=>`${label}: ${value}`).join('. ')}.`,choices:sizes.length?[{label:'Beden',options:sizes}]:[],variants:source.variants||[],unit:source.unit||'adet',parentId:parent?String(parent.id):source.parentId?String(source.parentId):undefined,size:source.size};
}
export function androidSectorCatalog(document){const catalog=getSectorCatalog(resolveCatalogFamily(document));return catalog?{...catalog,categories:catalog.categories.map(category=>resolveVisualCategory(document?.design,category))}:null;}
const sectorPools=sectorFamilies.flatMap(family=>{const catalog=getSectorCatalog(family);if(!catalog)return [];const parents=catalog.products.map(product=>toAndroidProduct(product,catalog));const variants=(catalog.variants||[]).map(variant=>toAndroidProduct(variant,catalog,catalog.products.find(parent=>String(parent.id)===String(variant.parentId))));return [...parents,...variants];});
export const ANDROID_SECTOR_PRODUCTS=sectorPools.filter(product=>!product.parentId);
export function androidCatalogProducts(original,document){if(isUnknownMerchant())return [];const family=resolveCatalogFamily(document);return getSectorCatalog(family)?ANDROID_SECTOR_PRODUCTS.filter(product=>product.sectorFamily===family).map(merchantProduct):original;}
function merchantProduct(product){const merchant=getCurrentMerchant();return merchant?{...product,store:merchant.name,storeSlug:merchant.slug}:product;}
export function androidProductPool(original){if(isUnknownMerchant())return [];const merchant=getCurrentMerchant();return merchant ? sectorPools.filter(product=>product.sectorFamily===merchant.catalogFamily).map(merchantProduct) : [...original,...sectorPools];}

export const ANDROID_DESIGN_PRODUCTS = [
  {id:'pulse-anc',name:'Nova Pulse ANC Kulaklık',categoryId:'electronics',price:'₺4.299',imageUrl:'/calibration-assets/generated/nova-pulse-anc-ivory-v1.png'},
  {id:'sound-n1',name:'NovaSound N1 Kulaklık',categoryId:'electronics',price:'₺1.299',imageUrl:'/calibration-assets/extracts/order-headphones.png'},
  {id:'travel-case',name:'Nova Seyahat Valizi',categoryId:'fashion',price:'₺3.249',imageUrl:'/calibration-assets/extracts/product-luggage-clean.png'},
  {id:'barista-pro',name:'Nova Barista Pro',categoryId:'home-living',price:'₺7.899',imageUrl:'/calibration-assets/extracts/product-coffee-clean.png'},
  {id:'pulse-studio',name:'Nova Pulse Studio',categoryId:'electronics',price:'₺3.699',imageUrl:'/calibration-assets/generated/nova-pulse-anc-ivory-v1.png'},
  {id:'sound-air-2',name:'NovaSound Air 2',categoryId:'electronics',price:'₺2.149',imageUrl:'/calibration-assets/extracts/order-headphones.png'},
  {id:'cabin-light',name:'Nova Cabin Light',categoryId:'fashion',price:'₺2.849',imageUrl:'/calibration-assets/extracts/product-luggage-clean.png'},
  {id:'barista-mini',name:'Nova Barista Mini',categoryId:'home-living',price:'₺5.499',imageUrl:'/calibration-assets/extracts/product-coffee-clean.png'},
  {id:'pulse-office',name:'Nova Pulse Office',categoryId:'electronics',price:'₺3.999',imageUrl:'/calibration-assets/generated/nova-pulse-anc-ivory-v1.png'},
  {id:'sound-move',name:'NovaSound Move',categoryId:'electronics',price:'₺1.899',imageUrl:'/calibration-assets/extracts/order-headphones.png'},
  {id:'travel-pro',name:'Nova Travel Pro',categoryId:'fashion',price:'₺4.149',imageUrl:'/calibration-assets/extracts/product-luggage-clean.png'},
  {id:'barista-touch',name:'Nova Barista Touch',categoryId:'home-living',price:'₺8.299',imageUrl:'/calibration-assets/extracts/product-coffee-clean.png'},
  ...ANDROID_SECTOR_PRODUCTS.map(({id,name,categoryId,price,image})=>({id,name,categoryId,price,imageUrl:image})),
];

export function selectAndroidProducts(products, block) {
  const source=block.productSource || {mode:'all'};
  let selected=products;
  if(source.mode==='selected') {
    const byId=new Map(products.map(product=>[product.id,product]));
    selected=[...new Set(source.productIds || [])].map(id=>byId.get(id)).filter(Boolean);
  } else if(source.mode==='category') {
    const category=({living:'home-living',sport:'sports-outdoor'}[source.categoryId] || source.categoryId);
    const ids=new Set(ANDROID_DESIGN_PRODUCTS.filter(product=>product.categoryId===category).map(product=>product.id));
    selected=products.filter(product=>ids.has(product.id)||product.categoryId===category);
  }
  const requested=Number(block.productLimit);
  const limit=Number.isFinite(requested)&&requested>0 ? Math.max(1,Math.min(24,Math.floor(requested))) : 24;
  return selected.slice(0,limit);
}

export function androidThemeFamily(document) {
  const family=document?.theme?.family;
  return ['nova-commerce','pocket','workspace','gallery','tech','living','fashion','market','beauty','sport','kids'].includes(family) ? family : 'pocket';
}

export function androidContrastText(background) {
  const color=String(background||'').replace('#','');
  const hex=color.length===3?color.split('').map(char=>char+char).join(''):color;
  if(!/^[0-9a-f]{6}$/i.test(hex))return '#ffffff';
  const values=[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(value=>value<=.04045?value/12.92:Math.pow((value+.055)/1.055,2.4));
  const luminance=.2126*values[0]+.7152*values[1]+.0722*values[2];
  return (luminance+.05)/.05>1.05/(luminance+.05)?'#000000':'#ffffff';
}
