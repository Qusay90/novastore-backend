import React,{useEffect,useLayoutEffect,useState} from 'react';
import {visualDesignCSS,visualLabel} from '../visualDesign.js';
import {applyVisualContent,discoverVisualTargets,identifyVisualTarget} from './visualTargets.js';
import {applyVisualEnhancements,clearVisualEnhancements,previewVisualMotion,VISUAL_ASSET_CSS} from './visualAssetRuntime.js';

export default function VisualEditingLayer({document:siteDocument,channel='web',transientOrder=true}){
  const [outline,setOutline]=useState(null);
  const [editing,setEditing]=useState(()=>new URLSearchParams(location.search).get('studio')==='1');
  const [inserting,setInserting]=useState(false);
  const design=siteDocument.design;
  useEffect(()=>{const receive=event=>{if(parent===window||event.origin!==location.origin||event.source!==parent)return;const data=event.data;if(data?.type==='novastore-studio-set-editing'&&typeof data.enabled==='boolean'){setEditing(data.enabled);setInserting(data.enabled&&data.insert===true);}};window.addEventListener('message',receive);if(parent!==window)parent.postMessage({type:'novastore-studio-ready',capabilities:{transientOrder}},location.origin);return()=>window.removeEventListener('message',receive);},[transientOrder]);
  useLayoutEffect(()=>{window.document.documentElement.dataset.visualEditing=String(editing);return()=>delete window.document.documentElement.dataset.visualEditing;},[editing]);
  useLayoutEffect(()=>{window.document.documentElement.dataset.visualSurface=channel;return()=>delete window.document.documentElement.dataset.visualSurface;},[channel]);
  useLayoutEffect(()=>{
    const root=window.document;let pending=0,disposed=false;
    const sync=()=>{pending=0;if(disposed)return;discoverVisualTargets(root);applyVisualContent(root,design,channel);applyVisualEnhancements(root,design,channel);};
    sync();
    const schedule=()=>{if(!pending)pending=requestAnimationFrame(sync);};const observer=new MutationObserver(schedule);window.addEventListener('resize',schedule);
    observer.observe(root.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','srcset','alt','data-cal-id','data-product-id','data-view']});
    return()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',schedule);if(pending)cancelAnimationFrame(pending);};
  },[design,channel]);
  useEffect(()=>()=>clearVisualEnhancements(window.document),[]);
  useEffect(()=>{
    if(!editing||inserting)return;let drag=null;
    const down=event=>{const node=event.target.closest?.('[data-visual-decoration-id]');if(!node||event.button!==0||!node.__novaOverlayAnchor)return;const rect=node.__novaOverlayAnchor.getBoundingClientRect();event.preventDefault();event.stopPropagation();node.setPointerCapture(event.pointerId);drag={node,rect,startX:event.clientX,startY:event.clientY,position:{...node.__novaOverlayPosition},transform:node.style.transform,pointer:event.pointerId};};
    const move=event=>{if(!drag)return;event.preventDefault();drag.node.style.transform=`translate(calc(-50% + ${event.clientX-drag.startX}px),calc(-50% + ${event.clientY-drag.startY}px))`;};
    const finish=event=>{if(!drag)return;const d=drag;drag=null;d.node.style.transform=d.transform;if(d.node.hasPointerCapture(d.pointer))d.node.releasePointerCapture(d.pointer);if(event.type==='pointercancel'||Math.abs(event.clientX-d.startX)+Math.abs(event.clientY-d.startY)<3)return;parent.postMessage({type:'novastore-studio-move-icon',elementId:d.node.dataset.visualDecorationFor,decorationId:d.node.dataset.visualDecorationId,x:Math.max(0,Math.min(100,d.position.x+(event.clientX-d.startX)/Math.max(1,d.rect.width)*100)),y:Math.max(0,Math.min(100,d.position.y+(event.clientY-d.startY)/Math.max(1,d.rect.height)*100))},location.origin);};
    const doc=window.document;doc.addEventListener('pointerdown',down,true);doc.addEventListener('pointermove',move,true);doc.addEventListener('pointerup',finish,true);doc.addEventListener('pointercancel',finish,true);return()=>{if(drag){drag.node.style.transform=drag.transform;if(drag.node.hasPointerCapture(drag.pointer))drag.node.releasePointerCapture(drag.pointer);}doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('pointermove',move,true);doc.removeEventListener('pointerup',finish,true);doc.removeEventListener('pointercancel',finish,true);};
  },[editing,inserting]);
  useEffect(()=>{if(!editing)return;const escape=event=>{if(event.key==='Escape'&&!window.document.querySelector('[role="dialog"]'))parent.postMessage({type:'novastore-studio-escape'},location.origin);};window.document.addEventListener('keydown',escape);return()=>window.document.removeEventListener('keydown',escape);},[editing]);
  useEffect(()=>{if(!editing)return;const receive=event=>{if(event.origin!==location.origin||event.source!==parent)return;const data=event.data;if(data?.type==='novastore-studio-preview-motion'&&typeof data.elementId==='string'&&(data.placement===undefined||typeof data.placement==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(data.placement)))previewVisualMotion(window.document,data.elementId,data.placement);};window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);},[editing]);
  useEffect(()=>{
    if(!editing)return;
    function identify(event){return identifyVisualTarget(event.target,channel,{container:inserting||event.altKey});}
    function highlight(event){const found=identify(event);if(!found){setOutline(null);return;}const rect=found.element.getBoundingClientRect();setOutline({id:found.id,top:rect.top,left:rect.left,width:rect.width,height:rect.height});}
    function select(event){const found=identify(event);if(!found)return;event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();const rect=found.element.getBoundingClientRect();window.parent.postMessage({type:inserting?'novastore-studio-place-icon':'novastore-studio-select-element',elementId:found.id,blockId:found.blockId||null,...(inserting?{x:Math.max(0,Math.min(100,(event.clientX-rect.left)/Math.max(1,rect.width)*100)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)/Math.max(1,rect.height)*100))}:{})},location.origin);highlight(event);}
    function reset(){setOutline(null);}
    window.document.addEventListener('click',select,true);window.document.addEventListener('pointerover',highlight,true);window.addEventListener('scroll',reset,true);
    return()=>{window.document.removeEventListener('click',select,true);window.document.removeEventListener('pointerover',highlight,true);window.removeEventListener('scroll',reset,true);};
  },[editing,inserting,channel]);
  return <>
    <style data-visual-asset-styles>{VISUAL_ASSET_CSS}</style>
    <style data-visual-styles>{visualDesignCSS(design,channel)}</style>
    {editing&&<style>{`[data-module-id],header.site-header, .customer-product-card,.os-product-card,[data-visual-category-id],[data-visual-item-text],[data-visual-item-image]{cursor:crosshair!important}.visual-selection-outline{position:fixed;pointer-events:none;border:2px solid #3874de;z-index:2147483000;box-sizing:border-box;border-radius:3px}.visual-selection-label{position:absolute;top:0;left:0;background:#3874de;color:white;font:600 11px/1.3 system-ui;padding:4px 7px;border-radius:0 0 4px 0;white-space:nowrap}`}</style>}
    {editing&&outline&&<div data-visual-overlay className="visual-selection-outline" style={{top:outline.top,left:outline.left,width:outline.width,height:outline.height}}><span className="visual-selection-label">{visualLabel(outline.id)} · Düzenle</span></div>}
  </>;
}
