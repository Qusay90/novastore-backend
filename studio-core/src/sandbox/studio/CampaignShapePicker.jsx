import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,ChevronDown,Search,Shapes,X} from 'lucide-react';
import {CAMPAIGN_SHAPES,CAMPAIGN_SHAPE_CATEGORIES} from '../campaignShapes.js';
import './campaign-shape-picker.css';

const PAGE_SIZE=60;
const searchable=value=>String(value||'').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ı/g,'i').trim();

function ShapePreview({shape,outline=false}){
  return <svg viewBox={shape.viewBox} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet"><path d={shape.path} fill={outline?'none':'currentColor'} stroke={outline?'currentColor':'none'} strokeWidth={outline?2:0} strokeLinejoin="round" strokeLinecap="round" fillRule={shape.fillRule} clipRule={shape.fillRule}/></svg>;
}

export default function CampaignShapePicker({onSelect,onClose}){
  const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[limit,setLimit]=useState(PAGE_SIZE),[selected,setSelected]=useState(null),[outline,setOutline]=useState(false);
  const dialog=useRef(null),search=useRef(null),list=useRef(null),nextFocus=useRef(''),closeRef=useRef(onClose),titleId=useId(),descriptionId=useId(),listId=useId();
  closeRef.current=onClose;
  const categoryLabels=useMemo(()=>new Map(CAMPAIGN_SHAPE_CATEGORIES.map(item=>[item.id,item.label])),[]);
  const catalog=useMemo(()=>CAMPAIGN_SHAPES.map(shape=>({shape,search:searchable(`${shape.label} ${shape.id} ${categoryLabels.get(shape.category)||shape.category}`)})),[categoryLabels]);
  const filtered=useMemo(()=>{
    const words=searchable(query).split(/\s+/).filter(Boolean);
    return catalog.filter(item=>(!category||item.shape.category===category)&&words.every(word=>item.search.includes(word))).map(item=>item.shape);
  },[catalog,query,category]);
  const visible=filtered.slice(0,limit);

  useEffect(()=>{
    const previous=document.activeElement,overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';search.current?.focus();
    const focusables=()=>[...dialog.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(element=>element.getClientRects().length);
    const keydown=event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeRef.current();return;}
      if(event.key!=='Tab')return;
      const items=focusables(),first=items[0],last=items.at(-1),inside=dialog.current.contains(document.activeElement);
      if(!items.length){event.preventDefault();dialog.current.focus();return;}
      if(event.shiftKey&&(!inside||document.activeElement===first)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(!inside||document.activeElement===last)){event.preventDefault();first.focus();}
    };
    const keepFocus=event=>{if(dialog.current&&!dialog.current.contains(event.target))search.current?.focus();};
    document.addEventListener('keydown',keydown,true);document.addEventListener('focusin',keepFocus,true);
    return()=>{
      document.removeEventListener('keydown',keydown,true);document.removeEventListener('focusin',keepFocus,true);
      document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();
    };
  },[]);
  useEffect(()=>{setLimit(PAGE_SIZE);if(list.current)list.current.scrollTop=0;nextFocus.current='';},[query,category]);
  useEffect(()=>{
    if(!nextFocus.current)return;
    const button=[...list.current.querySelectorAll('[data-shape-id]')].find(item=>item.dataset.shapeId===nextFocus.current);
    nextFocus.current='';button?.focus();button?.scrollIntoView({block:'nearest'});
  },[limit]);
  function showMore(){nextFocus.current=filtered[limit]?.id||'';setLimit(current=>current+PAGE_SIZE);}
  function clearFilters(){setQuery('');setCategory('');search.current?.focus();}

  return createPortal(<div className="csp-backdrop" onKeyDown={event=>event.stopPropagation()} onPointerDown={event=>{event.stopPropagation();if(event.target===event.currentTarget)onClose();}} onClick={event=>event.stopPropagation()}>
    <section className="csp-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1}>
      <header className="csp-header"><div><span className="csp-eyebrow">NOVA STORE · TASARIM ATÖLYESİ</span><h2 id={titleId}>Şekil kütüphanesi</h2><p id={descriptionId}>{CAMPAIGN_SHAPES.length} hazır şekil. Kompozisyonuna bir katman daha ekle.</p></div><button type="button" className="csp-close" aria-label="Şekil kütüphanesini kapat" onClick={onClose}><X size={21}/></button></header>
      <div className="csp-filters"><label className="csp-search"><span>Şekil ara</span><div><Search size={18} aria-hidden="true"/><input ref={search} value={query} onChange={event=>setQuery(event.target.value)} placeholder="Yıldız, etiket, çiçek…" type="search" autoComplete="off"/></div></label><label className="csp-category"><span>Kategori</span><select value={category} onChange={event=>setCategory(event.target.value)}><option value="">Tüm kategoriler</option>{CAMPAIGN_SHAPE_CATEGORIES.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
      <div className="csp-body"><div className="csp-collection"><div className="csp-results"><p role="status" aria-live="polite">{filtered.length?`${filtered.length} şekilden ${visible.length} tanesi gösteriliyor`:'Aramana uygun şekil bulunamadı.'}</p>{(query||category)&&<button type="button" onClick={clearFilters}>Filtreleri temizle</button>}</div><div className="csp-scroll" ref={list}><div className="csp-grid" id={listId} aria-label="Hazır şekiller">{visible.map(shape=><button type="button" className={`csp-tile${selected?.id===shape.id?' is-selected':''}`} key={shape.id} data-shape-id={shape.id} aria-label={`${shape.label} şeklini seç`} aria-pressed={selected?.id===shape.id} onClick={()=>setSelected(shape)}><span className="csp-tile-art"><ShapePreview shape={shape}/></span><span className="csp-tile-label">{shape.label}</span>{selected?.id===shape.id&&<Check className="csp-selected-mark" size={14} aria-hidden="true"/>}</button>)}</div>{!filtered.length&&<div className="csp-empty"><Search size={32} aria-hidden="true"/><strong>Bir başka şekil deneyelim.</strong><p>Adını kısaltabilir veya tüm kategorilere bakabilirsin.</p><button type="button" onClick={clearFilters}>Tüm şekilleri göster</button></div>}{visible.length<filtered.length&&<button type="button" className="csp-more" aria-controls={listId} onClick={showMore}>Sonraki {Math.min(PAGE_SIZE,filtered.length-visible.length)} şekli göster <ChevronDown size={16} aria-hidden="true"/></button>}</div></div>
        <aside className="csp-preview" aria-label="Seçili şekil önizlemesi"><span className="csp-eyebrow">YAKINDAN BAK</span><div className={`csp-preview-art${selected?'':' is-empty'}`}>{selected?<ShapePreview shape={selected} outline={outline}/>:<Shapes size={56} strokeWidth={1.2} aria-hidden="true"/>}</div><div className="csp-preview-description" aria-live="polite"><h3>{selected?.label||'Bir şekil seç'}</h3><p>{selected?categoryLabels.get(selected.category)||selected.category:'Önizlemesini görmek için soldaki şekillerden birine tıkla.'}</p></div><fieldset className="csp-preview-mode" disabled={!selected}><legend>Önizleme biçimi</legend><div><button type="button" aria-pressed={!outline} onClick={()=>setOutline(false)}>Dolgulu</button><button type="button" aria-pressed={outline} onClick={()=>setOutline(true)}>Çerçeve</button></div></fieldset><p className="csp-hint">Bu seçim yalnız önizlemeyi değiştirir. Rengini, dolgusunu, ölçüsünü ve konumunu tuvalde düzenleyebilirsin.</p></aside>
      </div>
      <footer className="csp-footer"><p>{selected?<><Check size={16} aria-hidden="true"/><span>{selected.label} seçildi</span></>:<span>Şekli kullanmadan önce önizlemede incele.</span>}</p><div><button type="button" className="csp-cancel" onClick={onClose}>Vazgeç</button><button type="button" className="csp-confirm" disabled={!selected} onClick={()=>selected&&onSelect(selected)}>Şekli kullan <Check size={16} aria-hidden="true"/></button></div></footer>
    </section>
  </div>,document.body);
}
