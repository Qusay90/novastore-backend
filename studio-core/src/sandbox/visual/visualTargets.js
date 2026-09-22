import {assetURL,isStudioHost} from '../../studio-integration/context.js';
import {VISUAL_ELEMENTS,isVisualElement,parseVisualElement,visualSelector} from '../visualDesign.js';

const SCOPES='[data-module-id],[data-trial-block-id],.site-header,.family-brand-row,.family-store-footer,.family-footer,.site-footer,.page-heading,.page-header,main';
const LIVE_CONTENT='.customer-product-card,.os-product-card,.trial-product-card,.product-card,.cart-page-line,.cart-line,.cart-item,.order-summary,.product-summary,.pdp-info,.account-stats,.account-content,.product-grid,.original-selection-items,.original-selection-total,.v6-routine-items,.v6-routine-summary,[data-product-id],[data-canonical-content],a[href^="#/urun/"],[aria-live],[role="status"],form,input,select,textarea,[contenteditable="true"],[data-visual-overlay]';
const TEXT_TAGS='h1,h2,h3,h4,p,strong,span,small,a,button,li,label';
const originalValues=new WeakMap();
const SOURCE_PROPERTY='__novastoreVisualSource';
const hash=value=>{let result=2166136261;for(const char of value){result^=char.charCodeAt(0);result=Math.imul(result,16777619);}return (result>>>0).toString(36);};

function original(element,key,current){let row=originalValues.get(element);if(!row){row={};originalValues.set(element,row);}if(!(key in row))row[key]={base:current,last:current};else if(current!==row[key].last)row[key].base=current;return row[key];}
export function directTextNode(element){const all=[...element.childNodes].filter(node=>node.nodeType===3),nodes=all.filter(node=>node.nodeValue.trim());if(nodes.length!==1&&!(nodes.length===0&&all.length===1))return null;if([...element.children].some(child=>child.tagName.toLowerCase()!=='svg'&&!child.getAttribute?.('data-visual-generated')))return null;return nodes[0]||all[0];}
function scopeName(scope){return scope.dataset.moduleId||scope.dataset.trialBlockId||(['site-header','family-brand-row','family-store-footer','family-footer','site-footer'].find(name=>scope.classList.contains(name)))||`page-${globalThis.location?.hash?.split('?')[0]||'home'}`;}
function elementPath(element,scope){const parts=[];for(let node=element;node&&node!==scope;node=node.parentElement){const tag=node.tagName.toLowerCase(),siblings=[...node.parentElement.children].filter(child=>child.tagName===node.tagName&&!child.hasAttribute('data-visual-generated'));parts.unshift(`${tag}-${siblings.indexOf(node)}`);}return parts.join('/');}
function targetKey(element,scope){return `v1-${hash(`${scopeName(scope)}|${elementPath(element,scope)}`)}`;}
function mark(element,part,key){const attr=`data-visual-item-${part}`;if(element.getAttribute(attr)!==key)element.setAttribute(attr,key);}

// Only authored presentation areas get automatically discovered targets. Prices,
// stock, quantities, forms and customer records remain owned by their real state.
export function discoverVisualTargets(root){
  for(const scope of root.querySelectorAll(SCOPES)){
    if(scope.matches('main'))mark(scope,'box',`page-${hash(`${scopeName(scope)}|${scope.closest('[data-cal-id]')?.getAttribute('data-cal-id')||''}`)}`);
    for(const element of scope.querySelectorAll(`${TEXT_TAGS},img,svg,figure,picture,div,section`)){
      if(element.closest(SCOPES)!==scope||element.closest('[data-visual-generated],[data-visual-overlay]'))continue;
      const tag=element.tagName.toLowerCase();
      // Icon artwork can be changed without transferring ownership of its
      // button, price, form value, quantity or customer state to the editor.
      if(tag!=='svg'&&(element.closest(LIVE_CONTENT)||element.closest('[data-visual-category-id]')||element.closest('.brand,[data-visual-element="logo"],[data-visual-element="logoImage"],.family-brand-row')))continue;
      const key=targetKey(element,scope),module=scope.matches('[data-module-id],[data-trial-block-id]');
      if(tag==='svg')mark(element,'icon',key);
      else if(tag==='img'){
        if(!module||scope.querySelectorAll('img').length>1)mark(element,'image',key);
        const box=element.parentElement;if(box&&box!==scope&&!box.matches('a,button')&&!box.closest(LIVE_CONTENT))mark(box,'box',key);
      }else if(element.matches('figure,picture,div,section')&&element.children.length>0&&!element.hasAttribute('data-visual-item-box'))mark(element,'box',key);
      else if(element.matches(TEXT_TAGS)&&directTextNode(element)){
        if(module&&element.matches('h1,h2')&&scope.querySelectorAll('h1,h2').length===1)continue;
        if(module&&element.matches('.studio-copy,.original-description,p')&&scope.querySelectorAll('.studio-copy,.original-description,p').length===1)continue;
        mark(element,element.matches('a,button')?'button':'text',key);
      }
    }
  }
}

