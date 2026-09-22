import React from 'react';
import Capability from './Capability.jsx';
import {Color,Field,ImageField,Range,Section,Select,Toggle} from '../sandbox/studio/Controls.jsx';
import {getTargetOptions} from '../sandbox/store.js';
import {setVisualContent} from '../sandbox/visualDesign.js';
import {classicHeroTargetAllowed} from './classic-editor-policy.js';
import {presentationLabel} from './presentation-editor-policy.js';

export function ClassicEditingNotice({doc}){return <div className="sp-info-note" role="note"><strong>{presentationLabel(doc)} · Bağlı düzenleme kapsamı</strong><p>Desteklenen metin, kampanya görseli, marka, renk ve görünürlük alanları düzenlenebilir. Ürünler, fiyatlar ve kategoriler mağazadan gelir. Bölüm ekleme/sıralama, yeni sayfa, menü ve dönem paketi bağlantısı henüz desteklenmiyor. Özgün yerel atölyedeki araçlar ayrı çalışır.</p></div>;}

export function ClassicBlockInspector({block,document,channel,updateBlock,notify,selectElement}){
  if(!block)return <aside className="sp-inspector"><div className="sp-inspector-scroll"><h2>Görünümü incele</h2><p>Bu sayfanın içeriği gerçek mağaza akışından gelir. Görsel ayarı değiştirmek için önizlemeden bir öğe seçebilirsin.</p></div></aside>;
  const atelier=presentationLabel(document)==='Atelier',hero=block.type==='hero',image=hero||block.id==='classic-story',customHero=atelier||!!(block.title||block.description||block.image),copy=!(atelier&&block.type==='categories');
  return <aside className="sp-inspector"><header className="sp-inspector-head"><div><small>{presentationLabel(document)} · SABİT BÖLÜM</small><h2>{hero?'Ana kampanya':block.type==='editorial'?'Marka öyküsü':block.type==='products'?'Ürün seçkisi':'Kategoriler'}</h2></div></header><div className="sp-inspector-scroll">
    <p className="sp-hint">Bölümün yeri ve ürün kaynağı özgün tema düzenine bağlıdır.</p>
    {copy&&<><Field label="Başlık" value={block.title} multiline maxLength={160} onChange={value=>updateBlock('title',value)}/>
    <Field label="Açıklama" value={block.description} multiline maxLength={5000} onChange={value=>updateBlock('description',value)}/></>}
    {image&&<Capability code="theme.assets"><ImageField label="Bölüm görseli" value={block.image} onChange={value=>updateBlock('image',value)} notify={notify}/><Field label="Görsel açıklaması" value={block.alt} maxLength={200} onChange={value=>updateBlock('alt',value)}/></Capability>}
    {hero&&<><p className="sp-hint">{atelier?'Kampanya fotoğrafı ve metni özgün editoryal düzende gösterilir.':'Özel başlık, açıklama veya görsel kullanıldığında ürün slaytı yerine kampanya görünür ve fiyat kartı gizlenir. Üçünü de boş bırakırsan gerçek ürünlerin slaytı geri gelir.'}</p><Field disabled={!customHero} label="Kampanya düğmesi yazısı" value={block.buttonText} maxLength={60} onChange={value=>updateBlock('buttonText',value)}/><Capability code="theme.navigation"><Select disabled={!customHero} label="Kampanya hedefi" value={block.target} options={getTargetOptions(document,channel).filter(item=>classicHeroTargetAllowed(item.value))} onChange={value=>updateBlock('target',value)}/></Capability></>}
    <Toggle label="Bölüm görünür" checked={block.enabled!==false} onChange={value=>updateBlock('enabled',value)}/>
    <Capability code="theme.advanced_blocks"><button type="button" className="sp-button sp-button-outline sp-full" onClick={()=>selectElement(`block:${block.id}:section`,block.id)}>Seçili bölümün görsel ayarları</button></Capability>
    <p className="sp-info-note">Ekleme, çoğaltma, silme, ürün seçimi, bölüm sırası ve gösterim takvimi bu bağlı tasarımda kapalıdır.</p>
  </div></aside>;
}

export function ClassicThemeSettings({doc,update}){
  return <div className="sp-settings-content"><Section capability="theme.colors" title="Tema renkleri" description="Özgün düzen korunur; renkler doğrulanmış tema çizimine uygulanır."><div className="sp-form-grid">{[['accent','Vurgu'],['background','Sayfa zemini'],['surface','Yüzey'],['text','Yazı'],['muted','İkincil yazı'],['border','Kenarlık']].map(([key,label])=><Color key={key} label={label} value={doc.theme[key]} onChange={value=>update(next=>{next.theme[key]=value;})}/>)}</div></Section><Section capability="theme.typography" title="Yazı ve köşeler"><Select label="Yazı ailesi" value={doc.theme.fontFamily} options={['Inter','Arial','Georgia','system']} onChange={value=>update(next=>{next.theme.fontFamily=value;})}/><Range label="Köşe yuvarlaklığı" min={0} max={40} unit=" px" value={doc.theme.radius} onChange={value=>update(next=>{next.theme.radius=value;})}/></Section><ClassicEditingNotice doc={doc}/></div>;
}

export function ClassicChromeSettings({doc,update,notify}){
  const logo=doc.design.elements.find(item=>item.id==='logoImage')?.content?.imageUrl||'';
  return <div className="sp-settings-content"><Section capability="theme.logo" title="Marka"><Field label="Logo metni" value={doc.chrome.header.logoText} maxLength={60} onChange={value=>update(next=>{next.chrome.header.logoText=value;})}/><ImageField label="Logo görseli" value={logo} notify={notify} onChange={value=>update(next=>{next.design=setVisualContent(next.design,'logoImage','imageUrl',value||undefined);})}/></Section><Section capability="theme.header" title="Üst alan"><Toggle label="Üst alan görünür" checked={doc.design.header} onChange={value=>update(next=>{next.design.header=value;})}/><Toggle label="Arama alanı görünür" checked={doc.chrome.header.showSearch} onChange={value=>update(next=>{next.chrome.header.showSearch=value;})}/><Capability code="theme.navigation"><Toggle label="Gezinme alanı görünür" checked={doc.design.navigation} onChange={value=>update(next=>{next.design.navigation=value;})}/></Capability>{[['background','Üst alan zemini'],['textColor','Üst alan yazısı']].map(([key,label])=><Color key={key} label={label} value={doc.chrome.header[key]} onChange={value=>update(next=>{next.chrome.header[key]=value;})}/>)}</Section><Section capability="theme.footer" title="Alt alan"><Toggle label="Alt alan görünür" checked={doc.design.footer} onChange={value=>update(next=>{next.design.footer=value;})}/>{[['background','Alt alan zemini'],['textColor','Alt alan yazısı']].map(([key,label])=><Color key={key} label={label} value={doc.chrome.footer[key]} onChange={value=>update(next=>{next.chrome.footer[key]=value;})}/>)}</Section><ClassicEditingNotice doc={doc}/></div>;
}
