import Capability from '../../studio-integration/Capability.jsx';
import {isStudioHost,getStudioHost,assetURL} from '../../studio-integration/context.js';
import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ImagePlus, Upload, X } from 'lucide-react';
import { getTargetOptions, mediaOptions } from '../store.js';

export const BLOCKS = {
  hero: {label:'Ana kampanya', category:'Vitrin', description:'Güçlü bir görsel, başlık ve keşif düğmeleri.'},
  categories:{label:'Kategori seçkisi',category:'Mağaza',description:'Müşteriyi doğru ürün grubuna götür.'},
  products:{label:'Ürün rafı',category:'Mağaza',description:'Bir kategoriden veya koleksiyondan ürünler.'},
  editorial:{label:'Görsel + metin',category:'Vitrin',description:'Markana ve koleksiyonlarına alan aç.'},
  banner:{label:'Kampanya bannerı',category:'Vitrin',description:'Bir fırsatı görseliyle öne çıkar.'},
  announcement:{label:'Duyuru',category:'İçerik',description:'Kısa bir mesaj ve yönlendirme.'},
  text:{label:'Metin alanı',category:'İçerik',description:'Başlık, paragraflar ve bir eylem.'},
  features:{label:'Özellik kartları',category:'İçerik',description:'Hizmetlerini simgelerle anlat.'},
  faq:{label:'Sık sorulan sorular',category:'İçerik',description:'Açılıp kapanan, anlaşılır yanıtlar.'},
  stats:{label:'Rakamlarla anlat',category:'İçerik',description:'Doğrulanmış rakamlarını öne çıkar.'},
  testimonials:{label:'Müşteri yorumları',category:'İçerik',description:'Paylaşma izni olan yorumlara yer ver.'},
  divider:{label:'Ayırıcı',category:'Düzen',description:'İki bölümü ince bir çizgiyle ayır.'},
  spacer:{label:'Boşluk',category:'Düzen',description:'Sayfanın ritmini ayarla.'},
};
export const TABS = {home:'Ana sayfa',categories:'Kategoriler',favorites:'Favoriler',cart:'Sepet',support:'Destek',account:'Hesabım'};
export const clone=value=>JSON.parse(JSON.stringify(value));
export const uid=()=>crypto.randomUUID();
export function Field({label,value,onChange,multiline=false,hint,...props}){return <label className="sp-field"><span>{label}</span>{multiline?<textarea value={value??''} onChange={e=>onChange(e.target.value)} rows={3} {...props}/>:<input value={value??''} onChange={e=>onChange(e.target.value)} onInput={props.type==='datetime-local'?e=>onChange(e.currentTarget.value):undefined} onBlur={props.type==='datetime-local'?e=>onChange(e.currentTarget.value):undefined} {...props}/>} {hint&&<small>{hint}</small>}</label>}
export function Select({label,value,onChange,options,hint,...props}){return <label className="sp-field"><span>{label}</span><select value={value??''} onChange={e=>onChange(e.target.value)} {...props}>{options.map(o=><option key={typeof o==='string'?o:o.value} value={typeof o==='string'?o:o.value} disabled={typeof o==='object'&&o.disabled}>{typeof o==='string'?o:o.label}</option>)}</select>{hint&&<small>{hint}</small>}</label>}
export function Toggle({label,checked,onChange,hint,disabled}){return <label className="sp-toggle"><span><strong>{label}</strong>{hint&&<small>{hint}</small>}</span><input type="checkbox" checked={!!checked} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><i aria-hidden="true"><Check size={11}/></i></label>}
export function Range({label,value,onChange,min=0,max=100,step=1,unit='',format}){return <label className="sp-range"><span>{label}<output>{format?format(value):`${value}${unit}`}</output></span><input aria-label={label} aria-valuetext={format?format(value):`${value}${unit}`} type="range" value={value} min={min} max={max} step={step} onChange={e=>onChange(Number(e.target.value))}/><small><span>{min}{unit}</span><span>{max}{unit}</span></small></label>}
export function Color({label,value,onChange,optional=false}){
  const [draft,setDraft]=useState(value||''),[invalid,setInvalid]=useState(false);
  useEffect(()=>{setDraft(value||'');setInvalid(false);},[value]);
  const valid=code=>/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(code)||(optional&&code==='');
  const expanded=code=>/^#[0-9a-f]{3}$/i.test(code)?`#${code.slice(1).split('').map(char=>char+char).join('')}`:/^#[0-9a-f]{6}$/i.test(code)?code:'#ffffff';
  const commit=()=>{const code=draft.trim().toLowerCase();if(!valid(code)){setInvalid(true);return;}setInvalid(false);setDraft(code);if(code!==(value||''))onChange(code);};
  const apply=code=>{setDraft(code);setInvalid(false);onChange(code);};
  return <label className="sp-color"><span>{label}</span><div><input aria-label={`${label} renk seçici`} type="color" value={expanded(valid(draft)?draft:value||'')} onChange={e=>apply(e.target.value)}/><input aria-label={`${label} renk kodu`} aria-invalid={invalid} value={draft} placeholder={optional?'Temadan al':'#ffffff'} maxLength={7} spellCheck={false} onChange={e=>{setDraft(e.target.value);setInvalid(false);}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDraft(value||'');setInvalid(false);}}}/>{optional&&(value||draft)&&<button type="button" title="Temadan al" aria-label={`${label} rengini temadan al`} onClick={()=>apply('')}><X size={13}/></button>}</div>{invalid&&<small role="status">#fff veya #ffffff biçiminde geçerli bir renk yaz.</small>}</label>;
}
export function Target({document,channel,value,onChange,label='Bağlantı hedefi'}){const options=getTargetOptions(document,channel);return <Capability code="theme.navigation"><Select label={label} value={options.some(option=>option.value===value)?value:''} onChange={next=>{if(next)onChange(next);}} options={[{value:'',label:'Hedef seç',disabled:true},...options]}/></Capability>}
export function Section({title,description,children,actions,capability}){return <Capability code={capability}><section className="sp-settings-section"><header><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{actions}</header>{children}</section></Capability>}
export function MoveButtons({label,index,count,onMove,onDelete}){return <div className="sp-move-buttons"><button aria-label={`${label} yukarı taşı`} disabled={index===0} onClick={()=>onMove(-1)}><ArrowUp size={14}/></button><button aria-label={`${label} aşağı taşı`} disabled={index===count-1} onClick={()=>onMove(1)}><ArrowDown size={14}/></button>{onDelete&&<button aria-label={`${label} sil`} onClick={onDelete}><X size={14}/></button>}</div>}
export function ImageField({label,value,onChange,notify}){
  async function upload(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1_200_000){notify('PNG, JPG veya WebP seç. Görsel en fazla 1,2 MB olabilir.',true);return;} const reader=new FileReader();reader.onload=async()=>{try{if(isStudioHost()){const value=await getStudioHost().ports.uploadAsset(String(reader.result).split(',')[1]);onChange(value);}else onChange(String(reader.result));}catch{notify?.('Görsel sunucuya kaydedilemedi.',true);}};reader.onerror=()=>notify('Görsel okunamadı.',true);reader.readAsDataURL(file);}
  const options=[{value:'',label:'Varsayılan görsel'},...(isStudioHost()?[]:mediaOptions)];if(value&&!options.some(o=>o.value===value))options.push({value,label:'Yüklediğin görsel'});
  return <div className="sp-image-field"><span>{label}</span><div className="sp-image-preview">{value?<img src={assetURL(value)} alt="Seçilen görsel"/>:<ImagePlus size={24}/>}<label><Upload size={13}/> Görsel yükle<input aria-label={`${label} yükle`} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload}/></label></div><Select label={`${label} seçimi`} aria-label={`${label} seçimi`} value={value||''} options={options} onChange={onChange}/></div>
}
