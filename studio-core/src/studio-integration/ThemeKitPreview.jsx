import React,{useEffect,useRef,useState} from 'react';
import {getStudioHost,getStudioSession,assetURL} from './context.js';
import {useSandboxState} from '../sandbox/useSandbox.js';
import VisualEditingLayer from '../sandbox/visual/VisualEditingLayer.jsx';
import {canonicalProductRoute,classicPageKey,classicRouteForPage,readonlyThemeRuntime,trustedPresentation} from './theme-kit-adapter.js';
import {applyClassicDocument,createClassicProductBinder} from './theme-kit-dom.js';
import {applyAtelierDocument,createAtelierProductBinder} from './atelier-dom.js';

const STATIC_ROOT='/theme-studio/theme-kit/';
// Each reviewed identity selects its original templates; no generic fallback.
const RENDERERS=Object.freeze({
 'nova-classic':{name:'Classic',style:'classic',source:'15-nova-classic',css:'theme.css',config:'classic-presentation.json',runtime:'classic-runtime.js',apply:applyClassicDocument,binder:createClassicProductBinder},
 'nova-atelier':{name:'Atelier',style:'editorial',source:'02-atelier',css:'nova-atelier/theme.css',config:'nova-atelier/presentation.json',runtime:'nova-atelier/runtime.js',apply:applyAtelierDocument,binder:createAtelierProductBinder},
});
// URLs come only from this reviewed build, never from a package or draft.
function loadStatic(name,kind,nodes,signal){return new Promise((resolve,reject)=>{if(signal.aborted){reject(Error('Önizleme kapatıldı.'));return;}const node=document.createElement(kind==='css'?'link':'script');if(kind==='css'){node.rel='stylesheet';node.href=STATIC_ROOT+name;}else{node.src=STATIC_ROOT+name;node.async=false;}nodes.push(node);const finish=()=>{node.onload=null;node.onerror=null;signal.removeEventListener('abort',abort);};const abort=()=>{finish();node.remove();reject(Error('Önizleme kapatıldı.'));};node.onload=()=>{finish();resolve();};node.onerror=()=>{finish();reject(Error('Doğrulanmış Classic sunum dosyası yüklenemedi.'));};signal.addEventListener('abort',abort,{once:true});document.head.append(node);});}

export default function ThemeKitPreview(){
 const host=getStudioHost(),session=getStudioSession(),state=useSandboxState(),channel=host.availableChannels[0],siteDocument=state.channels[channel].draft,catalog=session.getCatalog(channel),presentation=host.presentations?.[channel]||host.presentation;
 const [error,setError]=useState(''),[ready,setReady]=useState(false),latest=useRef(siteDocument),current=useRef(null),page=state.host.workingPageKey||host.pageKey||'home',desired=useRef(page);
 latest.current=siteDocument;desired.current=page;
 const trusted=trustedPresentation(presentation,channel),renderer=trusted&&RENDERERS[trusted.id];
 useEffect(()=>{
  if(!renderer){setError('Bu tema sürümünün doğrulanmış mağaza sunumu desteklenmiyor.');return;}
  let closed=false,bridge=null,binder=null;const nodes=[],controller=new AbortController(),productImages=new Map();
  const active=()=>!closed&&!controller.signal.aborted;
  const report=message=>{if(active())setError(message);};
  const ports={productImages:id=>active()?productImages.get(String(id)):undefined,onDocumentApplied(){if(active())renderer.apply(document,latest.current,assetURL,catalog);},onRendered(route){if(!active())return;current.current=route;renderer.apply(document,latest.current,assetURL,catalog);window.parent.postMessage({type:'novastore-studio-route',channel,pageKey:classicPageKey(route)},location.origin);if(route.name==='product')binder?.render(route.id);else binder?.dispose();setReady(true);}};
  (async()=>{try{
   await loadStatic('core.css','css',nodes,controller.signal);await loadStatic(renderer.css,'css',nodes,controller.signal);await loadStatic('fonts.css','css',nodes,controller.signal);
   await loadStatic('bridge.js','js',nodes,controller.signal);await loadStatic('support.js','js',nodes,controller.signal);
   const response=await fetch(STATIC_ROOT+renderer.config,{signal:controller.signal,credentials:'same-origin'});if(!response.ok)throw Error('Doğrulanmış tema sunumu bulunamadı.');const theme=await response.json();if(!active())return;
   if(theme.id!==renderer.source||theme.style!==renderer.style)throw Error('Tema kaynağının kimliği eşleşmiyor.');
   if(trusted.id==='nova-atelier')theme.heroImage=assetURL(latest.current.blocks.find(block=>block.id==='atelier-hero')?.image);
   const origins=[...new Set(catalog.products.map(product=>{try{return new URL(product.imageUrl,location.origin).origin;}catch{return '';}}).filter(Boolean))];
   bridge=window.NovaThemeHostBridge.createFromCanonicalRuntime(readonlyThemeRuntime(catalog),{scope:host.scope,readOnlyPreview:true,allowedImageOrigins:origins,openProduct:product=>{if(active())window.NovaThemeKitRuntime?.navigate(canonicalProductRoute(product));}});
   window.NovaStoreThemeMode='host';window.NovaStoreCommerceHost=bridge;window.THEME=theme;window.NovaThemeKitPorts=ports;
   document.body.dataset.mode='web';document.body.dataset.theme=renderer.source;document.body.dataset.style=renderer.style;
   binder=renderer.binder({root:document,host,channel,onError:report,onImages:(id,images)=>{if(active())productImages.set(String(id),Object.freeze([...images]));}});
   history.replaceState(null,'',location.pathname+location.search+classicRouteForPage(desired.current,catalog));
   await loadStatic(renderer.runtime,'js',nodes,controller.signal);
  }catch(cause){if(active())report(cause.message||'Classic önizlemesi açılamadı.');}})();
  return()=>{closed=true;controller.abort();binder?.dispose();bridge?.dispose();nodes.forEach(node=>node.remove());if(window.NovaThemeKitPorts===ports){delete window.NovaThemeKitPorts;delete window.NovaThemeKitRuntime;delete window.NovaStoreCommerceHost;delete window.NovaStoreThemeMode;delete window.THEME;}};
 },[]);
 useEffect(()=>{if(ready&&renderer)renderer.apply(document,siteDocument,assetURL,catalog);},[siteDocument,ready]);
 useEffect(()=>{if(ready&&current.current&&classicPageKey(current.current)!==page)window.NovaThemeKitRuntime?.navigate(classicRouteForPage(page,catalog));},[page,ready]);
 return <><VisualEditingLayer document={siteDocument} channel={channel} transientOrder={false}/>{error&&<p role="alert" style={{padding:14,background:'#fff4dc',color:'#653500'}}>{error}</p>}<div id="app" aria-label={`Doğrulanmış ${renderer?.name||'tema'} mağaza önizlemesi`}/></>;
}
