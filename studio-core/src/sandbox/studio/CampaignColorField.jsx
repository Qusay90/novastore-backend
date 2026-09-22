import React,{useEffect,useState} from 'react';
import {resolvedColor} from '../campaignCanvas.js';

const choices=[['@accent','Mağazanın ana rengi'],['@text','Mağazanın yazı rengi'],['@surface','Kartların zemin rengi'],['@background','Sayfanın zemin rengi']];
export default function CampaignColorField({label,value,onChange,theme={},transparent=false}){
 const actual=resolvedColor(value,theme);
 const [hex,setHex]=useState(actual==='transparent'?'#ffffff':actual),[invalid,setInvalid]=useState(false);
 useEffect(()=>{setHex(actual==='transparent'?'#ffffff':actual);setInvalid(false);},[actual]);
 const commitHex=()=>{const clean=hex.trim();if(!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(clean)){setInvalid(true);return;}setInvalid(false);if(clean!==value)onChange(clean);};
 const pick=event=>{const next=event.currentTarget.value;if(next!==value)onChange(next);};
 return <fieldset className="cc-color-field"><legend>{label}</legend>
  <label className="cc-color-current"><input type="color" aria-label={`${label} seç`} value={actual==='transparent'?'#ffffff':actual.length===4?'#'+actual.slice(1).split('').map(c=>c+c).join(''):actual} onInput={pick} onChange={pick}/><span><strong>{value.startsWith('@')?choices.find(([key])=>key===value)?.[1]:value==='transparent'?'Şeffaf':'Özel renk'}</strong><small>{actual==='transparent'?'İçi boş':actual.toUpperCase()} · değiştirmek için renk kutusuna tıkla</small></span></label>
  <label className="cc-field"><span>Renk kodu · Enter ile uygula</span><input aria-label={`${label} HEX kodu`} aria-invalid={invalid} value={hex} maxLength={7} placeholder="#F4A259" onChange={event=>{setHex(event.target.value);setInvalid(false);}} onBlur={commitHex} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitHex();}}}/></label>{invalid&&<p role="alert"># ile başlayan 3 veya 6 haneli bir renk yaz. Örneğin #F4A259.</p>}
  <div className="cc-color-swatches">{choices.map(([key,name])=><button key={key} type="button" aria-label={`${label}: ${name}`} aria-pressed={value===key} title={`${name} · ${resolvedColor(key,theme)}`} onClick={()=>onChange(key)}><i style={{background:resolvedColor(key,theme)}}/><span>{name}</span></button>)}{transparent&&<button type="button" aria-label={`${label}: Şeffaf`} aria-pressed={value==='transparent'} onClick={()=>onChange('transparent')}><i className="cc-transparent-swatch"/><span>Şeffaf</span></button>}</div>
  <p>Mağaza renklerinden birini seçersen, tema değiştiğinde bu renk de ona uyar. Renk kutusuyla seçtiğin özel renk sabit kalır.</p>
 </fieldset>;
}
