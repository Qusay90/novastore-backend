import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {visualAssets} from '../visual/visualAssets.js';
import {MotionFields} from './VisualMotionFields.jsx';

const searchable=value=>String(value).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i');
export default function VisualIconLibrary({onSelect,onClose,initialAsset,initialAnimation}){
  const [query,setQuery]=useState(''),[category,setCategory]=useState(''),dialog=useRef(null),search=useRef(null),grid=useRef(null),titleId=useId();
  const [selected,setSelected]=useState(initialAsset?{id:visualAssets.iconIdForAsset?.(initialAsset),asset:initialAsset,label:'Mevcut simge'}:null),[animation,setAnimation]=useState(initialAnimation),preview=useRef(null),previewTarget=useRef(null),controller=useRef(null),motionTouched=useRef(false);
  const catalog=useMemo(()=>visualAssets.builtinIcons.map(item=>({...item,category:item.category||'Genel',image:visualAssets.assetDataURL(visualAssets.icon(item.id))})),[]);
  const categories=[...new Set(catalog.map(item=>item.category))];
  const filtered=catalog.filter(item=>(!category||item.category===category)&&searchable(`${item.label} ${item.id} ${item.category} ${(item.terms||[]).join(' ')}`).includes(searchable(query)));
  const shown=selected,asset=shown?.asset||null;
  const choose=item=>{setSelected({id:item.id,label:item.label,asset:visualAssets.icon(item.id)});const recommendation=visualAssets.recommendationForIcon?.(item.id);if(animation?.name==='recommended')setAnimation({...animation,iconId:item.id});else if(!initialAsset&&!initialAnimation&&!motionTouched.current&&recommendation)setAnimation({name:'recommended',iconId:item.id,duration:recommendation.duration});};
  useEffect(()=>{const motion=visualAssets.createMotionController({document,initialRoute:'#/icon-library'});controller.current=motion;return()=>{motion.dispose();controller.current=null;};},[]);
  useEffect(()=>{if(!previewTarget.current)return;preview.current?.remove();preview.current=null;if(asset){const node=visualAssets.createAssetElement(document,asset);node.setAttribute('aria-label','Canlı simge önizlemesi');node.removeAttribute('aria-hidden');node.setAttribute('role','img');previewTarget.current.append(node);preview.current=node;}return()=>{preview.current?.remove();preview.current=null;};},[asset]);
  useEffect(()=>{const motion=animation?.name==='recommended'&&shown?.id?{...animation,iconId:shown.id}:animation;controller.current?.sync(asset&&motion&&preview.current?[{key:'library-preview',element:preview.current,eventTarget:previewTarget.current,animation:motion}]:[],'#/icon-library');},[asset,animation]);
  useEffect(()=>{
    const previous=document.activeElement;search.current?.focus();const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();return;}
      if(event.key!=='Tab')return;const items=[...dialog.current.querySelectorAll('button:not(:disabled),input,select,[tabindex="0"]')],first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';document.addEventListener('keydown',keydown,true);
    return()=>{document.removeEventListener('keydown',keydown,true);document.body.style.overflow=previousOverflow;if(previous?.isConnected)previous.focus();};
  },[onClose]);
  function move(event,index){
    const items=[...grid.current.querySelectorAll('button')],columns=getComputedStyle(grid.current).gridTemplateColumns.split(' ').length;
    const next={ArrowRight:index+1,ArrowLeft:index-1,ArrowDown:index+columns,ArrowUp:index-columns,Home:0,End:items.length-1}[event.key];
    if(next===undefined)return;event.preventDefault();items[Math.min(items.length-1,Math.max(0,next))]?.focus();
  }
  return createPortal(<div className="va-library-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={dialog} className="va-library" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <header><div><small>NOVA STORE TASARIM ARAÇLARI</small><h2 id={titleId}>Simge kütüphanesi</h2><p>{catalog.length} simge · simgeyi ve hareketini birlikte dene.</p></div><button type="button" aria-label="Simge kütüphanesini kapat" onClick={onClose}>×</button></header>
    <div className="va-library-filters"><label><span>Simge ara</span><input ref={search} aria-label="Simge ara" value={query} placeholder="Sepet, kalp, teslimat…" onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();grid.current.querySelector('button')?.focus();}if(event.key==='Enter'&&filtered[0])choose(filtered[0]);}}/></label><label><span>Kategori</span><select aria-label="Simge kategorisi" value={category} onChange={event=>setCategory(event.target.value)}><option value="">Tüm kategoriler</option>{categories.map(name=><option key={name} value={name}>{name}</option>)}</select></label></div>
    <p className="va-library-count" role="status">{filtered.length} simge gösteriliyor</p>
    <div className="va-library-body"><div ref={grid} className="va-library-grid" aria-label="Simgeler">{filtered.map((item,index)=><button type="button" key={item.id} data-icon-id={item.id} aria-pressed={selected?.id===item.id} aria-label={`${item.label} simgesini seç`} onKeyDown={event=>move(event,index)} onClick={()=>choose(item)}><img src={item.image} alt=""/><span>{item.label}</span></button>)}{!filtered.length&&<p className="va-library-empty">Aramana uygun simge bulunamadı. Başka bir ad veya kategori dene.</p>}</div>
    <aside className="va-library-motion" aria-label="Simge ve animasyon önizlemesi"><div className="va-library-live"><button ref={previewTarget} type="button" aria-label="Seçili simge hareketini dene" disabled={!asset}>{!asset&&<span>Bir simge seç</span>}</button><strong>{shown?.label||'Canlı önizleme'}</strong><small>{animation?.trigger==='hover'?'Örneğin üzerine gelerek hareketi dene.':animation?.trigger==='click'?'Örneğe tıklayarak hareketi dene.':'Hareketi bu örnek üzerinde deneyebilirsin.'}</small></div><MotionFields prefix="Önizleme" value={animation} iconId={selected?.id} onChange={value=>{motionTouched.current=true;setAnimation(value);}} onPreview={()=>controller.current?.preview('library-preview')}/><p className="va-hint">Seçimi tamamlayana kadar sayfadaki öğe değişmez.</p></aside></div>
    <footer><small>Ok tuşlarıyla gezin · Enter ile seç · Esc ile vazgeç</small><div><button type="button" onClick={onClose}>İptal</button><button type="button" className="va-library-confirm" disabled={!selected} onClick={()=>onSelect(visualAssets.normalizeAsset(selected.asset),animation?visualAssets.normalizeAnimation(animation):undefined)}>Seçimi tamamla</button></div></footer>
  </section></div>,document.body);
}
