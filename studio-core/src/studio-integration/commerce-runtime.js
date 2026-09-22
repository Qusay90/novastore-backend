import {createCommerceHttp} from './commerce-http.js';
import {createCartV2Adapter} from './commerce-cart-v2.js';
import {createAuthAdapter} from './commerce-auth-base.js';
import {createCheckoutAdapter,normalizeQuote} from './commerce-checkout-base.js';
import {assertProductVariant,cartLineKey,normalizeVariantId,toPurchaseCartItems} from './commerce-variant-contract.js';
import {trustedPresentation} from './theme-kit-adapter.js';
import {nativeCatalog} from './catalog-adapter.js';

const fail=(code,message=code)=>Object.assign(new Error(message),{code});
const copy=value=>structuredClone(value);
const blank=()=>({phase:'idle',session:{status:'guest',user:null},catalog:{products:[],categories:[],collections:[]},cart:[],favorites:[],migration:{status:'NONE',unresolvedItems:[],localItems:[]},cartSync:{phase:'loading'},error:null});
const principal=storage=>String(storage?.getItem?.('nova_user_token')||'');
const positive=value=>{const id=normalizeVariantId(value);if(!id)throw fail('INVALID_REFERENCE');return id;};
const uuid=value=>{if(typeof value!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))throw fail('INVALID_REFERENCE');return value;};
const cursor=value=>{if(!Number.isSafeInteger(value)||value<1)throw fail('INVALID_REFERENCE');return value;};
// Only a server-resolved store may enable this runtime. Admin/Seller design
// previews use a different read-only runtime and never call this factory.
export function assertCustomerRuntimeContext(context){
 if(context?.commerceMode!=='SINGLE_STORE'||context?.customerRuntime?.enabled!==true||context.customerRuntime.contractVersion!==2||!trustedPresentation(context.presentation,'web'))throw fail('CUSTOMER_RUNTIME_NOT_READY','Bu mağazanın müşteri işlemleri henüz kullanıma açık değil.');
 return positive(context.customerRuntime.storeId);
}
export function scopedCommerceStorage(storage,storeId){
 const key=value=>value.startsWith('novastore_')?`theme-store:${positive(storeId)}:${value}`:value;
 return {getItem:name=>storage?.getItem?.(key(name))??null,setItem:(name,value)=>storage?.setItem?.(key(name),value),removeItem:name=>storage?.removeItem?.(key(name))};
}
export function createCustomerCommerceRuntime({fetchImpl=globalThis.fetch?.bind(globalThis),storage=globalThis.localStorage,root=globalThis,origin=root.location?.origin||'http://localhost',navigate=hash=>root.location?.assign?.(hash)}={}){
 let state=blank(),context=null,storeId=null,generation=0,disposed=false,adapter=null,unsubscribers=[],queue=Promise.resolve(),verifiedToken='';
 const listeners=new Set(),products=new Map(),cartMetadata=new Map();
 const emit=patch=>{state={...state,...patch};for(const listener of listeners)listener(copy({...state,context}));};
 const token=()=>principal(storage),capture=()=>({generation,token:token(),storeId});
 const current=stamp=>{if(disposed||stamp.generation!==generation||stamp.token!==token()||stamp.storeId!==storeId)throw fail('SHARED_STATE_PRINCIPAL_CHANGED','Müşteri oturumu değişti.');};
 const active=()=>{if(disposed||state.phase!=='ready'||!context)throw fail('CUSTOMER_RUNTIME_NOT_READY');};
 const authenticated=()=>{active();if(token()!==verifiedToken){emit({session:{status:'guest',user:null},cart:[],favorites:[],migration:blank().migration,cartSync:{phase:'blocked',code:'SESSION_CHANGED'}});throw fail('SHARED_STATE_PRINCIPAL_CHANGED');}if(state.session.status!=='authenticated'||!token())throw fail('CUSTOMER_SESSION_MISSING','Bu işlem için hesabına giriş yap.');};
 const http=createCommerceHttp({fetchImpl,storage,eventTarget:root,origin});
 const observedHttp={request:async(path,options)=>{const stamp=capture(),response=await http.request(path,options);current(stamp);if(/^\/api\/shared-state\/cart(?:\/finalize)?$/.test(path)&&response?.payload?.cartSchemaVersion===2){
  if(!Array.isArray(response.payload.items))throw fail('CART_RESPONSE_INVALID');for(const item of response.payload.items){if(item.storeId!==storeId)throw fail('CART_STORE_IDENTITY_MISMATCH');}
  cartMetadata.clear();for(const item of response.payload.items)cartMetadata.set(cartLineKey(item),copy(item));
 }return response;}};
 const publicRequest=async(path,{method='GET',body,signal}={})=>{
  if(!/^\/(?:context|categories|collections|legal(?:\/[a-z_-]{1,60})?|products(?:\/[1-9]\d*(?:\/(?:reviews|questions|recommendations))?)?(?:\?limit=100&offset=\d+)?|quote)$/.test(path)||!['GET','POST'].includes(method)||(method==='POST'&&path!=='/quote'))throw fail('CUSTOMER_PATH_FORBIDDEN');
  const stamp=capture(),response=await fetchImpl('/api/theme-storefront'+path,{method,credentials:'same-origin',cache:'no-store',signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const payload=await response.json();current(stamp);if(!response.ok)throw Object.assign(fail(payload.code||'STOREFRONT_UNAVAILABLE'),{status:response.status});return payload;
 };
 const scoped=async(path,options)=>{authenticated();const stamp=capture(),value=await http.store(path,options);current(stamp);return value;};
 const canonical=async(path,options)=>{authenticated();const stamp=capture(),value=await http.request(path,options);current(stamp);return value;};
 const cartRows=items=>items.map(item=>{if(item.storeId!==storeId)throw fail('CART_STORE_IDENTITY_MISMATCH');const metadata=cartMetadata.get(cartLineKey(item));return {...metadata,...item};});
 function release(){unsubscribers.forEach(fn=>fn());unsubscribers=[];adapter=null;products.clear();cartMetadata.clear();verifiedToken='';}
 async function refresh(){
  active();const stamp=capture(),auth=createAuthAdapter({http,storage,location:{assign:navigate}}),session=await auth.load();
  // An expired token may trigger the canonical auth-required event while /me is
  // in flight. Clearing to guest is safe; never reapply old account data.
  if(session.status==='guest'&&!token()&&!disposed&&stamp.storeId===storeId){verifiedToken='';emit({session,cart:[],favorites:[],migration:blank().migration,cartSync:{phase:'blocked',code:'CUSTOMER_SESSION_MISSING'}});return copy(state);}
  current(stamp);verifiedToken=token();
  emit({session,error:null,cart:[],favorites:[],migration:blank().migration});
  if(session.status!=='authenticated'){emit({cartSync:{phase:'blocked',code:'CUSTOMER_SESSION_MISSING'}});return copy(state);}
  try{
   const items=await adapter.load();current(stamp);const result=await http.store('/favorites');current(stamp);
   if(!Array.isArray(result.productIds)||result.productIds.some(id=>!normalizeVariantId(id)))throw fail('FAVORITES_RESPONSE_INVALID');
   emit({cart:cartRows(items),favorites:result.productIds,migration:adapter.getMigration(),cartSync:adapter.getSyncStatus()});return copy(state);
  }catch(error){current(stamp);emit({error:{code:error.code||'CUSTOMER_SYNC_FAILED',message:error.message},cartSync:{phase:'blocked',code:error.code}});throw error;}
 }
 async function initialize({signal}={}){
  if(disposed)throw fail('HOST_DISPOSED');generation++;release();state=blank();emit({phase:'loading'});
  const stamp=capture(),resolved=await publicRequest('/context',{signal});current(stamp);storeId=assertCustomerRuntimeContext(resolved);context=resolved;
  const loaded=[];let offset=0,total;
  do{const page=await publicRequest(`/products?limit=100&offset=${offset}`,{signal});if(!Array.isArray(page.products)||!Number.isSafeInteger(page.pagination?.total)||page.pagination.total<0||page.pagination.total>10000)throw fail('CATALOG_RESPONSE_INVALID');total=page.pagination.total;loaded.push(...page.products);if(!page.products.length&&loaded.length<total)throw fail('CATALOG_RESPONSE_INVALID');offset+=page.products.length;}while(loaded.length<total);
  const categories=await publicRequest('/categories',{signal}),collections=await publicRequest('/collections',{signal});
  const catalog=nativeCatalog({products:loaded,categories,collections});catalog.products.forEach(p=>products.set(Number(p.id),p));
  adapter=createCartV2Adapter({http:observedHttp,root:{},storage:scopedCommerceStorage(storage,storeId),getProduct:id=>products.get(Number(id)),location:{assign:navigate},checkoutPath:'#/checkout'});
  unsubscribers.push(adapter.subscribe(items=>{if(state.session.status==='authenticated')emit({cart:cartRows(items),migration:adapter.getMigration()});}),adapter.subscribeSync(cartSync=>emit({cartSync})));
  emit({phase:'ready',catalog});
  try{await refresh();}catch(error){
   // Catalog remains usable during a recoverable account/cart outage. Scope
   // or response-integrity failures still fail closed; no stale cache is used.
   if(!['CUSTOMER_NETWORK_ERROR','CUSTOMER_API_UNAVAILABLE','CART_STALE_RESPONSE','CART_REVISION_CONFLICT','CART_SYNC_FAILED'].includes(error.code)&&!(error.status>=500&&error.status<=599))throw error;
  }
  return runtime;
 }
 const serial=fn=>{const stamp=capture(),next=queue.catch(()=>{}).then(async()=>{current(stamp);authenticated();const value=await fn();current(stamp);return value;});queue=next;return next;};
 async function loadProduct(value,{signal}={}){active();const id=positive(value),product=await publicRequest(`/products/${id}`,{signal});if(Number(product?.id)!==id)throw fail('PRODUCT_RESPONSE_INVALID');products.set(id,product);return {product};}
 async function replace(items){if(adapter.getSyncStatus().phase!=='ready')throw fail('CART_SYNC_BLOCKED');const saved=await adapter.persist(items);emit({cart:cartRows(saved.items),migration:adapter.getMigration()});return copy(state.cart);}
 const identity=(productId,variantId)=>({productId:positive(productId),variantId:variantId==null?null:positive(variantId)});
 const cart={
  add:(productId,variantId=null,quantity=1)=>serial(async()=>{const item=identity(productId,variantId),{product}=await loadProduct(item.productId),variant=assertProductVariant(product,item.variantId),key=cartLineKey(item),previous=state.cart.find(row=>cartLineKey(row)===key),count=(previous?.quantity||0)+quantity;if(!Number.isSafeInteger(quantity)||quantity<1||count>20||count>(variant?.availableStock??product.stock))throw fail('CART_QUANTITY_INVALID');const next=state.cart.filter(row=>cartLineKey(row)!==key).concat({...item,storeId,quantity:count});toPurchaseCartItems(next);return replace(next);}),
  setQuantity:(productId,variantId,quantity)=>serial(async()=>{const item=identity(productId,variantId),key=cartLineKey(item),previous=state.cart.find(row=>cartLineKey(row)===key);if(!previous||!Number.isSafeInteger(quantity)||quantity<0||quantity>999)throw fail('CART_QUANTITY_INVALID');if(quantity>previous.quantity){const {product}=await loadProduct(item.productId),variant=assertProductVariant(product,item.variantId);if(quantity>20||quantity>(variant?.availableStock??product.stock))throw fail('CART_QUANTITY_INVALID');toPurchaseCartItems(state.cart.map(row=>cartLineKey(row)===key?{...row,quantity}:row));}return replace(state.cart.filter(row=>cartLineKey(row)!==key).concat(quantity?[{...previous,quantity}]:[]));}),
  retrySync:()=>refresh(),
  resolveLegacy:(productId,localOnly=false,variantId=null)=>serial(async()=>{await adapter.resolveLegacy(positive(productId),localOnly,variantId);emit({migration:adapter.getMigration()});}),
 };
 const auth={
  async login(email,password){active();const sequence=++generation;release();emit({session:{status:'guest',user:null},cart:[],favorites:[],cartSync:{phase:'loading'}});const response=await http.request('/api/users/login',{method:'POST',body:{email,password}});if(disposed||sequence!==generation)throw fail('SHARED_STATE_PRINCIPAL_CHANGED');if(typeof response.token!=='string'||!response.token||!normalizeVariantId(response.user?.id))throw fail('CUSTOMER_AUTH_RESPONSE_INVALID');storage.setItem('nova_user_token',response.token);storage.setItem('nova_user_info',JSON.stringify(response.user));return initialize();},
  async logout(){authenticated();const stamp=capture();await http.request('/api/users/logout',{method:'POST'});current(stamp);generation++;release();http.clearCustomerSession();emit({...blank(),phase:'ready',catalog:state.catalog});return initialize();},
  refresh,
 };
 const checkoutBase=createCheckoutAdapter({http,root:{},storage,sessionStorage:null,location:{origin}});
 const checkout={
  begin:()=>serial(async()=>{if(state.migration.unresolvedItems.length||state.migration.localItems.length)throw fail('CART_MIGRATION_REVIEW_REQUIRED');return adapter.handoffToCheckout(state.cart);}),
  async quote(couponCode=''){authenticated();if(adapter.getSyncStatus().phase!=='ready')throw fail('CART_SYNC_BLOCKED');const stamp=capture(),items=toPurchaseCartItems(state.cart).map(row=>({productId:row.product_id,...(row.variant_id?{variantId:row.variant_id}:{}),quantity:row.quantity}));if(!items.length)throw fail('CART_EMPTY');const result=await publicRequest('/quote',{method:'POST',body:{items,couponCode}});current(stamp);return normalizeQuote(result);},
  async prepare(addressId,couponCode=''){authenticated();if(adapter.getSyncStatus().phase!=='ready')throw fail('CART_SYNC_BLOCKED');if(state.migration.unresolvedItems.length||state.migration.localItems.length)throw fail('CART_MIGRATION_REVIEW_REQUIRED');const stamp=capture();toPurchaseCartItems(state.cart);const agreements=await checkoutBase.previewAgreements({session:state.session,address:{id:positive(addressId)},items:state.cart,couponCode});current(stamp);return agreements;},
  capability:()=>canonical('/api/payments/capability'),
  paymentStatus:args=>{authenticated();const stamp=capture();return checkoutBase.getPaymentStatus(args).then(result=>{current(stamp);return result;});},
  finalizePaid:args=>serial(async()=>{const stamp=capture(),result=await checkoutBase.getPaymentStatus(args);current(stamp);if(result.providerFinalized!==true||result.commerceFinalized!==true||result.paymentStatus!=='PAID'||!normalizeVariantId(result.orderId)||String(result.paymentRef)!==String(args.paymentRef))throw fail('PAYMENT_NOT_FINALIZED');const items=await adapter.finalize([],{orderId:result.orderId});current(stamp);emit({cart:cartRows(items)});return result;}),
  initialize:()=>Promise.reject(fail('PAYMENT_PROVIDER_GATED','Gerçek ödeme başlatma bu sürümde kapalıdır.')),
 };
 const runtime={initialize,snapshot:()=>copy({...state,context}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},loadProduct,auth,cart,checkout,
  reputation:async productId=>{const id=positive(productId),authenticated=state.session.status==='authenticated',[reviews,questions]=await Promise.all([authenticated?scoped(`/products/${id}/reviews`):publicRequest(`/products/${id}/reviews`),publicRequest(`/products/${id}/questions`)]);return {reviews:reviews.reviews,questions:questions.questions,reviewPermission:authenticated?reviews.reviewPermission:{canReview:false,requiresAuth:true,code:'AUTH_REQUIRED',message:'Değerlendirme yapabilmek için giriş yapmalısın.'}};},
  legal:type=>publicRequest(type?`/legal/${type}`:'/legal'),
  favorites:{set:(productId,enabled)=>serial(async()=>{const id=positive(productId);await loadProduct(id);await http.store(`/favorites/${id}`,{method:enabled===true?'POST':'DELETE'});const result=await http.store('/favorites');if(!Array.isArray(result.productIds))throw fail('FAVORITES_RESPONSE_INVALID');emit({favorites:result.productIds});return copy(state.favorites);})},
  addresses:{load:()=>canonical('/api/addresses')},
  orders:{list:()=>scoped('/orders'),detail:id=>scoped(`/orders/${positive(id)}`)},
  community:{review:body=>canonical('/api/reviews',{method:'POST',body}),question:body=>canonical('/api/questions/ask',{method:'POST',body})},
  support:{context:()=>scoped('/support/context'),threads:()=>scoped('/support/threads'),create:body=>scoped('/support/threads',{method:'POST',body}),
   messages:(threadId,after)=>scoped(`/support/threads/${uuid(threadId)}${after?'?after='+cursor(after):''}`),send:(threadId,body)=>scoped(`/support/threads/${uuid(threadId)}/messages`,{method:'POST',body}),
   read:(threadId,throughMessageId)=>scoped(`/support/threads/${uuid(threadId)}/read`,{method:'POST',body:{throughMessageId:cursor(throughMessageId)}}),
   setState:(threadId,status,expectedRevision)=>scoped(`/support/threads/${uuid(threadId)}/state`,{method:'PATCH',body:{status,expectedRevision}})},
  dispose(){disposed=true;generation++;release();root.removeEventListener?.('storage',onSessionChange);root.removeEventListener?.('novastore:auth-required',onSessionChange);listeners.clear();},
 };
 function onSessionChange(event){if(disposed||event?.type==='storage'&&!['nova_user_token','nova_user_info'].includes(event.key))return;if(token()!==verifiedToken){generation++;emit({session:{status:'guest',user:null},cart:[],favorites:[],migration:blank().migration,cartSync:{phase:'blocked',code:'SESSION_CHANGED'}});}}
 root.addEventListener?.('storage',onSessionChange);root.addEventListener?.('novastore:auth-required',onSessionChange);
 return Object.freeze(runtime);
}
