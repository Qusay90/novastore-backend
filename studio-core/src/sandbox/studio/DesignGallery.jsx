import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Eye, LayoutTemplate, Monitor, Search, Smartphone, Undo2, X } from 'lucide-react';
import { DESIGN_PRESETS, applyDemo, applyDesign } from '../designLibrary.js';
import { getSectorCatalog } from '../sectorCatalog.js';
import { getCurrentMerchant, withMerchantScope } from '../merchantWorkspaces.js';
import './design-gallery.css';
import {createThemeWorkshop,workshopURL} from '../themeWorkshopStore.js';
import SectorThemeCollection from './SectorThemeCollection.jsx';
import sectorRegistry from '../sectorThemeRegistry.json';

const pageOptions = [{id:'home',label:'Ana sayfa',hash:'#/'},{id:'category',label:'Kategoriler',hash:'#/kategoriler'},{id:'product',label:'Ürün detayı',hash:'#/urun/apple-macbook-air-m3-13-inc-256-gb'},{id:'account',label:'Hesabım',hash:'#/hesabim'},{id:'cart',label:'Sepet',hash:'#/sepet'}];
function demoURL(preset,channel,page='home',embedded=false,keepContent=false) {
  const params = new URLSearchParams({surface:channel === 'android' ? 'android' : 'storefront',preview:'draft',designPreview:preset.id,v:'store-demos-v6'});
  if (embedded) params.set('embed','1');
  if (keepContent) params.set('designContent','keep');
  const sector = getSectorCatalog(getCurrentMerchant()?.catalogFamily || preset.family);
  const hash = page === 'product' && sector ? `#/urun/${sector.products[0].slug}` : page === 'product' && channel === 'android' ? '#/urun/pulse-anc' : pageOptions.find(p=>p.id===page)?.hash || '#/';
  return withMerchantScope(`/?${params}${hash}`);
}

function DemoPreview({preset,channel,onClose,onApply,keepContent}) {
  const dialog = useRef(null);
  const [page,setPage] = useState('home');
  const [device,setDevice] = useState(channel === 'android' ? 'android' : 'desktop');
  useEffect(()=>{ const element = dialog.current; element.showModal(); return ()=>element.close(); },[]);
  const previewChannel = device === 'android' ? 'android' : 'web';
  return <dialog className="sd-preview-dialog" ref={dialog} onCancel={onClose} aria-labelledby="sd-preview-title" onClick={event=>{if(event.target===dialog.current)onClose();}}>
    <div className="sd-preview-head"><div><span>{preset.sector}</span><h2 id="sd-preview-title">{preset.name}</h2></div><div className="sd-device-controls" aria-label="Önizleme cihazı">{[['desktop','Web',Monitor],['mobile','Mobil web',Smartphone],['android','Android',Smartphone]].map(([id,label,Icon])=><button type="button" key={id} aria-pressed={device===id} onClick={()=>setDevice(id)}><Icon size={15}/>{label}</button>)}</div><button className="sd-close" type="button" onClick={onClose} aria-label="Tasarım önizlemesini kapat"><X size={21}/></button></div>
    <div className="sd-preview-subhead"><nav aria-label="Demo sayfaları">{pageOptions.map(p=><button key={p.id} type="button" aria-current={page===p.id?'page':undefined} onClick={()=>setPage(p.id)}>{p.label}</button>)}</nav><a href={demoURL(preset,previewChannel,page,false,keepContent)} target="_blank" rel="noreferrer">Ayrı sekmede aç <ArrowUpRight size={14}/></a></div>
    <div className={`sd-preview-stage sd-preview-${device}`}><iframe key={`${preset.id}-${device}-${page}`} title={`${preset.name} · ${previewChannel === 'android'?'Android uygulaması':'Web sitesi'} · ${pageOptions.find(p=>p.id===page)?.label}`} src={demoURL(preset,previewChannel,page,true,keepContent)}/></div>
    <div className="sd-preview-foot"><p>{device==='android'?'Mevcut uygulama kaynaklarından hazırlanan tarayıcı provası.':'Gerçek demo sayfası; bağlantıları ve sepeti deneyebilirsin.'}</p><button type="button" className="sp-button sp-button-dark" onClick={()=>{onApply(preset);onClose();}}><Check size={15}/>{channel==='android'?'Android':'Web'} taslağına uygula</button></div>
  </dialog>;
}

