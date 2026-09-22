import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {customerRuntimeSource} from '../src/studio-integration/commerce-runtime-source.mjs';
import {createCommerceDOM} from '../src/studio-integration/commerce-dom.js';

// DOM double for transition/lifecycle behavior only. Actual renderer render()
// runs unchanged from its generated source; this does not claim browser UAT.
const original=fs.readFileSync(new URL('../workshop-public/theme-library/shared/core.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(family){
 const requests=[],listeners=new Map(),writes=[],status={textContent:''};let templateCalls=0,pending=null;
 const make=tag=>({tag,children:[],attributes:{},dataset:{},textContent:'',setAttribute(k,v){this.attributes[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelector(){return null;}});
 const main={_html:'',get innerHTML(){return this._html;},set innerHTML(value){this._html=value;writes.push(value);pending=value.includes('data-commerce-product-pending')?make('section'):null;},querySelector:()=>({textContent:'Ürün bilgileri'}),focus(){},replaceChildren(){throw Error('Stale or incomplete product must not mount');}};
 const root={body:{dataset:{}},title:'',createElement:make,getElementById:id=>id==='main-content'?main:{value:''},querySelectorAll:()=>[],querySelector:selector=>selector==='[data-commerce-product-pending]'?pending:selector==='[data-commerce-status]'?status:selector==='#main-content'?main:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const runtime={snapshot:()=>({session:{status:'guest'}}),loadProduct:id=>{const next=deferred();requests.push({id,...next});return next.promise;}};
 let route={name:'product',id:'501',params:''};
 const dom=createCommerceDOM({runtime,root,productTemplate:()=>{templateCalls++;throw Error('Only a complete current canonical product may render a template');}});
 const code=customerRuntimeSource(original,family),start=code.indexOf('  function render() {'),end=code.indexOf('  function renderKeepingPosition',start);
 assert.ok(start>=0&&end>start);
 const noop=()=>'',window={NovaStoreSupportUI:{dispose(){}},NovaThemeKitPorts:{renderCustomerPage:dom.renderPage,onRendered:value=>void dom.onRendered(value)},scrollTo(){}};
 const context={document:root,window,location:{hash:'#/product/501'},T:{style:family==='nova-classic'?'classic':'editorial',name:'Nova Store'},hostBridge:{},currentRoute:()=>route,firstRender:true,notFound:noop,renderSupportCenter:noop,home:noop,catalog:noop,hostedDetail:()=>{throw Error('Raw product template cannot enter live DOM');},detail:noop,hostedFavorites:noop,favorites:noop,hostedCart:noop,cart:noop,checkout:noop,hostedCustomerPage:noop,account:noop,orders:noop,orderDetail:noop,hostedHelp:noop,help:noop,classicContact:noop,classicJournal:noop,classicAbout:noop,classicHelp:noop,enhanceCampaign:noop,enhanceInteractions:noop,initializeSupportCenter:noop,closeSearchSuggestions:noop,decorateHostedPage:noop,enhanceSectorNext:noop,enhanceSectorCategoryHover:noop,getFilters:()=>({q:''}),updateBadges:noop,enhanceClassic:noop};
 vm.createContext(context);vm.runInContext(code.slice(start,end),context);
 return{main,status,runtime,dom,requests,writes,listeners,root,render(next=route){route=next;context.render();},templateCalls:()=>templateCalls,pending:()=>pending};
}
for(const family of ['nova-classic','nova-atelier']){
 test(`${family}: slow canonical PDP response exposes only inert loading DOM; late reply cannot replace another route`,async()=>{
  const h=harness(family);h.render();await tick();
  assert.ok(h.main.innerHTML.includes('aria-busy="true"'));assert.ok(h.main.innerHTML.includes('Ürün bilgileri doğrulanıyor'));
  assert.ok(!/product-form|radio|Demo stok|demo indirim|NaN|data-host-mutation/.test(h.main.innerHTML));assert.equal(h.templateCalls(),0);
  h.render({name:'home',id:'',params:''});h.requests[0].resolve({product:{id:501}});await tick();
  assert.equal(h.templateCalls(),0);assert.equal(h.main.innerHTML,'');assert.equal(h.status.textContent,'');h.dom.dispose();
 });
 test(`${family}: rejected PDP response retains no demo controls and offers explicit retry`,async()=>{
  const h=harness(family);h.render();h.requests[0].reject(Error('Bağlantı kurulamadı'));await tick();
  assert.equal(h.templateCalls(),0);assert.equal(h.pending().attributes['aria-busy'],'false');
  assert.equal(h.pending().children[1].dataset.commerceAction,'product-retry');assert.equal(h.status.textContent,'Bağlantı kurulamadı');
  assert.ok(h.writes.every(html=>!html.includes('id="product-form"')));h.dom.dispose();
 });
 test(`${family}: product-to-product race and disposal reject previous pending replies`,async()=>{
  const h=harness(family);h.render();h.render({name:'product',id:'502',params:''});
  h.requests[0].resolve({product:{id:501}});await tick();assert.equal(h.templateCalls(),0);assert.equal(h.pending().children.length,0);
  h.dom.dispose();h.requests[1].resolve({product:{id:502}});await tick();assert.equal(h.templateCalls(),0);
 });
}
for(const preserved of [false,true])test(`completed mutation clears obsolete busy status after navigation; preserves add confirmation=${preserved}`,async()=>{
 const h=harness('nova-classic'),request=deferred();h.runtime.checkout={begin:()=>request.promise};await h.dom.onRendered({name:'home'});
 const button={disabled:false,isConnected:true,dataset:{commerceAction:'checkout'}};
 h.listeners.get('click')({target:{closest:()=>button},preventDefault(){}});assert.equal(h.status.textContent,'İşlem tamamlanıyor…');
 await h.dom.onRendered({name:'home'});if(preserved)h.status.textContent='1 adet ürün sepetine eklendi.';
 request.resolve();await tick();assert.equal(h.status.textContent,preserved?'1 adet ürün sepetine eklendi.':'');assert.equal(button.disabled,false);h.dom.dispose();
});
