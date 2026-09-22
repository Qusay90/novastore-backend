import {cartLineKey,normalizeVariantId} from './commerce-variant-contract.js';
const failure=(code,message)=>Object.assign(new Error(message||code),{code});
const same=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
// The old bridge is usable as a read-only catalog projector, never as a cart
// writer. This adapter retains both canonical IDs and the full tuple identity.
export function createCustomerEngineBridge(runtime,{projectCatalog,navigate}={}){
 if(typeof projectCatalog!=='function'||typeof navigate!=='function')throw failure('HOST_CONTRACT');
 let snapshot=null,projection=null,unsubscribe=null,disposed=false,sequence=0,pending=null;
 const listeners=new Set();
 const notify=()=>listeners.forEach(listener=>listener(snapshot));
 function update(state){
  if(disposed||!projection)return;
  const cart=state.cart.map(item=>Object.freeze({productId:String(item.productId),variantId:item.variantId,storeId:item.storeId,lineKey:`${item.storeId}:${cartLineKey(item)}`,variant:item.variantLabel||'',qty:item.quantity,unitPrice:typeof item.price==='number'?Math.round(item.price*100):null,unavailable:item.unavailable===true}));
  const favorites=state.favorites.map(String),session=state.session;
  snapshot=Object.freeze({contractVersion:'novastore-theme-host/1',cartSchemaVersion:2,mode:'host',scope:{storeId:String(state.context.customerRuntime.storeId)},phase:'ready',products:projection.products,categories:projection.categories,cart:snapshot&&same(snapshot.cart,cart)?snapshot.cart:Object.freeze(cart),favorites:snapshot&&same(snapshot.favorites,favorites)?snapshot.favorites:Object.freeze(favorites),session:snapshot&&same(snapshot.session,session)?snapshot.session:Object.freeze(session),readOnlyPreview:false,cartSync:state.cartSync.phase==='ready'?'server':'pending',pending,error:state.error});
  notify();
 }
 const ready=()=>{if(disposed||!snapshot)throw failure('HOST_NOT_READY');};
 const perform=async(label,action)=>{ready();pending=label;update(runtime.snapshot());try{await action();return snapshot;}catch(error){if(error.code==='CUSTOMER_SESSION_MISSING'||error.code==='SHARED_STATE_PRINCIPAL_CHANGED')navigate('#/account');throw error;}finally{pending=null;if(!disposed)update(runtime.snapshot());}};
 return Object.freeze({
  contractVersion:'novastore-theme-host/1',cartSchemaVersion:2,
  async initialize(){if(disposed)throw failure('HOST_DISPOSED');const ticket=++sequence;if(runtime.snapshot().phase!=='ready')await runtime.initialize();const state=runtime.snapshot();projection=await projectCatalog(state.catalog);if(disposed||ticket!==sequence)throw failure('SESSION_CHANGED');unsubscribe?.();unsubscribe=runtime.subscribe(update);update(runtime.snapshot());return snapshot;},
  snapshot(){ready();return snapshot;},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
  addToCart:(id,variant='Standart',quantity=1)=>perform('cart-add',()=>runtime.cart.add(id,variant==='Standart'||variant===''?null:variant,quantity)),
  setQuantity:(id,quantity,variantId)=>perform('cart-quantity',()=>{const matches=snapshot.cart.filter(row=>row.productId===String(id)&&(variantId===undefined||row.variantId===variantId));if(matches.length!==1)throw failure('VARIANT_IDENTITY_REQUIRED','Sepet satırının ürün seçeneğini belirt.');return runtime.cart.setQuantity(id,matches[0].variantId,quantity);}),
  setFavorite:(id,enabled)=>perform('favorite',()=>runtime.favorites.set(id,enabled)),
  openProduct(id){ready();if(!normalizeVariantId(id))throw failure('INVALID_PRODUCT');return navigate(`#/product/${id}`);},
  openAccount(){ready();return navigate('#/account');},
  openCheckout:()=>perform('checkout',()=>runtime.checkout.begin()),
  // No local NovaBot answer or guessed recipient is used. Support page uses
  // the authenticated, server-scoped support port owned by the public router.
  support:null,
  dispose(){disposed=true;sequence++;unsubscribe?.();listeners.clear();runtime.dispose();},
 });
}
