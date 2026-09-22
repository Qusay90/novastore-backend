import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {classifyReviewProductResponse, createReviewCatalogAdapter, legacyDescriptionText} from '../src/adapters/reviewCatalogAdapter.js';
import {createPublicReviewRuntime} from '../src/integration/createPublicReviewRuntime.js';
import {legalAdapterTestUtils} from '../src/adapters/legalAdapter.js';
const require=createRequire(import.meta.url);
const {getPublicReviewProjection}=require('../../config/publicReviewConfig.js');
const {listLegalDocuments}=require('../../services/publicReviewLegalService.js');
const authority=getPublicReviewProjection().catalogAuthority;
test('R38 legacy rich descriptions remain readable plain text without executable HTML',()=>{
  assert.equal(legacyDescriptionText('<p>Cam &amp; çay</p><p>Isıya dayanıklı.</p>'),'Cam & çay\nIsıya dayanıklı.');
  assert.equal(legacyDescriptionText('<script>alert(1)</script><img src=x onerror=alert(1)><p>Güvenli metin</p>'),'Güvenli metin');
});
const products=[
  {id:1,name:'İndigo gömlek',description:'Pamuklu gömlek',price:'750.00',old_price:'1000.00',stock:7,category:'Giyim',categoryIds:[1],primaryCategoryId:1,image_url:'https://res.cloudinary.com/novastore/image/upload/shirt.webp'},
  {id:2,name:'Cam çaydanlık',description:'Isıya dayanıklı cam',price:'849.90',stock:75,category:'Ev',image_url:'https://res.cloudinary.com/novastore/image/upload/teapot.webp'},
];
const categories=[{id:1,name:'Giyim',slug:'giyim',path:'giyim',parent_id:null,children:[],is_active:true,is_customer_visible:true}];
const makeHttp=(override={})=>({request:async route=>{
  if(Object.hasOwn(override,route))return override[route];
  if(route==='/api/public/categories?format=tree')return categories;
  if(route==='/api/public/navigation/main')return {code:'main',name:'Ana menü',items:[]};
  if(route==='/api/public/collections')return [];
  if(route==='/api/products/1')return products[0];
  if(route.startsWith('/api/products?') || route==='/api/products')return products;
  throw new Error('Unexpected test route: '+route);
}});

test('R38 only attested unbounded legacy arrays allow local search and complete results',()=>{
  const all=classifyReviewProductResponse(products,{legacyAuthority:authority,query:{limit:'1'}});
  assert.equal(all.items.length,2,'legacy endpoint ignores limit; do not truncate its complete array');
  assert.equal(all.completeness,'verified-unbounded-legacy-query');
  assert.equal(all.hasMore,false);assert.equal(all.nextCursor,null);
  const filtered=classifyReviewProductResponse(products,{legacyAuthority:authority,query:{q:'INDIGO'}});
  assert.deepEqual(filtered.items.map(p=>p.id),[1]);
});

test('R38 unknown authority, bounded arrays, invalid identity and continuation fail closed',()=>{
  for(const options of [{},{legacyUnbounded:true},{legacyAuthority:{...authority,sourceCommit:'unknown'}},{legacyAuthority:{...authority,contract:'bounded-array'}},{legacyAuthority:authority,query:{cursor:'opaque'}},{legacyAuthority:authority,query:{cursor:''}}])assert.throws(()=>classifyReviewProductResponse(products,options));
  for(const items of [[...products,products[0]],[{...products[0],id:true}],[{...products[0],id:'1.0'}],[{...products[0],name:''}],[null]])assert.throws(()=>classifyReviewProductResponse(items,{legacyAuthority:authority}));
  for(const payload of [{items:products},{data:products},{items:[],limit:20,hasMore:true,nextCursor:'next'},{items:products,limit:1,hasMore:false,nextCursor:null}])assert.throws(()=>classifyReviewProductResponse(payload));
});

test('R38 cursor envelope keeps server search and opaque continuation intact',()=>{
  const cursor='opaque:server/continuation+value';
  const result=classifyReviewProductResponse({items:[products[1]],limit:1,hasMore:true,nextCursor:cursor},{query:{q:'server-synonym',cursor:'previous'}});
  assert.deepEqual(result.items,[products[1]],'client must not re-filter canonical server search');
  assert.equal(result.nextCursor,cursor);assert.equal(result.completeness,'server-pagination');
  assert.equal(result.hasMore,true);
});

