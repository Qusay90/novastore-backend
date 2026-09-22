import React, {useEffect,useRef,useState} from 'react';
import {getDocument} from './studioDocumentStore.js';
import {useSandbox} from './useSandbox.js';
import {getStoreDemo} from './storeDemos.js';
import {isVisualElement} from './visualDesign.js';
import './existing-android-shell.css';
import {getCurrentMerchant,withMerchantScope} from './merchantWorkspaces.js';
export default function ExistingAndroidPreview(){
  const params=new URLSearchParams(location.search),embedded=params.get('embed')==='1';
  const doc=useSandbox('android',params.get('preview')==='draft');
  const familyNames={'pocket':'Nova Pocket · Mevcut uygulama','nova-commerce':'Nova Commerce · Site tarzında uygulama','workspace':'Stocky Atelier','gallery':'Nova Gallery','tech':'Nova Tech','living':'Nova Living','fashion':'Nova Fashion','market':'Nova Market'};
  const frame=useRef(null),[hash,setHash]=useState(location.hash);
  useEffect(()=>{const update=()=>setHash(location.hash);window.addEventListener('hashchange',update);return()=>window.removeEventListener('hashchange',update);},[]);
  useEffect(()=>{if(params.get('studio')!=='1')return;const forward=event=>{if(event.origin!==location.origin)return;if(event.source===parent&&event.data?.type==='novastore-studio-preview-order'&&event.data.channel==='android'&&(event.data.order===null||Array.isArray(event.data.order)&&event.data.order.length<=80)){frame.current?.contentWindow?.postMessage(event.data,location.origin);return;}if(event.source===parent&&event.data?.type==='novastore-studio-set-editing'&&typeof event.data.enabled==='boolean'){frame.current?.contentWindow?.postMessage(event.data,location.origin);return;}if(event.source===frame.current?.contentWindow&&event.data?.type==='novastore-studio-ready'){parent.postMessage(event.data,location.origin);return;}if(event.source===parent&&event.data?.type==='novastore-studio-preview-motion'&&isVisualElement(event.data.elementId)&&(event.data.placement===undefined||typeof event.data.placement==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(event.data.placement))){frame.current?.contentWindow?.postMessage(event.data,location.origin);return;}if(event.source!==frame.current?.contentWindow)return;if(['novastore-studio-place-icon','novastore-studio-move-icon'].includes(event.data?.type)&&isVisualElement(event.data.elementId)){parent.postMessage(event.data,location.origin);return;}if(event.data?.type==='novastore-studio-escape'){parent.postMessage({type:'novastore-studio-escape'},location.origin);return;}const data=event.data,isElement=data?.type==='novastore-studio-select-element'&&isVisualElement(data.elementId);if(!isElement&&data?.type!=='novastore-studio-select')return;const blockId=isElement?(data.elementId.startsWith('block:')?data.elementId.split(':')[1]:null):data.blockId;const current=getDocument('android',params.get('preview')==='draft');const blocks=[...(current.blocks||[]),...(current.pages||[]).flatMap(page=>page.blocks||[]),...Object.values(current.templates||{}).flatMap(template=>template.blocks||[])];if(blockId&&!blocks.some(block=>block.id===blockId))return;if(parent!==window)parent.postMessage(isElement?{type:'novastore-studio-select-element',elementId:data.elementId,blockId}:{type:'novastore-studio-select',blockId},location.origin);};window.addEventListener('message',forward);return()=>window.removeEventListener('message',forward);},[]);
  const query=new URLSearchParams({safeTop:'0',safeBottom:'0',trial:'1'});
  if(params.get('preview')==='draft')query.set('preview','draft');
  if(params.get('studio')==='1')query.set('studio','1');
  if(params.get('preview')==='draft'&&params.get('designPreview'))query.set('designPreview',params.get('designPreview'));
  if(params.get('preview')==='draft'&&params.get('previewMode'))query.set('previewMode',params.get('previewMode'));
  if(params.get('preview')==='draft'&&params.get('designContent'))query.set('designContent',params.get('designContent'));
  if(params.get('preview')==='draft'&&params.get('previewAt'))query.set('previewAt',params.get('previewAt'));
  if(params.get('themeWorkshop'))query.set('themeWorkshop',params.get('themeWorkshop'));
  const merchant=getCurrentMerchant();if(merchant)query.set('shop',merchant.id);
  const studioPage=params.get('studioPage')||'';
  if(studioPage)query.set('studioPage',studioPage);
  const pageRoute=studioPage.startsWith('page:')?`#/sayfa/${encodeURIComponent(studioPage.slice(5))}`:hash;
  const route=pageRoute.replace(/^#/,''),pathname=route.split('?')[0];
  if(pathname.startsWith('/kategori')){query.set('cal','CAL-03');query.set('tab','categories');}
  else if(pathname.startsWith('/urun/')){query.set('cal','CAL-06');query.set('tab','home');query.set('trialProduct',decodeURIComponent(pathname.slice(6)));}
  else if(pathname==='/arama'){query.set('cal','CAL-02');query.set('tab','home');query.set('view','search');}
  else if(pathname==='/sepet'){query.set('cal','CAL-07');query.set('tab','cart');}
  else if(pathname==='/hesabim'){query.set('cal','CAL-10');query.set('tab','account');}
  else if(pathname==='/yardim'){query.set('cal','CAL-11');query.set('tab','support');}
  const nativeTemplates={category:['CAL-03','categories',''],product:['CAL-06','home',''],search:['CAL-02','home','search'],cart:['CAL-07','cart',''],account:['CAL-10','account',''],support:['CAL-11','support','']};
  if(studioPage.startsWith('template:')&&nativeTemplates[studioPage.slice(9)]){const [cal,tab,view]=nativeTemplates[studioPage.slice(9)];query.set('cal',cal);query.set('tab',tab);if(view)query.set('view',view);else query.delete('view');}
  return <section className={`existing-android-stage ${embedded?'embedded':''}`}>
    {!embedded&&<header><span>ANDROID UYGULAMASI</span><h1>{getStoreDemo(doc.theme.demoId)?.name||familyNames[doc.theme.family]||familyNames.pocket}</h1><p>Uygulamanın gerçek ekran bileşenleri · Bağımsız deneme verileri</p><a href={withMerchantScope("/?surface=admin")}>Android ayarlarını düzenle</a></header>}
    <iframe ref={frame} className="existing-android-app" title="NovaStore V4.13 uygulama arayüzü" src={`/android-app.html?${query}${pathname.startsWith('/sayfa/')?pageRoute:''}`} />
    {!embedded&&<p className="existing-android-note">Bu, mevcut uygulama arayüzünün tarayıcıdaki deneme kopyasıdır. Telefona yüklü uygulama değişmez.</p>}
  </section>;
}