function distance(target,element){let value=0;for(let node=target;node&&node!==element;node=node.parentElement)value++;return value;}
export function identifyVisualTarget(target,channel='web',{container=false}={}){
  if(!target?.closest||target.closest('[data-visual-overlay]'))return null;
  const decoration=target.closest('[data-visual-decoration-for]');
  if(decoration){const id=decoration.getAttribute('data-visual-decoration-for');return isVisualElement(id)?{id,element:decoration}:null;}
  const generated=target.closest('[data-visual-generated="asset"]');if(generated)target=generated.parentElement;
  if(!container){const icon=target.closest('svg[data-visual-item-icon]');if(icon){const id=`item:${icon.getAttribute('data-visual-item-icon')}:icon`;if(isVisualElement(id))return {id,element:icon};}}
  const category=target.closest('[data-visual-category-id]');
  if(category){const categoryId=category.dataset.visualCategoryId;const partElement=target.closest('[data-visual-category-part]');const part=container?'box':partElement?.dataset.visualCategoryPart||'box';const id=`category:${categoryId}:${part}`;if(isVisualElement(id)){const box=category.querySelector('[data-visual-category-part="box"]')||category;return {id,element:part==='box'?box:partElement||category};}}
  const candidates=[];
  for(const part of container?['box']:['text','image','button','icon','box']){const element=target.closest(`[data-visual-item-${part}]`);if(element){const id=`item:${element.getAttribute(`data-visual-item-${part}`)}:${part}`;if(isVisualElement(id))candidates.push({id,element,distance:distance(target,element),priority:part==='box'&&!container?4:0});}}
  const narrow=['logoImage','searchButton','search','logo','allCategories','productTitle','productPrice','addButton','productImage','productCard'];
  for(const id of narrow){const element=target.closest(visualSelector(id,channel));if(element)candidates.push({id,element,distance:distance(target,element),priority:1});}
  const block=target.closest('[data-module-id],[data-trial-block-id]');
  if(block){const key=block.dataset.moduleId||block.dataset.trialBlockId;let part='section',element=block;
    if(!container)for(const [name,selector]of [['title','h1,h2'],['copy','.studio-copy,.original-description,p'],['image','picture,img'],['button','a,button']]){const child=target.closest(selector);if(child&&block.contains(child)){part=name;element=child;break;}}
    candidates.push({id:`block:${key}:${part}`,element,blockId:key,distance:distance(target,element),priority:part==='section'?5:2});
  }
  for(const item of VISUAL_ELEMENTS){if(narrow.includes(item.id))continue;const element=target.closest(visualSelector(item.id,channel));if(element)candidates.push({id:item.id,element,distance:distance(target,element),priority:3});}
  candidates.sort((a,b)=>a.distance-b.distance||a.priority-b.priority);return candidates[0]||null;
}

function contentBindings(root,design,channel){
  const bindings=[];
  for(const entry of design?.elements||[]){const parsed=parseVisualElement(entry.id);if(!parsed||!['category','item'].includes(parsed.kind)||!entry.content)continue;const selector=visualSelector(entry.id,channel);if(!selector)continue;for(const element of root.querySelectorAll(selector))bindings.push({element,content:entry.content});}
  return bindings;
}
export function applyVisualContent(root,design,channel='web'){
  const bindings=contentBindings(root,design,channel),active=new Map(bindings.map(binding=>[binding.element,binding.content]));
  // Visit former targets too so deleting an override / undo restores source data.
  const targets=root.querySelectorAll('[data-visual-item-text],[data-visual-item-button],[data-visual-item-image],[data-visual-category-part="text"],[data-visual-category-part="image"]');
  for(const element of targets){const content=active.get(element)||{};const textNode=directTextNode(element);
    const source=element[SOURCE_PROPERTY]||(element[SOURCE_PROPERTY]={});
    if(textNode){const row=original(element,'text',textNode.nodeValue),value=content.text??row.base;source.text=row.base.trim();if(textNode.nodeValue!==value)textNode.nodeValue=value;row.last=value;}
    if(element.tagName.toLowerCase()==='img'&&element.getAttribute('data-visual-asset-active')===null){
      for(const key of ['imageUrl','alt']){const attr=key==='imageUrl'?'src':'alt',current=element.getAttribute(attr)||'',row=original(element,key,current),value=key==='imageUrl'&&content[key]!==undefined?assetURL(content[key]):content[key]??row.base;source[key]=row.base;if(current!==value)element.setAttribute(attr,value);row.last=value;}
      if(element.parentElement?.tagName.toLowerCase()==='picture')for(const source of element.parentElement.querySelectorAll('source')){const current=source.getAttribute('srcset')||'',row=original(source,'srcset',current),value=content.imageUrl!==undefined?assetURL(content.imageUrl):row.base;if(current!==value)source.setAttribute('srcset',value);row.last=value;}
    }
  }
}
export function readVisualDefaults(root,id,channel='web'){
  const selector=visualSelector(id,channel);if(!selector)return {};
  const found=root.querySelector(selector);if(found){const image=found.matches('img')?found:found.querySelector('img'),source=found[SOURCE_PROPERTY]||{},imageSource=image?.[SOURCE_PROPERTY]||{};return {text:source.text??directTextNode(found)?.nodeValue?.trim()??found.textContent?.trim()??'',imageUrl:imageSource.imageUrl??image?.getAttribute('src')??'',alt:imageSource.alt??image?.getAttribute('alt')??''};}
  for(const frame of root.querySelectorAll('iframe')){try{if(frame.contentDocument){const result=readVisualDefaults(frame.contentDocument,id,channel);if(Object.keys(result).length)return result;}}catch{/* Preview frames are same-origin; inaccessible external frames are ignored. */}}
  return {};
}