test('R38 empty real main navigation falls back only to the real category tree',async()=>{
  const catalog=await createReviewCatalogAdapter(makeHttp(),{legacyAuthority:authority}).load({cursorPagination:true});
  assert.equal(catalog.navigation.source,'public-categories');
  assert.deepEqual(catalog.navigation.items.map(i=>i.target.id),[1]);
  assert.equal(catalog.navigation.items[0].title,'Giyim');
  await assert.rejects(()=>createReviewCatalogAdapter(makeHttp({'/api/public/navigation/main':{items:'unknown'}}),{legacyAuthority:authority}).load());
});

test('R38 descriptive attributes never become purchase variants or variant media',async()=>{
  const raw={...products[0],color:'Mavi',storage:'128 GB',attributes:[{code:'renk',name:'Renk',value:'Mavi'}],
    media:[{id:10,media_url:products[0].image_url,is_main:true},{id:11,media_url:'https://res.cloudinary.com/novastore/image/upload/blue-sku.webp'}],
    store_id:7};
  const adapter=createReviewCatalogAdapter(makeHttp({'/api/products/1':raw}),{legacyAuthority:authority});
  const catalog=await adapter.load();const product=await adapter.loadProduct(1,{catalog});
  assert.equal(product.legacySimpleProduct,true);assert.equal(product.variantContractLoaded,true);
  assert.equal(product.variantSelectionRequired,false);assert.deepEqual(product.variants,[]);
  assert.equal(product.color,null);assert.equal(product.storage,null);assert.equal(product.variantMedia,null);
  assert.equal(product.media.length,2);assert.equal(product.media[0].url,products[0].image_url);
  assert.equal(product.price,750);assert.equal(product.stock,7);assert.equal(product.store,null);
  assert.ok(product.features.includes('Renk: Mavi'));
});

test('R38 review runtime uses no account credentials, remote cart writes, orders or provider calls',async()=>{
  const values=new Map();const calls=[];const location={origin:'https://novastore.tr',hash:''};
  const storage={getItem:key=>{assert.match(key,/^novastore_public_review_/);return values.get(key)||null;},setItem:(key,value)=>values.set(key,value)};
  const http=makeHttp();
  const runtime=await createPublicReviewRuntime({root:{},storage,location,fetchImpl:async(route,options={})=>{
    calls.push({route,method:options.method||'GET',credentials:options.credentials,headers:options.headers});
    const payload=route==='/api/business-identity'?getPublicReviewProjection():await http.request(route);
    return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
  }}).initialize();
  await runtime.cart.persist([{productId:1,quantity:2}]);
  await runtime.cart.handoffToCheckout([{productId:1,quantity:2}]);
  await runtime.favorites.set(1,true);
  assert.equal(location.hash,'#/odeme/teslimat');
  await assert.rejects(()=>runtime.publicStore.load('invented'),error=>error.code==='PUBLIC_STORE_UNAVAILABLE');
  assert.equal(runtime.reviewMode,true);assert.equal(runtime.session.status,'guest');
  assert.equal(runtime.catalog.products[0].variantSelectionRequired,false);
  assert.ok(calls.every(call=>call.method==='GET'&&call.credentials==='omit'));
  assert.ok(calls.every(call=>!JSON.stringify(call.headers||{}).includes('Authorization')));
  assert.ok(calls.every(call=>!/(payments|orders|shared-state|public\/stores)/.test(call.route)));
});

test('R38 review legal documents stay consent ineligible and unsafe link targets are rejected',()=>{
  for(const doc of listLegalDocuments()) {
    const normalized=legalAdapterTestUtils.normalizeDocument(doc);
    assert.equal(normalized.status,'review_template');assert.equal(normalized.consentEligible,false);
    assert.equal(normalized.requiredForCheckout,false);assert.equal(normalized.text,doc.text);
    assert.equal(doc.lawyerApproved,false);
  }
  const document=listLegalDocuments()[0];
  for(const path of ['//evil.example','javascript:alert(1)','/../admin','/%2e%2e/admin','/hakkimizda?next=//evil.example','/\\evil','/x\nheader'])assert.equal(legalAdapterTestUtils.normalizeDocument({...document,path}),null,path);
  assert.equal(legalAdapterTestUtils.normalizeDocument({...document,consentEligible:true}).consentEligible,false);
});
