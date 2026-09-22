import {validOrder} from '../sandbox/studio/previewOrder.js';
export function previewPageBlocks(document,key) {
  if(key==='home')return document.blocks;
  if(key?.startsWith('template:'))return document.templates[key.slice(9)]?.blocks;
  if(key?.startsWith('page:'))return document.pages.find(page=>page.id===key.slice(5))?.blocks;
  return undefined;
}
const labels={category:'Kategori',product:'Ürün detayı',search:'Arama',cart:'Sepet',account:'Hesabım',support:'Yardım merkezi'};
export const APP_TABS={home:{label:'Ana sayfa',href:'#/'},categories:{label:'Kategoriler',href:'#/kategoriler'},favorites:{label:'Favoriler',href:'#/favoriler'},cart:{label:'Sepet',href:'#/sepet'},support:{label:'Destek',href:'#/yardim'},account:{label:'Hesabım',href:'#/hesabim'}};
export function appTabForRoute(route){return ['category','categories','search','product'].includes(route.type)?'categories':route.type==='page'||route.type==='unavailable'?null:route.type;}
export function productsForRoute(route,catalog){
  if(route.type==='category'){
    if(!catalog.categories.some(category=>String(category.id)===String(route.categoryId)))return [];
    const ids=new Set([String(route.categoryId)]);
    // Bounded traversal over the already scoped catalog; no inferred outside IDs.
    for(let i=0;i<catalog.categories.length;i++)for(const category of catalog.categories)if(ids.has(String(category.parentId)))ids.add(String(category.id));
    return catalog.products.filter(product=>[product.categoryId,...(product.categoryIds||[])].some(id=>ids.has(String(id))));
  }
  if(route.type==='search')return catalog.products.filter(product=>`${product.name} ${product.brand||''}`.toLocaleLowerCase('tr').includes((route.query||'').toLocaleLowerCase('tr')));
  return catalog.products;
}
export function routeForPage(pageKey,document,catalog) {
  if(pageKey==='home')return {type:'home',pageKey,title:'Ana sayfa'};
  if(pageKey?.startsWith('page:')){const page=document.pages.find(item=>item.id===pageKey.slice(5));return page?{type:'page',pageKey,page,title:page.title}: {type:'unavailable',pageKey:'home',title:'Sayfa bulunamadı'};}
  const type=pageKey?.slice(9);
  if(type==='product'&&catalog.products[0])return {type,pageKey,productId:catalog.products[0].id,title:catalog.products[0].name};
  if(type==='product')return {type:'unavailable',pageKey,title:'Bu kapsamda ürün bulunamadı'};
  if(type==='category'){const category=catalog.categories[0];return category?{type,pageKey,categoryId:category.id,title:category.name}:{type:'categories',pageKey,title:'Tüm kategoriler'};}
  return {type:labels[type]?type:'unavailable',pageKey:labels[type]?pageKey:'home',title:labels[type]||'Sayfa bulunamadı'};
}
export function routeForHref(href,document,catalog) {
  if(typeof href!=='string'||!href.startsWith('#/')||href.length>1000)return null;
  const [rawPath,query='']=href.slice(1).split('?');let pathname;try{pathname=decodeURIComponent(rawPath);}catch{return null;}
  const parts=pathname.split('/').filter(Boolean),key=parts.slice(1).join('/');
  if(parts.length===0||pathname==='/home')return routeForPage('home',document,catalog);
  if(parts[0]==='urun'){const product=catalog.products.find(item=>String(item.id)===key||item.slug===key);return product?{type:'product',pageKey:'template:product',productId:product.id,title:product.name}:{type:'unavailable',pageKey:'template:product',title:'Bu kapsamda ürün bulunamadı'};}
  if(parts[0]==='kategori'){const category=catalog.categories.find(item=>String(item.id)===key||item.canonicalPath===key||item.path===key);return category?{type:'category',pageKey:'template:category',categoryId:category.id,title:category.name}:{type:'unavailable',pageKey:'template:category',title:'Bu kapsamda kategori bulunamadı'};}
  if(parts[0]==='kategoriler')return {type:'categories',pageKey:'template:category',title:'Tüm kategoriler'};
  if(parts[0]==='sayfa'){const page=document.pages.find(item=>item.enabled!==false&&(item.id===key||item.slug===key));return page?{type:'page',pageKey:`page:${page.id}`,page,title:page.title}:{type:'unavailable',pageKey:'home',title:'Sayfa bulunamadı'};}
  if(parts[0]==='arama')return {type:'search',pageKey:'template:search',title:'Arama sonuçları',query:new URLSearchParams(query).get('q')||''};
  if(parts[0]==='favoriler')return {type:'favorites',pageKey:'template:account',title:'Favorilerim'};
  const type={sepet:'cart',hesabim:'account',giris:'account',yardim:'support',destek:'support'}[parts[0]];
  if(type)return routeForPage(`template:${type}`,document,catalog);
  return {type:'unavailable',pageKey:'home',title:'Bu işlem tasarım önizlemesinde kullanılamıyor'};
}
export function trustedPreviewOrder(event,{origin,parent,channel,document}) {
  if(event.origin!==origin||event.source!==parent)return undefined;
  const data=event.data;if(data?.type!=='novastore-studio-preview-order'||data.channel!==channel)return undefined;
  if(data.order===null)return null;
  const blocks=previewPageBlocks(document,data.pageKey);
  return blocks&&validOrder(blocks,data.order)?{pageKey:data.pageKey,order:[...data.order]}:undefined;
}
