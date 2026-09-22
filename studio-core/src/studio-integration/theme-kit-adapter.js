import registry from '../../../theme-platform/presentations.json' with {type:'json'};

export function trustedPresentation(value,channel='web'){
 if(!value||typeof value!=='object')return null;
 return registry.presentations.find(entry=>entry.id===value.id&&entry.version===value.version&&entry.digest===value.digest&&entry.channels.includes(channel==='android'?'app':channel))||null;
}
export function readonlyThemeRuntime(catalog){
 const denied=()=>Promise.reject(Object.assign(Error('Bu tasarım önizlemesi alışveriş kaydı oluşturmaz.'),{code:'READ_ONLY'}));
 const canonical={...catalog,products:catalog.products.map(product=>({...product,requiresVariantSelection:product.requiresVariantSelection===true||product.variant_selection_required===true}))};
 return {initialize:async()=>({catalog:canonical,readOnlyPreview:true,session:{status:'guest'},cart:{initialItems:[],persist:denied,handoffToCheckout:denied,subscribe:()=>()=>{}},favorites:{initialIds:[],set:denied},auth:{openAccount:denied}})};
}
export function canonicalProductRoute(product){const id=Number(product?.productId??product?.hostProductId??product?.id??product);if(!Number.isSafeInteger(id)||id<1)throw Error('Ürün kimliği doğrulanmadı.');return `#/product/${id}`;}
export function classicTargetURL(target,catalog={products:[],categories:[]}){
 const simple={home:'#/home',categories:'#/catalog',search:'#/catalog',cart:'#/cart',account:'#/account',support:'#/support',favorites:'#/favorites'};
 if(Object.hasOwn(simple,target))return simple[target];
 if(/^product:[1-9][0-9]*$/.test(target)){const product=catalog.products.find(item=>String(item.id)===target.slice(8));return product?canonicalProductRoute(product):null;}
 if(/^category:[a-zA-Z0-9_-]+$/.test(target)){const category=catalog.categories.find(item=>String(item.id)===target.slice(9));return category?'#/catalog?category='+encodeURIComponent(category.name):null;}
 return null;
}
export function themeTokens(document){const t=document.theme,h=document.chrome.header,f=document.chrome.footer,font=({Arial:'Arial,Helvetica,sans-serif',Inter:'Inter,Arial,sans-serif',Georgia:'Georgia,serif',system:'system-ui,sans-serif'}[t.fontFamily]||'Arial,Helvetica,sans-serif');return {'--primary':t.accent,'--accent':t.accent,'--on-primary':'#fff','--bg':t.background,'--surface':t.surface,'--ink':t.text,'--muted':t.muted,'--border':t.border,'--radius':`${t.radius}px`,'--button-radius':`${t.radius===0?2:Math.min(t.radius,12)}px`,'--display-font':font,'--body-font':font,'--classic-header-bg':h.background,'--classic-header-ink':h.textColor,'--classic-footer-bg':f.background,'--classic-footer-ink':f.textColor};}
export function classicPageKey(route){return ({home:'home',catalog:'template:category',product:'template:product',cart:'template:cart',account:'template:account',orders:'template:account',support:'template:support',help:'template:support',favorites:'template:account'}[route?.name]||'home');}
export function classicRouteForPage(pageKey,catalog){if(pageKey==='template:product')return catalog.products[0]?`#/product/${catalog.products[0].id}`:'#/catalog';return ({home:'#/home','template:category':'#/catalog','template:search':'#/catalog','template:cart':'#/cart','template:account':'#/account','template:support':'#/support'}[pageKey]||'#/home');}
