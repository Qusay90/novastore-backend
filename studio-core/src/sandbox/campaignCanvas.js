import {assetURL} from '../studio-integration/context.js';
import {getCampaignShape} from './campaignShapes.js';
import {renderCampaignShape} from './campaignShapeRenderer.js';
/** Portable, presentation-only scene. No DOM, React, arbitrary CSS, script or navigation. */
export const CANVAS_LAYOUTS=[{id:'poster',label:'Ortalanmış afiş'},{id:'split',label:'İki parçalı vitrin'},{id:'collage',label:'Katmanlı kolaj'},{id:'ribbon',label:'Duyuru şeridi'},{id:'editorial',label:'Editoryal sayfa'},{id:'showcase',label:'Nesne vitrini'}];
export const MAX_CANVAS_LAYERS=24;
// Fixed, local font stacks. Imported scenes cannot supply CSS or font URLs.
export const CAMPAIGN_FONTS=Object.freeze([
 {id:'inherit',label:'Tema yazı tipi',family:'inherit',group:'Tema'},
 {id:'sans',label:'Arial · Sade',family:'Arial,sans-serif',group:'Sade ve modern'},
 {id:'serif',label:'Georgia · Klasik',family:'Georgia,serif',group:'Klasik ve editoryal'},
 {id:'modern',label:'Segoe UI · Modern',family:"'Segoe UI',sans-serif",group:'Sade ve modern'},
 {id:'rounded',label:'Trebuchet MS · Yumuşak',family:"'Trebuchet MS',sans-serif",group:'Sade ve modern'},
 {id:'humanist',label:'Verdana · Okunaklı',family:'Verdana,sans-serif',group:'Sade ve modern'},
 {id:'editorial',label:'Palatino · Editoryal',family:"'Palatino Linotype',Palatino,serif",group:'Klasik ve editoryal'},
 {id:'mono',label:'Courier New · Daktilo',family:"'Courier New',monospace",group:'Sabit aralıklı'},
 {id:'tahoma',label:'Tahoma',family:'Tahoma,Arial,sans-serif',group:'Sade ve modern'},
 {id:'calibri',label:'Calibri',family:'Calibri,Arial,sans-serif',group:'Sade ve modern'},
 {id:'candara',label:'Candara',family:'Candara,Arial,sans-serif',group:'Sade ve modern'},
 {id:'corbel',label:'Corbel',family:'Corbel,Arial,sans-serif',group:'Sade ve modern'},
 {id:'bahnschrift',label:'Bahnschrift',family:'Bahnschrift,Arial,sans-serif',group:'Sade ve modern'},
 {id:'century-gothic',label:'Century Gothic',family:"'Century Gothic',Arial,sans-serif",group:'Sade ve modern'},
 {id:'arial-narrow',label:'Arial Narrow',family:"'Arial Narrow',Arial,sans-serif",group:'Sade ve modern'},
 {id:'franklin-gothic',label:'Franklin Gothic',family:"'Franklin Gothic Medium',Arial,sans-serif",group:'Vurgulu başlıklar'},
 {id:'arial-black',label:'Arial Black',family:"'Arial Black',Arial,sans-serif",group:'Vurgulu başlıklar'},
 {id:'impact',label:'Impact',family:'Impact,Arial,sans-serif',group:'Vurgulu başlıklar'},
 {id:'cambria',label:'Cambria',family:'Cambria,Georgia,serif',group:'Klasik ve editoryal'},
 {id:'constantia',label:'Constantia',family:'Constantia,Georgia,serif',group:'Klasik ve editoryal'},
 {id:'times',label:'Times New Roman',family:"'Times New Roman',Georgia,serif",group:'Klasik ve editoryal'},
 {id:'garamond',label:'Garamond',family:'Garamond,Georgia,serif',group:'Klasik ve editoryal'},
 {id:'book-antiqua',label:'Book Antiqua',family:"'Book Antiqua',Georgia,serif",group:'Klasik ve editoryal'},
 {id:'rockwell',label:'Rockwell',family:'Rockwell,Georgia,serif',group:'Vurgulu başlıklar'},
 {id:'schoolbook',label:'Century Schoolbook',family:"'Century Schoolbook',Georgia,serif",group:'Klasik ve editoryal'},
 {id:'consolas',label:'Consolas',family:"Consolas,'Courier New',monospace",group:'Sabit aralıklı'},
 {id:'lucida-console',label:'Lucida Console',family:"'Lucida Console','Courier New',monospace",group:'Sabit aralıklı'},
 {id:'segoe-print',label:'Segoe Print',family:"'Segoe Print','Comic Sans MS',cursive",group:'El yazısı'},
 {id:'segoe-script',label:'Segoe Script',family:"'Segoe Script','Comic Sans MS',cursive",group:'El yazısı'},
 {id:'gabriola',label:'Gabriola',family:'Gabriola,Georgia,serif',group:'El yazısı'},
 {id:'comic',label:'Comic Sans MS',family:"'Comic Sans MS',cursive",group:'El yazısı'},
 {id:'ink-free',label:'Ink Free',family:"'Ink Free','Comic Sans MS',cursive",group:'El yazısı'}
]);
export const CAMPAIGN_TEXT_WEIGHTS=Object.freeze([
 {value:100,label:'Çok ince'},{value:200,label:'İnce'},{value:300,label:'Hafif'},
 {value:400,label:'Normal'},{value:500,label:'Orta'},{value:600,label:'Yarı kalın'},
 {value:700,label:'Kalın'},{value:800,label:'Çok kalın'},{value:900,label:'En kalın'}
]);
export const CAMPAIGN_TEXT_DEFAULTS=Object.freeze({fontSize:38,fontWeight:600,align:'left',font:'inherit'});
export const CAMPAIGN_TEXT_OPTIONAL=Object.freeze(['fontStyle','textDecoration','lineHeight','letterSpacing','verticalAlign','textTransform']);
export const campaignFontFamily=id=>CAMPAIGN_FONTS.find(font=>font.id===id)?.family||'inherit';
// Bounded pasteboard coordinates; publication always clips at the canvas edge.
export const CANVAS_GEOMETRY=Object.freeze({minPosition:-200,maxPosition:200,maxSize:200});
export function placeCampaignLayer(layer,placement){
 const {width:w,height:h}=layer;
 const positions={center:[(100-w)/2,(100-h)/2],left:[0,layer.y],right:[100-w,layer.y],top:[layer.x,0],bottom:[layer.x,100-h],
  'corner-tl':[-w/2,-h/2],'corner-tr':[100-w/2,-h/2],'corner-bl':[-w/2,100-h/2],'corner-br':[100-w/2,100-h/2]};
 if(!Object.hasOwn(positions,placement))throw Error('Yerleşim seçeneği bulunamadı.');
 const [x,y]=positions[placement];return {...layer,x,y};
}
const id=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/,colorPattern=/^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|@(accent|text|surface|background)|transparent)$/;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const keys=(value,allowed,label)=>{if(!value||Array.isArray(value)||typeof value!=='object')throw Error(`${label} nesne olmalı.`);for(const key of Object.keys(value))if(!allowed.includes(key))throw Error(`${label}: desteklenmeyen alan ${key}.`);};
const num=(value,fallback,min,max,label)=>{const v=value??fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`${label}: ${min}–${max} aralığı gerekli.`);return Math.round(v*100)/100;};
const str=(value,fallback,max,label)=>{const v=value??fallback;if(typeof v!=='string'||v.length>max)throw Error(`${label}: metin sınırı.`);return v;};
const choice=(value,fallback,values,label)=>{const v=value??fallback;if(!values.includes(v))throw Error(`${label}: desteklenmeyen seçenek.`);return v;};
function color(value,fallback){const v=value??fallback;if(typeof v!=='string'||!colorPattern.test(v))throw Error('Tuval rengi hex veya tema rengi olmalı.');return v;}
export function safeCanvasImage(src){
 if(typeof src==='string'&&/^(?:package:theme-assets\/[a-z0-9_-]+\/[a-z0-9_-]+\.(?:png|webp|jpg)|asset:[0-9a-f-]{36})$/i.test(src))return src;
 if(typeof src!=='string'||src.length>2_700_000)throw Error('Tuval görseli geçersiz.');
 if(/^\/media\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp)$/i.test(src)&&!src.includes('..')&&!src.includes('//'))return src;
 if(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)){const h=src.split(',')[1];if((src.startsWith('data:image/png;')&&h.startsWith('iVBORw0KGgo'))||(src.startsWith('data:image/jpeg;')&&h.startsWith('/9j/'))||(src.startsWith('data:image/webp;')&&h.startsWith('UklGR')))return src;}
 throw Error('Tuvalde yerel /media PNG/JPG/WebP veya yüklenmiş raster görsel kullan.');
}
export function normalizeCampaignCanvas(value){
 if(value===undefined)return undefined;
 keys(value,['version','layout','themeMode','background','aspectRatio','sourceTheme','layers'],'Tuval');if(value.version!==1)throw Error('Tuval sürümü desteklenmiyor.');
 if(!Array.isArray(value.layers)||value.layers.length>MAX_CANVAS_LAYERS)throw Error(`Tuval en fazla ${MAX_CANVAS_LAYERS} öğe alır.`);
 const seen=new Set(),layers=value.layers.map(layer=>{
  keys(layer,['id','kind','x','y','width','height','rotate','opacity','color','text','fontSize','fontWeight','align','font',...CAMPAIGN_TEXT_OPTIONAL,'iconId','asset','src','alt','fit','imageKind','shape','radius','strokeWidth','shapeId','fillMode','strokeColor','imageSrc','imageAlt','imageFit','iconColorMode','iconStrokeWidth'],'Tuval öğesi');
  if(typeof layer.id!=='string'||!id.test(layer.id)||seen.has(layer.id))throw Error('Tuval öğe kimlikleri tekil olmalı.');seen.add(layer.id);
  const out={id:layer.id,kind:choice(layer.kind,'text',['text','icon','image','shape'],'Öğe türü'),x:num(layer.x,0,CANVAS_GEOMETRY.minPosition,CANVAS_GEOMETRY.maxPosition,'X'),y:num(layer.y,0,CANVAS_GEOMETRY.minPosition,CANVAS_GEOMETRY.maxPosition,'Y'),width:num(layer.width,20,1,CANVAS_GEOMETRY.maxSize,'Genişlik'),height:num(layer.height,15,1,CANVAS_GEOMETRY.maxSize,'Yükseklik'),rotate:num(layer.rotate,0,-180,180,'Açı'),opacity:num(layer.opacity,1,0,1,'Saydamlık'),color:color(layer.color,'@text')};
  if(out.kind!=='icon'&&(layer.iconColorMode!==undefined||layer.iconStrokeWidth!==undefined))throw Error('Simge görünümü yalnız simge öğesine eklenebilir.');
  if(out.kind==='icon'){
   if(layer.iconColorMode!==undefined)out.iconColorMode=choice(layer.iconColorMode,'single',['single','original'],'Simge rengi');
   if(layer.iconStrokeWidth!==undefined)out.iconStrokeWidth=num(layer.iconStrokeWidth,1.8,.5,4,'Simge çizgi kalınlığı');
  }
  if(out.kind!=='text'&&CAMPAIGN_TEXT_OPTIONAL.some(key=>layer[key]!==undefined))throw Error('Yazı biçimi yalnız yazı öğesine eklenebilir.');
  if(out.kind==='text'){
   Object.assign(out,{text:str(layer.text,'Yeni yazı',1200,'Tuval yazısı'),fontSize:num(layer.fontSize,38,8,144,'Yazı boyutu'),fontWeight:choice(layer.fontWeight,600,CAMPAIGN_TEXT_WEIGHTS.map(w=>w.value),'Yazı kalınlığı'),align:choice(layer.align,'left',['left','center','right'],'Yazı hizası'),font:choice(layer.font,'inherit',CAMPAIGN_FONTS.map(f=>f.id),'Yazı tipi')});
   // Keep legacy documents byte-compatible; new options are stored only if edited.
   if(layer.fontStyle!==undefined)out.fontStyle=choice(layer.fontStyle,'normal',['normal','italic'],'İtalik');
   if(layer.textDecoration!==undefined)out.textDecoration=choice(layer.textDecoration,'none',['none','underline','line-through','underline line-through'],'Yazı çizgisi');
   if(layer.lineHeight!==undefined)out.lineHeight=num(layer.lineHeight,1.14,.8,2.5,'Satır aralığı');
   if(layer.letterSpacing!==undefined)out.letterSpacing=num(layer.letterSpacing,0,-.08,.5,'Harf aralığı');
   if(layer.verticalAlign!==undefined)out.verticalAlign=choice(layer.verticalAlign,'top',['top','middle','bottom'],'Dikey hizalama');
   if(layer.textTransform!==undefined)out.textTransform=choice(layer.textTransform,'none',['none','uppercase','lowercase'],'Harf biçimi');
  }
  if(out.kind==='icon'){if(layer.asset!==undefined){if(layer.iconId!==undefined)throw Error('Tuval simgesi tek kaynak taşımalı.');if(!globalThis.NovaStoreVisualAssets)throw Error('Vektör doğrulayıcısı yüklenmedi.');out.asset=globalThis.NovaStoreVisualAssets.normalizeAsset(layer.asset);if(out.asset.kind!=='svg')throw Error('Tuval motifi statik vektör olmalı.');}else{out.iconId=str(layer.iconId,'sparkles',100,'Simge');if(!id.test(out.iconId))throw Error('Simge kimliği geçersiz.');globalThis.NovaStoreVisualAssets?.icon(out.iconId);}}
  if(out.kind==='image'){const imageKind=choice(layer.imageKind,'object',['object','scene'],'Görsel türü');Object.assign(out,{src:safeCanvasImage(layer.src),alt:str(layer.alt,'',200,'Görsel açıklaması'),imageKind,fit:choice(layer.fit,imageKind==='scene'?'cover':'contain',['contain','cover'],'Görsel yerleşimi'),radius:num(layer.radius,0,0,50,'Görsel köşesi')});}
  const shapeFields=['shapeId','fillMode','strokeColor','imageSrc','imageAlt','imageFit'];
  if(out.kind!=='shape'&&shapeFields.some(field=>layer[field]!==undefined))throw Error('Şekil dolgusu alanları yalnız şekil öğesine eklenebilir.');
  if(out.kind==='shape'){
   Object.assign(out,{shape:choice(layer.shape,'rect',['rect','circle','line'],'Şekil'),radius:num(layer.radius,0,0,50,'Köşe'),strokeWidth:num(layer.strokeWidth,2,1,16,'Çizgi')});
   // Optional keys stay optional. Existing rect/circle/line documents keep
   // their exact normalized serialization instead of acquiring new defaults.
   if(layer.shapeId!==undefined)out.shapeId=getCampaignShape(layer.shapeId).id;
   if(layer.fillMode!==undefined)out.fillMode=choice(layer.fillMode,'solid',['solid','outline','image'],'Şekil dolgusu');
   if(layer.strokeColor!==undefined)out.strokeColor=color(layer.strokeColor,'@text');
   if(layer.imageSrc!==undefined)out.imageSrc=layer.imageSrc===''?'':safeCanvasImage(layer.imageSrc);
   if(layer.imageAlt!==undefined)out.imageAlt=str(layer.imageAlt,'',200,'Şekil görsel açıklaması');
   if(layer.imageFit!==undefined)out.imageFit=choice(layer.imageFit,'cover',['contain','cover'],'Şekil görsel yerleşimi');
   if(!out.shapeId&&out.shape==='line'&&(out.fillMode==='image'||out.imageSrc))throw Error('Çizgiye görsel doldurulamaz; kapalı bir hazır şekil seç.');
  }
  return out;
 });
 return {version:1,layout:choice(value.layout,'poster',CANVAS_LAYOUTS.map(v=>v.id),'Düzen'),themeMode:choice(value.themeMode,'inherit',['inherit','custom'],'Tema modu'),background:color(value.background,'@surface'),aspectRatio:num(value.aspectRatio,2.2,.5,4,'En boy oranı'),sourceTheme:str(value.sourceTheme,'',100,'Kaynak tema'),layers};
}
export function resolvedColor(value,theme={}){const fallback={accent:'#b45b29',text:'#203445',surface:'#f1eee7',background:'#ffffff'};if(!value.startsWith('@'))return value;const v=theme[value.slice(1)];return typeof v==='string'&&/^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/.test(v)?v:fallback[value.slice(1)];}
export function renderCampaignLayer(layer,{theme={},visualAssets=globalThis.NovaStoreVisualAssets}={}){
 const tint=resolvedColor(layer.color,theme),style=`position:absolute;box-sizing:border-box;left:${layer.x}%;top:${layer.y}%;width:${layer.width}%;height:${layer.height}%;transform:rotate(${layer.rotate}deg);opacity:${layer.opacity};color:${tint};overflow:hidden;pointer-events:none;`;
 let content='';
 if(layer.kind==='text'){
  const extra=`${layer.fontStyle!==undefined?`font-style:${layer.fontStyle};`:''}${layer.textDecoration!==undefined?`text-decoration:${layer.textDecoration};`:''}${layer.letterSpacing!==undefined?`letter-spacing:${layer.letterSpacing}em;`:''}${layer.textTransform!==undefined?`text-transform:${layer.textTransform};`:''}`;
  const vertical=layer.verticalAlign&&layer.verticalAlign!=='top',layout=vertical?`display:flex;flex-direction:column;justify-content:${layer.verticalAlign==='middle'?'safe center':'safe flex-end'};`:'';
  content=`<div${layer.textTransform!==undefined?' lang="tr"':''} style="width:100%;height:100%;white-space:pre-wrap;overflow-wrap:anywhere;font-size:${layer.fontSize/12}cqw;font-weight:${layer.fontWeight};line-height:${layer.lineHeight??1.14};text-align:${layer.align};font-family:${esc(campaignFontFamily(layer.font))};${extra}${layout}">${vertical?`<span style="display:block;width:100%;flex:none">${esc(layer.text)}</span>`:esc(layer.text)}</div>`;
 }
 if(layer.kind==='image')content=`<img draggable="false" src="${esc(assetURL(layer.src))}" alt="${esc(layer.alt)}" style="width:100%;height:100%;object-fit:${layer.fit};border-radius:${layer.radius}%;display:block"/>`;
 if(layer.kind==='shape'){
  const extended=['shapeId','fillMode','strokeColor','imageSrc','imageAlt','imageFit'].some(field=>layer[field]!==undefined);
  content=extended?renderCampaignShape({...layer,...(layer.imageSrc?{imageSrc:assetURL(layer.imageSrc)}:{})},{tint,stroke:resolvedColor(layer.strokeColor||layer.color,theme),escape:esc}):`<div style="width:100%;height:${layer.shape==='line'?`${layer.strokeWidth}px`:'100%'};background:${tint};border-radius:${layer.shape==='circle'?'50%':`${layer.radius}%`};${layer.shape==='line'?'position:absolute;top:50%;':''}"></div>`;
 }
 if(layer.kind==='icon'){
  if(!visualAssets)throw Error('Tuval simge kütüphanesi yüklenmedi.');
  const asset=layer.asset||visualAssets.icon(layer.iconId);if(!asset)throw Error('Tuval simgesi kütüphanede bulunamadı.');
  const vector=visualAssets.normalizeAsset(asset);
  // Tint a validated copy, retaining transparent cutouts and the stored source.
  const repaint=attrs=>{
   if(layer.iconColorMode==='single'){
    for(const key of ['fill','stroke','color'])if(attrs[key]&&!['none','transparent'].includes(attrs[key].toLowerCase()))attrs[key]='currentColor';
    delete attrs.color;
   }
   if(layer.iconStrokeWidth!==undefined&&attrs['stroke-width']!==undefined)attrs['stroke-width']=String(layer.iconStrokeWidth);
  };
  repaint(vector.attrs);
  if(layer.iconColorMode==='single'&&!vector.attrs.fill)vector.attrs.fill='currentColor';
  if(layer.iconStrokeWidth!==undefined)vector.attrs['stroke-width']=String(layer.iconStrokeWidth);
  const visit=node=>{repaint(node.attrs);node.children?.forEach(visit);};vector.nodes.forEach(visit);
  const markup=visualAssets.svgMarkup(vector);
  content=markup.replace('<svg ',`<svg style="width:100%;height:100%;display:block;color:${layer.iconColorMode==='single'?tint:vector.attrs.color||tint}" `);
 }
 return `<div data-campaign-layer="${esc(layer.id)}" data-layer-kind="${layer.kind}" style="${style}">${content}</div>`;
}
// Trusted presentation rules only; exported packages cannot provide CSS or scripts.
const novaVitrineMotion=`<style>
.nova-campaign-canvas.is-motion-enabled [data-campaign-layer="nova-season-stage"] img{animation:nova-vitrine-arrive 900ms cubic-bezier(.2,.65,.3,1) both}
@media(hover:hover) and (pointer:fine){.nova-campaign-canvas.is-motion-enabled:hover [data-campaign-layer="nova-season-stage"] img{animation:nova-vitrine-discover 950ms ease-out both}}
@keyframes nova-vitrine-arrive{from{transform:translateX(2%) scale(1.035);opacity:.65}to{transform:translateX(0) scale(1);opacity:1}}
@keyframes nova-vitrine-discover{from{transform:scale(1)}to{transform:scale(1.025)}}
@media(prefers-reduced-motion:reduce){.nova-campaign-canvas.is-motion-enabled [data-campaign-layer="nova-season-stage"] img{animation:none!important;transform:none!important}}
</style>`;
export function renderCampaignCanvas(value,options={}){
 const canvas=normalizeCampaignCanvas(value);if(!canvas)return '';
 const vitrine=canvas.layers.some(layer=>layer.id==='nova-season-stage'&&layer.kind==='image');
 const motion=vitrine&&options.motion!==false;
 return `<div class="nova-campaign-canvas${vitrine?' is-nova-store-vitrine':''}${motion?' is-motion-enabled':''}" data-campaign-layout="${canvas.layout}" style="position:relative;isolation:isolate;container-type:inline-size;width:100%;aspect-ratio:${canvas.aspectRatio};overflow:hidden;background:${resolvedColor(canvas.background,options.theme)};font-family:inherit;">${motion?novaVitrineMotion:''}${canvas.layers.map(layer=>renderCampaignLayer(layer,options)).join('')}</div>`;
}
