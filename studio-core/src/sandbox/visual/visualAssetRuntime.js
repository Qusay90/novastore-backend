import {parseVisualElement,visualSelector} from '../visualDesign.js';
import {createVisualAssetNode,visualAssets} from './visualAssets.js';

const roots=new WeakMap(),controllers=new WeakMap(),motionOwners=new WeakMap(),positions=new WeakMap(),SVG_NS='http://www.w3.org/2000/svg';let serial=0;
const decorationKey=item=>item.placement==='overlay'?item.id:item.placement;
export const VISUAL_ASSET_CSS=`
@layer novastore-visual-assets{[data-visual-asset-active="svg"],[data-visual-asset-active="image"]{width:var(--nova-asset-size)!important;height:var(--nova-asset-size)!important}}
[data-visual-asset-active="element"]{font-size:0!important}
[data-visual-asset-active="element"]>:not([data-visual-generated]),[data-visual-asset-active="svg"]>:not([data-visual-generated]){display:none!important}
[data-visual-generated="asset"]{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;font-size:16px;line-height:1;flex:none}
span[data-visual-generated="asset"]{width:var(--nova-asset-size);height:var(--nova-asset-size)}
[data-visual-generated="asset"]>svg,[data-visual-generated="asset"]>img{width:100%;height:100%;object-fit:contain;display:block}
[data-visual-decoration-for]{display:inline-flex!important;flex:none!important;align-items:center;justify-content:center;vertical-align:middle;line-height:1;position:relative;box-sizing:border-box;pointer-events:none!important}
[data-visual-editing="true"] [data-visual-decoration-for]{pointer-events:auto!important;cursor:crosshair!important}
[data-visual-editing="true"] [data-visual-decoration-id]{cursor:grab!important;touch-action:none}
[data-visual-decoration-for]>svg,[data-visual-decoration-for]>img{display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
[data-visual-image-vector="true"]{opacity:0!important}
[data-visual-image-proxy]{position:absolute!important;pointer-events:none!important;display:block!important;z-index:1;overflow:visible}
[data-visual-image-proxy]>svg{width:100%;height:100%;display:block;overflow:visible}
`;

