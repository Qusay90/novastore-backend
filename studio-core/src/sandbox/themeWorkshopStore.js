import {getDocument,normalizeDocument} from './store.js';
import {DESIGN_PRESETS,applyDemo} from './designLibrary.js';
import {getCurrentMerchant,withMerchantScope} from './merchantWorkspaces.js';

// Independent local library. No function in this module writes the site store.
export const WORKSHOP_KEY='novastore-edited-themes:v1'+(getCurrentMerchant()?`:shop:${getCurrentMerchant().id}`:'');
const copy=value=>JSON.parse(JSON.stringify(value));
const empty={version:1,items:[]},listeners=new Set(),histories=new Map();
let cachedRaw,cache=empty;
export function workshopId(){return typeof location==='undefined'?'':new URLSearchParams(location.search).get('themeWorkshop')||'';}
function read(){
  const raw=localStorage.getItem(WORKSHOP_KEY);
  if(raw===cachedRaw)return cache;
  const next=raw?JSON.parse(raw):{version:1,items:[]};
  if(next.version!==1||!Array.isArray(next.items)||next.items.length>40)throw new Error('Tema kütüphanesi okunamadı. Kayıtlar değiştirilmedi.');
  for(const item of next.items){
    if(!item||typeof item.id!=='string'||typeof item.name!=='string'||!item.channels)throw new Error('Tema kaydı geçersiz.');
    for(const channel of ['web','android']){
      const entry=item.channels[channel];if(!entry?.draft||!entry?.published)throw new Error('Tema kanalı eksik.');
      entry.draft=normalizeDocument(entry.draft,channel);entry.published=normalizeDocument(entry.published,channel);
    }
  }
  cache=next;cachedRaw=raw;return cache;
}
function write(next){
  const raw=JSON.stringify(next);
  try{localStorage.setItem(WORKSHOP_KEY,raw);}catch{throw new Error('Tema kaydedilemedi. Tarayıcı depolaması dolu veya kullanılamıyor; önceki kayıt korunuyor.');}
  cachedRaw=raw;cache=next;listeners.forEach(fn=>fn());
}
export const getWorkshopLibrary=()=>read();
export function subscribeWorkshop(listener){listeners.add(listener);return()=>listeners.delete(listener);}
if(typeof window!=='undefined')window.addEventListener('storage',event=>{if(event.key===WORKSHOP_KEY||event.key===null){cachedRaw=undefined;histories.clear();listeners.forEach(fn=>fn());}});
export function getWorkshop(id=workshopId()){
  const item=read().items.find(item=>item.id===id);
  if(!item)throw new Error('Düzenlenecek tema bulunamadı. Düzenlenmiş temalar bölümünden bir kayıt aç.');
  return item;
}
export function workshopURL(id){return withMerchantScope(`/?surface=admin&themeWorkshop=${encodeURIComponent(id)}&panel=editor`);}
function nameValue(name){const value=String(name||'').trim();if(value.length<2||value.length>80)throw new Error('Tema adı 2–80 karakter olmalı.');return value;}
function insert(item){const next=copy(read());if(next.items.length>=40)throw new Error('Bu çalışma alanında en fazla 40 tema saklanabilir.');next.items.unshift(item);write(next);return item.id;}
function newId(){return crypto.randomUUID();}
export function createThemeWorkshop(presetId){
  const preset=DESIGN_PRESETS.find(p=>p.id===presetId);if(!preset)throw new Error('Hazır tasarım bulunamadı.');
  const channels={};for(const channel of ['web','android']){
    const doc=normalizeDocument(applyDemo(getDocument(channel,false),preset.id,channel),channel);
    channels[channel]={draft:copy(doc),published:copy(doc),revision:1,history:[]};
  }
  const now=new Date().toISOString();return insert({id:newId(),name:`${preset.name} · çalışma kopyası`,source:preset.id,kind:'working',createdAt:now,updatedAt:now,channels});
}
export function getWorkshopDocument(channel,preview=true){return copy(getWorkshop().channels[channel][preview?'draft':'published']);}
export function saveWorkshopDraft(channel,document){
  const normalized=normalizeDocument(document,channel),next=copy(read()),item=next.items.find(i=>i.id===workshopId());
  if(!item)throw new Error('Tema bulunamadı.');
  const previous=item.channels[channel].draft;if(JSON.stringify(previous)===JSON.stringify(normalized))return;
  item.channels[channel].draft=normalized;item.updatedAt=new Date().toISOString();write(next);
  const h=history(channel);h.past.push(copy(previous));h.past=h.past.slice(-40);h.future=[];
}
function history(channel){const key=`${workshopId()}:${channel}`;if(!histories.has(key))histories.set(key,{past:[],future:[]});return histories.get(key);}
export function workshopHistory(channel){const h=history(channel);return{canUndo:h.past.length>0,canRedo:h.future.length>0};}
function travel(channel,reverse){const h=history(channel),from=reverse?h.future:h.past,to=reverse?h.past:h.future;if(!from.length)return;const next=copy(read()),item=next.items.find(i=>i.id===workshopId()),previous=copy(item.channels[channel].draft);item.channels[channel].draft=copy(from.at(-1));item.updatedAt=new Date().toISOString();write(next);from.pop();to.push(previous);}
export const undoWorkshop=channel=>travel(channel,false);
export const redoWorkshop=channel=>travel(channel,true);
export function saveWorkshopAs(name){
  const source=getWorkshop(),item=copy(source);item.id=newId();item.name=nameValue(name);item.kind='theme';item.createdAt=item.updatedAt=new Date().toISOString();
  for(const channel of ['web','android']){const doc=copy(item.channels[channel].draft);item.channels[channel]={draft:doc,published:copy(doc),revision:1,history:[]};}
  return insert(item);
}
export function saveWorkshop(){
  const next=copy(read()),item=next.items.find(i=>i.id===workshopId());if(!item)throw new Error('Tema bulunamadı.');
  for(const entry of Object.values(item.channels)){entry.published=copy(entry.draft);entry.revision+=1;}
  item.updatedAt=new Date().toISOString();write(next);
}
