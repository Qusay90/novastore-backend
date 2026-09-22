import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {getProductsForCategory,getVisibleChildren,resolveCategoryPath} from './integration/runtimeCatalog.js';
import './category-hover-menus.css';

// Uses the active storefront catalog. A theme never fabricates a child category.
export default function CategoryHoverMenus({imageForProduct=product=>product.imageUrl||''}){
 const [active,setActive]=useState(null),panel=useRef(null),current=useRef(null),timer=useRef(null),skipFocus=useRef(false),touchAnchor=useRef(null);
 current.current=active;
 useEffect(()=>{
  const restore=state=>{if(!state)return;for(const [key,value] of Object.entries(state.attrs))value===null?state.anchor.removeAttribute(key):state.anchor.setAttribute(key,value);};
  const cancel=()=>clearTimeout(timer.current);
  const close=()=>{cancel();restore(current.current);current.current=null;setActive(null);};
  const schedule=()=>{cancel();timer.current=setTimeout(close,240);};
  function candidate(target){const a=target?.closest?.('a[href*="#/kategori/"]');if(!a||a.closest('.category-navigation,.category-drawer,.nova-category-popup')||!a.closest('header,nav,[data-module-type="categories"],.demo-category-departments'))return null;return a;}
  function open(anchor){
   if(current.current?.anchor===anchor){cancel();return;}
   let category;try{category=resolveCategoryPath(decodeURIComponent(anchor.hash.slice('#/kategori/'.length)).split('?')[0]);}catch{return;}
   if(!category)return;
   const children=getVisibleChildren(category.id),products=getProductsForCategory(category.id).slice(0,3);
   if(!children.length&&!products.length)return;
   close();const box=anchor.getBoundingClientRect(),width=Math.min(640,innerWidth-24),below=innerHeight-box.bottom;
   const top=below>=180?box.bottom+6:Math.max(12,box.top-Math.min(420,innerHeight-24)),maxHeight=Math.max(120,innerHeight-top-12);
   const next={anchor,category,children,products,width,top,left:Math.max(12,Math.min(box.left,innerWidth-width-12)),maxHeight,attrs:Object.fromEntries(['aria-controls','aria-expanded'].map(k=>[k,anchor.getAttribute(k)]))};
   anchor.setAttribute('aria-controls','nova-category-popup');anchor.setAttribute('aria-expanded','true');current.current=next;setActive(next);
  }
  const over=e=>{if(e.pointerType==='touch')return;if(panel.current?.contains(e.target)){cancel();return;}const a=candidate(e.target);if(a)open(a);};
  const out=e=>{if(!current.current)return;if(current.current.anchor.contains(e.relatedTarget)||panel.current?.contains(e.relatedTarget))return;if(current.current.anchor.contains(e.target)||panel.current?.contains(e.target))schedule();};
  const focus=e=>{if(skipFocus.current||touchAnchor.current?.anchor===e.target)return;if(panel.current?.contains(e.target)){cancel();return;}const a=candidate(e.target);if(a)open(a);else schedule();};
  const pointer=e=>{const a=candidate(e.target);touchAnchor.current=e.pointerType==='touch'&&a?{anchor:a,wasOpen:current.current?.anchor===a}:null;if(panel.current?.contains(e.target))return;if(!a||current.current?.anchor!==a)close();};
  const click=e=>{const a=candidate(e.target),touch=touchAnchor.current;touchAnchor.current=null;if(a&&(e.pointerType==='touch'||touch?.anchor===a)&&!touch?.wasOpen&&document.documentElement.dataset.visualEditing!=='true'){open(a);if(current.current?.anchor===a){e.preventDefault();e.stopPropagation();}}};
  const key=e=>{if(!current.current)return;if(e.key==='Escape'){const a=current.current.anchor;e.preventDefault();close();skipFocus.current=true;a.focus({preventScroll:true});queueMicrotask(()=>skipFocus.current=false);}else if(e.key==='ArrowDown'&&e.target===current.current.anchor){e.preventDefault();panel.current?.querySelector('a')?.focus();}};
  document.addEventListener('pointerover',over);document.addEventListener('pointerout',out);document.addEventListener('focusin',focus);document.addEventListener('pointerdown',pointer);document.addEventListener('click',click,true);document.addEventListener('keydown',key);
  window.addEventListener('hashchange',close);window.addEventListener('resize',close);window.addEventListener('scroll',close);
  return()=>{close();document.removeEventListener('pointerover',over);document.removeEventListener('pointerout',out);document.removeEventListener('focusin',focus);document.removeEventListener('pointerdown',pointer);document.removeEventListener('click',click,true);document.removeEventListener('keydown',key);window.removeEventListener('hashchange',close);window.removeEventListener('resize',close);window.removeEventListener('scroll',close);};
 },[]);
 if(!active)return null;
 const {category,children,products}=active;
 return createPortal(<section ref={panel} id="nova-category-popup" className="nova-category-popup" aria-label={`${category.name} kategorisini keşfet`} style={{position:'fixed',left:active.left,top:active.top,width:active.width,maxHeight:active.maxHeight}}><header><div><small>KATEGORİYİ KEŞFET</small><strong>{category.name}</strong></div><a href={`#/kategori/${category.canonicalPath}`}>Tüm ürünler →</a></header>{children.length>0&&<nav aria-label={`${category.name} alt kategorileri`}>{children.map(child=><a key={child.id} href={`#/kategori/${child.canonicalPath}`}><strong>{child.name}</strong><span>→</span></a>)}</nav>}{products.length>0&&<div className="nova-category-popup-products">{products.map(p=><a key={p.id} href={`#/urun/${p.slug||p.id}`}>{imageForProduct(p)&&<img src={imageForProduct(p)} alt=""/>}<span>{p.name}</span></a>)}</div>}</section>,document.body);
}