function motion(element,animation){
  if(animation&&animation.name!=='none'){
    if(element.dataset.visualAnimation!==animation.name)element.dataset.visualAnimation=animation.name;
    element.style.setProperty('--nova-motion-duration',`${animation.duration}s`);
  }else{delete element.dataset.visualAnimation;element.style.removeProperty('--nova-motion-duration');}
}
function rememberAttribute(element,state,name){if(!state.attributes.has(name))state.attributes.set(name,element.getAttribute(name));}
function restoreAsset(element,state){
  state.imageProxy?.remove();state.imageProxy=null;state.imageProxySignature='';element.removeAttribute('data-visual-image-vector');
  state.assetNode?.remove();state.assetNode=null;state.assetSignature='';
  for(const[name,value]of state.attributes){if(value===null)element.removeAttribute(name);else element.setAttribute(name,value);}
  state.attributes.clear();element.removeAttribute('data-visual-asset-active');element.style.removeProperty('--nova-asset-size');
}
function syncAsset(element,state,visual){
  if(!visual){if(state.assetSignature)restoreAsset(element,state);return;}
  const signature=JSON.stringify(visual);
  if(state.assetSignature===signature&&(element.tagName.toLowerCase()==='img'||state.assetNode?.parentElement===element)){
    if(element.tagName.toLowerCase()==='img'&&element.getAttribute('src')!==state.assetURL)element.setAttribute('src',state.assetURL);
    return;
  }
  if(state.assetSignature)restoreAsset(element,state);
  const doc=element.ownerDocument,tag=element.tagName.toLowerCase();
  if(tag==='img'){
    for(const key of ['src','srcset','alt'])rememberAttribute(element,state,key);
    state.assetURL=visualAssets.assetDataURL(visual.asset);element.src=state.assetURL;element.removeAttribute('srcset');
    if(visual.asset.kind==='image')element.alt=visual.asset.alt||'';
    element.dataset.visualAssetActive='image';
  }else if(tag==='svg'){
    rememberAttribute(element,state,'viewBox');
    element.setAttribute('viewBox',visual.asset.kind==='svg'?visual.asset.viewBox:'0 0 24 24');
    const holder=doc.createElementNS(SVG_NS,'g');holder.dataset.visualGenerated='asset';
    if(visual.asset.kind==='image'){
      const image=doc.createElementNS(SVG_NS,'image');image.setAttribute('href',visual.asset.src);image.setAttribute('width','24');image.setAttribute('height','24');image.setAttribute('preserveAspectRatio','xMidYMid meet');holder.append(image);
    }else holder.append(createVisualAssetNode(doc,visual.asset));
    element.append(holder);state.assetNode=holder;element.dataset.visualAssetActive='svg';
  }else{
    const holder=doc.createElement('span');holder.dataset.visualGenerated='asset';holder.append(createVisualAssetNode(doc,visual.asset));
    element.append(holder);state.assetNode=holder;element.dataset.visualAssetActive='element';
  }
  element.style.setProperty('--nova-asset-size',`${visual.size}px`);
  if(tag==='svg'||tag==='img'){
    rememberAttribute(element,state,'width');rememberAttribute(element,state,'height');element.setAttribute('width',String(visual.size));element.setAttribute('height',String(visual.size));
  }
  state.assetSignature=signature;
}
function overlayContainer(element){let node=['svg','img','picture','input'].includes(element.tagName.toLowerCase())?element.parentElement:element;while(node?.namespaceURI===SVG_NS)node=node.parentElement;return node;}
function syncImageMotionProxy(element,state,entry,anchorPositions,activePositions){
  if(element.tagName.toLowerCase()!=='img'||entry.visual?.asset?.kind!=='svg'||entry.animation?.name!=='recommended'){
    state.imageProxy?.remove();state.imageProxy=null;state.imageProxySignature='';element.removeAttribute('data-visual-image-vector');return element;
  }
  const container=overlayContainer(element);if(!container)return element;activePositions.add(container);
  if(!anchorPositions.has(container)){const previous=container.style.position,changed=element.ownerDocument.defaultView.getComputedStyle(container).position==='static';anchorPositions.set(container,{previous,changed});if(changed)container.style.position='relative';}
  const signature=JSON.stringify(entry.visual.asset);
  if(!state.imageProxy||state.imageProxySignature!==signature){state.imageProxy?.remove();const proxy=element.ownerDocument.createElement('span');proxy.dataset.visualGenerated='asset';proxy.dataset.visualImageProxy=entry.id;proxy.setAttribute('aria-hidden','true');proxy.append(createVisualAssetNode(element.ownerDocument,entry.visual.asset));state.imageProxy=proxy;state.imageProxySignature=signature;}
  const proxy=state.imageProxy;if(proxy.parentElement!==container)container.append(proxy);
  const a=element.getBoundingClientRect(),b=container.getBoundingClientRect(),sx=container.clientWidth/b.width||1,sy=container.clientHeight/b.height||1;
  Object.assign(proxy.style,{left:`${(a.left-b.left)*sx-container.clientLeft}px`,top:`${(a.top-b.top)*sy-container.clientTop}px`,width:`${a.width*sx}px`,height:`${a.height*sy}px`});element.dataset.visualImageVector='true';
  return proxy.firstElementChild;
}
function locateOverlay(node,element,item,container){
  if(container===element){node.style.left=`calc(${item.x}% + ${item.offsetX}px)`;node.style.top=`calc(${item.y}% + ${item.offsetY}px)`;}
  else{const a=element.getBoundingClientRect(),b=container.getBoundingClientRect(),sx=container.clientWidth/b.width||1,sy=container.clientHeight/b.height||1;node.style.left=`${(a.left-b.left)*sx-container.clientLeft+a.width*sx*item.x/100+item.offsetX}px`;node.style.top=`${(a.top-b.top)*sy-container.clientTop+a.height*sy*item.y/100+item.offsetY}px`;}
}
function syncDecorations(element,state,id,decorations,anchorPositions,activePositions){
  const inside=id==='logo'||['text','title','copy'].includes(parseVisualElement(id)?.part);
  const placements=new Set(decorations.map(decorationKey));
  for(const[placement,row]of state.decorations)if(!placements.has(placement)){row.node.remove();state.decorations.delete(placement);}
  for(const decoration of decorations){
    const key=decorationKey(decoration);let row=state.decorations.get(key);const signature=JSON.stringify(decoration);
    if(!row){const node=element.ownerDocument.createElement('span');node.dataset.visualDecorationFor=id;node.dataset.visualGenerated='decoration';node.setAttribute('aria-hidden','true');row={node,signature:''};state.decorations.set(key,row);}
    const node=row.node;
    if(row.signature!==signature){
      node.replaceChildren(createVisualAssetNode(element.ownerDocument,decoration.asset));
      Object.assign(node.style,{width:`${decoration.size}px`,height:`${decoration.size}px`,marginInlineStart:decoration.placement==='after'?`${decoration.gap}px`:'0px',marginInlineEnd:decoration.placement==='before'?`${decoration.gap}px`:'0px',left:`${decoration.offsetX}px`,top:`${decoration.offsetY}px`,position:decoration.placement==='overlay'?'absolute':'relative',transform:decoration.placement==='overlay'?'translate(-50%,-50%)':'none',zIndex:decoration.placement==='overlay'?'2':'auto'});
      motion(node,decoration.animation);row.signature=signature;
    }
    if(decoration.placement==='overlay'){
      const container=overlayContainer(element);if(!container)continue;activePositions.add(container);
      if(!anchorPositions.has(container)){const previous=container.style.position,changed=element.ownerDocument.defaultView.getComputedStyle(container).position==='static';anchorPositions.set(container,{previous,changed});if(changed)container.style.position='relative';}
      node.dataset.visualDecorationId=decoration.id;node.__novaOverlayAnchor=element;node.__novaOverlayPosition={x:decoration.x,y:decoration.y};
      if(node.parentElement!==container)container.append(node);locateOverlay(node,element,decoration,container);
    }
    else if(inside){if(decoration.placement==='before'){if(element.firstChild!==node)element.prepend(node);}else if(element.lastChild!==node)element.append(node);}
    else if(decoration.placement==='before'){if(node.nextSibling!==element)element.before(node);}
    else if(node.previousSibling!==element)element.after(node);
  }
}
export function visualMotionRoute(root,channel){
  const doc=root.ownerDocument||root,location=doc.defaultView?.location;if(!location)return '#/home';
  if(channel==='android'){
    const app=doc.querySelector('[data-cal-id]'),params=new URLSearchParams(location.search),screen=app?.getAttribute('data-cal-id')||params.get('cal')||'CAL-01';
    if(screen==='CAL-06'){const product=doc.querySelector('[data-testid="product-detail-screen"]')?.getAttribute('data-product-id')||params.get('productId')||params.get('trialProduct')||'detail';return `#/urun/${encodeURIComponent(product)}`;}
    return `#/${screen}/${app?.getAttribute('data-view')||params.get('view')||'root'}`;
  }
  return location.hash||'#/home';
}
export function applyVisualEnhancements(root,design,channel='web'){
  let states=roots.get(root);if(!states){states=new Map();roots.set(root,states);}
  let anchorPositions=positions.get(root);if(!anchorPositions){anchorPositions=new Map();positions.set(root,anchorPositions);}const activePositions=new Set();
  const desired=new Map();
  for(const entry of design?.elements||[]){
    if(!entry.visual&&!entry.animation&&!entry.decorations?.length)continue;
    const selector=visualSelector(entry.id,channel);if(!selector)continue;
    for(const element of root.querySelectorAll(selector))if(!element.closest('[data-visual-generated]'))desired.set(element,entry);
  }
  for(const[element,state]of states){if(!desired.has(element)||!element.isConnected){restoreAsset(element,state);motion(element,null);for(const row of state.decorations.values())row.node.remove();states.delete(element);}}
  const motions=[],owners=[];
  for(const[element,entry]of desired){
    let state=states.get(element);if(!state){state={serial:++serial,attributes:new Map(),decorations:new Map(),assetNode:null,assetSignature:''};states.set(element,state);}
    syncAsset(element,state,entry.visual);motion(element,entry.animation);const motionElement=syncImageMotionProxy(element,state,entry,anchorPositions,activePositions);syncDecorations(element,state,entry.id,entry.decorations||[],anchorPositions,activePositions);
    const eventTarget=element.closest('button,a,[role="button"]')||element;
    if(entry.animation){const key=`visual-${state.serial}`;motions.push({key,element:motionElement,animation:entry.animation,eventTarget});owners.push({key,id:entry.id});}
    for(const decoration of entry.decorations||[]){if(!decoration.animation)continue;const key=`visual-${state.serial}-${decorationKey(decoration)}`;motions.push({key,element:state.decorations.get(decorationKey(decoration)).node,animation:decoration.animation,eventTarget});owners.push({key,id:entry.id,placement:decorationKey(decoration)});}
  }
  for(const[element,position]of anchorPositions)if(!activePositions.has(element)){if(position.changed&&element.style.position==='relative')element.style.position=position.previous;anchorPositions.delete(element);}
  const route=visualMotionRoute(root,channel);let controller=controllers.get(root);if(!controller){controller=visualAssets.createMotionController({document:root.ownerDocument||root,initialRoute:route});controllers.set(root,controller);}controller.sync(motions,route);motionOwners.set(root,owners);
}

export function previewVisualMotion(root,id,placement){const controller=controllers.get(root);for(const row of motionOwners.get(root)||[])if(row.id===id&&row.placement===placement)controller?.preview(row.key);}

export function clearVisualEnhancements(root){
  controllers.get(root)?.dispose();controllers.delete(root);motionOwners.delete(root);
  for(const[element,position]of positions.get(root)||[])if(position.changed&&element.style.position==='relative')element.style.position=position.previous;positions.delete(root);
  const states=roots.get(root);if(!states)return;
  for(const[element,state]of states){restoreAsset(element,state);motion(element,null);for(const row of state.decorations.values())row.node.remove();}
  roots.delete(root);
}
