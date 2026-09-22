import { createStorefrontHttp } from './storefrontHttp.js';
import { createReviewCatalogAdapter } from '../adapters/reviewCatalogAdapter.js';
import { createBusinessIdentityAdapter } from '../adapters/businessIdentityAdapter.js';
import { createLegalAdapter } from '../adapters/legalAdapter.js';
import { configureRuntimeCatalog } from './runtimeCatalog.js';
import { assertProductVariant, cartIdentity, cartLineKey } from '../adapters/variantContract.js';

const CART_KEY = 'novastore_public_review_cart_v1';
const FAVORITES_KEY = 'novastore_public_review_favorites_v1';
const unavailable = async () => { throw Object.assign(new Error('Bu hizmet yayına hazırlık aşamasındadır. Destek için iletişim sayfasını kullanabilirsiniz.'), {code:'PUBLIC_REVIEW_UNAVAILABLE'}); };
const readArray = (storage,key) => { try {const value=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(value)?value:[];} catch {return [];} };

export function createPublicReviewRuntime({root=globalThis, storage=root.localStorage, fetchImpl=root.fetch?.bind(root), location=root.location}={}) {
  // Review browsing never sends an existing account credential or writes shared state.
  const http=createStorefrontHttp({fetchImpl:(url,options)=>fetchImpl(url,{...options,credentials:'omit'}),storage:null,eventTarget:root,origin:location.origin});
  const initialize=async ({signal,allowUnavailableCatalog=false}={})=>{
    const businessIdentity=await createBusinessIdentityAdapter(http).load({signal});
    if (businessIdentity.reviewRelease!==true) throw new Error('Yayına hazırlık bilgileri doğrulanamadı.');
    const adapter=createReviewCatalogAdapter(http,{legacyAuthority:businessIdentity.catalogAuthority});
    const catalog=await adapter.load({signal,cursorPagination:true}).catch(error=>{
        if (!allowUnavailableCatalog || signal?.aborted) throw error;
        return {categories:[],products:[],collections:[],collectionDetails:[],navigation:{items:[]},warnings:['Katalog şu anda alınamıyor.']};
      });
    const products=new Map(catalog.products.map(product=>[product.id,product]));
    const listeners=new Set();let version=0;
    const register=items=>{items.forEach(product=>products.set(product.id,product));configureRuntimeCatalog({...catalog,products:[...products.values()]});version++;listeners.forEach(listener=>listener());return items;};
    register(catalog.products);
    const compact=items=>{
      if (!Array.isArray(items) || items.length>100) throw new Error('Sepet bilgisi geçersiz.');
      const lines=new Map();
      for(const item of items) {
        const {productId,variantId}=cartIdentity(item);const product=products.get(productId);
        if(!product || !Number.isSafeInteger(item.quantity) || item.quantity<1 || item.quantity>20) continue;
        const variant=assertProductVariant(product,variantId);
        const quantity=Math.min(item.quantity,variant?.availableStock??product.stock);
        if(quantity>0) lines.set(cartLineKey(item),{productId,...(variantId?{variantId}:{}),quantity});
      }
      return [...lines.values()];
    };
    let cartItems;try{cartItems=compact(readArray(storage,CART_KEY));}catch{cartItems=[];}
    let favorites=new Set(readArray(storage,FAVORITES_KEY).filter(id=>products.has(id)));
    const persist=async items=>{cartItems=compact(items);storage.setItem(CART_KEY,JSON.stringify(cartItems));return cartItems;};
    const runtimeCatalog={...catalog,
      subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},version:()=>version,
      loadProduct:async (id,options={})=>{const product=await adapter.loadProduct(id,{catalog,signal:options.signal});if(!options.signal?.aborted)register([product]);return product;},
      loadPage:async query=>{const page=await adapter.loadPage({...query,catalog});if(!query?.signal?.aborted)register(page.items);return page;},
      loadFilters:adapter.loadFilters,
      loadCollection:async (slug,options={})=>{const result=await adapter.loadCollection(slug,{catalog,signal:options.signal});if(!options.signal?.aborted)register(result.products);return result;},
    };
    return Object.freeze({catalog:runtimeCatalog,businessIdentity,legal:createLegalAdapter(http),reviewMode:true,
      session:{status:'guest',user:null,warning:null},warnings:catalog.warnings||[],readOnlyPreview:false,
      favorites:{initialIds:favorites,set:async (id,value)=>{if(!products.has(id))throw new Error('Ürün bulunamadı.');value?favorites.add(id):favorites.delete(id);storage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));return new Set(favorites);}},
      cart:{initialItems:cartItems,persist,subscribe:()=>()=>{},handoffToCheckout:async items=>{await persist(items);location.hash='#/odeme/teslimat';}},
      auth:{openAccount:()=>{location.hash='#/giris';}},
      customer:{},checkout:{},
      community:{reviewOnly:true},
      publicStore:{load:async()=>{throw Object.assign(new Error('Mağaza bilgileri yayına hazırlık aşamasındadır.'),{code:'PUBLIC_STORE_UNAVAILABLE',status:503});},follow:{load:unavailable,set:unavailable}},
      assistant:{getCapability:async()=>({available:false,provider:{configured:false,ready:false},modes:[],defaultModeId:null,advancedModesAvailable:false,modeSelectionAvailable:false,unavailableReason:'Yayına hazırlık aşamasında'}),chat:unavailable,escalate:unavailable},
      refreshCustomerState:async()=>({favoriteIds:new Set(favorites),cartItems}),
    });
  };
  return Object.freeze({initialize});
}
