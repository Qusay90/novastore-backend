import {createCustomerCommerceRuntime} from './commerce-runtime.js';
import {createCustomerEngineBridge} from './commerce-engine-bridge.js';
import {createCommerceDOM} from './commerce-dom.js';
import {createCommerceLayout} from './commerce-layout.js';
import {applyClassicDocument} from './theme-kit-dom.js';
import {applyAtelierDocument} from './atelier-dom.js';
import {trustedPresentation} from './theme-kit-adapter.js';
import './commerce.css';

const ROOT='/theme-studio/theme-kit/';
const RENDERERS=Object.freeze({
 'nova-classic':{source:'15-nova-classic',style:'classic',css:'theme.css',config:'classic-presentation.json',runtime:'classic-customer.js',apply:applyClassicDocument},
 'nova-atelier':{source:'02-atelier',style:'editorial',css:'nova-atelier/theme.css',config:'nova-atelier/presentation.json',runtime:'nova-atelier/customer.js',apply:applyAtelierDocument},
});
export function commerceAssetURL(value){
 if(typeof value!=='string'||!value)return '';
 if(/^package:theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|jpg|webp)$/.test(value))return '/theme-studio/assets/package/'+value.slice(8);
 if(/^asset:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))return '/api/theme-storefront/assets/'+value.slice(6);
 return '';
}
function loadStatic(name,kind){return new Promise((resolve,reject)=>{const element=document.createElement(kind==='css'?'link':'script');if(kind==='css'){element.rel='stylesheet';element.href=ROOT+name;}else{element.src=ROOT+name;element.async=false;}element.onload=()=>resolve();element.onerror=()=>reject(Error('Mağaza sunumu yüklenemedi.'));document.head.append(element);});}
export async function startCustomerStorefront(){
 const navigate=hash=>{if(window.NovaThemeKitRuntime)window.NovaThemeKitRuntime.navigate(hash);else location.assign(hash);},runtime=createCustomerCommerceRuntime({navigate});
 let bridge,dom,layout;try{
  await runtime.initialize();const state=runtime.snapshot(),context=state.context,presentation=trustedPresentation(context.presentation,'web'),renderer=presentation&&RENDERERS[presentation.id],siteDocument=context.document?.studio;
  if(!renderer||context.document?.schemaVersion!==2||!siteDocument)throw Error('Bu mağazanın yayımlanan sunumu doğrulanamadı.');
  await loadStatic('core.css','css');await loadStatic(renderer.css,'css');await loadStatic('fonts.css','css');await loadStatic('customer-projector.js','js');
  const result=await fetch(ROOT+renderer.config,{credentials:'same-origin',cache:'no-store'});if(!result.ok)throw Error('Tema sunumu bulunamadı.');const theme=await result.json();if(theme.id!==renderer.source||theme.style!==renderer.style)throw Error('Tema kaynağı eşleşmiyor.');
  theme.name='Nova Store';if(presentation.id==='nova-atelier')theme.heroImage=commerceAssetURL(siteDocument.blocks.find(block=>block.id==='atelier-hero')?.image);
  const images=new Map(),origins=[...new Set(state.catalog.products.flatMap(p=>[p.imageUrl,...p.media.map(m=>m.url)]).filter(Boolean).flatMap(value=>{try{return [new URL(value,location.origin).origin];}catch{return [];} }))];
  const projector=window.NovaThemeHostBridge.projectCatalog;
  bridge=createCustomerEngineBridge(runtime,{navigate,projectCatalog:catalog=>projector({...catalog,products:catalog.products.map(p=>({...p,requiresVariantSelection:p.variant_selection_required===true}))},origins)});
  const refresh=()=>window.NovaThemeKitRuntime?.refresh();
  dom=createCommerceDOM({runtime,navigate,refresh,onImages:(id,urls)=>images.set(String(id),urls),productTemplate:id=>window.NovaThemeKitRuntime.productTemplate(id),onProductMounted:()=>{window.NovaThemeKitRuntime.finishProduct();apply();}});
  layout=createCommerceLayout(document,window);
  const apply=()=>{
   renderer.apply(document,siteDocument,commerceAssetURL,state.catalog);
   document.title=document.title.replace(/ Demo$/,'');
   for(const target of document.querySelectorAll('.footer-brand>span,.footer-bottom span:nth-child(2)'))target.textContent=context.store.name||'Nova Store';
   // This entry is enabled only by the verified customer host. Read-only
   // design previews keep their separate, truthful preview wording.
   for(const target of document.querySelectorAll('.site-footer small,.site-footer span,.site-footer p'))if(target.children.length===0&&target.textContent.trim()==='Salt okunur önizleme')target.textContent='Güvenli mağaza deneyimi';
   for(const target of document.querySelectorAll('[aria-label],[title]'))for(const attribute of ['aria-label','title'])if(target.getAttribute(attribute)?.includes('seçenekleri mağazada seç'))target.setAttribute(attribute,target.getAttribute(attribute).replace('seçenekleri mağazada seç','ürün seçeneklerini seç'));
   for(const target of document.querySelectorAll('[data-action="quick-view"]')){target.setAttribute('title','Ürünü incele');target.setAttribute('aria-label',(target.getAttribute('aria-label')||'Ürünü incele').replace(/hızlı görünüm/gi,'ürünü incele'));}
   for(const target of document.querySelectorAll('[data-action="privacy-info"]')){target.disabled=false;target.title='';}
   layout.refresh();
  };
  window.NovaStoreThemeMode='host';window.NovaStoreCommerceHost=bridge;window.THEME=theme;
  window.NovaThemeKitPorts={productImages:id=>images.get(String(id)),renderCustomerPage:(name,id)=>dom.renderPage(name,id),onDocumentApplied:apply,onRendered:route=>{apply();void dom.onRendered(route);}};
  document.body.dataset.mode='web';document.body.dataset.theme=renderer.source;document.body.dataset.style=renderer.style;
  document.querySelector('#app')?.removeAttribute('role');await loadStatic(renderer.runtime,'js');
  window.addEventListener('pagehide',()=>{layout.dispose();dom.dispose();bridge.dispose();},{once:true});
  return {runtime,bridge,dom};
 }catch(error){layout?.dispose();dom?.dispose();bridge?.dispose();runtime.dispose();const app=document.getElementById('app');app.replaceChildren();const heading=document.createElement('h1'),message=document.createElement('p'),retry=document.createElement('button');heading.textContent='Mağaza şu anda açılamıyor';message.textContent=error.message||'Bağlantı doğrulanamadı.';retry.textContent='Yeniden dene';retry.onclick=()=>location.reload();app.append(heading,message,retry);app.setAttribute('role','alert');throw error;}
}
if(typeof document!=='undefined'&&document.getElementById('app'))void startCustomerStorefront().catch(()=>{});
