import React from 'react';
import {ArrowUpRight,Eye,Pencil} from 'lucide-react';
import registry from '../sectorThemeRegistry.json';

// The demo library owns its isolated renderer and editing storage.
// A production host is configured by the future adapter, never inferred from a tenant URL.
const base='/theme-library/';
export default function SectorThemeCollection({query='',filter='all',channel='web',onOffer}){
 const themes=registry.themes.filter(t=>['all','sector'].includes(filter)&&`${t.name} ${t.sector} ${t.description}`.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
 if(!themes.length)return null;
 return <section className="sd-sector-collection" aria-label="Yeni sektör tasarımları">
  <div className="sd-gallery-intro"><div><span className="sd-eyebrow">NOVA STORE / SEKTÖR KOLEKSİYONU</span><h2>Yeni mağazan için ayrı bir karakter.</h2><p>{registry.themes.length} tasarımın web ve uygulama önizlemeleri. Seç, çalışma kopyasını düzenle ve kendi teman olarak kaydet.</p></div></div>
  <div className="sd-demo-grid">{themes.map(t=><article className="sd-demo-card" key={t.id} data-sector-theme={t.id}>
   <a className="sd-demo-image sd-image-web" href={base+t.entries[channel==='android'?'app':'web']} target="_blank" rel="noreferrer" aria-label={`${t.name} yeni tasarımını incele`}><img src={t.thumbnail} alt={`${t.name} web ve uygulama tasarımı`} loading="lazy"/><span className="sd-image-open"><Eye size={17}/>Mağazayı incele</span></a>
   <div className="sd-demo-copy"><div className="sd-demo-topline"><span>{t.sector}</span><strong>Demo tema</strong></div><h3>{t.name}</h3><p>{t.description}</p>
    <div className="sd-pages"><a href={base+t.entries.web} target="_blank" rel="noreferrer">Web önizleme <ArrowUpRight size={12}/></a><a href={base+t.entries.app} target="_blank" rel="noreferrer">Uygulama önizleme <ArrowUpRight size={12}/></a></div>
    <div className="sd-demo-actions">{onOffer&&<button type="button" className="sp-button sp-button-outline" onClick={()=>onOffer(t.id)}>Satıcıya sun</button>}<a className="sp-button sp-button-dark" href={base+t.editor} target="_blank" rel="noreferrer" aria-label={`${t.name} sektör tasarımını düzenle`}><Pencil size={15}/>Tasarımı düzenle</a></div>
   </div>
  </article>)}</div>
 </section>;
}