export default function DesignGallery({doc,channel,update,notify,onOffer}) {
  const [filter,setFilter] = useState('all');
  const [query,setQuery] = useState('');
  const [keepContent,setKeepContent] = useState(false);
  const [preview,setPreview] = useState(null);
  const [applied,setApplied] = useState(null);
  const totalDesigns=DESIGN_PRESETS.length+sectorRegistry.themes.length;
  const hasSectorMatch=['all','sector'].includes(filter)&&sectorRegistry.themes.some(t=>`${t.name} ${t.sector} ${t.description}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  useEffect(()=>{setPreview(null);setApplied(null);},[channel]);
  const filters = [['all','Tüm mağazalar'],['paired','Web ↔ uygulama'],['sector','Sektöre özel'],['editorial','Editoryal & kompakt']];
  const filtered = DESIGN_PRESETS.filter(p=> (filter==='all'||filter==='paired'&&['pocket','nova-commerce'].includes(p.family)||filter==='sector'&&['living','fashion','market','beauty','sport','kids'].includes(p.family)||filter==='editorial'&&['workspace','gallery'].includes(p.family))&&`${p.name} ${p.sector} ${p.description}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  function apply(preset) {
    if(update(next=>Object.assign(next,(keepContent?applyDesign:applyDemo)(next,preset.id,channel)))){
      setApplied(preset);notify(`${preset.name} ${channel==='android'?'Android':'Web'} taslağına uygulandı. Önceki tasarımı Geri al ile geri getirebilirsin.`);
    }
  }
  return <div className="sp-settings-content sd-gallery">
    <section className="sd-gallery-intro"><div><span className="sd-eyebrow">MAĞAZA DEMOLARI / {String(totalDesigns).padStart(2,'0')}</span><h2>Mağazana uygun tasarımı bul.</h2><p>Üst menüden sepete kadar incele. Sayfalarını gez, sana uygun olanla başla.</p></div><div className="sd-intro-notes"><span><LayoutTemplate size={19}/><strong>{totalDesigns} farklı düzen</strong><small>Farklı kartlar, vitrinler ve iç sayfalar</small></span><span><Smartphone size={19}/><strong>Web + Android karşılığı</strong><small>Aynı ailenin iki kanaldaki görünümü</small></span><span><Undo2 size={19}/><strong>Tek adımda geri dönüş</strong><small>Yalnızca seçili kanalın taslağı değişir</small></span></div></section>
    <div className="sp-info-note"><strong>Yeni sektör koleksiyonu</strong><p>{sectorRegistry.themes.length} yeni tasarımı incele; metin, görsel ve görünümünü ayrı çalışma kopyalarında düzenle.</p><a className="sp-button sp-button-outline" href="/theme-library/" target="_blank" rel="noreferrer">{sectorRegistry.themes.length} yeni tasarımı aç <ArrowUpRight size={14}/></a></div><div className="sd-gallery-toolbar"><div className="sd-filters" role="group" aria-label="Mağaza türü">{filters.map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div><label className="sd-search"><Search size={16}/><input aria-label="Mağaza tasarımlarında ara" placeholder="Tasarım veya sektör ara" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
    <div className="sd-install-mode"><div><strong>{channel==='android'?'Android':'Web'} için uygulama biçimi</strong><p>{keepContent?'Mevcut metinler, görseller ve bölüm sırası korunur; mağazanın düzeni değişir.':'Ana sayfa, seçilen demonun düzenlenebilir örnek bölümleriyle yenilenir. Özel sayfalar, ürünler ve müşteri kayıtları korunur.'}</p></div><label><input type="checkbox" checked={keepContent} onChange={e=>setKeepContent(e.target.checked)}/>Mevcut ana sayfa içeriğimi koru</label></div>
    {applied&&doc.theme.demoId===applied.id&&<div className="sd-applied" role="status"><Check size={18}/><span><strong>{applied.name} taslakta hazır.</strong> Yayına geçmeden önce inceleyebilirsin.</span><a href={withMerchantScope(`/?surface=${channel==='android'?'android':'storefront'}&preview=draft&v=store-demos-v6`)} target="_blank" rel="noreferrer">Taslağı aç <ArrowUpRight size={14}/></a></div>}
    <div className="sd-demo-grid">{filtered.map((preset,index)=>{
      const active=doc.theme.demoId===preset.id;
      return <article className={`sd-demo-card ${active?'is-current':''}`} key={preset.id} data-demo-id={preset.id}>
        <button type="button" className={`sd-demo-image sd-image-${channel}`} aria-label={`${preset.name} mağazasını incele`} onClick={()=>setPreview(preset)}><img key={`${preset.id}-${channel}`} src={`/media/demos/${preset.id}-${channel}.jpg`} alt={`${preset.name} ${channel==='android'?'Android':'Web'} tasarım görseli`} loading="lazy" onError={e=>{if(e.currentTarget.dataset.fallback)return;e.currentTarget.dataset.fallback='true';e.currentTarget.src=preset.image;}}/><span className="sd-image-number">{String(DESIGN_PRESETS.indexOf(preset)+1).padStart(2,'0')}</span><span className="sd-image-open"><Eye size={17}/> Mağazayı incele</span></button>
        <div className="sd-demo-copy"><div className="sd-demo-topline"><span>{preset.sector}</span>{active&&<strong><Check size={12}/>Taslaktaki tasarım</strong>}</div><h3>{preset.name}</h3><p>{preset.description}</p><dl className="sd-layout-description"><div><dt>Vitrin</dt><dd>{preset.layout.home}</dd></div><div><dt>Ürün kartı</dt><dd>{preset.layout.card}</dd></div><div><dt>Hesap / sepet</dt><dd>{preset.layout.account} · {preset.layout.cart}</dd></div></dl><div className="sd-pages" aria-label={`${preset.name} sayfa kapsamı`}>{pageOptions.map(page=><a key={page.id} href={demoURL(preset,channel,page.id,false,keepContent)} target="_blank" rel="noreferrer">{page.label}</a>)}</div><div className="sd-demo-actions">{onOffer&&<button type="button" className="sp-button sp-button-outline" onClick={()=>onOffer(preset.id)}>Satıcıya sun</button>}<button type="button" className="sp-button sp-button-outline tw-edit" aria-label={`${preset.name} tasarımını düzenle`} onClick={()=>{try{location.assign(workshopURL(createThemeWorkshop(preset.id)));}catch(error){notify(error.message,true);}}}>Tasarımı düzenle</button><button type="button" className="sp-button sp-button-outline" onClick={()=>setPreview(preset)}><Eye size={15}/>İncele</button><button type="button" className="sp-button sp-button-dark" aria-label={`${preset.name} mağaza demosunu uygula`} onClick={()=>apply(preset)}><Check size={15}/>Demoyu uygula</button></div></div>
      </article>;
    })}</div>
    <SectorThemeCollection onOffer={onOffer} query={query} filter={filter} channel={channel}/>
    {!filtered.length&&!hasSectorMatch&&<p className="sd-empty">Aramana uygun tasarım yok. Başka bir ad veya sektörle dene.</p>}
    <p className="sd-gallery-end">Web ve Android tasarımları ayrı seçilir. Pocket, uygulamanın görsel dilini web düzenine taşır; Commerce, mevcut mağazayı uygulamada yorumlar. Diğer mağazalar kendi sektörüne ait ürünler ve keşif biçimleriyle hazırlanır.</p>
    {preview&&<DemoPreview preset={preview} channel={channel} keepContent={keepContent} onClose={()=>setPreview(null)} onApply={apply}/>}
  </div>;
}
