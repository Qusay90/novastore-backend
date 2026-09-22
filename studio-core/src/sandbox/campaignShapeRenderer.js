import {getCampaignShape} from './campaignShapes.js';

// One sequence per JS realm also handles two separately bundled copies of the
// renderer on the same page. Identical layer IDs in two previews must not make
// one preview resolve its mask from the other preview's DOM subtree.
const sequenceKey=Symbol.for('novastore.campaignShapes.clipSequence');
function nextClipId(){
 const sequence=globalThis[sequenceKey]||(globalThis[sequenceKey]={value:0});
 if(!Number.isSafeInteger(sequence.value)||sequence.value<0||sequence.value===Number.MAX_SAFE_INTEGER)throw Error('Şekil önizleme kimliği oluşturulamadı.');
 return `nova-campaign-mask-${++sequence.value}`;
}
function basicPath(layer){
 if(layer.shape==='circle')return 'M50 0 C77.614 0 100 22.386 100 50 C100 77.614 77.614 100 50 100 C22.386 100 0 77.614 0 50 C0 22.386 22.386 0 50 0 Z';
 const radius=layer.radius||0,right=100-radius;
 return `M${radius} 0 L${right} 0 Q100 0 100 ${radius} L100 ${right} Q100 100 ${right} 100 L${radius} 100 Q0 100 0 ${right} L0 ${radius} Q0 0 ${radius} 0 Z`;
}

/** Receives a normalized shape layer from the canvas renderer. Raster URLs,
 * colors, layout values and IDs have already passed the strict canvas schema.
 * The silhouette may stretch to the selected box; the photograph never does.
 */
export function renderCampaignShape(layer,{tint,stroke,escape}){
 const entry=layer.shapeId?getCampaignShape(layer.shapeId):null;
 if(!entry&&layer.shape==='line')return `<div style="position:absolute;top:50%;width:100%;height:${layer.strokeWidth}px;background:${stroke};"></div>`;
 const path=entry?.path||basicPath(layer),fillMode=layer.fillMode||'solid',fillRule=entry?.fillRule||'evenodd';
 const hasImage=fillMode==='image'&&!!layer.imageSrc,outline=fillMode==='outline'||(fillMode==='image'&&!hasImage);
 const strokeWidth=outline?layer.strokeWidth:layer.strokeColor?layer.strokeWidth:0;
 const escapedPath=escape(path),label=layer.imageAlt||entry?.label||'Şekil';
 let definitions='',image='';
 if(hasImage){
  const clipId=nextClipId();
  definitions=`<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;overflow:visible"><defs><clipPath id="${clipId}" clipPathUnits="objectBoundingBox"><path d="${escapedPath}" transform="scale(0.01)" fill-rule="${fillRule}" clip-rule="${fillRule}"/></clipPath></defs></svg>`;
  // An HTML image is fitted in its actual rectangular CSS box before the
  // normalized SVG silhouette clips it. Embedding <image> in a stretched
  // square SVG would squash a photograph on wide or tall canvas shapes.
  image=`<img data-campaign-shape-image draggable="false" src="${escape(layer.imageSrc)}" alt="${escape(layer.imageAlt||'')}" style="position:absolute;inset:0;width:100%;height:100%;display:block;object-fit:${layer.imageFit||'cover'};object-position:center;clip-path:url(#${clipId});-webkit-clip-path:url(#${clipId});"/>`;
 }
 const accessible=hasImage?'aria-hidden="true"':`role="img" aria-label="${escape(label)}"`;
 const fill=outline||hasImage?'none':tint;
 const silhouette=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none" ${accessible} focusable="false" style="position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible"><path d="${escapedPath}" fill-rule="${fillRule}" fill="${escape(fill)}" stroke="${escape(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
 return `<div data-campaign-shape="${escape(entry?.id||layer.shape)}" data-shape-fill-mode="${fillMode}" style="position:relative;width:100%;height:100%;">${definitions}${image}${silhouette}</div>`;
}
