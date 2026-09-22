import React,{useEffect,useId,useState} from 'react';
import {AlignLeft,AlignCenter,AlignRight,SlidersHorizontal,RotateCcw} from 'lucide-react';
import {CAMPAIGN_FONTS,CAMPAIGN_TEXT_WEIGHTS,campaignFontFamily,resolvedColor} from '../campaignCanvas.js';
import CampaignColorField from './CampaignColorField.jsx';

const fontGroups=[...new Set(CAMPAIGN_FONTS.map(font=>font.group))];
// Intermediate input stays local until it is a valid value.
function NumberField({label,value,onChange,min,max,step=1,compact=false}){
 const [draft,setDraft]=useState(String(value));
 useEffect(()=>setDraft(String(value)),[value]);
 return <label className={`cc-field ${compact?'cc-compact-number':''}`}><span className={compact?'cc-sr-only':''}>{label}</span><input type="number" min={min} max={max} step={step} value={draft}
  onChange={e=>{const text=e.target.value;setDraft(text);const next=Number(text);if(text.trim()&&Number.isFinite(next)&&next>=min&&next<=max)onChange(next);}}
  onBlur={()=>setDraft(String(value))}/></label>;
}
export default function CampaignTextControls({layer,theme={},onPatch,onReset}){
 const [panel,setPanel]=useState(null),panelId=useId();
 const decoration=layer.textDecoration||'none';
 const toggleLine=line=>{const lines=new Set(decoration==='none'?[]:decoration.split(' '));lines.has(line)?lines.delete(line):lines.add(line);onPatch('textDecoration',['underline','line-through'].filter(item=>lines.has(item)).join(' ')||'none');};
 const formats=[
  ['Kalın','bold',layer.fontWeight>=700,()=>onPatch('fontWeight',layer.fontWeight>=700?400:700)],
  ['İtalik','italic',layer.fontStyle==='italic',()=>onPatch('fontStyle',layer.fontStyle==='italic'?'normal':'italic')],
  ['Altı çizili','underline',decoration.includes('underline'),()=>toggleLine('underline')],
  ['Üstü çizili','strike',decoration.includes('line-through'),()=>toggleLine('line-through')]
 ];
 return <section className="cc-text-controls cc-text-editor" aria-label="Yazı biçimlendirme">
  <div className="cc-text-heading"><h3>Yazıyı düzenle</h3><small>{CAMPAIGN_FONTS.length} yazı tipi seçeneği</small></div>
  <div className="cc-text-toolbar" role="group" aria-label="Yazı araç çubuğu">
   <label className="cc-field cc-font-family"><span className="cc-sr-only">Yazı tipi</span><select title="Yazı tipi" value={layer.font} onChange={e=>onPatch('font',e.target.value)} style={{fontFamily:campaignFontFamily(layer.font)}}>{fontGroups.map(group=><optgroup key={group} label={group}>{CAMPAIGN_FONTS.filter(font=>font.group===group).map(font=><option key={font.id} value={font.id} style={{fontFamily:font.family}}>{font.label}</option>)}</optgroup>)}</select></label>
   <div className="cc-text-size-row">
    <div className="cc-font-sizing" role="group" aria-label="Yazı boyutunu ayarla"><button aria-label="Yazıyı küçült" title="Yazıyı küçült" disabled={layer.fontSize<=8} onClick={()=>onPatch('fontSize',Math.max(8,layer.fontSize-2))}><span aria-hidden="true">A<sup>−</sup></span></button><NumberField compact label="Yazı boyutu" value={layer.fontSize} min={8} max={144} onChange={v=>onPatch('fontSize',v)}/><button aria-label="Yazıyı büyüt" title="Yazıyı büyüt" disabled={layer.fontSize>=144} onClick={()=>onPatch('fontSize',Math.min(144,layer.fontSize+2))}><span aria-hidden="true">A<sup>+</sup></span></button></div>
    <label className="cc-field cc-font-weight"><span className="cc-sr-only">Yazı kalınlığı</span><select title="Yazı kalınlığı" value={layer.fontWeight} onChange={e=>onPatch('fontWeight',Number(e.target.value))}>{CAMPAIGN_TEXT_WEIGHTS.map(weight=><option key={weight.value} value={weight.value}>{weight.label}</option>)}</select></label>
   </div>
   <div className="cc-text-tool-row">
    <div className="cc-text-format" role="group" aria-label="Yazı biçimi">{formats.map(([label,style,pressed,action])=><button key={label} title={label} aria-label={label} aria-pressed={pressed} onClick={action}><span aria-hidden="true" className={`cc-letter-icon is-${style}`}>{style==='italic'?'T':'A'}</span></button>)}</div>
    <div className="cc-text-align" role="group" aria-label="Yazı hizalama">{[['left','Sola hizala',AlignLeft],['center','Ortala',AlignCenter],['right','Sağa hizala',AlignRight]].map(([value,label,Icon])=><button key={value} aria-label={label} title={label} aria-pressed={layer.align===value} onClick={()=>onPatch('align',value)}><Icon size={17}/></button>)}</div>
   </div>
   <div className="cc-text-extra-tools">
    <button aria-label="Yazı rengini düzenle" title="Yazı rengi" aria-expanded={panel==='color'} aria-controls={panelId} onClick={()=>setPanel(panel==='color'?null:'color')}><span aria-hidden="true" className="cc-color-letter" style={{borderBottomColor:resolvedColor(layer.color,theme)}}>A</span></button>
    <button aria-label="Aralıklar ve harf biçimi" title="Satır, harf aralığı ve diğer yazı ayarları" aria-expanded={panel==='spacing'} aria-controls={panelId} onClick={()=>setPanel(panel==='spacing'?null:'spacing')}><SlidersHorizontal size={17}/></button>
    <button title="Yazı biçimini sıfırla" aria-label="Yazı biçimini sıfırla" onClick={onReset}><RotateCcw size={17}/></button>
   </div>
   <div id={panelId} hidden={!panel} className="cc-text-tool-panel">
    {panel==='color'&&<CampaignColorField label="Yazı rengi" value={layer.color} theme={theme} transparent onChange={value=>onPatch('color',value)}/>}
    {panel==='spacing'&&<><h4>Aralıklar ve harf biçimi</h4><div className="cc-grid"><NumberField label="Satır aralığı" value={layer.lineHeight??1.14} min={.8} max={2.5} step={.05} onChange={v=>onPatch('lineHeight',v)}/><NumberField label="Harf aralığı (%)" value={Math.round((layer.letterSpacing||0)*100)} min={-8} max={50} onChange={v=>onPatch('letterSpacing',v/100)}/></div>
     <label className="cc-field"><span>Kutuda dikey hizalama</span><select value={layer.verticalAlign||'top'} onChange={e=>onPatch('verticalAlign',e.target.value)}><option value="top">Üstte</option><option value="middle">Ortada</option><option value="bottom">Altta</option></select></label>
     <label className="cc-field"><span>Harf biçimi</span><select value={layer.textTransform||'none'} onChange={e=>onPatch('textTransform',e.target.value)}><option value="none">Yazdığım gibi</option><option value="uppercase">BÜYÜK HARF</option><option value="lowercase">küçük harf</option></select></label>
    </>}
   </div>
  </div>
  <label className="cc-field cc-text-entry"><span>Tuval yazısı</span><textarea data-canvas-text-input maxLength={1200} value={layer.text} onChange={e=>onPatch('text',e.target.value)} placeholder="Kampanya başlığını yaz…" style={{fontFamily:campaignFontFamily(layer.font),fontWeight:layer.fontWeight,fontStyle:layer.fontStyle||'normal'}}/></label>
  <p className="cc-help">Biçim seçili yazı kutusuna uygulanır. Boyut tuvalle birlikte ölçeklenir. Cihazda bulunmayan yazı tipi yedek ailesiyle gösterilir.</p>
 </section>;
}
