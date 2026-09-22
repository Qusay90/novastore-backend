import {createCustomerHttp,CustomerHttpError} from './commerce-http-base.js';

export const COMMERCE_PREFIX='/api/theme-storefront/customer';
const fail=(code,status=0)=>new CustomerHttpError(code,{code,status});
// Fixed relocation of canonical customer operations. No arbitrary URL, domain,
// admin credential or tenant identifier is accepted from theme data.
export function commerceApiPath(input){
 const url=new URL(input,'https://scoped.invalid');
 if(typeof input!=='string'||!input.startsWith('/api/')||input.startsWith('//')||url.origin!=='https://scoped.invalid'||url.hash||/[\\\u0000-\u0020]/.test(input)||/(?:^|\/)\.\.(?:\/|$)|%2e|%2f|%5c/i.test(input))throw fail('CUSTOMER_PATH_FORBIDDEN');
 let suffix;
 if(/^\/api\/users\/(login|me|logout)$/.test(url.pathname))suffix=url.pathname.slice(4);
 else if(/^\/api\/addresses(?:\/[1-9]\d*(?:\/default)?)?$/.test(url.pathname))suffix=url.pathname.slice(4);
 else if(/^\/api\/shared-state\/(cart|checkout)(?:\/finalize)?$/.test(url.pathname))suffix=url.pathname.slice('/api/shared-state'.length);
 else if(url.pathname==='/api/payments/agreements/preview')suffix='/agreements/preview';
 else if(/^\/api\/payments\/(capability|status)$/.test(url.pathname))suffix=url.pathname.slice(4);
 else if(url.pathname==='/api/reviews')suffix='/reviews';
 else if(url.pathname==='/api/questions/ask')suffix='/questions';
 else throw fail('CUSTOMER_PATH_FORBIDDEN');
 return COMMERCE_PREFIX+suffix+url.search;
}
const STORE_RULES=[
 ['GET',/^\/products\/[1-9]\d*\/reviews$/],
 ['GET',/^\/favorites$/],['POST',/^\/favorites\/[1-9]\d*$/],['DELETE',/^\/favorites\/[1-9]\d*$/],
 ['GET',/^\/orders(?:\/[1-9]\d*)?$/],['GET',/^\/support\/context$/],
 ['GET',/^\/support\/threads$/],['POST',/^\/support\/threads$/],
 ...['GET','POST','PATCH'].map(verb=>[verb,new RegExp('^/support/threads/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'+(verb==='GET'?'(?:\\?after=[1-9][0-9]{0,14})?':verb==='POST'?'/(?:messages|read)':'/state')+'$')]),
];
export function createCommerceHttp({fetchImpl=globalThis.fetch?.bind(globalThis),storage=globalThis.localStorage,eventTarget=globalThis,origin=globalThis.location?.origin||'http://localhost',timeoutMs=10000}={}){
 const base=createCustomerHttp({storage,eventTarget,origin,timeoutMs,fetchImpl:(path,options)=>fetchImpl(commerceApiPath(path),options)});
 async function store(path,{method='GET',body,signal}={}){
  if(typeof path!=='string'||!STORE_RULES.some(([verb,pattern])=>method===verb&&pattern.test(path)))throw fail('CUSTOMER_PATH_FORBIDDEN');
  const token=storage?.getItem?.('nova_user_token');if(!token)throw fail('CUSTOMER_SESSION_MISSING',401);
  const controller=new AbortController(),abort=()=>controller.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort('timeout'),timeoutMs);
  try{
   const response=await fetchImpl(COMMERCE_PREFIX+path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json',Authorization:`Bearer ${token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   const payload=response.status===204?{}:await response.json();
   if(!response.ok){if(response.status===401&&token===storage?.getItem?.('nova_user_token'))base.clearCustomerSession();throw new CustomerHttpError(payload.message||payload.error||'Müşteri işlemi tamamlanamadı.',{code:payload.code||'CUSTOMER_REQUEST_FAILED',status:response.status,payload});}
   if(token!==storage?.getItem?.('nova_user_token'))throw fail('SHARED_STATE_PRINCIPAL_CHANGED');
   return payload;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }
 return Object.freeze({...base,store});
}
