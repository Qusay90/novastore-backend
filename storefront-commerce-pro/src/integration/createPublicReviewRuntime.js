import { createStorefrontHttp } from './storefrontHttp.js';
import { createReviewCatalogAdapter } from '../adapters/reviewCatalogAdapter.js';
import { createBusinessIdentityAdapter } from '../adapters/businessIdentityAdapter.js';
import { createLegalAdapter } from '../adapters/legalAdapter.js';
import { createAuthAdapter } from '../adapters/authAdapter.js';
import { createCustomerAccountAdapter } from '../adapters/customerAccountAdapter.js';
import { createCustomerHttp } from './customerHttp.js';
import { createProductCommunityAdapter } from '../adapters/productCommunityAdapter.js';
import { createPublicStoreAdapter } from '../adapters/publicStoreAdapter.js';
import { normalizePagination } from '../adapters/publicPagination.js';
import { configureRuntimeCatalog } from './runtimeCatalog.js';
import { assertProductVariant, cartIdentity, cartLineKey } from '../adapters/variantContract.js';

const CART_KEY = 'novastore_public_review_cart_v1';
const FAVORITES_KEY = 'novastore_public_review_favorites_v1';
const unavailable = async () => { throw Object.assign(new Error('Bu hizmet yayına hazırlık aşamasındadır. Destek için iletişim sayfasını kullanabilirsiniz.'), {code:'PUBLIC_REVIEW_UNAVAILABLE'}); };
const readArray = (storage,key) => { try {const value=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(value)?value:[];} catch {return [];} };

export function createPublicReviewRuntime({root=globalThis, storage=root.localStorage, fetchImpl=root.fetch?.bind(root), location=root.location}={}) {
  // Review browsing never sends an existing account credential or writes shared state.
  const http=createStorefrontHttp({fetchImpl:(url,options)=>fetchImpl(url,{...options,credentials:'omit'}),storage:null,eventTarget:root,origin:location.origin});
  const authHttp=createStorefrontHttp({fetchImpl,storage,eventTarget:root,origin:location.origin});
  const customerHttp=createCustomerHttp({fetchImpl,storage,eventTarget:root,origin:location.origin});
  const authAdapter=createAuthAdapter({http:authHttp,storage,location});
  const customer=createCustomerAccountAdapter({http:customerHttp,storage,eventTarget:root,allowLegacyAddressMigration:false});
  const communityAdapter=createProductCommunityAdapter({http:customerHttp});
  const storeAdapter=createPublicStoreAdapter(http);
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
      loadProduct:async (id,options={})=>{let product=await adapter.loadProduct(id,{catalog,signal:options.signal});try {const result=await http.request(`/api/public/review/products/${id}/store`,{signal:options.signal});const store=result?.store;if(store && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(store.slug||'')) && typeof store.name==='string' && store.name.trim()) product=Object.freeze({...product,store:{slug:store.slug,name:store.name}});} catch(error) {if(options.signal?.aborted)throw error;}if(!options.signal?.aborted)register([product]);return product;},
      loadPage:async query=>{const page=await adapter.loadPage({...query,catalog});if(!query?.signal?.aborted)register(page.items);return page;},
      loadFilters:adapter.loadFilters,
      loadCollection:async (slug,options={})=>{const result=await adapter.loadCollection(slug,{catalog,signal:options.signal});if(!options.signal?.aborted)register(result.products);return result;},
    };
    const session=await authAdapter.load({signal});
    return Object.freeze({catalog:runtimeCatalog,businessIdentity,legal:createLegalAdapter(http),reviewMode:true,
      session,warnings:catalog.warnings||[],readOnlyPreview:false,
      favorites:{initialIds:favorites,set:async (id,value)=>{if(!products.has(id))throw new Error('Ürün bulunamadı.');value?favorites.add(id):favorites.delete(id);storage.setItem(FAVORITES_KEY,JSON.stringify([...favorites]));return new Set(favorites);}},
      cart:{initialItems:cartItems,persist,subscribe:()=>()=>{},handoffToCheckout:async items=>{await persist(items);location.hash='#/odeme/teslimat';}},
      auth:{openAccount:()=>authAdapter.openAccount(session)},
      customer,checkout:{},
      community:{...communityAdapter,reviewRelease:true,loadQuestions:async(id,{signal,cursor}={})=>{const payload=await customerHttp.request(`/api/public/review/questions/${id}${cursor?`?cursor=${encodeURIComponent(cursor)}`:''}`,{signal});if(!Array.isArray(payload?.items))throw new Error('Sorular alınamadı.');return {items:payload.items.map(row=>({id:row.id,question:row.question,answer:row.answer,customerName:row.user_name,createdAt:row.created_at,answeredAt:row.answered_at,status:'answered'})),pagination:normalizePagination(payload.pagination)};},askQuestion:async(...args)=>{await communityAdapter.askQuestion(...args);return {mesaj:'Sorun NovaStore ekibine iletildi.'};}},
      publicStore:{load:async(slug,options={})=>{const result=await storeAdapter.load(slug,{...options,catalog,cursorPagination:true});if(!options.signal?.aborted)register(result.products);return result;},follow:{load:unavailable,set:unavailable}},
      assistant:{getCapability:async()=>({available:false,provider:{configured:false,ready:false},modes:[],defaultModeId:null,advancedModesAvailable:false,modeSelectionAvailable:false,unavailableReason:'Yayına hazırlık aşamasında'}),chat:unavailable,escalate:unavailable},
      refreshCustomerState:async()=>({favoriteIds:new Set(favorites),cartItems}),
    });
  };
  return Object.freeze({initialize});
}
